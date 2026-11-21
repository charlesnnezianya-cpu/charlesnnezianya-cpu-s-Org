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

export function extractErrorFromHttpBody(
  status: number,
  bodyText: string,
  contentType: string,
  contextAction: string
): string {
  const trimmed = bodyText.trim();

  if (trimmed && !looksLikeHtmlOrStaticNotFound(trimmed, contentType)) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
      const rawMsg =
        typeof parsed?.error === 'string'
          ? parsed.error.trim()
          : typeof parsed?.message === 'string'
            ? parsed.message.trim()
            : '';
      if (rawMsg && rawMsg.toLowerCase() !== 'request failed') {
        return rawMsg;
      }
    } catch {
      // Fall through to status/plain-text handling
    }
  }

  if (status === 404 || looksLikeHtmlOrStaticNotFound(trimmed, contentType)) {
    return `The Brainstine AI backend endpoint could not be reached while ${contextAction} (HTTP 404). Make sure the server /api endpoints and GEMINI_API_KEY are deployed and running.`;
  }

  if (status === 401 || status === 403) {
    return 'The configured GEMINI_API_KEY was rejected or lacks permission. Please verify GEMINI_API_KEY in your Secrets panel.';
  }

  if (status === 413) {
    return 'Your uploaded file or prompt exceeds the request size limit (4.5 MB on cloud serverless hosting / 20 MB local). Please upload a smaller file or shorter text.';
  }

  if (status === 429) {
    return 'AI rate limit or quota reached. Your input has been preserved—please wait a moment and try again.';
  }

  if (status === 502 || status === 504) {
    return `The AI server timed out or returned a temporary gateway error (HTTP ${status}) while ${contextAction}. Your work has been preserved—please try again.`;
  }

  if (status === 503) {
    return 'The AI service is temporarily unavailable or missing server configuration (GEMINI_API_KEY). Please try again shortly.';
  }

  if (
    trimmed &&
    trimmed.length <= 240 &&
    !looksLikeHtmlOrStaticNotFound(trimmed, contentType) &&
    trimmed.toLowerCase() !== 'request failed'
  ) {
    return trimmed;
  }

  return `Unable to complete ${contextAction} (server returned HTTP ${status}). Please try again.`;
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
    throw new Error(
      `The server returned an unexpected non-JSON response while ${contextAction}. Verify that the Brainstine /api backend is active.`
    );
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new Error(
      `The server returned malformed JSON while ${contextAction}. Please try again.`
    );
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
      `The request timed out while ${contextAction}. Your input has been preserved—please try again.`
    );
  }

  const raw = err instanceof Error ? err.message.trim() : String(err || '').trim();
  const lower = raw.toLowerCase();

  if (
    lower === 'failed to fetch' ||
    lower === 'load failed' ||
    lower.includes('networkerror when attempting to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('the internet connection appears to be offline')
  ) {
    return `Network connection error while ${contextAction}. Please check your internet connection and verify the Brainstine server is running, then try again.`;
  }

  if (!raw || lower === 'request failed') {
    return `An error occurred while ${contextAction}. Your work has been preserved—please try again.`;
  }

  return raw;
}
