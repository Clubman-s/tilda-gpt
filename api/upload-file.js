import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST method allowed' });
  }

  // Конфигурация formidable
  const form = formidable({
    maxFileSize: 50 * 1024 * 1024, // 50MB
    keepExtensions: true,
    multiples: false
  });

  try {
    // Парсим форму
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // Проверяем наличие файла
    if (!files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = files.file;
    const fileExt = path.extname(uploadedFile.originalFilename || '').toLowerCase();
    const validExtensions = ['.pdf', '.docx', '.txt'];

    // Валидация расширения
    if (!validExtensions.includes(fileExt)) {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Чтение файла
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    let text = '';

    // Обработка контента
    if (fileExt === '.pdf') {
      const data = await pdfParse(fileBuffer);
      text = data.text;
    } else if (fileExt === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      text = result.value;
    } else {
      text = fileBuffer.toString('utf8');
    }

    // Подготовка данных для Supabase
    const fileData = {
      filename: uploadedFile.originalFilename,
      extension: fileExt,
      content: text.substring(0, 100000), // Лимит 100k символов
      size: text.length,
      uploaded_at: new Date().toISOString()
    };

    // Вставка в Supabase
    const { data, error } = await supabase
      .from('files')
      .insert(fileData)
      .select(); // Важно: добавляем .select() для возврата данных

    if (error) throw error;

    // Удаляем временный файл
    fs.unlinkSync(uploadedFile.filepath);

    // Успешный ответ
    return res.status(201).json({
      success: true,
      file: {
        id: data[0].id,
        name: fileData.filename,
        size: fileData.size,
        uploaded_at: fileData.uploaded_at
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      error: 'File processing failed',
      details: error.message
    });
  }
}
