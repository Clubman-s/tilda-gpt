const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

// Инициализация клиентов (вынесено глобально)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Конфигурация Formidable
const form = formidable({
  maxFileSize: 50 * 1024 * 1024, // 50MB
  keepExtensions: true,
});

// Упрощённый парсер PDF (без OpenAI для теста)
async function parsePDF(filepath) {
  const data = await pdf(fs.readFileSync(filepath));
  return data.text.replace(/\s+/g, ' ').trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        err ? reject(err) : resolve([fields, files]);
      });
    });

    const file = files.file?.[0];
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(file.originalFilename).toLowerCase();
    let text = '';

    // Обработка файлов
    if (ext === '.pdf') {
      text = await parsePDF(file.filepath);
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ 
        buffer: fs.readFileSync(file.filepath) 
      });
      text = result.value;
    } else if (ext === '.txt') {
      text = fs.readFileSync(file.filepath, 'utf8');
    }

    // Быстрое сохранение в Supabase без векторизации
    const { error } = await supabase
      .from('files')
      .insert([{
        filename: file.originalFilename,
        content: text.substring(0, 10000), // Ограничение длины
        size: text.length
      }]);

    if (error) throw error;

    return res.status(200).json({ 
      success: true,
      chars: text.length 
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      error: 'Processing failed',
      details: error.message 
    });
  }
};
