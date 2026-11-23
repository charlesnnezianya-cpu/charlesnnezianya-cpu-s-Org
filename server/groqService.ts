import { runWithGeminiModel } from './geminiService.ts';

export const GROQ_MODEL = 'openai/gpt-oss-20b';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqKeyConfig {
  key1: string | null;
  key2: string | null;
  key3: string | null;
}

export function getGroqKeyConfig(): GroqKeyConfig {
  const k1 = process.env.GROQ_API_KEY?.trim();
  const k2 = process.env.GROQ_API_KEY_2?.trim();
  const k3 = process.env.GROQ_API_KEY_3?.trim();

  return {
    key1: k1 && k1 !== 'MY_GROQ_API_KEY' ? k1 : null,
    key2: k2 && k2 !== 'MY_GROQ_API_KEY_2' ? k2 : null,
    key3: k3 && k3 !== 'MY_GROQ_API_KEY_3' ? k3 : null,
  };
}

export function isGroqConfigured(): boolean {
  const cfg = getGroqKeyConfig();
  return Boolean(cfg.key1 || cfg.key2 || cfg.key3);
}

export interface GroqCallOptions {
  systemInstruction?: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Executes a chat completion against GroqCloud following the strict priority sequence:
 * GROQ API KEY 1 -> GROQ API KEY 2 -> GROQ API KEY 3 -> Gemini Fallback.
 */
export async function callGroqChatCompletionSequence(
  messages: GroqMessage[],
  options: GroqCallOptions = {}
): Promise<{ text: string; provider: 'groq-key1' | 'groq-key2' | 'groq-key3' }> {
  const cfg = getGroqKeyConfig();
  const attempts: Array<{ keyName: 'groq-key1' | 'groq-key2' | 'groq-key3'; keyValue: string }> = [];

  if (cfg.key1) attempts.push({ keyName: 'groq-key1', keyValue: cfg.key1 });
  if (cfg.key2) attempts.push({ keyName: 'groq-key2', keyValue: cfg.key2 });
  if (cfg.key3) attempts.push({ keyName: 'groq-key3', keyValue: cfg.key3 });

  if (attempts.length === 0) {
    throw new Error('No Groq API keys configured.');
  }

  const timeoutMs = options.timeoutMs ?? 60000;
  let lastError: unknown = null;

  for (const attemptItem of attempts) {
    const { keyName, keyValue } = attemptItem;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const payload: Record<string, unknown> = {
        model: GROQ_MODEL,
        messages,
        temperature: options.temperature ?? 0.3,
      };

      if (options.jsonMode) {
        payload.response_format = { type: 'json_object' };
      }
      if (options.maxTokens) {
        payload.max_tokens = options.maxTokens;
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keyValue}`,
          'Content-Type': 'application/json',
          'User-Agent': 'aistudio-build',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content?.trim();
        if (content) {
          return { text: content, provider: keyName };
        }
        throw new Error('Groq returned an empty completion response.');
      }

      const errBody = await res.text().catch(() => '');
      const status = res.status;

      // If permanent client error (400, 401, 403), do not retry Groq further
      if (status === 401 || status === 403 || status === 400) {
        throw new Error(`Groq non-retryable error (status ${status}): ${errBody.slice(0, 200)}`);
      }

      // For 429, 503, etc., proceed to next key in sequence
      lastError = new Error(`Groq error (status ${status}): ${errBody.slice(0, 200)}`);
    } catch (err: unknown) {
      lastError = err;
      const errStr = err instanceof Error ? err.message : String(err);
      if (errStr.includes('aborted') || err instanceof DOMException) {
        lastError = new Error('Groq request timed out.');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('All Groq keys failed.');
}

export async function callGroqChatStreamSequence(
  messages: GroqMessage[],
  onChunk: (text: string) => void,
  options: GroqCallOptions = {}
): Promise<{ provider: 'groq-key1' | 'groq-key2' | 'groq-key3' }> {
  const cfg = getGroqKeyConfig();
  const attempts: Array<{ keyName: 'groq-key1' | 'groq-key2' | 'groq-key3'; keyValue: string }> = [];

  if (cfg.key1) attempts.push({ keyName: 'groq-key1', keyValue: cfg.key1 });
  if (cfg.key2) attempts.push({ keyName: 'groq-key2', keyValue: cfg.key2 });
  if (cfg.key3) attempts.push({ keyName: 'groq-key3', keyValue: cfg.key3 });

  if (attempts.length === 0) {
    throw new Error('No Groq API keys configured.');
  }

  const timeoutMs = options.timeoutMs ?? 75000;
  let lastError: unknown = null;

  for (const attemptItem of attempts) {
    const { keyName, keyValue } = attemptItem;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const payload = {
        model: GROQ_MODEL,
        messages,
        temperature: options.temperature ?? 0.4,
        stream: true,
      };

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keyValue}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'User-Agent': 'aistudio-build',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = new Error(`Groq Stream error (status ${res.status}): ${errText.slice(0, 200)}`);
        continue;
      }

      if (!res.body) {
        lastError = new Error('Groq returned a response without a readable body stream.');
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              onChunk(delta);
            }
          } catch {
            // ignore JSON parse errors on malformed chunks
          }
        }
      }

      return { provider: keyName };
    } catch (err: unknown) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Groq streaming failed across all keys.');
}

/**
 * Master unified execution helper:
 * Tries Groq Key 1 -> Groq Key 2 -> Groq Key 3 -> Gemini Fallback.
 */
export async function runMasterAiGeneration(params: {
  systemInstruction: string;
  userPrompt: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  geminiFallback: () => Promise<string>;
}): Promise<{ text: string; provider: string; modelId: string }> {
  const cfg = getGroqKeyConfig();
  if (cfg.key1 || cfg.key2 || cfg.key3) {
    try {
      const messages: GroqMessage[] = [
        { role: 'system', content: params.systemInstruction },
        { role: 'user', content: params.userPrompt },
      ];
      const result = await callGroqChatCompletionSequence(messages, {
        jsonMode: params.jsonMode,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
      });
      return { text: result.text, provider: result.provider, modelId: GROQ_MODEL };
    } catch (groqSeqErr) {
      console.warn('[Master AI Sequence] Groq keys exhausted, falling back to Gemini', groqSeqErr);
    }
  }

  const geminiText = await params.geminiFallback();
  return { text: geminiText, provider: 'gemini-fallback', modelId: 'gemini-3.1-flash-lite' };
}
