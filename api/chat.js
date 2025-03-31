const { OpenAI } = require('openai');

module.exports = async (req, res) => {
  // Настройка CORS для Tilda
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  
  // Обработка OPTIONS-запроса
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Парсим входящие данные (из Telegram или Tilda)
    let inputMessage;
    if (req.headers['content-type'] === 'application/json') {
      inputMessage = req.body.message || req.body.text; // Для Tilda/Telegram
    } else {
      inputMessage = req.body; // Для прямых POST-запросов
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_KEY
    });

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "👋 Вы - София, эксперт по 44-ФЗ. Отвечаете дружелюбно и профессионально."
        },
        {
          role: "user",
          content: inputMessage
        }
      ],
      temperature: 0.7
    });

    const reply = response.choices[0].message.content;
    
    // Формат ответа для разных платформ
    if (req.body.platform === 'telegram') {
      res.json({ method: "sendMessage", chat_id: req.body.chat.id, text: reply });
    } else {
      res.json({ reply }); // Для Tilda
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      error: "София временно недоступна. Попробуйте позже.",
      details: error.message 
    });
  }
};
