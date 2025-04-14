import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import formidable from 'formidable'

// Инициализация Supabase с увеличенным таймаутом
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    global: { timeout: 30000 }
  }
)

export const config = {
  api: {
    bodyParser: false
  }
}

// Улучшенный логгер
function logError(context, error) {
  const timestamp = new Date().toISOString()
  console.error(`[${timestamp}] ERROR in ${context}:`, {
    message: error.message,
    stack: error.stack,
    ...(error.response?.data && { apiResponse: error.response.data })
  })
}

export default async function handler(req, res) {
  console.log('Incoming request:', req.method, req.headers['content-type'])

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' })
  }

  const form = formidable({
    maxFiles: 1,
    maxFileSize: 50 * 1024 * 1024,
    keepExtensions: true,
    filename: (name, ext) => `${Date.now()}${ext}`
  })

  try {
    console.log('Starting file processing...')
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          logError('form.parse', err)
          reject(err)
        } else {
          console.log('Form parsed successfully')
          resolve([fields, files])
        }
      })
    })

    const file = files.file?.[0]
    if (!file) {
      console.log('No file found in request')
      return res.status(400).json({ error: 'No file uploaded' })
    }

    console.log('Processing file:', {
      name: file.originalFilename,
      path: file.filepath,
      size: file.size,
      type: file.mimetype
    })

    const ext = path.extname(file.originalFilename).toLowerCase()
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      console.log('Unsupported file extension:', ext)
      return res.status(400).json({ error: 'Unsupported file type' })
    }

    // Чтение файла
    const fileBuffer = await fs.readFile(file.filepath)
    console.log(`File read successfully (${fileBuffer.length} bytes)`)

    let text = ''
    try {
      if (ext === '.pdf') {
        console.log('Processing PDF file...')
        const data = await pdfParse(fileBuffer)
        text = data.text
      } else if (ext === '.docx') {
        console.log('Processing DOCX file...')
        const result = await mammoth.extractRawText({ buffer: fileBuffer })
        text = result.value
      } else {
        console.log('Processing text file...')
        text = fileBuffer.toString('utf8')
      }
    } catch (parseError) {
      logError('file parsing', parseError)
      throw new Error(`Failed to parse ${ext} file`)
    }

    text = text.replace(/\s+/g, ' ').trim()
    console.log(`Text extracted (${text.length} chars)`)

    // Подготовка данных для Supabase
    const fileData = {
      filename: file.originalFilename,
      extension: ext,
      content: text.substring(0, 100000),
      size: text.length,
      uploaded_at: new Date().toISOString()
    }

    console.log('Inserting to Supabase:', {
      filename: fileData.filename,
      size: fileData.size
    })

    const { data, error } = await supabase
      .from('files')
      .insert(fileData)
      .select()
      .single()

    if (error) {
      logError('Supabase insert', error)
      throw error
    }

    console.log('File saved to Supabase, ID:', data.id)

    // Очистка
    await fs.unlink(file.filepath)
    console.log('Temp file removed')

    return res.status(201).json({
      success: true,
      file_id: data.id,
      filename: file.originalFilename,
      size: text.length
    })

  } catch (error) {
    logError('upload handler', error)
    return res.status(500).json({
      error: 'File processing failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}
