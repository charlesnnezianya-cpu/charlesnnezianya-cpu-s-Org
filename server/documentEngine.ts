import crypto from 'crypto';
import { formatScientificText } from '../src/lib/scientificFormatter.ts';
import type { ExtractedDocumentSection, FormulaVariableNote } from '../src/types/brainstine.ts';

export interface DocumentChunk {
  documentId: string;
  userId: string;
  pageNumber: number | null;
  sectionHeading?: string | null;
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
  subheading: string | null;
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

export interface ExtractedClassificationType {
  name: string;
  explanation: string;
  characteristics: string[];
  examples: string[];
  pageNumber: number | null;
}

export interface ExtractedClassification {
  category: string;
  members: string[];
  statement: string;
  overviewStatement: string;
  types: ExtractedClassificationType[];
  comparisonNote?: string;
  sourceFingerprints: string[];
  sectionHeading: string | null;
  pageNumber: number | null;
  salience: number;
}

export interface ExtractedCharacteristic {
  topic: string;
  statement: string;
  sectionHeading: string | null;
  pageNumber: number | null;
  salience: number;
  sourceText: string;
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
  characteristics: ExtractedCharacteristic[];
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
  {
    subject: 'Psychology',
    terms: [
      'cognition', 'cognitive', 'memory', 'conditioning', 'reinforcement', 'behaviorism',
      'perception', 'attention', 'neurotransmitter', 'dopamine', 'serotonin', 'hippocampus',
      'amygdala', 'synaptic', 'schema', 'heuristics', 'developmental', 'personality',
    ],
    peerTerms: [
      'Operant conditioning', 'Classical conditioning', 'Working memory', 'Long-term potentiation',
      'Cognitive dissonance', 'Confirmation bias', 'Episodic memory', 'Sensory register',
    ],
  },
  {
    subject: 'Medicine & Anatomy',
    terms: [
      'cardiac', 'ventricle', 'atrium', 'aorta', 'nephron', 'glomerulus', 'alveoli',
      'hemoglobin', 'pathology', 'etiology', 'diagnosis', 'homeostasis', 'hormone',
      'endocrine', 'immune', 'antibody', 'antigen', 'inflammation', 'vascular', 'artery',
    ],
    peerTerms: [
      'Stroke volume', 'Cardiac output', 'Glomerular filtration', 'Adaptive immunity',
      'Negative feedback', 'Baroreceptor reflex', 'Gas exchange', 'Renin-angiotensin system',
    ],
  },
  {
    subject: 'History & Governance',
    terms: [
      'sovereignty', 'constitution', 'empire', 'revolution', 'treaty', 'democracy',
      'parliament', 'federalism', 'republic', 'legislation', 'colonial', 'industrialization',
      'feudalism', 'renaissance', 'diplomacy', 'statute', 'jurisdiction', 'amendment',
    ],
    peerTerms: [
      'Separation of powers', 'Constitutional monarchy', 'Social contract', 'Judicial review',
      'Balance of power', 'Mercantilism', 'Popular sovereignty', 'Federal republic',
    ],
  },
  {
    subject: 'Accounting & Finance',
    terms: [
      'liability', 'equity', 'asset', 'depreciation', 'amortization', 'dividend',
      'revenue', 'solvency', 'liquidity', 'valuation', 'balance sheet', 'cash flow',
      'compound interest', 'portfolio', 'arbitrage', 'bond', 'yield', 'accrual',
    ],
    peerTerms: [
      'Present value', 'Working capital', 'Return on equity', 'Debt-to-equity ratio',
      'Accrual accounting', 'Systematic risk', 'Weighted average cost of capital', 'Operating margin',
    ],
  },
  {
    subject: 'Financial Markets & Forex Trading',
    terms: [
      'forex', 'foreign exchange', 'currency pair', 'candlestick', 'candlesticks',
      'ohlc', 'pip', 'pips', 'bid', 'ask', 'spread', 'leverage', 'lot size',
      'stop loss', 'take profit', 'price action', 'chart pattern', 'trendline',
      'moving average', 'ema', 'sma', 'rsi', 'macd', 'bollinger', 'fibonacci',
      'retracement', 'breakout', 'doji', 'engulfing', 'pin bar', 'hammer',
      'shooting star', 'head and shoulders', 'double top', 'double bottom',
      'bullish', 'bearish', 'exchange rate', 'base currency', 'quote currency',
      'timeframe', 'swing trading', 'scalping', 'day trading', 'order block',
      'support and resistance', 'eur/usd', 'gbp/usd', 'usd/jpy', 'margin call',
      'technical analysis', 'fundamental analysis', 'wick', 'shadow',
    ],
    peerTerms: [
      'Support and resistance', 'Candlestick anatomy', 'Risk-to-reward ratio',
      'Moving average crossover', 'Trendline breakout', 'Fibonacci retracement',
      'Base and quote currency', 'Stop-loss placement',
    ],
  },
  {
    subject: 'Law & Legal Studies',
    terms: [
      'tort', 'contract', 'plaintiff', 'defendant', 'jurisdiction', 'precedent',
      'stare decisis', 'negligence', 'liability', 'indictment', 'verdict',
      'statute', 'injunction', 'consideration', 'fiduciary', 'appellate',
    ],
    peerTerms: [
      'Breach of duty', 'Strict liability', 'Judicial precedent', 'Consideration in contracts',
      'Due process', 'Statutory interpretation',
    ],
  },
  {
    subject: 'Engineering & Applied Systems',
    terms: [
      'structural load', 'beam', 'stress', 'strain', 'shear', 'bending moment',
      'control system', 'feedback loop', 'pid controller', 'signal processing',
      'thermodynamic cycle', 'fluid mechanics', 'bernoulli', 'reynolds number',
    ],
    peerTerms: [
      'Shear force diagram', 'Stress-strain curve', 'PID control', 'Laminar flow',
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
    // Common UTF-8 / Windows-1252 PDF mojibake cleanup
    .replace(/â€¢/g, '- ')
    .replace(/â€“/g, '–')
    .replace(/â€”/g, '—')
    .replace(/â€™|â€˜/g, "'")
    .replace(/â€œ|â€\x9D/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Convert PDF Private Use Area bullets (Wingdings/Symbol) & square/dingbat bullet glyphs to clean list markers
    .replace(/(^|\n)[ \t]*[\uE000-\uF8FF\u25A0-\u25FF\u2700-\u27BF\uFFFD\u2022\u2023\u2043]+[ \t]*/g, '$1- ')
    // Strip remaining unsupported inline Private Use Area, empty-box tofu, replacement & zero-width glyphs
    .replace(/[\uE000-\uF8FF\uFFFD\u25A0-\u25FF\u2700-\u27BF]/g, ' ')
    .replace(/[\u200B-\u200F\uFEFF\u2028\u2029]/g, '')
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
 * Chunks document text with controlled character length, section heading tracking,
 * and paragraph/sentence overlap. Preserves page references if '[Page N]' markers exist.
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

  const normalizedMarkers = normalized
    .replace(/(^|\n)(?:[-=]{2,})\s*(?:Pages?|Slide)\s+(\d+)\s*(?:[-=]{2,})[ \t]*/gi, '$1[Page $2]\n')
    .replace(/(^|\n)Page\s+(\d+)\s*:\s*/gi, '$1[Page $2]\n');
  const pageSegments = normalizedMarkers.split(/(?=\[Page\s+\d+\])/i);
  const chunks: DocumentChunk[] = [];
  let chunkPosition = 0;
  let activeHeading: string | null = null;

  for (const seg of pageSegments) {
    const pageMatch = seg.match(/^\[Page\s+(\d+)\]/i);
    const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : null;
    const cleanSeg = pageMatch ? seg.replace(/^\[Page\s+\d+\]/i, '').trim() : seg.trim();

    if (!cleanSeg) continue;

    // Preserve line structure to identify headings inside each page before grouping paragraphs
    const rawBlocks = cleanSeg.split(/\n{2,}/);
    const structuredParagraphs: Array<{ text: string; heading: string | null; startsNewSection: boolean }> = [];

    for (const rawBlock of rawBlocks) {
      const lines = rawBlock
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) continue;

      let bufLines: string[] = [];
      let blockStartsNewSection = false;

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const nextLine = lines[li + 1];
        const headingInfo = detectHeadingInfo(line, nextLine);
        if (headingInfo) {
          if (bufLines.length > 0) {
            structuredParagraphs.push({
              text: bufLines.join(' ').trim(),
              heading: activeHeading,
              startsNewSection: blockStartsNewSection,
            });
            bufLines = [];
            blockStartsNewSection = false;
          }
          activeHeading = headingInfo.title;
          blockStartsNewSection = true;
          bufLines.push(line);
        } else {
          bufLines.push(line);
        }
      }

      if (bufLines.length > 0) {
        structuredParagraphs.push({
          text: bufLines.join(' ').trim(),
          heading: activeHeading,
          startsNewSection: blockStartsNewSection,
        });
      }
    }

    let currentBuffer = '';
    let currentHeading: string | null = activeHeading;

    const pushBuffer = (buf: string, heading: string | null) => {
      const trimmed = buf.trim();
      if (trimmed.length >= 15) {
        const kwText = heading ? `${heading} ${trimmed}` : trimmed;
        chunks.push({
          documentId,
          userId,
          pageNumber,
          sectionHeading: heading,
          chunkPosition: chunkPosition++,
          originalText: trimmed,
          keywords: extractKeywords(kwText, 10),
        });
      }
    };

    for (const para of structuredParagraphs) {
      // Flush cleanly on a major heading transition once the current chunk has decent substance
      if (
        para.startsNewSection &&
        currentBuffer.length >= 260 &&
        currentHeading !== para.heading
      ) {
        pushBuffer(currentBuffer, currentHeading);
        currentBuffer = para.text;
        currentHeading = para.heading;
        continue;
      }

      if (!currentBuffer) {
        currentHeading = para.heading;
      }

      if (currentBuffer.length + para.text.length + 2 <= maxChunkChars) {
        currentBuffer = currentBuffer ? `${currentBuffer}\n\n${para.text}` : para.text;
      } else {
        if (currentBuffer) {
          pushBuffer(currentBuffer, currentHeading);
          const tail = currentBuffer.slice(-overlapChars).trim();
          currentHeading = para.heading;
          currentBuffer = tail && !para.startsNewSection ? `${tail}\n\n${para.text}` : para.text;
        } else {
          let start = 0;
          while (start < para.text.length) {
            const end = Math.min(start + maxChunkChars, para.text.length);
            const sub = para.text.slice(start, end).trim();
            pushBuffer(sub, para.heading);
            if (end >= para.text.length) break;
            start = Math.max(0, end - overlapChars);
          }
          currentBuffer = '';
        }
      }
    }

    if (currentBuffer) {
      pushBuffer(currentBuffer, currentHeading);
    }
  }

  if (chunks.length === 0 && normalized.length > 0) {
    chunks.push({
      documentId,
      userId,
      pageNumber: null,
      sectionHeading: null,
      chunkPosition: 0,
      originalText: normalized.slice(0, maxChunkChars),
      keywords: extractKeywords(normalized, 10),
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

export interface RetrievalOptions {
  expandedTerms?: string[];
}

/**
 * Enhanced hybrid BM25 / TF-IDF + section-heading + structural intent passage retrieval
 * with query term expansion support and strict per-user/per-document authorization isolation.
 */
export function retrieveRelevantPassages(
  question: string,
  chunks: DocumentChunk[],
  authUserId: string,
  targetDocumentId?: string,
  topK = 3,
  options?: RetrievalOptions
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

  const expandedTermsSet = new Set<string>();
  if (Array.isArray(options?.expandedTerms)) {
    for (const rawExp of options.expandedTerms) {
      const cleanExp = rawExp.toLowerCase().trim();
      if (cleanExp.length >= 3 && !STOP_WORDS.has(cleanExp) && !qTermsSet.has(cleanExp)) {
        expandedTermsSet.add(cleanExp);
      }
    }
  }

  const qTerms = Array.from(qTermsSet);
  const expandedTerms = Array.from(expandedTermsSet).slice(0, 14);
  if (qTerms.length === 0 && expandedTerms.length === 0) return [];

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
  const lowerHeadings = eligibleChunks.map((c) => (c.sectionHeading || '').toLowerCase());
  const docLengths = lowerTexts.map((t) => Math.max(1, t.split(/\s+/).length));
  const avgDocLen =
    docLengths.reduce((sum, len) => sum + len, 0) / Math.max(1, docLengths.length);

  for (const term of [...qTerms, ...expandedTerms]) {
    const stem = lightStem(term);
    let df = 0;
    for (let i = 0; i < eligibleChunks.length; i++) {
      const chunk = eligibleChunks[i];
      const textLower = lowerTexts[i];
      const headingLower = lowerHeadings[i];
      if (
        chunk.keywords.includes(term) ||
        textLower.includes(term) ||
        (headingLower && headingLower.includes(term)) ||
        (stem.length >= 5 && textLower.includes(stem))
      ) {
        df++;
      }
    }
    termDf.set(term, df);
  }

  const wantsFormulaOrDef = /\b(formula|equation|law|defined as|definition|refers to|what is)\b/i.test(cleanQ);
  const wantsClassification = /\b(types?|categories|kinds|forms|classes|classification|classified into)\b/i.test(cleanQ);
  const wantsProcess = /\b(steps?|stages?|phases?|process|mechanism|how does|pathway|sequence|procedure)\b/i.test(cleanQ);
  const wantsComparison = /\b(compare|contrast|difference|differences|versus|vs|distinguish|unlike|similarities)\b/i.test(cleanQ);
  const wantsExamplesOrProps = /\b(examples?|for instance|characteristics?|properties|features|advantages?|disadvantages?)\b/i.test(cleanQ);

  const k1 = 1.5;
  const b = 0.55;
  const results: RetrievalResult[] = [];

  for (let i = 0; i < eligibleChunks.length; i++) {
    const chunk = eligibleChunks[i];
    const chunkTextLower = lowerTexts[i];
    const headingLower = lowerHeadings[i];
    const dlNorm = 1 - b + b * (docLengths[i] / Math.max(1, avgDocLen));
    const matchedKeywords: string[] = [];
    const distinctPrimaryMatches = new Set<string>();
    let matchScore = 0;

    for (const term of qTerms) {
      const df = termDf.get(term) || 0;
      if (df === 0) continue;

      const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
      const wordRegex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g');
      const exactMatches = chunkTextLower.match(wordRegex);
      const tf = exactMatches ? exactMatches.length : 0;
      const bm25Tf = tf > 0 ? (tf * (k1 + 1)) / (tf + k1 * dlNorm) : 0;

      if (headingLower && wordRegex.test(headingLower)) {
        matchScore += 1.65 * Math.max(0.6, idf);
        distinctPrimaryMatches.add(term);
        matchedKeywords.push(term);
      }

      if (chunk.keywords.includes(term)) {
        const effectiveTf = tf > 0 ? bm25Tf : 1.0;
        matchScore += (2.5 + effectiveTf) * idf;
        distinctPrimaryMatches.add(term);
        matchedKeywords.push(term);
      } else if (tf > 0) {
        matchScore += 1.55 * bm25Tf * idf;
        distinctPrimaryMatches.add(term);
        matchedKeywords.push(term);
      } else {
        const stem = lightStem(term);
        if (stem.length >= 5 && chunkTextLower.includes(stem)) {
          matchScore += 0.95 * idf;
          distinctPrimaryMatches.add(term);
          matchedKeywords.push(term);
        }
      }
    }

    // Weighted semantic/domain expansion matches (never matches alone without primary signal or strong multi-term evidence)
    let expansionScore = 0;
    let expansionHits = 0;
    for (const expTerm of expandedTerms) {
      const df = termDf.get(expTerm) || 0;
      if (df === 0) continue;
      const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
      const wordRegex = new RegExp(`\\b${escapeRegExp(expTerm)}\\b`);
      if (headingLower && wordRegex.test(headingLower)) {
        expansionScore += 0.95 * Math.max(0.5, idf);
        expansionHits++;
        matchedKeywords.push(expTerm);
      } else if (wordRegex.test(chunkTextLower)) {
        expansionScore += 0.72 * idf;
        expansionHits++;
        matchedKeywords.push(expTerm);
      }
    }
    if (distinctPrimaryMatches.size > 0 || expansionHits >= 2) {
      matchScore += Math.min(3.5, expansionScore);
    }

    for (const bigram of queryBigrams) {
      if (chunkTextLower.includes(bigram) || headingLower.includes(bigram)) {
        matchScore += 1.85;
      }
    }

    for (const trigram of queryTrigrams) {
      if (chunkTextLower.includes(trigram) || headingLower.includes(trigram)) {
        matchScore += 2.1;
      }
    }

    if (cleanQ.length >= 6 && chunkTextLower.includes(cleanQ)) {
      matchScore += 4.5;
    }

    // Coverage bonus: passages matching multiple distinct primary concepts rank higher than single-word repetition
    if (distinctPrimaryMatches.size >= 2) {
      matchScore += Math.min(2.4, (distinctPrimaryMatches.size - 1) * 0.65);
    }

    // Structural intent alignment cues
    if (
      wantsFormulaOrDef &&
      (/[=→⇌]/.test(chunk.originalText) || /\b(is defined as|refers to|means|defined as)\b/i.test(chunk.originalText))
    ) {
      matchScore += 0.75;
    }
    if (
      wantsClassification &&
      /\b(types?|categories|classes|classified into|kinds|forms|consists of|divided into)\b/i.test(chunk.originalText)
    ) {
      matchScore += 0.8;
    }
    if (
      wantsProcess &&
      (/\b(step\s*\d+|first|second|next|finally|stage|phase|followed by)\b/i.test(chunk.originalText) ||
        /(?:^|\n)\s*\d+[.)]\s+/m.test(chunk.originalText))
    ) {
      matchScore += 0.7;
    }
    if (
      wantsComparison &&
      /\b(whereas|unlike|while|in contrast|compared to|difference|similarly|both)\b/i.test(chunk.originalText)
    ) {
      matchScore += 0.7;
    }
    if (
      wantsExamplesOrProps &&
      /\b(for example|for instance|such as|characteristic|property|properties|feature|features|advantage)\b/i.test(
        chunk.originalText
      )
    ) {
      matchScore += 0.65;
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

const AMBIGUOUS_DOMAIN_TERMS = new Set([
  'resistance', 'momentum', 'potential', 'power', 'current', 'wave',
  'base', 'acid', 'cell', 'heart', 'market', 'bond', 'work', 'energy',
  'trend', 'volume', 'frequency', 'margin', 'rate', 'order', 'action',
  'level', 'range', 'ratio', 'yield', 'equity', 'capital', 'circulation',
  'hammer', 'shadow', 'liquidity', 'investment', 'interest',
]);

export function inferSubjectArea(
  title: string,
  text: string,
  requestedSubject = ''
): string {
  const cleanRequested = (requestedSubject || '').trim();
  if (cleanRequested && cleanRequested.toLowerCase() !== 'general studies') {
    return cleanRequested;
  }

  const lowerTitle = (title || '').toLowerCase();
  const combined = `${lowerTitle} ${text}`.toLowerCase();
  let bestSubject = cleanRequested || 'General Studies';
  let bestScore = 0;

  for (const entry of SUBJECT_LEXICONS) {
    let score = 0;
    let unambiguousHits = 0;
    for (const term of entry.terms) {
      const escaped = escapeRegExp(term);
      const regex = new RegExp(`\\b${escaped}\\b`, 'g');
      const matches = combined.match(regex);
      if (!matches) continue;

      const isMultiWord = term.includes(' ') || term.includes('/');
      const isAmbiguous = !isMultiWord && AMBIGUOUS_DOMAIN_TERMS.has(term);
      const titleHit = new RegExp(`\\b${escaped}\\b`).test(lowerTitle);

      if (isAmbiguous) {
        score += Math.min(1.4, matches.length * 0.7);
      } else {
        unambiguousHits += 1;
        const unitWeight = isMultiWord ? 2.4 : 1.4;
        score += Math.min(4.5, matches.length * unitWeight) + (titleHit ? 3 : 0);
      }
    }

    if ((unambiguousHits >= 1 || score >= 5) && score > bestScore) {
      bestScore = score;
      bestSubject = entry.subject;
    }
  }

  return bestScore >= 3.5 ? bestSubject : cleanRequested || 'General Studies';
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
    /^(?:this (?:document|chapter|section|lecture|guide|paper|text|module|unit) (?:discusses|covers|introduces|explains|presents|outlines|focuses on)|in this (?:chapter|section|lesson|unit|module|lecture),?\s+(?:we\s+(?:will|shall)?|you\s+will)?\s*(?:learn|explore|study|cover|discuss|examine)|by the end of this (?:chapter|section|lesson|unit|module|lecture),?\s+(?:you|students)\s+(?:will|should)|learning objectives?\s*:|course\s+(?:code|title|syllabus|outline)\s*:|instructor\s*:|lecturer\s*:|professor\s*:|office hours?\s*:|recommended reading\s*:|bibliography\s*:|welcome to|read the following|see figure|refer to (?:table|figure)|table of contents|page \d+ of \d+|all rights reserved|copyright|isbn\s*[:\d-]|doi\s*:)/i.test(
      lower
    )
  ) {
    return true;
  }
  if (/^https?:\/\/\S+$/i.test(lower)) return true;
  return false;
}

export function isCodeOrSyntaxLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (
    /^(?:import\s+[A-Za-z0-9_.*]+|from\s+[A-Za-z0-9_.]+\s+import\s+|def\s+[A-Za-z0-9_]+\s*\(|async\s+def\s+|class\s+[A-Za-z0-9_]+\s*[(:]|#include\s*<|using\s+namespace\s+|public\s+(?:static|class)\s+|pip\s+install\s+|npm\s+install\s+|console\.log\(|System\.out\.print|printf\s*\(|return\s+[A-Za-z0-9_[\]{}().,+\-*/\s]+;?$)/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^[{}[\];]+$/.test(t)) return true;
  if (/^(?:if|elif|else|for|while|try|except|finally|with|switch|case)\b[^.?!]{0,80}:\s*$/i.test(t) && /[=()[\]_]/.test(t)) {
    return true;
  }
  // High code-syntax density (e.g. dot chains + snake_case + parens/brackets, no natural prose)
  const syntaxTokens = (t.match(/[A-Za-z_]+\.[A-Za-z_]+\(|_[a-z]+_|::|==|!=|<=|>=|\*\*/g) || []).length;
  if (syntaxTokens >= 2 && t.split(/\s+/).length <= 14 && !/\b(?:is|are|refers|means|because|whereas)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function detectHeadingInfo(
  line: string,
  nextLine?: string
): { title: string; level: 1 | 2 } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 90) return null;
  if (isCodeOrSyntaxLine(trimmed)) return null;

  const mdMatch = trimmed.match(/^(#{1,4})\s+(.+?)\s*#*$/);
  if (mdMatch) {
    return {
      title: mdMatch[2].replace(/:$/, '').trim(),
      level: mdMatch[1].length >= 2 ? 2 : 1,
    };
  }

  const subSecMatch = trimmed.match(/^(\d+(?:\.\d+)+[.)]?)\s+([A-Z][^\n]{2,72})$/);
  if (subSecMatch && !/[.!?]$/.test(trimmed)) {
    return { title: subSecMatch[2].replace(/:$/, '').trim(), level: 2 };
  }

  const secMatch = trimmed.match(
    /^(?:(?:chapter|section|unit|module|part|topic)\s+\d+(?:\.\d+)*[:.\s-]+|[IVX]+\.\s+)([A-Z][^\n]{2,72})$/i
  );
  if (secMatch && !/[.!?]$/.test(trimmed)) {
    return { title: secMatch[1].replace(/:$/, '').trim(), level: 1 };
  }

  const simpleNumMatch = trimmed.match(/^\d+[.)]\s+([A-Z][A-Za-z0-9\s,&/()-]{2,64})$/);
  if (
    simpleNumMatch &&
    !/\b(?:is|are|was|were|has|have|had|convert|produces|occurs|means|refers|includes?|consists?)\b/i.test(
      simpleNumMatch[1]
    ) &&
    simpleNumMatch[1].split(/\s+/).length <= 8
  ) {
    return { title: simpleNumMatch[1].replace(/:$/, '').trim(), level: 1 };
  }

  // ALL-CAPS academic section headings (2 to 8 words, no sentence punctuation)
  if (
    /^[A-Z0-9][A-Z0-9\s,&/:()-]{4,64}$/.test(trimmed) &&
    /[A-Z]{2,}/.test(trimmed) &&
    !/[a-z]/.test(trimmed) &&
    !/[.!?;=]$/.test(trimmed) &&
    trimmed.split(/\s+/).length >= 2 &&
    trimmed.split(/\s+/).length <= 8
  ) {
    const titleCased = trimmed
      .toLowerCase()
      .replace(/\b([a-z])/g, (_, ch: string) => ch.toUpperCase());
    return { title: titleCased.replace(/:$/, '').trim(), level: 1 };
  }

  if (
    /^[A-Z][A-Za-z0-9\s,&/()-]{3,55}:$/.test(trimmed) &&
    nextLine &&
    nextLine.trim().length > 0
  ) {
    const candidate = trimmed.slice(0, -1).trim();
    if (
      !/^(?:note|example|formula|equation|reaction|warning|tip|page|step\s*\d+|figure\s*\d+|table\s*\d+)$/i.test(
        candidate
      )
    ) {
      return { title: candidate, level: 2 };
    }
  }

  if (
    nextLine &&
    nextLine.trim().length > trimmed.length &&
    trimmed.length >= 4 &&
    trimmed.length <= 64 &&
    !/[.!?,;=→⇌]$/.test(trimmed) &&
    !/^[-*•]/.test(trimmed)
  ) {
    const words = trimmed.split(/\s+/);
    if (words.length >= 1 && words.length <= 8) {
      const capWords = words.filter((w) => /^[A-Z0-9(]/.test(w)).length;
      if (
        capWords >= Math.ceil(words.length * 0.65) &&
        !/\b(?:is|are|was|were|will|can|has|have|does|do)\b/.test(trimmed)
      ) {
        return { title: trimmed, level: 1 };
      }
    }
  }

  return null;
}

export function detectHeadingLine(line: string, nextLine?: string): string | null {
  return detectHeadingInfo(line, nextLine)?.title ?? null;
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
  const normalizedMarkers = normalized
    .replace(/(^|\n)(?:[-=]{2,})\s*(?:Pages?|Slide)\s+(\d+)\s*(?:[-=]{2,})[ \t]*/gi, '$1[Page $2]\n')
    .replace(/(^|\n)Page\s+(\d+)\s*:\s*/gi, '$1[Page $2]\n');

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

function cleanMemberLabel(raw: string): string {
  return raw
    .replace(/^(?:such as|including|namely|e\.g\.|for example|firstly|secondly|thirdly|\d+[.)]|[-*])\s+/i, '')
    .replace(/[.?!:;]+$/, '')
    .trim();
}

function splitMemberList(rawList: string): string[] {
  return rawList
    .split(/,\s*(?:and\s+|or\s+)?|\s+and\s+|\s*;\s*/i)
    .map((m) => cleanMemberLabel(m))
    .filter((m) => m.length >= 2 && m.length <= 55 && !/^(?:etc|and so on|others|more)$/i.test(m));
}

function extractClassificationFromUnit(unit: AnalyzedUnit): ExtractedClassification | null {
  let text = stripBoilerplatePrefix(unit.formattedText);
  if (text.length < 24 || text.length > 340) return null;

  // Strip optional leading label such as "Types of Memory Models: There are..." without stripping "There are two main types of X: ..."
  if (
    !/^(?:there\s+(?:are|is)\b|the\s+(?:\d+|two|three|four|five|six)?\s*(?:main|primary|major|basic|common|key)?\s*(?:types|classes|categories|forms|groups|kinds)\s+of\b)/i.test(
      text
    )
  ) {
    text = text
      .replace(/^[A-Z][A-Za-z0-9\s'-]{2,48}:\s+(?=(?:There|The|Two|Three|Four|Five|Six)\b)/i, '')
      .trim();
  }

  const patterns: Array<{ regex: RegExp; categoryIdx: number; membersIdx: number }> = [
    // "There are two main types of problems: well-defined problems and ill-defined problems."
    {
      regex:
        /^(?:there\s+(?:are|is)\s+(?:several|many|\d+|two|three|four|five|six)?\s*(?:main|primary|major|basic|common|key|distinct)?\s*(?:types|kinds|categories|classes|forms|groups|levels|models|approaches|methods)\s+of\s+)([A-Za-z0-9\s'-]{3,48}?)(?:\s*:\s*|\s+(?:which\s+are|namely|including|are)\s+)(.{8,170}?)[.?!]?$/i,
      categoryIdx: 1,
      membersIdx: 2,
    },
    // "The two primary categories of memory are short-term memory and long-term memory."
    {
      regex:
        /^(?:the\s+)?(?:\d+|two|three|four|five|six)?\s*(?:main|primary|major|basic|common|key)?\s*(?:types|classes|categories|forms|groups|kinds)\s+of\s+([A-Za-z0-9\s'-]{3,48}?)\s+(?:include|are|consist of)\s+(.{8,170}?)[.?!]?$/i,
      categoryIdx: 1,
      membersIdx: 2,
    },
    // "Problem solving is classified/divided/grouped into two types: A and B" or "... into A and B"
    {
      regex:
        /^([A-Z][A-Za-z0-9\s'-]{3,48}?)\s+(?:is|are|can be)\s+(?:broadly\s+)?(?:classified|divided|grouped|categorized|split)\s+into\s+(?:(?:\d+|two|three|four|five|six)\s+(?:main\s+)?(?:types|classes|categories|forms|groups)\s*:\s*)?(.{8,170}?)[.?!]?$/i,
      categoryIdx: 1,
      membersIdx: 2,
    },
  ];

  for (const pat of patterns) {
    const match = text.match(pat.regex);
    if (!match) continue;
    const category = match[pat.categoryIdx].trim();
    const members = splitMemberList(match[pat.membersIdx]).map((m) =>
      m.charAt(0).toUpperCase() + m.slice(1)
    );
    if (members.length >= 2) {
      return {
        category,
        members,
        statement: text,
        overviewStatement: attachPageCitation(text, unit.pageNumber),
        types: [],
        sourceFingerprints: [unit.fingerprint],
        sectionHeading: unit.sectionHeading,
        pageNumber: unit.pageNumber,
        salience: unit.score,
      };
    }
  }

  return null;
}

function isCharacteristicUnit(unit: AnalyzedUnit): boolean {
  const text = unit.formattedText;
  const heading = (unit.sectionHeading || unit.subheading || '').toLowerCase();
  if (/\b(?:characteristics?|properties|features|attributes|traits|advantages|disadvantages|limitations)\b/i.test(heading)) {
    return true;
  }
  return /\b(?:characteristics?\s+(?:of|include)|characterized\s+by|key\s+features?\s+(?:of|include)|properties\s+(?:of|include)|typically\s+(?:exhibits?|displays?|possesses?|has|have)|distinctive\s+feature|essential\s+property|advantages?\s+(?:of|include)|limitations?\s+(?:of|include))\b/i.test(
    text
  );
}

function buildDetailedClassifications(
  units: AnalyzedUnit[],
  distinctions: ExtractedDistinction[]
): ExtractedClassification[] {
  const classifications: ExtractedClassification[] = [];
  const seenCategories = new Set<string>();

  // 1. Seed from explicit classification intro sentences
  const unitClassSeeds: Array<{ cls: ExtractedClassification; seedOrder: number }> = [];
  for (const u of units) {
    const cls = extractClassificationFromUnit(u);
    if (!cls) continue;
    const key = cls.category.toLowerCase();
    if (seenCategories.has(key)) continue;
    seenCategories.add(key);
    unitClassSeeds.push({ cls, seedOrder: u.orderIndex });
  }

  // 2. Detect heading-based classifications ("Types of X" / "Categories of Y") with numbered/headed child items
  const headingGroups = new Map<string, AnalyzedUnit[]>();
  for (const u of units) {
    const h = u.sectionHeading || '';
    if (!h) continue;
    const arr = headingGroups.get(h) || [];
    arr.push(u);
    headingGroups.set(h, arr);
  }

  for (const [heading, secUnits] of headingGroups.entries()) {
    const typeHeadingMatch = heading.match(
      /^(?:types|categories|classes|forms|kinds)\s+of\s+(.{3,48})$/i
    );
    if (!typeHeadingMatch) continue;
    const catName = typeHeadingMatch[1].trim();
    if (seenCategories.has(catName.toLowerCase())) continue;

    // Look for subheadings or colon-led items under this heading
    const memberNames: string[] = [];
    const seenM = new Set<string>();
    for (const su of secUnits) {
      if (su.subheading && !seenM.has(su.subheading.toLowerCase())) {
        seenM.add(su.subheading.toLowerCase());
        memberNames.push(su.subheading);
      } else {
        const itemLead = su.formattedText.match(/^([A-Z][A-Za-z0-9\s'-]{2,42})(?::|\s+—)\s+.{15,}$/);
        if (
          itemLead &&
          !/^(?:note|example|formula|characteristic|summary)$/i.test(itemLead[1].trim()) &&
          !seenM.has(itemLead[1].trim().toLowerCase())
        ) {
          seenM.add(itemLead[1].trim().toLowerCase());
          memberNames.push(itemLead[1].trim());
        }
      }
    }

    if (memberNames.length >= 2) {
      seenCategories.add(catName.toLowerCase());
      const firstPage = secUnits[0]?.pageNumber ?? null;
      const overviewStatement = attachPageCitation(
        `${catName.charAt(0).toUpperCase() + catName.slice(1)} is organized into ${memberNames.length} categories in this section: ${memberNames.join(', ')}.`,
        firstPage
      );
      unitClassSeeds.push({
        cls: {
          category: catName,
          members: memberNames,
          statement: overviewStatement,
          overviewStatement,
          types: [],
          sourceFingerprints: [],
          sectionHeading: heading,
          pageNumber: firstPage,
          salience: secUnits.reduce((s, x) => s + x.score, 0) / secUnits.length,
        },
        seedOrder: secUnits[0].orderIndex - 1,
      });
    }
  }

  // 3. Attach separate explanations, characteristics, examples, and comparisons per type
  for (const { cls, seedOrder } of unitClassSeeds) {
    const scopeUnits = units.filter((u) => {
      if (u.orderIndex <= seedOrder) return false;
      if (cls.sectionHeading && u.sectionHeading === cls.sectionHeading) return true;
      // Also inspect near subsequent units (within 24 units) if they share type/subheading names
      return u.orderIndex - seedOrder <= 24;
    });

    const types: ExtractedClassificationType[] = [];

    for (const member of cls.members) {
      const memberLower = member.toLowerCase();
      const memberNorm = memberLower.replace(/^(?:the|a|an)\s+/i, '').trim();
      const memberCoreWords = memberNorm
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !ACADEMIC_STOP_WORDS.has(w));
      const shortAlias =
        memberNorm.endsWith('s') && memberNorm.length > 4 ? memberNorm.slice(0, -1) : memberNorm;

      const normalizedOtherMembers = cls.members
        .filter((other) => other !== member)
        .map((other) => other.toLowerCase().replace(/^(?:the|a|an)\s+/i, '').trim());

      const matchesMember = (u: AnalyzedUnit): boolean => {
        // Never treat multi-type comparison/contrast sentences as a single type's explanation
        if (
          /\b(whereas|in contrast|unlike|differs from|difference between|compared (?:to|with)|on the other hand|versus|\bvs\.?\b)\b/i.test(
            u.formattedText
          )
        ) {
          return false;
        }

        const subLower = (u.subheading || '').toLowerCase();
        if (subLower) {
          if (subLower.includes(memberNorm) || memberNorm.includes(subLower)) {
            return true;
          }
          // If unit belongs explicitly to another type's subheading, do not steal it
          if (normalizedOtherMembers.some((om) => subLower.includes(om) || om.includes(subLower))) {
            return false;
          }
        }

        const txtLower = u.formattedText.toLowerCase();
        if (txtLower.includes(memberNorm) || (shortAlias.length >= 5 && txtLower.includes(shortAlias))) {
          return true;
        }
        if (memberCoreWords.length >= 2) {
          return memberCoreWords.every((w) => txtLower.includes(w));
        }
        return false;
      };

      const matchingUnits = scopeUnits.filter(
        (u) => !cls.sourceFingerprints.includes(u.fingerprint) && matchesMember(u)
      );

      // Separate characteristics & examples vs primary explanation sentences
      const explSentences: string[] = [];
      const charList: string[] = [];
      const exList: string[] = [];
      let typePage: number | null = null;

      for (const mu of matchingUnits) {
        if (typePage === null && mu.pageNumber !== null) typePage = mu.pageNumber;
        cls.sourceFingerprints.push(mu.fingerprint);
        const cleanSent = attachPageCitation(stripBoilerplatePrefix(mu.formattedText), mu.pageNumber);

        if (/\b(for example|for instance|e\.g\.|such as|illustrated by)\b/i.test(mu.formattedText)) {
          if (exList.length < 2) exList.push(cleanSent);
          else if (explSentences.length < 3) explSentences.push(cleanSent);
        } else if (isCharacteristicUnit(mu)) {
          if (charList.length < 3) charList.push(cleanSent);
        } else {
          if (explSentences.length < 3) explSentences.push(cleanSent);
          else if (charList.length < 2) charList.push(cleanSent);
        }
      }

      const explanation =
        explSentences.length > 0
          ? explSentences.join(' ')
          : charList.length > 0
            ? charList.shift()!
            : 'Named in the source document without a separate detailed explanation.';

      types.push({
        name: member,
        explanation,
        characteristics: charList,
        examples: exList,
        pageNumber: typePage ?? cls.pageNumber,
      });
    }

    // Check for grounded source comparison covering >= 2 types in this classification
    let comparisonNote: string | undefined;
    for (const dist of distinctions) {
      const distLower = dist.comparison.toLowerCase();
      const matchedCount = cls.members.filter((m) =>
        distLower.includes(m.toLowerCase().replace(/^(?:the|a|an)\s+/i, ''))
      ).length;
      if (matchedCount >= 2 || (cls.sectionHeading && dist.sectionHeading === cls.sectionHeading)) {
        comparisonNote = dist.comparison;
        cls.sourceFingerprints.push(normalizedFingerprint(dist.sourceText));
        break;
      }
    }

    classifications.push({
      ...cls,
      types,
      ...(comparisonNote ? { comparisonNote } : {}),
    });
  }

  return classifications;
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
 * without altering source meaning, inventing facts, or emitting robotic filler.
 */
export function buildStudentFriendlyClarification(
  text: string,
  definitions: ExtractedDefinition[]
): string {
  const clean = stripBoilerplatePrefix(text).trim();
  if (!clean) return '';

  // Clarify overly dense formal connectors into natural student-friendly academic prose
  const simplified = clean
    .replace(/\bconsequently,\s*/gi, 'As a result, ')
    .replace(/\bnevertheless,\s*/gi, 'Even so, ')
    .replace(/\bsubsequently,\s*/gi, 'Next, ')
    .replace(/\bthereby\s+([a-z]+ing)\b/gi, 'which $1')
    .replace(/\butilized?\b/gi, 'used')
    .replace(/\bfacilitates?\b/gi, 'helps enable');

  // Pair specialized terms with their document definition when genuinely informative
  for (const def of definitions.slice(0, 12)) {
    const termLower = def.term.toLowerCase();
    if (
      termLower.length >= 4 &&
      simplified.toLowerCase().includes(termLower) &&
      !simplified.toLowerCase().includes(def.rawDefinition.slice(0, 24).toLowerCase())
    ) {
      const shortMeaning = def.rawDefinition.split(/[.;]/)[0].trim();
      if (shortMeaning.length >= 14 && shortMeaning.length <= 105) {
        return `Here, ${def.term} refers to ${shortMeaning.charAt(0).toLowerCase() + shortMeaning.slice(1)}.`;
      }
    }
  }

  return simplified !== clean ? simplified : '';
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
        if (tok.length >= 5) {
          freq.set(tok, (freq.get(tok) || 0) + 1);
        }
      }
    }
    return new Set(
      Array.from(freq.entries())
        .filter(([, count]) => count >= 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([w]) => w)
    );
  });

  for (let i = 0; i < sections.length - 1; i++) {
    const j = i + 1; // Only adjacent sections with strong substantive concept overlap
    if (sections[i].heading === sections[j].heading) continue;
    const shared: string[] = [];
    for (const term of sectionTerms[i]) {
      if (sectionTerms[j].has(term)) {
        shared.push(term.charAt(0).toUpperCase() + term.slice(1));
      }
    }
    if (shared.length >= 3) {
      const topShared = shared.slice(0, 3);
      relationships.push({
        fromSection: sections[i].heading,
        toSection: sections[j].heading,
        sharedConcepts: topShared,
        connectionNote: `Both ${sections[i].heading} and ${sections[j].heading} examine ${topShared.join(', ')}.`,
      });
    }
  }
  return relationships.slice(0, 5);
}

function extractDifficultConcepts(
  units: AnalyzedUnit[],
  definitions: ExtractedDefinition[],
  formulas: ExtractedFormula[]
): ExtractedDifficultConcept[] {
  const results: ExtractedDifficultConcept[] = [];
  const seenConcepts = new Set<string>();

  for (const f of formulas.slice(0, 4)) {
    const key = f.name.toLowerCase();
    if (seenConcepts.has(key) || f.variables.length === 0) continue;
    seenConcepts.add(key);
    results.push({
      concept: f.name,
      sourceContext: `${f.expressionOrStructure} — ${f.rawUsage}`,
      plainExplanation: `Variables: ${f.variables.map((v) => `${v.symbol} denotes ${v.meaning}`).join('; ')}.`,
      pageNumber: f.pageNumber,
    });
  }

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

  for (const { unit } of denseCandidates.slice(0, 4)) {
    const clarified = buildStudentFriendlyClarification(unit.formattedText, definitions);
    if (!clarified) continue;
    const leadConcept =
      unit.subheading ||
      unit.sectionHeading ||
      Array.from(unit.tokens)
        .filter((t) => t.length >= 6)
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' & ');
    if (!leadConcept || seenConcepts.has(leadConcept.toLowerCase())) continue;
    seenConcepts.add(leadConcept.toLowerCase());

    results.push({
      concept: leadConcept,
      sourceContext: attachPageCitation(stripBoilerplatePrefix(unit.formattedText), unit.pageNumber),
      plainExplanation: clarified,
      pageNumber: unit.pageNumber,
    });
  }

  return results.slice(0, 5);
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
  const titleTokens = contentTokens(title);

  const scoreSentenceTfIdf = (
    formattedText: string,
    tokens: Set<string>,
    ordIdx: number,
    secHeading: string | null
  ) => {
    let tfidfSum = 0;
    for (const t of tokens) {
      const tf = Math.min(8, globalTermFreq.get(t) || 1);
      const dfVal = paragraphDf.get(t) || 1;
      const idf = Math.log(1 + totalIdfParagraphs / (dfVal + 0.5));
      tfidfSum += tf * idf;
    }
    let score = tokens.size > 0 ? tfidfSum / Math.sqrt(tokens.size + 1.2) : 1;

    // BM25-like relevance boost for sentences grounded in the document title or active section heading
    const secTokens = secHeading ? contentTokens(secHeading) : new Set<string>();
    let headingOverlap = 0;
    for (const t of tokens) {
      if (titleTokens.has(t) || secTokens.has(t)) headingOverlap++;
    }
    if (headingOverlap > 0) {
      score *= 1 + Math.min(0.45, headingOverlap * 0.14);
    }

    if (/\d/.test(formattedText)) score *= 1.1;
    if (/[=→⇌]/.test(formattedText)) score *= 1.2;
    if (
      /\b(is defined as|refers to|means|denotes|causes|leads to|produces|converts|whereas|unlike|therefore|concludes|types of|classified into)\b/i.test(
        formattedText
      )
    ) {
      score *= 1.22;
    }
    if (ordIdx < 5) score *= 1.1;
    return Number(score.toFixed(4));
  };

  for (const page of rawPages) {
    const lines = page.text.split('\n');
    let currentHeading: string | null = null;
    let currentSubheading: string | null = null;
    let paragraphBuf: string[] = [];

    const flushParagraph = () => {
      if (paragraphBuf.length === 0) return;
      const paraText = paragraphBuf.join(' ').replace(/\s+/g, ' ').trim();
      paragraphBuf = [];
      if (paraText.length < 12 || isCodeOrSyntaxLine(paraText)) return;

      const splitSentences = smartSentenceSplit(paraText);
      const candidates = splitSentences.length > 0 ? splitSentences : [paraText];

      for (const rawSent of candidates) {
        const cleaned = rawSent.replace(/\s+/g, ' ').trim();
        if (isCodeOrSyntaxLine(cleaned)) continue;
        const isFormulaLine =
          /[→⇌]|(?:^|\s)[A-Za-zΔαβγλμθπρσωΩ][A-Za-z0-9_₀-₉⁰-⁹']*\s*[=≈∝]\s*\S/.test(cleaned);
        if (cleaned.length < (isFormulaLine ? 5 : 14) || isMetaFillerSentence(cleaned)) continue;

        const fp = normalizedFingerprint(cleaned);
        if (!fp || seenExactFp.has(fp)) continue;
        seenExactFp.add(fp);

        const formattedText = formatScientificText(cleaned);
        const tokens = contentTokens(formattedText);
        if (tokens.size < 2 && !isFormulaLine && !/[=→⇌]/.test(formattedText)) continue;

        const score = scoreSentenceTfIdf(formattedText, tokens, orderCounter, currentHeading);

        units.push({
          text: cleaned,
          formattedText,
          pageNumber: page.pageNumber,
          sectionHeading: currentHeading,
          subheading: currentSubheading,
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

      if (isCodeOrSyntaxLine(line)) {
        flushParagraph();
        continue;
      }

      const headingInfo = detectHeadingInfo(line, lines[i + 1]);
      if (headingInfo) {
        flushParagraph();
        const formattedHeading = formatScientificText(headingInfo.title);
        if (headingInfo.level === 2 && currentHeading) {
          currentSubheading = formattedHeading;
        } else {
          currentHeading = formattedHeading;
          currentSubheading = null;
        }
        detectedHeadingCount++;
        continue;
      }

      const bulletMatch = line.match(/^(?:[-*•▪◦]|\d+[.)]|Step\s+\d+[:.)]?)\s+(.+)$/i);
      if (bulletMatch) {
        flushParagraph();
        const itemBody = bulletMatch[1].trim();
        const isStep = /^(?:\d+[.)]|Step\s+\d+)/i.test(line);
        if (itemBody.length >= 14 && !isMetaFillerSentence(itemBody) && !isCodeOrSyntaxLine(itemBody)) {
          const fp = normalizedFingerprint(itemBody);
          if (fp && !seenExactFp.has(fp)) {
            seenExactFp.add(fp);
            const formattedText = formatScientificText(itemBody);
            const tokens = contentTokens(formattedText);
            const score = Number(
              (scoreSentenceTfIdf(formattedText, tokens, orderCounter, currentHeading) * 1.08).toFixed(4)
            );
            units.push({
              text: itemBody,
              formattedText,
              pageNumber: page.pageNumber,
              sectionHeading: currentHeading,
              subheading: currentSubheading,
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

  const classifications = buildDetailedClassifications(dedupedUnits, distinctions);

  const characteristics: ExtractedCharacteristic[] = [];
  for (const unit of dedupedUnits) {
    if (isCharacteristicUnit(unit)) {
      characteristics.push({
        topic: unit.subheading || unit.sectionHeading || 'Key Characteristics',
        statement: attachPageCitation(stripBoilerplatePrefix(unit.formattedText), unit.pageNumber),
        sectionHeading: unit.sectionHeading,
        pageNumber: unit.pageNumber,
        salience: unit.score,
        sourceText: unit.formattedText,
      });
    }
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

  // Group units into document sections in original document order
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

  // Key terminology & phrases computed strictly from non-code prose units
  const cleanProseForTerms = dedupedUnits.map((u) => u.formattedText).join(' ');
  const extractedKeyPhrases = extractKeyPhrases(cleanProseForTerms || normalized, 14);
  const termCandidates = new Set<string>();
  for (const d of definitions) {
    if (d.term.length >= 2 && d.term.length <= 36) termCandidates.add(d.term);
  }
  for (const cls of classifications) {
    for (const m of cls.members) {
      if (m.length >= 2 && m.length <= 36) termCandidates.add(m);
    }
  }
  for (const sf of structureFunctions) {
    if (sf.entity.length >= 2 && sf.entity.length <= 36) termCandidates.add(sf.entity);
  }
  for (const phrase of extractedKeyPhrases.slice(0, 10)) {
    const alreadyCovered = Array.from(termCandidates).some(
      (existing) => existing.toLowerCase() === phrase.toLowerCase()
    );
    if (!alreadyCovered) {
      termCandidates.add(phrase);
    }
  }
  const techAcronyms =
    cleanProseForTerms.match(/\b(?:[A-Z]{2,6}2?|[A-Z][a-z]+[A-Z][A-Za-z]+|pH|pKa)\b/g) || [];
  for (const ac of techAcronyms) {
    if (!['PDF', 'PAGE', 'UNIT', 'STEP', 'NOTE'].includes(ac.toUpperCase())) {
      termCandidates.add(formatScientificText(ac));
    }
  }
  const genericFillerWords = new Set([
    'solving', 'finding', 'current', 'initial', 'desired', 'main', 'types',
    'lack', 'clear', 'single', 'various', 'several', 'common', 'general',
    'based', 'given', 'shown', 'using', 'require', 'include', 'provides',
  ]);
  const docKeywords = extractKeywords(cleanProseForTerms, 20);
  for (const kw of docKeywords) {
    if (ACADEMIC_STOP_WORDS.has(kw) || genericFillerWords.has(kw) || kw.length < 4) continue;
    const formattedKw = kw.charAt(0).toUpperCase() + kw.slice(1);
    const alreadyCovered = Array.from(termCandidates).some(
      (existing) => existing.toLowerCase().includes(kw.toLowerCase())
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
    characteristics,
    structureFunctions,
    examples,
    keyTerminology: Array.from(termCandidates).slice(0, 20),
    keyPhrases: extractKeyPhrases(cleanProseForTerms || normalized, 14),
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

/**
 * Extracts query expansion terms strictly from an attached or matched document's structured
 * intelligence profile (classifications, definitions, section headings) ONLY when the query
 * overlaps that structural concept, improving recall across multi-page sections.
 */
export function extractDocumentQueryExpansionTerms(
  docs: IndexedDocumentRecord[],
  query: string,
  maxTerms = 10
): string[] {
  const qTokens = contentTokens(query);
  if (qTokens.size === 0 || docs.length === 0) return [];

  const expanded = new Set<string>();
  const addWords = (text: string) => {
    for (const kw of extractKeywords(text, 8)) {
      if (!qTokens.has(kw) && kw.length >= 3) {
        expanded.add(kw);
      }
    }
  };

  for (const doc of docs.slice(0, 3)) {
    const profile = analyzeDocumentIntelligence(doc.extractedText, { title: doc.title });

    for (const cls of profile.classifications) {
      const clsTokens = contentTokens(
        `${cls.category} ${cls.members.join(' ')} ${cls.statement} ${cls.sectionHeading || ''}`
      );
      const { containment } = tokenSimilarity(qTokens, clsTokens);
      if (containment >= 0.25) {
        addWords(cls.category);
        for (const m of cls.members) addWords(m);
      }
    }

    for (const def of profile.definitions) {
      const defTokens = contentTokens(`${def.term} ${def.sectionHeading || ''}`);
      const { containment } = tokenSimilarity(qTokens, defTokens);
      if (containment >= 0.35) {
        addWords(def.term);
        addWords(def.rawDefinition);
      }
    }

    for (const sec of profile.sections) {
      const secTokens = contentTokens(sec.heading);
      const { containment } = tokenSimilarity(qTokens, secTokens);
      if (containment >= 0.35) {
        addWords(sec.heading);
      }
    }
  }

  return Array.from(expanded).slice(0, maxTerms);
}

/**
 * Builds a high-density structured intelligence block (Document Outline, Classifications & Types,
 * Definitions, Characteristics, Distinctions, Processes, Examples, Section Relationships) for
 * matched documents so the Document Assistant accurately synthesizes multi-page concepts.
 */
export function buildStructuredRagIntelligence(
  docs: IndexedDocumentRecord[],
  query: string,
  maxChars = 1900
): { outlineBlock: string; structuredKnowledgeBlock: string } {
  if (docs.length === 0 || maxChars <= 0) {
    return { outlineBlock: '', structuredKnowledgeBlock: '' };
  }

  const qTokens = contentTokens(query);
  const queryLower = query.toLowerCase();
  const wantsAllOverview = /\b(overview|summarize|summary|all|types?|categories|structure|outline|topics|relate|relationship|connect)\b/i.test(
    queryLower
  );

  // 1. Compact Document Outline (subject + ordered section headings with page ranges)
  const outlineLines: string[] = [];
  const items: Array<{ score: number; text: string }> = [];

  for (const doc of docs.slice(0, 3)) {
    const profile = analyzeDocumentIntelligence(doc.extractedText, { title: doc.title });

    if (profile.sections.length > 0) {
      const secSummary = profile.sections
        .slice(0, 8)
        .map((s) => {
          const pages =
            s.pageNumbers.length === 1
              ? `p.${s.pageNumbers[0]}`
              : s.pageNumbers.length > 1
                ? `pp.${s.pageNumbers[0]}-${s.pageNumbers[s.pageNumbers.length - 1]}`
                : '';
          return pages ? `${s.heading} (${pages})` : s.heading;
        })
        .join('; ');
      outlineLines.push(
        `- "${doc.title}" (${profile.subjectArea}, ${profile.quality.pageCount} page${
          profile.quality.pageCount === 1 ? '' : 's'
        }): ${secSummary}`
      );
    }

    if (qTokens.size === 0 && !wantsAllOverview) continue;

    for (const def of profile.definitions) {
      const overlap = tokenSimilarity(qTokens, contentTokens(`${def.term} ${def.rawDefinition} ${def.sectionHeading || ''}`));
      if (overlap.containment >= 0.22 || Array.from(qTokens).some((t) => def.term.toLowerCase().includes(t))) {
        items.push({
          score: overlap.containment * 2.2 + 1.1,
          text: `Definition [${doc.title}${def.pageNumber ? `, Page ${def.pageNumber}` : ''}]: ${def.term} — ${def.rawDefinition}`,
        });
      }
    }

    for (const cls of profile.classifications) {
      const clsFull = `${cls.category} ${cls.members.join(' ')} ${cls.statement} ${cls.sectionHeading || ''}`;
      const overlap = tokenSimilarity(qTokens, contentTokens(clsFull));
      if (overlap.containment >= 0.2 || wantsAllOverview) {
        const typesSummary = cls.types
          .slice(0, 6)
          .map((t) => {
            const extras: string[] = [];
            if (t.characteristics.length > 0) extras.push(`Features: ${t.characteristics[0]}`);
            if (t.examples.length > 0) extras.push(`Ex: ${t.examples[0]}`);
            const pageTag = t.pageNumber ? ` (p.${t.pageNumber})` : '';
            return `${t.name}${pageTag}: ${t.explanation}${extras.length ? ` [${extras.join('; ')}]` : ''}`;
          })
          .join(' | ');
        items.push({
          score: overlap.containment * 2.5 + (/\b(type|categor|kind|class)/i.test(queryLower) ? 1.8 : 1.0),
          text: `Classification [${doc.title}${cls.pageNumber ? `, Page ${cls.pageNumber}` : ''}]: ${cls.category} — ${typesSummary}`,
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
        items.push({
          score: overlap.containment * 2 + 1.1,
          text: `Formula [${doc.title}${f.pageNumber ? `, Page ${f.pageNumber}` : ''}]: ${f.name}: ${f.expressionOrStructure}${varText}`,
        });
      }
    }

    for (const dist of profile.distinctions) {
      const overlap = tokenSimilarity(qTokens, contentTokens(`${dist.pairTitle} ${dist.rawComparison}`));
      if (overlap.containment >= 0.22) {
        items.push({
          score: overlap.containment * 2.1 + 1.0,
          text: `Distinction [${doc.title}${dist.pageNumber ? `, Page ${dist.pageNumber}` : ''}]: ${dist.pairTitle} — ${dist.rawComparison}`,
        });
      }
    }

    for (const proc of profile.processes) {
      const procText = `${proc.heading} ${proc.steps.map((s) => s.rawText).join(' ')}`;
      const overlap = tokenSimilarity(qTokens, contentTokens(procText));
      if (overlap.containment >= 0.22) {
        const stepsStr = proc.steps
          .slice(0, 5)
          .map((s) => `${s.stepNumber}. ${s.rawText}${s.pageNumber ? ` (p.${s.pageNumber})` : ''}`)
          .join(' ');
        items.push({
          score: overlap.containment * 2 + 0.95,
          text: `Process [${doc.title} — ${proc.heading}]: ${stepsStr}`,
        });
      }
    }

    for (const ex of profile.examples) {
      const overlap = tokenSimilarity(qTokens, contentTokens(`${ex.title} ${ex.example} ${ex.sectionHeading || ''}`));
      if (overlap.containment >= 0.24) {
        items.push({
          score: overlap.containment * 1.9 + 0.85,
          text: `Example [${doc.title}${ex.pageNumber ? `, Page ${ex.pageNumber}` : ''}]: ${ex.example}`,
        });
      }
    }

    for (const rel of profile.sectionRelationships) {
      const overlap = tokenSimilarity(
        qTokens,
        contentTokens(`${rel.fromSection} ${rel.toSection} ${rel.sharedConcepts.join(' ')}`)
      );
      if (overlap.containment >= 0.2 || wantsAllOverview) {
        items.push({
          score: overlap.containment * 1.6 + 0.7,
          text: `Section Connection [${doc.title}]: "${rel.fromSection}" connects to "${rel.toSection}" via ${rel.sharedConcepts.slice(0, 4).join(', ')}`,
        });
      }
    }
  }

  const outlineBlock =
    outlineLines.length > 0
      ? `\n\nDOCUMENT STRUCTURE OUTLINE:\n${outlineLines.join('\n')}`
      : '';

  const sorted = items.sort((a, b) => b.score - a.score);
  const picked: string[] = [];
  let charBudget = Math.max(200, maxChars - outlineBlock.length);

  for (const it of sorted) {
    if (picked.length >= 6) break;
    if (picked.includes(it.text)) continue;
    if (it.text.length + 4 > charBudget && picked.length > 0) break;
    picked.push(it.text);
    charBudget -= it.text.length + 3;
  }

  const structuredKnowledgeBlock =
    picked.length > 0
      ? `\n\nEXTRACTED DOCUMENT CONCEPTS, CLASSIFICATIONS & FORMULAS:\n${picked.map((l) => `- ${l}`).join('\n')}`
      : '';

  return { outlineBlock, structuredKnowledgeBlock };
}

export function buildSectionClusterHeading(units: AnalyzedUnit[], fallbackIdx: number): string {
  return buildClusterHeading(units, fallbackIdx);
}

/**
 * Extracts ordered, user-selectable document sections cleanly from any extracted
 * document text so users can choose exact chapters, headings, or topical segments
 * inside the Document Summarizer modal before generating a summary.
 */
export function buildExtractedDocumentSections(
  extractedText: string,
  options?: { title?: string; subjectArea?: string }
): {
  contentHash: string;
  detectedSubject: string;
  sections: ExtractedDocumentSection[];
} {
  const profile = analyzeDocumentIntelligence(extractedText, options);

  interface RawSectionGroup {
    heading: string;
    pageNumbers: number[];
    units: AnalyzedUnit[];
  }

  const groups: RawSectionGroup[] = [];

  if (profile.sections.length >= 2 || (profile.sections.length === 1 && profile.units.length <= 8)) {
    for (let i = 0; i < profile.sections.length; i++) {
      const sec = profile.sections[i];
      if (sec.units.length === 0) continue;
      // Split unusually huge single-heading/page sections (> 18 units) into clean parts
      if (sec.units.length > 18 && profile.sections.length <= 2) {
        const chunkSize = 7;
        for (let start = 0; start < sec.units.length; start += chunkSize) {
          const slice = sec.units.slice(start, start + chunkSize);
          const partHeading =
            profile.quality.hasStructuredHeadings
              ? `${sec.heading}${sec.units.length > chunkSize ? ` (Part ${Math.floor(start / chunkSize) + 1})` : ''}`
              : buildClusterHeading(slice, groups.length);
          groups.push({
            heading: partHeading,
            pageNumbers: Array.from(
              new Set(slice.map((u) => u.pageNumber).filter((p): p is number => p !== null))
            ).sort((a, b) => a - b),
            units: slice,
          });
        }
      } else {
        groups.push({
          heading: sec.heading,
          pageNumbers: sec.pageNumbers,
          units: sec.units,
        });
      }
    }
  } else if (profile.units.length > 0) {
    const chunkSize = Math.max(4, Math.ceil(profile.units.length / 4));
    for (let start = 0; start < profile.units.length; start += chunkSize) {
      const slice = profile.units.slice(start, start + chunkSize);
      groups.push({
        heading: buildClusterHeading(slice, groups.length),
        pageNumbers: Array.from(
          new Set(slice.map((u) => u.pageNumber).filter((p): p is number => p !== null))
        ).sort((a, b) => a - b),
        units: slice,
      });
    }
  }

  const sections: ExtractedDocumentSection[] = groups.map((g, idx) => {
    const orderedUnits = [...g.units].sort((a, b) => a.orderIndex - b.orderIndex);
    const bodyLines: string[] = [];
    let lastPage: number | null = null;
    let lastSubheading: string | null = null;

    for (const u of orderedUnits) {
      if (u.pageNumber !== null && u.pageNumber !== lastPage) {
        bodyLines.push(`[Page ${u.pageNumber}]`);
        lastPage = u.pageNumber;
      }
      if (u.subheading && u.subheading !== lastSubheading) {
        bodyLines.push(`### ${u.subheading}`);
        lastSubheading = u.subheading;
      }
      bodyLines.push(u.isBullet ? `- ${u.text}` : u.text);
    }

    const sectionText = `## ${g.heading}\n${bodyLines.join('\n')}`;
    const wordCount = sectionText.split(/\s+/).filter(Boolean).length;
    const rawPreview = (orderedUnits[0]?.formattedText || orderedUnits[0]?.text || '')
      .replace(/\(Pages?\s+\d+[^)]*\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const preview =
      rawPreview.length > 130 ? `${rawPreview.slice(0, 127).trimEnd()}…` : rawPreview;

    return {
      id: `sec-${profile.contentHash.slice(0, 8)}-${idx}`,
      index: idx,
      heading: g.heading,
      preview: preview || g.heading,
      wordCount,
      unitCount: orderedUnits.length,
      pageNumbers: g.pageNumbers,
      text: sectionText,
    };
  });

  if (sections.length === 0 && profile.normalizedText.trim().length > 0) {
    const fallbackWordCount = profile.normalizedText.split(/\s+/).filter(Boolean).length;
    const snippet = profile.normalizedText.replace(/\s+/g, ' ').trim();
    sections.push({
      id: `sec-${profile.contentHash.slice(0, 8)}-0`,
      index: 0,
      heading: options?.title?.trim() || 'Document Overview',
      preview: snippet.length > 130 ? `${snippet.slice(0, 127).trimEnd()}…` : snippet,
      wordCount: fallbackWordCount,
      unitCount: 1,
      pageNumbers: [],
      text: profile.normalizedText,
    });
  }

  return {
    contentHash: profile.contentHash,
    detectedSubject: profile.subjectArea,
    sections,
  };
}

