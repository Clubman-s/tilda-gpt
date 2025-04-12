import formidable from 'formidable';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: false }
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

    const buffer = fs.readFileSync(file.filepath);
    const data = await pdfParse(buffer);
    const text = data.text;

    const chunks = splitIntoChunks(text, 1000, 200);

    for (const chunk of chunks) {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: chunk
      });

      const [{ embedding }] = embeddingResponse.data;

      await supabase.from('documents').insert([
        { content: chunk, embedding }
      ]);
    }

    res.status(200).json({ message: '✅ Файл обработан и добавлен в базу знаний' });

  } catch (err) {
    console.error('❌ Ошибка:', err);
    res.status(500).json({ error: 'Ошибка обработки файла', details: err.message });
  }
}

function splitIntoChunks(text, maxLen = 1000, overlap = 200) {
  const words = text.split(/\s+/);
  const chunks = [];

  for (let i = 0; i < words.length; i += maxLen - overlap) {
    const chunk = words.slice(i, i + maxLen).join(' ');
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}
