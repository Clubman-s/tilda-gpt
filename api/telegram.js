const { OpenAI } = require('openai');
const TelegramBot = require('node-telegram-bot-api');

// Конфигурация
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

// Инициализация бота (вебхук или поллинг)
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Системный промпт Софии
const systemPrompt = `
Ты — София, эксперт по госзакупкам 44-ФЗ с 8-летним опытом. 
Стиль общения: профессиональный, но дружелюбный. 
Запрещено: упоминать что ты ИИ, говорить "база данных".
Пример ответа: "По 44-ФЗ это регулируется статьёй 24 ⏳"
`;

// Обработчик сообщений
bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userMessage = msg.text;

    // Пропускаем служебные сообщения
    if (!userMessage || userMessage.startsWith('/')) return;

    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7
    });

    await bot.sendMessage(chatId, response.choices[0].message.content);

  } catch (error) {
    console.error('Telegram bot error:', error);
    await bot.sendMessage(
      msg.chat.id, 
      '🔍 София временно недоступна. Попробуйте позже.'
    );
  }
});

// Экспорт для Vercel
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    bot.processUpdate(req.body);
    res.status(200).end();
  } else {
    res.status(405).end();
  }
};
