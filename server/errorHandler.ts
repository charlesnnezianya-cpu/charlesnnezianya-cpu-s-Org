import crypto from 'crypto';
import type { Response } from 'express';
import {
  AiInvalidResponseError,
  isInvalidApiKeyError,
  isUnsupportedModelError,
  inspectGeminiQuotaError,
} from './geminiService.ts';

export type ServerOperation =
  | 'materials.extract'
  | 'summaries.generate'
  | 'summaries.followup'
  | 'quizzes.generate'
  | 'quizzes.grade'
  | 'ai.chat'
  | 'ai.chat.stream'
  | 'ai.tutor'
  | 'ai.tutor.stream'
  | 'auth.oauth_status'
  | 'api.health'
  | 'api.not_found'
  | 'api.unhandled';

export interface SafeErrorResult {
  status: number;
  message: string;
  referenceId: string;
}

const TECHNICAL_LEAK_PATTERNS: RegExp[] = [
  /supabase/i,
  /gemini/i,
  /google\s*genai/i,
  /generative\s*language/i,
  /vercel/i,
  /serverless/i,
  /secrets?\s*panel/i,
  /gemini_api_key/i,
  /vite_supabase/i,
  /service_role/i,
  /postgrest/i,
  /pgrst\d*/i,
  /postgres/i,
  /row[- ]level security/i,
  /\brls\b/i,
  /\bbucket\b/i,
  /study-materials/i,
  /signed\s*storage\s*url/i,
  /staged\s*file|origin\s*or\s*path/i,
  /cloud\s*storage/i,
  /\/api\//i,
  /localhost/i,
  /127\.0\.0\.1/,
  /https?:\/\//i,
  /\bstack\b|\bat\s+[A-Za-z0-9_$.]+\s*\(/i,
  /econnrefused|enotfound|econnreset|eai_again|etimedout/i,
  /aiza[0-9a-z_-]{10,}/i,
  /bearer\s+[a-z0-9._-]+/i,
  /eyj[a-z0-9_-]{8,}\./i,
  /resource_exhausted|api_key_invalid|permission_denied/i,
];

export function generateErrorRefId(): string {
  const bytes = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BRN-${bytes}`;
}

export function redactSensitiveText(input: unknown): string {
  const raw =
    input instanceof Error
      ? `${input.name}: ${input.message}`
      : typeof input === 'string'
        ? input
        : (() => {
            try {
              return JSON.stringify(input);
            } catch {
              return String(input);
            }
          })();

  return raw
    .replace(/AIza[0-9A-Za-z_-]{16,}/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{2,}\b/g, '[REDACTED_JWT]')
    .replace(/https?:\/\/[a-z0-9-]+\.supabase\.(?:co|in|net)[^\s"'`<>)]*/gi, '[REDACTED_SUPABASE_URL]')
    .replace(
      /([?&](?:token|apikey|api_key|key|secret|sig|signature|access_token|refresh_token|code)=)[^&\s"'`<>)]+/gi,
      '$1[REDACTED]'
    )
    .replace(
      /\b(api_?key|apikey|secret|password|passwd|token|service_role|access_token|refresh_token|client_secret|authorization)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,
      '$1$2[REDACTED]'
    )
    .replace(/([a-z0-9.-]+\.[a-z]{2,}\/storage\/v1\/[^\s"'`<>)]*)/gi, '[REDACTED_STORAGE_PATH]');
}

export function redactUnknownForLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSensitiveText(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveText(value.message),
      status: (value as { status?: number; statusCode?: number }).status ??
        (value as { statusCode?: number }).statusCode,
      code: (value as { code?: string }).code,
      stack: value.stack ? redactSensitiveText(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknownForLog(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(api_?key|apikey|secret|password|token|authorization|cookie|set-cookie|signedStorageUrl)$/i.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactUnknownForLog(v);
      }
    }
    return out;
  }
  return value;
}

export function containsTechnicalLeak(message: string): boolean {
  if (!message || !message.trim()) return true;
  if (message.trim().startsWith('{') || message.trim().startsWith('[')) return true;
  return TECHNICAL_LEAK_PATTERNS.some((pattern) => pattern.test(message));
}

export function logServerError(
  operation: ServerOperation | string,
  err: unknown,
  meta?: Record<string, unknown>,
  refId: string = generateErrorRefId()
): string {
  const timestamp = new Date().toISOString();
  const safeErr = redactUnknownForLog(err);
  const safeMeta = meta ? redactUnknownForLog(meta) : undefined;
  console.error('[BrainstineError]', {
    timestamp,
    referenceId: refId,
    operation,
    error: safeErr,
    ...(safeMeta ? { meta: safeMeta } : {}),
  });
  return refId;
}

export function logServerWarn(
  operation: string,
  message: string,
  detail?: unknown
): void {
  const timestamp = new Date().toISOString();
  console.warn('[BrainstineWarn]', {
    timestamp,
    operation,
    message: redactSensitiveText(message),
    ...(detail !== undefined ? { detail: redactUnknownForLog(detail) } : {}),
  });
}

export function sanitizeSafeServerMessage(
  err: unknown,
  operation: ServerOperation | string,
  options?: { stallTimedOut?: boolean; explicitStatus?: number }
): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  const statusHint =
    options?.explicitStatus ??
    (typeof (err as { status?: number })?.status === 'number'
      ? (err as { status: number }).status
      : typeof (err as { statusCode?: number })?.statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : undefined);

  const isExtraction = operation === 'materials.extract';

  // 1. Explicit timeout / stream stall
  if (
    options?.stallTimedOut ||
    lower.includes('took too long') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('stalled') ||
    lower.includes('etimedout') ||
    (err instanceof Error && err.name === 'AbortError')
  ) {
    return {
      status: 504,
      message: isExtraction
        ? 'Processing your study material took too long. Please try again or use a smaller file.'
        : 'This request took too long to complete. Your input has been preserved—please try again.',
    };
  }

  // 2. Payload size & file size validation (friendly, specific)
  if (
    statusHint === 413 ||
    (err as { type?: string })?.type === 'entity.too.large' ||
    (err as { code?: string })?.code === 'LIMIT_FILE_SIZE' ||
    lower.includes('exceeds the 25 mb') ||
    lower.includes('exceeds the 20 mb') ||
    lower.includes('exceeds the 15 mb')
  ) {
    if (lower.includes('15 mb')) {
      return {
        status: 400,
        message: 'This image exceeds the 15 MB size limit. Please upload a smaller or compressed image.',
      };
    }
    if (lower.includes('20 mb')) {
      return {
        status: statusHint === 413 ? 413 : 422,
        message: 'This file exceeds the 20 MB limit. Please upload a smaller or compressed file.',
      };
    }
    return {
      status: statusHint === 413 ? 413 : 400,
      message: 'This file exceeds the 25 MB maximum upload limit. Please compress or split the file and try again.',
    };
  }

  // 3. Explicit safe student validation messages (400 / 422)
  if (
    lower.includes('empty (0 bytes)') ||
    lower.includes('uploaded file is empty') ||
    lower.includes('uploaded text file is empty')
  ) {
    return {
      status: 400,
      message: 'The uploaded file is empty. Please choose a valid study document and try again.',
    };
  }

  if (lower.includes('unsupported file format') || lower.includes('unsupported image format')) {
    return {
      status: 400,
      message: containsTechnicalLeak(raw)
        ? 'This file format is not supported. Please upload a PDF, image (PNG, JPG, WEBP), audio file (MP3, WAV, M4A, OGG), or text file (.txt, .md).'
        : raw,
    };
  }

  if (
    lower.includes('could not extract text from this pdf') ||
    lower.includes('no legible text could be detected') ||
    lower.includes('could not transcribe speech')
  ) {
    return {
      status: 422,
      message: raw,
    };
  }

  // 4. Configuration / invalid API key / unsupported model -> never expose internals
  if (
    (err instanceof Error && err.name === 'AiConfigurationError') ||
    raw.includes('GEMINI_API_KEY') ||
    isInvalidApiKeyError(err) ||
    isUnsupportedModelError(err)
  ) {
    return {
      status: 503,
      message: 'Brainstine is temporarily unavailable. Please try again shortly.',
    };
  }

  // 5. Rate-limit / quota protection -> friendly guidance without exposing model/tier/project details
  const quotaInfo = inspectGeminiQuotaError(err);
  if (quotaInfo.isQuotaError || statusHint === 429) {
    const waitHint =
      quotaInfo.retryDelaySeconds && quotaInfo.retryDelaySeconds > 0 && quotaInfo.retryDelaySeconds <= 45
        ? ` Please wait about ${quotaInfo.retryDelaySeconds} seconds and try again.`
        : ' Please wait a moment and try again.';
    return {
      status: 429,
      message: `Brainstine is experiencing high demand right now.${waitHint} Your work has been preserved.`,
    };
  }

  // 6. Content safety block
  if (lower.includes('safety') || lower.includes('blocked')) {
    return {
      status: 422,
      message: 'We could not generate a response for this input. Please rephrase your request and try again.',
    };
  }

  // 7. Network / upstream connectivity failure
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
      message: isExtraction
        ? 'Network connection error while processing your file. Please check your internet connection and try again.'
        : 'Network connection error. Please check your internet connection and try again.',
    };
  }

  // 8. Temporary upstream unavailability (503)
  if (
    statusHint === 503 ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('"code":503') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return {
      status: 503,
      message: 'Brainstine is temporarily unavailable. Please try again shortly.',
    };
  }

  // 9. Malformed AI JSON or empty AI response
  if (err instanceof AiInvalidResponseError) {
    return {
      status: 502,
      message: containsTechnicalLeak(err.message)
        ? 'We could not complete your request right now. Your input has been preserved—please try again.'
        : err.message,
    };
  }

  // 10. Explicit 4xx client validation error (e.g. ClientInputError) if safe to display
  if (statusHint && statusHint >= 400 && statusHint < 500) {
    if (!containsTechnicalLeak(raw)) {
      return { status: statusHint, message: raw };
    }
    return {
      status: statusHint,
      message: isExtraction
        ? "We couldn't upload your file. Please try again."
        : 'Please check your input and try again.',
    };
  }

  // 11. Fallback for all unexpected 500/unknown exceptions
  return {
    status: 500,
    message: isExtraction
      ? "We couldn't process your study material. Please try again."
      : 'Something went wrong. Please try again.',
  };
}

export function buildSafeApiError(
  operation: ServerOperation | string,
  err: unknown,
  options?: {
    stallTimedOut?: boolean;
    explicitStatus?: number;
    meta?: Record<string, unknown>;
    skipLog?: boolean;
  }
): SafeErrorResult {
  const referenceId = options?.skipLog
    ? generateErrorRefId()
    : logServerError(operation, err, options?.meta);
  const { status, message } = sanitizeSafeServerMessage(err, operation, {
    stallTimedOut: options?.stallTimedOut,
    explicitStatus: options?.explicitStatus,
  });
  return { status, message, referenceId };
}

export function sendSafeApiError(
  res: Response,
  operation: ServerOperation | string,
  err: unknown,
  options?: {
    stallTimedOut?: boolean;
    explicitStatus?: number;
    meta?: Record<string, unknown>;
    skipLog?: boolean;
  }
): Response {
  const safe = buildSafeApiError(operation, err, options);
  return res.status(safe.status).json({
    error: safe.message,
    referenceId: safe.referenceId,
  });
}
