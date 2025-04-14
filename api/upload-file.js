import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import formidable from 'formidable'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export const config = {
  api: {
    bodyParser: false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' })
  }

  // Настройка formidable для обработки файлов
  const form = formidable({
    maxFiles: 1,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    keepExtensions: true,
    filter: ({ mimetype }) => {
      return mimetype && (
        mimetype.includes('application/pdf') || 
        mimetype.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
        mimetype.includes('text/plain')
      )
    }
  })

  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        err ? reject(err) : resolve([fields, files])
      })
    })

    const file = files.file?.[0]
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const ext = path.extname(file.originalFilename).toLowerCase()
    let text = ''

    // Обработка разных форматов файлов
    switch (ext) {
      case '.pdf':
        try {
          const data = await pdfParse(await fs.readFile(file.filepath))
          text = data.text
        } catch (pdfError) {
          console.warn('PDF parsing error, using fallback:', pdfError)
          const raw = await fs.readFile(file.filepath, 'utf8')
          text = raw.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
        }
        break
        
      case '.docx':
        const result = await mammoth.extractRawText({ 
          buffer: await fs.readFile(file.filepath) 
        })
        text = result.value
        break
        
      case '.txt':
        text = await fs.readFile(file.filepath, 'utf8')
        break
        
      default:
        return res.status(400).json({ error: 'Unsupported file type' })
    }

    // Очистка текста
    text = text.replace(/\s+/g, ' ').trim()

    // Сохранение в Supabase
    const { data, error } = await supabase
      .from('files')
      .insert({
        filename: file.originalFilename,
        extension: ext,
        content: text.substring(0, 100000), // Лимит 100k символов
        size: text.length,
        uploaded_at: new Date().toISOString()
      })
      .select()

    if (error) throw error

    // Удаление временного файла
    await fs.unlink(file.filepath)

    return res.status(201).json({
      success: true,
      file_id: data[0].id,
      filename: file.originalFilename,
      chars: text.length
    })

  } catch (error) {
    console.error('Upload failed:', error)
    return res.status(500).json({
      error: 'File processing failed',
      details: error.message
    })
  }
}
