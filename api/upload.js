import { supabase } from '../../lib/supabase'
import { OpenAI } from 'openai'
import { PDFLoader } from 'langchain/document_loaders/fs/pdf'
import { DocxLoader } from 'langchain/document_loaders/fs/docx'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'

const openai = new OpenAI(process.env.OPENAI_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const file = req.body.file
    if (!file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    // 1. Сохраняем файл в Storage (как у вас сейчас)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('user_files')
      .upload(`user_${Date.now()}_${file.name}`, file.buffer, {
        contentType: file.type
      })

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message })
    }

    // 2. Парсим текст в зависимости от типа файла
    let loader
    if (file.type === 'application/pdf') {
      loader = new PDFLoader(file.buffer)
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      loader = new DocxLoader(file.buffer)
    } else {
      loader = new TextLoader(file.buffer)
    }

    const docs = await loader.load()
    const text = docs.map(doc => doc.pageContent || doc.text).join('\n')

    // 3. Разбиваем текст на чанки
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50
    })
    const chunks = await splitter.splitText(text)

    // 4. Сохраняем чанки с эмбеддингами
    for (const chunk of chunks) {
      const embedding = await openai.embeddings.create({
        input: chunk,
        model: "text-embedding-ada-002",
      })

      const { error: chunkError } = await supabase
        .from('chunks')
        .insert({
          file_id: uploadData.path,
          filename: file.name,
          content: chunk,
          embedding: embedding.data[0].embedding,
          token_count: chunk.split(' ').length
        })

      if (chunkError) {
        console.error('Error saving chunk:', chunkError)
      }
    }

    return res.status(200).json({ 
      success: true,
      filePath: uploadData.path,
      chunksCount: chunks.length
    })

  } catch (error) {
    console.error('Upload error:', error)
    return res.status(500).json({ error: error.message })
  }
}
