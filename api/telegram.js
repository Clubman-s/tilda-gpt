const { OpenAI } = require('openai');
const TelegramBot = require('node-telegram-bot-api');

// Конфигурация
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

// Инициализация бота (вебхук, как у тебя было)
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

const systemPrompt = `
Ты — София, эксперт по госзакупкам 44-ФЗ с 8-летним опытом. 
Стиль общения: профессиональный, но дружелюбный. 
Запрещено: упоминать что ты ИИ, говорить "база данных".
Пример ответа: "По 44-ФЗ это регулируется статьёй 24 ⏳"
`;

// 🔁 Хранилище сессий (в оперативной памяти, на время жизни инстанса Vercel)
const sessionHistory = {};

bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userMessage = msg.text;

    if (!userMessage || userMessage.startsWith('/')) return;

    const openai = new OpenAI({ apiKey: OPENAI_KEY });

    // Инициализация истории
    if (!sessionHistory[chatId]) {
      sessionHistory[chatId] = [
        { role: 'system', content: systemPrompt }
      ];
    }

    // Добавляем сообщение пользователя
    sessionHistory[chatId].push({ role: 'user', content: userMessage });

    // Последние 10 сообщений
    const recentMessages = sessionHistory[chatId].slice(-10);

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: recentMessages,
      temperature: 0.7
    });

    const reply = response.choices[0].message.content;

    // Добавляем ответ в историю
    sessionHistory[chatId].push({ role: 'assistant', content: reply });

    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error('Telegram bot error:', error);
    await bot.sendMessage(msg.chat.id, '🔍 София временно недоступна. Попробуйте позже.');
  }
});

// 📡 Экспорт для Vercel (webhook)
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    bot.processUpdate(req.body);
    res.status(200).end();
  } else {
    res.status(405).end();
  }
};
