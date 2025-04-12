import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';
import pdfParse from 'pdf-parse';

export const config = {
  api: {
    bodyParser: false
  }
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const getEmbedding = async (text) => {
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text
  });
  return response.data[0].embedding;
};

const splitTextIntoChunks = (text, maxTokens = 1000, overlap = 200) => {
  const words = text.split(' ');
  const chunks = [];
  for (let i = 0; i < words.length; i += maxTokens - overlap) {
    const chunk = words.slice(i, i + maxTokens).join(' ');
    chunks.push(chunk);
  }
  return chunks;
};

const parseForm = (req) =>
  new Promise((resolve, reject) => {
    const form = formidable({ multiples: false });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve(files);
    });
  });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const files = await parseForm(req);
    const uploadedFile = files.file;

    if (!uploadedFile || !uploadedFile[0]?.filepath) {
      return res.status(400).json({ error: 'Файл не был получен' });
    }

    console.log('📥 Получен файл на сервере:', uploadedFile[0]);

    const buffer = fs.readFileSync(uploadedFile[0].filepath);
    const pdfData = await pdfParse(buffer);
    const chunks = splitTextIntoChunks(pdfData.text);

    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);

      const { error } = await supabase.from('documents').insert([
        {
          content: chunk,
          embedding: embedding
        }
      ]);

      if (error) {
        console.error('❌ Ошибка вставки в Supabase:', error);
      }
    }

    res.status(200).json({ message: `✅ Файл ${uploadedFile[0].originalFilename} загружен` });
  } catch (err) {
    console.error('❌ Ошибка обработки файла:', err);
    res.status(500).json({ error: 'Ошибка обработки файла' });
  }
}
