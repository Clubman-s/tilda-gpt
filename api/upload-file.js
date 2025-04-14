const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const mammoth = require('mammoth');
const { encoding_for_model } = require('@dqbd/tiktoken');
const pdf = require('pdf-parse'); // Используем pdf-parse вместо pdfjs-dist

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

module.exports.config = {
  api: { bodyParser: false }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' });
  }

  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('❌ Ошибка при разборе формы:', err);
      return res.status(500).json({ message: 'Ошибка парсинга файла' });
    }

    const file = files.file;
    if (!file) {
      console.error('⚠️ Файл не получен');
      return res.status(400).json({ message: 'Файл не найден' });
    }

    const filepath = file[0].filepath;
    const filename = file[0].originalFilename;
    const ext = path.extname(filename).toLowerCase();

    console.log('📎 Получен файл:', filename, ext);

    let text = '';

    try {
      if (ext === '.pdf') {
        // Используем pdf-parse вместо pdfjs-dist
        const dataBuffer = fs.readFileSync(filepath);
        const data = await pdf(dataBuffer);
        text = data.text;
      } else if (ext === '.docx') {
        const buffer = fs.readFileSync(filepath);
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else if (ext === '.txt') {
        text = fs.readFileSync(filepath, 'utf8');
      } else {
        console.error('❌ Неподдерживаемый формат:', ext);
        return res.status(400).json({ message: 'Формат не поддерживается' });
      }
    } catch (e) {
      console.error('❌ Ошибка при извлечении текста:', e);
      return res.status(500).json({ 
        message: 'Ошибка чтения файла', 
        error: e.message 
      });
    }

    console.log('📄 Извлечено символов:', text.length);

    try {
      const encoder = encoding_for_model('gpt-3.5-turbo');
      const tokens = encoder.encode(text);
      const chunkSize = 500;
      const chunks = [];

      for (let i = 0; i < tokens.length; i += chunkSize) {
        const chunkTokens = tokens.slice(i, i + chunkSize);
        const chunkText = encoder.decode(chunkTokens);
        chunks.push({
          content: chunkText,
          token_count: chunkTokens.length,
        });
      }

      const fileId = `upload_${Date.now()}`;
      const results = [];

      for (const chunk of chunks) {
        const clean = String(chunk.content).trim();
        if (!clean || clean.length < 10) {
          console.log('⚠️ Пропускаем пустой или короткий чанк');
          continue;
        }

        const preview = clean.slice(0, 80).replace(/\n/g, ' ');
        console.log('💾 Сохраняем чанк:', preview + '...');

        try {
          const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: clean,
          });

          const [{ embedding }] = embeddingRes.data;

          const { error } = await supabase.from('chunks').insert([
            {
              file_id: fileId,
              filename,
              source_url: null,
              content: clean,
              embedding,
              token_count: chunk.token_count,
            }
          ]);

          results.push({ 
            success: !error, 
            error: error?.message 
          });
        } catch (e) {
          console.error('❌ Ошибка создания эмбеддинга или вставки:', e);
          results.push({ 
            success: false, 
            error: e.message 
          });
        }
      }

      return res.status(200).json({
        message: `Загружено фрагментов: ${results.filter(r => r.success).length}`,
        total_chunks: chunks.length,
        errors: results.filter(r => r.error)
      });

    } catch (e) {
      console.error('❌ Критическая ошибка обработки:', e);
      return res.status(500).json({ 
        message: 'Ошибка обработки файла',
        error: e.message 
      });
    }
  });
};
