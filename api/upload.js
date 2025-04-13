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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const sanitizeFilename = (filename) => {
  return filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Parse form data
    const form = new formidable.IncomingForm();
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    const file = files.file[0];
    const fileBuffer = await fs.readFile(file.filepath);
    
    // 2. Validate file
    const MAX_SIZE = 4 * 1024 * 1024; // 4MB
    if (file.size > MAX_SIZE) {
      await fs.unlink(file.filepath);
      return res.status(413).json({ error: 'File size exceeds 4MB limit' });
    }

    // 3. Process filename
    const safeFilename = sanitizeFilename(file.originalFilename);

    // 4. Upload to Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('documents')
      .upload(safeFilename, fileBuffer, {
        contentType: file.mimetype,
        upsert: true,
        cacheControl: '3600'
      });

    if (storageError) {
      console.error('Storage Error:', storageError);
      await fs.unlink(file.filepath);
      return res.status(500).json({ 
        error: 'File upload failed',
        details: storageError.message 
      });
    }

    // 5. Extract PDF text
    let text;
    try {
      const pdfData = await pdf(fileBuffer);
      text = pdfData.text.slice(0, 8000); // Truncate for OpenAI limits
    } catch (parseError) {
      console.error('PDF Parse Error:', parseError);
      await fs.unlink(file.filepath);
      return res.status(400).json({ error: 'Invalid PDF file' });
    }

    // 6. Generate embeddings
    let embeddings;
    try {
      const response = await openai.embeddings.create({
        input: text,
        model: "text-embedding-3-small"
      });
      embeddings = response.data[0].embedding;
    } catch (aiError) {
      console.error('OpenAI Error:', aiError);
      await fs.unlink(file.filepath);
      return res.status(500).json({ error: 'AI processing failed' });
    }

    // 7. Save to database
    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        file_name: safeFilename,
        original_name: file.originalFilename,
        storage_path: storageData.path,
        embeddings: embeddings,
        uploaded_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('Database Error:', dbError);
      await fs.unlink(file.filepath);
      return res.status(500).json({ 
        error: 'Database insertion failed',
        details: dbError.message 
      });
    }

    // 8. Cleanup
    await fs.unlink(file.filepath);
    return res.status(200).json({ 
      success: true,
      filename: safeFilename,
      path: storageData.path
    });

  } catch (error) {
    console.error('Unhandled Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
