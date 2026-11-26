import crypto from 'crypto';
import { formatScientificText } from '../src/lib/scientificFormatter.ts';
import type { FormulaVariableNote } from '../src/types/brainstine.ts';

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

export interface IndexedDocumentRecord {
  id: string;
  userId: string;
  title: string;
  type: string;
  extractedText: string;
}

export interface AnalyzedUnit {
  text: string;
  formattedText: string;
  pageNumber: number | null;
  sectionHeading: string | null;
  orderIndex: number;
  isBullet: boolean;
  isStep: boolean;
  score: number;
  tokens: Set<string>;
  quantitiesUnits: string[];
  fingerprint: string;
}

export interface ExtractedDefinition {
  term: string;
  definition: string;
  rawDefinition: string;
  origin: 'source';
  sectionHeading: string | null;
  pageNumber: number | null;
  salience: number;
  sourceText: string;
}

export interface ExtractedFormula {
  name: string;
  expressionOrStructure: string;
  usage: string;
  rawUsage: string;
  variables: FormulaVariableNote[];
  sectionHeading: string | null;
  pageNumber: number | null;
  salience: number;
  sourceText: string;
  isChemicalReaction: boolean;
}

export interface ExtractedProcessStep {
  stepNumber: number;
  text: string;
  rawText: string;
  pageNumber: number | null;
}

export interface ExtractedProcess {
  heading: string;
  sectionHeading: string | null;
  steps: ExtractedProcessStep[];
}

export interface ExtractedDistinction {
  pairTitle: string;
  subjectA: string | null;
  subjectB: string | null;
  comparison: string;
  rawComparison: string;
  sectionHeading: string | null;
  pageNumber: number | null;
  salience: number;
  sourceText: string;
}

export interface ExtractedCauseEffect {
  cause: string;
  effect: string;
  relationshipText: string;
  sectionHeading: string | null;
  pageNumber: number | null;
  salience: number;
}

export interface ExtractedClassification {
  category: string;
  members: string[];
  statement: string;
  sectionHeading: string | null;
  pageNumber: number | null;
  salience: number;
}

export interface ExtractedStructureFunction {
  entity: string;
  verb: string;
  roleOrFunction: string;
  statement: string;
  sectionHeading: string | null;
  pageNumber: number | null;
  salience: number;
}

export interface ExtractedExample {
  title: string;
  example: string;
  origin: 'source';
  sectionHeading: string | null;
  pageNumber: number | null;
  salience: number;
}

export interface DocumentSectionCluster {
  heading: string;
  pageNumbers: number[];
  units: AnalyzedUnit[];
  salience: number;
}

export interface ExtractedSectionRelationship {
  fromSection: string;
  toSection: string;
  sharedConcepts: string[];
  connectionNote: string;
}

export interface ExtractedDifficultConcept {
  concept: string;
  sourceContext: string;
  plainExplanation: string;
  pageNumber: number | null;
}

export interface ExtractionQualityMetrics {
  wordCount: number;
  alphaWordCount: number;
  sentenceCount: number;
  pageCount: number;
  hasStructuredHeadings: boolean;
  clarityScore: number;
  isBrief: boolean;
  lowClarity: boolean;
}

export interface DocumentIntelligenceProfile {
  contentHash: string;
  title: string;
  subjectArea: string;
  normalizedText: string;
  chunks: DocumentChunk[];
  units: AnalyzedUnit[];
  sections: DocumentSectionCluster[];
  sectionRelationships: ExtractedSectionRelationship[];
  difficultConcepts: ExtractedDifficultConcept[];
  definitions: ExtractedDefinition[];
  formulas: ExtractedFormula[];
  processes: ExtractedProcess[];
  distinctions: ExtractedDistinction[];
  causeEffects: ExtractedCauseEffect[];
  classifications: ExtractedClassification[];
  structureFunctions: ExtractedStructureFunction[];
  examples: ExtractedExample[];
  keyTerminology: string[];
  keyPhrases: string[];
  quality: ExtractionQualityMetrics;
  globalTermFreq: Map<string, number>;
}

const STOP_WORDS = new Set([
  'the', 'and', 'to', 'a', 'of', 'in', 'is', 'that', 'for', 'it', 'with', 'as',
  'was', 'on', 'are', 'by', 'an', 'be', 'this', 'which', 'or', 'from', 'at',
  'its', 'they', 'their', 'we', 'you', 'your', 'has', 'have', 'had',
  'not', 'but', 'all', 'one', 'she', 'he', 'his', 'her', 'them', 'our',
  'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'do', 'does', 'did', 'done', 'doing', 'so', 'if', 'then', 'else', 'than',
  'too', 'very', 'just', 'about', 'into', 'over', 'after', 'before', 'between',
  'through', 'during', 'under', 'above', 'below', 'up', 'down', 'out', 'off',
  'again', 'further', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'only', 'own', 'same', 's', 't', 'don', 'now', 'page', 'pdf', 'text', 'document', 'material',
]);

export const ACADEMIC_STOP_WORDS = new Set([
  ...STOP_WORDS,
  'onto', 'upon', 'while', 'what', 'whose', 'whom', 'these', 'those', 'having',
  'been', 'being', 'were', 'make', 'made', 'makes', 'also', 'many', 'every',
  'much', 'both', 'well', 'used', 'using', 'called', 'known', 'because',
  'however', 'therefore', 'moreover', 'furthermore', 'additionally', 'example',
  'study', 'notes', 'chapter', 'section', 'lecture', 'important', 'overview',
  'summary', 'introduction', 'conclusion', 'following',
]);

export const SUBJECT_LEXICONS: Array<{ subject: string; terms: string[]; peerTerms: string[] }> = [
  {
    subject: 'Chemistry',
    terms: [
      'molecule', 'molar', 'mole', 'stoichiometry', 'acid', 'base', 'ph',
      'equilibrium', 'enthalpy', 'entropy', 'gibbs', 'covalent', 'ionic',
      'oxidation', 'reduction', 'redox', 'catalyst', 'reactant', 'product',
      'titration', 'solution', 'solvent', 'solute', 'valency', 'orbital',
      'electronegativity', 'hydrocarbon', 'alkane', 'alkene', 'polymer',
      'isotope', 'atomic', 'periodic', 'compound', 'chemical', 'reaction',
    ],
    peerTerms: [
      'Covalent bond', 'Ionic lattice', 'Buffer solution', 'Activation energy',
      'Equilibrium constant', 'Endothermic reaction', 'Le Chatelier principle', 'Electronegativity',
    ],
  },
  {
    subject: 'Biology',
    terms: [
      'cell', 'cellular', 'mitochondria', 'chloroplast', 'photosynthesis',
      'respiration', 'glycolysis', 'atp', 'nadh', 'nadph', 'enzyme', 'protein',
      'dna', 'rna', 'transcription', 'translation', 'mitosis', 'meiosis',
      'chromosome', 'gene', 'allele', 'membrane', 'osmosis', 'diffusion',
      'homeostasis', 'neuron', 'synapse', 'organism', 'metabolism', 'tissue',
      'evolution', 'ecosystem', 'rubisco', 'calvin', 'glucose', 'pyruvate',
    ],
    peerTerms: [
      'Krebs cycle', 'Calvin cycle', 'Endoplasmic reticulum', 'Active transport',
      'Golgi apparatus', 'Oxidative phosphorylation', 'Enzyme catalysis', 'Ribosome',
    ],
  },
  {
    subject: 'Physics',
    terms: [
      'velocity', 'acceleration', 'momentum', 'impulse', 'force', 'newton',
      'kinetic', 'potential', 'energy', 'work', 'power', 'torque', 'gravity',
      'gravitational', 'friction', 'thermodynamics', 'wavelength', 'frequency',
      'amplitude', 'refraction', 'diffraction', 'voltage', 'current',
      'resistance', 'capacitance', 'magnetic', 'electric', 'induction',
      'quantum', 'photon', 'relativity', 'mass', 'scalar', 'vector', 'joule',
    ],
    peerTerms: [
      'Conservation of momentum', 'Gravitational potential energy', 'Electromagnetic induction',
      'Thermal equilibrium', 'Centripetal acceleration', 'Simple harmonic motion', 'Ohmic resistance',
    ],
  },
  {
    subject: 'Mathematics',
    terms: [
      'derivative', 'integral', 'calculus', 'matrix', 'eigenvalue', 'vector',
      'polynomial', 'quadratic', 'theorem', 'proof', 'probability', 'variance',
      'deviation', 'logarithm', 'trigonometry', 'sine', 'cosine', 'tangent',
      'asymptote', 'differential', 'equation', 'gradient', 'convergent',
      'limit', 'permutation', 'combination',
    ],
    peerTerms: [
      'Chain rule', 'Definite integral', 'Eigenvalue decomposition', 'Standard deviation',
      'Linear independence', 'Taylor expansion', 'Mean value theorem',
    ],
  },
  {
    subject: 'Computer Science',
    terms: [
      'algorithm', 'complexity', 'database', 'recursion', 'compiler', 'binary',
      'encryption', 'protocol', 'network', 'thread', 'concurrency', 'pointer',
      'array', 'hash', 'graph', 'tree', 'latency', 'throughput', 'api', 'http',
      'architecture', 'operating', 'memory', 'cache', 'software',
    ],
    peerTerms: [
      'Dynamic programming', 'Hash table', 'Binary search tree', 'Deadlock prevention',
      'Asymptotic complexity', 'Virtual memory', 'Breadth-first search',
    ],
  },
  {
    subject: 'Economics',
    terms: [
      'inflation', 'gdp', 'monetary', 'fiscal', 'elasticity', 'supply',
      'demand', 'equilibrium', 'marginal', 'utility', 'opportunity', 'tariff',
      'microeconomics', 'macroeconomics', 'recession', 'market', 'monopoly',
      'oligopoly', 'interest', 'investment',
    ],
    peerTerms: [
      'Price elasticity', 'Opportunity cost', 'Monetary policy', 'Aggregate demand',
      'Marginal utility', 'Market equilibrium', 'Fiscal multiplier',
    ],
  },
];

// ============================================================================
// SHARED BOUNDED CACHES & SUPABASE USER/MATERIAL RESOLUTION (FOR RAG SERVICES)
// ============================================================================

const MAX_CACHE_ENTRIES = 120;
const MAX_PROFILE_CACHE_ENTRIES = 60;
const tokenVerifyCache = new Map<string, { userId: string; expiresAt: number }>();
const materialsCache = new Map<string, { docs: IndexedDocumentRecord[]; expiresAt: number }>();
const chunkCache = new Map<string, DocumentChunk[]>();
const intelligenceProfileCache = new Map<string, DocumentIntelligenceProfile>();

export function setBoundedCacheEntry<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  maxEntries = MAX_CACHE_ENTRIES
) {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= maxEntries) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
}

export function getSupabaseServerConfig(): { url: string; anonKey: string } | null {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function extractBearerToken(authHeader?: string | string[]): string | null {
  if (!authHeader) return null;
  const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!headerStr) return null;
  const match = headerStr.trim().match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Verifies a Supabase user access token against Supabase Auth and returns the verified user ID.
 */
export async function resolveAuthorizedUserFromBearer(
  authHeader?: string | string[]
): Promise<{ userId: string; accessToken: string } | null> {
  const token = extractBearerToken(authHeader);
  if (!token) return null;

  const cfg = getSupabaseServerConfig();
  if (!cfg) return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const cached = tokenVerifyCache.get(tokenHash);
  if (cached && cached.expiresAt > Date.now()) {
    return { userId: cached.userId, accessToken: token };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    if (!data?.id || typeof data.id !== 'string') return null;

    setBoundedCacheEntry(tokenVerifyCache, tokenHash, {
      userId: data.id,
      expiresAt: Date.now() + 60_000,
    });
    return { userId: data.id, accessToken: token };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queries the student's study_materials from Supabase under their own RLS-scoped JWT.
 */
export async function fetchAuthorizedUserMaterials(
  accessToken: string,
  verifiedUserId: string,
  bypassCache = false
): Promise<IndexedDocumentRecord[]> {
  const cfg = getSupabaseServerConfig();
  if (!cfg) return [];

  const cached = !bypassCache ? materialsCache.get(verifiedUserId) : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.docs;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${cfg.url}/rest/v1/study_materials?select=id,user_id,title,material_type,extracted_text,created_at&user_id=eq.${encodeURIComponent(
      verifiedUserId
    )}&order=created_at.desc&limit=25`;

    const res = await fetch(url, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return [];

    const rows = (await res.json()) as Array<{
      id?: string;
      user_id?: string;
      title?: string;
      material_type?: string;
      extracted_text?: string;
    }>;
    if (!Array.isArray(rows)) return [];

    const docs: IndexedDocumentRecord[] = rows
      .filter(
        (r) =>
          typeof r?.id === 'string' &&
          r.user_id === verifiedUserId &&
          typeof r?.extracted_text === 'string' &&
          r.extracted_text.trim().length > 0
      )
      .map((r) => ({
        id: r.id as string,
        userId: verifiedUserId,
        title: (r.title || 'Uploaded Study Material').trim(),
        type: `Uploaded ${(r.material_type || 'document').toUpperCase()} Material`,
        extractedText: r.extracted_text as string,
      }));

    setBoundedCacheEntry(materialsCache, verifiedUserId, {
      docs,
      expiresAt: Date.now() + 45_000,
    });
    return docs;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function getOrBuildDocumentChunks(doc: IndexedDocumentRecord): DocumentChunk[] {
  const textHash = crypto
    .createHash('sha256')
    .update(doc.extractedText)
    .digest('hex')
    .slice(0, 16);
  const key = `${doc.userId}:${doc.id}:${textHash}`;
  const cached = chunkCache.get(key);
  if (cached) return cached;

  const built = chunkDocumentText(doc.id, doc.userId, doc.extractedText, 1200, 200);
  setBoundedCacheEntry(chunkCache, key, built);
  return built;
}

// ============================================================================
// BASELINE TEXT NORMALIZATION, SEGMENTATION, CHUNKING & BM25/TF-IDF RETRIEVAL
// ============================================================================

/**
 * Normalizes and cleans raw document text (removes control characters, standardizes line breaks, trims whitespace).
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00AD/g, '')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/([a-z]{2,})-\n([a-z]{2,})/g, '$1$2')
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

  const words = cleaned.match(/\b[a-z0-9][a-z0-9'-]{2,}\b/g) || [];
  const freqMap = new Map<string, number>();

  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
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

  const pageSegments = normalized.split(/(?=\[Page\s+\d+\])/i);
  const chunks: DocumentChunk[] = [];
  let chunkPosition = 0;

  for (const seg of pageSegments) {
    const pageMatch = seg.match(/^\[Page\s+(\d+)\]/i);
    const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : null;
    const cleanSeg = pageMatch ? seg.replace(/^\[Page\s+\d+\]/i, '').trim() : seg.trim();

    if (!cleanSeg) continue;

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
          const tail = currentBuffer.slice(-overlapChars).trim();
          currentBuffer = tail ? `${tail}\n\n${para}` : para;
        } else {
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

function lightStem(word: string): string {
  if (word.length <= 4) return word;
  return word
    .replace(/(?:ization|ation|ition|ement|ment|ness|ance|ence|able|ible|ally|ing|ied|ies|ed|es|s)$/i, '');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Enhanced BM25 / TF-IDF overlap passage retrieval with length normalization,
 * multi-word bigram/trigram phrase matching, formula/heading cues, and strict
 * per-user/per-document authorization isolation.
 */
export function retrieveRelevantPassages(
  question: string,
  chunks: DocumentChunk[],
  authUserId: string,
  targetDocumentId?: string,
  topK = 3
): RetrievalResult[] {
  const cleanQ = normalizeText(question).toLowerCase();
  if (!cleanQ || chunks.length === 0 || !authUserId) return [];

  const qKeywords = extractKeywords(cleanQ, 12);
  const qTermsSet = new Set(qKeywords);
  const qWords = cleanQ.match(/\b[a-z0-9][a-z0-9'-]{2,}\b/g) || [];
  const orderedQueryTerms: string[] = [];
  for (const w of qWords) {
    if (!STOP_WORDS.has(w)) {
      qTermsSet.add(w);
      orderedQueryTerms.push(w);
    }
  }

  const qTerms = Array.from(qTermsSet);
  if (qTerms.length === 0) return [];

  const eligibleChunks = chunks.filter(
    (chunk) =>
      chunk.userId === authUserId &&
      (!targetDocumentId || chunk.documentId === targetDocumentId)
  );
  if (eligibleChunks.length === 0) return [];

  const queryBigrams: string[] = [];
  for (let i = 0; i < orderedQueryTerms.length - 1; i++) {
    queryBigrams.push(`${orderedQueryTerms[i]} ${orderedQueryTerms[i + 1]}`);
  }

  const queryTrigrams: string[] = [];
  for (let i = 0; i < orderedQueryTerms.length - 2; i++) {
    queryTrigrams.push(
      `${orderedQueryTerms[i]} ${orderedQueryTerms[i + 1]} ${orderedQueryTerms[i + 2]}`
    );
  }

  const totalDocs = eligibleChunks.length;
  const termDf = new Map<string, number>();
  const lowerTexts = eligibleChunks.map((c) => c.originalText.toLowerCase());
  const docLengths = lowerTexts.map((t) => Math.max(1, t.split(/\s+/).length));
  const avgDocLen =
    docLengths.reduce((sum, len) => sum + len, 0) / Math.max(1, docLengths.length);

  for (const term of qTerms) {
    const stem = lightStem(term);
    let df = 0;
    for (let i = 0; i < eligibleChunks.length; i++) {
      const chunk = eligibleChunks[i];
      const textLower = lowerTexts[i];
      if (
        chunk.keywords.includes(term) ||
        textLower.includes(term) ||
        (stem.length >= 5 && textLower.includes(stem))
      ) {
        df++;
      }
    }
    termDf.set(term, df);
  }

  const k1 = 1.5;
  const b = 0.55;
  const results: RetrievalResult[] = [];

  for (let i = 0; i < eligibleChunks.length; i++) {
    const chunk = eligibleChunks[i];
    const chunkTextLower = lowerTexts[i];
    const dlNorm = 1 - b + b * (docLengths[i] / Math.max(1, avgDocLen));
    const matchedKeywords: string[] = [];
    let matchScore = 0;

    for (const term of qTerms) {
      const df = termDf.get(term) || 0;
      if (df === 0) continue;

      const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
      const wordRegex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g');
      const exactMatches = chunkTextLower.match(wordRegex);
      const tf = exactMatches ? exactMatches.length : 0;
      const bm25Tf = tf > 0 ? (tf * (k1 + 1)) / (tf + k1 * dlNorm) : 0;

      if (chunk.keywords.includes(term)) {
        const effectiveTf = tf > 0 ? bm25Tf : 1.0;
        matchScore += (2.5 + effectiveTf) * idf;
        matchedKeywords.push(term);
      } else if (tf > 0) {
        matchScore += 1.55 * bm25Tf * idf;
        matchedKeywords.push(term);
      } else {
        const stem = lightStem(term);
        if (stem.length >= 5 && chunkTextLower.includes(stem)) {
          matchScore += 0.95 * idf;
          matchedKeywords.push(term);
        }
      }
    }

    for (const bigram of queryBigrams) {
      if (chunkTextLower.includes(bigram)) {
        matchScore += 1.85;
      }
    }

    for (const trigram of queryTrigrams) {
      if (chunkTextLower.includes(trigram)) {
        matchScore += 2.1;
      }
    }

    if (cleanQ.length >= 6 && chunkTextLower.includes(cleanQ)) {
      matchScore += 4.5;
    }

    // Structural cues (definitional statements or equations in chunk boost technical Q&A accuracy)
    if (
      /\b(formula|equation|law|defined as|refers to)\b/i.test(cleanQ) &&
      (/[=→⇌]/.test(chunk.originalText) || /\b(is defined as|refers to|means)\b/i.test(chunk.originalText))
    ) {
      matchScore += 0.75;
    }

    if (matchScore > 0) {
      results.push({
        chunk,
        score: Number(matchScore.toFixed(4)),
        matchedKeywords: Array.from(new Set(matchedKeywords)),
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  // Deduplicate near-identical overlapping chunks unless fewer than topK unique results remain
  const selected: RetrievalResult[] = [];
  const selectedTokensList: Set<string>[] = [];

  for (const res of results) {
    if (selected.length >= topK) break;
    const tok = contentTokens(res.chunk.originalText);
    const isNearDuplicate = selectedTokensList.some((prevTok) => {
      const { containment } = tokenSimilarity(tok, prevTok);
      return containment >= 0.86;
    });
    if (!isNearDuplicate) {
      selected.push(res);
      selectedTokensList.push(tok);
    }
  }

  return selected.length > 0 ? selected : results.slice(0, topK);
}

// ============================================================================
// STRUCTURED ACADEMIC DOCUMENT INTELLIGENCE HELPERS (SHARED BY ALL ENGINES)
// ============================================================================

export function inferSubjectArea(
  title: string,
  text: string,
  requestedSubject = ''
): string {
  const cleanRequested = (requestedSubject || '').trim();
  if (cleanRequested && cleanRequested.toLowerCase() !== 'general studies') {
    return cleanRequested;
  }

  const combined = `${title} ${text}`.toLowerCase();
  let bestSubject = cleanRequested || 'General Studies';
  let bestScore = 0;

  for (const entry of SUBJECT_LEXICONS) {
    let score = 0;
    for (const term of entry.terms) {
      const regex = new RegExp(`\\b${term}\\b`, 'g');
      const matches = combined.match(regex);
      if (matches) {
        score += Math.min(3, matches.length);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestSubject = entry.subject;
    }
  }

  return bestScore >= 3 ? bestSubject : cleanRequested || 'General Studies';
}

export function getSubjectPeerTerms(subjectArea: string): string[] {
  const found = SUBJECT_LEXICONS.find(
    (entry) => entry.subject.toLowerCase() === subjectArea.trim().toLowerCase()
  );
  return found ? [...found.peerTerms] : [];
}

export function contentTokens(text: string): Set<string> {
  const words =
    text
      .toLowerCase()
      .replace(/\(pages?\s+\d+(?:\s*[-–]\s*\d+)?\)/gi, '')
      .match(/\b[a-z0-9][a-z0-9'-]{2,}\b/g) || [];
  const set = new Set<string>();
  for (const w of words) {
    if (!ACADEMIC_STOP_WORDS.has(w) && !/^\d+$/.test(w)) {
      set.add(w);
    }
  }
  return set;
}

export function normalizedFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(pages?\s+\d+(?:\s*[-–]\s*\d+)?\)/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenSimilarity(
  a: Set<string>,
  b: Set<string>
): { jaccard: number; containment: number } {
  if (a.size === 0 || b.size === 0) return { jaccard: 0, containment: 0 };
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  const minSize = Math.min(a.size, b.size);
  return {
    jaccard: union > 0 ? intersection / union : 0,
    containment: minSize > 0 ? intersection / minSize : 0,
  };
}

export function isRedundantAgainstPool(
  candidateText: string,
  candidateTokens: Set<string>,
  pool: Array<{ fp: string; tokens: Set<string> }>,
  jaccardThreshold = 0.54,
  containmentThreshold = 0.74
): boolean {
  const fp = normalizedFingerprint(candidateText);
  if (!fp) return true;

  for (const item of pool) {
    if (item.fp === fp) return true;
    if (
      fp.length >= 24 &&
      item.fp.length >= 24 &&
      (item.fp.includes(fp) || fp.includes(item.fp))
    ) {
      return true;
    }
    const { jaccard, containment } = tokenSimilarity(candidateTokens, item.tokens);
    if (jaccard >= jaccardThreshold || containment >= containmentThreshold) {
      return true;
    }
  }
  return false;
}

export function stripBoilerplatePrefix(text: string): string {
  let cleaned = text
    .replace(
      /^(?:it is (?:important|worth|essential) to note that|note that|in addition|furthermore|moreover|additionally|besides|consequently|basically|actually|as mentioned (?:above|earlier|before)|as we can see,?|in this (?:section|chapter|document|note|guide),?)\s*,?\s*/i,
      ''
    )
    .trim();

  if (
    cleaned.length > 0 &&
    /^[a-z]/.test(cleaned) &&
    !/^(?:e\.g\.|i\.e\.|pH|mRNA|tRNA|rRNA|cDNA)/.test(cleaned)
  ) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

export function isMetaFillerSentence(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (
    /^(?:this (?:document|chapter|section|lecture|guide|paper|text) (?:discusses|covers|introduces|explains|presents|outlines|focuses on)|in this (?:chapter|section|lesson|unit|module),?\s+we\s+(?:will|shall)?\s*(?:learn|explore|study|cover|discuss)|welcome to|read the following|see figure|refer to table|table of contents|page \d+ of \d+|all rights reserved|copyright)/i.test(
      lower
    )
  ) {
    return true;
  }
  if (/^https?:\/\/\S+$/i.test(lower)) return true;
  return false;
}

export function detectHeadingLine(line: string, nextLine?: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 85) return null;

  const mdMatch = trimmed.match(/^#{1,4}\s+(.+?)\s*#*$/);
  if (mdMatch) {
    return mdMatch[1].replace(/:$/, '').trim();
  }

  const secMatch = trimmed.match(
    /^(?:(?:chapter|section|unit|module|part|topic)\s+\d+(?:\.\d+)*[:.\s-]+|\d+(?:\.\d+){1,2}[.)]?\s+|[IVX]+\.\s+)([A-Z][^\n]{2,70})$/i
  );
  if (secMatch && !/[.!?]$/.test(trimmed)) {
    return secMatch[1].replace(/:$/, '').trim();
  }

  const simpleNumMatch = trimmed.match(/^\d+[.)]\s+([A-Z][A-Za-z0-9\s,&/()-]{2,60})$/);
  if (
    simpleNumMatch &&
    !/\b(?:is|are|was|were|has|have|had|convert|produces|occurs|means|refers)\b/i.test(
      simpleNumMatch[1]
    ) &&
    simpleNumMatch[1].split(/\s+/).length <= 7
  ) {
    return simpleNumMatch[1].replace(/:$/, '').trim();
  }

  if (
    /^[A-Z][A-Za-z0-9\s,&/()-]{3,55}:$/.test(trimmed) &&
    nextLine &&
    nextLine.trim().length > 0
  ) {
    const candidate = trimmed.slice(0, -1).trim();
    if (!/^(?:note|example|warning|tip|page|step\s*\d+|figure\s*\d+)$/i.test(candidate)) {
      return candidate;
    }
  }

  if (
    nextLine &&
    nextLine.trim().length > trimmed.length &&
    trimmed.length >= 4 &&
    trimmed.length <= 60 &&
    !/[.!?,;=→⇌]$/.test(trimmed) &&
    !/^[-*•]/.test(trimmed)
  ) {
    const words = trimmed.split(/\s+/);
    if (words.length >= 1 && words.length <= 7) {
      const capWords = words.filter((w) => /^[A-Z0-9(]/.test(w)).length;
      if (
        capWords >= Math.ceil(words.length * 0.65) &&
        !/\b(?:is|are|was|were|will|can|has|have)\b/.test(trimmed)
      ) {
        return trimmed;
      }
    }
  }

  return null;
}

export function smartSentenceSplit(paragraph: string): string[] {
  const protectedText = paragraph
    .replace(/(\d)\.(\d)/g, '$1__DEC_DOT__$2')
    .replace(
      /\b(e\.g|i\.e|etc|vs|Dr|Prof|Fig|Eq|approx|ca|No|Vol|Ch|Sec|pH|sp|ssp)\./gi,
      (m) => m.replace(/\./g, '__ABBR_DOT__')
    );

  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9("ΔαβγλμΣΩ])|(?<=[.!?]["”’)])\s+(?=[A-Z0-9(])/)
    .map((s) =>
      s
        .replace(/__DEC_DOT__/g, '.')
        .replace(/__ABBR_DOT__/g, '.')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((s) => s.length >= 12);
}

interface ParsedPageSegment {
  pageNumber: number | null;
  text: string;
}

function splitPagesPreservingMarkers(normalized: string): ParsedPageSegment[] {
  const normalizedMarkers = normalized.replace(/(^|\n)Page\s+(\d+)\s*:\s*/gi, '$1[Page $2]\n');

  if (!/\[Page\s+\d+\]/i.test(normalizedMarkers)) {
    return [{ pageNumber: null, text: normalizedMarkers }];
  }

  const rawSegs = normalizedMarkers.split(/(?=\[Page\s+\d+\])/i);
  const pages: ParsedPageSegment[] = [];

  for (const seg of rawSegs) {
    const match = seg.match(/^\[Page\s+(\d+)\]\s*([\s\S]*)$/i);
    if (match) {
      const pNum = parseInt(match[1], 10);
      const body = match[2].trim();
      if (body) pages.push({ pageNumber: pNum, text: body });
    } else if (seg.trim()) {
      pages.push({ pageNumber: null, text: seg.trim() });
    }
  }

  return pages;
}

function stripRepeatingPageChrome(pages: ParsedPageSegment[]): ParsedPageSegment[] {
  if (pages.length < 3) return pages;

  const lineFreq = new Map<string, number>();
  for (const page of pages) {
    const uniqueLines = new Set(
      page.text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.length <= 80)
    );
    for (const l of uniqueLines) {
      lineFreq.set(l, (lineFreq.get(l) || 0) + 1);
    }
  }

  const repeatedChrome = new Set<string>();
  for (const [line, count] of lineFreq.entries()) {
    if (count >= Math.max(3, Math.ceil(pages.length * 0.6))) {
      repeatedChrome.add(line);
    }
  }

  if (repeatedChrome.size === 0) return pages;

  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text
      .split('\n')
      .filter((l) => !repeatedChrome.has(l.trim()))
      .join('\n')
      .trim(),
  }));
}

export function attachPageCitation(text: string, pageNumber: number | null): string {
  const clean = text.trim();
  if (!pageNumber || /\(Pages?\s+\d+/i.test(clean)) return clean;

  const trailingPunctMatch = clean.match(/^(.*?)([.!?])$/);
  if (trailingPunctMatch) {
    return `${trailingPunctMatch[1].trim()} (Page ${pageNumber})${trailingPunctMatch[2]}`;
  }
  return `${clean} (Page ${pageNumber})`;
}

function extractQuantitiesAndUnits(text: string): string[] {
  const matches =
    text.match(
      /\b\d+(?:\.\d+)?(?:\s*[×x]\s*10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+|\s*(?:m\/s²?|km\/h|kg|mg|g|mol(?:⁻¹)?|nm|mm|cm|km|kPa|atm|bar|kJ|J|W|Hz|MHz|V|A|Ω|K|°C|%|ATP|NADH|NADPH|FADH₂|FADH2|mol\/L|M))\b/g
    ) || [];
  return Array.from(new Set(matches.map((m) => m.trim())));
}

function extractVariableNotes(text: string): FormulaVariableNote[] {
  const whereMatch = text.match(/\bwhere\s+(.{6,220})$/i);
  if (!whereMatch) return [];

  const tail = whereMatch[1].replace(/[.?!]$/, '').trim();
  const segments = tail.split(/,\s*(?:and\s+)?|\s+and\s+|\s*;\s*/);
  const vars: FormulaVariableNote[] = [];

  for (const seg of segments) {
    const m = seg
      .trim()
      .match(
        /^([A-Za-zΔαβγλμθωΩ][A-Za-z0-9_₀-₉¹²³⁰-⁹']*)\s+(?:is|represents|denotes|=|:)\s+(.{3,90})$/i
      );
    if (m) {
      vars.push({
        symbol: formatScientificText(m[1].trim()),
        meaning: formatScientificText(m[2].trim()),
      });
    }
  }
  return vars.slice(0, 6);
}

function extractFormulaFromUnit(unit: AnalyzedUnit): ExtractedFormula | null {
  const text = unit.formattedText;

  if (/[→⇌]/.test(text)) {
    const reactionMatch = text.match(
      /([A-Za-z0-9₀-₉⁰-⁹⁺⁻()[\]]+(?:\s*[+]\s*[A-Za-z0-9₀-₉⁰-⁹⁺⁻()[\]]+)*\s*[→⇌]\s*[A-Za-z0-9₀-₉⁰-⁹⁺⁻()[\]]+(?:\s*[+]\s*[A-Za-z0-9₀-₉⁰-⁹⁺⁻()[\]]+)*)/
    );
    const expr = reactionMatch ? reactionMatch[1].trim() : text;
    if (expr.length >= 7 && expr.length <= 140) {
      let name = unit.sectionHeading || 'Chemical Reaction';
      const colonPrefix = text.match(/^([A-Z][A-Za-z0-9\s-]{2,42}):\s+/);
      if (colonPrefix) {
        name = colonPrefix[1].trim();
      } else if (/photosynthesis/i.test(text)) {
        name = 'Photosynthesis Equation';
      } else if (/respiration/i.test(text)) {
        name = 'Cellular Respiration Equation';
      } else if (/neutralization/i.test(text)) {
        name = 'Acid-Base Neutralization';
      } else if (/combustion/i.test(text)) {
        name = 'Combustion Reaction';
      }

      const usageBase =
        text.length > expr.length + 12
          ? text
              .replace(expr, '')
              .replace(/^[:,\s-]+|[:,\s-]+$/g, '')
              .replace(/^(?:is represented by|equation:?|reaction:?)\s*/i, '')
              .trim()
          : `Reaction pathway from ${unit.sectionHeading || 'source material'}`;

      const rawUsage =
        usageBase.length >= 10
          ? usageBase.charAt(0).toUpperCase() + usageBase.slice(1)
          : `Balanced chemical process${unit.sectionHeading ? ` in ${unit.sectionHeading}` : ''}`;

      return {
        name,
        expressionOrStructure: expr,
        usage: attachPageCitation(rawUsage, unit.pageNumber),
        rawUsage,
        variables: [],
        sectionHeading: unit.sectionHeading,
        pageNumber: unit.pageNumber,
        salience: unit.score,
        sourceText: text,
        isChemicalReaction: true,
      };
    }
  }

  const eqMatch = text.match(
    /(?:^|[\s:(])([A-Za-zΔαβγλμθωΩ][A-Za-z0-9_₀-₉¹²³⁰-⁹']*)\s*([=≈∝])\s*([A-Za-z0-9ΔαβγλμθπρσωΩ₀-₉¹²³⁰-⁹⁺⁻*/·×÷+\-^()[\].\s]{1,55})(?=[,.;:)]|\s+where\b|\s+for\b|$)/
  );
  if (!eqMatch) return null;

  const lhs = eqMatch[1].trim();
  const op = eqMatch[2];
  const rhs = eqMatch[3].trim();

  const rhsHasMathSignal =
    /[0-9+\-*/×·÷()[\]²³⁻¹⁻²⁻³⁰-⁹₀-₉]/.test(rhs) ||
    /^[A-Za-zΔαβγλμθπρσωΩ]{1,4}(?:\s*[A-Za-z0-9_]{1,4})*$/.test(rhs);
  if (!rhsHasMathSignal || lhs.length > 18 || rhs.length === 0 || rhs.split(/\s+/).length > 8) {
    return null;
  }

  const expr = `${lhs} ${op} ${rhs}`;
  const variables = extractVariableNotes(text);

  let name = unit.sectionHeading || 'Formula';
  const beforeEq = text.slice(0, text.indexOf(eqMatch[0])).trim();
  const labelColonMatch = beforeEq.match(/([A-Z][A-Za-z0-9\s'-]{2,45}):\s*$/);
  const statesMatch = beforeEq.match(
    /([A-Z][A-Za-z0-9\s'-]{2,48}?)\s+(?:states that|is expressed as|is given by|is calculated as|is defined as|equation|formula)\s*$/i
  );
  if (labelColonMatch) {
    name = labelColonMatch[1].trim();
  } else if (statesMatch) {
    name = statesMatch[1].trim();
  } else if (lhs === 'F' && /ma/.test(rhs)) {
    name = "Newton's Second Law";
  } else if (/^E$/i.test(lhs) && /mc/.test(rhs)) {
    name = 'Mass-Energy Equivalence';
  } else if (lhs === 'KE' || lhs === 'K' || lhs === 'E_k') {
    name = 'Kinetic Energy';
  } else if (lhs === 'PE' || lhs === 'U' || lhs === 'E_p') {
    name = 'Potential Energy';
  } else if (lhs === 'PV') {
    name = 'Ideal Gas Law';
  } else if (lhs === 'pH') {
    name = 'pH Definition';
  } else if (lhs === 'ΔG') {
    name = 'Gibbs Free Energy';
  } else if (lhs === 'V' && /IR/.test(rhs)) {
    name = "Ohm's Law";
  } else if (!unit.sectionHeading) {
    name = `Equation (${lhs})`;
  }

  let rawUsage = text.replace(/\bwhere\s+.+$/i, '').trim();
  if (rawUsage.length < 18) {
    rawUsage = text;
  }
  rawUsage = stripBoilerplatePrefix(rawUsage);

  return {
    name,
    expressionOrStructure: expr,
    usage: attachPageCitation(rawUsage, unit.pageNumber),
    rawUsage,
    variables,
    sectionHeading: unit.sectionHeading,
    pageNumber: unit.pageNumber,
    salience: unit.score,
    sourceText: text,
    isChemicalReaction: false,
  };
}

function extractDefinitionFromUnit(unit: AnalyzedUnit): ExtractedDefinition | null {
  const text = unit.formattedText;
  if (text.length < 22 || text.length > 340) return null;

  const colonMatch = text.match(/^([A-Za-z0-9ΔαβγλμθωΩ₀-₉⁰-⁹\s'-]{2,45}):\s+(.{18,})$/);
  if (colonMatch) {
    const rawTerm = colonMatch[1].trim();
    const rawDef = colonMatch[2].trim();
    if (
      rawTerm.split(/\s+/).length <= 5 &&
      !/^(?:note|example|formula|equation|reaction|step\s*\d+|page\s*\d+|figure\s*\d+|table\s*\d+|section\s*\d+|chapter\s*\d+|case\s*\d+|warning|caution|tip|hint|important|remember|summary|recap)$/i.test(
        rawTerm
      ) &&
      !/^\s*[A-Za-z0-9]+\s*=/.test(rawDef) &&
      !/\s(?:->|→|=)\s/.test(rawDef)
    ) {
      const cleanTerm = rawTerm.replace(/^(?:the|an?)\s+/i, '');
      return {
        term: cleanTerm,
        definition: attachPageCitation(rawDef, unit.pageNumber),
        rawDefinition: rawDef,
        origin: 'source',
        sectionHeading: unit.sectionHeading,
        pageNumber: unit.pageNumber,
        salience: unit.score,
        sourceText: text,
      };
    }
  }

  // Dash / em-dash definition: "Term — definition text"
  const dashMatch = text.match(/^([A-Za-z0-9ΔαβγλμθωΩ₀-₉⁰-⁹\s'-]{2,45})\s+[—–-]\s+(.{18,})$/);
  if (dashMatch) {
    const rawTerm = dashMatch[1].trim().replace(/^(?:the|an?)\s+/i, '');
    const rawDef = dashMatch[2].trim();
    if (
      rawTerm.split(/\s+/).length <= 5 &&
      !/^(?:note|example|step\s*\d+|page\s*\d+|figure\s*\d+|warning|summary|recap)/i.test(rawTerm)
    ) {
      return {
        term: rawTerm,
        definition: attachPageCitation(rawDef, unit.pageNumber),
        rawDefinition: rawDef,
        origin: 'source',
        sectionHeading: unit.sectionHeading,
        pageNumber: unit.pageNumber,
        salience: unit.score,
        sourceText: text,
      };
    }
  }

  // Parenthetical definition: "Chlorophyll (a green pigment that absorbs light energy) ..."
  const parenDefMatch = text.match(
    /\b([A-Z][A-Za-z0-9ΔαβγλμθωΩ₀-₉⁰-⁹'-]{2,34})\s+\(((?:a|an|the)\s+[^()]{14,130})\)/i
  );
  if (parenDefMatch) {
    const rawTerm = parenDefMatch[1].trim();
    const rawDef = parenDefMatch[2].trim();
    if (!/^(?:e\.g\.|i\.e\.|see|page|fig)/i.test(rawDef) && rawTerm.split(/\s+/).length <= 4) {
      const cleanDef = rawDef.charAt(0).toUpperCase() + rawDef.slice(1);
      return {
        term: rawTerm,
        definition: attachPageCitation(cleanDef, unit.pageNumber),
        rawDefinition: cleanDef,
        origin: 'source',
        sectionHeading: unit.sectionHeading,
        pageNumber: unit.pageNumber,
        salience: unit.score * 0.95,
        sourceText: text,
      };
    }
  }

  const defMatch = text.match(
    /^([A-Za-z0-9ΔαβγλμθωΩ₀-₉⁰-⁹()'-]+(?:\s+[A-Za-z0-9ΔαβγλμθωΩ₀-₉⁰-⁹()'-]+){0,5})\s+(is defined as|are defined as|refers to|means|denotes|represents|describes the|is the process(?: of| by which)?|(?:is|are) (?:a|an|the)\s+(?:[a-z-]+\s+){0,3}(?:process|pathway|reaction|mechanism|molecule|compound|substance|pigment|enzyme|protein|organelle|carrier|force|law|principle|measure|quantity|ratio|rate|property|state|system|bond|energy|unit|branch|study|theory|phenomenon|structure|device|method|movement|transfer|conversion|set|region|layer|fluid|gas|ion|acid|base|technique|algorithm|model|concept|framework|metric|rule|value|field|function|component))\b\s*(.+)$/i
  );

  if (defMatch) {
    const rawTerm = defMatch[1].trim().replace(/^(?:the|an?)\s+/i, '');
    const connector = defMatch[2].trim();
    const rest = defMatch[3].trim();

    if (
      rawTerm.length >= 2 &&
      rawTerm.length <= 48 &&
      !/^(?:it|this|that|these|those|they|there|here|which|what)$/i.test(rawTerm) &&
      rest.length >= 12
    ) {
      let cleanDef = '';
      if (/^(?:is defined as|are defined as|refers to|means|denotes|represents)$/i.test(connector)) {
        cleanDef = rest.replace(/^(?:the|a|an)\s+/i, (m) => m.charAt(0).toUpperCase() + m.slice(1));
        cleanDef = cleanDef.charAt(0).toUpperCase() + cleanDef.slice(1);
      } else if (/^describes the$/i.test(connector)) {
        cleanDef = `The ${rest}`;
      } else {
        const strippedVerb = connector.replace(/^(?:is|are)\s+(?:a(?:n)?\s+|the\s+)?/i, '');
        const combined = `${strippedVerb} ${rest}`.trim();
        cleanDef = combined.charAt(0).toUpperCase() + combined.slice(1);
      }

      return {
        term: rawTerm,
        definition: attachPageCitation(cleanDef, unit.pageNumber),
        rawDefinition: cleanDef,
        origin: 'source',
        sectionHeading: unit.sectionHeading,
        pageNumber: unit.pageNumber,
        salience: unit.score,
        sourceText: text,
      };
    }
  }

  return null;
}

function extractDistinctionFromUnit(unit: AnalyzedUnit): ExtractedDistinction | null {
  const text = unit.formattedText;
  if (text.length < 30) return null;

  const hasContrast =
    /\b(whereas|in contrast|unlike|differs from|difference between|compared (?:to|with)|on the other hand|as opposed to|versus|\bvs\.?\b)\b/i.test(
      text
    );
  if (!hasContrast) return null;

  let pairTitle = unit.sectionHeading ? `${unit.sectionHeading} Distinction` : 'Key Distinction';
  let subjectA: string | null = null;
  let subjectB: string | null = null;

  const diffBetween = text.match(
    /difference between\s+([A-Za-z0-9\s'-]{2,28}?)\s+and\s+([A-Za-z0-9\s'-]{2,28}?)(?=\s+(?:is|are|lies|involves)|[,.;])/i
  );
  const unlikeMatch = text.match(
    /^Unlike\s+([A-Za-z0-9\s'-]{2,32}?),\s+(?:the\s+)?([A-Za-z0-9\s'-]{2,32}?)\s+(?:is|are|has|have|uses|occurs|produces|transfers|takes)/i
  );
  const whereasMatch = text.match(
    /^([A-Z][A-Za-z0-9\s'-]{1,28}?)\s+(?:is|are|occurs|uses|involves|produces|has|have)\b[^;,.]{3,65},?\s+whereas\s+([A-Za-z0-9\s'-]{2,28}?)\s+(?:is|are|occurs|uses|involves|produces|has|have)/i
  );

  if (diffBetween) {
    subjectA = diffBetween[1].trim();
    subjectB = diffBetween[2].trim();
    pairTitle = `${subjectA} vs. ${subjectB}`;
  } else if (unlikeMatch) {
    subjectA = unlikeMatch[2].trim();
    subjectB = unlikeMatch[1].trim();
    pairTitle = `${subjectA} vs. ${subjectB}`;
  } else if (whereasMatch) {
    subjectA = whereasMatch[1].trim();
    subjectB = whereasMatch[2].trim();
    pairTitle = `${subjectA} vs. ${subjectB}`;
  }

  const rawComparison = stripBoilerplatePrefix(text);
  return {
    pairTitle: formatScientificText(pairTitle),
    subjectA: subjectA ? formatScientificText(subjectA) : null,
    subjectB: subjectB ? formatScientificText(subjectB) : null,
    comparison: attachPageCitation(rawComparison, unit.pageNumber),
    rawComparison,
    sectionHeading: unit.sectionHeading,
    pageNumber: unit.pageNumber,
    salience: unit.score,
    sourceText: text,
  };
}

function isProcessOrMechanismUnit(unit: AnalyzedUnit): boolean {
  const text = unit.formattedText;
  const heading = (unit.sectionHeading || '').toLowerCase();

  if (
    unit.isStep ||
    /\b(process|mechanism|pathway|cycle|stages?|phases?|steps?|cascade|synthesis|glycolysis|phosphorylation|replication|transcription|translation)\b/i.test(
      heading
    )
  ) {
    return true;
  }

  return (
    /^(?:first|initially|second|third|next|then|subsequently|finally)\b/i.test(text) ||
    /\b(?:stage\s+\d+|phase\s+\d+|step\s+\d+|splits\s+.+?\s+into|converts\s+.+?\s+into|breaks down\s+.+?\s+into|catalyzes|synthesizes|transports|pumps|triggers)\b/i.test(
      text
    )
  );
}

function extractCauseEffectFromUnit(unit: AnalyzedUnit): ExtractedCauseEffect | null {
  const text = stripBoilerplatePrefix(unit.formattedText);
  if (text.length < 28 || text.length > 280) return null;

  const forwardMatch = text.match(
    /^(.{12,130}?)\s+(causes|leads to|results in|triggers|produces|generates|drives|enables|prevents|lowers)\s+(.{10,140}?)[.?!]?$/i
  );
  if (forwardMatch) {
    const cause = forwardMatch[1].trim();
    const verb = forwardMatch[2].trim().toLowerCase();
    const effect = `${verb} ${forwardMatch[3].trim()}`.replace(/\s+/g, ' ');
    if (!/^(?:it|this|that|they|which)$/i.test(cause)) {
      return {
        cause,
        effect,
        relationshipText: text,
        sectionHeading: unit.sectionHeading,
        pageNumber: unit.pageNumber,
        salience: unit.score,
      };
    }
  }

  const becauseMatch = text.match(/^(.{15,140}?)\s+because\s+(.{12,140}?)[.?!]?$/i);
  if (becauseMatch) {
    return {
      cause: becauseMatch[2].trim(),
      effect: becauseMatch[1].trim(),
      relationshipText: text,
      sectionHeading: unit.sectionHeading,
      pageNumber: unit.pageNumber,
      salience: unit.score,
    };
  }

  return null;
}

function extractClassificationFromUnit(unit: AnalyzedUnit): ExtractedClassification | null {
  const text = stripBoilerplatePrefix(unit.formattedText);
  if (text.length < 24 || text.length > 280) return null;

  const classMatch = text.match(
    /(?:types|classes|categories|forms|groups|examples)\s+of\s+([A-Za-z0-9\s'-]{3,42}?)\s+(?:include|are|consist of)\s+(.{8,140}?)[.?!]?$/i
  );
  if (classMatch) {
    const category = classMatch[1].trim();
    const members = classMatch[2]
      .split(/,\s*(?:and\s+)?|\s+and\s+/i)
      .map((m) => m.replace(/^(?:such as|including)\s+/i, '').trim())
      .filter((m) => m.length >= 2 && m.length <= 45);
    if (members.length >= 2) {
      return {
        category,
        members,
        statement: text,
        sectionHeading: unit.sectionHeading,
        pageNumber: unit.pageNumber,
        salience: unit.score,
      };
    }
  }

  const dividedMatch = text.match(
    /^([A-Z][A-Za-z0-9\s'-]{3,42}?)\s+(?:is|are)\s+(?:classified|divided|grouped|categorized)\s+into\s+(.{8,140}?)[.?!]?$/i
  );
  if (dividedMatch) {
    const category = dividedMatch[1].trim();
    const members = dividedMatch[2]
      .split(/,\s*(?:and\s+)?|\s+and\s+/i)
      .map((m) => m.trim())
      .filter((m) => m.length >= 2 && m.length <= 45);
    if (members.length >= 2) {
      return {
        category,
        members,
        statement: text,
        sectionHeading: unit.sectionHeading,
        pageNumber: unit.pageNumber,
        salience: unit.score,
      };
    }
  }

  return null;
}

function extractStructureFunctionFromUnit(
  unit: AnalyzedUnit
): ExtractedStructureFunction | null {
  const text = stripBoilerplatePrefix(unit.formattedText);
  if (text.length < 25 || text.length > 260) return null;
  if (/^[→⇌]|=\s*\S/.test(text)) return null;

  const m = text.match(
    /^(?:In\s+[^,]{3,38},\s+)?(?:the\s+)?([A-Z][A-Za-z0-9₀-₉()'/-]*(?:\s+[A-Za-z0-9₀-₉()'/-]+){0,4})\s+(produces?|synthesizes?|catalyzes?|converts?|breaks?\s+down|translates?|captures?|absorbs?|stores?|regulates?|transports?|pumps?|lowers?|degrades?|modif(?:ies|y)|acts?\s+as|releases?|generates?|carr(?:ies|y)|protects?|oxidizes?|reduces?|phosphorylates?|splits?|attaches?)\s+(.{10,170}?)[.?!]?$/i
  );
  if (!m) return null;

  const rawEntity = m[1].trim().replace(/^(?:the|an?)\s+/i, '');
  if (
    rawEntity.length < 2 ||
    rawEntity.length > 44 ||
    /^(?:it|this|that|they|these|those|which|what|first|next|then|finally|however|unlike)$/i.test(
      rawEntity
    )
  ) {
    return null;
  }

  const verb = m[2].trim();
  const rest = m[3].trim();
  const roleOrFunction = `${verb.charAt(0).toUpperCase() + verb.slice(1)} ${rest}`;

  return {
    entity: rawEntity,
    verb,
    roleOrFunction,
    statement: text,
    sectionHeading: unit.sectionHeading,
    pageNumber: unit.pageNumber,
    salience: unit.score,
  };
}

function extractExampleFromUnit(unit: AnalyzedUnit): ExtractedExample | null {
  const text = unit.formattedText;
  if (text.length < 25) return null;

  const hasExampleCue =
    /\b(for example|for instance|e\.g\.|such as|applied in|application of|used in|real-world example|demonstrated by)\b/i.test(
      text
    );
  if (!hasExampleCue) return null;

  let title = unit.sectionHeading || 'Application & Example';
  const subjectMatch = text.match(
    /^([A-Z][A-Za-z0-9\s'-]{2,36}?)\s+(?:such as|are used in|is used in|is applied in|demonstrates)/i
  );
  if (subjectMatch && subjectMatch[1].split(/\s+/).length <= 5) {
    title = subjectMatch[1].trim();
  }

  return {
    title: formatScientificText(title),
    example: attachPageCitation(stripBoilerplatePrefix(text), unit.pageNumber),
    origin: 'source',
    sectionHeading: unit.sectionHeading,
    pageNumber: unit.pageNumber,
    salience: unit.score,
  };
}

function cleanStepText(text: string): string {
  return text.replace(/^(?:step\s*\d+\s*[:.)-]?\s*|\d+[.)]\s+)/i, '').trim();
}

function buildClusterHeading(units: AnalyzedUnit[], fallbackIdx: number): string {
  const combined = units.map((u) => u.formattedText).join(' ');
  const kws = extractKeywords(combined, 4).filter((k) => !ACADEMIC_STOP_WORDS.has(k));
  if (kws.length >= 2) {
    const fmt = (w: string) =>
      w.length <= 4 && /^(atp|dna|rna|nadh|ph)$/i.test(w)
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1);
    return `${fmt(kws[0])} & ${fmt(kws[1])}`;
  }
  if (kws.length === 1) {
    const w = kws[0];
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return `Core Concept ${fallbackIdx + 1}`;
}

function extractKeyPhrases(normalizedText: string, maxPhrases = 12): string[] {
  // RAKE-inspired delimiter splitting + TF-IDF scoring for multi-word academic phrases
  const wordFreq = new Map<string, number>();
  const wordDegree = new Map<string, number>();
  const candidateCounts = new Map<string, number>();
  const candidateTokensMap = new Map<string, string[]>();

  const chunks = normalizedText.split(/[.,;:!?()\n[\]—–/"]+/);
  for (const seg of chunks) {
    const rawTokens = seg.trim().split(/\s+/);
    let currentPhrase: string[] = [];

    const flushPhrase = () => {
      if (currentPhrase.length >= 2 && currentPhrase.length <= 4) {
        const cleanToks = currentPhrase.map((t) => t.replace(/^'+|'+$/g, ''));
        const lowerKey = cleanToks.map((t) => t.toLowerCase()).join(' ');
        if (lowerKey.length >= 5 && !/^\d[\d\s]*$/.test(lowerKey)) {
          candidateCounts.set(lowerKey, (candidateCounts.get(lowerKey) || 0) + 1);
          if (!candidateTokensMap.has(lowerKey)) {
            candidateTokensMap.set(lowerKey, cleanToks);
          }
          const deg = cleanToks.length - 1;
          for (const tok of cleanToks) {
            const lk = tok.toLowerCase();
            wordFreq.set(lk, (wordFreq.get(lk) || 0) + 1);
            wordDegree.set(lk, (wordDegree.get(lk) || 0) + deg);
          }
        }
      }
      currentPhrase = [];
    };

    for (const raw of rawTokens) {
      const clean = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9'-]+$/g, '');
      const lower = clean.toLowerCase();
      if (!clean || clean.length < 3 || ACADEMIC_STOP_WORDS.has(lower) || /^\d+$/.test(clean)) {
        flushPhrase();
      } else {
        currentPhrase.push(clean);
      }
    }
    flushPhrase();
  }

  const scored = Array.from(candidateCounts.entries()).map(([key, count]) => {
    const toks = candidateTokensMap.get(key) || key.split(' ');
    let rakeScore = 0;
    for (const t of toks) {
      const lk = t.toLowerCase();
      const freq = wordFreq.get(lk) || 1;
      const deg = (wordDegree.get(lk) || 0) + freq;
      rakeScore += deg / freq;
    }
    // Weight by frequency and multi-word academic specificity
    const totalScore = rakeScore * (1 + Math.log1p(count));
    return { key, totalScore };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);

  const selected: string[] = [];
  const seenKeys = new Set<string>();
  for (const item of scored) {
    if (selected.length >= maxPhrases) break;
    if (seenKeys.has(item.key)) continue;
    seenKeys.add(item.key);
    const formatted = item.key
      .split(' ')
      .map((w) =>
        /^(atp|adp|dna|rna|mrna|trna|nadh|nadph|ph|pka|co2|h2o|o2|gdp|api|http)$/i.test(w)
          ? formatScientificText(w.toUpperCase())
          : w.charAt(0).toUpperCase() + w.slice(1)
      )
      .join(' ');
    selected.push(formatted);
  }
  return selected;
}

/**
 * Graph-based TextRank centrality over AnalyzedUnits using sparse inverted token indexing
 * (O(N * avgTokens) so even multi-hundred-page textbooks complete in milliseconds).
 */
function applyTextRankScoring(units: AnalyzedUnit[]): void {
  const n = Math.min(units.length, 450); // Graph top 450 units for bounded O(N) runtime
  if (n < 3) return;

  const sampleUnits = units.slice(0, n);
  const inverted = new Map<string, number[]>();
  const df = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    for (const tok of sampleUnits[i].tokens) {
      let arr = inverted.get(tok);
      if (!arr) {
        arr = [];
        inverted.set(tok, arr);
      }
      arr.push(i);
      df.set(tok, (df.get(tok) || 0) + 1);
    }
  }

  // Precompute sparse weighted adjacency neighbors
  const neighbors: Array<Array<{ j: number; weight: number }>> = Array.from({ length: n }, () => []);
  const outSum = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const overlapCounts = new Map<number, number>();
    const uToks = sampleUnits[i].tokens;
    for (const tok of uToks) {
      const postings = inverted.get(tok);
      if (!postings || postings.length > Math.max(40, n * 0.6)) continue; // skip ultra-common words
      const idf = Math.log(1 + n / (df.get(tok) || 1));
      for (const j of postings) {
        if (j === i) continue;
        overlapCounts.set(j, (overlapCounts.get(j) || 0) + idf);
      }
    }

    const denomI = Math.sqrt(Math.max(1, uToks.size));
    const entries: Array<{ j: number; weight: number }> = [];
    for (const [j, rawOverlap] of overlapCounts.entries()) {
      const denomJ = Math.sqrt(Math.max(1, sampleUnits[j].tokens.size));
      const w = rawOverlap / (denomI * denomJ);
      if (w > 0.12) {
        entries.push({ j, weight: w });
      }
    }
    // Keep top 16 neighbors per node for crisp centrality convergence
    entries.sort((a, b) => b.weight - a.weight);
    const trimmed = entries.slice(0, 16);
    neighbors[i] = trimmed;
    for (const e of trimmed) {
      outSum[i] += e.weight;
    }
  }

  let ranks = new Float64Array(n).fill(1 / n);
  const nextRanks = new Float64Array(n);
  const damping = 0.85;

  for (let iter = 0; iter < 15; iter++) {
    nextRanks.fill((1 - damping) / n);
    for (let i = 0; i < n; i++) {
      if (outSum[i] <= 0) continue;
      const contrib = (damping * ranks[i]) / outSum[i];
      for (const edge of neighbors[i]) {
        nextRanks[edge.j] += contrib * edge.weight;
      }
    }
    ranks.set(nextRanks);
  }

  let maxRank = 0;
  for (let i = 0; i < n; i++) {
    if (ranks[i] > maxRank) maxRank = ranks[i];
  }
  if (maxRank <= 0) return;

  for (let i = 0; i < n; i++) {
    const centralityFactor = 0.78 + 0.52 * (ranks[i] / maxRank);
    sampleUnits[i].score = Number((sampleUnits[i].score * centralityFactor).toFixed(4));
  }
}

/**
 * Deterministic academic plain-language simplification for dense or complex statements
 * without altering source meaning or inventing facts.
 */
export function buildStudentFriendlyClarification(
  text: string,
  definitions: ExtractedDefinition[]
): string {
  const clean = stripBoilerplatePrefix(text).trim();
  if (!clean) return '';

  // Clarify overly formal connectors into plain academic phrasing
  let simplified = clean
    .replace(/\bconsequently,\s*/gi, 'As a result, ')
    .replace(/\bnevertheless,\s*/gi, 'Even so, ')
    .replace(/\bsubsequently,\s*/gi, 'Next, ')
    .replace(/\bthereby\s+([a-z]+ing)\b/gi, 'which $1')
    .replace(/\butilized?\b/gi, 'used')
    .replace(/\bfacilitates?\b/gi, 'helps enable');

  // Attach brief parenthetical reminders for specialized terms defined in the document
  for (const def of definitions.slice(0, 12)) {
    const termLower = def.term.toLowerCase();
    if (
      termLower.length >= 4 &&
      simplified.toLowerCase().includes(termLower) &&
      !simplified.toLowerCase().includes(def.rawDefinition.slice(0, 24).toLowerCase())
    ) {
      const shortMeaning = def.rawDefinition.split(/[.;]/)[0].trim();
      if (shortMeaning.length >= 12 && shortMeaning.length <= 95 && simplified.length < 220) {
        return `${simplified} — Key context: ${def.term} refers to ${shortMeaning.charAt(0).toLowerCase() + shortMeaning.slice(1)}.`;
      }
    }
  }

  return simplified !== clean ? `In plain terms: ${simplified}` : '';
}

function detectSectionRelationships(
  sections: DocumentSectionCluster[]
): ExtractedSectionRelationship[] {
  if (sections.length < 2) return [];
  const relationships: ExtractedSectionRelationship[] = [];

  const sectionTerms = sections.map((sec) => {
    const freq = new Map<string, number>();
    for (const u of sec.units) {
      for (const tok of u.tokens) {
        if (tok.length >= 4) {
          freq.set(tok, (freq.get(tok) || 0) + 1);
        }
      }
    }
    return new Set(
      Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([w]) => w)
    );
  });

  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = i + 1; j < Math.min(sections.length, i + 4); j++) {
      if (sections[i].heading === sections[j].heading) continue;
      const shared: string[] = [];
      for (const term of sectionTerms[i]) {
        if (sectionTerms[j].has(term)) {
          shared.push(term.charAt(0).toUpperCase() + term.slice(1));
        }
      }
      if (shared.length >= 2) {
        const topShared = shared.slice(0, 4);
        relationships.push({
          fromSection: sections[i].heading,
          toSection: sections[j].heading,
          sharedConcepts: topShared,
          connectionNote: `${sections[i].heading} connects directly to ${sections[j].heading} through shared core concepts (${topShared.join(', ')}).`,
        });
      }
    }
  }
  return relationships.slice(0, 8);
}

function extractDifficultConcepts(
  units: AnalyzedUnit[],
  definitions: ExtractedDefinition[],
  formulas: ExtractedFormula[]
): ExtractedDifficultConcept[] {
  const results: ExtractedDifficultConcept[] = [];
  const seenConcepts = new Set<string>();

  // 1. Formula/Equation dense rules simplified for students
  for (const f of formulas.slice(0, 5)) {
    const key = f.name.toLowerCase();
    if (seenConcepts.has(key)) continue;
    seenConcepts.add(key);
    const varSummary =
      f.variables.length > 0
        ? ` Variables involved: ${f.variables.map((v) => `${v.symbol} (${v.meaning})`).join(', ')}.`
        : '';
    results.push({
      concept: f.name,
      sourceContext: `${f.expressionOrStructure} — ${f.rawUsage}`,
      plainExplanation: `Look closely at how ${f.expressionOrStructure} relates the quantities in ${f.sectionHeading || 'this topic'}.${varSummary}`,
      pageNumber: f.pageNumber,
    });
  }

  // 2. High-density technical sentences (multi-syllable terminology + causal/conditional structure)
  const denseCandidates = [...units]
    .filter((u) => u.formattedText.length >= 75 && u.formattedText.length <= 290)
    .map((u) => {
      const longWords = (u.formattedText.match(/\b[A-Za-z]{9,}\b/g) || []).length;
      const hasNuance = /\b(?:whereas|however|inverse|proportional|equilibrium|cascade|threshold|gradient|exponential|differential|enzyme|catalyzed)\b/i.test(
        u.formattedText
      );
      return { unit: u, density: longWords + (hasNuance ? 2 : 0) };
    })
    .filter((item) => item.density >= 3)
    .sort((a, b) => b.density * b.unit.score - a.density * a.unit.score);

  for (const { unit } of denseCandidates.slice(0, 5)) {
    const leadConcept =
      unit.sectionHeading ||
      Array.from(unit.tokens)
        .filter((t) => t.length >= 6)
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' & ');
    if (!leadConcept || seenConcepts.has(leadConcept.toLowerCase())) continue;
    seenConcepts.add(leadConcept.toLowerCase());

    const clarified = buildStudentFriendlyClarification(unit.formattedText, definitions);
    const plain =
      clarified ||
      `Break this down step by step: identify the main subject first, then trace how the condition or mechanism changes the outcome.`;

    results.push({
      concept: leadConcept,
      sourceContext: attachPageCitation(stripBoilerplatePrefix(unit.formattedText), unit.pageNumber),
      plainExplanation: plain,
      pageNumber: unit.pageNumber,
    });
  }

  return results.slice(0, 6);
}

// ============================================================================
// MAIN DOCUMENT INTELLIGENCE ANALYZER (SHARED + CONTENT-HASH CACHED)
// ============================================================================

/**
 * Parses and structures any academic document into a unified DocumentIntelligenceProfile:
 * sections, cross-section relationships, difficult concept clarifications, definitions,
 * formulas/reactions + variable meanings, ordered processes, distinctions, cause-and-effect
 * pairs, classifications, structure-function links, examples, RAKE keyphrases, and TextRank +
 * BM25/TF-IDF salience scores.
 *
 * Results are cached by content hash so Summarizer, Quiz Maker, Exam Maker, and RAG
 * reuse identical structural analysis without redundant CPU work. Zero generative AI calls.
 */
export function analyzeDocumentIntelligence(
  extractedText: string,
  options?: { title?: string; subjectArea?: string }
): DocumentIntelligenceProfile {
  const normalized = normalizeText(extractedText);
  const title = (options?.title || 'Study Document').trim();
  const requestedSubject = (options?.subjectArea || '').trim();

  const contentHash = crypto
    .createHash('sha256')
    .update(`${normalized}|${title}|${requestedSubject}`)
    .digest('hex')
    .slice(0, 24);

  const cached = intelligenceProfileCache.get(contentHash);
  if (cached) {
    return cached;
  }

  const alphaWordCount = (normalized.match(/[a-zA-Z]{2,}/g) || []).length;
  const words = normalized ? normalized.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const resolvedSubject = inferSubjectArea(title, normalized, requestedSubject);
  const chunks = normalized
    ? chunkDocumentText(`doc-${contentHash.slice(0, 8)}`, 'intel-engine', normalized, 1200, 200)
    : [];

  const rawPages = stripRepeatingPageChrome(splitPagesPreservingMarkers(normalized));
  const globalTermFreq = new Map<string, number>();

  for (const w of normalized.toLowerCase().match(/\b[a-z0-9][a-z0-9'-]{2,}\b/g) || []) {
    if (!ACADEMIC_STOP_WORDS.has(w) && !/^\d+$/.test(w)) {
      globalTermFreq.set(w, (globalTermFreq.get(w) || 0) + 1);
    }
  }

  // Paragraph-level document frequency (IDF) for true TF-IDF sentence scoring
  const rawParagraphsForIdf = segmentParagraphs(normalized);
  const totalIdfParagraphs = Math.max(1, rawParagraphsForIdf.length);
  const paragraphDf = new Map<string, number>();
  for (const para of rawParagraphsForIdf.slice(0, 1200)) {
    const paraToks = contentTokens(para);
    for (const t of paraToks) {
      paragraphDf.set(t, (paragraphDf.get(t) || 0) + 1);
    }
  }

  const units: AnalyzedUnit[] = [];
  const seenExactFp = new Set<string>();
  let orderCounter = 0;
  let detectedHeadingCount = 0;

  const scoreSentenceTfIdf = (formattedText: string, tokens: Set<string>, ordIdx: number) => {
    let tfidfSum = 0;
    for (const t of tokens) {
      const tf = Math.min(8, globalTermFreq.get(t) || 1);
      const dfVal = paragraphDf.get(t) || 1;
      const idf = Math.log(1 + totalIdfParagraphs / (dfVal + 0.5));
      tfidfSum += tf * idf;
    }
    let score = tokens.size > 0 ? tfidfSum / Math.sqrt(tokens.size + 1.2) : 1;
    if (/\d/.test(formattedText)) score *= 1.12;
    if (/[=→⇌]/.test(formattedText)) score *= 1.22;
    if (
      /\b(is defined as|refers to|means|denotes|causes|leads to|produces|converts|whereas|unlike|therefore|concludes)\b/i.test(
        formattedText
      )
    ) {
      score *= 1.2;
    }
    if (ordIdx < 5) score *= 1.12;
    return Number(score.toFixed(4));
  };

  for (const page of rawPages) {
    const lines = page.text.split('\n');
    let currentHeading: string | null = null;
    let paragraphBuf: string[] = [];

    const flushParagraph = () => {
      if (paragraphBuf.length === 0) return;
      const paraText = paragraphBuf.join(' ').replace(/\s+/g, ' ').trim();
      paragraphBuf = [];
      if (paraText.length < 12) return;

      const splitSentences = smartSentenceSplit(paraText);
      const candidates = splitSentences.length > 0 ? splitSentences : [paraText];

      for (const rawSent of candidates) {
        const cleaned = rawSent.replace(/\s+/g, ' ').trim();
        const isFormulaLine =
          /[→⇌]|(?:^|\s)[A-Za-zΔαβγλμθπρσωΩ][A-Za-z0-9_₀-₉⁰-⁹']*\s*[=≈∝]\s*\S/.test(cleaned);
        if (cleaned.length < (isFormulaLine ? 5 : 14) || isMetaFillerSentence(cleaned)) continue;

        const fp = normalizedFingerprint(cleaned);
        if (!fp || seenExactFp.has(fp)) continue;
        seenExactFp.add(fp);

        const formattedText = formatScientificText(cleaned);
        const tokens = contentTokens(formattedText);
        if (tokens.size < 2 && !isFormulaLine && !/[=→⇌]/.test(formattedText)) continue;

        const score = scoreSentenceTfIdf(formattedText, tokens, orderCounter);

        units.push({
          text: cleaned,
          formattedText,
          pageNumber: page.pageNumber,
          sectionHeading: currentHeading,
          orderIndex: orderCounter++,
          isBullet: false,
          isStep: /^step\s*\d+/i.test(cleaned),
          score,
          tokens,
          quantitiesUnits: extractQuantitiesAndUnits(formattedText),
          fingerprint: fp,
        });
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        flushParagraph();
        continue;
      }

      const heading = detectHeadingLine(line, lines[i + 1]);
      if (heading) {
        flushParagraph();
        currentHeading = formatScientificText(heading);
        detectedHeadingCount++;
        continue;
      }

      const bulletMatch = line.match(/^(?:[-*•▪◦]|\d+[.)]|Step\s+\d+[:.)]?)\s+(.+)$/i);
      if (bulletMatch) {
        flushParagraph();
        const itemBody = bulletMatch[1].trim();
        const isStep = /^(?:\d+[.)]|Step\s+\d+)/i.test(line);
        if (itemBody.length >= 14 && !isMetaFillerSentence(itemBody)) {
          const fp = normalizedFingerprint(itemBody);
          if (fp && !seenExactFp.has(fp)) {
            seenExactFp.add(fp);
            const formattedText = formatScientificText(itemBody);
            const tokens = contentTokens(formattedText);
            const score = Number((scoreSentenceTfIdf(formattedText, tokens, orderCounter) * 1.08).toFixed(4));
            units.push({
              text: itemBody,
              formattedText,
              pageNumber: page.pageNumber,
              sectionHeading: currentHeading,
              orderIndex: orderCounter++,
              isBullet: true,
              isStep,
              score,
              tokens,
              quantitiesUnits: extractQuantitiesAndUnits(formattedText),
              fingerprint: fp,
            });
          }
        }
        continue;
      }

      const looksLikeStandaloneEquation =
        line.length <= 130 &&
        !/[.!?]$/.test(line) &&
        (/(?:->|<=>|<->|→|⇌)/.test(line) ||
          /^(?:[A-Z][A-Za-z0-9\s'-]{1,36}:\s*)?[A-Za-zΔαβγλμθπρσωΩ][A-Za-z0-9_₀-₉¹²³⁰-⁹'()*]*\s*[=≈∝]\s*\S+/.test(
            line
          ));
      if (looksLikeStandaloneEquation) {
        flushParagraph();
        paragraphBuf.push(line);
        flushParagraph();
        continue;
      }

      paragraphBuf.push(line);
    }

    flushParagraph();
  }

  // Fast sliding-window + token-indexed deduplication (O(N) even on 300-page PDFs)
  const dedupedUnits: AnalyzedUnit[] = [];
  const earlyPool: Array<{ fp: string; tokens: Set<string> }> = [];
  for (const unit of units) {
    const windowPool = earlyPool.length > 160 ? earlyPool.slice(-160) : earlyPool;
    if (isRedundantAgainstPool(unit.formattedText, unit.tokens, windowPool, 0.72, 0.85)) {
      continue;
    }
    dedupedUnits.push(unit);
    earlyPool.push({ fp: unit.fingerprint, tokens: unit.tokens });
  }

  // Apply graph-based TextRank centrality refinement across document units
  applyTextRankScoring(dedupedUnits);

  // Extract typed structured knowledge artifacts
  const formulas: ExtractedFormula[] = [];
  const seenFormulaExpr = new Set<string>();
  for (const unit of dedupedUnits) {
    const f = extractFormulaFromUnit(unit);
    if (!f) continue;
    const exprKey = f.expressionOrStructure.toLowerCase().replace(/\s+/g, '');
    if (seenFormulaExpr.has(exprKey)) continue;
    seenFormulaExpr.add(exprKey);
    formulas.push(f);
  }

  const definitions: ExtractedDefinition[] = [];
  const seenDefTerms = new Set<string>();
  for (const unit of [...dedupedUnits].sort((a, b) => b.score - a.score)) {
    const d = extractDefinitionFromUnit(unit);
    if (!d) continue;
    const termKey = d.term.toLowerCase();
    if (seenDefTerms.has(termKey)) continue;
    seenDefTerms.add(termKey);
    definitions.push(d);
  }

  const distinctions: ExtractedDistinction[] = [];
  for (const unit of dedupedUnits) {
    const dist = extractDistinctionFromUnit(unit);
    if (dist) distinctions.push(dist);
  }

  const processUnits = dedupedUnits.filter((u) => isProcessOrMechanismUnit(u));
  const processes: ExtractedProcess[] = [];
  if (processUnits.length >= 2) {
    const groupedByHeading = new Map<string, AnalyzedUnit[]>();
    for (const u of processUnits) {
      const h = u.sectionHeading || `${title.replace(/\s+Study Guide$/i, '')} Pathway`;
      const list = groupedByHeading.get(h) || [];
      list.push(u);
      groupedByHeading.set(h, list);
    }
    for (const [heading, group] of groupedByHeading.entries()) {
      if (group.length >= 2 || group[0]?.isStep) {
        processes.push({
          heading,
          sectionHeading: group[0]?.sectionHeading || null,
          steps: group.map((u, idx) => {
            const raw = cleanStepText(stripBoilerplatePrefix(u.formattedText));
            return {
              stepNumber: idx + 1,
              text: attachPageCitation(raw, u.pageNumber),
              rawText: raw,
              pageNumber: u.pageNumber,
            };
          }),
        });
      }
    }
  }

  const causeEffects: ExtractedCauseEffect[] = [];
  for (const unit of dedupedUnits) {
    const ce = extractCauseEffectFromUnit(unit);
    if (ce) causeEffects.push(ce);
  }

  const classifications: ExtractedClassification[] = [];
  for (const unit of dedupedUnits) {
    const cls = extractClassificationFromUnit(unit);
    if (cls) classifications.push(cls);
  }

  const structureFunctions: ExtractedStructureFunction[] = [];
  const seenSfEntities = new Set<string>();
  for (const unit of dedupedUnits) {
    const sf = extractStructureFunctionFromUnit(unit);
    if (!sf) continue;
    const key = `${sf.entity.toLowerCase()}:${sf.verb.toLowerCase()}`;
    if (seenSfEntities.has(key)) continue;
    seenSfEntities.add(key);
    structureFunctions.push(sf);
  }

  const examples: ExtractedExample[] = [];
  for (const unit of dedupedUnits) {
    const ex = extractExampleFromUnit(unit);
    if (ex) examples.push(ex);
  }

  // Group units into document sections (by heading or page/keyword cluster)
  const sectionsMap = new Map<string, AnalyzedUnit[]>();
  for (const u of dedupedUnits) {
    const key =
      u.sectionHeading ||
      (u.pageNumber !== null ? `Page ${u.pageNumber}` : 'Core Content');
    const list = sectionsMap.get(key) || [];
    list.push(u);
    sectionsMap.set(key, list);
  }

  const sections: DocumentSectionCluster[] = Array.from(sectionsMap.entries()).map(
    ([heading, secUnits]) => ({
      heading: heading === 'Core Content' && secUnits.length > 0 ? buildClusterHeading(secUnits, 0) : heading,
      pageNumbers: Array.from(
        new Set(secUnits.map((u) => u.pageNumber).filter((p): p is number => p !== null))
      ).sort((a, b) => a - b),
      units: secUnits,
      salience: secUnits.reduce((acc, u) => acc + u.score, 0) / Math.max(1, secUnits.length),
    })
  );

  const sectionRelationships = detectSectionRelationships(sections);
  const difficultConcepts = extractDifficultConcepts(dedupedUnits, definitions, formulas);

  // Key terminology & phrases
  const termCandidates = new Set<string>();
  for (const d of definitions) {
    if (d.term.length >= 2 && d.term.length <= 36) termCandidates.add(d.term);
  }
  for (const sf of structureFunctions) {
    if (sf.entity.length >= 2 && sf.entity.length <= 36) termCandidates.add(sf.entity);
  }
  const techAcronyms =
    normalized.match(/\b(?:[A-Z]{2,6}2?|[A-Z][a-z]+[A-Z][A-Za-z]+|pH|pKa)\b/g) || [];
  for (const ac of techAcronyms) {
    if (!['PDF', 'PAGE', 'UNIT', 'STEP', 'NOTE'].includes(ac.toUpperCase())) {
      termCandidates.add(formatScientificText(ac));
    }
  }
  const docKeywords = extractKeywords(normalized, 20);
  for (const kw of docKeywords) {
    if (ACADEMIC_STOP_WORDS.has(kw) || kw.length < 3) continue;
    const formattedKw = kw.charAt(0).toUpperCase() + kw.slice(1);
    const alreadyCovered = Array.from(termCandidates).some(
      (existing) => existing.toLowerCase() === kw.toLowerCase()
    );
    if (!alreadyCovered) {
      termCandidates.add(formatScientificText(formattedKw));
    }
  }

  const numberedPages = rawPages.filter((p) => p.pageNumber !== null).length;
  const alphaRatio = wordCount > 0 ? alphaWordCount / wordCount : 0;
  const isBrief = wordCount < 45 || dedupedUnits.length <= 2;
  const lowClarity = wordCount >= 10 && alphaRatio < 0.42;
  const clarityScore = Math.max(0, Math.min(1, Number((alphaRatio * 1.15).toFixed(2))));

  const profile: DocumentIntelligenceProfile = {
    contentHash,
    title,
    subjectArea: resolvedSubject,
    normalizedText: normalized,
    chunks,
    units: dedupedUnits,
    sections,
    sectionRelationships,
    difficultConcepts,
    definitions,
    formulas,
    processes,
    distinctions,
    causeEffects,
    classifications,
    structureFunctions,
    examples,
    keyTerminology: Array.from(termCandidates).slice(0, 20),
    keyPhrases: extractKeyPhrases(normalized, 14),
    quality: {
      wordCount,
      alphaWordCount,
      sentenceCount: dedupedUnits.length,
      pageCount: numberedPages > 0 ? numberedPages : rawPages.length,
      hasStructuredHeadings: detectedHeadingCount > 0,
      clarityScore,
      isBrief,
      lowClarity,
    },
    globalTermFreq,
  };

  setBoundedCacheEntry(intelligenceProfileCache, contentHash, profile, MAX_PROFILE_CACHE_ENTRIES);
  return profile;
}

/**
 * Extracts compact structured intelligence highlights (matching definitions, formulas,
 * or distinctions) for a RAG query from the retrieved documents so AI Chat / AI Tutor
 * receive high-density academic structure within strict token budgets.
 */
export function extractMatchingStructuredHighlights(
  docs: IndexedDocumentRecord[],
  query: string,
  maxItems = 3
): string[] {
  const qTokens = contentTokens(query);
  if (qTokens.size === 0 || docs.length === 0) return [];

  const scored: Array<{ score: number; line: string }> = [];

  for (const doc of docs) {
    const profile = analyzeDocumentIntelligence(doc.extractedText, { title: doc.title });

    for (const def of profile.definitions) {
      const overlap = tokenSimilarity(qTokens, contentTokens(`${def.term} ${def.rawDefinition}`));
      if (overlap.containment >= 0.25 || Array.from(qTokens).some((t) => def.term.toLowerCase().includes(t))) {
        scored.push({
          score: overlap.containment * 2 + 1,
          line: `Definition [${doc.title}${def.pageNumber ? `, Page ${def.pageNumber}` : ''}]: ${def.term} — ${def.rawDefinition}`,
        });
      }
    }

    for (const f of profile.formulas) {
      const overlap = tokenSimilarity(qTokens, contentTokens(`${f.name} ${f.rawUsage} ${f.expressionOrStructure}`));
      if (overlap.containment >= 0.22) {
        const varText =
          f.variables.length > 0
            ? ` (${f.variables.map((v) => `${v.symbol}: ${v.meaning}`).join('; ')})`
            : '';
        scored.push({
          score: overlap.containment * 2 + 1.1,
          line: `Formula [${doc.title}${f.pageNumber ? `, Page ${f.pageNumber}` : ''}]: ${f.name}: ${f.expressionOrStructure}${varText}`,
        });
      }
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((item) => item.line);
}

export function buildSectionClusterHeading(units: AnalyzedUnit[], fallbackIdx: number): string {
  return buildClusterHeading(units, fallbackIdx);
}
