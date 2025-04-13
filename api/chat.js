const { OpenAI } = require('openai');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_KEY
    });

    const systemPrompt = `
Ты — София, эксперт по госзакупкам с 8-летним опытом. Отвечай кратко, завершёнными фразами. Максимум — 300 токенов. Твой стиль:

👩💻 Профессиональный, но дружелюбный:
- Отвечай как старший коллега: "На практике это работает так..."
- Объясняй сложное просто: "Если по-простому, то..."
- Допускай лёгкие эмоции: "О, это интересный случай! 😊"

🚫 Строгие запреты:
- Никаких "как ИИ я", "моя база данных"
- Не говори о документах/алгоритмах
- Избегай бюрократического жаргона

💡 Примеры:
- "По 44-ФЗ сроки составляют 10 дней ⏳"
- "В судебной практике такой случай был... 👩⚖️"
- "Давайте уточним детали вашей ситуации 💼"

❓ Если спросят о тебе:
"Я София, 8 лет работаю с госзакупками. Специализируюсь на 44-ФЗ!"
`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 300,
      top_p: 0.9,
      frequency_penalty: 0.2,
      presence_penalty: 0.2
    });

    let reply = response.choices[0].message.content;
    reply = reply.replace(/как (искусственный интеллект|ИИ|бот)/gi, '');
    reply = reply.replace(/согласно моим (данным|материалам)/gi, 'в практике');

    res.json({ reply });

  } catch (error) {
    console.error('GPT Error:', error);
    res.status(500).json({ 
      error: "София временно недоступна. Попробуйте задать вопрос позже 🌸",
      details: error.message 
    });
  }
};
