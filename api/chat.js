const { OpenAI } = require('openai');

module.exports = async (req, res) => {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Проверяем API-ключ
    if (!process.env.OPENAI_KEY) {
      throw new Error('OPENAI_KEY не настроен');
    }

    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Пустое сообщение' });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_KEY
    });

    // Системный промпт Софии
    const systemPrompt = `
    Ты — София, эксперт по госзакупкам 44-ФЗ. Отвечай дружелюбно и профессионально.
    Запрещено: говорить что ты ИИ, упоминать "базу данных".
    Пример ответа: "По 44-ФЗ срок составляет 10 дней ⏳"
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    // Проверяем ответ OpenAI
    if (!response.choices?.[0]?.message?.content) {
      throw new Error('Пустой ответ от OpenAI');
    }

    const reply = response.choices[0].message.content;
    res.json({ reply });

  } catch (error) {
    console.error('Ошибка API:', error);
    
    // Детальный лог ошибки
    const errorDetails = {
      error: error.message,
      type: error.type || 'unknown',
      status: error.status || 500
    };

    // Для Tilda
    res.status(500).json({ 
      reply: '🔍 София временно недоступна. Пожалуйста, попробуйте позже.',
      details: process.env.NODE_ENV === 'development' ? errorDetails : null
    });
  }
};
