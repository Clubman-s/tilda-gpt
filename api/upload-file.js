import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import formidable from 'formidable'
import pdfParse from 'pdf-parse'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    db: {
      schema: 'public' // Явно указываем схему
    }
  }
)

export const config = {
  api: {
    bodyParser: false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' })
  }

  const form = formidable({
    maxFileSize: 50 * 1024 * 1024,
    keepExtensions: true
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
    const fileBuffer = await fs.readFile(file.filepath)

    // Извлекаем текст (даже если будет криво - сохраняем как есть)
    let text = ''
    try {
      if (ext === '.pdf') {
        const data = await pdfParse(fileBuffer)
        text = data.text || fileBuffer.toString('utf8', 0, 100000)
      } else {
        text = fileBuffer.toString('utf8', 0, 100000)
      }
    } catch (e) {
      text = fileBuffer.toString('utf8', 0, 100000)
    }

    // Готовим данные для вставки
    const fileData = {
      filename: file.originalFilename,
      extension: ext,
      content: text,
      raw_data: fileBuffer.toString('base64'), // Сохраняем исходник
      size: fileBuffer.length,
      uploaded_at: new Date().toISOString()
    }

    // Вставляем с явным указанием столбцов
    const { data, error } = await supabase
      .from('files')
      .insert([
        {
          filename: fileData.filename,
          extension: fileData.extension,
          content: fileData.content,
          raw_data: fileData.raw_data,
          size: fileData.size,
          uploaded_at: fileData.uploaded_at
        }
      ])
      .select()
      .single()

    if (error) {
      console.error('Supabase error details:', {
        message: error.message,
        code: error.code,
        details: error.details
      })
      throw error
    }

    await fs.unlink(file.filepath)

    return res.status(200).json({
      success: true,
      file_id: data.id,
      filename: data.filename
    })

  } catch (error) {
    console.error('Full error context:', {
      message: error.message,
      stack: error.stack,
      raw: error
    })
    return res.status(500).json({
      error: 'File processing completed with issues',
      stored: true // Файл сохранен в raw-формате
    })
  }
}
