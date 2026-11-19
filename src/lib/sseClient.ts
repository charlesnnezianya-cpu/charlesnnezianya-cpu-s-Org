export interface SseStreamOptions<TDone> {
  url: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  idleTimeoutMs?: number;
  onChunk: (delta: string, accumulated: string) => void;
  onStart?: () => void;
  fallbackErrorMessage: string;
}

export async function postSseStream<TDone>({
  url,
  body,
  signal,
  idleTimeoutMs = 150000,
  onChunk,
  onStart,
  fallbackErrorMessage,
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

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: internalController.signal,
    });

    if (!response.ok) {
      let message = fallbackErrorMessage;
      try {
        const errJson = await response.json();
        if (errJson?.error) message = String(errJson.error);
      } catch {
        const text = await response.text().catch(() => '');
        if (text) message = text;
      }
      throw new Error(message);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream') || !response.body) {
      const json = (await response.json()) as TDone & { reply?: string };
      if (json.reply) {
        onChunk(json.reply, json.reply);
      }
      return json;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
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
          accumulated += delta;
          onChunk(delta, accumulated);
        }
      } else if (eventName === 'done') {
        donePayload = parsed as unknown as TDone;
      } else if (eventName === 'error') {
        const msg =
          typeof parsed.error === 'string' && parsed.error
            ? parsed.error
            : fallbackErrorMessage;
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
      if (accumulated.trim()) {
        return { reply: accumulated.trim() } as unknown as TDone;
      }
      throw new Error(fallbackErrorMessage);
    }

    return donePayload;
  } catch (err: unknown) {
    if (timedOut) {
      throw new Error(
        'The AI response took longer than expected without streaming data. Please try again.'
      );
    }
    throw err;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}
