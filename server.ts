import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { extractText as extractPdfText } from 'unpdf';
import { createServer as createViteServer } from 'vite';
import type {
  ExtractionResult,
  GeneratedQuizPayload,
  GradedQuestionResult,
  ImageActionType,
  MaterialSourceType,
  QuizDifficulty,
  QuizFormat,
  QuizGradingResponse,
  QuizQuestion,
  QuizSourceMode,
  StructuredSummary,
  StudentAnswer,
  SummaryLevel,
  TutorMode,
} from './src/types/brainstine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
]);

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const CANDIDATE_GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getConfiguredGeminiModel(): string | null {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured || null;
}

let resolvedGeminiModelCache: {
  activeModel: string;
  configuredModel: string | null;
  fallbackUsed: boolean;
  reason: string | null;
  checkedAt: number;
} | null = null;
let resolvingModelPromise: Promise<string> | null = null;

function getGeminiModel(): string {
  if (resolvedGeminiModelCache?.activeModel) {
    return resolvedGeminiModelCache.activeModel;
  }
  return getConfiguredGeminiModel() || DEFAULT_GEMINI_MODEL;
}

function getThinkingConfig(
  model: string,
  level: ThinkingLevel = ThinkingLevel.LOW
): { thinkingConfig?: { thinkingLevel: ThinkingLevel } } {
  const lower = model.toLowerCase();
  if (lower.includes('gemini-3') || lower.includes('gemini-4')) {
    const safeLevel =
      lower.includes('gemini-4') && level === ThinkingLevel.MINIMAL
        ? ThinkingLevel.LOW
        : level;
    return { thinkingConfig: { thinkingLevel: safeLevel } };
  }
  return {};
}

function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey.trim() !== '' && apiKey !== 'MY_GEMINI_API_KEY');
}

function getGeminiClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw new Error(
      'GEMINI_API_KEY is missing. Set GEMINI_API_KEY in Secrets (or your server environment variables) to enable AI features.'
    );
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface GeminiQuotaInfo {
  isQuotaError: boolean;
  quotaScope: 'rpm' | 'tpm' | 'daily' | 'zero_quota' | 'unknown';
  retryDelaySeconds: number | null;
  quotaMetric: string | null;
  quotaId: string | null;
}

function inspectGeminiQuotaError(err: unknown): GeminiQuotaInfo {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  const isQuotaError =
    status === 429 || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('"code":429') || raw.includes(' 429');

  if (!isQuotaError) {
    return {
      isQuotaError: false,
      quotaScope: 'unknown',
      retryDelaySeconds: null,
      quotaMetric: null,
      quotaId: null,
    };
  }

  let quotaMetric: string | null = null;
  let quotaId: string | null = null;
  let quotaValueZero = false;
  let retryDelaySeconds: number | null = null;

  const retryMatch = raw.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i) || raw.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
  if (retryMatch) {
    retryDelaySeconds = Math.ceil(Number(retryMatch[1]));
  }

  const metricMatch = raw.match(/"quotaMetric"\s*:\s*"([^"]+)"/);
  if (metricMatch) quotaMetric = metricMatch[1];

  const idMatch = raw.match(/"quotaId"\s*:\s*"([^"]+)"/);
  if (idMatch) quotaId = idMatch[1];

  if (/limit:\s*0\b/i.test(raw) || /"quotaValue"\s*:\s*"0"/i.test(raw)) {
    quotaValueZero = true;
  }

  const combined = `${raw} ${quotaMetric || ''} ${quotaId || ''}`.toLowerCase();
  let quotaScope: GeminiQuotaInfo['quotaScope'] = 'unknown';

  if (quotaValueZero) {
    quotaScope = 'zero_quota';
  } else if (
    combined.includes('perday') ||
    combined.includes('per_day') ||
    combined.includes('requestsperday') ||
    combined.includes('daily') ||
    (retryDelaySeconds !== null && retryDelaySeconds > 120)
  ) {
    quotaScope = 'daily';
  } else if (combined.includes('token') || combined.includes('tpm')) {
    quotaScope = 'tpm';
  } else if (
    combined.includes('perminute') ||
    combined.includes('per_minute') ||
    combined.includes('requestsperminute') ||
    combined.includes('rpm')
  ) {
    quotaScope = 'rpm';
  }

  return {
    isQuotaError: true,
    quotaScope,
    retryDelaySeconds,
    quotaMetric,
    quotaId,
  };
}

interface RetryOptions {
  maxRetries?: number;
  timeoutMs?: number;
  externalSignal?: AbortSignal;
}

async function withRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options: RetryOptions | number = {}
): Promise<T> {
  const opts: RetryOptions =
    typeof options === 'number' ? { maxRetries: options } : options;
  const maxRetries = opts.maxRetries ?? 1;
  const timeoutMs = opts.timeoutMs;
  const externalSignal = opts.externalSignal;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (externalSignal?.aborted) {
      throw externalSignal.reason ?? new Error('Request aborted');
    }

    const attemptStart = Date.now();
    const attemptController = timeoutMs || externalSignal ? new AbortController() : null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    const onExternalAbort = () => {
      attemptController?.abort(externalSignal?.reason ?? new Error('Request aborted'));
    };

    if (attemptController && externalSignal) {
      if (externalSignal.aborted) {
        attemptController.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    if (attemptController && timeoutMs && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        attemptController.abort(new Error('Upstream AI request timeout'));
      }, timeoutMs);
    }

    try {
      return await fn(attemptController?.signal);
    } catch (err: unknown) {
      lastError = err;
      const attemptElapsedMs = Date.now() - attemptStart;

      if (externalSignal?.aborted) {
        throw err;
      }

      if (timedOut) {
        throw Object.assign(
          new Error(
            'The Gemini AI service took too long to respond due to temporary high demand. Your message has been preserved—please try again in a few moments.'
          ),
          { status: 503 }
        );
      }

      const message = err instanceof Error ? err.message : String(err);
      const quotaInfo = inspectGeminiQuotaError(err);

      if (quotaInfo.isQuotaError) {
        console.warn('[Gemini 429 diagnostic]', {
          quotaScope: quotaInfo.quotaScope,
          quotaMetric: quotaInfo.quotaMetric,
          quotaId: quotaInfo.quotaId,
          retryDelaySeconds: quotaInfo.retryDelaySeconds,
        });
        // Never automatically repeat requests when Gemini reports rate limits / quota exhaustion
        throw err;
      }

      const isTransient =
        message.includes('503') ||
        message.includes('500') ||
        message.includes('UNAVAILABLE') ||
        message.includes('ECONNRESET');

      // Do not repeatedly retry prolonged upstream failures (>12s) or exhausted retries
      if (!isTransient || attemptElapsedMs > 12000 || attempt >= maxRetries) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 300);
      await new Promise((resolve) => setTimeout(resolve, 900 * Math.pow(2, attempt) + jitter));
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }
  throw lastError;
}

function extractReadableApiError(raw: string): string {
  let current = raw.trim();
  for (let depth = 0; depth < 3; depth++) {
    if (!current.startsWith('{')) break;
    try {
      const parsed = JSON.parse(current) as { error?: { message?: string } | string; message?: string };
      if (typeof parsed?.error === 'object' && typeof parsed.error?.message === 'string') {
        current = parsed.error.message.trim();
        continue;
      }
      if (typeof parsed?.error === 'string') {
        current = parsed.error.trim();
        continue;
      }
      if (typeof parsed?.message === 'string') {
        current = parsed.message.trim();
        continue;
      }
      break;
    } catch {
      break;
    }
  }
  return current;
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;

  if (raw.includes('GEMINI_API_KEY is missing')) {
    return { status: 503, message: raw };
  }
  if (raw.includes('Unsupported image format') || raw.includes('exceeds the 15 MB limit')) {
    return { status: 400, message: raw };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || status === 403 || raw.includes('"code":403')) {
    return {
      status: 403,
      message:
        'The configured GEMINI_API_KEY was rejected. Please verify GEMINI_API_KEY in your Secrets panel.',
    };
  }
  const quotaInfo = inspectGeminiQuotaError(err);
  if (quotaInfo.isQuotaError) {
    if (quotaInfo.quotaScope === 'daily' || quotaInfo.quotaScope === 'zero_quota') {
      return {
        status: 429,
        message:
          'The Gemini API quota for the configured key is currently exhausted (daily or free-tier limit reached). Your message has been preserved—please check your Google AI Studio / Cloud quota or wait for quota reset before retrying.',
      };
    }
    if (quotaInfo.quotaScope === 'tpm') {
      return {
        status: 429,
        message:
          'The Gemini token-per-minute rate limit was reached. Your message has been preserved—please wait a moment or try a shorter prompt.',
      };
    }
    const waitHint =
      quotaInfo.retryDelaySeconds && quotaInfo.retryDelaySeconds <= 60
        ? ` Please wait ~${quotaInfo.retryDelaySeconds} seconds and try again.`
        : ' Please wait a moment and try again.';
    return {
      status: 429,
      message: `AI processing rate limit reached.${waitHint} Your message has been preserved.`,
    };
  }
  if (
    status === 404 ||
    raw.includes('NOT_FOUND') ||
    raw.includes('"code":404')
  ) {
    return {
      status: 502,
      message:
        'The configured Gemini AI model is currently unavailable or unsupported. Please verify the GEMINI_MODEL environment configuration.',
    };
  }
  const errName = err instanceof Error ? err.name : '';
  if (
    status === 503 ||
    errName === 'AbortError' ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('"code":503') ||
    raw.toLowerCase().includes('high demand') ||
    raw.toLowerCase().includes('overloaded') ||
    raw.toLowerCase().includes('took too long') ||
    raw.toLowerCase().includes('stalled') ||
    raw.toLowerCase().includes('timeout') ||
    raw.toLowerCase().includes('operation was aborted')
  ) {
    return {
      status: 503,
      message:
        'The Gemini AI service is temporarily experiencing high demand or took too long to respond. Your message has been preserved—please try again in a few moments.',
    };
  }
  const readable = extractReadableApiError(raw);
  return {
    status: 500,
    message: readable || 'An unexpected error occurred during AI processing.',
  };
}

function chunkText(text: string, maxChars = 12000, overlap = 350): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const paragraphs = cleaned.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 <= maxChars) {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    } else if (trimmed.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      let start = 0;
      while (start < trimmed.length) {
        const end = Math.min(start + maxChars, trimmed.length);
        chunks.push(trimmed.slice(start, end));
        if (end >= trimmed.length) break;
        start = Math.max(0, end - overlap);
      }
    } else {
      if (current) {
        chunks.push(current);
      }
      const tail = current.slice(-overlap).trim();
      current =
        tail && tail.length + trimmed.length + 2 <= maxChars
          ? `${tail}\n\n${trimmed}`
          : trimmed;
    }
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function detectMaterialType(mimeType: string, fileName: string): MaterialSourceType | null {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    ALLOWED_IMAGE_MIMES.has(lowerMime) ||
    /\.(png|jpe?g|webp|gif|heic|heif)$/.test(lowerName)
  ) {
    return 'image';
  }
  if (
    ALLOWED_AUDIO_MIMES.has(lowerMime) ||
    /\.(mp3|wav|webm|ogg|m4a|mp4|aac|flac)$/.test(lowerName)
  ) {
    return 'audio';
  }
  if (
    lowerMime === 'text/plain' ||
    lowerMime === 'text/markdown' ||
    /\.(txt|md)$/.test(lowerName)
  ) {
    return 'text';
  }
  return null;
}

function normalizeMimeType(
  mimeType: string,
  fileName: string,
  materialType: MaterialSourceType
): string {
  const lowerName = fileName.toLowerCase();
  if (materialType === 'pdf') return 'application/pdf';
  if (materialType === 'image') {
    if (mimeType === 'image/jpg') return 'image/jpeg';
    if (ALLOWED_IMAGE_MIMES.has(mimeType)) return mimeType;
    if (lowerName.endsWith('.png')) return 'image/png';
    if (lowerName.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
  if (materialType === 'audio') {
    if (mimeType === 'audio/x-m4a' || mimeType === 'audio/m4a' || lowerName.endsWith('.m4a')) {
      return 'audio/mp4';
    }
    if (mimeType === 'audio/mp3' || lowerName.endsWith('.mp3')) {
      return 'audio/mpeg';
    }
    if (mimeType === 'audio/x-wav' || mimeType === 'audio/wave' || lowerName.endsWith('.wav')) {
      return 'audio/wav';
    }
    if (lowerName.endsWith('.webm')) return 'audio/webm';
    if (lowerName.endsWith('.ogg')) return 'audio/ogg';
    if (lowerName.endsWith('.aac')) return 'audio/aac';
    if (lowerName.endsWith('.flac')) return 'audio/flac';
    return mimeType || 'audio/mpeg';
  }
  return 'text/plain';
}

function buildMarkdownSummary(summary: Omit<StructuredSummary, 'markdown'>): string {
  const levelLabel =
    summary.summaryLevel === 'short'
      ? 'Short Summary'
      : summary.summaryLevel === 'detailed'
        ? 'Detailed Summary'
        : 'Comprehensive Study Notes';

  const lines: string[] = [
    `# ${summary.title}`,
    `**Subject:** ${summary.subjectArea} | **Format:** ${levelLabel}`,
    '',
    '## Topic Overview',
    summary.topicOverview,
    '',
  ];

  if (summary.mainConcepts.length > 0) {
    lines.push('## Main Concepts & Points');
    for (const item of summary.mainConcepts) {
      lines.push(`### ${item.heading}`);
      for (const pt of item.sourcePoints) {
        lines.push(`- [From Source] ${pt}`);
      }
      if (item.aiClarification) {
        lines.push(`- [AI Clarification] ${item.aiClarification}`);
      }
      lines.push('');
    }
  }

  if (summary.importantDefinitions.length > 0) {
    lines.push('## Important Definitions');
    for (const def of summary.importantDefinitions) {
      const originLabel = def.origin === 'source' ? 'From Source' : 'AI Clarification';
      lines.push(`- **${def.term}** (${originLabel}): ${def.definition}`);
    }
    lines.push('');
  }

  if (summary.keyTerminology.length > 0) {
    lines.push('## Key Terminology');
    lines.push(summary.keyTerminology.join(', '));
    lines.push('');
  }

  if (summary.difficultConceptExplanations.length > 0) {
    lines.push('## Explanations of Difficult Concepts');
    for (const item of summary.difficultConceptExplanations) {
      lines.push(`### ${item.concept}`);
      lines.push(`- **In the material:** ${item.sourceContext}`);
      lines.push(`- **AI Plain-Language Explanation:** ${item.plainExplanation}`);
      lines.push('');
    }
  }

  if (summary.importantFacts.length > 0) {
    lines.push('## Important Facts (From Source)');
    for (const fact of summary.importantFacts) {
      lines.push(`- ${fact}`);
    }
    lines.push('');
  }

  if (summary.relevantExamples.length > 0) {
    lines.push('## Relevant Examples');
    for (const ex of summary.relevantExamples) {
      const tag = ex.origin === 'source' ? 'From Source' : 'AI Elaboration';
      lines.push(`- **${ex.title}** (${tag}): ${ex.example}`);
    }
    lines.push('');
  }

  if (summary.formulasOrFrameworks.length > 0) {
    lines.push('## Formulas & Frameworks');
    for (const f of summary.formulasOrFrameworks) {
      lines.push(`- **${f.name}:** \`${f.expressionOrStructure}\` — ${f.usage}`);
    }
    lines.push('');
  }

  if (summary.comparisonTables && summary.comparisonTables.length > 0) {
    lines.push('## Comparison Tables');
    for (const table of summary.comparisonTables) {
      lines.push(`### ${table.title}`);
      const headers = ['Criterion', ...table.headers];
      lines.push(`| ${headers.join(' | ')} |`);
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      for (const row of table.rows) {
        lines.push(`| ${row.criterion} | ${row.values.join(' | ')} |`);
      }
      if (table.caption) {
        lines.push(`*${table.caption}*`);
      }
      lines.push('');
    }
  }

  if (summary.revisionNotes.length > 0) {
    lines.push('## Revision Notes');
    for (const note of summary.revisionNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  if (summary.keyTakeaways.length > 0) {
    lines.push('## Key Takeaways');
    for (const t of summary.keyTakeaways) {
      lines.push(`- ${t}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '20mb' }));
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in (err as object)) {
      return res.status(400).json({ error: 'Invalid JSON request payload.' });
    }
    const errObj = err as { type?: string; status?: number };
    if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
      return res.status(413).json({
        error: 'Request payload exceeds the 20 MB limit. Please upload a smaller image or document.',
      });
    }
    next(err);
  });

  async function probeSingleModelQuick(
    ai: GoogleGenAI,
    modelId: string,
    timeoutMs = 7000
  ): Promise<{ ok: boolean; latencyMs: number; status?: number; error?: string; quotaHit?: boolean }> {
    const start = Date.now();
    const ac = new AbortController();
    let abortedByTimer = false;
    const timer = setTimeout(() => {
      abortedByTimer = true;
      ac.abort(new Error(`Model probe timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    try {
      const res = await ai.models.generateContent({
        model: modelId,
        contents: 'Reply with: OK',
        config: {
          ...getThinkingConfig(modelId, ThinkingLevel.LOW),
          abortSignal: ac.signal,
        },
      });
      return {
        ok: Boolean((res.text ?? '').trim()),
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const quota = inspectGeminiQuotaError(err);
      const formatted = abortedByTimer
        ? { status: 503, message: `Timed out after ${timeoutMs}ms` }
        : formatGeminiError(err);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        status: formatted.status,
        error: formatted.message,
        quotaHit: quota.isQuotaError,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function ensureResolvedGeminiModel(forceRefresh = false): Promise<string> {
    const configured = getConfiguredGeminiModel();
    if (!isGeminiConfigured()) {
      return configured || DEFAULT_GEMINI_MODEL;
    }

    if (
      !forceRefresh &&
      resolvedGeminiModelCache &&
      resolvedGeminiModelCache.configuredModel === configured &&
      Date.now() - resolvedGeminiModelCache.checkedAt < MODEL_CACHE_TTL_MS
    ) {
      return resolvedGeminiModelCache.activeModel;
    }

    // If unset or already set to verified fast default, skip probe calls
    if (!configured || configured === DEFAULT_GEMINI_MODEL) {
      resolvedGeminiModelCache = {
        activeModel: DEFAULT_GEMINI_MODEL,
        configuredModel: configured,
        fallbackUsed: false,
        reason: null,
        checkedAt: Date.now(),
      };
      return DEFAULT_GEMINI_MODEL;
    }

    if (resolvingModelPromise && !forceRefresh) {
      return resolvingModelPromise;
    }

    resolvingModelPromise = (async () => {
      try {
        const ai = getGeminiClient();
        const configuredProbe = await probeSingleModelQuick(ai, configured, 7000);

        if (configuredProbe.ok) {
          resolvedGeminiModelCache = {
            activeModel: configured,
            configuredModel: configured,
            fallbackUsed: false,
            reason: null,
            checkedAt: Date.now(),
          };
          return configured;
        }

        // Do not burn extra requests if quota is exhausted or API key is invalid
        if (configuredProbe.quotaHit || configuredProbe.status === 403) {
          resolvedGeminiModelCache = {
            activeModel: configured,
            configuredModel: configured,
            fallbackUsed: false,
            reason: configuredProbe.error || null,
            checkedAt: Date.now(),
          };
          return configured;
        }

        // Configured model timed out, is unavailable (503), or unsupported (404/502) -> test verified candidates
        for (const candidate of CANDIDATE_GEMINI_MODELS) {
          if (candidate === configured) continue;
          const candidateProbe = await probeSingleModelQuick(ai, candidate, 7000);
          if (candidateProbe.ok) {
            const reason = `Configured GEMINI_MODEL "${configured}" did not respond within 7s or is unavailable (${configuredProbe.error || 'timeout'}). Automatically switched to verified supported model "${candidate}".`;
            console.warn('[Gemini Model Resolver]', reason);
            resolvedGeminiModelCache = {
              activeModel: candidate,
              configuredModel: configured,
              fallbackUsed: true,
              reason,
              checkedAt: Date.now(),
            };
            return candidate;
          }
          if (candidateProbe.quotaHit || candidateProbe.status === 403) {
            break;
          }
        }

        // Default back to verified DEFAULT_GEMINI_MODEL rather than leaving a known-stalling model active
        const fallbackReason = `Configured GEMINI_MODEL "${configured}" failed health check (${configuredProbe.error || 'unavailable'}). Defaulting to "${DEFAULT_GEMINI_MODEL}".`;
        console.warn('[Gemini Model Resolver]', fallbackReason);
        resolvedGeminiModelCache = {
          activeModel: DEFAULT_GEMINI_MODEL,
          configuredModel: configured,
          fallbackUsed: true,
          reason: fallbackReason,
          checkedAt: Date.now(),
        };
        return DEFAULT_GEMINI_MODEL;
      } finally {
        resolvingModelPromise = null;
      }
    })();

    return resolvingModelPromise;
  }

  app.use(['/api/materials', '/api/summaries', '/api/quizzes', '/api/ai'], async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      await ensureResolvedGeminiModel();
    } catch {
      // Allow downstream route error handler to report configuration errors cleanly
    }
    next();
  });

  app.get('/api/health', async (req: Request, res: Response) => {
    const geminiConfigured = isGeminiConfigured();
    const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
    const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
    const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
    const configuredModel = getConfiguredGeminiModel();

    if (geminiConfigured && !resolvedGeminiModelCache) {
      await ensureResolvedGeminiModel().catch(() => {});
    }

    if (req.query.probe === '1' && geminiConfigured) {
      const ai = getGeminiClient();
      const listedModels: string[] = [];
      let listError: string | null = null;

      try {
        const pager = await ai.models.list({ config: { pageSize: 50 } });
        for await (const m of pager) {
          if (m.name) {
            listedModels.push(m.name.replace(/^models\//, ''));
          }
          if (listedModels.length >= 60) break;
        }
      } catch (err: unknown) {
        listError = err instanceof Error ? err.message : String(err);
      }

      const probeTargets = Array.from(
        new Set(
          [configuredModel, ...CANDIDATE_GEMINI_MODELS].filter((x): x is string => Boolean(x))
        )
      );
      const probeResults = [];
      for (const candidate of probeTargets) {
        const result = await probeSingleModelQuick(ai, candidate, 10000);
        probeResults.push({ model: candidate, ...result });
        if (result.quotaHit) break;
      }

      let supabaseHealthy: boolean | null = null;
      if (supabaseConfigured) {
        try {
          const sbRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, {
            headers: { apikey: supabaseAnonKey },
          });
          supabaseHealthy = sbRes.ok;
        } catch {
          supabaseHealthy = false;
        }
      }

      let imageGenProbe: { model: string; available: boolean; error?: string } | null = null;
      if (req.query.imageProbe === '1') {
        const imgModel = 'gemini-3.1-flash-lite-image';
        try {
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(new Error('Image model probe timeout')), 10000);
          try {
            const imgRes = await ai.models.generateContent({
              model: imgModel,
              contents: 'Simple 2D educational schematic icon of a plant cell.',
              config: {
                responseModalities: ['IMAGE'],
                abortSignal: ac.signal,
              },
            });
            const hasImg = Boolean(
              imgRes.candidates?.[0]?.content?.parts?.some((p) => p.inlineData?.data)
            );
            imageGenProbe = { model: imgModel, available: hasImg };
          } finally {
            clearTimeout(timer);
          }
        } catch (err: unknown) {
          imageGenProbe = {
            model: imgModel,
            available: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      return res.json({
        ok: true,
        geminiConfigured,
        configuredModel,
        activeModel: getGeminiModel(),
        modelFallbackUsed: Boolean(resolvedGeminiModelCache?.fallbackUsed),
        modelNote: resolvedGeminiModelCache?.reason || null,
        requiredAiEnvVar: 'GEMINI_API_KEY',
        supabaseConfigured,
        supabaseHealthy,
        listedModels,
        listError,
        probeResults,
        imageGenProbe,
      });
    }

    res.json({
      ok: true,
      geminiConfigured,
      configuredModel,
      activeModel: getGeminiModel(),
      modelFallbackUsed: Boolean(resolvedGeminiModelCache?.fallbackUsed),
      modelNote: resolvedGeminiModelCache?.reason || null,
      requiredAiEnvVar: 'GEMINI_API_KEY',
      supabaseConfigured,
    });
  });

  app.get('/api/auth/oauth-status', async (req: Request, res: Response) => {
    const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.json({
        supabaseConfigured: false,
        googleEnabled: false,
        reason: 'Supabase environment variables are not configured.',
      });
    }

    try {
      const settingsRes = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: supabaseAnonKey },
      });
      const settingsJson = settingsRes.ok
        ? ((await settingsRes.json()) as {
            external?: Record<string, boolean>;
            disable_signup?: boolean;
          })
        : null;

      const googleEnabled = Boolean(settingsJson?.external?.google);
      const originParam =
        typeof req.query.redirectTo === 'string' && req.query.redirectTo.trim()
          ? req.query.redirectTo.trim()
          : `${req.protocol}://${req.get('host') || 'localhost:3000'}`;

      const authRes = await fetch(
        `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(originParam)}`,
        { redirect: 'manual' }
      );

      const location = authRes.headers.get('location') || '';
      let supabaseErrorBody: string | null = null;
      if (!location && !authRes.ok) {
        supabaseErrorBody = await authRes.text().catch(() => null);
      }

      let targetHost: string | null = null;
      let hasClientId = false;
      let callbackMatchesSupabase = false;
      let scopeList: string[] = [];
      let googleEndpointStatus: number | null = null;
      let googleRedirectLocation: string | null = null;
      let googleErrorType: string | null = null;
      let googleErrorDetail: string | null = null;

      if (location) {
        try {
          const parsedLoc = new URL(location);
          targetHost = parsedLoc.host;
          const clientIdParam = parsedLoc.searchParams.get('client_id') || '';
          hasClientId = Boolean(clientIdParam.trim());
          const cbUri = parsedLoc.searchParams.get('redirect_uri') || '';
          callbackMatchesSupabase = cbUri === `${supabaseUrl}/auth/v1/callback`;
          scopeList = (parsedLoc.searchParams.get('scope') || '').split(/\s+/).filter(Boolean);

          const gRes = await fetch(location, { redirect: 'manual' });
          googleEndpointStatus = gRes.status;
          const gLoc = gRes.headers.get('location');
          if (gLoc) {
            try {
              const gLocUrl = new URL(gLoc, 'https://accounts.google.com');
              googleRedirectLocation = `${gLocUrl.origin}${gLocUrl.pathname}`;
              const explicitErr =
                gLocUrl.searchParams.get('error') ||
                gLocUrl.searchParams.get('errorCode') ||
                '';
              const authErrorB64 = gLocUrl.searchParams.get('authError') || '';
              let decodedAuthError = '';
              if (authErrorB64) {
                try {
                  decodedAuthError = Buffer.from(authErrorB64, 'base64').toString('utf8');
                } catch {
                  decodedAuthError = '';
                }
              }

              if (gLocUrl.pathname.includes('/signin/oauth/error')) {
                const errPageRes = await fetch(gLocUrl.toString(), {
                  headers: { 'Accept-Language': 'en-US,en;q=0.9' },
                });
                const html = await errPageRes.text().catch(() => '');
                const cleaned = html
                  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
                  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                const match = cleaned.match(
                  /(Access blocked[^.]{0,220}|Error\s+40\d[^.]{0,220})/i
                );
                googleErrorDetail = (match ? match[0] : 'Google OAuth returned an error page.').trim();
              }

              const combinedHint = `${explicitErr} ${decodedAuthError} ${googleErrorDetail || ''}`.toLowerCase();
              if (combinedHint.includes('redirect_uri_mismatch')) {
                googleErrorType = 'redirect_uri_mismatch';
              } else if (combinedHint.includes('org_internal')) {
                googleErrorType = 'org_internal';
              } else if (combinedHint.includes('access_denied')) {
                googleErrorType = 'access_denied';
              } else if (combinedHint.includes('deleted_client')) {
                googleErrorType = 'deleted_client';
              } else if (combinedHint.includes('invalid_client')) {
                googleErrorType = 'invalid_client';
              } else if (combinedHint.includes('disallowed_useragent')) {
                googleErrorType = 'disallowed_useragent';
              } else if (gLocUrl.pathname.includes('/signin/oauth/error')) {
                googleErrorType = 'oauth_configuration_error';
              }
            } catch {
              googleRedirectLocation = gLoc.split('?')[0];
            }
          }
        } catch {
          // ignore URL parse error
        }
      }

      return res.json({
        supabaseConfigured: true,
        googleEnabled,
        authorizeStatus: authRes.status,
        supabaseErrorBody,
        targetHost,
        hasClientId,
        callbackMatchesSupabase,
        scopeCount: scopeList.length,
        googleEndpointStatus,
        googleRedirectLocation,
        googleErrorType,
        googleErrorDetail,
      });
    } catch (err: unknown) {
      return res.status(500).json({
        supabaseConfigured: true,
        googleEnabled: false,
        reason: err instanceof Error ? err.message : 'Unable to inspect Supabase OAuth status.',
      });
    }
  });

  app.post(
    '/api/materials/extract',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              error: 'File exceeds the 25 MB maximum upload limit. Please compress or split the file.',
            });
          }
          return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        if (err) {
          return res.status(400).json({ error: 'Failed to process uploaded file.' });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
          const titleInput = typeof req.body?.title === 'string' ? req.body.title.trim() : '';

          if (!rawText) {
            return res.status(400).json({
              error: 'Please upload a supported file or paste study text to extract.',
            });
          }
          if (rawText.length < 20) {
            return res.status(400).json({
              error:
                'Pasted text is too short to summarize. Please provide at least 20 characters of study content.',
            });
          }

          const chunks = chunkText(rawText);
          const result: ExtractionResult = {
            title: titleInput || 'Pasted Study Notes',
            materialType: 'text',
            fileName: null,
            fileSizeBytes: Buffer.byteLength(rawText, 'utf8'),
            mimeType: 'text/plain',
            extractedText: rawText,
            chunks,
            chunkCount: chunks.length,
            wordCount: countWords(rawText),
            characterCount: rawText.length,
            pageCount: null,
            extractionMethod: 'direct-text',
          };
          return res.json(result);
        }

        const file = req.file;
        const materialType = detectMaterialType(file.mimetype, file.originalname);
        if (!materialType) {
          return res.status(400).json({
            error: `Unsupported file format (${file.originalname}). Please upload a PDF, image (PNG, JPG, WEBP), audio file (MP3, WAV, M4A, WEBM, OGG), or plain text (.txt, .md).`,
          });
        }

        const normalizedMime = normalizeMimeType(file.mimetype, file.originalname, materialType);
        const baseTitle = path.basename(file.originalname, path.extname(file.originalname));
        const requestedTitle =
          typeof req.body?.title === 'string' && req.body.title.trim()
            ? req.body.title.trim()
            : baseTitle;

        let extractedText = '';
        let pageCount: number | null = null;
        let extractionMethod: ExtractionResult['extractionMethod'] = 'direct-text';

        if (materialType === 'text') {
          extractedText = file.buffer.toString('utf8').trim();
          extractionMethod = 'direct-text';
          if (!extractedText) {
            return res.status(400).json({ error: 'The uploaded text file is empty.' });
          }
        } else if (materialType === 'pdf') {
          let pdfPages: string[] = [];
          try {
            const pdfRes = await extractPdfText(new Uint8Array(file.buffer), {
              mergePages: false,
            });
            pageCount = pdfRes.totalPages;
            pdfPages = Array.isArray(pdfRes.text) ? pdfRes.text : [String(pdfRes.text || '')];
            extractedText = pdfPages
              .map((pageText, i) => {
                const cleaned = pageText.replace(/[ \t]+/g, ' ').trim();
                return cleaned ? `[Page ${i + 1}]\n${cleaned}` : '';
              })
              .filter(Boolean)
              .join('\n\n')
              .trim();
            extractionMethod = 'pdf-text';
          } catch (pdfErr) {
            console.warn('Primary PDF text extraction failed, attempting AI PDF OCR:', pdfErr);
          }

          if (extractedText.length < 60) {
            const ai = getGeminiClient();
            const model = getGeminiModel();
            const base64Pdf = file.buffer.toString('base64');
            const ocrResponse = await withRetry(
              (signal) =>
                ai.models.generateContent({
                  model,
                  contents: {
                    parts: [
                      {
                        inlineData: {
                          mimeType: 'application/pdf',
                          data: base64Pdf,
                        },
                      },
                      {
                        text: 'Extract all readable academic text, headings, equations, diagram labels, and footnotes from this PDF in exact reading order. Preserve paragraph structure and section headings. Return only the extracted content without meta-commentary.',
                      },
                    ],
                  },
                  config: {
                    ...getThinkingConfig(model, ThinkingLevel.LOW),
                    abortSignal: signal,
                  },
                }),
              { maxRetries: 1, timeoutMs: 60000 }
            );
            extractedText = (ocrResponse.text ?? '').trim();
            extractionMethod = 'pdf-ocr';
          }

          if (!extractedText) {
            return res.status(422).json({
              error:
                'Could not extract readable text from this PDF. The file may be encrypted, corrupted, or blank.',
            });
          }
        } else if (materialType === 'image') {
          const ai = getGeminiClient();
          const model = getGeminiModel();
          const base64Image = file.buffer.toString('base64');
          const ocrResponse = await withRetry(
            (signal) =>
              ai.models.generateContent({
                model,
                contents: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: normalizedMime,
                        data: base64Image,
                      },
                    },
                    {
                      text: 'Perform high-accuracy academic OCR on this image of notes or textbook pages. Transcribe all printed or handwritten text, bullet lists, definitions, tables, and mathematical equations in exact top-to-bottom, left-to-right reading order. If a diagram has labels or callouts, include them cleanly under a [Diagram Labels] subheading. Output only the extracted text.',
                    },
                  ],
                },
                config: {
                  ...getThinkingConfig(model, ThinkingLevel.LOW),
                  abortSignal: signal,
                },
              }),
            { maxRetries: 1, timeoutMs: 50000 }
          );
          extractedText = (ocrResponse.text ?? '').trim();
          extractionMethod = 'image-ocr';

          if (!extractedText || extractedText.length < 10) {
            return res.status(422).json({
              error:
                'No legible text could be detected in this image. Please upload a clearer, well-lit photo or scan.',
            });
          }
        } else if (materialType === 'audio') {
          const ai = getGeminiClient();
          const base64Audio = file.buffer.toString('base64');
          const transcriptResponse = await withRetry(
            (signal) =>
              ai.models.generateContent({
                model: 'gemini-3.5-transcribe',
                contents: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: normalizedMime,
                        data: base64Audio,
                      },
                    },
                    {
                      text: 'Transcribe this academic lecture or study voice note accurately with proper punctuation, paragraph breaks by topic, and clear academic terminology.',
                    },
                  ],
                },
                config: {
                  abortSignal: signal,
                },
              }),
            { maxRetries: 1, timeoutMs: 90000 }
          );
          extractedText = (transcriptResponse.text ?? '').trim();
          extractionMethod = 'audio-transcription';

          if (!extractedText || extractedText.length < 10) {
            return res.status(422).json({
              error:
                'Could not transcribe speech from this audio file. Please verify the recording contains audible speech.',
            });
          }
        }

        const chunks = chunkText(extractedText);
        const result: ExtractionResult = {
          title: requestedTitle,
          materialType,
          fileName: file.originalname,
          fileSizeBytes: file.size,
          mimeType: normalizedMime,
          extractedText,
          chunks,
          chunkCount: chunks.length,
          wordCount: countWords(extractedText),
          characterCount: extractedText.length,
          pageCount,
          extractionMethod,
        };

        return res.json(result);
      } catch (err: unknown) {
        console.error('Material extraction failed:', err);
        const formatted = formatGeminiError(err);
        return res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  app.post('/api/summaries/generate', async (req: Request, res: Response) => {
    try {
      const { extractedText, title, materialType, summaryLevel } = req.body as {
        extractedText?: string;
        title?: string;
        materialType?: MaterialSourceType;
        summaryLevel?: SummaryLevel;
      };

      if (!extractedText || typeof extractedText !== 'string' || extractedText.trim().length < 20) {
        return res.status(400).json({
          error:
            'Insufficient study material text. Please extract or paste at least 20 characters before summarizing.',
        });
      }

      const level: SummaryLevel =
        summaryLevel === 'short' || summaryLevel === 'detailed' || summaryLevel === 'comprehensive'
          ? summaryLevel
          : 'detailed';

      const ai = getGeminiClient();
      const model = getGeminiModel();
      const chunks = chunkText(extractedText.trim(), 14000, 350);

      let synthesisSource = extractedText.trim();

      if (chunks.length > 2) {
        const chunkNotes: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const partRes = await withRetry(
            (signal) =>
              ai.models.generateContent({
                model,
                contents: `Extract all essential academic concepts, facts, definitions, formulas/frameworks, and examples strictly from Section ${i + 1} of ${chunks.length} of "${title || 'Study Material'}". Preserve exact order and accuracy without inventing external claims.\n\n---\n${chunks[i]}`,
                config: {
                  systemInstruction:
                    'You are a rigorous academic research assistant. Distill each document section faithfully from the provided text without inventing facts.',
                  ...getThinkingConfig(model, ThinkingLevel.LOW),
                  abortSignal: signal,
                },
              }),
            { maxRetries: 1, timeoutMs: 45000 }
          );
          chunkNotes.push(`[Section ${i + 1}]\n${(partRes.text ?? '').trim()}`);
        }
        synthesisSource = chunkNotes.join('\n\n');
      }

      const depthInstructions =
        level === 'short'
          ? 'Produce a SHORT SUMMARY: concise 1-paragraph topic overview, 3 to 5 main concept headings (each with 2-3 sourcePoints and a brief aiClarification), up to 5 important definitions, 5 to 8 key terms, 1 to 2 difficult concept explanations if needed, 3 to 5 important facts, 1 to 2 relevant examples, essential formulas if present, 4 concise revision notes, and 3 to 4 key takeaways.'
          : level === 'detailed'
            ? 'Produce a DETAILED SUMMARY: thorough 2-paragraph topic overview, 5 to 8 main concept headings in document order (with grounded sourcePoints and helpful aiClarification), all key definitions, 8 to 14 key terminology entries, 2 to 4 difficult concept explanations, 5 to 8 important facts, 2 to 4 relevant examples, all relevant formulas/frameworks, 5 to 8 revision notes, and 5 to 7 key takeaways.'
            : 'Produce COMPREHENSIVE STUDY NOTES: rich multi-paragraph topic overview, 7 to 12 deeply structured main concept headings preserving exact progression of the uploaded material (each with exhaustive sourcePoints and dedicated aiClarification), complete important definitions, 12 to 20 key terminology items, 3 to 6 detailed difficult concept explanations, 8 to 12 important facts, 3 to 6 concrete examples, all relevant formulas/frameworks, 8 to 12 exam-ready revision notes, and 6 to 10 key takeaways.';

      const response = await withRetry(
        (signal) =>
          ai.models.generateContent({
            model,
            contents: `Material Title: ${title || 'Academic Study Material'}\nSource Format: ${materialType || 'text'}\n\n${depthInstructions}\n\nUploaded Source Content:\n${synthesisSource}`,
            config: {
              systemInstruction:
                'You are Brainstine, an academic study companion. Prioritize the uploaded material strictly. Never fabricate facts or claim unsupported information came from the source. Clearly separate facts directly extracted from the material (sourcePoints, origin: "source", importantFacts) from helpful AI explanations/elaborations (aiClarification, plainExplanation, origin: "ai_clarification" or "ai_elaboration"). If no formulas or frameworks appear in the material, return an empty array for formulasOrFrameworks. Also generate comparisonTables whenever contrasting 2+ concepts/methods/entities (or empty array if unnecessary), and 1 to 2 visualDiagrams (process_flow, concept_map, scientific_system, or cartesian_plot) when a visual schematic helps students understand relationships, sequences, or systems cleanly.',
              ...getThinkingConfig(
                model,
                level === 'comprehensive' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW
              ),
              abortSignal: signal,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  subjectArea: { type: Type.STRING },
                  topicOverview: { type: Type.STRING },
                  mainConcepts: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        heading: { type: Type.STRING },
                        sourcePoints: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                          description: 'Main points drawn directly from the uploaded material.',
                        },
                        aiClarification: {
                          type: Type.STRING,
                          description:
                            'Brief AI-authored explanation or bridge clarifying why/how these source points connect.',
                        },
                      },
                      required: ['heading', 'sourcePoints', 'aiClarification'],
                    },
                  },
                  importantDefinitions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        term: { type: Type.STRING },
                        definition: { type: Type.STRING },
                        origin: {
                          type: Type.STRING,
                          description: '"source" if defined in material, or "ai_clarification" if AI supplemented.',
                        },
                      },
                      required: ['term', 'definition', 'origin'],
                    },
                  },
                  keyTerminology: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  difficultConceptExplanations: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        concept: { type: Type.STRING },
                        sourceContext: {
                          type: Type.STRING,
                          description: 'What the uploaded material states about this concept.',
                        },
                        plainExplanation: {
                          type: Type.STRING,
                          description: 'Clear AI-authored breakdown explaining the difficult concept step by step.',
                        },
                      },
                      required: ['concept', 'sourceContext', 'plainExplanation'],
                    },
                  },
                  importantFacts: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Key verifiable facts extracted directly from the uploaded material.',
                  },
                  relevantExamples: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        example: { type: Type.STRING },
                        origin: {
                          type: Type.STRING,
                          description: '"source" if present in uploaded material, or "ai_elaboration" if generated to illustrate.',
                        },
                      },
                      required: ['title', 'example', 'origin'],
                    },
                  },
                  formulasOrFrameworks: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        expressionOrStructure: { type: Type.STRING },
                        usage: { type: Type.STRING },
                      },
                      required: ['name', 'expressionOrStructure', 'usage'],
                    },
                  },
                  comparisonTables: {
                    type: Type.ARRAY,
                    description: 'Optional comparison matrices contrasting key concepts/processes.',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        headers: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        rows: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              criterion: { type: Type.STRING },
                              values: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                              },
                            },
                            required: ['criterion', 'values'],
                          },
                        },
                        caption: { type: Type.STRING },
                      },
                      required: ['title', 'headers', 'rows'],
                    },
                  },
                  visualDiagrams: {
                    type: Type.ARRAY,
                    description: '1-2 clear educational schematics/diagrams clarifying stages, concept maps, or quantitative trends.',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        type: {
                          type: Type.STRING,
                          description: '"process_flow" | "concept_map" | "scientific_system" | "cartesian_plot"',
                        },
                        title: { type: Type.STRING },
                        subject: { type: Type.STRING },
                        caption: { type: Type.STRING },
                        nodes: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              id: { type: Type.STRING },
                              label: { type: Type.STRING },
                              sublabel: { type: Type.STRING },
                              detail: { type: Type.STRING },
                              x: { type: Type.NUMBER },
                              y: { type: Type.NUMBER },
                              tone: { type: Type.STRING },
                            },
                            required: ['id', 'label'],
                          },
                        },
                        edges: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              from: { type: Type.STRING },
                              to: { type: Type.STRING },
                              label: { type: Type.STRING },
                            },
                            required: ['from', 'to'],
                          },
                        },
                        xAxisLabel: { type: Type.STRING },
                        yAxisLabel: { type: Type.STRING },
                        series: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              name: { type: Type.STRING },
                              color: { type: Type.STRING },
                              points: {
                                type: Type.ARRAY,
                                items: {
                                  type: Type.OBJECT,
                                  properties: {
                                    x: { type: Type.NUMBER },
                                    y: { type: Type.NUMBER },
                                    label: { type: Type.STRING },
                                  },
                                  required: ['x', 'y'],
                                },
                              },
                            },
                            required: ['name', 'points'],
                          },
                        },
                      },
                      required: ['type', 'title', 'caption'],
                    },
                  },
                  revisionNotes: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  keyTakeaways: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: [
                  'title',
                  'subjectArea',
                  'topicOverview',
                  'mainConcepts',
                  'importantDefinitions',
                  'keyTerminology',
                  'difficultConceptExplanations',
                  'importantFacts',
                  'relevantExamples',
                  'formulasOrFrameworks',
                  'comparisonTables',
                  'visualDiagrams',
                  'revisionNotes',
                  'keyTakeaways',
                ],
              },
            },
          }),
        { maxRetries: 1, timeoutMs: 75000 }
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());

      const validDiagramTypes = new Set([
        'process_flow',
        'concept_map',
        'comparison_matrix',
        'cartesian_plot',
        'scientific_system',
      ]);

      const baseSummary: Omit<StructuredSummary, 'markdown'> = {
        title: parsed.title || title || 'Study Summary',
        subjectArea: parsed.subjectArea || 'General Studies',
        summaryLevel: level,
        topicOverview: parsed.topicOverview || '',
        mainConcepts: Array.isArray(parsed.mainConcepts) ? parsed.mainConcepts : [],
        importantDefinitions: Array.isArray(parsed.importantDefinitions)
          ? parsed.importantDefinitions.map((d: { term: string; definition: string; origin?: string }) => ({
              term: d.term,
              definition: d.definition,
              origin: d.origin === 'ai_clarification' ? 'ai_clarification' : 'source',
            }))
          : [],
        keyTerminology: Array.isArray(parsed.keyTerminology) ? parsed.keyTerminology : [],
        difficultConceptExplanations: Array.isArray(parsed.difficultConceptExplanations)
          ? parsed.difficultConceptExplanations
          : [],
        importantFacts: Array.isArray(parsed.importantFacts) ? parsed.importantFacts : [],
        relevantExamples: Array.isArray(parsed.relevantExamples)
          ? parsed.relevantExamples.map((e: { title: string; example: string; origin?: string }) => ({
              title: e.title,
              example: e.example,
              origin: e.origin === 'source' ? 'source' : 'ai_elaboration',
            }))
          : [],
        formulasOrFrameworks: Array.isArray(parsed.formulasOrFrameworks)
          ? parsed.formulasOrFrameworks
          : [],
        comparisonTables: Array.isArray(parsed.comparisonTables)
          ? parsed.comparisonTables.filter(
              (t: { title?: string; headers?: unknown[]; rows?: unknown[] }) =>
                t && t.title && Array.isArray(t.headers) && Array.isArray(t.rows) && t.rows.length > 0
            )
          : [],
        visualDiagrams: Array.isArray(parsed.visualDiagrams)
          ? parsed.visualDiagrams.filter(
              (d: { type?: string; title?: string; nodes?: unknown[]; series?: unknown[] }) =>
                d &&
                d.title &&
                typeof d.type === 'string' &&
                validDiagramTypes.has(d.type) &&
                ((Array.isArray(d.nodes) && d.nodes.length >= 2) ||
                  (Array.isArray(d.series) && d.series.length >= 1))
            )
          : [],
        revisionNotes: Array.isArray(parsed.revisionNotes) ? parsed.revisionNotes : [],
        keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
        wordCount: countWords(extractedText),
        chunkCount: chunks.length,
        generatedAt: new Date().toISOString(),
      };

      const fullSummary: StructuredSummary = {
        ...baseSummary,
        markdown: buildMarkdownSummary(baseSummary),
      };

      return res.json(fullSummary);
    } catch (err: unknown) {
      console.error('Summary generation failed:', err);
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/summaries/followup', async (req: Request, res: Response) => {
    try {
      const { actionType, question, summary, sourceText } = req.body as {
        actionType?: 'question' | 'simpler_explanation' | 'examples' | 'revision_notes';
        question?: string;
        summary?: StructuredSummary;
        sourceText?: string;
      };

      if (!summary) {
        return res.status(400).json({ error: 'A generated summary is required for follow-up queries.' });
      }

      const mode = actionType || 'question';
      if (mode === 'question' && (!question || !question.trim())) {
        return res.status(400).json({ error: 'Please enter a follow-up question about the summary.' });
      }

      const ai = getGeminiClient();

      const promptTask =
        mode === 'simpler_explanation'
          ? 'Provide a much simpler, intuitive explanation of the core concepts in this study summary as if explaining to a beginner student.'
          : mode === 'examples'
            ? 'Provide 3 concrete, relatable academic or real-world examples illustrating the key concepts in this study summary.'
            : mode === 'revision_notes'
              ? 'Generate a focused, high-yield bulleted set of exam revision notes based directly on this summary and material.'
              : `Answer the student's follow-up question clearly: "${question?.trim()}"`;

      const contextSnippet = sourceText
        ? sourceText.slice(0, 18000)
        : summary.markdown.slice(0, 12000);

      const response = await withRetry(
        (signal) => {
          const model = getGeminiModel();
          return ai.models.generateContent({
            model,
            contents: `Study Summary Title: ${summary.title}\nSubject: ${summary.subjectArea}\n\nSummary Content:\n${summary.markdown}\n\nUploaded Source Excerpt:\n${contextSnippet}\n\nStudent Request: ${promptTask}`,
            config: {
              systemInstruction:
                'You are Brainstine answering a scoped follow-up request on a specific study summary. Strictly separate what is explicitly stated in the uploaded source material ("fromSource") from any supplemental AI explanation, analogy, or examples ("aiExplanation"). Never claim AI-generated examples or clarifications came from the source text if they did not.',
              ...getThinkingConfig(model, ThinkingLevel.LOW),
              abortSignal: signal,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  fromSource: {
                    type: Type.STRING,
                    description:
                      'Facts, statements, or context drawn directly from the uploaded material/summary (or "Not explicitly stated in the source material" if the question asks for outside elaboration).',
                  },
                  aiExplanation: {
                    type: Type.STRING,
                    description:
                      'Clear, helpful AI-authored explanation, simplification, examples, or revision notes addressing the student request.',
                  },
                },
                required: ['fromSource', 'aiExplanation'],
              },
            },
          });
        },
        { maxRetries: 1, timeoutMs: 45000 }
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        fromSource: parsed.fromSource || 'Grounded in the uploaded summary.',
        aiExplanation: parsed.aiExplanation || '',
      });
    } catch (err: unknown) {
      console.error('Follow-up query failed:', err);
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/quizzes/generate', async (req: Request, res: Response) => {
    try {
      const {
        sourceMode,
        sourceText,
        topicTitle,
        format,
        difficulty,
        questionCount,
      } = req.body as {
        sourceMode?: QuizSourceMode;
        sourceText?: string;
        topicTitle?: string;
        format?: QuizFormat;
        difficulty?: QuizDifficulty;
        questionCount?: number;
      };

      const cleanTitle = (topicTitle || '').trim();
      const cleanSource = (sourceText || '').trim();
      const mode: QuizSourceMode =
        sourceMode === 'material' ||
        sourceMode === 'summary' ||
        sourceMode === 'text' ||
        sourceMode === 'topic'
          ? sourceMode
          : 'topic';

      if (mode === 'topic' && cleanTitle.length < 3) {
        return res.status(400).json({
          error: 'Please enter a subject or topic (at least 3 characters) to generate a quiz.',
        });
      }
      if (mode !== 'topic' && cleanSource.length < 30) {
        return res.status(400).json({
          error: 'Please select a study material, saved summary, or paste at least 30 characters of text.',
        });
      }

      const validFormat: QuizFormat =
        format === 'objective' || format === 'theory' || format === 'mixed'
          ? format
          : 'objective';

      const validDifficulty: QuizDifficulty =
        difficulty === 'easy' ||
        difficulty === 'intermediate' ||
        difficulty === 'advanced' ||
        difficulty === 'mixed'
          ? difficulty
          : 'intermediate';

      const totalCount =
        questionCount === 10 ||
        questionCount === 20 ||
        questionCount === 30 ||
        questionCount === 40
          ? questionCount
          : 10;

      const ai = getGeminiClient();

      // Batch into chunks of max 15-20 to guarantee clean JSON completion even for 30/40 questions
      const batchSizes: number[] = [];
      if (totalCount <= 20) {
        batchSizes.push(totalCount);
      } else if (totalCount === 30) {
        batchSizes.push(15, 15);
      } else {
        batchSizes.push(20, 20);
      }

      const allQuestions: QuizQuestion[] = [];
      let detectedTitle = cleanTitle || 'Academic Assessment';
      let detectedSubject = 'General Studies';

      const sourceContext =
        mode === 'topic'
          ? `Academic Topic / Subject: ${cleanTitle}`
          : `Title: ${cleanTitle || 'Study Material'}\nSource Content:\n${cleanSource.slice(0, 28000)}`;

      for (let b = 0; b < batchSizes.length; b++) {
        const batchCount = batchSizes[b];
        const objTarget =
          validFormat === 'objective'
            ? batchCount
            : validFormat === 'theory'
              ? 0
              : Math.round(batchCount * 0.7);
        const theoryTarget = batchCount - objTarget;

        const existingStems = allQuestions.map((q) => `- ${q.question}`).join('\n');
        const avoidDuplicatesClause = existingStems
          ? `\nDo NOT repeat or closely paraphrase any of these already-generated questions:\n${existingStems}`
          : '';

        const difficultyGuide =
          validDifficulty === 'easy'
            ? 'EASY difficulty: test foundational recall, core definitions, and direct comprehension.'
            : validDifficulty === 'intermediate'
              ? 'INTERMEDIATE difficulty: test conceptual understanding, relationships, and applied reasoning.'
              : validDifficulty === 'advanced'
                ? 'ADVANCED difficulty: test rigorous analytical synthesis, edge cases, multi-step problem solving, and deep academic mastery.'
                : 'MIXED difficulty: distribute questions progressively across Easy (foundational recall), Intermediate (conceptual application), and Advanced (deep analytical synthesis).';

        const formatGuide =
          validFormat === 'objective'
            ? `Generate exactly ${batchCount} OBJECTIVE (multiple-choice) questions. Every question MUST have type="objective", exactly 4 distinct options (A, B, C, D) in the options array, a valid correctOptionIndex (0, 1, 2, or 3), expectedAnswer matching the correct option text, maxMarks=1, and a clear educational explanation.`
            : validFormat === 'theory'
              ? `Generate exactly ${batchCount} THEORY (short-answer / essay) questions testing explanation and application. Every question MUST have type="theory", empty options array [], expectedAnswer with a complete model answer, 2 to 4 concrete markingCriteria points, maxMarks=5, and an explanation.`
              : `Generate exactly ${batchCount} MIXED questions: ${objTarget} OBJECTIVE questions (type="objective", 4 options, correctOptionIndex 0-3, maxMarks=1) followed by ${theoryTarget} THEORY questions (type="theory", empty options [], expectedAnswer, 2-4 markingCriteria points, maxMarks=5).`;

        const response = await withRetry(
          (signal) => {
            const model = getGeminiModel();
            return ai.models.generateContent({
              model,
              contents: `${sourceContext}\n\nDifficulty: ${difficultyGuide}\nFormat Requirements: ${formatGuide}${avoidDuplicatesClause}`,
              config: {
                systemInstruction:
                  'You are Brainstine Assessment Engine, an academic professor creating rigorous, unambiguous university-grade examinations. Base questions strictly on the supplied study material (or established academic canon when generating from a topic). Every objective question must have exactly ONE defensible correct answer among four plausible options. Never fabricate false facts. Optionally attach a visualAid diagram ONLY to 1 or 2 questions where a process diagram, quantitative plot, or labeled system genuinely helps test understanding.',
                ...getThinkingConfig(model, ThinkingLevel.LOW),
                abortSignal: signal,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    subjectArea: { type: Type.STRING },
                    questions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          type: {
                            type: Type.STRING,
                            description: '"objective" or "theory"',
                          },
                          question: { type: Type.STRING },
                          options: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: 'Exactly 4 options for objective questions, empty array for theory.',
                          },
                          correctOptionIndex: {
                            type: Type.INTEGER,
                            description: '0-3 for objective questions, 0 for theory.',
                          },
                          expectedAnswer: { type: Type.STRING },
                          markingCriteria: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                          },
                          maxMarks: { type: Type.INTEGER },
                          explanation: { type: Type.STRING },
                          topicTag: { type: Type.STRING },
                          visualAid: {
                            type: Type.OBJECT,
                            description: 'Optional diagram ONLY if visual context enhances this question without revealing the answer.',
                            properties: {
                              type: { type: Type.STRING },
                              title: { type: Type.STRING },
                              caption: { type: Type.STRING },
                              nodes: {
                                type: Type.ARRAY,
                                items: {
                                  type: Type.OBJECT,
                                  properties: {
                                    id: { type: Type.STRING },
                                    label: { type: Type.STRING },
                                    sublabel: { type: Type.STRING },
                                  },
                                  required: ['id', 'label'],
                                },
                              },
                              edges: {
                                type: Type.ARRAY,
                                items: {
                                  type: Type.OBJECT,
                                  properties: {
                                    from: { type: Type.STRING },
                                    to: { type: Type.STRING },
                                    label: { type: Type.STRING },
                                  },
                                  required: ['from', 'to'],
                                },
                              },
                              xAxisLabel: { type: Type.STRING },
                              yAxisLabel: { type: Type.STRING },
                              series: {
                                type: Type.ARRAY,
                                items: {
                                  type: Type.OBJECT,
                                  properties: {
                                    name: { type: Type.STRING },
                                    points: {
                                      type: Type.ARRAY,
                                      items: {
                                        type: Type.OBJECT,
                                        properties: {
                                          x: { type: Type.NUMBER },
                                          y: { type: Type.NUMBER },
                                          label: { type: Type.STRING },
                                        },
                                        required: ['x', 'y'],
                                      },
                                    },
                                  },
                                  required: ['name', 'points'],
                                },
                              },
                            },
                            required: ['type', 'title'],
                          },
                        },
                        required: [
                          'type',
                          'question',
                          'options',
                          'correctOptionIndex',
                          'expectedAnswer',
                          'markingCriteria',
                          'maxMarks',
                          'explanation',
                          'topicTag',
                        ],
                      },
                    },
                  },
                  required: ['title', 'subjectArea', 'questions'],
                },
              },
            });
          },
          { maxRetries: 1, timeoutMs: 75000 }
        );

        const parsed = JSON.parse((response.text ?? '{}').trim());
        if (b === 0) {
          detectedTitle = cleanTitle || parsed.title || 'Academic Assessment';
          detectedSubject = parsed.subjectArea || 'General Studies';
        }

        const rawQs = Array.isArray(parsed.questions) ? parsed.questions : [];
        for (const q of rawQs) {
          if (allQuestions.length >= totalCount) break;
          const qType: 'objective' | 'theory' =
            validFormat === 'objective'
              ? 'objective'
              : validFormat === 'theory'
                ? 'theory'
                : q.type === 'theory'
                  ? 'theory'
                  : 'objective';

          const opts =
            qType === 'objective' && Array.isArray(q.options) && q.options.length === 4
              ? q.options.map((o: unknown) => String(o))
              : qType === 'objective'
                ? [
                    String(q.options?.[0] || 'Option A'),
                    String(q.options?.[1] || 'Option B'),
                    String(q.options?.[2] || 'Option C'),
                    String(q.options?.[3] || 'Option D'),
                  ]
                : undefined;

          const safeCorrectIdx =
            qType === 'objective'
              ? Math.min(3, Math.max(0, Number(q.correctOptionIndex) || 0))
              : undefined;

          const validVisualTypes = new Set([
            'process_flow',
            'concept_map',
            'cartesian_plot',
            'scientific_system',
          ]);
          const visualAid =
            q.visualAid &&
            typeof q.visualAid === 'object' &&
            q.visualAid.title &&
            validVisualTypes.has(String(q.visualAid.type)) &&
            ((Array.isArray(q.visualAid.nodes) && q.visualAid.nodes.length >= 2) ||
              (Array.isArray(q.visualAid.series) && q.visualAid.series.length >= 1))
              ? q.visualAid
              : undefined;

          allQuestions.push({
            id: `q-${allQuestions.length + 1}`,
            number: allQuestions.length + 1,
            type: qType,
            question: String(q.question || '').trim(),
            options: opts,
            correctOptionIndex: safeCorrectIdx,
            expectedAnswer:
              qType === 'objective' && opts && safeCorrectIdx !== undefined
                ? opts[safeCorrectIdx]
                : String(q.expectedAnswer || '').trim(),
            markingCriteria:
              qType === 'theory' && Array.isArray(q.markingCriteria)
                ? q.markingCriteria.map((c: unknown) => String(c))
                : undefined,
            maxMarks: qType === 'objective' ? 1 : Math.max(2, Number(q.maxMarks) || 5),
            explanation: String(q.explanation || '').trim(),
            topicTag: String(q.topicTag || detectedSubject),
            ...(visualAid ? { visualAid } : {}),
          });
        }
      }

      if (allQuestions.length === 0) {
        return res.status(500).json({
          error: 'Could not generate assessment questions from the supplied content.',
        });
      }

      const payload: GeneratedQuizPayload = {
        title: detectedTitle,
        subjectArea: detectedSubject,
        format: validFormat,
        difficulty: validDifficulty,
        questionCount: allQuestions.length,
        questions: allQuestions,
      };

      return res.json(payload);
    } catch (err: unknown) {
      console.error('Quiz generation failed:', err);
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/quizzes/grade', async (req: Request, res: Response) => {
    try {
      const { quizTitle, questions, answers, timeTakenSeconds } = req.body as {
        quizTitle?: string;
        questions?: QuizQuestion[];
        answers?: StudentAnswer[];
        timeTakenSeconds?: number;
      };

      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'Quiz questions are required for grading.' });
      }

      const answerMap = new Map<string, StudentAnswer>();
      for (const ans of answers || []) {
        answerMap.set(ans.questionId, ans);
      }

      const gradedResults: GradedQuestionResult[] = [];
      const theoryQueue: { q: QuizQuestion; responseText: string; resultIndex: number }[] = [];

      questions.forEach((q, idx) => {
        const ans = answerMap.get(q.id);
        if (q.type === 'objective') {
          const selected =
            ans?.selectedOptionIndex !== undefined && ans?.selectedOptionIndex !== null
              ? ans.selectedOptionIndex
              : null;
          const correctIdx = q.correctOptionIndex ?? 0;
          const options = q.options || ['Option A', 'Option B', 'Option C', 'Option D'];
          const letter = (i: number) => String.fromCharCode(65 + i);

          if (selected === null) {
            gradedResults.push({
              questionId: q.id,
              number: q.number || idx + 1,
              type: 'objective',
              question: q.question,
              options,
              correctOptionIndex: correctIdx,
              selectedOptionIndex: null,
              studentAnswerDisplay: 'No answer selected',
              expectedAnswerDisplay: `${letter(correctIdx)}. ${options[correctIdx] || q.expectedAnswer}`,
              status: 'unanswered',
              marksAwarded: 0,
              maxMarks: q.maxMarks || 1,
              feedback: 'This question was left unanswered.',
              explanation: q.explanation,
              aiEvaluated: false,
            });
          } else if (selected === correctIdx) {
            gradedResults.push({
              questionId: q.id,
              number: q.number || idx + 1,
              type: 'objective',
              question: q.question,
              options,
              correctOptionIndex: correctIdx,
              selectedOptionIndex: selected,
              studentAnswerDisplay: `${letter(selected)}. ${options[selected] || ''}`,
              expectedAnswerDisplay: `${letter(correctIdx)}. ${options[correctIdx] || q.expectedAnswer}`,
              status: 'correct',
              marksAwarded: q.maxMarks || 1,
              maxMarks: q.maxMarks || 1,
              feedback: 'Correct selection.',
              explanation: q.explanation,
              aiEvaluated: false,
            });
          } else {
            gradedResults.push({
              questionId: q.id,
              number: q.number || idx + 1,
              type: 'objective',
              question: q.question,
              options,
              correctOptionIndex: correctIdx,
              selectedOptionIndex: selected,
              studentAnswerDisplay: `${letter(selected)}. ${options[selected] || ''}`,
              expectedAnswerDisplay: `${letter(correctIdx)}. ${options[correctIdx] || q.expectedAnswer}`,
              status: 'incorrect',
              marksAwarded: 0,
              maxMarks: q.maxMarks || 1,
              feedback: `Incorrect. You selected option ${letter(selected)}, whereas option ${letter(correctIdx)} is correct.`,
              explanation: q.explanation,
              aiEvaluated: false,
            });
          }
        } else {
          const responseText = (ans?.textResponse || '').trim();
          const resultIndex = gradedResults.length;
          if (!responseText) {
            gradedResults.push({
              questionId: q.id,
              number: q.number || idx + 1,
              type: 'theory',
              question: q.question,
              studentAnswerDisplay: 'No response submitted',
              expectedAnswerDisplay: q.expectedAnswer,
              status: 'unanswered',
              marksAwarded: 0,
              maxMarks: q.maxMarks || 5,
              feedback: 'No written answer was provided for this theory question.',
              missingPoints: q.markingCriteria || [],
              explanation: q.explanation,
              aiEvaluated: false,
            });
          } else {
            // Placeholder to preserve index ordering; populated by AI theory grader below
            gradedResults.push({
              questionId: q.id,
              number: q.number || idx + 1,
              type: 'theory',
              question: q.question,
              studentAnswerDisplay: responseText,
              expectedAnswerDisplay: q.expectedAnswer,
              status: 'incorrect',
              marksAwarded: 0,
              maxMarks: q.maxMarks || 5,
              feedback: '',
              missingPoints: [],
              explanation: q.explanation,
              aiEvaluated: true,
            });
            theoryQueue.push({ q, responseText, resultIndex });
          }
        }
      });

      if (theoryQueue.length > 0) {
        const ai = getGeminiClient();
        const batchPayload = theoryQueue.map((item) => ({
          questionId: item.q.id,
          question: item.q.question,
          maxMarks: item.q.maxMarks || 5,
          expectedAnswer: item.q.expectedAnswer,
          markingCriteria: item.q.markingCriteria || [],
          studentResponse: item.responseText,
        }));

        const evalRes = await withRetry(
          (signal) => {
            const model = getGeminiModel();
            return ai.models.generateContent({
              model,
              contents: `Examination Title: ${quizTitle || 'Academic Assessment'}\n\nEvaluate each student theory response fairly and strictly against the expectedAnswer and markingCriteria:\n${JSON.stringify(batchPayload, null, 2)}`,
              config: {
                systemInstruction:
                  'You are an objective academic examiner evaluating student theory answers. Award marks from 0 up to maxMarks based strictly on how accurately and completely the student addressed the marking criteria. Provide concise, constructive feedback and list any important missing points.',
                ...getThinkingConfig(model, ThinkingLevel.LOW),
                abortSignal: signal,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    evaluations: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          questionId: { type: Type.STRING },
                          marksAwarded: { type: Type.NUMBER },
                          feedback: { type: Type.STRING },
                          missingPoints: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                          },
                        },
                        required: ['questionId', 'marksAwarded', 'feedback', 'missingPoints'],
                      },
                    },
                  },
                  required: ['evaluations'],
                },
              },
            });
          },
          { maxRetries: 1, timeoutMs: 60000 }
        );

        const parsedEval = JSON.parse((evalRes.text ?? '{}').trim());
        const evalMap = new Map<
          string,
          { marksAwarded: number; feedback: string; missingPoints: string[] }
        >();
        for (const ev of parsedEval.evaluations || []) {
          evalMap.set(String(ev.questionId), {
            marksAwarded: Number(ev.marksAwarded) || 0,
            feedback: String(ev.feedback || ''),
            missingPoints: Array.isArray(ev.missingPoints)
              ? ev.missingPoints.map((m: unknown) => String(m))
              : [],
          });
        }

        for (const item of theoryQueue) {
          const ev = evalMap.get(item.q.id);
          const maxM = item.q.maxMarks || 5;
          const clamped = ev
            ? Math.min(maxM, Math.max(0, Math.round(ev.marksAwarded * 10) / 10))
            : 0;
          const ratio = maxM > 0 ? clamped / maxM : 0;

          gradedResults[item.resultIndex] = {
            ...gradedResults[item.resultIndex],
            marksAwarded: clamped,
            status: ratio >= 0.75 ? 'correct' : ratio >= 0.35 ? 'partial' : 'incorrect',
            feedback:
              ev?.feedback ||
              'Automated AI evaluation completed against expected marking criteria.',
            missingPoints: ev?.missingPoints || [],
            aiEvaluated: true,
          };
        }
      }

      const correctCount = gradedResults.filter((r) => r.status === 'correct').length;
      const unansweredCount = gradedResults.filter((r) => r.status === 'unanswered').length;
      const incorrectCount = gradedResults.length - correctCount - unansweredCount;
      const earnedMarks = Math.round(
        gradedResults.reduce((acc, r) => acc + r.marksAwarded, 0) * 10
      ) / 10;
      const maxMarks = gradedResults.reduce((acc, r) => acc + r.maxMarks, 0);
      const percentage =
        maxMarks > 0 ? Math.round((earnedMarks / maxMarks) * 1000) / 10 : 0;

      let performanceAssessment = '';
      if (percentage >= 85) {
        performanceAssessment =
          'Strong mastery demonstrated across the tested concepts. Review any minor missed nuances below to maintain retention.';
      } else if (percentage >= 70) {
        performanceAssessment =
          'Solid foundational grasp with a few conceptual gaps. Revisit the highlighted explanations and marking feedback below.';
      } else if (percentage >= 50) {
        performanceAssessment =
          'Developing understanding. Focus your next revision session on the topics missed below before attempting another examination.';
      } else {
        performanceAssessment =
          'Significant gaps identified in this assessment. Review your study summary and key definitions carefully, then retake this quiz.';
      }

      const responsePayload: QuizGradingResponse = {
        totalQuestions: gradedResults.length,
        correctCount,
        incorrectCount,
        unansweredCount,
        earnedMarks,
        maxMarks,
        percentage,
        timeTakenSeconds: Math.max(0, Number(timeTakenSeconds) || 0),
        performanceAssessment,
        gradedResults,
      };

      return res.json(responsePayload);
    } catch (err: unknown) {
      console.error('Quiz grading failed:', err);
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  const SUPPORTED_VISION_MIMES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ]);

  function getImageActionDirective(action?: ImageActionType): string {
    switch (action) {
      case 'explain':
        return 'IMAGE ACTION — EXPLAIN THIS: Read and interpret everything visible in this image. Identify the academic subject, explain all key concepts in clear language, and clarify any labels, equations, or notes shown.';
      case 'solve':
        return 'IMAGE ACTION — SOLVE THIS QUESTION: Read the question(s) shown in the image carefully and provide a complete, step-by-step academic solution with clear reasoning and final answer verification.';
      case 'summarize_page':
        return 'IMAGE ACTION — SUMMARIZE THIS PAGE: Extract the core information from this textbook or note page and organize it into a crisp, structured academic summary with main headings and key points.';
      case 'explain_diagram':
        return 'IMAGE ACTION — EXPLAIN THIS DIAGRAM: Identify the type of diagram, illustration, chart, or anatomy figure, describe each labeled component and its function/relationship, and explain the overall process or concept.';
      case 'key_points':
        return 'IMAGE ACTION — IDENTIFY KEY POINTS: Extract and highlight the highest-yield academic facts, definitions, formulas, and takeaways visible in this image.';
      case 'generate_questions':
        return 'IMAGE ACTION — GENERATE QUESTIONS: Create 5 well-crafted practice questions (a mix of multiple-choice and short-answer) grounded strictly in the material visible in this image, along with an Answer Key & Brief Explanations section at the bottom.';
      case 'teach_topic':
        return 'IMAGE ACTION — TEACH ME THIS TOPIC: Use the uploaded image as the lesson anchor. Identify the topic, break down Step 1 clearly with a simple example, and invite the student to check their understanding before moving to Step 2.';
      default:
        return '';
    }
  }

  function validateVisionImage(image?: {
    data?: string;
    mimeType?: string;
  }): { data: string; mimeType: string } | null {
    if (!image || !image.data) return null;
    const rawMime = (image.mimeType || '').toLowerCase();
    if (!SUPPORTED_VISION_MIMES.has(rawMime)) {
      throw new Error(
        'Unsupported image format. Please attach a JPG, JPEG, PNG, or WEBP image.'
      );
    }
    const cleanBase64 = image.data.replace(/^data:[^;]+;base64,/, '').trim();
    const approxBytes = Math.ceil((cleanBase64.length * 3) / 4);
    if (approxBytes > 15 * 1024 * 1024) {
      throw new Error('Attached image exceeds the 15 MB limit. Please choose a smaller image.');
    }
    return {
      data: cleanBase64,
      mimeType: rawMime === 'image/jpg' ? 'image/jpeg' : rawMime,
    };
  }

  function sanitizeConversationHistory(
    history: unknown,
    maxTurns = 10,
    maxCharsPerTurn = 1800
  ): { role: 'user' | 'assistant'; content: string }[] {
    if (!Array.isArray(history)) return [];
    return history
      .slice(-maxTurns)
      .filter(
        (h): h is { role: 'user' | 'assistant'; content: string } =>
          Boolean(h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
      )
      .map((h) => ({
        role: h.role,
        content:
          h.content.length > maxCharsPerTurn
            ? `${h.content.slice(0, maxCharsPerTurn)}\n...[truncated for brevity]`
            : h.content,
      }));
  }

  function buildAiChatParts(body: {
    message?: string;
    history?: unknown;
    documentContext?: { title: string; type: string; content: string } | null;
    image?: { data?: string; mimeType?: string } | null;
    imageAction?: ImageActionType;
    explanationStyle?: 'default' | 'shorter' | 'simpler' | 'detailed';
    needsTitle?: boolean;
  }) {
    const cleanMessage = (body.message || '').trim();
    const validatedImage = validateVisionImage(body.image || undefined);

    if (!cleanMessage && !validatedImage) {
      throw Object.assign(
        new Error('Please enter an academic question or attach an image to analyze.'),
        { statusCode: 400 }
      );
    }

    const recentHistory = sanitizeConversationHistory(body.history, 10, 1800);
    const historyBlock = recentHistory
      .map((h) => `${h.role === 'user' ? 'Student' : 'Brainstine'}: ${h.content}`)
      .join('\n\n');

    const docBlock =
      body.documentContext && body.documentContext.content
        ? `\n\nUPLOADED STUDY DOCUMENT CONTEXT (${body.documentContext.type}: "${body.documentContext.title}"):\n${body.documentContext.content.slice(0, 16000)}`
        : '\n\nNo external uploaded document is attached to this chat. Do NOT claim to have read any uploaded file unless text or an image is provided right here.';

    const styleDirective =
      body.explanationStyle === 'shorter'
        ? 'Keep your response concise and focused on the core points.'
        : body.explanationStyle === 'simpler'
          ? 'Explain in plain, beginner-friendly language using an intuitive analogy and avoiding unnecessary jargon.'
          : body.explanationStyle === 'detailed'
            ? 'Provide a comprehensive, university-level explanation with thorough step-by-step reasoning, comparisons, and examples.'
            : '';

    const actionDirective = getImageActionDirective(body.imageAction);

    const userTextPrompt = [
      historyBlock ? `RECENT CONVERSATION CONTEXT:\n${historyBlock}\n` : '',
      actionDirective ? `${actionDirective}\n` : '',
      styleDirective ? `RESPONSE STYLE: ${styleDirective}\n` : '',
      `STUDENT MESSAGE:\n${cleanMessage || 'Please analyze the attached academic image according to the requested action.'}`,
    ]
      .filter(Boolean)
      .join('\n');

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (validatedImage) {
      parts.push({
        inlineData: {
          mimeType: validatedImage.mimeType,
          data: validatedImage.data,
        },
      });
    }
    parts.push({ text: userTextPrompt });

    const systemInstruction = `You are Brainstine Academic Chat, a rigorous, helpful university academic assistant supporting Biology, Chemistry, Physics, Mathematics, Medicine, Dentistry, Computer Science, Engineering, and Humanities.
Rules:
- Provide accurate, clearly structured answers formatted in clean Markdown: use headings, bullet lists, numbered steps, Markdown tables (| Column | ... |) for comparisons, formatted math ($inline$ or $$display$$), > **Key Concept:** callout highlights, and fenced code blocks where appropriate.
- When—and ONLY when—a visual diagram genuinely clarifies a cycle, hierarchy, labeled system, or quantitative curve, include ONE single-line diagram block on its own line:
  [[DIAGRAM:{"type":"process_flow","title":"...","subject":"...","caption":"...","nodes":[{"id":"n1","label":"...","sublabel":"...","detail":"..."}],"edges":[{"from":"n1","to":"n2","label":"..."}]}]]
  Supported types: "process_flow", "concept_map", "scientific_system", "cartesian_plot". Never invent raw ASCII art when a structured table or [[DIAGRAM:...]] is clearer.
- Support step-by-step academic calculations and problem solving.
- Be thorough yet concise and scannable; avoid unnecessary filler or repetition.
- If an image is provided (or active in this conversation): read visible text, equations, diagrams, charts, or handwritten notes carefully. Clearly state if handwriting blur, low resolution, or cropped edges prevent confident interpretation—NEVER fabricate text, numbers, or diagram labels that are not clearly legible.
- If document context is provided, prioritize and reference that material accurately. Never pretend to have accessed a file that was not supplied.${docBlock}`;

    return { parts, systemInstruction, needsTitle: Boolean(body.needsTitle) };
  }

  function buildAiTutorParts(body: {
    message?: string;
    history?: unknown;
    tutorMode?: TutorMode;
    currentTopic?: string;
    currentStep?: number;
    quickAction?: string;
    documentContext?: { title: string; type: string; content: string } | null;
    image?: { data?: string; mimeType?: string } | null;
    imageAction?: ImageActionType;
  }) {
    const cleanMessage = (body.message || '').trim();
    const validatedImage = validateVisionImage(body.image || undefined);

    if (!cleanMessage && !validatedImage && !body.quickAction) {
      throw Object.assign(
        new Error('Please enter a topic, question, or attach an image to start tutoring.'),
        { statusCode: 400 }
      );
    }

    const mode: TutorMode =
      body.tutorMode === 'beginner' || body.tutorMode === 'standard' || body.tutorMode === 'advanced'
        ? body.tutorMode
        : 'standard';

    const recentHistory = sanitizeConversationHistory(body.history, 10, 1600);
    const historyBlock = recentHistory
      .map((h) => `${h.role === 'user' ? 'Student' : 'Tutor'}: ${h.content}`)
      .join('\n\n');

    const docBlock =
      body.documentContext && body.documentContext.content
        ? `\n\nREFERENCE STUDY MATERIAL ("${body.documentContext.title}"):\n${body.documentContext.content.slice(0, 14000)}`
        : '';

    const modeGuide =
      mode === 'beginner'
        ? 'BEGINNER MODE: Use plain everyday language, foundational concepts, relatable analogies, and small incremental steps. Define any technical term before using it.'
        : mode === 'standard'
          ? 'STANDARD MODE: Use clear university-level explanations, structured reasoning, concrete academic examples, and check conceptual understanding along the way.'
          : 'ADVANCED MODE: Use rigorous academic terminology, formal derivations/mechanisms, nuanced edge cases, and challenging applied questions.';

    const actionDirective = getImageActionDirective(body.imageAction);

    const userTurn = [
      historyBlock ? `TUTORING SESSION HISTORY:\n${historyBlock}\n` : '',
      body.currentTopic ? `CURRENT TOPIC: ${body.currentTopic}\n` : '',
      `CURRENT SESSION STEP: ${body.currentStep || 1}\n`,
      body.quickAction ? `STUDENT INTERACTIVE COMMAND: ${body.quickAction}\n` : '',
      actionDirective ? `${actionDirective}\n` : '',
      `STUDENT INPUT:\n${cleanMessage || body.quickAction || 'Please teach me the material shown in the attached image step by step.'}`,
    ]
      .filter(Boolean)
      .join('\n');

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (validatedImage) {
      parts.push({
        inlineData: {
          mimeType: validatedImage.mimeType,
          data: validatedImage.data,
        },
      });
    }
    parts.push({ text: userTurn });

    const systemInstruction = `You are Brainstine Personal AI Tutor — a patient, structured, interactive academic tutor.
Core Pedagogical Rules:
- Teach progressively one focused step at a time (~180 to 350 words per turn) rather than dumping an entire textbook chapter at once.
- ${modeGuide}
- Break difficult ideas into digestible steps, introduce a practical example or analogy before advancing complexity, and explain technical terminology clearly. Use Markdown headings, bullet lists, comparison tables (| ... | ... |) when contrasting ideas, clean equations ($...$ / $$...$$), and > **Key Concept:** highlights.
- When a structured visual diagram genuinely helps explain a step (such as a cycle, pathway, concept tree, scientific system, or plotted curve), you may include ONE single-line diagram marker on its own line:
  [[DIAGRAM:{"type":"process_flow","title":"...","subject":"...","caption":"...","nodes":[{"id":"n1","label":"...","sublabel":"..."}],"edges":[{"from":"n1","to":"n2"}]}]]
- When the student answers a practice check question, evaluate their answer kindly: identify misunderstandings, explain why their answer is right or wrong, and clarify the reasoning before moving forward.
- End with a short check-for-understanding question or concrete next step.
- If an image is present, analyze legible text, equations, diagrams, or handwritten problems faithfully; clearly inform the student if any portion is blurry or illegible instead of guessing.${docBlock}`;

    return {
      parts,
      systemInstruction,
      mode,
      currentTopic: body.currentTopic,
    };
  }

  function initSseResponse(res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write('event: start\ndata: {}\n\n');
  }

  function writeSseEvent(res: Response, event: string, data: unknown) {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function stripTrailingMetaMarker<T extends Record<string, unknown>>(
    fullText: string,
    markerPrefix: string
  ): { cleanText: string; meta: Partial<T> } {
    const idx = fullText.lastIndexOf(markerPrefix);
    if (idx === -1) {
      return { cleanText: fullText.trim(), meta: {} };
    }
    const cleanText = fullText.slice(0, idx).trim();
    const afterPrefix = fullText.slice(idx + markerPrefix.length);
    const endIdx = afterPrefix.lastIndexOf(']]');
    const jsonCandidate = (endIdx >= 0 ? afterPrefix.slice(0, endIdx) : afterPrefix).trim();
    try {
      const parsed = JSON.parse(jsonCandidate) as Partial<T>;
      return { cleanText, meta: parsed };
    } catch {
      return { cleanText, meta: {} };
    }
  }

  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    try {
      const { parts, systemInstruction, needsTitle } = buildAiChatParts(req.body || {});
      const ai = getGeminiClient();

      const model = getGeminiModel();

      if (needsTitle) {
        const response = await withRetry(
          (signal) =>
            ai.models.generateContent({
              model,
              contents: { parts },
              config: {
                systemInstruction,
                ...getThinkingConfig(model, ThinkingLevel.LOW),
                abortSignal: signal,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    suggestedTitle: {
                      type: Type.STRING,
                      description: 'Concise 3-6 word academic title for this conversation.',
                    },
                    subjectArea: {
                      type: Type.STRING,
                      description: 'Academic discipline (e.g., Organic Chemistry, Calculus, Anatomy).',
                    },
                    reply: {
                      type: Type.STRING,
                      description: 'Full Markdown-formatted academic answer.',
                    },
                  },
                  required: ['suggestedTitle', 'subjectArea', 'reply'],
                },
              },
            }),
          { maxRetries: 1, timeoutMs: 45000 }
        );
        const parsed = JSON.parse((response.text ?? '{}').trim());
        return res.json({
          reply: String(parsed.reply || '').trim(),
          suggestedTitle: String(parsed.suggestedTitle || 'Academic Study Chat').trim(),
          subjectArea: String(parsed.subjectArea || 'General Studies').trim(),
        });
      }

      const response = await withRetry(
        (signal) =>
          ai.models.generateContent({
            model,
            contents: { parts },
            config: {
              systemInstruction,
              ...getThinkingConfig(model, ThinkingLevel.LOW),
              abortSignal: signal,
            },
          }),
        { maxRetries: 1, timeoutMs: 45000 }
      );

      return res.json({
        reply: (response.text ?? '').trim(),
      });
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { statusCode?: number })?.statusCode === 'number'
          ? (err as { statusCode: number }).statusCode
          : null;
      if (statusCode) {
        return res.status(statusCode).json({ error: (err as Error).message });
      }
      console.error('AI Chat failed:', err);
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  function getSafeStreamEnd(
    fullText: string,
    markerPrefix: string
  ): number {
    const markerIdx = fullText.indexOf(markerPrefix);
    if (markerIdx >= 0) {
      return markerIdx;
    }
    // Only hold back the tail if it could be an incomplete prefix of markerPrefix (e.g. "[" or "[[TUTOR_")
    const maxCheck = Math.min(fullText.length, markerPrefix.length - 1);
    for (let len = maxCheck; len >= 1; len--) {
      if (markerPrefix.startsWith(fullText.slice(-len))) {
        return fullText.length - len;
      }
    }
    return fullText.length;
  }

  app.post('/api/ai/chat/stream', async (req: Request, res: Response) => {
    let clientClosed = false;
    let stallTimedOut = false;
    const upstreamController = new AbortController();
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const resetStallTimer = (ms: number) => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stallTimedOut = true;
        upstreamController.abort(new Error('Upstream AI stream stalled'));
      }, ms);
    };

    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
        upstreamController.abort(new Error('Client disconnected'));
      }
    });

    try {
      const { parts, systemInstruction, needsTitle } = buildAiChatParts(req.body || {});
      const ai = getGeminiClient();

      const streamInstruction = needsTitle
        ? `${systemInstruction}\n\nOUTPUT FORMAT REQUIREMENT:\nWrite your full Markdown answer directly first. Then on a brand-new final line at the very end, append exactly one metadata marker in this exact format (single-line valid JSON, no code fences):\n[[CHAT_META:{"suggestedTitle":"3 to 6 word title","subjectArea":"Academic Discipline"}]]`
        : systemInstruction;

      initSseResponse(res);
      heartbeat = setInterval(() => {
        if (!clientClosed && !res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, 4000);
      resetStallTimer(35000);

      const model = getGeminiModel();
      const stream = await withRetry(
        (signal) =>
          ai.models.generateContentStream({
            model,
            contents: { parts },
            config: {
              systemInstruction: streamInstruction,
              ...getThinkingConfig(model, ThinkingLevel.LOW),
              abortSignal: signal,
            },
          }),
        { maxRetries: 1, externalSignal: upstreamController.signal }
      );

      const META_PREFIX = '[[CHAT_META:';
      let fullText = '';
      let emittedLength = 0;

      for await (const chunk of stream) {
        if (clientClosed) break;
        resetStallTimer(45000);
        const delta = chunk.text ?? '';
        if (!delta) continue;
        fullText += delta;

        if (needsTitle) {
          const safeLimit = getSafeStreamEnd(fullText, META_PREFIX);
          if (safeLimit > emittedLength) {
            writeSseEvent(res, 'chunk', { delta: fullText.slice(emittedLength, safeLimit) });
            emittedLength = safeLimit;
          }
        } else {
          writeSseEvent(res, 'chunk', { delta });
          emittedLength = fullText.length;
        }
      }

      if (!clientClosed) {
        if (needsTitle) {
          const { cleanText, meta } = stripTrailingMetaMarker<{
            suggestedTitle: string;
            subjectArea: string;
          }>(fullText, META_PREFIX);
          if (cleanText.length > emittedLength) {
            writeSseEvent(res, 'chunk', { delta: cleanText.slice(emittedLength) });
          }
          writeSseEvent(res, 'done', {
            reply: cleanText,
            suggestedTitle: String(meta.suggestedTitle || 'Academic Study Chat').trim(),
            subjectArea: String(meta.subjectArea || 'General Studies').trim(),
          });
        } else {
          writeSseEvent(res, 'done', {
            reply: fullText.trim(),
          });
        }
        res.end();
      }
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { statusCode?: number })?.statusCode === 'number'
          ? (err as { statusCode: number }).statusCode
          : null;
      const formatted = stallTimedOut
        ? {
            status: 503,
            message:
              'The Gemini AI service took too long to respond due to temporary high demand. Your message has been preserved—please try again in a few moments.',
          }
        : statusCode
          ? { status: statusCode, message: (err as Error).message }
          : formatGeminiError(err);

      if (!res.headersSent) {
        return res.status(formatted.status).json({ error: formatted.message });
      }
      if (!clientClosed) {
        writeSseEvent(res, 'error', { status: formatted.status, error: formatted.message });
        res.end();
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (stallTimer) clearTimeout(stallTimer);
    }
  });

  app.post('/api/ai/tutor', async (req: Request, res: Response) => {
    try {
      const { parts, systemInstruction, currentTopic } = buildAiTutorParts(req.body || {});
      const ai = getGeminiClient();

      const model = getGeminiModel();
      const response = await withRetry(
        (signal) =>
          ai.models.generateContent({
            model,
            contents: { parts },
            config: {
              systemInstruction,
              ...getThinkingConfig(model, ThinkingLevel.LOW),
              abortSignal: signal,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  reply: {
                    type: Type.STRING,
                    description: 'Well-formatted Markdown tutoring response.',
                  },
                  topicTitle: {
                    type: Type.STRING,
                    description: 'Short clear title for this tutoring topic (3-6 words).',
                  },
                  subjectArea: {
                    type: Type.STRING,
                    description: 'Academic subject area.',
                  },
                  currentStageLabel: {
                    type: Type.STRING,
                    description: 'Short label of the current learning stage (e.g., "Foundations & Core Principle", "Worked Example", "Applied Practice").',
                  },
                  advanceStep: {
                    type: Type.BOOLEAN,
                    description: 'True if the session progressed to a new conceptual step, false if clarifying/repeating current step.',
                  },
                },
                required: [
                  'reply',
                  'topicTitle',
                  'subjectArea',
                  'currentStageLabel',
                  'advanceStep',
                ],
              },
            },
          }),
        { maxRetries: 1, timeoutMs: 45000 }
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        reply: String(parsed.reply || '').trim(),
        topicTitle: String(parsed.topicTitle || currentTopic || 'Tutoring Session').trim(),
        subjectArea: String(parsed.subjectArea || 'General Studies').trim(),
        currentStageLabel: String(
          parsed.currentStageLabel || 'Guided Concept Exploration'
        ).trim(),
        advanceStep: Boolean(parsed.advanceStep),
      });
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { statusCode?: number })?.statusCode === 'number'
          ? (err as { statusCode: number }).statusCode
          : null;
      if (statusCode) {
        return res.status(statusCode).json({ error: (err as Error).message });
      }
      console.error('AI Tutor failed:', err);
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/tutor/stream', async (req: Request, res: Response) => {
    let clientClosed = false;
    let stallTimedOut = false;
    const upstreamController = new AbortController();
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const resetStallTimer = (ms: number) => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stallTimedOut = true;
        upstreamController.abort(new Error('Upstream AI stream stalled'));
      }, ms);
    };

    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
        upstreamController.abort(new Error('Client disconnected'));
      }
    });

    try {
      const { parts, systemInstruction, currentTopic } = buildAiTutorParts(req.body || {});
      const ai = getGeminiClient();

      const streamInstruction = `${systemInstruction}\n\nOUTPUT FORMAT REQUIREMENT:\nWrite your full Markdown tutoring response directly first. Then on a brand-new final line at the very end, append exactly one metadata marker in this exact format (single-line valid JSON, no code fences):\n[[TUTOR_META:{"topicTitle":"3 to 6 word topic title","subjectArea":"Academic Discipline","currentStageLabel":"Current Stage Label","advanceStep":true}]]`;

      initSseResponse(res);
      heartbeat = setInterval(() => {
        if (!clientClosed && !res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, 4000);
      resetStallTimer(35000);

      const model = getGeminiModel();
      const stream = await withRetry(
        (signal) =>
          ai.models.generateContentStream({
            model,
            contents: { parts },
            config: {
              systemInstruction: streamInstruction,
              ...getThinkingConfig(model, ThinkingLevel.LOW),
              abortSignal: signal,
            },
          }),
        { maxRetries: 1, externalSignal: upstreamController.signal }
      );

      const META_PREFIX = '[[TUTOR_META:';
      let fullText = '';
      let emittedLength = 0;

      for await (const chunk of stream) {
        if (clientClosed) break;
        resetStallTimer(45000);
        const delta = chunk.text ?? '';
        if (!delta) continue;
        fullText += delta;

        const safeLimit = getSafeStreamEnd(fullText, META_PREFIX);
        if (safeLimit > emittedLength) {
          writeSseEvent(res, 'chunk', { delta: fullText.slice(emittedLength, safeLimit) });
          emittedLength = safeLimit;
        }
      }

      if (!clientClosed) {
        const { cleanText, meta } = stripTrailingMetaMarker<{
          topicTitle: string;
          subjectArea: string;
          currentStageLabel: string;
          advanceStep: boolean;
        }>(fullText, META_PREFIX);

        if (cleanText.length > emittedLength) {
          writeSseEvent(res, 'chunk', { delta: cleanText.slice(emittedLength) });
        }

        writeSseEvent(res, 'done', {
          reply: cleanText,
          topicTitle: String(meta.topicTitle || currentTopic || 'Tutoring Session').trim(),
          subjectArea: String(meta.subjectArea || 'General Studies').trim(),
          currentStageLabel: String(
            meta.currentStageLabel || 'Guided Concept Exploration'
          ).trim(),
          advanceStep: Boolean(meta.advanceStep),
        });
        res.end();
      }
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { statusCode?: number })?.statusCode === 'number'
          ? (err as { statusCode: number }).statusCode
          : null;
      const formatted = stallTimedOut
        ? {
            status: 503,
            message:
              'The Gemini AI service took too long to respond due to temporary high demand. Your message has been preserved—please try again in a few moments.',
          }
        : statusCode
          ? { status: statusCode, message: (err as Error).message }
          : formatGeminiError(err);

      if (!res.headersSent) {
        return res.status(formatted.status).json({ error: formatted.message });
      }
      if (!clientClosed) {
        writeSseEvent(res, 'error', { status: formatted.status, error: formatted.message });
        res.end();
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (stallTimer) clearTimeout(stallTimer);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Brainstine server listening on http://0.0.0.0:${PORT}`);
    void ensureResolvedGeminiModel().catch(() => {});
  });

  // Configure explicit Node HTTP timeouts suitable for streaming & multi-step AI responses
  server.requestTimeout = 180000;
  server.headersTimeout = 65000;
  server.keepAliveTimeout = 65000;
}

startServer().catch((err) => {
  console.error('Failed to start Brainstine server:', err);
  process.exit(1);
});
