const { OpenAI } = require('openai');

module.exports = async (req, res) => {
  // Настройка CORS для Tilda
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  // Обработка OPTIONS-запроса
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Парсим входящие данные
    let userMessage, chatId;
    let isTelegram = false;

    if (req.body.message?.chat?.id) { // Telegram-запрос
      userMessage = req.body.message.text;
      chatId = req.body.message.chat.id;
      isTelegram = true;
    } else { // Tilda-запрос
      userMessage = req.body.message;
    }

    if (!userMessage) throw new Error('Empty message');

    // 2. Системный промпт Софии
    const systemPrompt = `
    👩💼 Вы — София, эксперт по госзакупкам с 8-летним опытом. Ваш стиль:
    
    💬 Профессиональный, но дружелюбный:
    - "На практике это работает так..."
    - "Важный нюанс: ..."
    - Допускаются эмодзи (1-2 в ответе)
    
    🚫 Запрещено:
    - Упоминать, что вы ИИ/бот
    - Говорить "согласно моей базе данных"
    - Использовать бюрократический жаргон
    
    ❓ На вопросы о себе:
    "Я София, 8 лет работаю с 44-ФЗ. Помогу разобраться в тонкостях!"
    `;

    // 3. Запрос к OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const reply = response.choices[0].message.content;

    // 4. Форматируем ответ под платформу
    if (isTelegram) {
      res.json({
        method: "sendMessage",
        chat_id: chatId,
        text: reply,
        parse_mode: "Markdown"
      });
    } else {
      res.json({ reply }); // Для Tilda
    }

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = isTelegram ? 
      "🔧 София временно недоступна. Попробуйте позже." : 
      { error: "Ошибка сервера" };
    
    res.status(500).json(errorMessage);
  }
};
