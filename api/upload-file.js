import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export const config = {
  api: {
    bodyParser: false // Отключаем встроенный парсер
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' })
  }

  try {
    // Проверяем заголовки запроса
    if (!req.headers['content-type']?.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Content-Type must be multipart/form-data' })
    }

    // Читаем raw body для обработки в памяти
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    // Парсим вручную (упрощённая реализация formidable)
    const boundary = req.headers['content-type']?.split('boundary=')[1]
    if (!boundary) {
      return res.status(400).json({ error: 'Missing boundary in Content-Type' })
    }

    const parts = buffer.toString().split(`--${boundary}`)
    const filePart = parts.find(part => part.includes('filename="'))
    
    if (!filePart) {
      return res.status(400).json({ error: 'No file found in request' })
    }

    // Извлекаем метаданные файла
    const filenameMatch = filePart.match(/filename="([^"]+)"/)
    if (!filenameMatch) {
      return res.status(400).json({ error: 'Invalid file metadata' })
    }
    const filename = filenameMatch[1]
    const ext = path.extname(filename).toLowerCase()

    // Проверяем расширение
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      return res.status(400).json({ error: 'Unsupported file type' })
    }

    // Извлекаем содержимое файла
    const contentStart = filePart.indexOf('\r\n\r\n') + 4
    const contentEnd = filePart.lastIndexOf('\r\n')
    const fileContent = filePart.slice(contentStart, contentEnd)

    // Обрабатываем содержимое
    let text = ''
    if (ext === '.pdf') {
      const data = await pdfParse(Buffer.from(fileContent))
      text = data.text
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ 
        buffer: Buffer.from(fileContent) 
      })
      text = result.value
    } else {
      text = Buffer.from(fileContent).toString('utf8')
    }

    // Сохраняем в Supabase
    const { data, error } = await supabase
      .from('files')
      .insert({
        filename,
        content: text.substring(0, 100000),
        size: text.length
      })
      .select()

    if (error) throw error

    return res.status(201).json({
      success: true,
      file: data[0]
    })

  } catch (error) {
    console.error('Upload failed:', error)
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    })
  }
}
