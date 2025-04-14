const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const mammoth = require('mammoth');
const { encoding_for_model } = require('@dqbd/tiktoken');
const pdf = require('pdf-parse');

// Инициализация клиентов
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Функция обработки PDF (исправленная)
async function parsePDF(filepath) {
  const dataBuffer = fs.readFileSync(filepath);
  const options = {
    normalizeWhitespace: true,
    disableCombineTextItems: false
  };

  const data = await pdf(dataBuffer, options);
  let text = data.text;

  // Преобразование числовых последовательностей в текст
  text = text.replace(/(\d+,\d+)+/g, match => {
    const codes = match.split(',').map(Number);
    const validCodes = codes.filter(code => code >= 32 && code <= 1114111);
    return Buffer.from(validCodes).toString('utf8');
  });

  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '')
    .trim();
}

module.exports.config = {
  api: { bodyParser: false }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Только POST-запросы' });
  }

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Ошибка загрузки файла:', err);
      return res.status(500).json({ error: 'Ошибка загрузки' });
    }

    const file = files.file?.[0];
    if (!file) {
      return res.status(400).json({ error: 'Файл не получен' });
    }

    try {
      // Определяем тип файла
      const ext = path.extname(file.originalFilename).toLowerCase();
      let text = '';

      // Обработка разных форматов
      if (ext === '.pdf') {
        text = await parsePDF(file.filepath);
      } else if (ext === '.docx') {
        const buffer = fs.readFileSync(file.filepath);
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else if (ext === '.txt') {
        text = fs.readFileSync(file.filepath, 'utf8');
      } else {
        return res.status(400).json({ error: 'Неподдерживаемый формат' });
      }

      // Разбиваем на чанки
      const encoder = encoding_for_model('gpt-3.5-turbo');
      const tokens = encoder.encode(text);
      const chunkSize = 500;
      const chunks = [];

      for (let i = 0; i < tokens.length; i += chunkSize) {
        const chunkTokens = tokens.slice(i, i + chunkSize);
        chunks.push({
          content: encoder.decode(chunkTokens),
          token_count: chunkTokens.length
        });
      }

      // Сохраняем в Supabase
      const fileId = `file_${Date.now()}`;
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const { data: embedding } = await openai.embeddings.create({
              model: 'text-embedding-ada-002',
              input: chunk.content,
            });

            const { error } = await supabase.from('chunks').insert({
              file_id: fileId,
              filename: file.originalFilename,
              content: chunk.content,
              embedding: embedding.data[0].embedding,
              token_count: chunk.token_count
            });

            return { success: !error, error };
          } catch (e) {
            return { success: false, error: e.message };
          }
        })
      );

      res.status(200).json({
        success: true,
        chunks: results.filter(r => r.success).length,
        errors: results.filter(r => r.error).length
      });

    } catch (error) {
      console.error('Ошибка обработки:', error);
      res.status(500).json({ 
        error: 'Ошибка обработки файла',
        details: error.message 
      });
    }
  });
};
