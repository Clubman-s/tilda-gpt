import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import * as pdfjs from 'pdfjs-dist/es5/build/pdf.js'
import mammoth from 'mammoth'

// Инициализация PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Чтение всего тела запроса
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    // Базовый парсинг multipart/form-data
    const contentType = req.headers['content-type']
    const boundary = contentType?.split('boundary=')[1]
    if (!boundary) {
      return res.status(400).json({ error: 'Invalid Content-Type header' })
    }

    const parts = buffer.toString().split(`--${boundary}`)
    const filePart = parts.find(part => part.includes('filename="'))
    if (!filePart) {
      return res.status(400).json({ error: 'No file found in request' })
    }

    // Извлечение метаданных файла
    const filenameMatch = filePart.match(/filename="([^"]+)"/)
    if (!filenameMatch) {
      return res.status(400).json({ error: 'Invalid filename format' })
    }
    const filename = filenameMatch[1]
    const ext = path.extname(filename).toLowerCase()

    // Проверка расширения
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      return res.status(400).json({ error: 'Unsupported file type' })
    }

    // Извлечение содержимого файла
    const contentStart = filePart.indexOf('\r\n\r\n') + 4
    const contentEnd = filePart.lastIndexOf('\r\n')
    const fileBuffer = Buffer.from(filePart.slice(contentStart, contentEnd))

    // Обработка содержимого
    let text = ''
    if (ext === '.pdf') {
      // Используем PDF.js для проблемных PDF
      const doc = await pdfjs.getDocument({ data: fileBuffer }).promise
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map(item => item.str).join(' ') + '\n'
      }
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer })
      text = result.value
    } else {
      text = fileBuffer.toString('utf8')
    }

    // Сохранение в Supabase
    const { data, error } = await supabase
      .from('files')
      .insert({
        filename,
        content: text.substring(0, 100000),
        size: text.length,
        status: 'processed'
      })
      .select()

    if (error) throw error

    return res.status(201).json({
      success: true,
      file_id: data[0].id,
      chars: text.length
    })

  } catch (error) {
    console.error('Processing error:', error)
    return res.status(500).json({
      error: 'File processing failed',
      details: error.message || 'Unknown error'
    })
  }
}
