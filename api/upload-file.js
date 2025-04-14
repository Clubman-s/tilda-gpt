import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Инициализация Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export const config = {
  api: {
    bodyParser: false // Отключаем встроенный парсер
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Создаем экземпляр formidable
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024, // 50MB лимит
      keepExtensions: true,
      multiples: false
    });

    // Парсим форму
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const file = files.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Получаем расширение файла
    const ext = path.extname(file.originalFilename).toLowerCase();
    let text = '';

    // Обработка разных форматов
    if (ext === '.pdf') {
      const data = await pdfParse(fs.readFileSync(file.filepath));
      text = data.text;
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ 
        buffer: fs.readFileSync(file.filepath) 
      });
      text = result.value;
    } else if (ext === '.txt') {
      text = fs.readFileSync(file.filepath, 'utf8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Сохраняем в Supabase
    const { error } = await supabase
      .from('files')
      .insert([{
        filename: file.originalFilename,
        content: text.substring(0, 10000), // Лимит контента
        size: text.length,
        created_at: new Date()
      }]);

    if (error) throw error;

    return res.status(200).json({ 
      success: true,
      chars: text.length 
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      error: 'File processing failed',
      details: error.message 
    });
  }
}
