// api/upload.js
import formidable from 'formidable';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const parseForm = (req) =>
  new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm({ keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { files } = await parseForm(req);
    const file = files.file;

    if (!file) return res.status(400).json({ error: 'Файл не получен' });

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

    await supabase.from('documents').insert([
      {
        content: text,
        embedding: null
      }
    ]);

    res.status(200).json({ message: `✅ Файл ${file.originalFilename} загружен. Текст сохранён в базу.` });
  } catch (err) {
    console.error('❌ Ошибка загрузки:', err);
    res.status(500).json({ error: 'Ошибка обработки файла', details: err.message });
  }
}
