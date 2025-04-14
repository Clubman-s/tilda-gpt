const { OpenAI } = require('openai');
const { supabase } = require('../lib/supabase');
const { encoding_for_model } = require('tiktoken');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  try {
    const { message, session_id } = req.body;
    const sessionId = session_id || 'demo-session';
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

    await supabase.from('messages').insert([
      { session_id: sessionId, role: 'user', content: message }
    ]);

    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });

    // 🧠 Получаем эмбеддинг вопроса
    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: message,
    });
    const userEmbedding = embeddingRes.data[0].embedding;

    // 🔍 Semantic поиск в Supabase
    const { data: chunks, error: chunksError } = await supabase.rpc('match_chunks', {
      query_embedding: userEmbedding,
      match_threshold: 0.75,
      match_count: 5
    });

    if (chunksError) {
      console.error('❌ Ошибка поиска чанков:', chunksError);
    }

    // 📚 Составляем текст из чанков
    const contextText = (chunks || [])
      .map(chunk => chunk.content)
      .join('\n---\n')
      .slice(0, 2000); // ограничим по символам

    const systemPrompt = `
Ты — София, эксперт по госзакупкам с 8-летним опытом. Отвечай кратко, завершёнными фразами. Максимум — 300 токенов. Твой стиль:

👩💻 Профессиональный, но дружелюбный:
- Отвечай как старший коллега: "На практике это работает так..."
- Объясняй сложное просто: "Если по-простому, то..."
- Допускай лёгкие эмоции: "О, это интересный случай! 😊"

📚 Вот выдержки из загруженных документов, которые могут быть полезны:
${contextText}

🚫 Строгие запреты:
- Никаких "как ИИ я", "моя база данных"
- Не говори о документах/алгоритмах
- Избегай бюрократического жаргона

💡 Примеры ответов:
- "По 44-ФЗ сроки составляют 10 дней ⏳"
- "В судебной практике такой случай был... 👩⚖️"
- "Давайте уточним детали вашей ситуации 💼"

❓ Если спросят о тебе:
"Я София, 8 лет работаю с госзакупками. Специализируюсь на 44-ФЗ!"
`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || [])
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
      temperature: 0.7,
      max_tokens: 300,
      top_p: 0.9,
      frequency_penalty: 0.2,
      presence_penalty: 0.2
    });

    let reply = response.choices[0].message.content;
    reply = reply.replace(/как (искусственный интеллект|ИИ|бот)/gi, '');
    reply = reply.replace(/согласно моим (данным|материалам)/gi, 'в практике');

    await supabase.from('messages').insert([
      { session_id: sessionId, role: 'assistant', content: reply }
    ]);

    res.json({ reply });

  } catch (error) {
    console.error('❌ GPT Error:', error);
    res.status(500).json({
      error: "София временно недоступна. Попробуйте задать вопрос позже 🌸",
      details: error.message
    });
  }
};
