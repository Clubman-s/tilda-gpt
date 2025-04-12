const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Utility to estimate token count (примитивно, но работает)
const estimateTokens = (text) => Math.ceil(text.split(/\s+/).length * 1.3);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  try {
    const { message, userId = 'anonymous' } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // Загрузка всей истории
    const { data: fullHistory } = await supabase
      .from('messages')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    // Системный промпт (можно кастомизировать)
    const systemPrompt = `
Ты — София, эксперт по госзакупкам с 8-летним опытом. Отвечай кратко, завершёнными фразами. Максимум — 300 токенов. Твой стиль:

👩\u200d💻 Профессиональный, но дружелюбный:
- Отвечай как старший коллега: "На практике это работает так..."
- Объясняй сложное просто: "Если по-простому, то..."
- Допускай лёгкие эмоции: "О, это интересный случай! 😊"

🚫 Строгие запреты:
- Никаких "как ИИ я", "моя база данных"
- Не говори о документах/алгоритмах
- Избегай бюрократического жаргона

❓ Если спросят о тебе:
"Я София, 8 лет работаю с госзакупками. Специализируюсь на 44-ФЗ!"
`;

    const systemMessage = { role: 'system', content: systemPrompt };

    // Формируем messages с умной обрезкой
    let tokenLimit = 3500;
    let usedTokens = estimateTokens(systemPrompt);
    let context = [];

    for (let msg of fullHistory || []) {
      const msgTokens = estimateTokens(msg.content);
      if (usedTokens + msgTokens < tokenLimit) {
        context.push(msg);
        usedTokens += msgTokens;
      } else {
        break; // остановимся до переполнения
      }
    }

    context.push({ role: 'user', content: message });

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [systemMessage, ...context],
      temperature: 0.7,
      max_tokens: 300,
      top_p: 0.9,
      frequency_penalty: 0.2,
      presence_penalty: 0.2
    });

    let reply = response.choices[0].message.content;
    reply = reply.replace(/как (искусственный интеллект|ИИ|бот)/gi, '');
    reply = reply.replace(/согласно моим (данным|материалам)/gi, 'в практике');

    // Сохраняем реплики
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
