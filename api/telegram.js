const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const API_URL = process.env.TG_PROXY_URL || 'https://tilda-gpt.vercel.app/api/chat';

const bot = new TelegramBot(TELEGRAM_TOKEN);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const message = req.body?.message;
  if (!message || !message.text || message.text.startsWith('/')) return res.status(200).end();

  const chatId = message.chat.id;
  const userText = message.text;

  try {
    const response = await axios.post(API_URL, {
      message: userText,
      userId: `tg-${chatId}`
    });

    const reply = response.data.reply || '❓ София не знает, как ответить';
    await bot.sendMessage(chatId, reply);
    res.status(200).end();
  } catch (err) {
    console.error('Ошибка в proxy Telegram:', err.message);
    await bot.sendMessage(chatId, '⚠️ София временно недоступна. Попробуйте позже.');
    res.status(200).end();
  }
};
