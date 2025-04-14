const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')
const axios = require('axios')
const pdfParse = require('pdf-parse')
const { encoding_for_model } = require('tiktoken')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
})

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' })
  }

  const { fileUrl } = req.body

  if (!fileUrl) {
    return res.status(400).json({ message: 'fileUrl is required' })
  }

  try {
    // 📥 Скачиваем файл
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' })
    const fileBuffer = response.data
    const filename = fileUrl.split('/').pop() || 'document.pdf'

    // 🧠 Получаем текст из PDF (пока только PDF)
    const parsed = await pdfParse(fileBuffer)
    const fullText = parsed.text

    // 🔪 Разбиваем текст на чанки
    const encoder = encoding_for_model('gpt-3.5-turbo')
    const tokens = encoder.encode(fullText)
    const chunkSize = 500
    const chunks = []

    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunkTokens = tokens.slice(i, i + chunkSize)
      const chunkText = encoder.decode(chunkTokens)
      chunks.push({
        content: chunkText,
        token_count: chunkTokens.length,
      })
    }

    const fileId = `doc_${Date.now()}`
    const results = []

    for (const chunk of chunks) {
      const embeddingRes = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: chunk.content,
      })

      const [{ embedding }] = embeddingRes.data

      const { error } = await supabase.from('chunks').insert([
        {
          file_id: fileId,
          filename,
          source_url: fileUrl,
          content: chunk.content,
          embedding,
          token_count: chunk.token_count,
        }
      ])

      results.push({ success: !error, error })
    }

    res.status(200).json({
      message: `Загружено фрагментов: ${results.length}`,
      errors: results.filter(r => r.error)
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Ошибка при загрузке документа', error: err.message })
  }
}
