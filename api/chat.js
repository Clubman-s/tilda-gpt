const { OpenAI } = require('openai');
const express = require('express');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

module.exports = app;

// Обработчик для Vercel
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const { message } = req.body;
      
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: message }],
      });

      res.json({ reply: response.choices[0].message.content });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Только POST-запросы!' });
  }
};
