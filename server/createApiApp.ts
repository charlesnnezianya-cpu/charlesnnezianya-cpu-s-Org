import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { ThinkingLevel, Type } from '@google/genai';
import { extractText as extractPdfText } from 'unpdf';
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
} from '../src/types/brainstine.ts';
import {
  AUTHORIZED_GEMINI_MODEL,
  AiInvalidResponseError,
  ensureResolvedGeminiModel,
  getConfiguredGeminiModel,
  getGeminiClient,
  getGeminiModel,
  getModelThinkingConfig,
  getResolvedModelState,
  isGeminiConfigured,
  parseAiJsonResponse,
  probeSingleModelQuick,
  runWithGeminiModel,
  withRetry,
} from './geminiService.ts';
import {
  buildSafeApiError,
  logServerError,
  logServerWarn,
  sendSafeApiError,
} from './errorHandler.ts';
import {
  isGroqConfigured,
  getGroqKeyConfig,
  callGroqChatCompletionSequence,
  callGroqChatStreamSequence,
  runMasterAiGeneration,
  runMasterAiStream,
  probeIndividualGroqKey,
  testGroqKeyFailover,
  getGroqServiceDiagnostics,
  GROQ_MODEL,
} from './groqService.ts';

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length));

  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
  return results;
}

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
    const escCell = (val: unknown) =>
      String(val ?? '')
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, ' ')
        .trim();

    lines.push('## Comparison Tables');
    for (const table of summary.comparisonTables) {
      lines.push(`### ${table.title}`);
      const headers = ['Criterion', ...table.headers].map(escCell);
      lines.push(`| ${headers.join(' | ')} |`);
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      for (const row of table.rows) {
        lines.push(`| ${escCell(row.criterion)} | ${row.values.map(escCell).join(' | ')} |`);
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
    throw Object.assign(
      new Error('Unsupported image format. Please attach a JPG, JPEG, PNG, or WEBP image.'),
      { statusCode: 400 }
    );
  }
  const cleanBase64 = image.data.replace(/^data:[^;]+;base64,/, '').trim();
  const approxBytes = Math.ceil((cleanBase64.length * 3) / 4);
  if (approxBytes > 15 * 1024 * 1024) {
    throw Object.assign(
      new Error('Attached image exceeds the 15 MB limit. Please choose a smaller image.'),
      { statusCode: 400 }
    );
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
        Boolean(
          h &&
            (h.role === 'user' || h.role === 'assistant') &&
            typeof h.content === 'string' &&
            h.content.trim()
        )
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
  const cleanMessage = typeof body.message === 'string' ? body.message.trim() : '';
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

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

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
  const cleanMessage = typeof body.message === 'string' ? body.message.trim() : '';
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

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

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
- When a structured visual diagram genuinely helps explain a step (such as a cycle, pathway, concept tree, scientific system, or plotted curve), you may include ONE single-line diagram block on its own line:
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

function getSafeStreamEnd(fullText: string, markerPrefix: string): number {
  const markerIdx = fullText.indexOf(markerPrefix);
  if (markerIdx >= 0) {
    return markerIdx;
  }
  const maxCheck = Math.min(fullText.length, markerPrefix.length - 1);
  for (let len = maxCheck; len >= 1; len--) {
    if (markerPrefix.startsWith(fullText.slice(-len))) {
      return fullText.length - len;
    }
  }
  return fullText.length;
}

async function openStreamAndPullFirstChunk<T extends { text?: string }>(
  createStream: (signal?: AbortSignal) => Promise<AsyncIterable<T>>,
  options: { timeoutMs: number; externalSignal: AbortSignal }
): Promise<{ iterator: AsyncIterator<T>; firstResult: IteratorResult<T> }> {
  return withRetry(
    async (signal) => {
      const combined = new AbortController();
      const abortFromRetry = () => combined.abort(signal?.reason);
      const abortFromClient = () => combined.abort(options.externalSignal.reason);
      signal?.addEventListener('abort', abortFromRetry, { once: true });
      if (options.externalSignal.aborted) {
        combined.abort(options.externalSignal.reason);
      } else {
        options.externalSignal.addEventListener('abort', abortFromClient, { once: true });
      }
      try {
        const stream = await createStream(combined.signal);
        const iterator = stream[Symbol.asyncIterator]();
        let firstResult = await iterator.next();
        while (!firstResult.done && !(firstResult.value?.text ?? '')) {
          firstResult = await iterator.next();
        }
        if (firstResult.done) {
          throw new AiInvalidResponseError(
            'The AI returned an empty response. Your message has been preserved—please try again.'
          );
        }
        return { iterator, firstResult };
      } catch (err) {
        options.externalSignal.removeEventListener('abort', abortFromClient);
        throw err;
      } finally {
        signal?.removeEventListener('abort', abortFromRetry);
      }
    },
    {
      maxRetries: 3,
      baseDelayMs: 900,
      maxTotalElapsedMs: 22000,
      timeoutMs: options.timeoutMs,
      externalSignal: options.externalSignal,
    }
  );
}

export function createApiApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((req: Request, _res: Response, next: NextFunction) => {
    const rawUrl = req.url || '/';
    try {
      const parsed = new URL(rawUrl, 'http://localhost');
      if (parsed.pathname === '/api/index' || parsed.searchParams.has('__apiPath')) {
        const apiPathRaw = parsed.searchParams.get('__apiPath') ?? '';
        parsed.searchParams.delete('__apiPath');
        const cleanPath = apiPathRaw.replace(/^\/+/, '');
        const nextPathname = cleanPath ? `/api/${cleanPath}` : '/api';
        const nextSearch = parsed.searchParams.toString();
        req.url = `${nextPathname}${nextSearch ? `?${nextSearch}` : ''}`;
      }
    } catch {
      // ignore malformed URLs
    }
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.use(express.json({ limit: '20mb' }));
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in (err as object)) {
      return sendSafeApiError(res, 'api.unhandled', new Error('Invalid request data.'), {
        explicitStatus: 400,
        meta: { method: req.method, path: req.path, reason: 'json_syntax' },
      });
    }
    const errObj = err as { type?: string; status?: number };
    if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
      return sendSafeApiError(res, 'api.unhandled', err, {
        explicitStatus: 413,
        meta: { method: req.method, path: req.path },
      });
    }
    next(err);
  });

  app.use(
    ['/api/materials', '/api/summaries', '/api/quizzes', '/api/ai'],
    async (_req: Request, _res: Response, next: NextFunction) => {
      try {
        await ensureResolvedGeminiModel();
      } catch {
        // Allow downstream route handlers to surface configuration errors cleanly
      }
      next();
    }
  );

  app.get('/api/health', async (req: Request, res: Response) => {
    const groqKeyConfig = getGroqKeyConfig();
    const groqConfigured = Boolean(groqKeyConfig.key1 || groqKeyConfig.key2 || groqKeyConfig.key3);
    const geminiConfigured = isGeminiConfigured();
    const aiConfigured = groqConfigured || geminiConfigured;

    const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
    const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
    const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
    const configuredEnvModel = getConfiguredGeminiModel();

    if (geminiConfigured && !getResolvedModelState()) {
      await ensureResolvedGeminiModel().catch(() => {});
    }

    const resolvedState = getResolvedModelState();
    const activeModel = getGeminiModel();

    if (req.query.probe === '1') {
      let groqProbe: { ok: boolean; provider?: string; error?: string; latencyMs: number } | null = null;
      if (groqConfigured) {
        const groqStart = Date.now();
        try {
          const groqRes = await callGroqChatCompletionSequence([
            { role: 'user', content: 'Reply with the single word OK.' }
          ], { timeoutMs: 15000 });
          groqProbe = {
            ok: Boolean(groqRes.text),
            provider: groqRes.provider,
            latencyMs: Date.now() - groqStart,
          };
        } catch (err: unknown) {
          groqProbe = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            latencyMs: Date.now() - groqStart,
          };
        }
      }

      const individualKeyProbes: {
        key1?: { ok: boolean; latencyMs: number; status?: number; error?: string; rateLimits?: Record<string, string | null> };
        key2?: { ok: boolean; latencyMs: number; status?: number; error?: string; rateLimits?: Record<string, string | null> };
        key3?: { ok: boolean; latencyMs: number; status?: number; error?: string; rateLimits?: Record<string, string | null> };
      } = {};

      if (groqKeyConfig.key1) {
        individualKeyProbes.key1 = await probeIndividualGroqKey(groqKeyConfig.key1);
      }
      if (groqKeyConfig.key2) {
        individualKeyProbes.key2 = await probeIndividualGroqKey(groqKeyConfig.key2);
      }
      if (groqKeyConfig.key3) {
        individualKeyProbes.key3 = await probeIndividualGroqKey(groqKeyConfig.key3);
      }

      let keyFailoverTestResult: { pass: boolean; providerResolved?: string; error?: string } | null = null;
      if (groqKeyConfig.key2) {
        keyFailoverTestResult = await testGroqKeyFailover();
      }

      let listedCount = 0;
      let probeResults: Array<{ ok: boolean; latencyMs: number; status?: number; quotaHit?: boolean }> = [];

      if (geminiConfigured) {
        const ai = getGeminiClient();
        try {
          const pager = await ai.models.list({ config: { pageSize: 50 } });
          for await (const m of pager) {
            if (m.name) listedCount++;
            if (listedCount >= 60) break;
          }
        } catch (err: unknown) {
          logServerWarn('api.health.probe', 'Model list probe encountered an error', err);
        }

        try {
          const singleProbe = await probeSingleModelQuick(ai, activeModel, 6000);
          probeResults.push({
            ok: singleProbe.ok,
            latencyMs: singleProbe.latencyMs,
            status: singleProbe.status,
            quotaHit: singleProbe.quotaHit,
            modelTested: activeModel,
          } as any);
        } catch {}
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

      return res.json({
        ok: true,
        aiConfigured,
        geminiConfigured: aiConfigured,
        groqConfigured,
        groqKeys: {
          key1: Boolean(groqKeyConfig.key1),
          key2: Boolean(groqKeyConfig.key2),
          key3: Boolean(groqKeyConfig.key3),
        },
        groqProbe,
        groqIndividualProbes: individualKeyProbes,
        keyFailoverTest: keyFailoverTestResult,
        groqDiagnostics: getGroqServiceDiagnostics(),
        supabaseConfigured,
        supabaseHealthy,
        listedCount,
        probeResults,
      });
    }

    res.json({
      ok: true,
      aiConfigured,
      geminiConfigured: aiConfigured,
      groqConfigured,
      groqKeys: {
        key1: Boolean(groqKeyConfig.key1),
        key2: Boolean(groqKeyConfig.key2),
        key3: Boolean(groqKeyConfig.key3),
      },
      supabaseConfigured,
      configuredModel: configuredEnvModel ? 'locked' : 'default',
      activeModel: groqConfigured ? GROQ_MODEL : (resolvedState ? 'ready' : activeModel ? 'ready' : 'unavailable'),
    });
  });

  app.get('/api/auth/oauth-status', async (req: Request, res: Response) => {
    const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '')
      .trim()
      .replace(/\/$/, '');
    const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.json({
        supabaseConfigured: false,
        googleEnabled: false,
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
      if (!location && !authRes.ok) {
        const rawErr = await authRes.text().catch(() => '');
        logServerWarn('auth.oauth_status', 'OAuth authorize probe failed', {
          status: authRes.status,
          body: rawErr.slice(0, 300),
        });
      }

      let hasClientId = false;
      let callbackMatchesSupabase = false;
      let googleErrorType: string | null = null;

      if (location) {
        try {
          const parsedLoc = new URL(location);
          const clientIdParam = parsedLoc.searchParams.get('client_id') || '';
          hasClientId = Boolean(clientIdParam.trim());
          const cbUri = parsedLoc.searchParams.get('redirect_uri') || '';
          callbackMatchesSupabase = cbUri === `${supabaseUrl}/auth/v1/callback`;

          const gRes = await fetch(location, { redirect: 'manual' });
          const gLoc = gRes.headers.get('location');
          if (gLoc) {
            try {
              const gLocUrl = new URL(gLoc, 'https://accounts.google.com');
              const explicitErr =
                gLocUrl.searchParams.get('error') || gLocUrl.searchParams.get('errorCode') || '';
              const authErrorB64 = gLocUrl.searchParams.get('authError') || '';
              let decodedAuthError = '';
              if (authErrorB64) {
                try {
                  decodedAuthError = Buffer.from(authErrorB64, 'base64').toString('utf8');
                } catch {
                  decodedAuthError = '';
                }
              }

              let googleErrorDetail = '';
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
                googleErrorDetail = (match ? match[0] : '').trim();
              }

              const combinedHint = `${explicitErr} ${decodedAuthError} ${googleErrorDetail}`.toLowerCase();
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
              // ignore malformed redirect URL
            }
          }
        } catch {
          // ignore URL parse error
        }
      }

      return res.json({
        supabaseConfigured: true,
        googleEnabled,
        hasClientId,
        callbackMatchesSupabase,
        googleErrorType,
      });
    } catch (err: unknown) {
      const refId = logServerError('auth.oauth_status', err);
      return res.status(500).json({
        supabaseConfigured: true,
        googleEnabled: false,
        error: 'Unable to check sign-in availability right now.',
        referenceId: refId,
      });
    }
  });

  app.post(
    '/api/materials/extract',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return sendSafeApiError(res, 'materials.extract', err, { explicitStatus: 400 });
          }
          return sendSafeApiError(
            res,
            'materials.extract',
            err,
            { explicitStatus: 400, meta: { multerCode: err.code } }
          );
        }
        if (err) {
          return sendSafeApiError(res, 'materials.extract', err, { explicitStatus: 400 });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        let uploadedFile:
          | { buffer: Buffer; originalname: string; mimetype: string; size: number }
          | undefined = req.file
          ? {
              buffer: req.file.buffer,
              originalname: req.file.originalname,
              mimetype: req.file.mimetype,
              size: req.file.size,
            }
          : undefined;

        if (uploadedFile && uploadedFile.size === 0) {
          return res.status(400).json({ error: 'The uploaded file is empty (0 bytes).' });
        }

        const signedStorageUrl =
          typeof req.body?.signedStorageUrl === 'string' ? req.body.signedStorageUrl.trim() : '';

        if (!uploadedFile && signedStorageUrl) {
          const supabaseUrlRaw = (
            process.env.VITE_SUPABASE_URL ||
            process.env.SUPABASE_URL ||
            ''
          ).trim();
          let expectedHost = '';
          try {
            if (supabaseUrlRaw) {
              expectedHost = new URL(supabaseUrlRaw).hostname.toLowerCase();
            }
          } catch {
            expectedHost = '';
          }

          let parsedSignedUrl: URL;
          try {
            parsedSignedUrl = new URL(signedStorageUrl);
          } catch (urlErr: unknown) {
            return sendSafeApiError(
              res,
              'materials.extract',
              urlErr,
              { explicitStatus: 400, meta: { stage: 'parse_staged_url' } }
            );
          }

          const isSupabaseHost =
            (expectedHost && parsedSignedUrl.hostname.toLowerCase() === expectedHost) ||
            parsedSignedUrl.hostname.toLowerCase().endsWith('.supabase.co');

          if (
            parsedSignedUrl.protocol !== 'https:' ||
            Boolean(parsedSignedUrl.username) ||
            Boolean(parsedSignedUrl.password) ||
            !isSupabaseHost ||
            !parsedSignedUrl.pathname.startsWith('/storage/v1/object/sign/study-materials/')
          ) {
            return sendSafeApiError(
              res,
              'materials.extract',
              new Error('Invalid staged file URL origin or path'),
              { explicitStatus: 400, meta: { stage: 'validate_staged_url' } }
            );
          }

          const fetchAc = new AbortController();
          const fetchTimer = setTimeout(() => fetchAc.abort(), 35000);
          let fileArrayBuf: ArrayBuffer;
          let responseMime = '';
          try {
            const fileRes = await fetch(parsedSignedUrl.toString(), {
              signal: fetchAc.signal,
              redirect: 'error',
            });
            if (!fileRes.ok) {
              return sendSafeApiError(
                res,
                'materials.extract',
                new Error(`Failed to retrieve staged file (status ${fileRes.status})`),
                { explicitStatus: 400, meta: { stage: 'fetch_staged_file', upstreamStatus: fileRes.status } }
              );
            }
            const lenHeader = Number(fileRes.headers.get('content-length') || 0);
            if (lenHeader > MAX_FILE_SIZE_BYTES) {
              return res.status(400).json({
                error: 'File exceeds the 25 MB maximum upload limit. Please compress or split the file.',
              });
            }
            responseMime = (fileRes.headers.get('content-type') || '').split(';')[0].trim();
            fileArrayBuf = await fileRes.arrayBuffer();
          } finally {
            clearTimeout(fetchTimer);
          }

          if (fileArrayBuf.byteLength === 0) {
            return res.status(400).json({ error: 'The uploaded file is empty.' });
          }
          if (fileArrayBuf.byteLength > MAX_FILE_SIZE_BYTES) {
            return res.status(400).json({
              error: 'File exceeds the 25 MB maximum upload limit. Please compress or split the file.',
            });
          }

          const providedName =
            typeof req.body?.fileName === 'string' && req.body.fileName.trim()
              ? path.basename(req.body.fileName.trim())
              : 'study-material';
          const providedMime =
            typeof req.body?.mimeType === 'string' && req.body.mimeType.trim()
              ? req.body.mimeType.trim()
              : responseMime || 'application/octet-stream';

          uploadedFile = {
            buffer: Buffer.from(fileArrayBuf),
            originalname: providedName,
            mimetype: providedMime,
            size: fileArrayBuf.byteLength,
          };
        }

        if (!uploadedFile) {
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

        const file = uploadedFile;
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
          try {
            const pdfRes = await extractPdfText(new Uint8Array(file.buffer), {
              mergePages: false,
            });
            pageCount = pdfRes.totalPages;
            const pdfPages = Array.isArray(pdfRes.text)
              ? pdfRes.text
              : [String(pdfRes.text || '')];
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
            logServerWarn('materials.extract.pdf_text', 'Primary PDF text extraction failed', pdfErr);
          }

          let ocrFallbackError: unknown = null;
          if (!extractedText || extractedText.length < 60) {
            if (file.buffer.byteLength <= 20 * 1024 * 1024 && isGeminiConfigured()) {
              try {
                const ai = getGeminiClient();
                const base64Pdf = file.buffer.toString('base64');
                const { result: ocrResponse } = await runWithGeminiModel(
                  (model, signal) =>
                    ai.models.generateContent({
                      model,
                      contents: [
                        {
                          inlineData: {
                            mimeType: 'application/pdf',
                            data: base64Pdf,
                          },
                        },
                        {
                          text: 'Extract all readable academic text, headings, formulas, equations, diagram labels, and bullet points from this document in exact reading order. Preserve section headers. Output only the extracted study text without commentary.',
                        },
                      ],
                      config: {
                        ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                        abortSignal: signal,
                      },
                    }),
                  { maxRetries: 1, timeoutMs: 45000 }
                );
                const ocrText = (ocrResponse.text ?? '').trim();
                if (ocrText && ocrText.length >= 20) {
                  extractedText = ocrText;
                  extractionMethod = 'pdf-ocr';
                }
              } catch (ocrErr) {
                ocrFallbackError = ocrErr;
                const errStatus = (ocrErr as { status?: number })?.status;
                if (errStatus !== 503 && errStatus !== 429 && errStatus !== 504) {
                  logServerWarn('materials.extract.pdf_ocr', 'AI OCR fallback failed for scanned PDF', ocrErr);
                }
              }
            }
          }

          if (!extractedText) {
            if (ocrFallbackError) {
              const safeOcrErr = buildSafeApiError('materials.extract', ocrFallbackError, { skipLog: true });
              if (safeOcrErr.status === 503 || safeOcrErr.status === 429 || safeOcrErr.status === 504) {
                return res.status(safeOcrErr.status).json({
                  error: safeOcrErr.message,
                  referenceId: safeOcrErr.referenceId,
                });
              }
            }
            return res.status(422).json({
              error:
                'Could not extract text from this PDF. The file may contain no selectable text or is unreadable. Please upload a clear text-selectable PDF or images of the pages.',
            });
          }
        } else if (materialType === 'image') {
          const ai = getGeminiClient();
          const base64Image = file.buffer.toString('base64');
          const { result: ocrResponse } = await runWithGeminiModel(
            (model, signal) =>
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
                  ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                  abortSignal: signal,
                },
              }),
            { maxRetries: 2, timeoutMs: 55000 }
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
          if (file.buffer.byteLength > 20 * 1024 * 1024) {
            return res.status(422).json({
              error:
                'This audio recording exceeds the 20 MB inline AI transcription limit. Please trim or compress the recording under 20 MB.',
            });
          }
          const ai = getGeminiClient();
          const base64Audio = file.buffer.toString('base64');
          const { result: transcriptResponse } = await runWithGeminiModel(
            (model, signal) =>
              ai.models.generateContent({
                model,
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
                  ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                  abortSignal: signal,
                },
              }),
            { maxRetries: 2, timeoutMs: 85000 }
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
        return sendSafeApiError(res, 'materials.extract', err);
      }
    }
  );

  app.post('/api/summaries/generate', async (req: Request, res: Response) => {
    try {
      const { extractedText, title, materialType, summaryLevel } = (req.body || {}) as {
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
      const chunks = chunkText(extractedText.trim(), 18000, 350);

      let synthesisSource = extractedText.trim();

      if (chunks.length > 2) {
        const chunkNotes: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
          const chunkTextItem = chunks[i];
          const chunkPrompt = `Extract all essential academic concepts, facts, definitions, formulas/frameworks, and examples strictly from Section ${i + 1} of ${chunks.length} of "${title || 'Study Material'}". Preserve exact order and accuracy without inventing external claims.\n\n---\n${chunkTextItem}`;
          const { text: textPart } = await runMasterAiGeneration({
            systemInstruction:
              'You are a rigorous academic research assistant. Distill each document section faithfully from the provided text without inventing facts.',
            userPrompt: chunkPrompt,
            maxTokens: 1536,
            geminiFallback: async () => {
              const { result: partRes } = await runWithGeminiModel(
                (model, signal) =>
                  ai.models.generateContent({
                    model,
                    contents: chunkPrompt,
                    config: {
                      systemInstruction:
                        'You are a rigorous academic research assistant. Distill each document section faithfully from the provided text without inventing facts.',
                      ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                      abortSignal: signal,
                    },
                  }),
                { maxRetries: 1, timeoutMs: 50000 }
              );
              return partRes.text ?? '';
            },
          });
          const trimmedPart = textPart.trim();
          if (!trimmedPart) {
            throw new AiInvalidResponseError(
              `The AI returned an empty response while processing section ${i + 1}. Please try again.`
            );
          }
          chunkNotes.push(`[Section ${i + 1}]\n${trimmedPart}`);
        }
        synthesisSource = chunkNotes.join('\n\n');
      }

      const cappedSynthesisSource = synthesisSource.slice(0, 14000);

      const depthInstructions =
        level === 'short'
          ? 'Produce a SHORT SUMMARY: concise 1-paragraph topic overview, 3 to 5 main concept headings (each with 2-3 sourcePoints and a brief aiClarification), up to 5 important definitions, 5 to 8 key terms, 1 to 2 difficult concept explanations if needed, 3 to 5 important facts, 1 to 2 relevant examples, essential formulas if present, 4 concise revision notes, and 3 to 4 key takeaways.'
          : level === 'detailed'
            ? 'Produce a DETAILED SUMMARY: thorough 2-paragraph topic overview, 5 to 8 main concept headings in document order (with grounded sourcePoints and helpful aiClarification), all key definitions, 8 to 14 key terminology entries, 2 to 4 difficult concept explanations, 5 to 8 important facts, 2 to 4 relevant examples, all relevant formulas/frameworks, 5 to 8 revision notes, and 5 to 7 key takeaways.'
            : 'Produce COMPREHENSIVE STUDY NOTES: rich multi-paragraph topic overview, 7 to 12 deeply structured main concept headings preserving exact progression of the uploaded material (each with exhaustive sourcePoints and dedicated aiClarification), complete important definitions, 12 to 20 key terminology items, 3 to 6 detailed difficult concept explanations, 8 to 12 important facts, 3 to 6 concrete examples, all relevant formulas/frameworks, 8 to 12 exam-ready revision notes, and 6 to 10 key takeaways.';

      const summarySystemInstruction =
        `You are Brainstine, an academic study companion. Prioritize the uploaded material strictly. Never fabricate facts or claim unsupported information came from the source. Clearly separate facts directly extracted from the material (sourcePoints, origin: "source", importantFacts) from helpful AI explanations/elaborations (aiClarification, plainExplanation, origin: "ai_clarification" or "ai_elaboration"). If no formulas or frameworks appear in the material, return an empty array for formulasOrFrameworks. Also generate comparisonTables whenever contrasting 2+ concepts/methods/entities (or empty array if unnecessary), and 1 to 2 visualDiagrams (process_flow, concept_map, scientific_system, or cartesian_plot) when a visual schematic helps students understand relationships, sequences, or systems cleanly.

CRITICAL JSON FORMAT REQUIREMENT:
You must respond strictly with a valid JSON object matching this schema:
{
  "title": "string",
  "subjectArea": "string",
  "topicOverview": "string",
  "mainConcepts": [
    {
      "heading": "string",
      "sourcePoints": ["string"],
      "aiClarification": "string"
    }
  ],
  "importantDefinitions": [
    {
      "term": "string",
      "definition": "string",
      "origin": "source"
    }
  ],
  "keyTerminology": ["string"],
  "difficultConceptExplanations": [
    {
      "concept": "string",
      "sourceContext": "string",
      "plainExplanation": "string"
    }
  ],
  "importantFacts": ["string"],
  "relevantExamples": [
    {
      "title": "string",
      "example": "string",
      "origin": "source"
    }
  ],
  "formulasOrFrameworks": [
    {
      "name": "string",
      "expressionOrStructure": "string",
      "usage": "string"
    }
  ],
  "comparisonTables": [
    {
      "title": "string",
      "headers": ["string"],
      "rows": [
        {
          "criterion": "string",
          "values": ["string"]
        }
      ],
      "caption": "string"
    }
  ],
  "visualDiagrams": [],
  "revisionNotes": ["string"],
  "keyTakeaways": ["string"]
}`;
      const summaryUserPrompt = `Material Title: ${title || 'Academic Study Material'}\nSource Format: ${materialType || 'text'}\n\n${depthInstructions}\n\nUploaded Source Content:\n${cappedSynthesisSource}\n\nRespond with a valid JSON object matching the requested schema.`;

      const targetSummaryMaxTokens = level === 'short' ? 2048 : level === 'detailed' ? 3000 : 3600;

      const { text: summaryResponseText } = await runMasterAiGeneration({
        systemInstruction: summarySystemInstruction,
        userPrompt: summaryUserPrompt,
        jsonMode: true,
        maxTokens: targetSummaryMaxTokens,
        temperature: 0.3,
        geminiFallback: async () => {
          const { result: response } = await runWithGeminiModel(
            (model, signal) =>
              ai.models.generateContent({
                model,
                contents: summaryUserPrompt,
                config: {
                  systemInstruction: summarySystemInstruction,
                  ...getModelThinkingConfig(
                    level === 'comprehensive' ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL
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
                              description:
                                '"source" if defined in material, or "ai_clarification" if AI supplemented.',
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
                              description:
                                'Clear AI-authored breakdown explaining the difficult concept step by step.',
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
                              description:
                                '"source" if present in uploaded material, or "ai_elaboration" if generated to illustrate.',
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
                        description:
                          '1-2 clear educational schematics/diagrams clarifying stages, concept maps, or quantitative trends.',
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            type: {
                              type: Type.STRING,
                              description:
                                '"process_flow" | "concept_map" | "scientific_system" | "cartesian_plot"',
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
          return response.text ?? '';
        },
      });
      const response = { text: summaryResponseText };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = parseAiJsonResponse<Record<string, any>>(response.text, 'generating the study summary');
      if (!parsed.topicOverview && !Array.isArray(parsed.mainConcepts)) {
        throw new AiInvalidResponseError(
          'The AI returned an incomplete study summary. Please try again.'
        );
      }

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
          ? parsed.importantDefinitions.map(
              (d: { term: string; definition: string; origin?: string }) => ({
                term: d.term,
                definition: d.definition,
                origin: d.origin === 'ai_clarification' ? 'ai_clarification' : 'source',
              })
            )
          : [],
        keyTerminology: Array.isArray(parsed.keyTerminology) ? parsed.keyTerminology : [],
        difficultConceptExplanations: Array.isArray(parsed.difficultConceptExplanations)
          ? parsed.difficultConceptExplanations
          : [],
        importantFacts: Array.isArray(parsed.importantFacts) ? parsed.importantFacts : [],
        relevantExamples: Array.isArray(parsed.relevantExamples)
          ? parsed.relevantExamples.map(
              (e: { title: string; example: string; origin?: string }) => ({
                title: e.title,
                example: e.example,
                origin: e.origin === 'source' ? 'source' : 'ai_elaboration',
              })
            )
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
      return sendSafeApiError(res, 'summaries.generate', err);
    }
  });

  app.post('/api/summaries/followup', async (req: Request, res: Response) => {
    try {
      const { actionType, question, summary, sourceText } = (req.body || {}) as {
        actionType?: 'question' | 'simpler_explanation' | 'examples' | 'revision_notes';
        question?: string;
        summary?: StructuredSummary;
        sourceText?: string;
      };

      if (!summary) {
        return res
          .status(400)
          .json({ error: 'A generated summary is required for follow-up queries.' });
      }

      const mode = actionType || 'question';
      if (mode === 'question' && (!question || !question.trim())) {
        return res
          .status(400)
          .json({ error: 'Please enter a follow-up question about the summary.' });
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
        ? sourceText.slice(0, 8000)
        : (summary.markdown || '').slice(0, 6000);

      const followUpSystemInstruction =
        'You are Brainstine answering a scoped follow-up request on a specific study summary. You must respond with a valid JSON object strictly matching this schema: {"fromSource": "string", "aiExplanation": "string"}. Strictly separate what is explicitly stated in the uploaded source material ("fromSource") from any supplemental AI explanation, analogy, or examples ("aiExplanation"). Never claim AI-generated examples or clarifications came from the source text if they did not.';
      const followUpUserPrompt = `Study Summary Title: ${summary.title}\nSubject: ${summary.subjectArea}\n\nSummary Content:\n${summary.markdown || ''}\n\nUploaded Source Excerpt:\n${contextSnippet}\n\nStudent Request: ${promptTask}\n\nRespond with a valid JSON object matching the requested schema.`;

      const { text: followUpResponseText } = await runMasterAiGeneration({
        systemInstruction: followUpSystemInstruction,
        userPrompt: followUpUserPrompt,
        jsonMode: true,
        maxTokens: 1536,
        geminiFallback: async () => {
          const { result: response } = await runWithGeminiModel(
            (model, signal) =>
              ai.models.generateContent({
                model,
                contents: followUpUserPrompt,
                config: {
                  systemInstruction: followUpSystemInstruction,
                  ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
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
              }),
            { maxRetries: 2, timeoutMs: 45000 }
          );
          return response.text ?? '';
        },
      });

      const parsed = parseAiJsonResponse<{ fromSource?: string; aiExplanation?: string }>(
        followUpResponseText,
        'answering the summary follow-up'
      );
      if (!parsed.aiExplanation && !parsed.fromSource) {
        throw new AiInvalidResponseError(
          'The AI returned an incomplete follow-up answer. Please try again.'
        );
      }
      return res.json({
        fromSource: parsed.fromSource || 'Grounded in the uploaded summary.',
        aiExplanation: parsed.aiExplanation || '',
      });
    } catch (err: unknown) {
      return sendSafeApiError(res, 'summaries.followup', err);
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
      } = (req.body || {}) as {
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
        sourceMode === 'topic' ||
        sourceMode === 'upload'
          ? sourceMode
          : 'topic';

      if (mode === 'topic' && cleanTitle.length < 3) {
        return res.status(400).json({
          error: 'Please enter a subject or topic (at least 3 characters) to generate a quiz.',
        });
      }
      if (mode !== 'topic' && cleanSource.length < 30) {
        return res.status(400).json({
          error:
            'Please select a study material, uploaded file, saved summary, or paste at least 30 characters of text.',
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

      const allowedCounts = new Set([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70]);
      const totalCount =
        typeof questionCount === 'number' && allowedCounts.has(questionCount)
          ? questionCount
          : 10;

      const ai = getGeminiClient();

      const batchSizes: number[] = [];
      const maxBatchSize = validFormat === 'objective' ? 12 : 10;
      let remainingCount = totalCount;
      while (remainingCount > 0) {
        const nextSize = Math.min(maxBatchSize, remainingCount);
        batchSizes.push(nextSize);
        remainingCount -= nextSize;
      }

      let detectedTitle = cleanTitle || 'Academic Assessment';
      let detectedSubject = 'General Studies';

      const sourceContext =
        mode === 'topic'
          ? `Academic Topic / Subject: ${cleanTitle}`
          : `Title: ${cleanTitle || 'Study Material'}\nSource Content:\n${cleanSource.slice(0, 14000)}`;

      const normalizeCorrectIndex = (rawIdx: unknown, opts: string[], expectedAnswer: unknown): number => {
        if (typeof rawIdx === 'number' && Number.isFinite(rawIdx)) {
          const rounded = Math.trunc(rawIdx);
          if (rounded >= 0 && rounded <= 3) return rounded;
        }
        if (typeof rawIdx === 'string') {
          const clean = rawIdx.trim().toUpperCase();
          if (clean === 'A') return 0;
          if (clean === 'B') return 1;
          if (clean === 'C') return 2;
          if (clean === 'D') return 3;
          const num = Number(clean);
          if (Number.isFinite(num) && num >= 0 && num <= 3) return Math.trunc(num);
        }
        if (typeof expectedAnswer === 'string' && expectedAnswer.trim()) {
          const needle = expectedAnswer.trim().toLowerCase();
          const matchIdx = opts.findIndex((o) => o.trim().toLowerCase() === needle);
          if (matchIdx >= 0) return matchIdx;
        }
        return 0;
      };

      const quizResponseSchema = {
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
                  description:
                    'Exactly 4 options for objective questions, empty array for theory.',
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
                  description:
                    'Optional diagram ONLY if visual context enhances this question without revealing the answer.',
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
      };

      const difficultyGuide =
        validDifficulty === 'easy'
          ? 'EASY difficulty: test foundational recall, core definitions, and direct comprehension.'
          : validDifficulty === 'intermediate'
            ? 'INTERMEDIATE difficulty: test conceptual understanding, relationships, and applied reasoning.'
            : validDifficulty === 'advanced'
              ? 'ADVANCED difficulty: test rigorous analytical synthesis, edge cases, multi-step problem solving, and deep academic mastery.'
              : 'MIXED difficulty: distribute questions progressively across Easy (foundational recall), Intermediate (conceptual application), and Advanced (deep analytical synthesis).';

      const buildFormatGuide = (count: number) => {
        const objTarget =
          validFormat === 'objective'
            ? count
            : validFormat === 'theory'
              ? 0
              : Math.round(count * 0.7);
        const theoryTarget = count - objTarget;

        return validFormat === 'objective'
          ? `Generate exactly ${count} OBJECTIVE (multiple-choice) questions. Every question MUST have type="objective", exactly 4 distinct options (A, B, C, D) in the options array, a valid correctOptionIndex (0, 1, 2, or 3), expectedAnswer matching the correct option text, maxMarks=1, and a clear educational explanation.`
          : validFormat === 'theory'
            ? `Generate exactly ${count} THEORY (short-answer / essay) questions testing explanation and application. Every question MUST have type="theory", empty options array [], expectedAnswer with a complete model answer, 2 to 4 concrete markingCriteria points, maxMarks=5, and an explanation.`
            : `Generate exactly ${count} MIXED questions: ${objTarget} OBJECTIVE questions (type="objective", 4 options, correctOptionIndex 0-3, maxMarks=1) followed by ${theoryTarget} THEORY questions (type="theory", empty options [], expectedAnswer, 2-4 markingCriteria points, maxMarks=5).`;
      };

      const batchFocusAngles = [
        'Focus on foundational principles, core definitions, primary mechanisms, and fundamental laws.',
        'Focus on quantitative applications, real-world scenarios, step-by-step problem solving, and cause-and-effect.',
        'Focus on structural comparisons, classification, interactions between sub-systems, and diagnostic reasoning.',
        'Focus on edge cases, common misconceptions, experimental evidence, and higher-order analytical synthesis.',
      ];

      const requestBatch = async (
        batchCount: number,
        batchScopeHint: string,
        avoidStems: string[]
      ) => {
        const avoidDuplicatesClause =
          avoidStems.length > 0
            ? `\nDo NOT repeat or closely paraphrase any of these already-generated questions:\n${avoidStems
                .map((s) => `- ${s}`)
                .join('\n')}`
            : '';

        const diagramGuidance =
          totalCount <= 20
            ? ' Optionally attach a visualAid diagram ONLY to 1 question per batch where a process diagram, quantitative plot, or labeled system genuinely helps test understanding.'
            : ' Do NOT include visualAid objects on bulk 25+ question exams so every question remains crisp and fast to generate.';

        const quizSystemInstruction = `You are Brainstine Assessment Engine, an academic professor creating rigorous, unambiguous university-grade examinations. Base questions strictly on the supplied study material (or established academic canon when generating from a topic). Every objective question must have exactly ONE defensible correct answer among four plausible options. Never fabricate false facts.${diagramGuidance}

CRITICAL JSON FORMAT REQUIREMENT:
You must respond with a valid JSON object strictly matching this schema:
{
  "title": "string",
  "subjectArea": "string",
  "questions": [
    {
      "id": "q1",
      "number": 1,
      "type": "objective",
      "question": "string",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctOptionIndex": 0,
      "expectedAnswer": "Option A",
      "explanation": "string",
      "maxMarks": 1,
      "markingCriteria": ["string"]
    }
  ]
}
For objective questions, type="objective", exactly 4 options, correctOptionIndex (0-3), expectedAnswer matches correct option, and maxMarks=1.
For theory questions, type="theory", options=[], maxMarks=5, and 2-4 concrete markingCriteria points.`;

        const quizUserPrompt = `${sourceContext}\n\nDifficulty: ${difficultyGuide}\nFormat Requirements: ${buildFormatGuide(batchCount)}${batchScopeHint}${avoidDuplicatesClause}\n\nRespond with a valid JSON object matching the requested schema.`;

        const { text: batchText } = await runMasterAiGeneration({
          systemInstruction: quizSystemInstruction,
          userPrompt: quizUserPrompt,
          jsonMode: true,
          maxTokens: 2500,
          geminiFallback: async () => {
            const { result: response } = await runWithGeminiModel(
              (model, signal) =>
                ai.models.generateContent({
                  model,
                  contents: quizUserPrompt,
                  config: {
                    systemInstruction: `You are Brainstine Assessment Engine, an academic professor creating rigorous, unambiguous university-grade examinations. Base questions strictly on the supplied study material (or established academic canon when generating from a topic). Every objective question must have exactly ONE defensible correct answer among four plausible options. Never fabricate false facts.${diagramGuidance}`,
                    ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                    abortSignal: signal,
                    responseMimeType: 'application/json',
                    responseSchema: quizResponseSchema,
                  },
                }),
              { maxRetries: 2, timeoutMs: 40000 }
            );
            return response.text ?? '';
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return parseAiJsonResponse<Record<string, any>>(
          batchText,
          'generating quiz questions'
        );
      };

      const batchResults = await mapWithConcurrency(batchSizes, 1, async (batchCount, b) => {
        if (b > 0) {
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
        const scopeHint =
          batchSizes.length > 1
            ? `\nBatch ${b + 1} of ${batchSizes.length}: ${batchFocusAngles[b % batchFocusAngles.length]} Do not overlap with other batches.`
            : '';
        return requestBatch(batchCount, scopeHint, []);
      });

      const allQuestions: QuizQuestion[] = [];
      const seenQuestionStems = new Set<string>();
      const validVisualTypes = new Set([
        'process_flow',
        'concept_map',
        'cartesian_plot',
        'scientific_system',
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const appendParsedQuestions = (parsed: Record<string, any>, isPrimary: boolean) => {
        if (isPrimary) {
          detectedTitle = cleanTitle || parsed.title || 'Academic Assessment';
          detectedSubject = parsed.subjectArea || 'General Studies';
        }
        const rawQs = Array.isArray(parsed.questions) ? parsed.questions : [];
        for (const q of rawQs) {
          if (allQuestions.length >= totalCount) break;
          if (!q || typeof q.question !== 'string' || !q.question.trim()) continue;

          const stemKey = q.question.trim().toLowerCase().replace(/\s+/g, ' ');
          if (seenQuestionStems.has(stemKey)) continue;
          seenQuestionStems.add(stemKey);

          const rawType = String(q.type || '').trim().toLowerCase();
          const qType: 'objective' | 'theory' =
            validFormat === 'objective'
              ? 'objective'
              : validFormat === 'theory'
                ? 'theory'
                : rawType === 'theory'
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
            qType === 'objective' && opts
              ? normalizeCorrectIndex(q.correctOptionIndex, opts, q.expectedAnswer)
              : undefined;

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
      };

      batchResults.forEach((parsed, idx) => appendParsedQuestions(parsed, idx === 0));

      if (allQuestions.length > 0 && allQuestions.length < totalCount) {
        const missingCount = totalCount - allQuestions.length;
        try {
          const topUpParsed = await requestBatch(
            missingCount,
            `\nTop-up batch: Generate ${missingCount} completely new, non-overlapping questions.`,
            allQuestions.map((q) => q.question)
          );
          appendParsedQuestions(topUpParsed, false);
        } catch (topUpErr) {
          logServerWarn('quizzes.generate.topup', 'Quiz top-up batch warning', topUpErr);
        }
      }

      if (allQuestions.length === 0) {
        throw new AiInvalidResponseError(
          'The AI did not return any valid quiz questions for this topic or material. Please try again.'
        );
      }

      if (allQuestions.length < totalCount) {
        throw new AiInvalidResponseError(
          `The AI generated ${allQuestions.length} out of requested ${totalCount} questions. Please try again or choose a smaller count.`
        );
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
      return sendSafeApiError(res, 'quizzes.generate', err);
    }
  });

  app.post('/api/quizzes/grade', async (req: Request, res: Response) => {
    try {
      const { quizTitle, questions, answers, timeTakenSeconds } = (req.body || {}) as {
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
        const theoryBatches: typeof theoryQueue[] = [];
        for (let i = 0; i < theoryQueue.length; i += 8) {
          theoryBatches.push(theoryQueue.slice(i, i + 8));
        }

        const evalMap = new Map<
          string,
          { marksAwarded: number; feedback: string; missingPoints: string[] }
        >();

        await mapWithConcurrency(theoryBatches, 1, async (batch) => {
          const batchPayload = batch.map((item) => ({
            questionId: item.q.id,
            question: item.q.question,
            maxMarks: item.q.maxMarks || 5,
            expectedAnswer: item.q.expectedAnswer,
            markingCriteria: item.q.markingCriteria || [],
            studentResponse: item.responseText,
          }));

          const gradeSystemInstruction =
            'You are an objective academic examiner evaluating student theory answers. Award marks from 0 up to maxMarks based strictly on how accurately and completely the student addressed the marking criteria. Provide concise, constructive feedback and list any important missing points.\n\nCRITICAL JSON FORMAT REQUIREMENT:\nYou must respond strictly with a valid JSON object matching this schema: {"evaluations": [{"questionId": "string", "marksAwarded": number, "feedback": "string", "missingPoints": ["string"]}]}';
          const gradeUserPrompt = `Examination Title: ${quizTitle || 'Academic Assessment'}\n\nEvaluate each student theory response fairly and strictly against the expectedAnswer and markingCriteria:\n${JSON.stringify(batchPayload, null, 2)}\n\nRespond with a valid JSON object containing the "evaluations" array.`;

          const { text: gradeResponseText } = await runMasterAiGeneration({
            systemInstruction: gradeSystemInstruction,
            userPrompt: gradeUserPrompt,
            jsonMode: true,
            maxTokens: 2048,
            geminiFallback: async () => {
              const { result: evalRes } = await runWithGeminiModel(
                (model, signal) =>
                  ai.models.generateContent({
                    model,
                    contents: gradeUserPrompt,
                    config: {
                      systemInstruction:
                        'You are an objective academic examiner evaluating student theory answers. Award marks from 0 up to maxMarks based strictly on how accurately and completely the student addressed the marking criteria. Provide concise, constructive feedback and list any important missing points.',
                      ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
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
                  }),
                { maxRetries: 1, timeoutMs: 60000 }
              );
              return evalRes.text ?? '';
            },
          });

          const parsedEval = parseAiJsonResponse<{
            evaluations?: Array<{
              questionId?: string;
              marksAwarded?: number;
              feedback?: string;
              missingPoints?: unknown[];
            }>;
          }>(gradeResponseText, 'grading theory answers');

          for (const ev of parsedEval.evaluations || []) {
            evalMap.set(String(ev.questionId), {
              marksAwarded: Number(ev.marksAwarded) || 0,
              feedback: String(ev.feedback || ''),
              missingPoints: Array.isArray(ev.missingPoints)
                ? ev.missingPoints.map((m: unknown) => String(m))
                : [],
            });
          }
        });

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
      const earnedMarks =
        Math.round(gradedResults.reduce((acc, r) => acc + r.marksAwarded, 0) * 10) / 10;
      const maxMarks = gradedResults.reduce((acc, r) => acc + r.maxMarks, 0);
      const percentage = maxMarks > 0 ? Math.round((earnedMarks / maxMarks) * 1000) / 10 : 0;

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
      return sendSafeApiError(res, 'quizzes.grade', err);
    }
  });

  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    try {
      const { parts, systemInstruction, needsTitle } = buildAiChatParts(req.body || {});
      const ai = getGeminiClient();
      const hasImage = parts.some((p) => 'inlineData' in p);
      const textPrompt = parts
        .map((p) => ('text' in p ? p.text : ''))
        .filter(Boolean)
        .join('\n\n');

      if (needsTitle) {
        const chatSystemInstruction = `${systemInstruction}\n\nCRITICAL JSON FORMAT REQUIREMENT:\nYou must respond strictly with a valid JSON object matching this schema: {"suggestedTitle": "3 to 6 word academic title", "subjectArea": "Academic discipline", "reply": "Full Markdown-formatted academic answer"}`;
        const chatUserPrompt = `${textPrompt}\n\nRespond with a valid JSON object containing "suggestedTitle", "subjectArea", and "reply".`;

        let chatJsonText = '';
        if (!hasImage) {
          const resAI = await runMasterAiGeneration({
            systemInstruction: chatSystemInstruction,
            userPrompt: chatUserPrompt,
            jsonMode: true,
            maxTokens: 2500,
            geminiFallback: async () => {
              const { result: response } = await runWithGeminiModel(
                (model, signal) =>
                  ai.models.generateContent({
                    model,
                    contents: { parts },
                    config: {
                      systemInstruction,
                      ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
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
                            description:
                              'Academic discipline (e.g., Organic Chemistry, Calculus, Anatomy).',
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
                { maxRetries: 2, timeoutMs: 55000 }
              );
              return response.text ?? '';
            },
          });
          chatJsonText = resAI.text;
        } else {
          const { result: response } = await runWithGeminiModel(
            (model, signal) =>
              ai.models.generateContent({
                model,
                contents: { parts },
                config: {
                  systemInstruction,
                  ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
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
                        description:
                          'Academic discipline (e.g., Organic Chemistry, Calculus, Anatomy).',
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
            { maxRetries: 2, timeoutMs: 55000 }
          );
          chatJsonText = response.text ?? '';
        }

        const parsed = parseAiJsonResponse<{
          reply?: string;
          suggestedTitle?: string;
          subjectArea?: string;
        }>(chatJsonText, 'generating the chat reply');
        const reply = String(parsed.reply || '').trim();
        if (!reply) {
          throw new AiInvalidResponseError(
            'The AI returned an empty chat reply. Your message has been preserved—please try again.'
          );
        }
        return res.json({
          reply,
          suggestedTitle: String(parsed.suggestedTitle || 'Academic Study Chat').trim(),
          subjectArea: String(parsed.subjectArea || 'General Studies').trim(),
        });
      }

      let reply = '';
      if (!hasImage) {
        const resAI = await runMasterAiGeneration({
          systemInstruction,
          userPrompt: textPrompt,
          maxTokens: 2500,
          geminiFallback: async () => {
            const { result: response } = await runWithGeminiModel(
              (model, signal) =>
                ai.models.generateContent({
                  model,
                  contents: { parts },
                  config: {
                    systemInstruction,
                    ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                    abortSignal: signal,
                  },
                }),
              { maxRetries: 2, timeoutMs: 55000 }
            );
            return response.text ?? '';
          },
        });
        reply = resAI.text.trim();
      } else {
        const { result: response } = await runWithGeminiModel(
          (model, signal) =>
            ai.models.generateContent({
              model,
              contents: { parts },
              config: {
                systemInstruction,
                ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                abortSignal: signal,
              },
            }),
          { maxRetries: 2, timeoutMs: 55000 }
        );
        reply = (response.text ?? '').trim();
      }

      if (!reply) {
        throw new AiInvalidResponseError(
          'The AI returned an empty response. Your message has been preserved—please try again.'
        );
      }

      return res.json({ reply });
    } catch (err: unknown) {
      return sendSafeApiError(res, 'ai.chat', err);
    }
  });

  app.post('/api/ai/chat/stream', async (req: Request, res: Response) => {
    let clientClosed = false;
    let stallTimedOut = false;
    const clientDisconnectController = new AbortController();
    const streamReadController = new AbortController();
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const resetStallTimer = (ms: number) => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stallTimedOut = true;
        streamReadController.abort(new Error('Upstream AI stream stalled'));
      }, ms);
    };

    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
        clientDisconnectController.abort(new Error('Client disconnected'));
        streamReadController.abort(new Error('Client disconnected'));
      }
    });

    try {
      const { parts, systemInstruction, needsTitle } = buildAiChatParts(req.body || {});
      const ai = getGeminiClient();
      const hasImage = parts.some((p) => 'inlineData' in p);
      const textPrompt = parts
        .map((p) => ('text' in p ? p.text : ''))
        .filter(Boolean)
        .join('\n\n');

      const streamInstruction = needsTitle
        ? `${systemInstruction}\n\nOUTPUT FORMAT REQUIREMENT:\nWrite your full Markdown answer directly first. Then on a brand-new final line at the very end, append exactly one metadata marker in this exact format (single-line valid JSON, no code fences):\n[[CHAT_META:{"suggestedTitle":"3 to 6 word title","subjectArea":"Academic Discipline"}]]`
        : systemInstruction;

      initSseResponse(res);
      heartbeat = setInterval(() => {
        if (!clientClosed && !res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, 4000);

      const model = getGeminiModel();
      const META_PREFIX = '[[CHAT_META:';
      let fullText = '';
      let emittedLength = 0;

      const attemptController = new AbortController();
      const abortOnDisconnect = () => attemptController.abort(clientDisconnectController.signal.reason);
      clientDisconnectController.signal.addEventListener('abort', abortOnDisconnect, { once: true });

      const onStallAbort = () => attemptController.abort(streamReadController.signal.reason);
      streamReadController.signal.addEventListener('abort', onStallAbort, { once: true });

      const onChunkCallback = (delta: string) => {
        if (clientClosed) return;
        resetStallTimer(45000);
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
      };

      try {
        if (!hasImage && isGroqConfigured()) {
          resetStallTimer(60000);
          await runMasterAiStream({
            systemInstruction: streamInstruction,
            userPrompt: textPrompt,
            maxTokens: 2500,
            onChunk: onChunkCallback,
            geminiFallback: async () => {
              const { iterator, firstResult } = await openStreamAndPullFirstChunk(
                (signal) =>
                  ai.models.generateContentStream({
                    model,
                    contents: { parts },
                    config: {
                      systemInstruction: streamInstruction,
                      ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                      abortSignal: signal,
                    },
                  }),
                {
                  timeoutMs: 45000,
                  externalSignal: attemptController.signal,
                }
              );

              let step = firstResult;
              while (!step.done) {
                if (clientClosed) break;
                onChunkCallback(step.value.text ?? '');
                step = await iterator.next();
              }
            },
          });
        } else {
          resetStallTimer(60000);
          const { iterator, firstResult } = await openStreamAndPullFirstChunk(
            (signal) =>
              ai.models.generateContentStream({
                model,
                contents: { parts },
                config: {
                  systemInstruction: streamInstruction,
                  ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                  abortSignal: signal,
                },
              }),
            {
              timeoutMs: 45000,
              externalSignal: attemptController.signal,
            }
          );

          let step = firstResult;
          while (!step.done) {
            if (clientClosed) break;
            onChunkCallback(step.value.text ?? '');
            step = await iterator.next();
          }
        }
      } finally {
        clientDisconnectController.signal.removeEventListener('abort', abortOnDisconnect);
        streamReadController.signal.removeEventListener('abort', onStallAbort);
      }

      if (!clientClosed) {
        if (needsTitle) {
          const { cleanText, meta } = stripTrailingMetaMarker<{
            suggestedTitle: string;
            subjectArea: string;
          }>(fullText, META_PREFIX);
          if (!cleanText) {
            throw new AiInvalidResponseError(
              'The AI returned an empty response. Your message has been preserved—please try again.'
            );
          }
          if (cleanText.length > emittedLength) {
            writeSseEvent(res, 'chunk', { delta: cleanText.slice(emittedLength) });
          }
          writeSseEvent(res, 'done', {
            reply: cleanText,
            suggestedTitle: String(meta.suggestedTitle || 'Academic Study Chat').trim(),
            subjectArea: String(meta.subjectArea || 'General Studies').trim(),
          });
        } else {
          const clean = fullText.trim();
          if (!clean) {
            throw new AiInvalidResponseError(
              'The AI returned an empty response. Your message has been preserved—please try again.'
            );
          }
          writeSseEvent(res, 'done', {
            reply: clean,
          });
        }
        res.end();
      }
    } catch (err: unknown) {
      const safe = buildSafeApiError('ai.chat.stream', err, { stallTimedOut });

      if (!res.headersSent) {
        return res.status(safe.status).json({ error: safe.message, referenceId: safe.referenceId });
      }
      if (!clientClosed) {
        writeSseEvent(res, 'error', {
          status: safe.status,
          error: safe.message,
          referenceId: safe.referenceId,
        });
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
      const hasImage = parts.some((p) => 'inlineData' in p);
      const textPrompt = parts
        .map((p) => ('text' in p ? p.text : ''))
        .filter(Boolean)
        .join('\n\n');

      const tutorSystemInstruction = `${systemInstruction}\n\nCRITICAL JSON FORMAT REQUIREMENT:\nYou must respond strictly with a valid JSON object matching this schema: {"reply": "Markdown tutoring lesson", "topicTitle": "3 to 6 word topic title", "subjectArea": "Academic subject", "currentStageLabel": "Stage label", "advanceStep": true}`;
      const tutorUserPrompt = `${textPrompt}\n\nRespond with a valid JSON object containing "reply", "topicTitle", "subjectArea", "currentStageLabel", and "advanceStep".`;

      let tutorJsonText = '';
      if (!hasImage) {
        const resAI = await runMasterAiGeneration({
          systemInstruction: tutorSystemInstruction,
          userPrompt: tutorUserPrompt,
          jsonMode: true,
          maxTokens: 2500,
          geminiFallback: async () => {
            const { result: response } = await runWithGeminiModel(
              (model, signal) =>
                ai.models.generateContent({
                  model,
                  contents: { parts },
                  config: {
                    systemInstruction,
                    ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
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
                          description:
                            'Short label of the current learning stage (e.g., "Foundations & Core Principle", "Worked Example", "Applied Practice").',
                        },
                        advanceStep: {
                          type: Type.BOOLEAN,
                          description:
                            'True if the session progressed to a new conceptual step, false if clarifying/repeating current step.',
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
              { maxRetries: 2, timeoutMs: 55000 }
            );
            return response.text ?? '';
          },
        });
        tutorJsonText = resAI.text;
      } else {
        const { result: response } = await runWithGeminiModel(
          (model, signal) =>
            ai.models.generateContent({
              model,
              contents: { parts },
              config: {
                systemInstruction,
                ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
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
                      description:
                        'Short label of the current learning stage (e.g., "Foundations & Core Principle", "Worked Example", "Applied Practice").',
                    },
                    advanceStep: {
                      type: Type.BOOLEAN,
                      description:
                        'True if the session progressed to a new conceptual step, false if clarifying/repeating current step.',
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
          { maxRetries: 2, timeoutMs: 55000 }
        );
        tutorJsonText = response.text ?? '';
      }

      const parsed = parseAiJsonResponse<{
        reply?: string;
        topicTitle?: string;
        subjectArea?: string;
        currentStageLabel?: string;
        advanceStep?: boolean;
      }>(tutorJsonText, 'generating the tutoring lesson');
      const reply = String(parsed.reply || '').trim();
      if (!reply) {
        throw new AiInvalidResponseError(
          'Personal AI Tutor returned an empty response. Your topic has been preserved—please try again.'
        );
      }

      return res.json({
        reply,
        topicTitle: String(parsed.topicTitle || currentTopic || 'Tutoring Session').trim(),
        subjectArea: String(parsed.subjectArea || 'General Studies').trim(),
        currentStageLabel: String(
          parsed.currentStageLabel || 'Guided Concept Exploration'
        ).trim(),
        advanceStep: Boolean(parsed.advanceStep),
      });
    } catch (err: unknown) {
      return sendSafeApiError(res, 'ai.tutor', err);
    }
  });

  app.post('/api/ai/tutor/stream', async (req: Request, res: Response) => {
    let clientClosed = false;
    let stallTimedOut = false;
    const clientDisconnectController = new AbortController();
    const streamReadController = new AbortController();
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const resetStallTimer = (ms: number) => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stallTimedOut = true;
        streamReadController.abort(new Error('Upstream AI stream stalled'));
      }, ms);
    };

    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
        clientDisconnectController.abort(new Error('Client disconnected'));
        streamReadController.abort(new Error('Client disconnected'));
      }
    });

    try {
      const { parts, systemInstruction, currentTopic } = buildAiTutorParts(req.body || {});
      const ai = getGeminiClient();
      const hasImage = parts.some((p) => 'inlineData' in p);
      const textPrompt = parts
        .map((p) => ('text' in p ? p.text : ''))
        .filter(Boolean)
        .join('\n\n');

      const streamInstruction = `${systemInstruction}\n\nOUTPUT FORMAT REQUIREMENT:\nWrite your full Markdown tutoring response directly first. Then on a brand-new final line at the very end, append exactly one metadata marker in this exact format (single-line valid JSON, no code fences):\n[[TUTOR_META:{"topicTitle":"3 to 6 word topic title","subjectArea":"Academic Discipline","currentStageLabel":"Current Stage Label","advanceStep":true}]]`;

      initSseResponse(res);
      heartbeat = setInterval(() => {
        if (!clientClosed && !res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, 4000);

      const model = getGeminiModel();
      const META_PREFIX = '[[TUTOR_META:';
      let fullText = '';
      let emittedLength = 0;

      const attemptController = new AbortController();
      const abortOnDisconnect = () => attemptController.abort(clientDisconnectController.signal.reason);
      clientDisconnectController.signal.addEventListener('abort', abortOnDisconnect, { once: true });

      const onStallAbort = () => attemptController.abort(streamReadController.signal.reason);
      streamReadController.signal.addEventListener('abort', onStallAbort, { once: true });

      const onChunkCallback = (delta: string) => {
        if (clientClosed) return;
        resetStallTimer(45000);
        fullText += delta;
        const safeLimit = getSafeStreamEnd(fullText, META_PREFIX);
        if (safeLimit > emittedLength) {
          writeSseEvent(res, 'chunk', { delta: fullText.slice(emittedLength, safeLimit) });
          emittedLength = safeLimit;
        }
      };

      try {
        if (!hasImage && isGroqConfigured()) {
          resetStallTimer(60000);
          await runMasterAiStream({
            systemInstruction: streamInstruction,
            userPrompt: textPrompt,
            maxTokens: 2500,
            onChunk: onChunkCallback,
            geminiFallback: async () => {
              const { iterator, firstResult } = await openStreamAndPullFirstChunk(
                (signal) =>
                  ai.models.generateContentStream({
                    model,
                    contents: { parts },
                    config: {
                      systemInstruction: streamInstruction,
                      ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                      abortSignal: signal,
                    },
                  }),
                {
                  timeoutMs: 45000,
                  externalSignal: attemptController.signal,
                }
              );

              let step = firstResult;
              while (!step.done) {
                if (clientClosed) break;
                onChunkCallback(step.value.text ?? '');
                step = await iterator.next();
              }
            },
          });
        } else {
          resetStallTimer(60000);
          const { iterator, firstResult } = await openStreamAndPullFirstChunk(
            (signal) =>
              ai.models.generateContentStream({
                model,
                contents: { parts },
                config: {
                  systemInstruction: streamInstruction,
                  ...getModelThinkingConfig(ThinkingLevel.MINIMAL),
                  abortSignal: signal,
                },
              }),
            {
              timeoutMs: 45000,
              externalSignal: attemptController.signal,
            }
          );

          let step = firstResult;
          while (!step.done) {
            if (clientClosed) break;
            onChunkCallback(step.value.text ?? '');
            step = await iterator.next();
          }
        }
      } finally {
        clientDisconnectController.signal.removeEventListener('abort', abortOnDisconnect);
        streamReadController.signal.removeEventListener('abort', onStallAbort);
      }

      if (!clientClosed) {
        const { cleanText, meta } = stripTrailingMetaMarker<{
          topicTitle: string;
          subjectArea: string;
          currentStageLabel: string;
          advanceStep: boolean;
        }>(fullText, META_PREFIX);

        if (!cleanText) {
          throw new AiInvalidResponseError(
            'Personal AI Tutor returned an empty response. Your message has been preserved—please try again.'
          );
        }

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
      const safe = buildSafeApiError('ai.tutor.stream', err, { stallTimedOut });

      if (!res.headersSent) {
        return res.status(safe.status).json({ error: safe.message, referenceId: safe.referenceId });
      }
      if (!clientClosed) {
        writeSseEvent(res, 'error', {
          status: safe.status,
          error: safe.message,
          referenceId: safe.referenceId,
        });
        res.end();
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (stallTimer) clearTimeout(stallTimer);
    }
  });

  // Never let unknown /api/* requests fall through to HTML 404 or index.html
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      error: 'The requested resource could not be found.',
    });
  });

  // Global Express JSON error middleware so body-parser/multer/unexpected errors never emit HTML 500 on /api/*
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const statusCandidate =
      (err as { status?: number })?.status ||
      (err as { statusCode?: number })?.statusCode ||
      undefined;
    if (err instanceof SyntaxError && statusCandidate === 400) {
      return sendSafeApiError(res, 'api.unhandled', new Error('Invalid request data.'), {
        explicitStatus: 400,
        meta: { method: req.method, path: req.path, reason: 'json_syntax' },
      });
    }
    return sendSafeApiError(res, 'api.unhandled', err, {
      explicitStatus: statusCandidate,
      meta: { method: req.method, path: req.path },
    });
  });

  return app;
}
