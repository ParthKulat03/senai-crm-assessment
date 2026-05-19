import fs from 'fs';
import path from 'path';
import { query } from '../db.js';

function chunkText(text: string, chunkSize = 400, overlap = 50): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

const stopwords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','this','that','these','those','it','its','we','you','i','my','your','our','their','not','no','as','if','then','than','so','up','out','about','into','through','during','before','after','above','below','between','each','all','any','both','few','more','most','other','some','such','only','own','same','than','too','very','just','but','can','will','shall']);

export function extractKeywords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopwords.has(w));
}

function scoreChunk(chunkKeywords: string[], queryKeywords: string[]): number {
  if (!chunkKeywords || chunkKeywords.length === 0) return 0;
  const querySet = new Set(queryKeywords);
  const matches = chunkKeywords.filter(k => querySet.has(k)).length;
  return matches / Math.max(queryKeywords.length, 1);
}

export async function seedKnowledgeBase() {
  const existing = await query('SELECT COUNT(*) as count FROM knowledge_chunks');
  if (parseInt(existing.rows[0].count) > 0) {
    console.log('Knowledge base already seeded, skipping.');
    return;
  }
  const kbDir = path.join(process.cwd(), 'src', 'knowledge');
  const files = fs.readdirSync(kbDir).filter((f: string) => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(kbDir, file), 'utf8');
    const chunks = chunkText(content);
    for (let i = 0; i < chunks.length; i++) {
      const keywords = [...new Set(extractKeywords(chunks[i]))];
      await query(
        'INSERT INTO knowledge_chunks (source_doc, chunk_text, chunk_index, keywords) VALUES ($1, $2, $3, $4)',
        [file, chunks[i], i, keywords]
      );
    }
  }
  console.log(`Knowledge base seeded: ${files.length} documents.`);
}

export async function retrieveRelevantChunks(queryText: string, topK = 3) {
  const queryKeywords = extractKeywords(queryText);
  const result = await query('SELECT id, source_doc, chunk_text, keywords FROM knowledge_chunks');
  const scored = result.rows.map((row: { keywords: string[]; source_doc: string; chunk_text: string; id: string }) => ({
    ...row,
    score: scoreChunk(row.keywords, queryKeywords)
  }));
  scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
  return scored.slice(0, topK).filter((c: { score: number }) => c.score > 0);
}
