import crypto from 'crypto';
import {
  buildStructuredRagIntelligence,
  extractBearerToken,
  extractDocumentQueryExpansionTerms,
  extractKeywords,
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

export { extractBearerToken, resolveAuthorizedUserFromBearer };

export type ChatIntent =
  | 'document_specific'
  | 'follow_up'
  | 'general_academic'
  | 'ambiguous';

export type QuestionType =
  | 'definition'
  | 'classification'
  | 'comparison'
  | 'process'
  | 'overview'
  | 'explanation'
  | 'clarification';

export type KnowledgeSourceMode =
  | 'study_materials'
  | 'general_knowledge'
  | 'hybrid';

export interface ChatDocumentInput {
  id?: string | null;
  title: string;
  type?: string;
  content: string;
}

export interface ChatStudyMaterialInput {
  id: string;
  userId?: string;
  title: string;
  materialType?: string;
  extractedText: string;
}

export interface ChatRetrievedSource {
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  chunkPosition: number;
  matchedKeywords: string[];
  excerpt: string;
  score: number;
}

export interface ChatRagContextResult {
  intent: ChatIntent;
  questionType: QuestionType;
  topicSummary: string;
  retrievalQuery: string;
  searchedDocumentsCount: number;
  searchedDocumentTitles: string[];
  totalRawDocumentChars: number;
  injectedPassageChars: number;
  requestedTopK: number;
  sources: ChatRetrievedSource[];
  knowledgeSource: KnowledgeSourceMode;
  needsClarification: boolean;
  documentContextPromptBlock: string;
  hasAttachedDocument: boolean;
}

// Conversational / question verbs that should not dilute topic-specific retrieval gating
const QUERY_FILLER_WORDS = new Set([
  'explain', 'describe', 'define', 'compare', 'contrast', 'summarize', 'summary',
  'tell', 'show', 'help', 'please', 'understand', 'example', 'examples', 'detail',
  'details', 'detailed', 'simpler', 'simple', 'shorter', 'short', 'question',
  'answer', 'according', 'notes', 'chapter', 'section', 'document', 'material',
  'materials', 'uploaded', 'attached', 'file', 'files', 'slides', 'lecture',
  'reading', 'make', 'version', 'previous', 'earlier', 'above', 'mean', 'means',
  'meaning', 'difference', 'differences', 'between', 'what', 'which', 'whose',
  'give', 'list', 'write', 'step', 'steps', 'again', 'further', 'clarify',
  'elaborate', 're-explain', 'beginner-friendly', 'terms', 'analogy', 'concise',
  'longer', 'key', 'points', 'point', 'discuss', 'mention', 'stated', 'says',
  'say', 'know', 'anything', 'something', 'everything', 'nothing', 'exact',
  'exactly', 'specifically', 'specific', 'does', 'do', 'did',
  'briefly', 'overview', 'recap', 'highlights', 'takeaways',
  'type', 'types', 'category', 'categories', 'kind', 'kinds', 'form', 'forms',
  'characteristic', 'characteristics', 'feature', 'features', 'property', 'properties',
  'first', 'second', 'third', 'fourth', 'last', 'one', 'ones',
]);

const chatRagCache = new Map<string, { result: ChatRagContextResult; expiresAt: number }>();

function extractTopicKeywords(text: string, max = 10): string[] {
  const raw = extractKeywords(text, 24);
  const filtered = raw.filter((kw) => !QUERY_FILLER_WORDS.has(kw));
  return filtered.slice(0, max);
}

/**
 * Resolves ordinal or listed-item references (e.g., "explain the second type") against
 * headings, numbered list items, or bold concepts in the immediately preceding assistant message.
 */
function extractOrdinalReferencedEntity(
  messageLower: string,
  lastAssistantContent: string
): string | null {
  if (!lastAssistantContent) return null;

  const ordinalMap: Array<[RegExp, number]> = [
    [/\b(?:first|1st)\b/, 0],
    [/\b(?:second|2nd)\b/, 1],
    [/\b(?:third|3rd)\b/, 2],
    [/\b(?:fourth|4th)\b/, 3],
    [/\b(?:fifth|5th)\b/, 4],
  ];

  let targetIdx: number | null = null;
  let isLast = false;
  for (const [pat, idx] of ordinalMap) {
    if (pat.test(messageLower)) {
      targetIdx = idx;
      break;
    }
  }
  if (targetIdx === null && /\b(?:last one|final type|last type|final one)\b/.test(messageLower)) {
    isLast = true;
  }
  if (targetIdx === null && !isLast) return null;

  const listedItems: string[] = [];
  const lines = lastAssistantContent.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const numOrHeading =
      line.match(/^(?:#{2,4}\s*)?(?:\d+[.)]|[-*])\s+\*{0,2}([^:*\n(]{3,60})\*{0,2}(?:\s*[:—-]|$)/) ||
      line.match(/^#{2,4}\s+\d+[.)]\s+([^(\n]{3,60})$/);
    if (numOrHeading) {
      const candidate = numOrHeading[1].trim();
      if (!/^(direct answer|explanation|key details|examples?|page references?|summary|overview)$/i.test(candidate)) {
        listedItems.push(candidate);
      }
    }
  }

  if (listedItems.length === 0) return null;
  if (isLast) return listedItems[listedItems.length - 1];
  if (targetIdx !== null && targetIdx < listedItems.length) {
    return listedItems[targetIdx];
  }
  return null;
}

export function classifyQuestionType(params: {
  cleanMessage: string;
  needsClarification: boolean;
}): QuestionType {
  if (params.needsClarification) return 'clarification';
  const lower = params.cleanMessage.toLowerCase();

  if (/\b(compare|contrast|difference|differences|versus|vs\.?|distinguish|similarities|differ)\b/i.test(lower)) {
    return 'comparison';
  }
  if (/\b(types?|categories|kinds|forms|classes|classification|classified into|subtypes?)\b/i.test(lower)) {
    return 'classification';
  }
  if (/\b(steps?|stages?|phases?|process|mechanism|pathway|procedure|sequence|how does .+ work|how is .+ made|how are .+ formed)\b/i.test(lower)) {
    return 'process';
  }
  if (/\b(summarize|summary|overview|main ideas?|central message|key takeaways|what is this document about|what does this (?:document|pdf|file) cover|topics? covered|recap)\b/i.test(lower)) {
    return 'overview';
  }
  if (/^(?:what (?:is|are)|define|definition of|meaning of)\b/i.test(lower) || /\b(is defined as|meaning of|what does .+ mean)\b/i.test(lower)) {
    return 'definition';
  }
  return 'explanation';
}

export interface QuestionAnalysis {
  intent: ChatIntent;
  questionType: QuestionType;
  topicKeywords: string[];
  topicSummary: string;
  retrievalQuery: string;
  needsMultiPassageSynthesis: boolean;
  needsClarification: boolean;
}

export function analyzeQuestionIntentAndTopic(params: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  hasAttachedDocument: boolean;
  hasImage: boolean;
  explanationStyle?: 'default' | 'shorter' | 'simpler' | 'detailed';
}): QuestionAnalysis {
  const cleanMessage = normalizeText(params.message);
  const lower = cleanMessage.toLowerCase();

  const currentTopicKeywords = extractTopicKeywords(cleanMessage, 10);
  const hasDocCue =
    /\b(pdf|document|doc|notes?|slides?|handout|chapter|pages?|uploaded|attached|file|material|reading|lecture|syllabus|according to|in my|from the text|what does it say|this text)\b/i.test(
      lower
    );

  const hasPronounOrFollowUpCue =
    params.explanationStyle !== 'default' ||
    /\b(that|this|it|they|them|those|these|previous|earlier|above|step|next|more|simpler|shorter|detail|elaborate|expand|clarify|why does|how does that|what happens next|what about|again|analogy|summarize your|first one|second one|third one|last one|its characteristics|their examples)\b/i.test(
      lower
    );

  const isFollowUp =
    params.history.length > 0 &&
    (hasPronounOrFollowUpCue || currentTopicKeywords.length <= 1);

  const needsMultiPassageSynthesis =
    /\b(compare|contrast|difference|differences|relationship|relate|connect|summarize|overview|all|types?|categories|kinds|classes|classification|stages|steps|phases|both|between|across|causes and effects|overall|characteristics|properties|examples)\b/i.test(
      lower
    );

  // Enrich follow-up queries with recent conversation topic keywords + ordinal coreference resolution
  let enrichedKeywords = [...currentTopicKeywords];
  let retrievalQuery = cleanMessage;

  if (isFollowUp && params.history.length > 0) {
    const recentUsers = params.history
      .filter((h) => h.role === 'user')
      .slice(-2)
      .map((h) => h.content);
    const lastAssistant =
      [...params.history].reverse().find((h) => h.role === 'assistant')?.content || '';

    const ordinalEntity = extractOrdinalReferencedEntity(lower, lastAssistant);
    const ordinalKeywords = ordinalEntity ? extractTopicKeywords(ordinalEntity, 5) : [];

    const historyKeywords = [
      ...ordinalKeywords,
      ...extractTopicKeywords(recentUsers.join(' '), 6),
      ...extractTopicKeywords(lastAssistant.slice(0, 700), 4),
    ];

    const merged = Array.from(new Set([...currentTopicKeywords, ...historyKeywords])).slice(0, 12);
    enrichedKeywords = merged;

    if (ordinalEntity) {
      retrievalQuery = `${cleanMessage} ${ordinalEntity} ${merged.join(' ')}`.trim();
    } else if (currentTopicKeywords.length < 3 && merged.length > 0) {
      retrievalQuery = `${cleanMessage} ${merged.join(' ')}`.trim();
    }
  }

  const wordCount = cleanMessage ? cleanMessage.split(/\s+/).length : 0;
  const needsClarification =
    !params.hasImage &&
    wordCount > 0 &&
    wordCount <= 3 &&
    enrichedKeywords.length === 0 &&
    params.history.length === 0 &&
    !hasDocCue;

  const questionType = classifyQuestionType({ cleanMessage, needsClarification });

  let intent: ChatIntent = 'general_academic';
  if (needsClarification) {
    intent = 'ambiguous';
  } else if (isFollowUp && currentTopicKeywords.length === 0 && !hasDocCue) {
    intent = 'follow_up';
  } else if (hasDocCue || (params.hasAttachedDocument && currentTopicKeywords.length > 0)) {
    intent = 'document_specific';
  } else if (isFollowUp) {
    intent = 'follow_up';
  }

  const topicSummary =
    enrichedKeywords.length > 0
      ? enrichedKeywords.slice(0, 5).join(', ')
      : cleanMessage.slice(0, 60);

  return {
    intent,
    questionType,
    topicKeywords: enrichedKeywords,
    topicSummary,
    retrievalQuery,
    needsMultiPassageSynthesis,
    needsClarification,
  };
}

function isPassageRelevant(
  result: RetrievalResult,
  topicKeywords: string[]
): boolean {
  const matchedTopicTerms = result.matchedKeywords.filter(
    (kw) => !QUERY_FILLER_WORDS.has(kw)
  );
  if (matchedTopicTerms.length === 0) {
    return false;
  }

  const keywordHitCount = matchedTopicTerms.filter((t) =>
    result.chunk.keywords.includes(t)
  ).length;

  const headingLower = (result.chunk.sectionHeading || '').toLowerCase();
  const hasHeadingMatch =
    Boolean(headingLower) &&
    topicKeywords.some((kw) => headingLower.includes(kw));

  const textLower = result.chunk.originalText.toLowerCase();
  let hasTopicBigram = false;
  for (let i = 0; i < topicKeywords.length - 1; i++) {
    const bigram = `${topicKeywords[i]} ${topicKeywords[i + 1]}`;
    if (textLower.includes(bigram) || headingLower.includes(bigram)) {
      hasTopicBigram = true;
      break;
    }
  }

  if (topicKeywords.length <= 2) {
    return (
      result.score >= 2.0 &&
      (keywordHitCount >= 1 || hasHeadingMatch || matchedTopicTerms.length >= 2 || result.score >= 2.8)
    );
  }

  if (topicKeywords.length <= 4) {
    if (matchedTopicTerms.length >= 2 && result.score >= 2.4) return true;
    if (
      keywordHitCount >= 1 &&
      matchedTopicTerms.length / topicKeywords.length >= 0.33 &&
      (result.score >= 2.8 || (hasHeadingMatch && result.score >= 2.5))
    ) {
      return true;
    }
    return false;
  }

  const coverage = matchedTopicTerms.length / topicKeywords.length;
  if (matchedTopicTerms.length >= 3 && result.score >= 2.8) {
    return true;
  }
  if (hasTopicBigram && keywordHitCount >= 1 && result.score >= 3.2) {
    return true;
  }
  if (coverage >= 0.4 && result.score >= 2.8) {
    return true;
  }
  return false;
}

/**
 * Main RAG orchestrator for the Document Assistant / AI Academic Chatbot.
 * Combines hybrid section-aware retrieval, document intelligence structure (classifications,
 * definitions, section outlines, relationships), and follow-up coreference resolution.
 */
export async function buildChatRagContext(params: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  documentContext?: ChatDocumentInput | null;
  studyMaterials?: ChatStudyMaterialInput[] | null;
  attachedDocumentId?: string | null;
  userId?: string | null;
  authHeader?: string | string[];
  hasImage: boolean;
  explanationStyle?: 'default' | 'shorter' | 'simpler' | 'detailed';
}): Promise<ChatRagContextResult> {
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

  // 1. Load authenticated user's uploaded study_materials from Supabase under RLS when available
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

  // 2. Include caller-supplied studyMaterials only when authenticated or in offline preview mode (no Supabase)
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

  // 3. Register explicitly attached documentContext
  let attachedDocId: string | undefined;

  if (hasAttachedDocument && params.documentContext) {
    attachedDocId =
      (typeof params.documentContext.id === 'string' && params.documentContext.id.trim()) ||
      (typeof params.attachedDocumentId === 'string' && params.attachedDocumentId.trim()) ||
      `attached-${crypto
        .createHash('sha256')
        .update(params.documentContext.title || 'doc')
        .digest('hex')
        .slice(0, 12)}`;

    docsMap.set(attachedDocId, {
      id: attachedDocId,
      userId: effectiveUserId,
      title: (params.documentContext.title || 'Attached Study Material').trim(),
      type: params.documentContext.type || 'Attached Study Material',
      extractedText: params.documentContext.content,
    });
  }

  const allDocs = Array.from(docsMap.values());
  const docDigest = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        uid: effectiveUserId,
        msg: normalizeText(params.message),
        hist: params.history.slice(-2),
        attachedDocId: attachedDocId || '',
        hasImg: params.hasImage,
        style: params.explanationStyle || 'default',
        docs: allDocs.map((d) => `${d.id}:${d.extractedText.length}:${d.extractedText.slice(0, 64)}`),
      })
    )
    .digest('hex');

  const cachedRag = chatRagCache.get(docDigest);
  if (cachedRag && cachedRag.expiresAt > Date.now()) {
    return cachedRag.result;
  }

  const analysis = analyzeQuestionIntentAndTopic({
    message: params.message,
    history: params.history,
    hasAttachedDocument,
    hasImage: params.hasImage,
    explanationStyle: params.explanationStyle,
  });

  if (allDocs.length === 0) {
    const promptBlock = analysis.needsClarification
      ? '\n\nCLARIFICATION STATUS:\nThe student query is very short or underspecified and no study document or image is attached. Ask a concise, friendly clarifying question (or offer 2 brief interpretations and ask which one they mean).'
      : '\n\nKNOWLEDGE SOURCE STATUS:\nNo uploaded study document is currently available for this query. Answer accurately using General Academic Knowledge. Do NOT claim or imply that you read any uploaded file or fabricate document citations.';

    const emptyResult: ChatRagContextResult = {
      intent: analysis.intent,
      questionType: analysis.questionType,
      topicSummary: analysis.topicSummary,
      retrievalQuery: analysis.retrievalQuery,
      searchedDocumentsCount: 0,
      searchedDocumentTitles: [],
      totalRawDocumentChars: 0,
      injectedPassageChars: 0,
      requestedTopK: 0,
      sources: [],
      knowledgeSource: 'general_knowledge',
      needsClarification: analysis.needsClarification,
      documentContextPromptBlock: promptBlock,
      hasAttachedDocument,
    };
    setBoundedCacheEntry(chatRagCache, docDigest, {
      result: emptyResult,
      expiresAt: Date.now() + 30_000,
    });
    return emptyResult;
  }

  // Index documents into chunks via shared Document Intelligence Engine cache
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

  // Domain/structure-aware query expansion ONLY from terms overlapping the query
  const expansionSourceDocs = attachedDocId && docById.has(attachedDocId)
    ? [docById.get(attachedDocId)!]
    : allDocs;
  const expandedTerms =
    analysis.topicKeywords.length > 0
      ? extractDocumentQueryExpansionTerms(expansionSourceDocs, analysis.retrievalQuery, 10)
      : [];

  const candidatePoolSize = 10;
  let candidates = retrieveRelevantPassages(
    analysis.retrievalQuery,
    allChunks,
    effectiveUserId,
    attachedDocId,
    candidatePoolSize,
    { expandedTerms }
  ).filter((r) => isPassageRelevant(r, analysis.topicKeywords));

  if (
    candidates.length === 0 &&
    attachedDocId &&
    allDocs.length > 1 &&
    analysis.intent === 'document_specific'
  ) {
    candidates = retrieveRelevantPassages(
      analysis.retrievalQuery,
      allChunks,
      effectiveUserId,
      undefined,
      candidatePoolSize,
      { expandedTerms }
    ).filter((r) => isPassageRelevant(r, analysis.topicKeywords));
  }

  // If a document is explicitly attached and the user asked an overview/summary question
  // (e.g. "summarize this document" or "explain the main topics"), spread coverage across
  // distinct sections/pages of the attached document rather than stopping at page 1.
  if (
    candidates.length === 0 &&
    attachedDocId &&
    (analysis.questionType === 'overview' || analysis.topicKeywords.length === 0) &&
    !analysis.needsClarification
  ) {
    const docChunks = allChunks.filter((c) => c.documentId === attachedDocId);
    const sampled: DocumentChunk[] = [];
    if (docChunks.length <= 5) {
      sampled.push(...docChunks);
    } else {
      const step = Math.max(1, Math.floor((docChunks.length - 1) / 4));
      for (let i = 0; i < docChunks.length && sampled.length < 5; i += step) {
        sampled.push(docChunks[i]);
      }
    }
    candidates = sampled.map((chunk, idx) => ({
      chunk,
      score: Number((2.0 - idx * 0.1).toFixed(2)),
      matchedKeywords: ['overview'],
    }));
  }

  const defaultLimit = 3;
  let targetLimit = defaultLimit;
  const wantsBroadCoverage =
    analysis.needsMultiPassageSynthesis ||
    analysis.questionType === 'classification' ||
    analysis.questionType === 'comparison' ||
    analysis.questionType === 'process' ||
    analysis.questionType === 'overview';

  if (wantsBroadCoverage && candidates.length > defaultLimit) {
    const topScore = candidates[0].score;
    const maxAllowed = Math.min(6, candidates.length);
    for (let idx = defaultLimit; idx < maxAllowed; idx++) {
      if (candidates[idx].score >= topScore * 0.36) {
        targetLimit = idx + 1;
      } else {
        break;
      }
    }
  }

  const MAX_TOTAL_PASSAGE_CHARS = wantsBroadCoverage ? 6800 : 5600;
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

  const sources: ChatRetrievedSource[] = selectedResults.map((res) => ({
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
  let knowledgeSource: KnowledgeSourceMode = 'general_knowledge';

  if (selectedResults.length > 0) {
    knowledgeSource = 'study_materials';
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
        const headingLabel = res.chunk.sectionHeading ? ` | Topic: ${res.chunk.sectionHeading}` : '';
        return `[Passage ${idx + 1}] Document: "${title}" | Reference: ${pageLabel}${headingLabel} (Excerpt #${
          res.chunk.chunkPosition + 1
        })\n${res.chunk.originalText}`;
      })
      .join('\n\n---\n\n');

    const matchedDocIds = Array.from(new Set(selectedResults.map((r) => r.chunk.documentId)));
    const matchedDocs = matchedDocIds
      .map((id) => docById.get(id))
      .filter((d): d is IndexedDocumentRecord => Boolean(d));

    const intelligenceBundle = buildStructuredRagIntelligence(
      matchedDocs,
      analysis.retrievalQuery,
      2000
    );

    const exampleTitle = sources[0].documentTitle;
    const examplePage = sources[0].pageNumber !== null ? `Page ${sources[0].pageNumber}` : 'Excerpt';

    documentContextPromptBlock = `\n\nRETRIEVED STUDY MATERIAL PASSAGES (${selectedResults.length} relevant excerpt${
      selectedResults.length === 1 ? '' : 's'
    } across ${new Set(selectedResults.map((r) => r.chunk.pageNumber).filter((p) => p !== null)).size || 1} page(s) from ${searchedTitles.length} searchable material${searchedTitles.length === 1 ? '' : 's'}):${intelligenceBundle.outlineBlock}

${passageBlocks}${intelligenceBundle.structuredKnowledgeBlock}

STRICT GROUNDING & CITATION RULES FOR THESE PASSAGES:
1. Base your answer directly on the retrieved passages and extracted document concepts above, synthesizing all relevant points across pages cleanly.
2. Cite the exact Document Title and Page reference inline cleanly where facts originate (for example: (${exampleTitle}, ${examplePage}) or (${examplePage}) when discussing a single active document). Keep citations natural and understated.
3. NEVER invent a page number, section, example, statistic, or document claim not supported by the passages above.
4. INSUFFICIENT / PARTIAL DOCUMENT INFO: If the retrieved passages mention a concept or relate to the topic but do NOT explain a specific detail requested by the student, explicitly state what your study material covers AND honestly tell the student what detail is missing or only briefly mentioned in the uploaded material. If helpful, supplement under a separate clearly labeled **General Academic Knowledge** section so document facts and general knowledge stay strictly separated.`;
  } else if (analysis.needsClarification) {
    documentContextPromptBlock = `\n\nCLARIFICATION STATUS:
The student query is ambiguous or underspecified ("${params.message.trim()}"). Searched ${
      searchedTitles.length
    } study material(s) (${searchedTitles
      .map((t) => `"${t}"`)
      .join(', ')}), and no specific topic matched. Ask a brief, helpful clarifying question before answering in depth.`;
  } else {
    knowledgeSource = 'general_knowledge';
    const searchedList = searchedTitles.map((t) => `"${t}"`).join(', ');
    documentContextPromptBlock = `\n\nKNOWLEDGE SOURCE STATUS — NO RELEVANT DOCUMENT PASSAGES FOUND:
Searched the student's uploaded study material(s) (${searchedList}), and none contained relevant passages matching this query.
RULES FOR ANSWERING:
1. If the student asked specifically what their uploaded document says about this topic, honestly inform them that the uploaded study material(s) do not appear to cover this topic.
2. Answer clearly and thoroughly using **General Academic Knowledge**.
3. Explicitly distinguish in your response (e.g., via a brief opening or closing note such as *> **Source Note:** Answered using General Academic Knowledge (not found in your uploaded study materials).*) so the student knows this answer is not drawn from their uploaded files.
4. NEVER claim or fabricate page citations from any uploaded document.`;
  }

  const finalResult: ChatRagContextResult = {
    intent: analysis.intent,
    questionType: analysis.questionType,
    topicSummary: analysis.topicSummary,
    retrievalQuery: analysis.retrievalQuery,
    searchedDocumentsCount: allDocs.length,
    searchedDocumentTitles: searchedTitles,
    totalRawDocumentChars,
    injectedPassageChars: runningChars,
    requestedTopK: targetLimit,
    sources,
    knowledgeSource,
    needsClarification: analysis.needsClarification,
    documentContextPromptBlock,
    hasAttachedDocument,
  };

  setBoundedCacheEntry(chatRagCache, docDigest, {
    result: finalResult,
    expiresAt: Date.now() + 30_000,
  });

  return finalResult;
}

