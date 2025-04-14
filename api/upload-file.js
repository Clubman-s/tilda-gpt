import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import formidable from 'formidable'

// 1. Инициализация Supabase с обработкой ошибок
let supabase
try {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false
      }
    }
  )
  console.log('Supabase initialized successfully')
} catch (err) {
  console.error('Supabase init failed:', err)
  process.exit(1)
}

export const config = {
  api: {
    bodyParser: false
  }
}

// 2. Упрощенный обработчик файлов
const processFile = async (file) => {
  const ext = path.extname(file.originalFilename).toLowerCase()
  const buffer = await fs.readFile(file.filepath)
  
  return {
    filename: file.originalFilename,
    extension: ext,
    content: buffer.toString('utf8', 0, 100000), // Первые 100КБ как текст
    raw_data: buffer.toString('base64'), // Полный файл в base64
    size: buffer.length
  }
}

// 3. Основной обработчик
export default async function handler(req, res) {
  console.log('Incoming request:', req.method)
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' })
  }

  const form = formidable({
    maxFileSize: 50 * 1024 * 1024,
    keepExtensions: true
  })

  try {
    // Парсинг формы
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Form parse error:', err)
          reject(err)
        } else {
          resolve([fields, files])
        }
      })
    })

    const file = files.file?.[0]
    if (!file) {
      console.log('No file in request')
      return res.status(400).json({ error: 'No file uploaded' })
    }

    console.log('Processing file:', file.originalFilename)
    
    // Обработка файла
    const fileData = await processFile(file)
    console.log('File processed:', {
      name: fileData.filename,
      size: fileData.size
    })

    // Попытка сохранения в Supabase
    let dbResult = null
    try {
      const { data, error } = await supabase
        .from('files')
        .insert([{
          filename: fileData.filename,
          extension: fileData.extension,
          content: fileData.content,
          raw_data: fileData.raw_data,
          size: fileData.size,
          uploaded_at: new Date()
        }])
        .select()
        .single()

      if (error) throw error
      dbResult = data
      console.log('Saved to Supabase, ID:', data.id)
    } catch (dbError) {
      console.error('Supabase save failed:', {
        message: dbError.message,
        code: dbError.code,
        details: dbError.details
      })
      
      // Fallback: сохраняем в локальный файл
      const backupPath = `/tmp/${Date.now()}_${fileData.filename}`
      await fs.writeFile(backupPath, fileData.raw_data, 'base64')
      console.log('Saved to backup file:', backupPath)
      
      dbResult = { backup_path: backupPath }
    }

    // Очистка
    await fs.unlink(file.filepath)
    
    return res.status(200).json({
      success: true,
      file_id: dbResult?.id || null,
      backup_path: dbResult?.backup_path || null,
      filename: fileData.filename
    })

  } catch (error) {
    console.error('Handler error:', {
      message: error.message,
      stack: error.stack
    })
    
    return res.status(500).json({
      error: 'Processing failed',
      stored_locally: !!error.backup_path,
      details: process.env.NODE_ENV === 'development' 
        ? error.message 
        : undefined
    })
  }
}
