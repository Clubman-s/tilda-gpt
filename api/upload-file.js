import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// Инициализация Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export const config = {
  api: {
    bodyParser: false
  }
};

// Функция для обработки "битых" PDF
async function parsePDF(filepath) {
  try {
    // Основной метод через pdf-parse
    const data = await pdfParse(fs.readFileSync(filepath));
    return data.text;
  } catch (error) {
    console.warn('Standard PDF parsing failed, trying fallback...');
    // Fallback для поврежденных PDF
    const rawText = fs.readFileSync(filepath, 'utf8');
    return rawText.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Только POST-запросы' });
  }

  // Настройка formidable
  const form = formidable({
    maxFiles: 1,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    keepExtensions: true,
    filter: ({ mimetype }) => {
      return mimetype && (
        mimetype.includes('application/pdf') || 
        mimetype.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
        mimetype.includes('text/plain')
      );
    }
  });

  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        err ? reject(err) : resolve([fields, files]);
      });
    });

    const file = files.file?.[0];
    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const ext = path.extname(file.originalFilename).toLowerCase();
    let text = '';

    // Обработка файлов
    switch (ext) {
      case '.pdf':
        text = await parsePDF(file.filepath);
        break;
      case '.docx':
        const docxResult = await mammoth.extractRawText({ 
          buffer: fs.readFileSync(file.filepath) 
        });
        text = docxResult.value;
        break;
      case '.txt':
        text = fs.readFileSync(file.filepath, 'utf8');
        break;
      default:
        return res.status(400).json({ error: 'Неподдерживаемый формат файла' });
    }

    // Очистка текста
    text = text.replace(/\s+/g, ' ').trim();

    // Сохранение в Supabase
    const { data, error } = await supabase
      .from('files')
      .insert([{
        filename: file.originalFilename,
        extension: ext,
        content: text.substring(0, 100000), // Лимит 100k символов
        size: text.length,
        uploaded_at: new Date().toISOString()
      }])
      .select();

    if (error) throw error;

    // Удаление временного файла
    fs.unlinkSync(file.filepath);

    return res.status(201).json({
      success: true,
      file_id: data[0].id,
      filename: file.originalFilename,
      chars: text.length
    });

  } catch (error) {
    console.error('Ошибка загрузки:', error);
    return res.status(500).json({
      error: 'Ошибка обработки файла',
      details: error.message
    });
  }
}
