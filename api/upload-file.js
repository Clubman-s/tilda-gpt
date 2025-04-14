import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import formidable from 'formidable'

// Инициализация Supabase с таймаутом
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false },
    global: { timeout: 5000 } // 5 секунд на подключение
  }
)

export const config = {
  api: { bodyParser: false }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Только POST' })
  }

  // Тест подключения к Supabase
  try {
    const { data, error } = await supabase
      .from('files')
      .select('id')
      .limit(1)

    if (error) throw error
    console.log('Supabase подключен. Тестовая выборка:', data)
  } catch (err) {
    console.error('Ошибка Supabase:', {
      message: err.message,
      code: err.code,
      details: err.details
    })
    return res.status(500).json({
      error: 'Ошибка подключения к Supabase',
      details: err.message
    })
  }

  // Обработка файла (как в рабочей версии)
  const form = formidable({
    maxFileSize: 50 * 1024 * 1024,
    filename: () => `${Date.now()}.pdf`
  })

  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => err ? reject(err) : resolve([fields, files]))
    })

    const file = files.file?.[0]
    if (!file) return res.status(400).json({ error: 'Файл не загружен' })

    const savedPath = `/tmp/${file.newFilename}`
    await fs.rename(file.filepath, savedPath)

    return res.status(200).json({
      success: true,
      path: savedPath,
      filename: file.originalFilename
    })

  } catch (error) {
    console.error('Ошибка загрузки:', error.message)
    return res.status(500).json({
      error: 'Ошибка обработки файла',
      details: error.message
    })
  }
}
