export function resolveApiUrl(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export function looksLikeHtmlOrStaticNotFound(
  bodyText: string,
  contentType: string
): boolean {
  const lowerCt = contentType.toLowerCase();
  const sample = bodyText.trim().slice(0, 400).toLowerCase();
  return (
    lowerCt.includes('text/html') ||
    sample.startsWith('<!doctype') ||
    sample.startsWith('<html') ||
    sample.includes('the page could not be found') ||
    sample.includes('not_found')
  );
}

const CLIENT_TECHNICAL_LEAK_PATTERNS: RegExp[] = [
  /supabase/i,
  /gemini/i,
  /groq/i,
  /google\s*genai/i,
  /generative\s*language/i,
  /vercel/i,
  /serverless/i,
  /secrets?\s*panel/i,
  /gemini_api_key/i,
  /groq_api_key/i,
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
  /gsk_[a-z0-9_-]{10,}/i,
  /bearer\s+[a-z0-9._-]+/i,
  /eyj[a-z0-9_-]{8,}\./i,
  /resource_exhausted|api_key_invalid/i,
  /\bhttp\s+[45]\d{2}\b/i,
];

function hasTechnicalDetails(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
  if (trimmed.length > 320) return true;
  return CLIENT_TECHNICAL_LEAK_PATTERNS.some((p) => p.test(trimmed));
}

function getFriendlyFallbackForAction(contextAction?: string): string {
  const lower = (contextAction || '').toLowerCase();
  if (lower.includes('upload') || lower.includes('stag')) {
    return "We couldn't upload your file. Please try again.";
  }
  if (lower.includes('extract') || lower.includes('process') || lower.includes('transcrib')) {
    return "We couldn't process your study material. Please try again.";
  }
  if (lower.includes('sign') || lower.includes('auth') || lower.includes('login')) {
    return "We couldn't sign you in right now. Please try again.";
  }
  return 'Something went wrong. Please try again.';
}

function appendReferenceId(message: string, referenceId?: string): string {
  if (!referenceId || !/^BRN-[A-Z0-9]{4,12}$/i.test(referenceId.trim())) {
    return message;
  }
  if (message.includes(referenceId.trim())) return message;
  return `${message} (Ref: ${referenceId.trim()})`;
}

export function sanitizeUserErrorMessage(
  rawInput: unknown,
  contextAction?: string,
  referenceId?: string
): string {
  const raw =
    rawInput instanceof Error
      ? rawInput.message.trim()
      : typeof rawInput === 'string'
        ? rawInput.trim()
        : String(rawInput ?? '').trim();
  const lower = raw.toLowerCase();

  if (
    lower === 'failed to fetch' ||
    lower === 'load failed' ||
    lower.includes('networkerror when attempting to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('network connection error') ||
    lower.includes('internet connection') ||
    lower.includes('offline') ||
    lower.includes('econn') ||
    lower.includes('enotfound')
  ) {
    return appendReferenceId(
      'Network connection error. Please check your internet connection and try again.',
      referenceId
    );
  }

  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('took too long') ||
    lower.includes('stream idle timeout')
  ) {
    return appendReferenceId(
      'This request took too long to complete. Your input has been preserved—please try again.',
      referenceId
    );
  }

  if (
    lower.includes('jwt expired') ||
    lower.includes('refresh_token') ||
    lower.includes('invalid refresh token') ||
    lower.includes('session_not_found') ||
    lower.includes('session has expired')
  ) {
    return 'Your session has expired. Please sign in again.';
  }

  if (
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('insufficient_privilege')
  ) {
    return "You don't have permission to perform this action. Please sign in again and retry.";
  }

  if (
    lower.includes('entity.too.large') ||
    lower.includes('payload too large') ||
    lower.includes('object exceeded the maximum allowed size') ||
    lower.includes('4.5 mb')
  ) {
    return 'This file is too large to upload. Please choose a smaller file or compress it and try again.';
  }

  if (
    lower.includes('not configured') ||
    lower.includes('missing gemini_api_key') ||
    lower.includes('missing on the server') ||
    lower.includes('vite_supabase') ||
    lower.includes('service is temporarily unavailable') ||
    lower.includes('temporarily unavailable')
  ) {
    return appendReferenceId(
      'Brainstine is temporarily unavailable. Please try again shortly.',
      referenceId
    );
  }

  if (
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('high demand')
  ) {
    return appendReferenceId(
      'Brainstine is experiencing high demand right now. Please wait a moment and try again.',
      referenceId
    );
  }

  if (
    !raw ||
    lower === 'request failed' ||
    hasTechnicalDetails(raw)
  ) {
    return appendReferenceId(getFriendlyFallbackForAction(contextAction), referenceId);
  }

  return appendReferenceId(raw, referenceId);
}

export function extractErrorFromHttpBody(
  status: number,
  bodyText: string,
  contentType: string,
  contextAction: string
): string {
  const trimmed = bodyText.trim();
  let refId: string | undefined;

  if (trimmed && !looksLikeHtmlOrStaticNotFound(trimmed, contentType)) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: unknown;
        message?: unknown;
        referenceId?: unknown;
      };
      if (typeof parsed?.referenceId === 'string') {
        refId = parsed.referenceId.trim();
      }
      const rawMsg =
        typeof parsed?.error === 'string'
          ? parsed.error.trim()
          : typeof parsed?.message === 'string'
            ? parsed.message.trim()
            : '';
      if (rawMsg && rawMsg.toLowerCase() !== 'request failed') {
        return sanitizeUserErrorMessage(rawMsg, contextAction, refId);
      }
    } catch {
      // Fall through to status handling
    }
  }

  if (status === 404 || looksLikeHtmlOrStaticNotFound(trimmed, contentType)) {
    return appendReferenceId(
      'Brainstine is temporarily unavailable. Please try again shortly.',
      refId
    );
  }

  if (status === 401 || status === 403) {
    return appendReferenceId(
      'Your session may have expired or access was denied. Please sign in and try again.',
      refId
    );
  }

  if (status === 413) {
    return appendReferenceId(
      'This file or request is too large. Please upload a smaller file or shorter content.',
      refId
    );
  }

  if (status === 429) {
    return appendReferenceId(
      'Brainstine is experiencing high demand right now. Please wait a moment and try again.',
      refId
    );
  }

  if (status === 502 || status === 504) {
    return appendReferenceId(
      'Brainstine is temporarily unavailable. Please try again shortly.',
      refId
    );
  }

  if (status === 503) {
    return appendReferenceId(
      'Brainstine is temporarily unavailable. Please try again shortly.',
      refId
    );
  }

  return sanitizeUserErrorMessage(trimmed, contextAction, refId);
}

export async function parseApiJsonResponse<T>(
  response: Response,
  contextAction: string
): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const bodyText = await response.text().catch(() => '');

  if (!response.ok) {
    throw new Error(
      extractErrorFromHttpBody(response.status, bodyText, contentType, contextAction)
    );
  }

  if (!bodyText.trim() || looksLikeHtmlOrStaticNotFound(bodyText, contentType)) {
    throw new Error('Brainstine is temporarily unavailable. Please try again shortly.');
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new Error(getFriendlyFallbackForAction(contextAction));
  }
}

export function formatClientApiError(
  err: unknown,
  contextAction: string,
  timeoutMessage?: string
): string {
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') {
    return (
      timeoutMessage ||
      'This request took too long to complete. Your input has been preserved—please try again.'
    );
  }

  return sanitizeUserErrorMessage(err, contextAction);
}
