import crypto from 'crypto';
import {
  extractKeywords,
  extractMatchingStructuredHighlights,
  fetchAuthorizedUserMaterials,
  getOrBuildDocumentChunks,
  getSupabaseServerConfig,
  normalizeText,
  resolveAuthorizedUserFromBearer,
  retrieveRelevantPassages,
  setBoundedCacheEntry,
  type DocumentChunk,
  type IndexedDocumentRecord,
  type RetrievalResult,
} from './documentEngine.ts';
import type { TutorMode } from '../src/types/brainstine.ts';

export type TutorPedagogicalAction =
  | 'guided_full_lesson'
  | 'answer_evaluation'
  | 'simplify_reteach'
  | 'advance_next'
  | 'provide_examples'
  | 'summarize_lesson'
  | 'understanding_check'
  | 'continue_lesson'
  | 'concept_question';

export type TutorKnowledgeSource =
  | 'study_materials'
  | 'general_knowledge'
  | 'hybrid';

export interface TutorDocumentInput {
  id?: string | null;
  title: string;
  type?: string;
  content: string;
}

export interface TutorStudyMaterialInput {
  id: string;
  userId?: string;
  title: string;
  materialType?: string;
  extractedText: string;
}

export interface TutorRetrievedSource {
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  chunkPosition: number;
  matchedKeywords: string[];
  excerpt: string;
  score: number;
}

export interface TutorRagContextResult {
  pedagogicalAction: TutorPedagogicalAction;
  useStructuredLessonPlan: boolean;
  retrievalQuery: string;
  topicKeywords: string[];
  searchedDocumentsCount: number;
  searchedDocumentTitles: string[];
  totalRawDocumentChars: number;
  injectedPassageChars: number;
  requestedTopK: number;
  sources: TutorRetrievedSource[];
  knowledgeSource: TutorKnowledgeSource;
  tutorPromptDirective: string;
  documentContextPromptBlock: string;
  hasAttachedDocument: boolean;
}

const TUTOR_FILLER_WORDS = new Set([
  'teach', 'learn', 'lesson', 'guided', 'beginning', 'start', 'step', 'steps',
  'explain', 'describe', 'define', 'compare', 'compares', 'comparing', 'compared',
  'contrast', 'contrasts', 'versus', 'difference', 'differences', 'relationship',
  'summarize', 'summary', 'recap', 'review', 'example', 'examples', 'analogy',
  'beginner', 'standard', 'advanced', 'easier', 'easy', 'simpler', 'simple',
  'hard', 'confused', 'understand', 'understanding', 'check', 'question',
  'questions', 'practice', 'test', 'next', 'level', 'continue', 'move',
  'further', 'detail', 'details', 'elaborate', 'clarify', 'again', 'previous',
  'earlier', 'above', 'please', 'help', 'show', 'give', 'tell', 'make',
  'smaller', 'pieces', 'concept', 'concepts', 'topic', 'notes', 'document',
  'material', 'materials', 'pdf', 'uploaded', 'attached', 'file', 'slides',
  'lecture', 'chapter', 'section', 'page', 'pages', 'according', 'does',
  'did', 'what', 'which', 'how', 'why',
]);

const tutorRagCache = new Map<string, { result: TutorRagContextResult; expiresAt: number }>();

function extractTutorTopicKeywords(text: string, max = 10): string[] {
  const raw = extractKeywords(text, 24);
  const filtered = raw.filter((kw) => !TUTOR_FILLER_WORDS.has(kw));
  return filtered.slice(0, max);
}

function isTutorPassageRelevant(
  result: RetrievalResult,
  topicKeywords: string[]
): boolean {
  const matchedTopicTerms = result.matchedKeywords.filter(
    (kw) => !TUTOR_FILLER_WORDS.has(kw)
  );
  if (matchedTopicTerms.length === 0) return false;

  const keywordHitCount = matchedTopicTerms.filter((t) =>
    result.chunk.keywords.includes(t)
  ).length;

  const textLower = result.chunk.originalText.toLowerCase();
  let hasTopicBigram = false;
  for (let i = 0; i < topicKeywords.length - 1; i++) {
    const bigram = `${topicKeywords[i]} ${topicKeywords[i + 1]}`;
    if (textLower.includes(bigram)) {
      hasTopicBigram = true;
      break;
    }
  }

  if (topicKeywords.length <= 2) {
    return (
      result.score >= 2.0 &&
      (keywordHitCount >= 1 || matchedTopicTerms.length >= 2 || result.score >= 2.8)
    );
  }

  if (topicKeywords.length <= 4) {
    if (matchedTopicTerms.length >= 2 && result.score >= 2.4) return true;
    if (
      keywordHitCount >= 1 &&
      matchedTopicTerms.length / topicKeywords.length >= 0.33 &&
      result.score >= 2.8
    ) {
      return true;
    }
    return false;
  }

  const coverage = matchedTopicTerms.length / topicKeywords.length;
  if (matchedTopicTerms.length >= 3 && result.score >= 2.8) return true;
  if (hasTopicBigram && keywordHitCount >= 1 && result.score >= 3.2) return true;
  if (coverage >= 0.4 && result.score >= 2.8) return true;
  return false;
}

export interface TutorPedagogicalAnalysis {
  pedagogicalAction: TutorPedagogicalAction;
  useStructuredLessonPlan: boolean;
  needsMultiPassageSynthesis: boolean;
  topicKeywords: string[];
  retrievalQuery: string;
  tutorPromptDirective: string;
}

export function analyzeTutorPedagogicalState(params: {
  message: string;
  quickAction?: string;
  currentTopic?: string;
  currentStep?: number;
  tutorMode: TutorMode;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  hasImage: boolean;
}): TutorPedagogicalAnalysis {
  const cleanMsg = normalizeText(params.message || '');
  const cleanQuick = normalizeText(params.quickAction || '');
  const combinedInput = `${cleanQuick} ${cleanMsg}`.trim();
  const lower = combinedInput.toLowerCase();

  const lastAssistantMsg =
    [...params.history].reverse().find((h) => h.role === 'assistant')?.content || '';
  const prevAskedCheckQuestion =
    params.history.length > 0 &&
    /\?/.test(lastAssistantMsg.slice(-500)) &&
    /\b(check|question|try|think|what would|why does|how would|which|can you|explain in your own|your answer)\b/i.test(
      lastAssistantMsg.slice(-600)
    );

  let pedagogicalAction: TutorPedagogicalAction = 'concept_question';
  let useStructuredLessonPlan = false;

  const explicitlyWantsGuidedLesson =
    /\b(guided lesson|full lesson|complete lesson|teach .+ from the beginning|from scratch|step[- ]by[- ]step lesson|structured lesson)\b/i.test(
      lower
    ) ||
    /^(teach me this topic from the beginning|start guided lesson)$/i.test(cleanQuick);

  const wantsSimplify =
    /\b(explain like a beginner|make it easier|explain that step again|confused|don't understand|do not understand|don't get it|lost me|too complex|too complicated|simplify|simpler|hard to follow|break this down)\b/i.test(
      lower
    );

  const wantsExamples =
    /\b(give another example|give example|another example|concrete example|real[- ]world example|worked example|illustrate)\b/i.test(
      lower
    );

  const wantsSummary =
    /\b(summarize|summary|recap|review what we covered|summarize lesson)\b/i.test(lower);

  const wantsUnderstandingCheck =
    /\b(test my understanding|check my understanding|ask me a practice question|quiz me|test me)\b/i.test(
      lower
    );

  const wantsAdvance =
    /\b(next level|continue lesson|next concept|move on|go ahead|got it|makes sense|i understand|understood|clear now|ready for the next)\b/i.test(
      lower
    );

  if (
    explicitlyWantsGuidedLesson ||
    (params.history.length === 0 &&
      !wantsSimplify &&
      !wantsUnderstandingCheck &&
      !wantsSummary)
  ) {
    pedagogicalAction = 'guided_full_lesson';
    useStructuredLessonPlan = explicitlyWantsGuidedLesson || params.history.length === 0;
  } else if (wantsSummary) {
    pedagogicalAction = 'summarize_lesson';
  } else if (wantsUnderstandingCheck) {
    pedagogicalAction = 'understanding_check';
  } else if (wantsSimplify) {
    pedagogicalAction = 'simplify_reteach';
  } else if (wantsExamples) {
    pedagogicalAction = 'provide_examples';
  } else if (wantsAdvance) {
    pedagogicalAction = cleanQuick.toLowerCase().includes('continue')
      ? 'continue_lesson'
      : 'advance_next';
  } else if (
    prevAskedCheckQuestion &&
    !cleanQuick &&
    cleanMsg.length > 0 &&
    !cleanMsg.endsWith('?')
  ) {
    pedagogicalAction = 'answer_evaluation';
  } else {
    pedagogicalAction = 'concept_question';
  }

  const needsMultiPassageSynthesis =
    useStructuredLessonPlan ||
    pedagogicalAction === 'summarize_lesson' ||
    /\b(compare|contrast|difference|differences|relationship|process|mechanism|stages|steps|pathway|cycle|overview|all|both)\b/i.test(
      lower
    );

  const msgKeywords = extractTutorTopicKeywords(cleanMsg, 8);
  const topicKeywordsFromTitle = extractTutorTopicKeywords(params.currentTopic || '', 5);
  const recentHistoryText = params.history
    .slice(-4)
    .map((h) => h.content.slice(0, 450))
    .join(' ');
  const historyKeywords =
    msgKeywords.length < 3 || params.history.length > 0
      ? extractTutorTopicKeywords(recentHistoryText, 6)
      : [];

  const mergedKeywords = Array.from(
    new Set([...msgKeywords, ...topicKeywordsFromTitle, ...historyKeywords])
  ).slice(0, 12);

  const retrievalQuery =
    msgKeywords.length >= 3
      ? `${cleanMsg} ${topicKeywordsFromTitle.join(' ')}`.trim()
      : `${cleanMsg} ${params.currentTopic || ''} ${mergedKeywords.join(' ')}`.trim();

  let tutorPromptDirective = '';
  switch (pedagogicalAction) {
    case 'guided_full_lesson':
      tutorPromptDirective = `GUIDED LEARNING SESSION REQUESTED:
Structure this lesson clearly using the 8-part Guided Learning flow (adapted concisely to ${params.tutorMode.toUpperCase()} depth so it stays readable and engaging):
1. **Topic Introduction** — What this topic is and why it matters.
2. **Learning Objectives** — 2–4 concrete outcomes the student will grasp.
3. **Core Concepts** — Clear step-by-step explanation; define unfamiliar terminology explicitly.
4. **Detailed Subtopic Breakdown** — Logical mechanisms, processes, or comparisons (use a Markdown comparison table when contrasting ideas).
5. **Examples & Applications** — Visually separate concrete examples inside a > **Example:** block or dedicated subheading.
6. **Knowledge Check** — 1–2 short, relevant check questions inside a > **Knowledge Check:** block for the student to try.
7. **Lesson Recap** — Concise takeaway bullets of the most important points.
8. **Suggested Next Topic** — Recommend the natural next concept or subtopic to explore next.`;
      break;

    case 'answer_evaluation':
      tutorPromptDirective = `UNDERSTANDING CHECK EVALUATION:
The student is responding to your previous question.
- Evaluate their answer warmly and accurately: state clearly what they got right, identify any misconception or missing reasoning, and explain *why* the correct answer works.
- If they struggled or missed a core mechanism, re-explain that part using a fresh angle or simpler analogy and set "advanceStep": false.
- If they demonstrated solid understanding, affirm it briefly, advance smoothly to the next logical concept or step, and set "advanceStep": true.`;
      break;

    case 'simplify_reteach':
      tutorPromptDirective = `ADAPTIVE SIMPLIFICATION & RE-TEACHING:
The student asked for a simpler explanation or expressed difficulty.
- Slow down and re-explain the current concept in plain, intuitive language without losing scientific/academic accuracy.
- Define unfamiliar terms before using them, use a relatable everyday analogy inside a > **Example:** block, and break the mechanism into small numbered steps.
- Set "advanceStep": false so the student masters this step before advancing.`;
      break;

    case 'provide_examples':
      tutorPromptDirective = `WORKED EXAMPLES & APPLICATIONS:
Provide 1–2 concrete, step-by-step worked examples or real-world applications illustrating the current concept.
- Visually separate each example using a > **Example:** callout or dedicated subheading so it stands out from conceptual prose.
- Set "advanceStep": false unless introducing a new stage.`;
      break;

    case 'summarize_lesson':
      tutorPromptDirective = `LESSON RECAP & SUMMARY:
Synthesize what has been covered in this tutoring session so far:
- Organize into **Key Points**, **Key Terms & Definitions**, and **Next Recommended Step**.
- Keep it crisp and revision-ready; set "advanceStep": false.`;
      break;

    case 'understanding_check':
      tutorPromptDirective = `TARGETED KNOWLEDGE CHECK:
Ask 1–2 short, focused check questions testing the student's grasp of what was just taught in this session (grounded in retrieved study passages when available).
- Place the check inside a > **Knowledge Check:** block.
- Do NOT reveal the answer immediately—invite the student to reply so you can evaluate and give feedback.
- Set "advanceStep": false.`;
      break;

    case 'advance_next':
    case 'continue_lesson':
      tutorPromptDirective = `CONTINUE & PROGRESS LESSON:
Continue seamlessly from where the student stopped (Step ${params.currentStep || 1} on "${
        params.currentTopic || 'current topic'
      }") without repeating earlier turns.
- Briefly connect back to the previous step, teach the next logical concept/subtopic clearly with unfamiliar terms defined and a separated > **Example:**, and include a brief check question only if natural at this milestone.
- Set "advanceStep": true.`;
      break;

    case 'concept_question':
    default:
      tutorPromptDirective = `INTERACTIVE QUESTION DURING LESSON:
Answer the student's specific question thoroughly like a patient academic instructor:
- Explain processes and mechanisms in logical order, define unfamiliar terms, compare related concepts cleanly when relevant, and visually separate examples inside a > **Example:** block.
- Connect your answer back to the active lesson seamlessly. Ask an understanding check only when helpful—do not overwhelm the student on every turn.`;
      break;
  }

  return {
    pedagogicalAction,
    useStructuredLessonPlan,
    needsMultiPassageSynthesis,
    topicKeywords: mergedKeywords,
    retrievalQuery: retrievalQuery || cleanMsg,
    tutorPromptDirective,
  };
}

/**
 * Main RAG orchestrator for Brainstine's Personal AI Tutor (Layer B Hybrid AI Learning Engine).
 * Connects the shared /server/documentEngine.ts intelligence + caching to /api/ai/tutor and /api/ai/tutor/stream,
 * preserving user isolation, page citations, structured highlights, and dual-source teaching.
 */
export async function buildTutorRagContext(params: {
  message: string;
  quickAction?: string;
  currentTopic?: string;
  currentStep?: number;
  tutorMode: TutorMode;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  documentContext?: TutorDocumentInput | null;
  studyMaterials?: TutorStudyMaterialInput[] | null;
  attachedDocumentId?: string | null;
  userId?: string | null;
  authHeader?: string | string[];
  hasImage: boolean;
}): Promise<TutorRagContextResult> {
  const verifiedAuth = await resolveAuthorizedUserFromBearer(params.authHeader);
  const effectiveUserId =
    verifiedAuth?.userId ||
    (typeof params.userId === 'string' && params.userId.trim()
      ? params.userId.trim()
      : 'local-user');

  const docsMap = new Map<string, IndexedDocumentRecord>();

  const hasAttachedDocument = Boolean(
    params.documentContext &&
      typeof params.documentContext.content === 'string' &&
      params.documentContext.content.trim().length > 0
  );

  if (verifiedAuth) {
    let dbMaterials = await fetchAuthorizedUserMaterials(
      verifiedAuth.accessToken,
      verifiedAuth.userId
    );
    if (
      params.attachedDocumentId &&
      !hasAttachedDocument &&
      !dbMaterials.some((doc) => doc.id === params.attachedDocumentId)
    ) {
      dbMaterials = await fetchAuthorizedUserMaterials(
        verifiedAuth.accessToken,
        verifiedAuth.userId,
        true
      );
    }
    for (const doc of dbMaterials) {
      docsMap.set(doc.id, doc);
    }
  }

  const allowCallerMaterials = !getSupabaseServerConfig() || Boolean(verifiedAuth);
  if (allowCallerMaterials && Array.isArray(params.studyMaterials)) {
    for (const mat of params.studyMaterials) {
      if (
        !mat ||
        typeof mat.id !== 'string' ||
        typeof mat.extractedText !== 'string' ||
        !mat.extractedText.trim()
      ) {
        continue;
      }
      if (mat.userId && mat.userId !== effectiveUserId) {
        continue;
      }
      if (!docsMap.has(mat.id)) {
        docsMap.set(mat.id, {
          id: mat.id,
          userId: effectiveUserId,
          title: (mat.title || 'Study Material').trim(),
          type: mat.materialType
            ? `Uploaded ${mat.materialType.toUpperCase()} Material`
            : 'Uploaded Study Material',
          extractedText: mat.extractedText,
        });
      }
    }
  }

  let attachedDocId: string | undefined;

  if (hasAttachedDocument && params.documentContext) {
    attachedDocId =
      (typeof params.documentContext.id === 'string' && params.documentContext.id.trim()) ||
      (typeof params.attachedDocumentId === 'string' && params.attachedDocumentId.trim()) ||
      `attached-${crypto
        .createHash('sha256')
        .update(params.documentContext.title || 'tutor-doc')
        .digest('hex')
        .slice(0, 12)}`;

    docsMap.set(attachedDocId, {
      id: attachedDocId,
      userId: effectiveUserId,
      title: (params.documentContext.title || 'Linked Study Material').trim(),
      type: params.documentContext.type || 'Linked Study Material',
      extractedText: params.documentContext.content,
    });
  }

  const allDocs = Array.from(docsMap.values());
  const cacheKey = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        uid: effectiveUserId,
        msg: normalizeText(params.message || ''),
        quick: normalizeText(params.quickAction || ''),
        topic: params.currentTopic || '',
        step: params.currentStep || 0,
        mode: params.tutorMode,
        hist: params.history.slice(-3),
        attachedDocId: attachedDocId || '',
        hasImg: params.hasImage,
        docs: allDocs.map((d) => `${d.id}:${d.extractedText.length}:${d.extractedText.slice(0, 64)}`),
      })
    )
    .digest('hex');

  const cachedRag = tutorRagCache.get(cacheKey);
  if (cachedRag && cachedRag.expiresAt > Date.now()) {
    return cachedRag.result;
  }

  const analysis = analyzeTutorPedagogicalState({
    message: params.message,
    quickAction: params.quickAction,
    currentTopic: params.currentTopic,
    currentStep: params.currentStep,
    tutorMode: params.tutorMode,
    history: params.history,
    hasImage: params.hasImage,
  });

  if (allDocs.length === 0) {
    const emptyResult: TutorRagContextResult = {
      pedagogicalAction: analysis.pedagogicalAction,
      useStructuredLessonPlan: analysis.useStructuredLessonPlan,
      retrievalQuery: analysis.retrievalQuery,
      topicKeywords: analysis.topicKeywords,
      searchedDocumentsCount: 0,
      searchedDocumentTitles: [],
      totalRawDocumentChars: 0,
      injectedPassageChars: 0,
      requestedTopK: 0,
      sources: [],
      knowledgeSource: 'general_knowledge',
      tutorPromptDirective: analysis.tutorPromptDirective,
      documentContextPromptBlock:
        '\n\nTEACHING KNOWLEDGE SOURCE:\nNo uploaded study document is linked or available for this lesson. Teach accurately using General Academic Knowledge. Do NOT claim to have read any uploaded file or fabricate document citations.',
      hasAttachedDocument,
    };
    setBoundedCacheEntry(tutorRagCache, cacheKey, {
      result: emptyResult,
      expiresAt: Date.now() + 30_000,
    });
    return emptyResult;
  }

  const allChunks: DocumentChunk[] = [];
  const docTitleById = new Map<string, string>();
  const docById = new Map<string, IndexedDocumentRecord>();
  let totalRawDocumentChars = 0;

  for (const doc of allDocs) {
    docTitleById.set(doc.id, doc.title);
    docById.set(doc.id, doc);
    totalRawDocumentChars += doc.extractedText.length;
    allChunks.push(...getOrBuildDocumentChunks(doc));
  }

  const candidatePoolSize = 6;
  let candidates = retrieveRelevantPassages(
    analysis.retrievalQuery,
    allChunks,
    effectiveUserId,
    attachedDocId,
    candidatePoolSize
  ).filter((r) => isTutorPassageRelevant(r, analysis.topicKeywords));

  if (candidates.length === 0 && attachedDocId && allDocs.length > 1) {
    candidates = retrieveRelevantPassages(
      analysis.retrievalQuery,
      allChunks,
      effectiveUserId,
      undefined,
      candidatePoolSize
    ).filter((r) => isTutorPassageRelevant(r, analysis.topicKeywords));
  }

  if (
    candidates.length === 0 &&
    attachedDocId &&
    analysis.pedagogicalAction === 'guided_full_lesson'
  ) {
    const attachedChunks = allChunks
      .filter((c) => c.documentId === attachedDocId && c.userId === effectiveUserId)
      .slice(0, 3);
    candidates = attachedChunks.map((chunk) => ({
      chunk,
      score: 1.5,
      matchedKeywords: chunk.keywords.slice(0, 3),
    }));
  }

  const defaultLimit = 3;
  let targetLimit = defaultLimit;
  if (analysis.needsMultiPassageSynthesis && candidates.length > defaultLimit) {
    const topScore = candidates[0].score;
    const maxAllowed = Math.min(5, candidates.length);
    for (let idx = defaultLimit; idx < maxAllowed; idx++) {
      if (candidates[idx].score >= topScore * 0.45) {
        targetLimit = idx + 1;
      } else {
        break;
      }
    }
  }

  const MAX_TOTAL_PASSAGE_CHARS = 5800;
  const selectedResults: RetrievalResult[] = [];
  let runningChars = 0;

  for (const cand of candidates.slice(0, targetLimit)) {
    const textLen = cand.chunk.originalText.length;
    if (selectedResults.length > 0 && runningChars + textLen > MAX_TOTAL_PASSAGE_CHARS) {
      break;
    }
    selectedResults.push(cand);
    runningChars += textLen;
  }

  const sources: TutorRetrievedSource[] = selectedResults.map((res) => ({
    documentId: res.chunk.documentId,
    documentTitle: docTitleById.get(res.chunk.documentId) || 'Uploaded Study Material',
    pageNumber: res.chunk.pageNumber,
    chunkPosition: res.chunk.chunkPosition,
    matchedKeywords: res.matchedKeywords,
    excerpt:
      res.chunk.originalText.length > 260
        ? `${res.chunk.originalText.slice(0, 260).trim()}...`
        : res.chunk.originalText,
    score: res.score,
  }));

  const searchedTitles = allDocs.map((d) => d.title);
  let documentContextPromptBlock = '';
  let knowledgeSource: TutorKnowledgeSource = 'general_knowledge';

  if (selectedResults.length > 0) {
    knowledgeSource = 'hybrid';
    const orderedForPrompt = [...selectedResults].sort((a, b) => {
      if (a.chunk.documentId !== b.chunk.documentId) {
        return a.chunk.documentId.localeCompare(b.chunk.documentId);
      }
      const pA = a.chunk.pageNumber ?? 99999;
      const pB = b.chunk.pageNumber ?? 99999;
      if (pA !== pB) return pA - pB;
      return a.chunk.chunkPosition - b.chunk.chunkPosition;
    });

    const passageBlocks = orderedForPrompt
      .map((res, idx) => {
        const title = docTitleById.get(res.chunk.documentId) || 'Uploaded Study Material';
        const pageLabel =
          res.chunk.pageNumber !== null ? `Page ${res.chunk.pageNumber}` : 'Unnumbered Section';
        return `[Passage ${idx + 1}] Document: "${title}" | Reference: ${pageLabel} (Section #${
          res.chunk.chunkPosition + 1
        })\n${res.chunk.originalText}`;
      })
      .join('\n\n---\n\n');

    const matchedDocIds = Array.from(new Set(selectedResults.map((r) => r.chunk.documentId)));
    const matchedDocs = matchedDocIds
      .map((id) => docById.get(id))
      .filter((d): d is IndexedDocumentRecord => Boolean(d));
    const highlights = extractMatchingStructuredHighlights(matchedDocs, analysis.retrievalQuery, 2);
    const highlightsText = highlights.join('\n');
    const highlightBlock =
      highlights.length > 0 && runningChars + highlightsText.length + 60 <= MAX_TOTAL_PASSAGE_CHARS
        ? `\n\nKEY DOCUMENT DEFINITIONS & FORMULAS:\n${highlights.map((h) => `- ${h}`).join('\n')}`
        : '';

    documentContextPromptBlock = `\n\nRETRIEVED STUDY MATERIAL PASSAGES (${selectedResults.length} excerpt${
      selectedResults.length === 1 ? '' : 's'
    } from ${searchedTitles.length} searchable material${searchedTitles.length === 1 ? '' : 's'}):
${passageBlocks}${highlightBlock}

DOCUMENT GROUNDING & CITATION RULES FOR TUTORING:
1. Anchor your lesson in the retrieved study material passages above and cite the Document Title and Page reference inline (e.g., *(From "${
      sources[0].documentTitle
    }", ${sources[0].pageNumber !== null ? `Page ${sources[0].pageNumber}` : 'Excerpt'})*).
2. Clearly distinguish facts taken from the uploaded study material versus additional **General Academic Knowledge** (such as intuitive analogies, background context, or extra worked examples you add to help the student understand).
3. If the retrieved passages do not cover a requested subtopic or detail, honestly inform the student what the document covers and teach the missing part under clearly labeled **General Academic Knowledge**.
4. NEVER fabricate page numbers, quotes, or document claims not present in the passages above.`;
  } else {
    knowledgeSource = 'general_knowledge';
    const searchedList = searchedTitles.map((t) => `"${t}"`).join(', ');
    documentContextPromptBlock = `\n\nTEACHING KNOWLEDGE SOURCE — NO MATCHING STUDY MATERIAL PASSAGES FOUND:
Searched the student's uploaded study material(s) (${searchedList}), and none contained passages covering this topic.
RULES:
1. Teach the topic thoroughly using **General Academic Knowledge** adapted to the student's selected mode.
2. Briefly note (e.g., *> **Source Note:** Taught using General Academic Knowledge — no matching excerpt was found in your uploaded materials.*) so the student clearly distinguishes general academic teaching from their uploaded files.
3. NEVER fabricate document citations or page numbers.`;
  }

  const finalResult: TutorRagContextResult = {
    pedagogicalAction: analysis.pedagogicalAction,
    useStructuredLessonPlan: analysis.useStructuredLessonPlan,
    retrievalQuery: analysis.retrievalQuery,
    topicKeywords: analysis.topicKeywords,
    searchedDocumentsCount: allDocs.length,
    searchedDocumentTitles: searchedTitles,
    totalRawDocumentChars,
    injectedPassageChars: runningChars,
    requestedTopK: targetLimit,
    sources,
    knowledgeSource,
    tutorPromptDirective: analysis.tutorPromptDirective,
    documentContextPromptBlock,
    hasAttachedDocument,
  };

  setBoundedCacheEntry(tutorRagCache, cacheKey, {
    result: finalResult,
    expiresAt: Date.now() + 30_000,
  });

  return finalResult;
}
