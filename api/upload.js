import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import formidable from 'formidable';
import pdf from 'pdf-parse';

export const config = {
  api: {
    bodyParser: false, // Отключаем стандартный парсер
  },
};

export default async function handler(req, res) {
  try {
    // 1. Парсим форму
    const form = new formidable.IncomingForm();
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    const file = files.file[0];
    const fileBuffer = await fs.promises.readFile(file.filepath);

    // 2. Инициализация клиентов
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // 3. Загрузка в Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('documents')
      .upload(file.originalFilename, fileBuffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (storageError) throw storageError;

    // 4. Извлечение текста из PDF
    const pdfData = await pdf(fileBuffer);
    const text = pdfData.text.slice(0, 8000); // Обрезаем для OpenAI

    // 5. Генерация эмбеддингов
    const embedding = await openai.embeddings.create({
      input: text,
      model: "text-embedding-3-small"
    });

    // 6. Сохранение в базу
    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        file_name: file.originalFilename,
        storage_path: storageData.path,
        embeddings: embedding.data[0].embedding,
        uploaded_at: new Date().toISOString()
      });

    if (dbError) throw dbError;

    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Vercel Error:', error);
    return res.status(500).json({
      error: error.message,
      details: error.details || null
    });
  }
}
