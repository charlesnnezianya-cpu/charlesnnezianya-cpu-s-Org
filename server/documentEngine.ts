import crypto from 'crypto';

export interface DocumentChunk {
  documentId: string;
  userId: string;
  pageNumber: number | null;
  chunkPosition: number;
  originalText: string;
  keywords: string[];
}

export interface RetrievalResult {
  chunk: DocumentChunk;
  score: number;
  matchedKeywords: string[];
}

const STOP_WORDS = new Set([
  'the', 'and', 'to', 'a', 'of', 'in', 'is', 'that', 'for', 'it', 'with', 'as',
  'was', 'on', 'are', 'by', 'an', 'be', 'this', 'which', 'or', 'from', 'at',
  'it', 'its', 'they', 'their', 'we', 'you', 'your', 'has', 'have', 'had',
  'not', 'but', 'all', 'one', 'she', 'he', 'his', 'her', 'they', 'them', 'our',
  'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'do', 'does', 'did', 'done', 'doing', 'so', 'if', 'then', 'else', 'than',
  'too', 'very', 'just', 'about', 'into', 'over', 'after', 'before', 'between',
  'through', 'during', 'under', 'above', 'below', 'up', 'down', 'out', 'off',
  'over', 'again', 'further', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'than', 'too', 'very', 's', 't', 'can', 'will',
  'just', 'don', 'should', 'now', 'page', 'pdf', 'text', 'document', 'material'
]);

/**
 * Normalizes and cleans raw document text (removes control characters, standardizes line breaks, trims whitespace).
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Segments document text into distinct paragraphs separated by double newlines or structural line breaks.
 */
export function segmentParagraphs(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const rawParagraphs = normalized.split(/\n{2,}/);
  const result: string[] = [];
  for (const p of rawParagraphs) {
    const cleaned = p.replace(/\n/g, ' ').trim();
    if (cleaned.length > 0) {
      result.push(cleaned);
    }
  }
  return result;
}

/**
 * Extracts deterministic keywords from text using frequency and stop-word filtering.
 */
export function extractKeywords(text: string, maxKeywords = 8): string[] {
  const cleaned = normalizeText(text).toLowerCase();
  if (!cleaned) return [];

  // Match words of length >= 3 containing letters or numbers
  const words = cleaned.match(/\b[a-z0-9][a-z0-9'-]{2,}\b/g) || [];
  const freqMap = new Map<string, number>();

  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue; // skip pure numbers
    freqMap.set(w, (freqMap.get(w) || 0) + 1);
  }

  const sorted = Array.from(freqMap.entries()).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, maxKeywords).map(([word]) => word);
}

/**
 * Chunks document text with controlled character length and paragraph/sentence overlap.
 * Preserves page references if '[Page N]' markers are present in the text.
 */
export function chunkDocumentText(
  documentId: string,
  userId: string,
  extractedText: string,
  maxChunkChars = 1400,
  overlapChars = 200
): DocumentChunk[] {
  const normalized = normalizeText(extractedText);
  if (!normalized) return [];

  // Split by page marker if present, e.g. "[Page 1]"
  const pageSegments = normalized.split(/(?=\[Page\s+\d+\])/i);
  const chunks: DocumentChunk[] = [];
  let chunkPosition = 0;

  for (const seg of pageSegments) {
    const pageMatch = seg.match(/^\[Page\s+(\d+)\]/i);
    const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : null;
    const cleanSeg = pageMatch ? seg.replace(/^\[Page\s+\d+\]/i, '').trim() : seg.trim();

    if (!cleanSeg) continue;

    // Segment into paragraphs
    const paragraphs = segmentParagraphs(cleanSeg);
    let currentBuffer = '';

    const pushBuffer = (buf: string) => {
      const trimmed = buf.trim();
      if (trimmed.length >= 15) {
        chunks.push({
          documentId,
          userId,
          pageNumber,
          chunkPosition: chunkPosition++,
          originalText: trimmed,
          keywords: extractKeywords(trimmed, 8),
        });
      }
    };

    for (const para of paragraphs) {
      if (currentBuffer.length + para.length + 2 <= maxChunkChars) {
        currentBuffer = currentBuffer ? `${currentBuffer}\n\n${para}` : para;
      } else {
        if (currentBuffer) {
          pushBuffer(currentBuffer);
          // Retain overlap from tail of currentBuffer
          const tail = currentBuffer.slice(-overlapChars).trim();
          currentBuffer = tail ? `${tail}\n\n${para}` : para;
        } else {
          // Paragraph itself is larger than maxChunkChars -> split by overlap
          let start = 0;
          while (start < para.length) {
            const end = Math.min(start + maxChunkChars, para.length);
            const sub = para.slice(start, end).trim();
            pushBuffer(sub);
            if (end >= para.length) break;
            start = Math.max(0, end - overlapChars);
          }
          currentBuffer = '';
        }
      }
    }

    if (currentBuffer) {
      pushBuffer(currentBuffer);
    }
  }

  // Fallback if no chunks created but text exists
  if (chunks.length === 0 && normalized.length > 0) {
    chunks.push({
      documentId,
      userId,
      pageNumber: null,
      chunkPosition: 0,
      originalText: normalized.slice(0, maxChunkChars),
      keywords: extractKeywords(normalized, 8),
    });
  }

  return chunks;
}

/**
 * Keyword-based retrieval function using TF-IDF / overlap scoring.
 * Accepts a document ID, student question, and authorization userId,
 * returning the most relevant passages with source references.
 */
export function retrieveRelevantPassages(
  question: string,
  chunks: DocumentChunk[],
  authUserId: string,
  targetDocumentId?: string,
  topK = 3
): RetrievalResult[] {
  const cleanQ = normalizeText(question).toLowerCase();
  if (!cleanQ || chunks.length === 0) return [];

  const qKeywords = extractKeywords(cleanQ, 10);
  const qTerms = new Set(qKeywords);
  const qWords = cleanQ.match(/\b[a-z0-9][a-z0-9'-]{2,}\b/g) || [];
  for (const w of qWords) {
    if (!STOP_WORDS.has(w)) qTerms.add(w);
  }

  const results: RetrievalResult[] = [];

  for (const chunk of chunks) {
    // Enforce User/Document Authorization Isolation
    if (chunk.userId !== authUserId) continue;
    if (targetDocumentId && chunk.documentId !== targetDocumentId) continue;

    const chunkTextLower = chunk.originalText.toLowerCase();
    const matchedKeywords: string[] = [];
    let matchScore = 0;

    for (const term of qTerms) {
      if (chunk.keywords.includes(term)) {
        matchScore += 3.5;
        matchedKeywords.push(term);
      } else if (chunkTextLower.includes(term)) {
        matchScore += 1.0;
        matchedKeywords.push(term);
      }
    }

    // Exact phrase / substring bonus
    if (chunkTextLower.includes(cleanQ)) {
      matchScore += 5.0;
    }

    if (matchScore > 0) {
      results.push({
        chunk,
        score: matchScore,
        matchedKeywords: Array.from(new Set(matchedKeywords)),
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
