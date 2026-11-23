import {
  extractErrorFromHttpBody,
  formatClientApiError,
  parseApiJsonResponse,
  resolveApiUrl,
  sanitizeUserErrorMessage,
} from './apiClient';

export interface SseStreamOptions<TDone> {
  url: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  idleTimeoutMs?: number;
  onChunk: (delta: string, accumulated: string) => void;
  onStart?: () => void;
  fallbackErrorMessage: string;
  contextAction?: string;
}

export async function postSseStream<TDone>({
  url,
  body,
  signal,
  idleTimeoutMs = 75000,
  onChunk,
  onStart,
  fallbackErrorMessage,
  contextAction = 'communicating with the AI service',
}: SseStreamOptions<TDone>): Promise<TDone> {
  const internalController = new AbortController();

  const onExternalAbort = () => {
    internalController.abort(signal?.reason);
  };
  if (signal) {
    if (signal.aborted) {
      internalController.abort(signal.reason);
    } else {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const resetWatchdog = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      internalController.abort(new Error('Stream idle timeout'));
    }, idleTimeoutMs);
  };

  resetWatchdog();

  let rafId: number | null = null;
  let fallbackFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingDelta = '';
  let latestAccumulated = '';
  let lastNotifiedAccumulated = '';

  const cancelScheduledFlush = () => {
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (fallbackFlushTimer !== null) {
      clearTimeout(fallbackFlushTimer);
      fallbackFlushTimer = null;
    }
  };

  const flushPendingChunks = () => {
    cancelScheduledFlush();
    if (pendingDelta || latestAccumulated !== lastNotifiedAccumulated) {
      const deltaToEmit = pendingDelta;
      pendingDelta = '';
      lastNotifiedAccumulated = latestAccumulated;
      onChunk(deltaToEmit, latestAccumulated);
    }
  };

  const scheduleChunkNotification = () => {
    if (rafId !== null || fallbackFlushTimer !== null) return;
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        flushPendingChunks();
      });
      // Safety fallback in case tab is backgrounded and rAF is paused
      fallbackFlushTimer = setTimeout(() => {
        flushPendingChunks();
      }, 60);
    } else {
      fallbackFlushTimer = setTimeout(() => {
        flushPendingChunks();
      }, 32);
    }
  };

  try {
    const response = await fetch(resolveApiUrl(url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: internalController.signal,
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text().catch(() => '');
      const parsedMessage = extractErrorFromHttpBody(
        response.status,
        rawText,
        contentType,
        contextAction
      );
      throw new Error(parsedMessage || fallbackErrorMessage);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream') || !response.body) {
      const json = await parseApiJsonResponse<TDone & { reply?: string }>(
        response,
        contextAction
      );
      if (json.reply) {
        onChunk(json.reply, json.reply);
      }
      return json;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let donePayload: TDone | null = null;

    const processEventBlock = (block: string) => {
      const lines = block.split('\n');
      let eventName = 'message';
      const dataLines: string[] = [];

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) return;
      const rawData = dataLines.join('\n');

      if (eventName === 'start') {
        onStart?.();
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawData) as Record<string, unknown>;
      } catch {
        return;
      }

      if (eventName === 'chunk') {
        const delta = typeof parsed.delta === 'string' ? parsed.delta : '';
        if (delta) {
          latestAccumulated += delta;
          pendingDelta += delta;
          scheduleChunkNotification();
        }
      } else if (eventName === 'done') {
        flushPendingChunks();
        donePayload = parsed as unknown as TDone;
      } else if (eventName === 'error') {
        cancelScheduledFlush();
        const refId =
          typeof parsed.referenceId === 'string' ? parsed.referenceId : undefined;
        const msg = sanitizeUserErrorMessage(
          typeof parsed.error === 'string' && parsed.error
            ? parsed.error
            : fallbackErrorMessage,
          contextAction,
          refId
        );
        throw new Error(msg);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      resetWatchdog();

      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          processEventBlock(buffer);
        }
        flushPendingChunks();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        if (block.trim()) {
          processEventBlock(block);
        }
      }
    }

    if (!donePayload) {
      if (latestAccumulated.trim()) {
        return { reply: latestAccumulated.trim() } as unknown as TDone;
      }
      throw new Error(
        'We did not receive a complete response. Your message has been preserved—please try again.'
      );
    }

    return donePayload;
  } catch (err: unknown) {
    if (timedOut) {
      throw new Error(
        'This request took too long to complete. Your message has been preserved—please try again.'
      );
    }
    if (signal?.aborted) {
      throw err;
    }
    throw new Error(formatClientApiError(err, contextAction));
  } finally {
    cancelScheduledFlush();
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}
