const { OpenAI } = require('openai');

module.exports = async (req, res) => {
  // Настройка CORS для работы с Tilda
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Ответ на предварительные OPTIONS-запросы
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Проверка метода запроса
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  try {
    // Проверка наличия тела запроса
    if (!req.body || !req.body.message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const { message } = req.body;

    // Инициализация OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_KEY
    });

    // Отправка запроса к GPT
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { 
          role: "system", 
          content: "Ты дружелюбный AI-ассистент. Отвечай кратко и по делу." 
        },
        { 
          role: "user", 
          content: message 
        }
      ],
      temperature: 0.7,
      max_tokens: 256
    });

    // Проверка ответа от OpenAI
    if (!completion.choices || !completion.choices[0].message) {
      throw new Error('Invalid response from OpenAI');
    }

    // Успешный ответ
    res.status(200).json({ 
      reply: completion.choices[0].message.content 
    });

  } catch (error) {
    console.error('API Error:', error);
    
    // Специальная обработка ошибок OpenAI
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: `OpenAI Error: ${error.response.statusText}` 
      });
    }

    // Общая ошибка сервера
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: error.message 
    });
  }
};
