import { OpenAI } from 'openai';
import TelegramBot from 'node-telegram-bot-api';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });

const systemPrompt = `
Ты — София, эксперт по госзакупкам 44-ФЗ с 8-летним опытом.
Стиль общения: профессиональный, но дружелюбный.
Нельзя говорить, что ты ИИ, использовать термин "база данных" или технические формулировки.
`;

const sessions = {};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const message = req.body?.message;
  if (!message || !message.text || message.text.startsWith('/')) {
    return res.status(200).end();
  }

  const chatId = message.chat.id;
  const userMessage = message.text;

  if (!sessions[chatId]) {
    sessions[chatId] = [{ role: 'system', content: systemPrompt }];
  }

  sessions[chatId].push({ role: 'user', content: userMessage });
  const recent = sessions[chatId].slice(-10); // Память на 10 сообщений

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: recent,
      temperature: 0.7
    });

    const reply = completion.choices[0].message.content;
    sessions[chatId].push({ role: 'assistant', content: reply });

    await bot.sendMessage(chatId, reply);
    res.status(200).end();
  } catch (err) {
    console.error('Telegram GPT error:', err.message);
    await bot.sendMessage(chatId, '⚠️ София временно недоступна. Попробуйте позже.');
    res.status(200).end();
  }
}
