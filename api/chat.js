import OpenAI from 'openai'
import { supabase } from '../lib/supabase.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const userMessage = req.body.message
  const sessionId = req.body.session_id || 'demo-session'

  if (!userMessage) {
    return res.status(400).json({ error: 'No message provided' })
  }

  // 💾 Сохраняем сообщение пользователя
  await supabase.from('messages').insert([
    {
      session_id: sessionId,
      role: 'user',
      content: userMessage,
    }
  ])

  // 📚 Загружаем историю
  const { data: history } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true })

  const messages = history.map((msg) => ({
    role: msg.role,
    content: msg.content
  }))

  // 🤖 GPT-ответ
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: messages,
    temperature: 0.7,
  })

  const assistantReply = completion.choices[0].message.content

  // 💾 Сохраняем ответ ассистента
  await supabase.from('messages').insert([
    {
      session_id: sessionId,
      role: 'assistant',
      content: assistantReply,
    }
  ])

  res.status(200).json({ reply: assistantReply })
}
