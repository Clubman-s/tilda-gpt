import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { formidable } from 'formidable';
import pdf from 'pdf-parse';
import fs from 'fs/promises';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Инициализация OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Функция обработки файла
const processUpload = async (req, res) => {
  try {
    // 1. Проверка переменных окружения
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    // 2. Инициализация Supabase внутри обработчика
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    // 3. Парсинг формы
    const form = new formidable.IncomingForm();
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        err ? reject(err) : resolve([fields, files]);
      });
    });

    const file = files.file[0];
    const fileBuffer = await fs.readFile(file.filepath);

    // 4. Валидация файла
    const MAX_SIZE = 4 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      await fs.unlink(file.filepath);
      return res.status(413).json({ 
        error: 'File size exceeds 4MB limit' 
      });
    }

    // 5. Обработка имени файла
    const sanitizeFilename = (name) => 
      name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeName = sanitizeFilename(file.originalFilename);

    // 6. Загрузка в Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('documents')
      .upload(safeName, fileBuffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (storageError) throw storageError;

    // 7. Извлечение текста из PDF
    const pdfData = await pdf(fileBuffer);
    const text = pdfData.text.slice(0, 8000);

    // 8. Генерация эмбеддингов
    const embeddings = await openai.embeddings.create({
      input: text,
      model: "text-embedding-3-small"
    });

    // 9. Сохранение в базу данных
    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        file_name: safeName,
        original_name: file.originalFilename,
        storage_path: storageData.path,
        embeddings: embeddings.data[0].embedding,
        uploaded_at: new Date().toISOString()
      });

    if (dbError) throw dbError;

    // 10. Очистка
    await fs.unlink(file.filepath);
    
    return res.status(200).json({
      success: true,
      path: storageData.path
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: error.message,
      details: error.details || null
    });
  }
};

export default processUpload;
