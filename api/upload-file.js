const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const mammoth = require('mammoth');
const { encoding_for_model } = require('@dqbd/tiktoken');
const pdf = require('pdf-parse');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Функция для рендеринга страниц PDF с сохранением структуры
async function renderPage(pageData) {
  const textContent = await pageData.getTextContent();
  let lastY, text = '';
  
  for (const item of textContent.items) {
    if (lastY === item.transform[5] || !lastY) {
      text += item.str + ' ';
    } else {
      text += '\n' + item.str + ' ';
    }
    lastY = item.transform[5];
  }
  return text;
}

// Функция для обработки PDF с учетом кодировки
async function parsePDF(filepath) {
  const dataBuffer = fs.readFileSync(filepath);
  const options = {
    pagerender: renderPage,
    max: 0 // Без ограничения длины
  };

  try {
    const data = await pdf(dataBuffer, options);
    let text = data.text
      .replace(/\s+/g, ' ')
      .replace(/(\d+,\d+)+/g, match => {
        // Обработка числовых последовательностей как символов Unicode
        const codes = match.split(',').map(Number);
        return Buffer.from(codes).toString('utf8');
      })
      .trim();

    return text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF');
  }
}

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
      console.error('❌ Form parsing error:', err);
      return res.status(500).json({ message: 'File parsing error' });
    }

    const file = files.file;
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filepath = file[0].filepath;
    const filename = file[0].originalFilename;
    const ext = path.extname(filename).toLowerCase();

    console.log(`📄 Processing file: ${filename}`);

    let text = '';
    try {
      if (ext === '.pdf') {
        text = await parsePDF(filepath);
      } else if (ext === '.docx') {
        const buffer = fs.readFileSync(filepath);
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else if (ext === '.txt') {
        text = fs.readFileSync(filepath, 'utf8');
      } else {
        return res.status(400).json({ message: 'Unsupported file type' });
      }

      console.log(`✅ Extracted text (${text.length} chars)`);

      // Обработка текста и создание чанков
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

      // Сохранение в Supabase
      const fileId = `file_${Date.now()}`;
      const savedChunks = [];

      for (const [index, chunk] of chunks.entries()) {
        try {
          const { data: embeddingData, error: embeddingError } = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: chunk.content,
          });

          if (embeddingError) throw embeddingError;

          const { error: supabaseError } = await supabase
            .from('chunks')
            .insert({
              file_id: fileId,
              filename: filename,
              content: chunk.content,
              embedding: embeddingData.data[0].embedding,
              token_count: chunk.token_count,
              chunk_number: index + 1
            });

          if (supabaseError) throw supabaseError;

          savedChunks.push({ success: true });
        } catch (error) {
          console.error(`❌ Error saving chunk ${index + 1}:`, error);
          savedChunks.push({ success: false, error: error.message });
        }
      }

      const successCount = savedChunks.filter(c => c.success).length;
      console.log(`💾 Saved ${successCount}/${chunks.length} chunks`);

      return res.status(200).json({
        success: true,
        filename: filename,
        total_chunks: chunks.length,
        saved_chunks: successCount,
        errors: savedChunks.filter(c => !c.success).length
      });

    } catch (error) {
      console.error('❌ Processing error:', error);
      return res.status(500).json({
        message: 'File processing failed',
        error: error.message
      });
    }
  });
};
