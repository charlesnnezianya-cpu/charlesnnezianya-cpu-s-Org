import { GoogleGenAI } from '@google/genai';

/**
 * Single source of truth for Brainstine's authorized AI model.
 * Locked permanently to Gemini 2.5 Flash for Google free-tier compliance.
 * Automatic switching to alternate, newer, lite, or paid models is strictly disabled.
 */
export const AUTHORIZED_GEMINI_MODEL = 'gemini-2.5-flash' as const;
export const DEFAULT_GEMINI_MODEL = AUTHORIZED_GEMINI_MODEL;
export const MODEL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let hasWarnedUnauthorizedEnvModel = false;

export class AiInvalidResponseError extends Error {
  status = 502;
  constructor(message: string) {
    super(message);
    this.name = 'AiInvalidResponseError';
  }
}

export class AiConfigurationError extends Error {
  status = 503;
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigurationError';
  }
}

export interface GeminiQuotaInfo {
  isQuotaError: boolean;
  quotaScope: 'rpm' | 'tpm' | 'daily' | 'zero_quota' | 'unknown';
  retryDelaySeconds: number | null;
  quotaMetric: string | null;
  quotaId: string | null;
}

export interface ModelProbeResult {
  ok: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
  upstreamError?: string;
  quotaHit?: boolean;
}

export interface ResolvedModelState {
  activeModel: string;
  configuredModel: string | null;
  fallbackUsed: false;
  reason: string | null;
  checkedAt: number;
}

let resolvedGeminiModelCache: ResolvedModelState | null = null;

export function getConfiguredGeminiModel(): string | null {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured || null;
}

export function getGeminiModel(): string {
  const configured = getConfiguredGeminiModel();
  if (configured && configured !== AUTHORIZED_GEMINI_MODEL && !hasWarnedUnauthorizedEnvModel) {
    hasWarnedUnauthorizedEnvModel = true;
    console.warn(
      `[Gemini Policy] Ignoring GEMINI_MODEL="${configured}". Brainstine is permanently configured to use "${AUTHORIZED_GEMINI_MODEL}" only.`
    );
  }
  return AUTHORIZED_GEMINI_MODEL;
}

export function getResolvedModelState(): ResolvedModelState | null {
  if (
    resolvedGeminiModelCache &&
    Date.now() - resolvedGeminiModelCache.checkedAt >= MODEL_CACHE_TTL_MS
  ) {
    return null;
  }
  return resolvedGeminiModelCache;
}

export function clearResolvedGeminiModelCache(): void {
  resolvedGeminiModelCache = null;
}

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey.trim() !== '' && apiKey !== 'MY_GEMINI_API_KEY');
}

export function getGeminiClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw new AiConfigurationError(
      'GEMINI_API_KEY is missing on the server. Set GEMINI_API_KEY in Secrets (or your deployment environment variables) to enable AI features.'
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

export function inspectGeminiQuotaError(err: unknown): GeminiQuotaInfo {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  const isQuotaError =
    status === 429 ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('"code":429') ||
    raw.includes(' 429');

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

  const retryMatch =
    raw.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i) ||
    raw.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
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

export function extractReadableApiError(raw: string): string {
  let current = raw.trim();
  for (let depth = 0; depth < 3; depth++) {
    if (!current.startsWith('{')) break;
    try {
      const parsed = JSON.parse(current) as {
        error?: { message?: string } | string;
        message?: string;
      };
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

export function isInvalidApiKeyError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  return (
    status === 401 ||
    status === 403 ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('"code":403') ||
    raw.includes('"code":401') ||
    raw.toLowerCase().includes('api key not valid') ||
    raw.toLowerCase().includes('insufficient authentication scopes')
  );
}

export function isUnsupportedModelError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  return (
    status === 404 ||
    raw.includes('NOT_FOUND') ||
    raw.includes('"code":404') ||
    raw.includes('unexpected model name format') ||
    raw.toLowerCase().includes('is not found for api version') ||
    raw.toLowerCase().includes('not supported for generatecontent')
  );
}

export function formatGeminiError(err: unknown): { status: number; message: string } {
  if (err instanceof AiConfigurationError) {
    return { status: err.status, message: err.message };
  }
  if (err instanceof AiInvalidResponseError) {
    return { status: err.status, message: err.message };
  }

  const explicitStatusCode =
    typeof (err as { statusCode?: number })?.statusCode === 'number'
      ? (err as { statusCode: number }).statusCode
      : null;
  if (explicitStatusCode && explicitStatusCode >= 400 && explicitStatusCode < 500) {
    return {
      status: explicitStatusCode,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (raw.includes('GEMINI_API_KEY is missing')) {
    return {
      status: 503,
      message:
        'AI service is not configured on this server (missing GEMINI_API_KEY in Secrets or environment variables).',
    };
  }

  if (
    raw.includes('Unsupported image format') ||
    raw.includes('exceeds the 15 MB limit') ||
    raw.includes('exceeds the 25 MB')
  ) {
    return { status: 400, message: raw };
  }

  if (isInvalidApiKeyError(err)) {
    return {
      status: 403,
      message:
        'The configured GEMINI_API_KEY is invalid or lacks permission. Please verify GEMINI_API_KEY in your server Secrets panel.',
    };
  }

  const quotaInfo = inspectGeminiQuotaError(err);
  if (quotaInfo.isQuotaError) {
    if (quotaInfo.quotaScope === 'daily' || quotaInfo.quotaScope === 'zero_quota') {
      return {
        status: 429,
        message:
          'Gemini 2.5 Flash free-tier daily quota is currently exhausted. Your input has been preserved—please try again after the free-tier quota resets.',
      };
    }
    if (quotaInfo.quotaScope === 'tpm') {
      return {
        status: 429,
        message:
          'Gemini 2.5 Flash token-per-minute free-tier limit reached. Your input has been preserved—please wait a moment or try shorter content, then retry.',
      };
    }
    const waitHint =
      quotaInfo.retryDelaySeconds && quotaInfo.retryDelaySeconds <= 60
        ? ` Please wait ~${quotaInfo.retryDelaySeconds} seconds and retry.`
        : ' Please wait a moment and retry.';
    return {
      status: 429,
      message: `Gemini 2.5 Flash free-tier rate limit reached due to high request frequency.${waitHint} Your input has been preserved.`,
    };
  }

  if (isUnsupportedModelError(err)) {
    const upstreamMsg = extractReadableApiError(raw);
    if (upstreamMsg.toLowerCase().includes('no longer available')) {
      return {
        status: 502,
        message:
          'Gemini 2.5 Flash (gemini-2.5-flash) is unavailable for this API key/project on Google Gemini ("no longer available to new users"). Brainstine is locked to gemini-2.5-flash and will not automatically switch models.',
      };
    }
    return {
      status: 502,
      message:
        'Gemini 2.5 Flash (gemini-2.5-flash) is temporarily unavailable for this API key or endpoint. Brainstine is configured to use gemini-2.5-flash only—please verify your Gemini API project access or retry shortly.',
    };
  }

  if (
    lower.includes('fetch failed') ||
    raw.includes('ENOTFOUND') ||
    raw.includes('ECONNREFUSED') ||
    raw.includes('EAI_AGAIN') ||
    raw.includes('ECONNRESET') ||
    lower.includes('network error')
  ) {
    return {
      status: 502,
      message:
        'Unable to connect to the Google Gemini API due to a temporary upstream network failure. Your input has been preserved—please try again shortly.',
    };
  }

  if (
    lower.includes('took too long') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('stalled') ||
    (err instanceof Error && err.name === 'AbortError')
  ) {
    return {
      status: 504,
      message:
        'Gemini 2.5 Flash took too long to respond and the request timed out. Your work has been preserved—please try again or shorten the prompt.',
    };
  }

  const status = (err as { status?: number })?.status;
  if (
    status === 503 ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('"code":503') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return {
      status: 503,
      message:
        'Gemini 2.5 Flash is temporarily experiencing high demand or is unavailable. Your input has been preserved—please wait a moment and retry.',
    };
  }

  if (lower.includes('safety') || lower.includes('blocked')) {
    return {
      status: 422,
      message:
        'Gemini 2.5 Flash declined to generate a response for this input due to content safety filters. Please rephrase your study prompt and try again.',
    };
  }

  const readable = extractReadableApiError(raw);
  return {
    status: 500,
    message:
      readable && !readable.toLowerCase().includes('request failed')
        ? readable
        : 'An unexpected server error occurred while contacting Gemini 2.5 Flash. Your input has been preserved—please try again.',
  };
}

export interface RetryOptions {
  maxRetries?: number;
  timeoutMs?: number;
  externalSignal?: AbortSignal;
}

export async function withRetry<T>(
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
            'Gemini 2.5 Flash timed out while waiting to respond. Your input has been preserved—please try again in a moment.'
          ),
          { status: 504 }
        );
      }

      const quotaInfo = inspectGeminiQuotaError(err);
      if (quotaInfo.isQuotaError) {
        console.warn('[Gemini 429 diagnostic]', {
          model: AUTHORIZED_GEMINI_MODEL,
          quotaScope: quotaInfo.quotaScope,
          quotaMetric: quotaInfo.quotaMetric,
          quotaId: quotaInfo.quotaId,
          retryDelaySeconds: quotaInfo.retryDelaySeconds,
        });
        const isHardDaily =
          quotaInfo.quotaScope === 'daily' || quotaInfo.quotaScope === 'zero_quota';
        const canShortWait =
          !isHardDaily &&
          attempt < maxRetries &&
          attemptElapsedMs <= 12000 &&
          (quotaInfo.retryDelaySeconds === null || quotaInfo.retryDelaySeconds <= 10);
        if (!canShortWait) {
          throw err;
        }
        const waitMs = Math.min(7000, Math.max(1800, (quotaInfo.retryDelaySeconds ?? 2) * 1000));
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (isInvalidApiKeyError(err) || isUnsupportedModelError(err)) {
        throw err;
      }

      const raw = err instanceof Error ? err.message : String(err);
      const isTransient =
        raw.includes('503') ||
        raw.includes('500') ||
        raw.includes('UNAVAILABLE') ||
        raw.includes('ECONNRESET');

      if (!isTransient || attemptElapsedMs > 12000 || attempt >= maxRetries) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, 800 * Math.pow(2, attempt) + jitter));
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }
  throw lastError;
}

/**
 * Executes an AI operation strictly on Gemini 2.5 Flash (`gemini-2.5-flash`).
 * Same-model transient retry only — never switches to another model.
 */
export async function runWithGeminiModel<T>(
  operation: (modelId: string, signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<{ result: T; modelUsed: string }> {
  const modelId = getGeminiModel();
  const result = await withRetry((signal) => operation(modelId, signal), {
    maxRetries: options.maxRetries ?? 1,
    timeoutMs: options.timeoutMs,
    externalSignal: options.externalSignal,
  });
  return { result, modelUsed: modelId };
}

export function parseAiJsonResponse<T>(rawText: string | undefined, contextLabel: string): T {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) {
    throw new AiInvalidResponseError(
      `The AI returned an empty response while generating ${contextLabel}. Please try again.`
    );
  }

  let candidate = trimmed;
  // Strip markdown code fences if a model wrapped structured output
  if (candidate.startsWith('```')) {
    candidate = candidate
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Attempt extracting outermost JSON object
    const objStart = candidate.indexOf('{');
    const objEnd = candidate.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      try {
        return JSON.parse(candidate.slice(objStart, objEnd + 1)) as T;
      } catch {
        // fall through to structured invalid-response error
      }
    }
    throw new AiInvalidResponseError(
      `The AI returned an invalid or incomplete response while ${contextLabel}. Your input has been preserved—please try again.`
    );
  }
}

export async function probeSingleModelQuick(
  ai: GoogleGenAI,
  modelId: string = AUTHORIZED_GEMINI_MODEL,
  timeoutMs = 20000
): Promise<ModelProbeResult> {
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
        abortSignal: ac.signal,
      },
    });
    return {
      ok: Boolean((res.text ?? '').trim()),
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const quota = inspectGeminiQuotaError(err);
    const rawMsg = err instanceof Error ? err.message : String(err);
    const formatted = abortedByTimer
      ? { status: 504, message: `Timed out after ${timeoutMs}ms` }
      : formatGeminiError(err);
    return {
      ok: false,
      latencyMs: Date.now() - start,
      status: formatted.status,
      error: formatted.message,
      upstreamError: extractReadableApiError(rawMsg).slice(0, 300),
      quotaHit: quota.isQuotaError,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureResolvedGeminiModel(forceRefresh = false): Promise<string> {
  const configured = getConfiguredGeminiModel();
  const model = getGeminiModel();
  const note =
    configured && configured !== AUTHORIZED_GEMINI_MODEL
      ? `Ignored GEMINI_MODEL="${configured}"; permanently locked to "${AUTHORIZED_GEMINI_MODEL}".`
      : null;

  if (!forceRefresh && resolvedGeminiModelCache) {
    return resolvedGeminiModelCache.activeModel;
  }

  resolvedGeminiModelCache = {
    activeModel: model,
    configuredModel: configured,
    fallbackUsed: false,
    reason: note,
    checkedAt: Date.now(),
  };

  return model;
}
