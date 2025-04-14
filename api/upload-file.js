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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Создаем экземпляр formidable с правильными опциями
    const form = formidable({
      maxFiles: 1,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      keepExtensions: true,
      filename: (name, ext) => `${Date.now()}${ext}`,
      filter: ({ mimetype }) => {
        return mimetype && mimetype.includes('application/');
      }
    });

    // Парсим форму
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // Проверяем наличие файла
    if (!files.file || files.file.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = files.file[0];
    const fileExt = path.extname(uploadedFile.originalFilename || '').toLowerCase();
    const validExtensions = ['.pdf', '.docx', '.txt'];

    // Проверяем расширение файла
    if (!validExtensions.includes(fileExt)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    let text = '';
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);

    // Обработка разных форматов
    if (fileExt === '.pdf') {
      const data = await pdfParse(fileBuffer);
      text = data.text;
    } else if (fileExt === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      text = result.value;
    } else if (fileExt === '.txt') {
      text = fileBuffer.toString('utf8');
    }

    // Сохраняем в Supabase
    const { error } = await supabase
      .from('files')
      .insert([{
        filename: uploadedFile.originalFilename,
        extension: fileExt,
        content: text.substring(0, 100000), // Лимит контента
        size: text.length,
        uploaded_at: new Date().toISOString()
      }]);

    if (error) throw error;

    // Удаляем временный файл
    fs.unlinkSync(uploadedFile.filepath);

    return res.status(200).json({
      success: true,
      filename: uploadedFile.originalFilename,
      chars: text.length
    });

  } catch (error) {
    console.error('Upload failed:', error);
    return res.status(500).json({
      error: 'File processing error',
      details: error.message
    });
  }
}
