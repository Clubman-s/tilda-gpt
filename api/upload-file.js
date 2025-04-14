import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import formidable from 'formidable'

// 1. Надежная инициализация Supabase
const supabase = (() => {
  try {
    return createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false },
        db: { schema: 'public' }
      }
    )
  } catch (err) {
    console.error('Supabase init error:', err)
    return null
  }
})()

// 2. Генератор имен для временных файлов
const generateSafeFilename = (name) => {
  return `${Date.now()}_${name.replace(/[^\w.-]/g, '_')}`
}

export const config = {
  api: {
    bodyParser: false
  }
}

export default async function handler(req, res) {
  console.log('Начало обработки запроса')

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Только POST-запросы' })
  }

  const form = formidable({
    maxFileSize: 50 * 1024 * 1024,
    keepExtensions: true,
    filename: (name, ext) => generateSafeFilename(name + ext)
  })

  try {
    // Парсинг формы
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Ошибка парсинга формы:', err)
          reject({ type: 'form_parse', error: err })
        } else {
          resolve([fields, files])
        }
      })
    })

    const file = files.file?.[0]
    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' })
    }

    console.log('Обработка файла:', file.originalFilename)

    // Чтение файла
    const fileBuffer = await fs.readFile(file.filepath)
    const fileExt = path.extname(file.originalFilename).toLowerCase()
    const textContent = fileBuffer.toString('utf8', 0, 100000) // Первые 100КБ как текст

    // Подготовка данных
    const fileData = {
      filename: file.originalFilename,
      extension: fileExt,
      content: textContent,
      raw_data: fileBuffer.toString('base64'),
      size: fileBuffer.length,
      uploaded_at: new Date().toISOString()
    }

    // Попытка сохранения в Supabase
    let dbResponse = null
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('files')
          .insert([fileData])
          .select()
          .single()

        if (error) throw error
        dbResponse = data
        console.log('Файл сохранен в Supabase, ID:', data.id)
      } catch (dbError) {
        console.error('Ошибка Supabase:', {
          message: dbError.message,
          code: dbError.code,
          details: dbError.details
        })
      }
    }

    // Резервное сохранение
    const backupPath = `/tmp/${generateSafeFilename(file.originalFilename)}`
    await fs.writeFile(backupPath, fileBuffer)
    console.log('Резервная копия сохранена:', backupPath)

    // Очистка
    await fs.unlink(file.filepath)

    return res.status(200).json({
      success: true,
      file_id: dbResponse?.id || null,
      backup_path: backupPath,
      filename: fileData.filename,
      warning: dbResponse ? null : 'Файл сохранен локально (Supabase недоступен)'
    })

  } catch (error) {
    console.error('Критическая ошибка:', {
      type: error.type || 'unknown',
      message: error.message || 'Неизвестная ошибка',
      stack: error.stack
    })

    return res.status(500).json({
      error: 'Ошибка обработки файла',
      stored_locally: !!error.backupPath,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}
