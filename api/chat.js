import { supabase } from '../lib/supabase'
import { Configuration, OpenAIApi } from 'openai'

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})

const openai = new OpenAIApi(configuration)

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

  // 📚 Загружаем историю сообщений
  const { data: history } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true })

  const messages = history.map((msg) => ({
    role: msg.role,
    content: msg.content
  }))

  // ✉️ Отправляем историю в GPT
  const completion = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: messages,
    temperature: 0.7,
  })

  const assistantReply = completion.data.choices[0].message.content

  // 💾 Сохраняем ответ ассистента
  await supabase.from('messages').insert([
    {
      session_id: sessionId,
      role: 'assistant',
      content: assistantReply,
    }
  ])

  // 📤 Отдаём ответ пользователю
  res.status(200).json({ reply: assistantReply })
}
