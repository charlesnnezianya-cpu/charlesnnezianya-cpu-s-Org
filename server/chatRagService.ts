import crypto from 'crypto';
import {
  extractBearerToken,
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

export { extractBearerToken, resolveAuthorizedUserFromBearer };

export type ChatIntent =
  | 'document_specific'
  | 'follow_up'
  | 'general_academic'
  | 'ambiguous';

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
]);

const chatRagCache = new Map<string, { result: ChatRagContextResult; expiresAt: number }>();

function extractTopicKeywords(text: string, max = 10): string[] {
  const raw = extractKeywords(text, 24);
  const filtered = raw.filter((kw) => !QUERY_FILLER_WORDS.has(kw));
  return filtered.slice(0, max);
}

export interface QuestionAnalysis {
  intent: ChatIntent;
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
    /\b(that|this|it|they|them|those|these|previous|earlier|above|step|next|more|simpler|shorter|detail|elaborate|expand|clarify|why does|how does that|what happens next|what about|again|analogy|summarize your)\b/i.test(
      lower
    );

  const isFollowUp =
    params.history.length > 0 &&
    (hasPronounOrFollowUpCue || currentTopicKeywords.length <= 1);

  const needsMultiPassageSynthesis =
    /\b(compare|contrast|difference|differences|relationship|summarize|overview|all|stages|steps|phases|both|between|connect|across|causes and effects|overall)\b/i.test(
      lower
    );

  // Enrich follow-up queries with recent conversation topic keywords so retrieval stays anchored
  let enrichedKeywords = [...currentTopicKeywords];
  let retrievalQuery = cleanMessage;

  if (isFollowUp && params.history.length > 0) {
    const recentUsers = params.history
      .filter((h) => h.role === 'user')
      .slice(-2)
      .map((h) => h.content);
    const recentAssistant = params.history
      .filter((h) => h.role === 'assistant')
      .slice(-1)
      .map((h) => h.content.slice(0, 600));

    const historyKeywords = [
      ...extractTopicKeywords(recentUsers.join(' '), 6),
      ...extractTopicKeywords(recentAssistant.join(' '), 4),
    ];

    const merged = Array.from(new Set([...currentTopicKeywords, ...historyKeywords])).slice(0, 12);
    enrichedKeywords = merged;

    if (currentTopicKeywords.length < 3 && merged.length > 0) {
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

  let intent: ChatIntent = 'general_academic';
  if (needsClarification) {
    intent = 'ambiguous';
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
    return result.score >= 2.0 && (keywordHitCount >= 1 || matchedTopicTerms.length >= 2 || result.score >= 2.8);
  }

  if (topicKeywords.length <= 4) {
    if (matchedTopicTerms.length >= 2 && result.score >= 2.4) return true;
    if (keywordHitCount >= 1 && matchedTopicTerms.length / topicKeywords.length >= 0.33 && result.score >= 2.8) {
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
 * Main RAG orchestrator for the Academic AI Chatbot (Layer B Hybrid AI Learning Engine).
 * Combines shared Document Intelligence Engine retrieval + structured highlights + caching
 * with Groq/Gemini academic reasoning.
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

  const candidatePoolSize = 6;
  let candidates = retrieveRelevantPassages(
    analysis.retrievalQuery,
    allChunks,
    effectiveUserId,
    attachedDocId,
    candidatePoolSize
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
      candidatePoolSize
    ).filter((r) => isPassageRelevant(r, analysis.topicKeywords));
  }

  // If a document is explicitly attached and the user asked a generic overview/summary question
  // whose verbs were all filtered as query filler (no off-topic keywords), anchor on the document's opening passages.
  if (
    candidates.length === 0 &&
    attachedDocId &&
    analysis.topicKeywords.length === 0 &&
    !analysis.needsClarification
  ) {
    candidates = allChunks
      .filter((c) => c.documentId === attachedDocId)
      .slice(0, 3)
      .map((chunk) => ({
        chunk,
        score: 1.5,
        matchedKeywords: ['overview'],
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

  const MAX_TOTAL_PASSAGE_CHARS = 5600;
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
        return `[Passage ${idx + 1}] Document: "${title}" | Reference: ${pageLabel} (Section #${
          res.chunk.chunkPosition + 1
        })\n${res.chunk.originalText}`;
      })
      .join('\n\n---\n\n');

    // Enrich compactly with extracted definitions/formulas only from the matched documents when budget allows
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

    documentContextPromptBlock = `\n\nRETRIEVED STUDY MATERIAL PASSAGES (${selectedResults.length} relevant excerpt${
      selectedResults.length === 1 ? '' : 's'
    } from ${searchedTitles.length} searchable material${searchedTitles.length === 1 ? '' : 's'}):
${passageBlocks}${highlightBlock}

STRICT GROUNDING & CITATION RULES FOR THESE PASSAGES:
1. Prioritize the retrieved passages above when answering the student's question.
2. Cite the exact Document Title and Page reference inline whenever referencing material facts (for example: *(Source: "${
      sources[0].documentTitle
    }", ${sources[0].pageNumber !== null ? `Page ${sources[0].pageNumber}` : 'Excerpt'})*).
3. NEVER invent a page number, section, statistic, or quote that is not explicitly present in the passages above.
4. INSUFFICIENT / PARTIAL DOCUMENT INFO: If the retrieved passages relate to the topic but do NOT contain enough information to answer every detail of the question, explicitly state what your study material covers AND honestly tell the student what detail is not included in the uploaded material. If helpful, you may supplement the missing academic explanation under a clearly labeled **General Academic Knowledge** note so the student always knows what came from their document versus general knowledge.`;
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
