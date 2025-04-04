const { OpenAI } = require('openai');
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

const systemPrompt = `
Ты — София, эксперт по госзакупкам 44-ФЗ с 8-летним опытом. 
Стиль общения: профессиональный, но дружелюбный. 
Запрещено: упоминать что ты ИИ, говорить "база данных".
Пример ответа: "По 44-ФЗ это регулируется статьёй 24 ⏳"
`;

// Псевдо-память (в пределах одного запуска)
const sessions = {};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const body = req.body;
  const message = body.message;
  if (!message || !message.text || message.text.startsWith('/')) {
    res.status(200).end();
    return;
  }

  const chatId = message.chat.id;
  const userMessage = message.text;

  // Создаём или дополняем историю
  if (!sessions[chatId]) {
    sessions[chatId] = [
      { role: 'system', content: systemPrompt }
    ];
  }

  sessions[chatId].push({ role: 'user', content: userMessage });

  // Обрезаем до последних 10
  const history = sessions[chatId].slice(-10);

  const openai = new OpenAI({ apiKey: OPENAI_KEY });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: history,
      temperature: 0.7
    });

    const reply = response.choices[0].message.content;
    sessions[chatId].push({ role: 'assistant', content: reply });

    const bot = new TelegramBot(TELEGRAM_TOKEN);
    await bot.sendMessage(chatId, reply);
    res.status(200).end();

  } catch (err) {
    console.error('Ошибка обработки запроса:', err);
    const bot = new TelegramBot(TELEGRAM_TOKEN);
    await bot.sendMessage(chatId, '🛠 София временно недоступна. Попробуйте позже.');
    res.status(500).end();
  }
};
