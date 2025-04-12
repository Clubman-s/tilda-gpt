const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  try {
    const { message, userId = 'anonymous' } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // ---------- 1. Получение последних 5 сообщений для памяти ----------
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const memoryMessages = history?.reverse() || [];

    // ---------- 2. Векторный поиск по базе знаний ----------
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: message,
    });

    const [{ embedding }] = embeddingResponse.data;

    const { data: chunks } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.78,
      match_count: 3
    });

    const context = chunks?.map(c => c.content).join('\n\n') || '';

    // ---------- 3. Системный промпт + память + база ----------
    const systemPrompt = `
Ты — София, эксперт по госзакупкам с 8-летним опытом. Отвечай кратко, завершёнными фразами. Максимум — 300 токенов. Твой стиль:

👩💻 Профессиональный, но дружелюбный:
- Отвечай как старший коллега: "На практике это работает так..."
- Объясняй сложное просто: "Если по-простому, то..."
- Допускай лёгкие эмоции: "О, это интересный случай! 😊"

🚫 Запреты:
- Никаких "как ИИ я", "моя база данных"
- Не упоминай, что ищешь по документам
- Избегай бюрократического жаргона

📚 Полезный контекст из базы знаний (если есть):
${context}
    `;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...memoryMessages,
      { role: 'user', content: message },
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

    // ---------- 4. Сохраняем сообщение и ответ в память ----------
    await supabase.from('messages').insert([
      { user_id: userId, role: 'user', content: message },
      { user_id: userId, role: 'assistant', content: reply }
    ]);

    res.json({ reply });

  } catch (error) {
    console.error('GPT Error:', error);
    res.status(500).json({ 
      error: "София временно недоступна. Попробуйте позже 🌸",
      details: error.message 
    });
  }
};
