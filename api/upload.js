import formidable from 'formidable';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: false }
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Новый способ создания form
const parseForm = async (req) => {
  const form = formidable(); // Теперь это вызов функции, а не конструктора
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { files } = await parseForm(req);
    const file = files.file;

    console.log('📥 Получен файл:', file?.originalFilename || 'нет имени');
    if (!file || !file.originalFilename) {
      console.error("❌ Файл не был загружен или его имя отсутствует.");
      return res.status(400).json({ error: "Файл не был получен" });
    }

    const ext = file.originalFilename.split('.').pop().toLowerCase();
    let text = '';

    if (ext === 'pdf') {
      const buffer = fs.readFileSync(file.filepath);
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (ext === 'txt') {
      text = fs.readFileSync(file.filepath, 'utf-8');
    } else if (ext === 'docx') {
      const result = await mammoth.extractRawText({ path: file.filepath });
      text = result.value;
    } else {
      return res.status(400).json({ error: 'Неподдерживаемый формат файла' });
    }

    console.log('📝 Извлечён текст длиной:', text.length);

    const { error } = await supabase.from('documents').insert([
      {
        content: text,
        embedding: null
      }
    ]);

    if (error) {
      console.error('❌ Supabase ошибка:', error);
      return res.status(500).json({ error: 'Ошибка Supabase', details: error.message });
    }

    res.status(200).json({ message: `✅ Файл ${file.originalFilename} загружен` });
  } catch (err) {
    console.error('❌ Ошибка загрузки:', err);
    res.status(500).json({ error: 'Ошибка обработки файла', details: err.message });
  }
}
