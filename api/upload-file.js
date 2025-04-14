import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import formidable from 'formidable'

// 1. Проверка переменных окружения
console.log('Supabase URL:', process.env.SUPABASE_URL?.slice(0, 15) + '...') // Логируем часть URL

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://default.fallback.url',
  process.env.SUPABASE_ANON_KEY || 'fake-key',
  {
    auth: { persistSession: false }
  }
)

export const config = {
  api: {
    bodyParser: false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Только POST-запросы' })
  }

  const form = formidable({
    maxFileSize: 50 * 1024 * 1024,
    keepExtensions: true,
    filename: (name, ext) => `${Date.now()}${ext}` // Упрощенные имена
  })

  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        err ? reject({ type: 'FORM_PARSE', error: err }) : resolve([fields, files])
      })
    })

    const file = files.file?.[0]
    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' })
    }

    // Чтение файла
    const fileBuffer = await fs.readFile(file.filepath)
    const textContent = fileBuffer.toString('utf8', 0, 100000) // Первые 100КБ текста

    // Попытка сохранения в Supabase
    let dbId = null
    try {
      const { data, error } = await supabase
        .from('files')
        .insert([{
          filename: file.originalFilename,
          content: textContent,
          size: fileBuffer.length,
          uploaded_at: new Date().toISOString()
        }])
        .select('id')
        .single()

      if (error) throw error
      dbId = data.id
      console.log('Supabase ID:', dbId)
    } catch (dbError) {
      console.error('Supabase Error:', {
        message: dbError.message,
        code: dbError.code,
        details: dbError.details
      })
    }

    // Резервное сохранение
    const backupPath = `/tmp/${Date.now()}.pdf`
    await fs.writeFile(backupPath, fileBuffer)
    console.log('Backup Path:', backupPath)

    // Ответ
    return res.status(200).json({
      success: true,
      file_id: dbId,
      backup_path: backupPath,
      filename: file.originalFilename
    })

  } catch (error) {
    console.error('Fatal Error:', error.type || 'UNKNOWN', error.message)
    return res.status(500).json({
      error: 'Ошибка обработки',
      details: error.type === 'FORM_PARSE' ? 'Неверный формат файла' : 'Серверная ошибка'
    })
  }
}
