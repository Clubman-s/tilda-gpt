import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: false,
  },
};

import multer from 'multer';
import nextConnect from 'next-connect';
import fs from 'fs';

const upload = multer({ dest: '/tmp' });

const handler = nextConnect();

handler.use(upload.single('file'));

handler.post(async (req, res) => {
  try {
    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);

    const chunks = splitTextIntoChunks(pdfData.text, 1000, 200);

    for (const chunk of chunks) {
      const embedding = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: chunk,
      });

      const [{ embedding: vector }] = embedding.data;

      await supabase.from('documents').insert([
        { content: chunk, embedding: vector }
      ]);
    }

    res.status(200).json({ message: 'PDF загружен и обработан успешно ✅' });

  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки PDF', details: error.message });
  }
});

export default handler;

// Функция разбивки текста
function splitTextIntoChunks(text, maxLength, overlap) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLength, text.length);
    let chunk = text.slice(start, end).trim();
    chunks.push(chunk);
    start += maxLength - overlap;
  }
  return chunks;
}
