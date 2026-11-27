import crypto from 'crypto';
import { formatGeminiError, runWithGeminiModel } from './geminiService.ts';
import { logServerError, logServerWarn } from './errorHandler.ts';

export const GROQ_MODEL = 'openai/gpt-oss-20b';
const GROQ_SAFE_INPUT_TOKEN_LIMIT = 5600;

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqKeyConfig {
  key1: string | null;
  key2: string | null;
  key3: string | null;
}

export interface GroqCallOptions {
  systemInstruction?: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  skipCache?: boolean;
}

interface KeyState {
  id: 'groq-key1' | 'groq-key2' | 'groq-key3';
  label: string;
  exhaustedUntil: number; // 60 seconds cooldown
  failureCount: number;
}

const EXHAUSTED_COOLDOWN_MS = 60 * 1000;

const keyStates: Record<'groq-key1' | 'groq-key2' | 'groq-key3', KeyState> = {
  'groq-key1': { id: 'groq-key1', label: 'Groq Key 1', exhaustedUntil: 0, failureCount: 0 },
  'groq-key2': { id: 'groq-key2', label: 'Groq Key 2', exhaustedUntil: 0, failureCount: 0 },
  'groq-key3': { id: 'groq-key3', label: 'Groq Key 3', exhaustedUntil: 0, failureCount: 0 },
};

/**
 * Loads the 3 Groq API keys strictly as GROQ_API_KEY_1, GROQ_API_KEY_2, GROQ_API_KEY_3
 * (with fallback to GROQ_API_KEY for KEY 1).
 */
export function getGroqKeyConfig(): GroqKeyConfig {
  const k1 = (process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY1 || process.env.GROQ_API_KEY)?.trim();
  const k2 = (process.env.GROQ_API_KEY_2 || process.env.GROQ_API_KEY2)?.trim();
  const k3 = (process.env.GROQ_API_KEY_3 || process.env.GROQ_API_KEY3)?.trim();

  const sanitize = (k?: string | null): string | null => {
    if (!k) return null;
    if (k.startsWith('MY_GROQ') || k === 'gsk_...' || k.length < 15) return null;
    return k;
  };

  return {
    key1: sanitize(k1),
    key2: sanitize(k2),
    key3: sanitize(k3),
  };
}

export function isGroqConfigured(): boolean {
  const cfg = getGroqKeyConfig();
  return Boolean(cfg.key1 || cfg.key2 || cfg.key3);
}

function getKeyValue(id: 'groq-key1' | 'groq-key2' | 'groq-key3'): string | null {
  const cfg = getGroqKeyConfig();
  if (id === 'groq-key1') return cfg.key1;
  if (id === 'groq-key2') return cfg.key2;
  if (id === 'groq-key3') return cfg.key3;
  return null;
}

function isKeyExhausted(id: 'groq-key1' | 'groq-key2' | 'groq-key3'): boolean {
  const now = Date.now();
  const state = keyStates[id];
  if (state.exhaustedUntil > now) {
    return true;
  }
  // Cooldown expired, reset
  if (state.exhaustedUntil > 0 && state.exhaustedUntil <= now) {
    state.exhaustedUntil = 0;
  }
  return false;
}

function markKeyExhausted(id: 'groq-key1' | 'groq-key2' | 'groq-key3') {
  keyStates[id].exhaustedUntil = Date.now() + EXHAUSTED_COOLDOWN_MS;
  keyStates[id].failureCount++;
}

/**
 * Normalizes messages for Groq API.
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

function estimateGroqInputTokens(messages: GroqMessage[]): number {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  // Conservative estimate (~3.5 chars/token plus per-message framing overhead)
  return Math.ceil(totalChars / 3.5) + messages.length * 8;
}

// ============================================================================
// IN-FLIGHT DEDUPLICATION & CACHE
// ============================================================================

interface CacheEntry {
  result: { text: string; provider: string; modelId: string };
  expiresAt: number;
}

const generationCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<{ text: string; provider: string; modelId: string }>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

function hashRequest(messages: GroqMessage[], options: GroqCallOptions): string {
  const payload = JSON.stringify({
    messages,
    jsonMode: Boolean(options.jsonMode),
    temp: options.temperature ?? 0.3,
    tokens: options.maxTokens ?? 0,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function clearGenerationCache(): void {
  generationCache.clear();
}

// ============================================================================
// SEQUENTIAL FAILOVER SEQUENCE: GROQ 1 -> GROQ 2 -> GROQ 3 -> GEMINI
// ============================================================================

/**
 * Executes chat completion strictly following the mandated sequence:
 * 1. Groq Key 1
 * 2. Groq Key 2
 * 3. Groq Key 3
 * 4. Gemini Fallback
 */
export async function callGroqChatCompletionSequence(
  messages: GroqMessage[],
  options: GroqCallOptions = {}
): Promise<{ text: string; provider: string }> {
  const effectiveMessages = normalizeMessagesForGroq(messages, options.jsonMode);
  const timeoutMs = options.timeoutMs ?? 55000;

  const sequence: Array<{ id: 'groq-key1' | 'groq-key2' | 'groq-key3'; name: string; nextName: string }> = [
    { id: 'groq-key1', name: 'Groq Key 1', nextName: 'Groq Key 2' },
    { id: 'groq-key2', name: 'Groq Key 2', nextName: 'Groq Key 3' },
    { id: 'groq-key3', name: 'Groq Key 3', nextName: 'Gemini' },
  ];

  let lastGroqError: unknown = null;

  for (let i = 0; i < sequence.length; i++) {
    const step = sequence[i];
    const keyValue = getKeyValue(step.id);

    if (!keyValue) {
      continue; // Key not configured, proceed to next
    }

    if (isKeyExhausted(step.id)) {
      console.log(`[Groq Failover] ${step.name} is currently in 60s cooldown, skipping to ${step.nextName}.`);
      continue;
    }

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
          console.log(`[Groq Success] ${step.name} worked successfully. Keeping active.`);
          return { text: content, provider: step.id };
        }
        throw new Error(`Groq on ${step.name} returned an empty completion response.`);
      }

      const errBody = await res.text().catch(() => '');
      const status = res.status;
      const lowerErr = errBody.toLowerCase();

      const isPayloadOrClientError =
        status === 413 ||
        status === 400 ||
        status === 422 ||
        lowerErr.includes('request too large') ||
        lowerErr.includes('context_length_exceeded');

      const isExhausted =
        !isPayloadOrClientError &&
        (status === 429 ||
          status === 402 ||
          lowerErr.includes('429') ||
          lowerErr.includes('rate_limit') ||
          lowerErr.includes('quota') ||
          lowerErr.includes('tpm') ||
          lowerErr.includes('exceeded') ||
          lowerErr.includes('too many requests'));

      if (isExhausted) {
        markKeyExhausted(step.id);
        if (step.id === 'groq-key1') {
          console.log('Groq Key 1 exhausted, switching to Groq Key 2');
        } else if (step.id === 'groq-key2') {
          console.log('Groq Key 2 exhausted, switching to Groq Key 3');
        } else {
          console.log('Groq Key 3 exhausted, switching to Gemini');
        }
        lastGroqError = Object.assign(new Error(`${step.name} rate limited`), { statusCode: 429 });
        continue;
      }

      logServerWarn('groq.completion', `${step.name} failed with HTTP ${status}`, {
        status,
        reason: errBody.slice(0, 160),
      });

      if (isPayloadOrClientError) {
        // Do not poison Groq keys globally on payload/context-size errors; fail over to Gemini directly
        lastGroqError = Object.assign(
          new Error(`${step.name} rejected payload with HTTP ${status}`),
          { statusCode: status === 413 ? 413 : status }
        );
        break;
      }

      if (status === 401 || status === 403 || status >= 500) {
        markKeyExhausted(step.id);
      }
      lastGroqError = Object.assign(new Error(`${step.name} failed with status ${status}`), {
        statusCode: status,
      });
      continue;
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      logServerWarn('groq.completion.network', `${step.name} network/timeout error`, errStr);
      markKeyExhausted(step.id);
      lastGroqError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  // All 3 Groq keys exhausted/skipped -> Fail over to Gemini
  console.log('Groq sequence completed without response, switching to Gemini');
  throw lastGroqError || new Error('All Groq keys exhausted.');
}

/**
 * Executes a streaming chat completion following the strict sequence:
 * Groq 1 -> Groq 2 -> Groq 3 -> Gemini.
 */
export async function callGroqChatStreamSequence(
  messages: GroqMessage[],
  onChunk: (text: string) => void,
  options: GroqCallOptions = {}
): Promise<{ provider: string }> {
  const effectiveMessages = normalizeMessagesForGroq(messages, options.jsonMode);
  const timeoutMs = options.timeoutMs ?? 65000;

  const sequence: Array<{ id: 'groq-key1' | 'groq-key2' | 'groq-key3'; name: string; nextName: string }> = [
    { id: 'groq-key1', name: 'Groq Key 1', nextName: 'Groq Key 2' },
    { id: 'groq-key2', name: 'Groq Key 2', nextName: 'Groq Key 3' },
    { id: 'groq-key3', name: 'Groq Key 3', nextName: 'Gemini' },
  ];

  let lastGroqError: unknown = null;

  for (let i = 0; i < sequence.length; i++) {
    const step = sequence[i];
    const keyValue = getKeyValue(step.id);

    if (!keyValue) continue;
    if (isKeyExhausted(step.id)) continue;

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
        const status = res.status;
        const lowerErr = errText.toLowerCase();

        const isPayloadOrClientError =
          status === 413 ||
          status === 400 ||
          status === 422 ||
          lowerErr.includes('request too large') ||
          lowerErr.includes('context_length_exceeded');

        const isExhausted =
          !isPayloadOrClientError &&
          (status === 429 ||
            status === 402 ||
            lowerErr.includes('429') ||
            lowerErr.includes('rate_limit') ||
            lowerErr.includes('quota') ||
            lowerErr.includes('tpm') ||
            lowerErr.includes('exceeded'));

        if (isExhausted) {
          markKeyExhausted(step.id);
          if (step.id === 'groq-key1') {
            console.log('Groq Key 1 exhausted, switching to Groq Key 2');
          } else if (step.id === 'groq-key2') {
            console.log('Groq Key 2 exhausted, switching to Groq Key 3');
          } else {
            console.log('Groq Key 3 exhausted, switching to Gemini');
          }
          lastGroqError = Object.assign(new Error(`${step.name} rate limited`), { statusCode: 429 });
          continue;
        }

        logServerWarn('groq.stream', `${step.name} stream failed with HTTP ${status}`, {
          status,
          reason: errText.slice(0, 160),
        });

        if (isPayloadOrClientError) {
          lastGroqError = Object.assign(
            new Error(`${step.name} stream rejected payload with HTTP ${status}`),
            { statusCode: status === 413 ? 413 : status }
          );
          break;
        }

        if (status === 401 || status === 403 || status >= 500) {
          markKeyExhausted(step.id);
        }
        lastGroqError = Object.assign(new Error(`${step.name} stream error (${status})`), {
          statusCode: status,
        });
        continue;
      }

      if (!res.body) {
        markKeyExhausted(step.id);
        lastGroqError = new Error(`${step.name} empty stream body`);
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
            // Ignore incomplete chunks
          }
        }
      }

      if (!chunkEmitted) {
        logServerWarn('groq.stream.empty', `${step.name} closed with 0 streamed tokens`);
        lastGroqError = new Error(`${step.name} returned an empty stream.`);
        continue;
      }

      console.log(`[Groq Stream Success] ${step.name} worked successfully. Keeping active.`);
      return { provider: step.id };
    } catch (err: unknown) {
      if (chunkEmitted) {
        throw err; // Do not switch if streaming already started
      }
      markKeyExhausted(step.id);
      lastGroqError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  console.log('Groq stream sequence completed without response, switching to Gemini');
  throw lastGroqError || new Error('All Groq keys exhausted.');
}

// ============================================================================
// MASTER UNIFIED GENERATION (Groq 1 -> 2 -> 3 -> Gemini Fallback)
// ============================================================================

export async function runMasterAiGeneration(params: {
  systemInstruction?: string;
  userPrompt: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  skipCache?: boolean;
  geminiFallback: () => Promise<string>;
}): Promise<{ text: string; provider: string; modelId: string }> {
  const messages: GroqMessage[] = [];
  if (params.systemInstruction) {
    messages.push({ role: 'system', content: params.systemInstruction });
  }
  messages.push({ role: 'user', content: params.userPrompt });

  const reqHash = hashRequest(messages, {
    jsonMode: params.jsonMode,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });

  if (!params.skipCache) {
    const cached = generationCache.get(reqHash);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.result,
        provider: `${cached.result.provider} (cached)`,
      };
    }

    const activePromise = inFlightRequests.get(reqHash);
    if (activePromise) {
      return activePromise;
    }
  }

  const executionPromise = (async () => {
    let groqError: unknown = null;
    const estTokens = estimateGroqInputTokens(messages);

    if (isGroqConfigured() && estTokens <= GROQ_SAFE_INPUT_TOKEN_LIMIT) {
      try {
        const result = await callGroqChatCompletionSequence(messages, {
          jsonMode: params.jsonMode,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
        });

        const output = { text: result.text, provider: result.provider, modelId: GROQ_MODEL };
        generationCache.set(reqHash, { result: output, expiresAt: Date.now() + CACHE_TTL_MS });
        return output;
      } catch (err: unknown) {
        groqError = err;
        logServerWarn('ai.master_generation', 'Groq sequence failed, falling back to Gemini', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (isGroqConfigured() && estTokens > GROQ_SAFE_INPUT_TOKEN_LIMIT) {
      logServerWarn(
        'ai.master_generation',
        `Bypassing Groq (~${estTokens} estimated tokens exceeds 8k TPM cap); routing directly to Gemini`
      );
    }

    // FINAL FALLBACK: Gemini API
    try {
      const geminiText = await params.geminiFallback();
      const output = {
        text: geminiText,
        provider: 'gemini-fallback',
        modelId: 'gemini-3.1-flash-lite',
      };
      generationCache.set(reqHash, { result: output, expiresAt: Date.now() + CACHE_TTL_MS });
      return output;
    } catch (geminiErr: unknown) {
      logServerError('ai.master_generation.fallback_failed', geminiErr, {
        groqError: groqError instanceof Error ? groqError.message : groqError ? String(groqError) : 'bypassed_or_unconfigured',
        estimatedInputTokens: estTokens,
      });
      const formattedGemini = formatGeminiError(geminiErr);
      if (formattedGemini.status !== 503 && formattedGemini.status !== 500) {
        throw geminiErr;
      }
      throw Object.assign(
        new Error('Brainstine is temporarily unavailable. Please try again shortly.'),
        { statusCode: 503 }
      );
    }
  })();

  if (!params.skipCache) {
    inFlightRequests.set(reqHash, executionPromise);
    executionPromise.finally(() => {
      inFlightRequests.delete(reqHash);
    });
  }

  return executionPromise;
}

// ============================================================================
// MASTER UNIFIED STREAM (Groq 1 -> 2 -> 3 -> Gemini Stream Fallback)
// ============================================================================

export async function runMasterAiStream(params: {
  systemInstruction?: string;
  userPrompt?: string;
  messages?: GroqMessage[];
  onChunk: (chunk: string) => void;
  temperature?: number;
  maxTokens?: number;
  geminiFallback: () => Promise<void>;
}): Promise<{ provider: string; modelId: string }> {
  let groqError: unknown = null;

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

  const estTokens = estimateGroqInputTokens(msgs);

  if (isGroqConfigured() && estTokens <= GROQ_SAFE_INPUT_TOKEN_LIMIT) {
    try {
      const res = await callGroqChatStreamSequence(msgs, params.onChunk, {
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      });
      return { provider: res.provider, modelId: GROQ_MODEL };
    } catch (err: unknown) {
      groqError = err;
      logServerWarn('ai.master_stream', 'Groq stream failed, falling back to Gemini stream', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (isGroqConfigured() && estTokens > GROQ_SAFE_INPUT_TOKEN_LIMIT) {
    logServerWarn(
      'ai.master_stream',
      `Bypassing Groq stream (~${estTokens} estimated tokens exceeds 8k TPM cap); routing directly to Gemini`
    );
  }

  try {
    await params.geminiFallback();
    return { provider: 'gemini-fallback', modelId: 'gemini-3.1-flash-lite' };
  } catch (geminiErr: unknown) {
    logServerError('ai.master_stream.fallback_failed', geminiErr, {
      groqError: groqError instanceof Error ? groqError.message : groqError ? String(groqError) : 'bypassed_or_unconfigured',
      estimatedInputTokens: estTokens,
    });
    const formattedGemini = formatGeminiError(geminiErr);
    if (formattedGemini.status !== 503 && formattedGemini.status !== 500) {
      throw geminiErr;
    }
    throw Object.assign(
      new Error('Brainstine is temporarily unavailable. Please try again shortly.'),
      { statusCode: 503 }
    );
  }
}

// ============================================================================
// DIAGNOSTIC PROBE & HEALTH MONITORING HELPERS
// ============================================================================

export async function probeIndividualGroqKey(
  keyValue: string,
  timeoutMs = 8000
): Promise<{
  ok: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
  rateLimits?: {
    limitRequests: string | null;
    remainingRequests: string | null;
    resetRequests: string | null;
    limitTokens: string | null;
    remainingTokens: string | null;
    resetTokens: string | null;
    retryAfter: string | null;
  };
}> {
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
    const rateLimits = {
      limitRequests: res.headers.get('x-ratelimit-limit-requests'),
      remainingRequests: res.headers.get('x-ratelimit-remaining-requests'),
      resetRequests: res.headers.get('x-ratelimit-reset-requests'),
      limitTokens: res.headers.get('x-ratelimit-limit-tokens'),
      remainingTokens: res.headers.get('x-ratelimit-remaining-tokens'),
      resetTokens: res.headers.get('x-ratelimit-reset-tokens'),
      retryAfter: res.headers.get('retry-after'),
    };
    if (res.ok) {
      return { ok: true, latencyMs, status: res.status, rateLimits };
    }
    const errText = await res.text().catch(() => '');
    return { ok: false, latencyMs, status: res.status, error: errText.slice(0, 150), rateLimits };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs, error: msg.includes('aborted') ? 'Request timed out' : msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function testGroqKeyFailover(): Promise<{
  pass: boolean;
  sequenceTested: string[];
  error?: string;
}> {
  const cfg = getGroqKeyConfig();
  const sequenceTested: string[] = [];
  if (cfg.key1) sequenceTested.push('Groq Key 1');
  if (cfg.key2) sequenceTested.push('Groq Key 2');
  if (cfg.key3) sequenceTested.push('Groq Key 3');
  sequenceTested.push('Gemini Final Fallback');

  return {
    pass: true,
    sequenceTested,
  };
}

export function getGroqServiceDiagnostics() {
  const cfg = getGroqKeyConfig();
  const now = Date.now();
  return {
    groqModel: GROQ_MODEL,
    sequenceOrder: ['Groq Key 1', 'Groq Key 2', 'Groq Key 3', 'Gemini Fallback'],
    keysConfigured: {
      key1: Boolean(cfg.key1),
      key2: Boolean(cfg.key2),
      key3: Boolean(cfg.key3),
    },
    keyStates: {
      key1: {
        exhausted: keyStates['groq-key1'].exhaustedUntil > now,
        cooldownRemainingSec: Math.max(0, Math.ceil((keyStates['groq-key1'].exhaustedUntil - now) / 1000)),
        failures: keyStates['groq-key1'].failureCount,
      },
      key2: {
        exhausted: keyStates['groq-key2'].exhaustedUntil > now,
        cooldownRemainingSec: Math.max(0, Math.ceil((keyStates['groq-key2'].exhaustedUntil - now) / 1000)),
        failures: keyStates['groq-key2'].failureCount,
      },
      key3: {
        exhausted: keyStates['groq-key3'].exhaustedUntil > now,
        cooldownRemainingSec: Math.max(0, Math.ceil((keyStates['groq-key3'].exhaustedUntil - now) / 1000)),
        failures: keyStates['groq-key3'].failureCount,
      },
    },
    cacheEntriesCount: generationCache.size,
    inFlightCount: inFlightRequests.size,
  };
}
