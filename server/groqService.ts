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
 * Normalizes messages for Groq API.
 * When jsonMode is requested, Groq requires the word 'json' in messages.
 */
function normalizeMessagesForGroq(
  messages: GroqMessage[],
  jsonMode?: boolean
): GroqMessage[] {
  const result = messages.map((m) => ({ ...m }));
  if (jsonMode) {
    const hasJsonWord = result.some((m) =>
      m.content.toLowerCase().includes('json')
    );
    if (!hasJsonWord) {
      const sysIdx = result.findIndex((m) => m.role === 'system');
      if (sysIdx >= 0) {
        result[sysIdx].content += '\n\nYou must respond with a valid JSON object.';
      } else {
        result.unshift({
          role: 'system',
          content: 'You are an academic AI assistant. You must respond with a valid JSON object.',
        });
      }
    }
  }
  return result;
}

/**
 * Executes a chat completion against GroqCloud following the strict priority sequence:
 * GROQ API KEY 1 -> GROQ API KEY 2 -> GROQ API KEY 3.
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

  const effectiveMessages = normalizeMessagesForGroq(messages, options.jsonMode);
  const timeoutMs = options.timeoutMs ?? 60000;
  let lastError: unknown = null;

  for (const attemptItem of attempts) {
    const { keyName, keyValue } = attemptItem;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const payload: Record<string, unknown> = {
        model: GROQ_MODEL,
        messages: effectiveMessages,
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
        throw new Error(`Groq on ${keyName} returned an empty completion response.`);
      }

      const errBody = await res.text().catch(() => '');
      const status = res.status;
      console.warn(
        `[Master AI Sequence] Groq attempt on ${keyName} failed with HTTP ${status}: ${errBody.slice(0, 250)}`
      );

      lastError = new Error(`Groq error on ${keyName} (status ${status}): ${errBody.slice(0, 200)}`);
      // Proceed to the next key in sequence (e.g. key1 -> key2 -> key3)
    } catch (err: unknown) {
      lastError = err;
      const errStr = err instanceof Error ? err.message : String(err);
      console.warn(`[Master AI Sequence] Groq attempt on ${keyName} caught: ${errStr}`);
      if (errStr.includes('aborted') || err instanceof DOMException) {
        lastError = new Error(`Groq request timed out on ${keyName}.`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('All configured Groq keys failed.');
}

/**
 * Executes a streaming chat completion against GroqCloud following the strict sequence:
 * GROQ API KEY 1 -> GROQ API KEY 2 -> GROQ API KEY 3.
 */
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

  const effectiveMessages = normalizeMessagesForGroq(messages, options.jsonMode);
  const timeoutMs = options.timeoutMs ?? 75000;
  let lastError: unknown = null;

  for (const attemptItem of attempts) {
    const { keyName, keyValue } = attemptItem;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let chunkEmitted = false;

    try {
      const payload: Record<string, unknown> = {
        model: GROQ_MODEL,
        messages: effectiveMessages,
        temperature: options.temperature ?? 0.4,
        stream: true,
      };

      if (options.maxTokens) {
        payload.max_tokens = options.maxTokens;
      }

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
        console.warn(
          `[Master AI Sequence] Groq stream on ${keyName} failed with HTTP ${res.status}: ${errText.slice(0, 250)}`
        );
        lastError = new Error(`Groq stream error on ${keyName} (status ${res.status}): ${errText.slice(0, 200)}`);
        continue;
      }

      if (!res.body) {
        lastError = new Error(`Groq stream on ${keyName} returned an empty body.`);
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
              chunkEmitted = true;
              onChunk(delta);
            }
          } catch {
            // Ignore incomplete streaming frames
          }
        }
      }

      return { provider: keyName };
    } catch (err: unknown) {
      console.warn(`[Master AI Sequence] Groq stream caught error on ${keyName}:`, err);
      if (chunkEmitted) {
        // Stream already started delivering to client; rethrow
        throw err;
      }
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Groq streaming failed across all configured keys.');
}

/**
 * Master unified execution helper for non-streaming calls:
 * Strict sequence: GROQ KEY 1 -> GROQ KEY 2 -> GROQ KEY 3 -> Gemini Fallback.
 */
export async function runMasterAiGeneration(params: {
  systemInstruction?: string;
  userPrompt: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  geminiFallback: () => Promise<string>;
}): Promise<{ text: string; provider: string; modelId: string }> {
  const cfg = getGroqKeyConfig();
  if (cfg.key1 || cfg.key2 || cfg.key3) {
    try {
      const messages: GroqMessage[] = [];
      if (params.systemInstruction) {
        messages.push({ role: 'system', content: params.systemInstruction });
      }
      messages.push({ role: 'user', content: params.userPrompt });

      const result = await callGroqChatCompletionSequence(messages, {
        jsonMode: params.jsonMode,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
      });
      return { text: result.text, provider: result.provider, modelId: GROQ_MODEL };
    } catch (groqSeqErr) {
      console.warn('[Master AI Sequence] All Groq keys exhausted, falling back to Gemini API:', groqSeqErr);
    }
  }

  const geminiText = await params.geminiFallback();
  return { text: geminiText, provider: 'gemini-fallback', modelId: 'gemini-3.1-flash-lite' };
}

/**
 * Master unified execution helper for streaming calls:
 * Strict sequence: GROQ KEY 1 -> GROQ KEY 2 -> GROQ KEY 3 -> Gemini Fallback.
 */
export async function runMasterAiStream(params: {
  systemInstruction?: string;
  userPrompt?: string;
  messages?: GroqMessage[];
  onChunk: (chunk: string) => void;
  temperature?: number;
  maxTokens?: number;
  geminiFallback: () => Promise<void>;
}): Promise<{ provider: string; modelId: string }> {
  const cfg = getGroqKeyConfig();
  if (cfg.key1 || cfg.key2 || cfg.key3) {
    try {
      let msgs: GroqMessage[] = [];
      if (params.messages && params.messages.length > 0) {
        msgs = params.messages;
      } else {
        if (params.systemInstruction) {
          msgs.push({ role: 'system', content: params.systemInstruction });
        }
        if (params.userPrompt) {
          msgs.push({ role: 'user', content: params.userPrompt });
        }
      }

      const res = await callGroqChatStreamSequence(msgs, params.onChunk, {
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      });
      return { provider: res.provider, modelId: GROQ_MODEL };
    } catch (groqStreamErr) {
      console.warn('[Master AI Sequence] Groq streaming failed across all keys, falling back to Gemini stream:', groqStreamErr);
    }
  }

  await params.geminiFallback();
  return { provider: 'gemini-fallback', modelId: 'gemini-3.1-flash-lite' };
}

/**
 * Directly probes an individual Groq API key with a 1-token test prompt.
 * Used for technical audit, diagnostic verification, and health monitoring.
 */
export async function probeIndividualGroqKey(
  keyValue: string,
  timeoutMs: number = 8000
): Promise<{ ok: boolean; latencyMs: number; status?: number; error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keyValue}`,
        'Content-Type': 'application/json',
        'User-Agent': 'aistudio-build',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { ok: true, latencyMs, status: res.status };
    }
    const errText = await res.text().catch(() => '');
    return { ok: false, latencyMs, status: res.status, error: errText.slice(0, 150) };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs, error: msg.includes('aborted') ? 'Request timed out' : msg };
  } finally {
    clearTimeout(timer);
  }
}
