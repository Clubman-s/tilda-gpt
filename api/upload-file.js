import { promises as fs } from 'fs'
import path from 'path'
import formidable from 'formidable'

// Отключаем Supabase для теста
const USE_SUPABASE = false // Поставьте true после проверки

export const config = {
  api: {
    bodyParser: false
  }
}

export default async function handler(req, res) {
  console.log('Запрос получен')

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Только POST-запросы' })
  }

  const form = formidable({
    maxFileSize: 50 * 1024 * 1024,
    filename: () => `${Date.now()}.pdf` // Простые имена файлов
  })

  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        err ? reject({ type: 'FORM_ERROR', error: err }) : resolve([fields, files])
      })
    })

    const file = files.file?.[0]
    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' })
    }

    // Сохранение файла
    const savedPath = `/tmp/${file.newFilename}`
    await fs.rename(file.filepath, savedPath)

    console.log('Файл сохранен:', savedPath)
    
    return res.status(200).json({
      success: true,
      path: savedPath,
      filename: file.originalFilename
    })

  } catch (error) {
    console.error('Ошибка:', {
      type: error.type,
      message: error.message || 'Неизвестная ошибка'
    })
    
    return res.status(500).json({
      error: 'Ошибка загрузки',
      details: error.type === 'FORM_ERROR' ? 'Неправильный формат файла' : 'Ошибка сервера'
    })
  }
}
