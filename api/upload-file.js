const formidable = require('formidable')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')
const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const { encoding_for_model } = require('tiktoken')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY })

module.exports.config = {
  api: { bodyParser: false } // обязательно для formidable
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' })
  }

  const form = new formidable.IncomingForm()

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ message: 'Ошибка парсинга файла' })
    }

    const file = files.file
    if (!file) {
      return res.status(400).json({ message: 'Файл не найден' })
    }

    const filepath = file[0].filepath
    const filename = file[0].originalFilename
    const ext = path.extname(filename).toLowerCase()

    let text = ''

    try {
      if (ext === '.pdf') {
        const buffer = fs.readFileSync(filepath)
        const parsed = await pdfParse(buffer)
        text = parsed.text
      } else if (ext === '.docx') {
        const buffer = fs.readFileSync(filepath)
        const result = await mammoth.extractRawText({ buffer })
        text = result.value
      } else if (ext === '.txt') {
        text = fs.readFileSync(filepath, 'utf8')
      } else {
        return res.status(400).json({ message: 'Формат не поддерживается' })
      }
    } catch (e) {
      return res.status(500).json({ message: 'Ошибка чтения файла', error: e.message })
    }

    const encoder = encoding_for_model('gpt-3.5-turbo')
    const tokens = encoder.encode(text)
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

    const fileId = `upload_${Date.now()}`
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
          source_url: null,
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
  })
}
