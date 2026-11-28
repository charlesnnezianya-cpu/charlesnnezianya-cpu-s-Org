import crypto from 'crypto';
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
  StudentAnswer,
  StructuredSummary,
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
import {
  analyzeDocumentIntelligence,
  buildExtractedDocumentSections,
  fetchAuthorizedUserMaterials,
  getOrBuildDocumentChunks,
  retrieveRelevantPassages,
  setBoundedCacheEntry,
} from './documentEngine.ts';
import {
  buildAssessmentBlueprint,
  generateGroundedQuizQuestions,
  getAcademicTopicPrimer,
} from './quizEngine.ts';
import { generateExtractiveSummary } from './summaryEngine.ts';
import {
  buildChatRagContext,
  resolveAuthorizedUserFromBearer,
} from './chatRagService.ts';
import { buildTutorRagContext } from './tutorRagService.ts';
import {
  AssessmentHttpError,
  checkPracticeQuestionAnswer,
  createServerAssessmentSession,
  getAssessmentSealKey,
  getSupabaseAssessmentConfig,
  listActiveAssessmentSessions,
  restoreServerAssessmentSession,
  saveAssessmentProgress,
  sealAssessmentSessionToken,
  startServerAssessmentSession,
  submitAndGradeServerAssessment,
} from './assessmentService.ts';
import {
  fetchVerifiedSupabaseUserFromBearer,
  isResendConfigured,
  processAuthenticatedWelcomeEmail,
  type WelcomeAuthEvent,
} from './welcomeEmailService.ts';

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
const EXTRACTION_CACHE_TTL_MS = 15 * 60 * 1000;
const extractionCache = new Map<string, { result: ExtractionResult; expiresAt: number }>();

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
  const decodedBytes = Buffer.from(cleanBase64, 'base64');
  if (decodedBytes.byteLength < 16) {
    throw Object.assign(
      new Error('Attached image appears invalid or empty. Please attach a valid JPG, PNG, or WEBP image.'),
      { statusCode: 400 }
    );
  }
  if (decodedBytes.byteLength > 15 * 1024 * 1024) {
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

async function buildAiChatParts(
  body: {
    message?: string;
    history?: unknown;
    documentContext?: { id?: string | null; title: string; type?: string; content: string } | null;
    studyMaterials?: Array<{
      id: string;
      userId?: string;
      title: string;
      materialType?: string;
      extractedText: string;
    }> | null;
    attachedDocumentId?: string | null;
    userId?: string | null;
    image?: { data?: string; mimeType?: string } | null;
    imageAction?: ImageActionType;
    explanationStyle?: 'default' | 'shorter' | 'simpler' | 'detailed';
    needsTitle?: boolean;
  },
  authHeader?: string | string[]
) {
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

  const rag = await buildChatRagContext({
    message: cleanMessage || 'Please analyze the attached academic image.',
    history: recentHistory,
    documentContext: body.documentContext || null,
    studyMaterials: body.studyMaterials || null,
    attachedDocumentId: body.attachedDocumentId || null,
    userId: body.userId || null,
    authHeader,
    hasImage: Boolean(validatedImage),
    explanationStyle: body.explanationStyle || 'default',
  });

  const styleDirective =
    body.explanationStyle === 'shorter'
      ? 'Keep your response crisp and focused—deliver a direct answer followed by essential key points only.'
      : body.explanationStyle === 'simpler'
        ? 'Explain in plain, accessible language using an everyday analogy and clearly defining every technical term before using it.'
        : body.explanationStyle === 'detailed'
          ? 'Provide an in-depth university-level explanation covering underlying mechanisms, key characteristics, comparisons, and concrete examples.'
          : '';

  const adaptiveFormatGuide = (() => {
    if (body.explanationStyle === 'shorter') {
      return 'ADAPTIVE FORMAT (CONCISE): Start with a 1-2 sentence Direct Answer, then 3-5 tight bullet points and exact page reference(s) if document-backed.';
    }
    switch (rag.questionType) {
      case 'definition':
        return 'ADAPTIVE FORMAT (DEFINITION): Lead with a clear, precise definition (**Term** — clear definition), follow with a concise explanatory paragraph covering why/how it applies, include one concrete example or distinction if supported, and note page reference(s). Avoid bloated unnecessary sections.';
      case 'classification':
        return 'ADAPTIVE FORMAT (CLASSIFICATION / TYPES): Give a brief opening sentence identifying the category and total count if stated, then organize EACH named type or category into its own clearly labelled subsection (`### 1. Type Name`, `### 2. Type Name`, etc.) containing its explanation, key characteristics (bulleted when multiple), and examples—never omitting any type present in the retrieved material.';
      case 'comparison':
        return 'ADAPTIVE FORMAT (COMPARISON / DIFFERENCES): Open with the core distinction in 1-2 sentences, present a crisp Markdown comparison table (`| Dimension | Concept A | Concept B |`) capturing mechanisms, traits, and roles, and add a short **Key Takeaway** noting how they relate.';
      case 'process':
        return 'ADAPTIVE FORMAT (PROCESS / MECHANISM): State the goal/outcome in 1 sentence, then walk through the mechanism in clear numbered sequential steps (`1. **Stage/Step** — ...`), highlighting key inputs, conditions, or formulas before closing with page reference(s).';
      case 'overview':
        return 'ADAPTIVE FORMAT (DOCUMENT OVERVIEW / SUMMARY): Synthesize the central subject and main purpose first, organize core themes/sections under clear Markdown headings (`### ...`), highlight key definitions/classifications/formulas, and close with concise takeaways.';
      case 'clarification':
        return 'ADAPTIVE FORMAT (CLARIFICATION): Ask one concise, friendly clarifying question with 2-3 helpful direction options.';
      default:
        return 'ADAPTIVE FORMAT (EXPLANATION): Lead with a clear **Direct Answer**, follow with organized subsections or bullets for the **Explanation & Key Details**, include concrete **Examples** or formulas when supported, and cite grounded **Page References** cleanly. Keep simple questions brief and rich questions well-structured—never force unnecessary boilerplate.';
    }
  })();

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

  const systemInstruction = `You are Brainstine Document Assistant, an expert university academic tutor and analytical study guide across Science, Mathematics, Engineering, Medicine, Computer Science, Social Sciences, and Humanities.

Core Presentation & Intelligence Rules:
- Understand the student's underlying academic intent and connect concepts accurately across sections and pages when study material is provided.
- Adapt your response structure naturally to the question type (never use a robotic one-size-fits-all template):
  ${adaptiveFormatGuide}
- Formatting Quality: Use clean Markdown headings (\`###\`), clear paragraphs separated by whitespace, bullet lists formatted as \`- **Term** — explanation\` for key concepts/characteristics, ordered steps for processes, Markdown comparison tables (\`| ... | ... |\`) for differences, readable equations (\`$inline$\` or \`$$display$$\`), and callouts ONLY for genuinely high-value highlights (\`> **Example:**\`, \`> **Key Concept:**\`, or \`> **Source Note:**\`). Avoid wall-of-text paragraphs, repetitive filler phrases, or excessive italics.
- Visual Diagrams: When—and ONLY when—a visual diagram genuinely clarifies a cycle, hierarchy, labeled system, or quantitative curve, include ONE single-line diagram block on its own line:
  [[DIAGRAM:{"type":"process_flow","title":"...","subject":"...","caption":"...","nodes":[{"id":"n1","label":"...","sublabel":"...","detail":"..."}],"edges":[{"from":"n1","to":"n2","label":"..."}]}]]
  Supported types: "process_flow", "concept_map", "scientific_system", "cartesian_plot". Never invent raw ASCII art when a structured table or [[DIAGRAM:...]] is clearer.
- Continuity: Maintain seamless continuity with prior messages—resolve pronouns ("that", "it", "those") and ordinal references ("the second one", "the first type") directly from the preceding turn and retrieved sources.
- Images: When an image is provided (or active in this conversation), inspect visible text, equations, diagrams, charts, or handwritten notes faithfully. Clearly note if blur, resolution, or cropping prevents confident reading—NEVER fabricate illegible text or values.
- KNOWLEDGE GROUNDING: You support two distinct knowledge sources: (A) the student's uploaded study materials (via retrieved passages below) and (B) general academic knowledge. Always prioritize retrieved study material passages with exact Document Title and Page references when relevant passages are provided, clearly separate general academic knowledge when supplementing missing details, honestly state when uploaded materials lack or only partially cover a requested detail, and NEVER fabricate citations or page numbers.${rag.documentContextPromptBlock}`;

  return { parts, systemInstruction, needsTitle: Boolean(body.needsTitle), rag };
}

async function buildAiTutorParts(
  body: {
    message?: string;
    history?: unknown;
    tutorMode?: TutorMode;
    currentTopic?: string;
    currentStep?: number;
    quickAction?: string;
    documentContext?: { id?: string | null; title: string; type?: string; content: string } | null;
    studyMaterials?: Array<{
      id: string;
      userId?: string;
      title: string;
      materialType?: string;
      extractedText: string;
    }> | null;
    attachedDocumentId?: string | null;
    userId?: string | null;
    image?: { data?: string; mimeType?: string } | null;
    imageAction?: ImageActionType;
  },
  authHeader?: string | string[]
) {
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

  const rag = await buildTutorRagContext({
    message: cleanMessage || body.quickAction || 'Please teach me the material shown in the attached image step by step.',
    quickAction: body.quickAction,
    currentTopic: typeof body.currentTopic === 'string' ? body.currentTopic : undefined,
    currentStep: typeof body.currentStep === 'number' ? body.currentStep : 1,
    tutorMode: mode,
    history: recentHistory,
    documentContext: body.documentContext || null,
    studyMaterials: body.studyMaterials || null,
    attachedDocumentId: body.attachedDocumentId || null,
    userId: body.userId || null,
    authHeader,
    hasImage: Boolean(validatedImage),
  });

  const modeGuide =
    mode === 'beginner'
      ? 'BEGINNER MODE: Use plain everyday language, foundational concepts, relatable analogies, and small incremental steps. Define every technical term before using it.'
      : mode === 'standard'
        ? 'STANDARD MODE: Use clear university-level explanations, structured reasoning, concrete academic examples, and check conceptual understanding along the way.'
        : 'ADVANCED MODE: Use rigorous academic terminology, formal derivations/mechanisms, nuanced edge cases, and synthesis across concepts.';

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

  const lengthGuidance = rag.useStructuredLessonPlan
    ? 'Deliver a clear, scannable structured lesson (~350–650 words) using concise subheadings so every section is easy to absorb without feeling like a wall of text.'
    : 'Teach progressively one focused step at a time (~180–400 words per turn) rather than dumping an entire textbook chapter at once.';

  const systemInstruction = `You are Brainstine Personal AI Tutor — an intelligent, patient, interactive university academic teacher.
Core Pedagogical Rules:
- ${lengthGuidance}
- ${modeGuide}
- Break complex subjects into logical steps: define unfamiliar terminology clearly, explain processes in sequential order, compare related concepts cleanly with Markdown tables (| ... | ... |) when useful, format equations cleanly ($...$ or $$...$$), highlight essential ideas with > **Key Concept:**, visually separate worked examples or analogies with > **Example:**, and visually separate understanding checks with > **Knowledge Check:**.
- Adaptive Personalization: Adapt pace and depth strictly from what the student demonstrated in THIS session's messages (simplify and re-explain from another angle if confused, advance smoothly if they answer checks accurately, provide deeper rigor or extra examples when asked). Never claim to know the student's overall ability beyond the observed session.
- Mid-Lesson Questions & Continuation: Answer mid-lesson questions accurately and connect them smoothly back to where the student stopped so they can continue without losing progress.
- When a structured visual diagram genuinely clarifies a cycle, pathway, concept map, scientific system, or quantitative curve, include ONE single-line diagram block on its own line:
  [[DIAGRAM:{"type":"process_flow","title":"...","subject":"...","caption":"...","nodes":[{"id":"n1","label":"...","sublabel":"..."}],"edges":[{"from":"n1","to":"n2"}]}]]
- If an image is present, analyze legible text, equations, diagrams, or handwritten problems faithfully; clearly inform the student if any portion is blurry or illegible instead of guessing.

${rag.tutorPromptDirective}${rag.documentContextPromptBlock}`;

  return {
    parts,
    systemInstruction,
    mode,
    currentTopic: body.currentTopic,
    rag,
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
      if (parsed.searchParams.has('__apiPath')) {
        const apiPathRaw = parsed.searchParams.get('__apiPath') ?? '';
        parsed.searchParams.delete('__apiPath');
        const cleanPath = apiPathRaw.replace(/^\/+/, '');
        const nextPathname = cleanPath ? `/api/${cleanPath}` : '/api';
        const nextSearch = parsed.searchParams.toString();
        req.url = `${nextPathname}${nextSearch ? `?${nextSearch}` : ''}`;
      } else if (parsed.pathname === '/api/index' || parsed.pathname.startsWith('/api/index/')) {
        const rest = parsed.pathname.replace(/^\/api\/index\/?/, '');
        const nextPathname = rest ? `/api/${rest}` : '/api';
        const nextSearch = parsed.searchParams.toString();
        req.url = `${nextPathname}${nextSearch ? `?${nextSearch}` : ''}`;
      }
    } catch {
      // ignore malformed URLs
    }
    next();
  });

  const isOriginAllowed = (originHeader: string, req: Request): boolean => {
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(originHeader);
    } catch {
      return false;
    }
    if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
      return false;
    }

    const originNorm = parsedOrigin.origin.toLowerCase();
    const requestHost = (req.get('x-forwarded-host') || req.get('host') || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    if (requestHost && parsedOrigin.host.toLowerCase() === requestHost) {
      return true;
    }

    const configuredOrigins = new Set<string>();
    const envCandidates = [
      process.env.APP_URL,
      process.env.VITE_APP_URL,
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
      process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined,
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined,
    ];
    for (const candidate of envCandidates) {
      if (!candidate || !candidate.trim()) continue;
      try {
        configuredOrigins.add(new URL(candidate.trim()).origin.toLowerCase());
      } catch {
        // ignore invalid configured origin
      }
    }
    if (configuredOrigins.has(originNorm)) {
      return true;
    }

    if (process.env.NODE_ENV !== 'production') {
      const hostName = parsedOrigin.hostname.toLowerCase();
      if (hostName === 'localhost' || hostName === '127.0.0.1') {
        return true;
      }
    }

    return false;
  };

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const origin = req.headers.origin;
    if (origin) {
      if (isOriginAllowed(origin, req)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
      } else if (req.method === 'OPTIONS') {
        return res.status(403).end();
      }
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // Support pre-parsed bodies from serverless platforms (e.g. Vercel, AWS Lambda)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as Request & { _body?: boolean };
    if (r.body !== undefined && !r._body) {
      r._body = true;
      if (typeof r.body === 'string' && req.headers['content-type']?.includes('application/json')) {
        try {
          r.body = JSON.parse(r.body);
        } catch {
          // keep as string
        }
      } else if (Buffer.isBuffer(r.body) && req.headers['content-type']?.includes('application/json')) {
        try {
          r.body = JSON.parse(r.body.toString('utf8'));
        } catch {
          // keep as buffer
        }
      }
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
    ['/api/ai'],
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
    try {
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
      if (supabaseConfigured) {
        const probeUser = await resolveAuthorizedUserFromBearer(req.headers.authorization);
        if (!probeUser) {
          return res.status(401).json({
            error: 'Authentication is required to run diagnostic probes.',
          });
        }
      } else if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({
          error: 'Authentication is required to run diagnostic probes.',
        });
      }

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
      const probeResults: Array<{
        ok: boolean;
        latencyMs: number;
        status?: number;
        quotaHit?: boolean;
        error?: string;
        modelTested?: string;
      }> = [];

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
          const singleProbe = await probeSingleModelQuick(ai, activeModel, 15000);
          probeResults.push({
            ok: singleProbe.ok,
            latencyMs: singleProbe.latencyMs,
            status: singleProbe.status,
            quotaHit: singleProbe.quotaHit,
            ...(singleProbe.ok ? {} : { error: singleProbe.error || singleProbe.upstreamError }),
            modelTested: activeModel,
          });
        } catch (probeErr: unknown) {
          probeResults.push({
            ok: false,
            latencyMs: 0,
            error: probeErr instanceof Error ? probeErr.message : String(probeErr),
            modelTested: activeModel,
          });
        }
      }

      let supabaseHealthy: boolean | null = null;
      const supabaseSchema: {
        quizzesBase?: { ok: boolean; status: number };
        quizzesSealedColumn?: { ok: boolean; status: number };
        assessmentSessionsTable?: { ok: boolean; status: number };
        quizAttemptsTable?: { ok: boolean; status: number };
        studyMaterialsTable?: { ok: boolean; status: number };
        studySummariesTable?: { ok: boolean; status: number };
      } = {};
      if (supabaseConfigured) {
        const baseSbUrl = supabaseUrl.replace(/\/$/, '');
        try {
          const sbRes = await fetch(`${baseSbUrl}/auth/v1/health`, {
            headers: { apikey: supabaseAnonKey },
          });
          supabaseHealthy = sbRes.ok;
        } catch {
          supabaseHealthy = false;
        }

        const checkRestTable = async (tablePath: string): Promise<{ ok: boolean; status: number }> => {
          try {
            const tRes = await fetch(`${baseSbUrl}/rest/v1/${tablePath}`, {
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
              },
            });
            return { ok: tRes.status !== 404 && tRes.status !== 400, status: tRes.status };
          } catch {
            return { ok: false, status: 0 };
          }
        };

        const [quizzesBase, quizzesSealedColumn, assessmentSessionsTable, quizAttemptsTable, studyMaterialsTable, studySummariesTable] = await Promise.all([
          checkRestTable('quizzes?select=id&limit=1'),
          checkRestTable('quizzes?select=id,sealed_answer_key&limit=1'),
          checkRestTable('assessment_sessions?select=id&limit=1'),
          checkRestTable('quiz_attempts?select=id&limit=1'),
          checkRestTable('study_materials?select=id&limit=1'),
          checkRestTable('study_summaries?select=id&limit=1'),
        ]);
        supabaseSchema.quizzesBase = quizzesBase;
        supabaseSchema.quizzesSealedColumn = quizzesSealedColumn;
        supabaseSchema.assessmentSessionsTable = assessmentSessionsTable;
        supabaseSchema.quizAttemptsTable = quizAttemptsTable;
        supabaseSchema.studyMaterialsTable = studyMaterialsTable;
        supabaseSchema.studySummariesTable = studySummariesTable;
      }

      let assessmentSecretConfigured = false;
      try {
        getAssessmentSealKey();
        assessmentSecretConfigured = true;
      } catch {
        assessmentSecretConfigured = false;
      }

      return res.json({
        ok: true,
        aiConfigured,
        geminiConfigured,
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
        assessmentSecretConfigured,
        welcomeEmailConfigured: isResendConfigured(),
        supabaseConfigured,
        supabaseHealthy,
        supabaseSchema,
        listedCount,
        probeResults,
      });
    }

      res.json({
        ok: true,
        aiConfigured,
        geminiConfigured,
        groqConfigured,
        groqKeys: {
          key1: Boolean(groqKeyConfig.key1),
          key2: Boolean(groqKeyConfig.key2),
          key3: Boolean(groqKeyConfig.key3),
        },
        welcomeEmailConfigured: isResendConfigured(),
        supabaseConfigured,
        configuredModel: configuredEnvModel ? 'locked' : 'default',
        activeModel: groqConfigured ? GROQ_MODEL : (resolvedState ? 'ready' : activeModel ? 'ready' : 'unavailable'),
      });
    } catch (err: unknown) {
      return sendSafeApiError(res, 'api.health', err);
    }
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
      const rawRedirectTo =
        typeof req.query.redirectTo === 'string' ? req.query.redirectTo.trim() : '';
      const originParam =
        rawRedirectTo && isOriginAllowed(rawRedirectTo, req)
          ? rawRedirectTo
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
          const supabaseHost = new URL(supabaseUrl).host;
          const isSafeOAuthHost =
            parsedLoc.protocol === 'https:' &&
            (parsedLoc.hostname === 'accounts.google.com' || parsedLoc.host === supabaseHost);

          const clientIdParam = parsedLoc.searchParams.get('client_id') || '';
          hasClientId = Boolean(clientIdParam.trim());
          const cbUri = parsedLoc.searchParams.get('redirect_uri') || '';
          callbackMatchesSupabase = cbUri === `${supabaseUrl}/auth/v1/callback`;

          if (isSafeOAuthHost) {
            const gRes = await fetch(parsedLoc.toString(), { redirect: 'manual' });
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
                const isSafeGoogleErrorHost =
                  gLocUrl.protocol === 'https:' && gLocUrl.hostname === 'accounts.google.com';
                if (isSafeGoogleErrorHost && gLocUrl.pathname.includes('/signin/oauth/error')) {
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

  const ALLOWED_WELCOME_EVENTS = new Set<WelcomeAuthEvent>([
    'signup',
    'oauth_callback',
    'email_verified',
    'phone_verified',
    'email_linked_after_phone_signup',
    'session_check',
  ]);

  app.post('/api/auth/welcome-email', async (req: Request, res: Response) => {
    try {
      const verified = await fetchVerifiedSupabaseUserFromBearer(req.headers.authorization);
      if (!verified) {
        return res.status(401).json({
          error: 'Authentication is required before triggering welcome email delivery.',
        });
      }

      const rawEvent =
        typeof req.body?.authEvent === 'string' ? req.body.authEvent.trim() : 'session_check';
      const authEvent: WelcomeAuthEvent = ALLOWED_WELCOME_EVENTS.has(rawEvent as WelcomeAuthEvent)
        ? (rawEvent as WelcomeAuthEvent)
        : 'session_check';

      const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)
        ?.split(',')[0]
        ?.trim();
      const forwardedHost = (req.headers['x-forwarded-host'] as string | undefined)
        ?.split(',')[0]
        ?.trim();
      const host = forwardedHost || req.get('host') || '';
      const proto = forwardedProto || req.protocol || 'https';
      const requestOrigin = host ? `${proto}://${host}` : null;

      const outcome = await processAuthenticatedWelcomeEmail({
        user: verified.user,
        accessToken: verified.accessToken,
        authEvent,
        requestOrigin,
      });

      return res.json(outcome);
    } catch (err: unknown) {
      return sendSafeApiError(res, 'auth.welcome_email', err);
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

          const parsedHost = parsedSignedUrl.hostname.toLowerCase();
          const isPrivateOrLocalHost =
            parsedHost === 'localhost' ||
            parsedHost === '127.0.0.1' ||
            parsedHost === '::1' ||
            parsedHost === '0.0.0.0' ||
            parsedHost.endsWith('.local') ||
            parsedHost.endsWith('.internal') ||
            /^10\./.test(parsedHost) ||
            /^192\.168\./.test(parsedHost) ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(parsedHost) ||
            /^169\.254\./.test(parsedHost);

          const isSupabaseHost = expectedHost
            ? parsedHost === expectedHost
            : parsedHost.endsWith('.supabase.co') && parsedHost.split('.').length >= 3;

          if (
            parsedSignedUrl.protocol !== 'https:' ||
            Boolean(parsedSignedUrl.username) ||
            Boolean(parsedSignedUrl.password) ||
            isPrivateOrLocalHost ||
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

          const resolvedTextTitle = titleInput || 'Pasted Study Notes';
          const textCacheKey = `v2:text:${crypto
            .createHash('sha256')
            .update(`${resolvedTextTitle}\0${rawText}`)
            .digest('hex')}`;
          const cachedTextResult = extractionCache.get(textCacheKey);
          if (cachedTextResult && cachedTextResult.expiresAt > Date.now()) {
            res.setHeader('Cache-Control', 'no-store');
            return res.json(cachedTextResult.result);
          }

          const chunks = chunkText(rawText);
          const { contentHash, detectedSubject, sections } = buildExtractedDocumentSections(rawText, {
            title: resolvedTextTitle,
          });
          const result: ExtractionResult = {
            extractionId: `ext-${contentHash.slice(0, 12)}-${Date.now().toString(36)}`,
            contentHash,
            detectedSubject,
            sections,
            title: resolvedTextTitle,
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
          setBoundedCacheEntry(
            extractionCache,
            textCacheKey,
            { result, expiresAt: Date.now() + EXTRACTION_CACHE_TTL_MS },
            60
          );
          res.setHeader('Cache-Control', 'no-store');
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

        const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
        const fileCacheKey = `v2:file:${materialType}:${fileHash}:${requestedTitle}:${file.originalname}`;
        const cachedFileResult = extractionCache.get(fileCacheKey);
        if (cachedFileResult && cachedFileResult.expiresAt > Date.now()) {
          res.setHeader('Cache-Control', 'no-store');
          return res.json(cachedFileResult.result);
        }

        const isReadableExtractedText = (txt: string): boolean => {
          const clean = (txt || '').replace(/\[Page\s+\d+\]/gi, ' ').trim();
          if (clean.length < 40) return false;
          const totalTokens = clean.split(/\s+/).filter(Boolean);
          if (totalTokens.length < 6) return false;
          const alphaWords = clean.match(/\b[a-zA-Z]{2,}\b/g) || [];
          const alphaRatio = alphaWords.length / totalTokens.length;
          if (alphaWords.length < 6 || alphaRatio < 0.28) return false;
          if (/(?:%PDF-|endobj|endstream|flatedecode)/i.test(clean.slice(0, 400))) return false;
          return true;
        };

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
            const candidateText = pdfPages
              .map((pageText, i) => {
                const cleaned = pageText.replace(/[ \t]+/g, ' ').trim();
                return cleaned ? `[Page ${i + 1}]\n${cleaned}` : '';
              })
              .filter(Boolean)
              .join('\n\n')
              .trim();
            if (isReadableExtractedText(candidateText)) {
              extractedText = candidateText;
              extractionMethod = 'pdf-text';
            }
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
          if (!isGeminiConfigured()) {
            return res.status(422).json({
              error:
                'Image text extraction (OCR) is unavailable because no AI vision service key is configured. Please upload a text-selectable PDF or .txt/.md file, or paste your study text directly.',
            });
          }
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
                      text: 'Perform high-accuracy academic OCR on this image of notes or textbook pages. Transcribe all printed or handwritten text, bullet lists, definitions, tables, and mathematical equations in exact top-to-bottom, left-to-right reading order. If a diagram has labels or callouts, include them cleanly under a [Diagram Labels] subheading. If the image contains no legible text (e.g., blank image, solid color, or illegible blur), output strictly: [NO_TEXT_DETECTED]. Output ONLY the extracted text or [NO_TEXT_DETECTED], with no thinking notes or commentary.',
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
          extractedText = (ocrResponse.text ?? '')
            .replace(/^Thinking Process:[\s\S]*?(?:\n\n|$)/i, '')
            .trim();
          extractionMethod = 'image-ocr';

          if (
            !extractedText ||
            /\[NO_TEXT_DETECTED\]/i.test(extractedText) ||
            /^Thinking Process:/i.test(extractedText) ||
            extractedText.length < 10
          ) {
            return res.status(422).json({
              error:
                'No legible text could be detected in this image. Please upload a clearer, well-lit photo or scan.',
            });
          }
        } else if (materialType === 'audio') {
          if (!isGeminiConfigured()) {
            return res.status(422).json({
              error:
                'Audio lecture transcription requires AI configuration. Please upload a PDF or text document, or paste your notes directly.',
            });
          }
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
                      text: 'Transcribe this academic lecture or study voice note accurately with proper punctuation, paragraph breaks by topic, and clear academic terminology. If the audio contains only silence, background noise, or no intelligible speech, output strictly: [NO_SPEECH_DETECTED]. Never ask the user to upload a file or emit conversational filler.',
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

          if (
            !extractedText ||
            /\[NO_SPEECH_DETECTED\]/i.test(extractedText) ||
            /please provide the audio file/i.test(extractedText) ||
            extractedText.length < 10
          ) {
            return res.status(422).json({
              error:
                'Could not transcribe speech from this audio file. Please verify the recording contains audible speech.',
            });
          }
        }

        const chunks = chunkText(extractedText);
        const { contentHash, detectedSubject, sections } = buildExtractedDocumentSections(
          extractedText,
          { title: requestedTitle }
        );
        const result: ExtractionResult = {
          extractionId: `ext-${contentHash.slice(0, 12)}-${Date.now().toString(36)}`,
          contentHash,
          detectedSubject,
          sections,
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

        setBoundedCacheEntry(
          extractionCache,
          fileCacheKey,
          { result, expiresAt: Date.now() + EXTRACTION_CACHE_TTL_MS },
          60
        );

        res.setHeader('Cache-Control', 'no-store');
        return res.json(result);
      } catch (err: unknown) {
        return sendSafeApiError(res, 'materials.extract', err);
      }
    }
  );

  app.post('/api/materials/sections', (req: Request, res: Response) => {
    try {
      const { extractedText, title, subjectArea } = (req.body || {}) as {
        extractedText?: string;
        title?: string;
        subjectArea?: string;
      };

      if (!extractedText || typeof extractedText !== 'string' || extractedText.trim().length < 20) {
        return res.status(400).json({
          error: 'Insufficient study material text to segment sections.',
        });
      }

      const boundedText = extractedText.trim().slice(0, 1_200_000);
      const result = buildExtractedDocumentSections(boundedText, {
        title: (title || 'Study Material').trim(),
        subjectArea: (subjectArea || '').trim(),
      });

      res.setHeader('Cache-Control', 'no-store');
      return res.json(result);
    } catch (err: unknown) {
      return sendSafeApiError(res, 'materials.sections', err);
    }
  });

  app.post('/api/summaries/extractive', (req: Request, res: Response) => {
    try {
      const {
        extractedText,
        title,
        subjectArea,
        summaryLevel,
        selectedSectionIndices,
        selectedSectionTexts,
      } = (req.body || {}) as {
        extractedText?: string;
        title?: string;
        subjectArea?: string;
        summaryLevel?: SummaryLevel;
        selectedSectionIndices?: number[];
        selectedSectionTexts?: string[];
      };

      let effectiveText = '';
      if (Array.isArray(selectedSectionTexts) && selectedSectionTexts.length > 0) {
        effectiveText = selectedSectionTexts
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .join('\n\n')
          .trim();
      } else if (typeof extractedText === 'string' && extractedText.trim().length >= 20) {
        if (Array.isArray(selectedSectionIndices) && selectedSectionIndices.length > 0) {
          const { sections } = buildExtractedDocumentSections(extractedText.trim().slice(0, 1_200_000), {
            title: (title || 'Document Summary').trim(),
            subjectArea: (subjectArea || '').trim(),
          });
          const indexSet = new Set(
            selectedSectionIndices.filter((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)
          );
          const picked = sections.filter((s) => indexSet.has(s.index));
          effectiveText =
            picked.length > 0
              ? picked.map((s) => s.text).join('\n\n').trim()
              : extractedText.trim();
        } else {
          effectiveText = extractedText.trim();
        }
      }

      if (!effectiveText || effectiveText.length < 20) {
        return res.status(400).json({
          error:
            'Insufficient study material text. Please extract or select at least one readable section before summarizing.',
        });
      }

      const alphaWords = (effectiveText.match(/[a-zA-Z]{2,}/g) || []).length;
      if (alphaWords < 3) {
        return res.status(422).json({
          error:
            'The provided document content appears unreadable or contains no valid text to summarize.',
        });
      }

      const level: SummaryLevel =
        summaryLevel === 'short' || summaryLevel === 'detailed' || summaryLevel === 'comprehensive'
          ? summaryLevel
          : 'detailed';

      // Preserve subject inference cleanly from the full document if available so section filtering never loses domain context
      const inferredFromFull =
        typeof extractedText === 'string' && extractedText.trim().length >= 20
          ? analyzeDocumentIntelligence(extractedText.trim().slice(0, 1_200_000), {
              title: (title || 'Document Summary').trim(),
              subjectArea: (subjectArea || '').trim(),
            }).subjectArea
          : (subjectArea || '').trim();

      const resolvedSubjectInput =
        (subjectArea && subjectArea.trim().toLowerCase() !== 'general studies'
          ? subjectArea.trim()
          : '') || inferredFromFull || 'General Studies';

      const boundedText = effectiveText.slice(0, 1_200_000);
      const summary = generateExtractiveSummary(
        (title || 'Document Summary').trim(),
        resolvedSubjectInput,
        boundedText,
        level
      );

      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        ...summary,
        generationMode: 'extractive' as const,
      });
    } catch (err: unknown) {
      return sendSafeApiError(res, 'summaries.document', err);
    }
  });



  const resolveQuizCaller = async (
    req: Request
  ): Promise<{ userId: string; accessToken: string | null }> => {
    const verifiedAuth = await resolveAuthorizedUserFromBearer(req.headers.authorization);
    return {
      userId: verifiedAuth?.userId || 'local-user',
      accessToken: verifiedAuth?.accessToken || null,
    };
  };

  const sendAssessmentError = (res: Response, operation: string, err: unknown) => {
    if (err instanceof AssessmentHttpError) {
      if (err.status >= 500) {
        logServerError(operation, err);
      }
      return res.status(err.status).json({ error: err.message });
    }
    return sendSafeApiError(res, operation, err);
  };

  app.post('/api/quizzes/generate', async (req: Request, res: Response) => {
    try {
      const caller = await resolveQuizCaller(req);
      const {
        sourceMode,
        sourceText,
        topicTitle,
        difficulty,
        questionCount,
        assessmentMode,
        timeLimitMinutes,
        materialId,
        summaryId,
      } = (req.body || {}) as {
        sourceMode?: QuizSourceMode;
        sourceText?: string;
        topicTitle?: string;
        format?: QuizFormat;
        difficulty?: QuizDifficulty;
        questionCount?: number;
        assessmentMode?: 'practice' | 'exam';
        timeLimitMinutes?: number | null;
        materialId?: string | null;
        summaryId?: string | null;
      };

      const cleanTitle = (topicTitle || '').trim();
      const cleanSource = (sourceText || '').trim().slice(0, 1_200_000);
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

      const validFormat: QuizFormat = 'objective';
      const validDifficulty: QuizDifficulty =
        difficulty === 'easy' ||
        difficulty === 'intermediate' ||
        difficulty === 'advanced' ||
        difficulty === 'mixed'
          ? difficulty
          : 'intermediate';

      const rawCount =
        typeof questionCount === 'number'
          ? questionCount
          : parseInt(String(questionCount || '10'), 10);
      const totalCount = Number.isFinite(rawCount)
        ? Math.max(5, Math.min(70, rawCount))
        : 10;

      const resolvedAssessmentMode = assessmentMode === 'exam' ? 'exam' : 'practice';
      const resolvedTimeLimit =
        resolvedAssessmentMode === 'exam'
          ? Math.min(180, Math.max(5, Number(timeLimitMinutes) || 20))
          : null;

      let sourceContent = cleanSource;
      if (mode === 'topic' && sourceContent.length < 30 && caller.accessToken) {
        const userDocs = await fetchAuthorizedUserMaterials(caller.accessToken, caller.userId);
        if (userDocs.length > 0) {
          const allChunks = userDocs.flatMap((doc) => getOrBuildDocumentChunks(doc));
          const hits = retrieveRelevantPassages(
            cleanTitle,
            allChunks,
            caller.userId,
            undefined,
            8
          );
          if (hits.length > 0) {
            sourceContent = hits
              .map((h) =>
                h.chunk.pageNumber !== null
                  ? `[Page ${h.chunk.pageNumber}]\n${h.chunk.originalText}`
                  : h.chunk.originalText
              )
              .join('\n\n');
          }
        }
      }

      if (mode === 'topic' && sourceContent.length < 30) {
        sourceContent = getAcademicTopicPrimer(cleanTitle);
      }

      const safeTitle = cleanTitle || 'Document Assessment';
      const rawQuestions = generateGroundedQuizQuestions(
        sourceContent,
        totalCount,
        validDifficulty,
        {
          assessmentMode: resolvedAssessmentMode,
          title: safeTitle,
        }
      );

      if (rawQuestions.length === 0) {
        return res.status(400).json({
          error:
            'Could not extract enough factual sentences from the material to generate grounded quiz questions. Please provide more detailed text.',
        });
      }

      const inferredSubject = analyzeDocumentIntelligence(sourceContent, {
        title: safeTitle,
      }).subjectArea;

      const { session, sanitizedQuestions } = await createServerAssessmentSession({
        userId: caller.userId,
        accessToken: caller.accessToken,
        title: safeTitle,
        subjectArea: inferredSubject,
        sourceMode: mode,
        materialId: typeof materialId === 'string' && materialId.trim() ? materialId.trim() : null,
        summaryId: typeof summaryId === 'string' && summaryId.trim() ? summaryId.trim() : null,
        format: validFormat,
        difficulty: validDifficulty,
        assessmentMode: resolvedAssessmentMode,
        timeLimitMinutes: resolvedTimeLimit,
        rawQuestions,
      });

      const insufficientSourceNote =
        sanitizedQuestions.length < totalCount
          ? `Only ${sanitizedQuestions.length} of ${totalCount} requested questions could be reliably grounded in your study material without inventing facts.`
          : null;

      const payload: GeneratedQuizPayload = {
        sessionId: session.sessionId,
        sessionToken: sealAssessmentSessionToken(session),
        quizId: session.quizId,
        title: session.title,
        subjectArea: session.subjectArea,
        format: validFormat,
        difficulty: validDifficulty,
        assessmentMode: session.assessmentMode,
        timeLimitMinutes: session.timeLimitMinutes,
        requestedQuestionCount: totalCount,
        questionCount: sanitizedQuestions.length,
        insufficientSourceNote,
        blueprint: buildAssessmentBlueprint(sanitizedQuestions),
        questions: sanitizedQuestions,
      };

      return res.json(payload);
    } catch (err: unknown) {
      return sendAssessmentError(res, 'quizzes.generate', err);
    }
  });

  app.post('/api/quizzes/sessions/start', async (req: Request, res: Response) => {
    try {
      const caller = await resolveQuizCaller(req);
      const { sessionId, sessionToken, quizId, assessmentMode, timeLimitMinutes, retake } = (
        req.body || {}
      ) as {
        sessionId?: string | null;
        sessionToken?: string | null;
        quizId?: string | null;
        assessmentMode?: 'practice' | 'exam';
        timeLimitMinutes?: number | null;
        retake?: boolean;
      };

      if (!sessionId && !quizId) {
        return res.status(400).json({ error: 'An assessment sessionId or quizId is required.' });
      }

      const started = await startServerAssessmentSession({
        userId: caller.userId,
        accessToken: caller.accessToken,
        sessionId: typeof sessionId === 'string' ? sessionId : null,
        sessionToken: typeof sessionToken === 'string' ? sessionToken : null,
        quizId: typeof quizId === 'string' ? quizId : null,
        assessmentMode:
          assessmentMode === 'exam' || assessmentMode === 'practice' ? assessmentMode : undefined,
        timeLimitMinutes:
          typeof timeLimitMinutes === 'number' ? timeLimitMinutes : undefined,
        retake: Boolean(retake),
      });

      return res.json(started);
    } catch (err: unknown) {
      return sendAssessmentError(res, 'quizzes.generate', err);
    }
  });

  app.get('/api/quizzes/sessions/active', async (req: Request, res: Response) => {
    try {
      const caller = await resolveQuizCaller(req);
      const sessions = await listActiveAssessmentSessions({
        userId: caller.userId,
        accessToken: caller.accessToken,
      });
      return res.json({ sessions });
    } catch (err: unknown) {
      return sendAssessmentError(res, 'quizzes.generate', err);
    }
  });

  app.post('/api/quizzes/sessions/restore', async (req: Request, res: Response) => {
    try {
      const caller = await resolveQuizCaller(req);
      const { sessionId, sessionToken } = (req.body || {}) as {
        sessionId?: string;
        sessionToken?: string | null;
      };
      if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
        return res.status(400).json({ error: 'An active assessment sessionId is required.' });
      }
      const restored = await restoreServerAssessmentSession({
        userId: caller.userId,
        accessToken: caller.accessToken,
        sessionId: sessionId.trim(),
        sessionToken: typeof sessionToken === 'string' ? sessionToken : null,
      });
      return res.json(restored);
    } catch (err: unknown) {
      return sendAssessmentError(res, 'quizzes.generate', err);
    }
  });

  app.get('/api/quizzes/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const caller = await resolveQuizCaller(req);
      const sessionId = String(req.params.sessionId || '').trim();
      if (!sessionId) {
        return res.status(400).json({ error: 'An assessment sessionId is required.' });
      }
      const restored = await restoreServerAssessmentSession({
        userId: caller.userId,
        accessToken: caller.accessToken,
        sessionId,
      });
      return res.json(restored);
    } catch (err: unknown) {
      return sendAssessmentError(res, 'quizzes.generate', err);
    }
  });

  const handleSaveSessionProgress = async (req: Request, res: Response) => {
    try {
      const caller = await resolveQuizCaller(req);
      const sessionId = String(req.params.sessionId || '').trim();
      if (!sessionId) {
        return res.status(400).json({ error: 'An assessment sessionId is required.' });
      }
      const { sessionToken, currentQuestionIndex, answers } = (req.body || {}) as {
        sessionToken?: string | null;
        currentQuestionIndex?: number;
        answers?: Record<string, StudentAnswer> | StudentAnswer[];
      };

      if (
        Array.isArray(answers) && answers.length > 70 ||
        (answers && !Array.isArray(answers) && typeof answers === 'object' && Object.keys(answers).length > 70)
      ) {
        return res.status(400).json({ error: 'Assessment progress exceeds maximum allowed 70 questions.' });
      }

      const saved = await saveAssessmentProgress({
        userId: caller.userId,
        accessToken: caller.accessToken,
        sessionId,
        sessionToken: typeof sessionToken === 'string' ? sessionToken : null,
        currentQuestionIndex:
          typeof currentQuestionIndex === 'number' ? currentQuestionIndex : undefined,
        answers,
      });
      return res.json(saved);
    } catch (err: unknown) {
      return sendAssessmentError(res, 'quizzes.grade', err);
    }
  };

  app.patch('/api/quizzes/sessions/:sessionId/progress', handleSaveSessionProgress);
  app.post('/api/quizzes/sessions/:sessionId/progress', handleSaveSessionProgress);

  app.post('/api/quizzes/answer', async (req: Request, res: Response) => {
    try {
      const caller = await resolveQuizCaller(req);
      const { sessionId, sessionToken, questionId, selectedOptionIndex } = (req.body || {}) as {
        sessionId?: string;
        sessionToken?: string | null;
        questionId?: string;
        selectedOptionIndex?: number;
      };

      if (!sessionId || typeof sessionId !== 'string' || !questionId || typeof questionId !== 'string') {
        return res.status(400).json({ error: 'Session ID and question ID are required.' });
      }

      const checked = await checkPracticeQuestionAnswer({
        userId: caller.userId,
        accessToken: caller.accessToken,
        sessionId,
        sessionToken: typeof sessionToken === 'string' ? sessionToken : null,
        questionId,
        selectedOptionIndex: Number(selectedOptionIndex),
      });

      return res.json(checked);
    } catch (err: unknown) {
      return sendAssessmentError(res, 'quizzes.grade', err);
    }
  });

  app.post('/api/quizzes/grade', async (req: Request, res: Response) => {
    try {
      const caller = await resolveQuizCaller(req);
      const { sessionId, sessionToken, answers, timeTakenSeconds, autoSubmitted } = (
        req.body || {}
      ) as {
        sessionId?: string;
        sessionToken?: string | null;
        answers?: StudentAnswer[];
        timeTakenSeconds?: number;
        autoSubmitted?: boolean;
      };

      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({
          error: 'An active assessment sessionId is required to submit for grading.',
        });
      }

      if (Array.isArray(answers) && answers.length > 70) {
        return res.status(400).json({ error: 'Quiz submission exceeds maximum allowed 70 questions.' });
      }

      const graded = await submitAndGradeServerAssessment({
        userId: caller.userId,
        accessToken: caller.accessToken,
        sessionId,
        sessionToken: typeof sessionToken === 'string' ? sessionToken : null,
        answers: Array.isArray(answers) ? answers : [],
        clientElapsedSeconds: timeTakenSeconds,
        autoSubmitted: Boolean(autoSubmitted),
      });

      return res.json(graded);
    } catch (err: unknown) {
      return sendAssessmentError(res, 'quizzes.grade', err);
    }
  });

  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    try {
      const { parts, systemInstruction, needsTitle, rag } = await buildAiChatParts(
        req.body || {},
        req.headers.authorization
      );
      const ragMeta = {
        intent: rag.intent,
        knowledgeSource: rag.knowledgeSource,
        searchedDocumentsCount: rag.searchedDocumentsCount,
        passagesRetrieved: rag.sources.length,
        totalRawDocumentChars: rag.totalRawDocumentChars,
        injectedPassageChars: rag.injectedPassageChars,
      };
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
              const ai = getGeminiClient();
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
          const ai = getGeminiClient();
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
          sources: rag.sources,
          ragMeta,
        });
      }

      let reply = '';
      if (!hasImage) {
        const resAI = await runMasterAiGeneration({
          systemInstruction,
          userPrompt: textPrompt,
          maxTokens: 2500,
          geminiFallback: async () => {
            const ai = getGeminiClient();
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
        const ai = getGeminiClient();
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

      return res.json({
        reply,
        sources: rag.sources,
        ragMeta,
      });
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
      const { parts, systemInstruction, needsTitle, rag } = await buildAiChatParts(
        req.body || {},
        req.headers.authorization
      );
      const ragMeta = {
        intent: rag.intent,
        knowledgeSource: rag.knowledgeSource,
        searchedDocumentsCount: rag.searchedDocumentsCount,
        passagesRetrieved: rag.sources.length,
        totalRawDocumentChars: rag.totalRawDocumentChars,
        injectedPassageChars: rag.injectedPassageChars,
      };
      const hasImage = parts.some((p) => 'inlineData' in p);
      const textPrompt = parts
        .map((p) => ('text' in p ? p.text : ''))
        .filter(Boolean)
        .join('\n\n');

      const streamInstruction = needsTitle
        ? `${systemInstruction}\n\nOUTPUT FORMAT REQUIREMENT:\nWrite your full Markdown answer directly first. Then on a brand-new final line at the very end, append exactly one metadata marker in this exact format (single-line valid JSON, no code fences):\n[[CHAT_META:{"suggestedTitle":"3 to 6 word title","subjectArea":"Academic Discipline"}]]`
        : systemInstruction;

      initSseResponse(res);
      writeSseEvent(res, 'sources', {
        sources: rag.sources,
        ragMeta,
      });
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
              const ai = getGeminiClient();
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
          const ai = getGeminiClient();
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
            sources: rag.sources,
            ragMeta,
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
            sources: rag.sources,
            ragMeta,
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
      const { parts, systemInstruction, currentTopic, rag } = await buildAiTutorParts(
        req.body || {},
        req.headers.authorization
      );
      const hasImage = parts.some((p) => 'inlineData' in p);
      const textPrompt = parts
        .map((p) => ('text' in p ? p.text : ''))
        .filter(Boolean)
        .join('\n\n');

      const tutorSystemInstruction = `${systemInstruction}\n\nCRITICAL JSON FORMAT REQUIREMENT:\nYou must respond strictly with a valid JSON object matching this schema: {"reply": "Markdown tutoring lesson", "topicTitle": "3 to 6 word topic title", "subjectArea": "Academic subject", "currentStageLabel": "Stage label", "advanceStep": true}`;
      const tutorUserPrompt = `${textPrompt}\n\nRespond with a valid JSON object containing "reply", "topicTitle", "subjectArea", "currentStageLabel", and "advanceStep".`;
      const maxTokens = rag.useStructuredLessonPlan ? 3200 : 2500;

      let tutorJsonText = '';
      if (!hasImage) {
        const resAI = await runMasterAiGeneration({
          systemInstruction: tutorSystemInstruction,
          userPrompt: tutorUserPrompt,
          jsonMode: true,
          maxTokens,
          geminiFallback: async () => {
            const ai = getGeminiClient();
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
        const ai = getGeminiClient();
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
        sources: rag.sources,
        ragMeta: {
          pedagogicalAction: rag.pedagogicalAction,
          useStructuredLessonPlan: rag.useStructuredLessonPlan,
          knowledgeSource: rag.knowledgeSource,
          searchedDocumentsCount: rag.searchedDocumentsCount,
          passagesRetrieved: rag.sources.length,
          totalRawDocumentChars: rag.totalRawDocumentChars,
          injectedPassageChars: rag.injectedPassageChars,
        },
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
      const { parts, systemInstruction, currentTopic, rag } = await buildAiTutorParts(
        req.body || {},
        req.headers.authorization
      );
      const hasImage = parts.some((p) => 'inlineData' in p);
      const textPrompt = parts
        .map((p) => ('text' in p ? p.text : ''))
        .filter(Boolean)
        .join('\n\n');

      const streamInstruction = `${systemInstruction}\n\nOUTPUT FORMAT REQUIREMENT:\nWrite your full Markdown tutoring response directly first. Then on a brand-new final line at the very end, append exactly one metadata marker in this exact format (single-line valid JSON, no code fences):\n[[TUTOR_META:{"topicTitle":"3 to 6 word topic title","subjectArea":"Academic Discipline","currentStageLabel":"Current Stage Label","advanceStep":true}]]`;
      const maxTokens = rag.useStructuredLessonPlan ? 3200 : 2500;

      const ragMeta = {
        pedagogicalAction: rag.pedagogicalAction,
        useStructuredLessonPlan: rag.useStructuredLessonPlan,
        knowledgeSource: rag.knowledgeSource,
        searchedDocumentsCount: rag.searchedDocumentsCount,
        passagesRetrieved: rag.sources.length,
        totalRawDocumentChars: rag.totalRawDocumentChars,
        injectedPassageChars: rag.injectedPassageChars,
      };

      initSseResponse(res);
      writeSseEvent(res, 'sources', {
        sources: rag.sources,
        ragMeta,
      });
      heartbeat = setInterval(() => {
        if (!clientClosed && !res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, 4000);

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
            maxTokens,
            onChunk: onChunkCallback,
            geminiFallback: async () => {
              const ai = getGeminiClient();
              const model = getGeminiModel();
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
          const ai = getGeminiClient();
          const model = getGeminiModel();
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
          sources: rag.sources,
          ragMeta,
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
