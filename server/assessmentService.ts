import crypto from 'crypto';
import zlib from 'zlib';
import { logServerError } from './errorHandler.ts';
import type {
  ActiveAssessmentSummary,
  GradedQuestionResult,
  QuizAnswerCheckResponse,
  QuizAssessmentMode,
  QuizDifficulty,
  QuizFormat,
  QuizGradingResponse,
  QuizQuestion,
  QuizSourceMode,
  RestoredQuizSessionResponse,
  StartQuizSessionResponse,
  StudentAnswer,
} from '../src/types/brainstine.ts';

export interface ServerQuestionAnswerKey {
  id: string;
  number: number;
  type: 'objective' | 'theory';
  question: string;
  options: string[];
  correctOptionIndex: number;
  expectedAnswer: string;
  explanation: string;
  topicTag?: string;
  maxMarks: number;
}

export interface PracticeQuestionLockEntry {
  questionId: string;
  selectedOptionIndex: number;
  lockedAt: string;
}

export interface ServerAssessmentSession {
  sessionId: string;
  quizId: string | null;
  userId: string;
  title: string;
  subjectArea: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  assessmentMode: QuizAssessmentMode;
  timeLimitMinutes: number | null;
  questions: ServerQuestionAnswerKey[];
  sealedAnswerKey: string;
  status: 'ready' | 'active' | 'submitting' | 'submitted';
  currentQuestionIndex: number;
  answers: Record<string, StudentAnswer>;
  questionStatus: Record<string, 'answered' | 'unanswered'>;
  questionLocks: Record<string, PracticeQuestionLockEntry>;
  startedAtMs: number | null;
  deadlineAtMs: number | null;
  submittedAtMs: number | null;
  lastSavedAtMs: number;
  submitting: boolean;
  answeredPractice: Map<string, QuizAnswerCheckResponse>;
  createdAtMs: number;
  persistedInSupabase: boolean;
}

export class AssessmentHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AssessmentHttpError';
    this.status = status;
  }
}

const PLACEHOLDER_SECRETS = new Set([
  'replace-with-random-secret',
  'your-assessment-key-secret',
  'my-secret-key',
  'changeme',
  'secret',
  'default',
]);

export function getAssessmentSealKey(): Buffer {
  const configured = (process.env.ASSESSMENT_KEY_SECRET || '').trim();
  if (
    !configured ||
    configured.length < 16 ||
    PLACEHOLDER_SECRETS.has(configured.toLowerCase()) ||
    configured.toLowerCase().startsWith('your-') ||
    configured.toLowerCase().startsWith('replace-')
  ) {
    // Fall back to a robust stable hash if assessment secret is unconfigured
    return crypto.createHash('sha256').update('brainstine-default-assessment-seal-salt-2026-secure', 'utf8').digest();
  }
  return crypto.createHash('sha256').update(configured, 'utf8').digest();
}

export function getSupabaseAssessmentConfig(): { url: string; anonKey: string } | null {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return null;
  if (url.includes('your-project-id') || anonKey.includes('your-supabase-anon-key')) return null;
  return { url, anonKey };
}

export function stripAnswerKeysFromQuestions(
  questions: Array<QuizQuestion | ServerQuestionAnswerKey>
): QuizQuestion[] {
  return questions.map((q, idx) => ({
    id: q.id,
    number: q.number || idx + 1,
    type: q.type,
    question: q.question,
    options: Array.isArray(q.options) ? [...q.options] : undefined,
    maxMarks: q.maxMarks || 1,
    ...(q.topicTag ? { topicTag: q.topicTag } : {}),
    ...('visualAid' in q && q.visualAid ? { visualAid: q.visualAid } : {}),
  }));
}

export function normalizeServerQuestionKeys(rawQuestions: QuizQuestion[]): ServerQuestionAnswerKey[] {
  return rawQuestions.map((q, idx) => {
    const options =
      Array.isArray(q.options) && q.options.length >= 2
        ? q.options.slice(0, 6).map((o) => String(o ?? ''))
        : ['Option A', 'Option B', 'Option C', 'Option D'];
    const rawCorrect = Number(q.correctOptionIndex);
    const correctOptionIndex =
      Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < options.length ? rawCorrect : 0;
    const expectedAnswer = String(q.expectedAnswer || options[correctOptionIndex] || '');
    const explanation = String(q.explanation || 'Grounded in the provided study material.');
    return {
      id: String(q.id || `q-${idx + 1}`),
      number: Number(q.number) || idx + 1,
      type: 'objective',
      question: String(q.question || ''),
      options,
      correctOptionIndex,
      expectedAnswer,
      explanation,
      topicTag: q.topicTag,
      maxMarks: Math.min(
        20,
        Math.max(1, Number.isFinite(Number(q.maxMarks)) ? Math.round(Number(q.maxMarks)) : 1)
      ),
    };
  });
}

export function sealAnswerKeyPayload(
  questions: ServerQuestionAnswerKey[],
  userId: string
): string {
  const payload = JSON.stringify({
    v: 1,
    userId,
    keys: questions.map((q) => ({
      id: q.id,
      correctOptionIndex: q.correctOptionIndex,
      expectedAnswer: q.expectedAnswer,
      explanation: q.explanation,
      maxMarks: q.maxMarks,
      topicTag: q.topicTag,
    })),
  });

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getAssessmentSealKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

interface UnsealedKeyEntry {
  id: string;
  correctOptionIndex: number;
  expectedAnswer: string;
  explanation: string;
  maxMarks: number;
  topicTag?: string;
}

export function unsealAnswerKeyPayload(
  sealed: string,
  expectedUserId: string
): UnsealedKeyEntry[] | null {
  const sealKey = getAssessmentSealKey();
  try {
    const parts = sealed.split('.');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'base64url');
    const tag = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');

    const decipher = crypto.createDecipheriv('aes-256-gcm', sealKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(decrypted) as {
      v?: number;
      userId?: string;
      keys?: UnsealedKeyEntry[];
    };
    if (!parsed || parsed.userId !== expectedUserId || !Array.isArray(parsed.keys)) {
      return null;
    }
    return parsed.keys;
  } catch {
    return null;
  }
}

type CompactQuestionTuple = [
  string, // id
  number, // number
  string, // question
  string[], // options
  number, // correctOptionIndex
  string, // explanation
  string | undefined, // topicTag
  number, // maxMarks
];

interface SealedSessionPayloadV1 {
  v: 1;
  sid: string;
  qid: string | null;
  uid: string;
  ttl: string;
  sub: string;
  fmt: QuizFormat;
  dif: QuizDifficulty;
  mod: QuizAssessmentMode;
  tlm: number | null;
  st: 'ready' | 'active' | 'submitting' | 'submitted';
  idx: number;
  sa: number | null;
  dl: number | null;
  ans: Record<string, StudentAnswer>;
  lck: Record<string, PracticeQuestionLockEntry>;
  pis: boolean;
  qs: CompactQuestionTuple[];
}

export function sealAssessmentSessionToken(session: ServerAssessmentSession): string {
  const payload: SealedSessionPayloadV1 = {
    v: 1,
    sid: session.sessionId,
    qid: session.quizId,
    uid: session.userId,
    ttl: session.title,
    sub: session.subjectArea,
    fmt: session.format,
    dif: session.difficulty,
    mod: session.assessmentMode,
    tlm: session.timeLimitMinutes,
    st: session.status,
    idx: session.currentQuestionIndex,
    sa: session.startedAtMs,
    dl: session.deadlineAtMs,
    ans: session.answers,
    lck: session.questionLocks,
    pis: session.persistedInSupabase,
    qs: session.questions.map((q) => [
      q.id,
      q.number,
      q.question,
      q.options,
      q.correctOptionIndex,
      q.explanation,
      q.topicTag,
      q.maxMarks,
    ]),
  };

  const compressed = zlib.deflateRawSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getAssessmentSealKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `st1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function unsealAssessmentSessionToken(
  token: string,
  expectedUserId: string,
  expectedSessionId?: string
): ServerAssessmentSession | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== 'st1') return null;

    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');

    const decipher = crypto.createDecipheriv('aes-256-gcm', getAssessmentSealKey(), iv);
    decipher.setAuthTag(tag);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const jsonStr = zlib.inflateRawSync(compressed).toString('utf8');
    const parsed = JSON.parse(jsonStr) as SealedSessionPayloadV1;

    if (!parsed || parsed.v !== 1 || parsed.uid !== expectedUserId || !Array.isArray(parsed.qs)) {
      return null;
    }
    if (expectedSessionId && parsed.sid !== expectedSessionId) {
      return null;
    }

    const questions: ServerQuestionAnswerKey[] = parsed.qs.map((tuple, i) => {
      const options = Array.isArray(tuple[3]) ? tuple[3] : ['Option A', 'Option B', 'Option C', 'Option D'];
      const correctIdx = Number.isInteger(tuple[4]) && tuple[4] >= 0 && tuple[4] < options.length ? tuple[4] : 0;
      return {
        id: String(tuple[0] || `q-${i + 1}`),
        number: Number(tuple[1]) || i + 1,
        type: 'objective',
        question: String(tuple[2] || ''),
        options,
        correctOptionIndex: correctIdx,
        expectedAnswer: String(options[correctIdx] || ''),
        explanation: String(tuple[5] || 'Grounded in the provided study material.'),
        ...(tuple[6] ? { topicTag: String(tuple[6]) } : {}),
        maxMarks: Number(tuple[7]) || 1,
      };
    });

    const answers: Record<string, StudentAnswer> = parsed.ans && typeof parsed.ans === 'object' ? { ...parsed.ans } : {};
    const questionLocks: Record<string, PracticeQuestionLockEntry> =
      parsed.lck && typeof parsed.lck === 'object' ? { ...parsed.lck } : {};
    const questionStatus = computeQuestionStatusMap(questions, answers);

    const answeredPractice = new Map<string, QuizAnswerCheckResponse>();
    for (const [qId, lock] of Object.entries(questionLocks)) {
      const q = questions.find((item) => item.id === qId);
      if (q && lock && Number.isInteger(lock.selectedOptionIndex)) {
        answeredPractice.set(qId, buildPracticeCheckResult(q, lock.selectedOptionIndex));
        answers[qId] = { questionId: qId, selectedOptionIndex: lock.selectedOptionIndex };
        questionStatus[qId] = 'answered';
      }
    }

    const now = Date.now();
    return {
      sessionId: parsed.sid,
      quizId: parsed.qid ?? null,
      userId: parsed.uid,
      title: parsed.ttl || 'Document Assessment',
      subjectArea: parsed.sub || 'General Studies',
      format: parsed.fmt || 'objective',
      difficulty: parsed.dif || 'intermediate',
      assessmentMode: parsed.mod === 'exam' ? 'exam' : 'practice',
      timeLimitMinutes: parsed.tlm ?? null,
      questions,
      sealedAnswerKey: sealAnswerKeyPayload(questions, parsed.uid),
      status: parsed.st || 'ready',
      currentQuestionIndex: Math.min(Math.max(0, parsed.idx || 0), Math.max(0, questions.length - 1)),
      answers,
      questionStatus,
      questionLocks,
      startedAtMs: parsed.sa ?? null,
      deadlineAtMs: parsed.dl ?? null,
      submittedAtMs: null,
      lastSavedAtMs: now,
      submitting: false,
      answeredPractice,
      createdAtMs: now,
      persistedInSupabase: Boolean(parsed.pis),
    };
  } catch {
    return null;
  }
}

const MAX_ASSESSMENT_SESSIONS = 500;
const assessmentSessions = new Map<string, ServerAssessmentSession>();
const sessionLockQueues = new Map<string, Promise<void>>();

function storeBoundedSession(session: ServerAssessmentSession) {
  if (assessmentSessions.has(session.sessionId)) {
    assessmentSessions.delete(session.sessionId);
  } else if (assessmentSessions.size >= MAX_ASSESSMENT_SESSIONS) {
    const oldestKey = assessmentSessions.keys().next().value;
    if (oldestKey) assessmentSessions.delete(oldestKey);
  }
  assessmentSessions.set(session.sessionId, session);
}

async function runWithSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLockQueues.get(sessionId) ?? Promise.resolve();
  let releaseNext!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseNext = resolve;
  });
  const chained = prev.catch(() => undefined).then(() => current);
  sessionLockQueues.set(sessionId, chained);

  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    releaseNext();
    if (sessionLockQueues.get(sessionId) === chained) {
      sessionLockQueues.delete(sessionId);
    }
  }
}

function computeQuestionStatusMap(
  questions: ServerQuestionAnswerKey[],
  answers: Record<string, StudentAnswer>
): Record<string, 'answered' | 'unanswered'> {
  const statusMap: Record<string, 'answered' | 'unanswered'> = {};
  for (const q of questions) {
    const ans = answers[q.id];
    const hasOpt =
      ans &&
      ans.selectedOptionIndex !== undefined &&
      ans.selectedOptionIndex !== null &&
      Number.isInteger(ans.selectedOptionIndex);
    statusMap[q.id] = hasOpt ? 'answered' : 'unanswered';
  }
  return statusMap;
}

function buildPracticeCheckResult(
  question: ServerQuestionAnswerKey,
  selectedOptionIndex: number
): QuizAnswerCheckResponse {
  const letter = (i: number) => String.fromCharCode(65 + i);
  const correctIdx = question.correctOptionIndex;
  const isCorrect = selectedOptionIndex === correctIdx;

  return {
    questionId: question.id,
    selectedOptionIndex,
    correctOptionIndex: correctIdx,
    isCorrect,
    expectedAnswerDisplay: `${letter(correctIdx)}. ${
      question.options[correctIdx] || question.expectedAnswer
    }`,
    explanation: question.explanation,
    topicTag: question.topicTag,
    options: [...question.options],
  };
}

function isMissingRelationError(status: number, bodyText: string): boolean {
  const lower = bodyText.toLowerCase();
  return (
    status === 404 ||
    lower.includes('42p01') ||
    lower.includes('pgrst205') ||
    (lower.includes('assessment_sessions') && lower.includes('does not exist')) ||
    lower.includes('could not find the table')
  );
}

async function supabaseRestFetch(
  pathWithQuery: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<globalThis.Response> {
  const cfg = getSupabaseAssessmentConfig();
  if (!cfg) {
    throw new AssessmentHttpError(503, 'Database persistence is not configured.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${cfg.url}/rest/v1/${pathWithQuery}`, {
      ...init,
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof AssessmentHttpError) throw err;
    throw new AssessmentHttpError(
      502,
      'Could not reach the assessment database right now. Please try again.'
    );
  } finally {
    clearTimeout(timer);
  }
}

interface SupabaseAssessmentSessionRow {
  id: string;
  user_id: string;
  quiz_id: string | null;
  assessment_mode: QuizAssessmentMode;
  title: string;
  subject_area: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  time_limit_minutes: number | null;
  questions: QuizQuestion[];
  sealed_answer_key: string;
  current_question_index: number;
  answers: Record<string, StudentAnswer>;
  question_status: Record<string, 'answered' | 'unanswered'>;
  question_locks: Record<string, PracticeQuestionLockEntry>;
  status: 'ready' | 'active' | 'submitting' | 'submitted';
  started_at: string | null;
  deadline_at: string | null;
  submitted_at: string | null;
  last_saved_at: string;
  created_at: string;
}

function hydrateSessionFromRow(
  row: SupabaseAssessmentSessionRow,
  userId: string
): ServerAssessmentSession {
  if (row.user_id !== userId) {
    throw new AssessmentHttpError(403, 'You do not have permission to access this assessment.');
  }

  const unsealed = unsealAnswerKeyPayload(row.sealed_answer_key, userId);
  if (!unsealed) {
    throw new AssessmentHttpError(
      500,
      'Unable to verify assessment answer keys. Ensure ASSESSMENT_KEY_SECRET matches the key used to seal this session.'
    );
  }

  const keyMap = new Map(unsealed.map((k) => [k.id, k]));
  const rawQuestions = Array.isArray(row.questions) ? row.questions : [];
  const mergedQuestions = normalizeServerQuestionKeys(
    rawQuestions.map((q, idx) => {
      const k = keyMap.get(String(q.id || `q-${idx + 1}`));
      if (!k) {
        throw new AssessmentHttpError(
          500,
          'Assessment answer key payload is incomplete and cannot be verified.'
        );
      }
      return {
        ...q,
        correctOptionIndex: k.correctOptionIndex,
        expectedAnswer: k.expectedAnswer,
        explanation: k.explanation,
        maxMarks: k.maxMarks,
        topicTag: k.topicTag ?? q.topicTag,
      };
    })
  );

  const answers: Record<string, StudentAnswer> =
    row.answers && typeof row.answers === 'object' ? { ...row.answers } : {};
  const questionLocks: Record<string, PracticeQuestionLockEntry> =
    row.question_locks && typeof row.question_locks === 'object' ? { ...row.question_locks } : {};
  const questionStatus =
    row.question_status && typeof row.question_status === 'object'
      ? { ...row.question_status }
      : computeQuestionStatusMap(mergedQuestions, answers);

  const answeredPractice = new Map<string, QuizAnswerCheckResponse>();
  for (const [qId, lock] of Object.entries(questionLocks)) {
    const q = mergedQuestions.find((item) => item.id === qId);
    if (
      q &&
      lock &&
      Number.isInteger(lock.selectedOptionIndex) &&
      lock.selectedOptionIndex >= 0 &&
      lock.selectedOptionIndex < q.options.length
    ) {
      answeredPractice.set(qId, buildPracticeCheckResult(q, lock.selectedOptionIndex));
      answers[qId] = { questionId: qId, selectedOptionIndex: lock.selectedOptionIndex };
      questionStatus[qId] = 'answered';
    }
  }

  const startedAtMs = row.started_at ? Date.parse(row.started_at) : null;
  const deadlineAtMs = row.deadline_at ? Date.parse(row.deadline_at) : null;
  const submittedAtMs = row.submitted_at ? Date.parse(row.submitted_at) : null;
  const lastSavedAtMs = row.last_saved_at ? Date.parse(row.last_saved_at) : Date.now();
  const createdAtMs = row.created_at ? Date.parse(row.created_at) : Date.now();

  const maxIdx = Math.max(0, mergedQuestions.length - 1);
  const currentQuestionIndex = Math.min(
    maxIdx,
    Math.max(0, Number.isInteger(row.current_question_index) ? row.current_question_index : 0)
  );

  return {
    sessionId: String(row.id),
    quizId: row.quiz_id ? String(row.quiz_id) : null,
    userId: row.user_id,
    title: row.title,
    subjectArea: row.subject_area || 'General Studies',
    format: 'objective',
    difficulty: row.difficulty || 'intermediate',
    assessmentMode: row.assessment_mode === 'exam' ? 'exam' : 'practice',
    timeLimitMinutes: row.time_limit_minutes,
    questions: mergedQuestions,
    sealedAnswerKey: row.sealed_answer_key,
    status: row.status === 'submitted' || row.status === 'submitting' || row.status === 'active'
      ? row.status
      : 'ready',
    currentQuestionIndex,
    answers,
    questionStatus,
    questionLocks,
    startedAtMs: startedAtMs !== null && Number.isFinite(startedAtMs) ? startedAtMs : null,
    deadlineAtMs: deadlineAtMs !== null && Number.isFinite(deadlineAtMs) ? deadlineAtMs : null,
    submittedAtMs: submittedAtMs !== null && Number.isFinite(submittedAtMs) ? submittedAtMs : null,
    lastSavedAtMs: Number.isFinite(lastSavedAtMs) ? lastSavedAtMs : Date.now(),
    submitting: row.status === 'submitting',
    answeredPractice,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    persistedInSupabase: true,
  };
}

async function persistNewSessionToSupabase(params: {
  accessToken: string;
  userId: string;
  quizId: string | null;
  assessmentMode: QuizAssessmentMode;
  title: string;
  subjectArea: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  timeLimitMinutes: number | null;
  sanitizedQuestions: QuizQuestion[];
  sealedAnswerKey: string;
  status: 'ready' | 'active';
  startedAtMs: number | null;
  deadlineAtMs: number | null;
  questionStatus: Record<string, 'answered' | 'unanswered'>;
}): Promise<string> {
  const nowIso = new Date().toISOString();
  const res = await supabaseRestFetch('assessment_sessions', params.accessToken, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: params.userId,
      quiz_id: params.quizId,
      assessment_mode: params.assessmentMode,
      title: params.title,
      subject_area: params.subjectArea,
      format: params.format,
      difficulty: params.difficulty,
      time_limit_minutes: params.timeLimitMinutes,
      questions: params.sanitizedQuestions,
      sealed_answer_key: params.sealedAnswerKey,
      current_question_index: 0,
      answers: {},
      question_status: params.questionStatus,
      question_locks: {},
      status: params.status,
      started_at: params.startedAtMs ? new Date(params.startedAtMs).toISOString() : null,
      deadline_at: params.deadlineAtMs ? new Date(params.deadlineAtMs).toISOString() : null,
      last_saved_at: nowIso,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (isMissingRelationError(res.status, errText)) {
      throw new AssessmentHttpError(
        503,
        'Persistent assessment sessions table is missing. Please run the latest database migration in supabase/schema.sql.'
      );
    }
    throw new AssessmentHttpError(
      res.status >= 400 && res.status < 500 ? res.status : 502,
      'Could not initialize persistent assessment session in database.'
    );
  }

  const rows = (await res.json()) as SupabaseAssessmentSessionRow[];
  if (!Array.isArray(rows) || !rows[0]?.id) {
    throw new AssessmentHttpError(502, 'Database did not return the created assessment session.');
  }
  return String(rows[0].id);
}

async function fetchSessionFromSupabase(
  accessToken: string,
  userId: string,
  sessionId: string
): Promise<SupabaseAssessmentSessionRow | null> {
  const res = await supabaseRestFetch(
    `assessment_sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(
      userId
    )}&select=*&limit=1`,
    accessToken
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (isMissingRelationError(res.status, errText)) {
      throw new AssessmentHttpError(
        503,
        'Persistent assessment sessions table is missing. Please run the latest database migration in supabase/schema.sql.'
      );
    }
    return null;
  }

  const rows = (await res.json()) as SupabaseAssessmentSessionRow[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

async function patchSessionInSupabase(
  accessToken: string,
  userId: string,
  sessionId: string,
  patch: Record<string, unknown>,
  statusFilter = 'in.(ready,active)'
): Promise<SupabaseAssessmentSessionRow | null> {
  const query = `assessment_sessions?id=eq.${encodeURIComponent(
    sessionId
  )}&user_id=eq.${encodeURIComponent(userId)}&status=${statusFilter}&select=*`;

  const res = await supabaseRestFetch(query, accessToken, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (isMissingRelationError(res.status, errText)) {
      throw new AssessmentHttpError(
        503,
        'Persistent assessment sessions table is missing. Please run the latest database migration in supabase/schema.sql.'
      );
    }
    throw new AssessmentHttpError(502, 'Could not persist assessment session progress.');
  }

  const rows = (await res.json()) as SupabaseAssessmentSessionRow[];
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function resolveHydratedSession(
  userId: string,
  accessToken: string | null,
  sessionId: string,
  sessionToken?: string | null
): Promise<ServerAssessmentSession> {
  const cached = assessmentSessions.get(sessionId);
  if (cached) {
    if (cached.userId !== userId) {
      throw new AssessmentHttpError(403, 'You do not have permission to access this assessment.');
    }
    return cached;
  }

  const cfg = getSupabaseAssessmentConfig();
  if (cfg && accessToken) {
    try {
      const row = await fetchSessionFromSupabase(accessToken, userId, sessionId);
      if (row) {
        const hydrated = hydrateSessionFromRow(row, userId);
        storeBoundedSession(hydrated);
        return hydrated;
      }
    } catch (dbErr) {
      // If sessionToken is present, fall back cleanly instead of blocking on missing DB table
      if (!sessionToken) {
        if (dbErr instanceof AssessmentHttpError) throw dbErr;
        throw new AssessmentHttpError(404, 'Assessment session not found or has expired.');
      }
    }
  }

  if (sessionToken) {
    const unsealed = unsealAssessmentSessionToken(sessionToken, userId, sessionId);
    if (unsealed) {
      storeBoundedSession(unsealed);
      return unsealed;
    }
  }

  throw new AssessmentHttpError(404, 'Assessment session not found or has expired.');
}

async function persistQuizToSupabase(params: {
  accessToken: string;
  userId: string;
  title: string;
  subjectArea: string;
  sourceMode: QuizSourceMode;
  materialId: string | null;
  summaryId: string | null;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  questionCount: number;
  timeLimitMinutes: number | null;
  sanitizedQuestions: QuizQuestion[];
  sealedAnswerKey: string;
}): Promise<string | null> {
  const cfg = getSupabaseAssessmentConfig();
  if (!cfg) return null;

  const basePayload = {
    user_id: params.userId,
    title: params.title,
    subject_area: params.subjectArea,
    source_mode: params.sourceMode,
    material_id: params.materialId,
    summary_id: params.summaryId,
    format: params.format,
    difficulty: params.difficulty,
    question_count: params.questionCount,
    time_limit_minutes: params.timeLimitMinutes,
    questions: params.sanitizedQuestions,
  };

  const tryInsert = async (body: Record<string, unknown>) =>
    supabaseRestFetch('quizzes', params.accessToken, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });

  try {
    let res = await tryInsert({
      ...basePayload,
      sealed_answer_key: params.sealedAnswerKey,
    });
    if (!res.ok && res.status === 400) {
      res = await tryInsert(basePayload);
    }
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id?: string }>;
    return Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : null;
  } catch {
    return null;
  }
}

interface SupabaseQuizRow {
  id: string;
  user_id: string;
  title: string;
  subject_area: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  time_limit_minutes: number | null;
  questions: QuizQuestion[];
  sealed_answer_key?: string | null;
}

async function fetchOwnedQuizFromSupabase(
  accessToken: string,
  userId: string,
  quizId: string
): Promise<SupabaseQuizRow | null> {
  try {
    const res = await supabaseRestFetch(
      `quizzes?id=eq.${encodeURIComponent(quizId)}&user_id=eq.${encodeURIComponent(
        userId
      )}&select=*&limit=1`,
      accessToken
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as SupabaseQuizRow[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    if (row.user_id !== userId) return null;
    return row;
  } catch {
    return null;
  }
}

async function hasSubmittedSessionInSupabase(
  accessToken: string,
  userId: string,
  sessionId: string
): Promise<boolean> {
  try {
    const res = await supabaseRestFetch(
      `quiz_attempts?user_id=eq.${encodeURIComponent(userId)}&session_id=eq.${encodeURIComponent(
        sessionId
      )}&select=id&limit=1`,
      accessToken
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id?: string }>;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function persistAttemptToSupabase(params: {
  accessToken: string;
  userId: string;
  sessionId: string;
  quizId: string | null;
  title: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  answers: StudentAnswer[];
  grading: QuizGradingResponse;
}): Promise<{ attemptId: string | null; duplicate: boolean }> {
  const cfg = getSupabaseAssessmentConfig();
  if (!cfg) return { attemptId: null, duplicate: false };

  const basePayload = {
    user_id: params.userId,
    quiz_id: params.quizId,
    title: params.title,
    format: params.format,
    difficulty: params.difficulty,
    total_questions: params.grading.totalQuestions,
    correct_count: params.grading.correctCount,
    incorrect_count: params.grading.incorrectCount,
    unanswered_count: params.grading.unansweredCount,
    earned_marks: params.grading.earnedMarks,
    max_marks: params.grading.maxMarks,
    percentage: params.grading.percentage,
    time_taken_seconds: params.grading.timeTakenSeconds,
    answers: params.answers,
    graded_results: params.grading.gradedResults,
    performance_summary: params.grading.performanceAssessment,
  };

  const tryInsert = async (body: Record<string, unknown>) =>
    supabaseRestFetch('quiz_attempts', params.accessToken, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });

  try {
    let res = await tryInsert({
      ...basePayload,
      session_id: params.sessionId,
    });

    if (res.status === 409) {
      return { attemptId: null, duplicate: true };
    }
    if (!res.ok && res.status === 400) {
      const errText = await res.text().catch(() => '');
      if (errText.includes('23505') || errText.toLowerCase().includes('duplicate')) {
        return { attemptId: null, duplicate: true };
      }
      res = await tryInsert(basePayload);
    }
    if (!res.ok) return { attemptId: null, duplicate: false };
    const rows = (await res.json()) as Array<{ id?: string }>;
    return {
      attemptId: Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : null,
      duplicate: false,
    };
  } catch {
    return { attemptId: null, duplicate: false };
  }
}

export async function createServerAssessmentSession(params: {
  userId: string;
  accessToken: string | null;
  title: string;
  subjectArea: string;
  sourceMode: QuizSourceMode;
  materialId: string | null;
  summaryId: string | null;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  assessmentMode: QuizAssessmentMode;
  timeLimitMinutes: number | null;
  rawQuestions: QuizQuestion[];
}): Promise<{
  session: ServerAssessmentSession;
  sanitizedQuestions: QuizQuestion[];
}> {
  const normalizedKeys = normalizeServerQuestionKeys(params.rawQuestions);
  const sanitizedQuestions = stripAnswerKeysFromQuestions(normalizedKeys);
  const sealedAnswerKey = sealAnswerKeyPayload(normalizedKeys, params.userId);
  const effectiveTimeLimit =
    params.assessmentMode === 'exam'
      ? Math.min(180, Math.max(5, Number(params.timeLimitMinutes) || 20))
      : null;

  const initialQuestionStatus = computeQuestionStatusMap(normalizedKeys, {});
  const cfg = getSupabaseAssessmentConfig();
  let persistedQuizId: string | null = null;
  let sessionId: string = crypto.randomUUID();
  let persistedInSupabase = false;

  if (cfg && params.accessToken) {
    try {
      const dbSourceMode: QuizSourceMode =
        params.sourceMode === 'upload'
          ? params.materialId
            ? 'material'
            : 'text'
          : params.sourceMode;

      persistedQuizId = await persistQuizToSupabase({
        accessToken: params.accessToken,
        userId: params.userId,
        title: params.title,
        subjectArea: params.subjectArea,
        sourceMode: dbSourceMode,
        materialId: params.materialId,
        summaryId: params.summaryId,
        format: 'objective',
        difficulty: params.difficulty,
        questionCount: sanitizedQuestions.length,
        timeLimitMinutes: effectiveTimeLimit,
        sanitizedQuestions,
        sealedAnswerKey,
      });

      sessionId = await persistNewSessionToSupabase({
        accessToken: params.accessToken,
        userId: params.userId,
        quizId: persistedQuizId,
        assessmentMode: params.assessmentMode,
        title: params.title,
        subjectArea: params.subjectArea,
        format: 'objective',
        difficulty: params.difficulty,
        timeLimitMinutes: effectiveTimeLimit,
        sanitizedQuestions,
        sealedAnswerKey,
        status: 'ready',
        startedAtMs: null,
        deadlineAtMs: null,
        questionStatus: initialQuestionStatus,
      });
      persistedInSupabase = true;
    } catch (dbErr) {
      logServerError('assessment.supabase_create_session_fallback', dbErr);
    }
  }

  const now = Date.now();
  const session: ServerAssessmentSession = {
    sessionId,
    quizId: persistedQuizId,
    userId: params.userId,
    title: params.title,
    subjectArea: params.subjectArea,
    format: 'objective',
    difficulty: params.difficulty,
    assessmentMode: params.assessmentMode,
    timeLimitMinutes: effectiveTimeLimit,
    questions: normalizedKeys,
    sealedAnswerKey,
    status: 'ready',
    currentQuestionIndex: 0,
    answers: {},
    questionStatus: initialQuestionStatus,
    questionLocks: {},
    startedAtMs: null,
    deadlineAtMs: null,
    submittedAtMs: null,
    lastSavedAtMs: now,
    submitting: false,
    answeredPractice: new Map(),
    createdAtMs: now,
    persistedInSupabase,
  };

  storeBoundedSession(session);
  return { session, sanitizedQuestions };
}

export async function startServerAssessmentSession(params: {
  userId: string;
  accessToken: string | null;
  sessionId?: string | null;
  sessionToken?: string | null;
  quizId?: string | null;
  assessmentMode?: QuizAssessmentMode;
  timeLimitMinutes?: number | null;
  retake?: boolean;
}): Promise<StartQuizSessionResponse> {
  const lockKey = params.sessionId || `quiz:${params.quizId || 'unknown'}:${params.userId}`;
  return runWithSessionLock(lockKey, async () => {
    let baseSession: ServerAssessmentSession | undefined;

    if (params.sessionId) {
      baseSession = await resolveHydratedSession(
        params.userId,
        params.accessToken,
        params.sessionId,
        params.sessionToken
      );
    }

    if (baseSession && baseSession.status === 'submitted' && !params.retake && !params.quizId) {
      throw new AssessmentHttpError(
        409,
        'This assessment attempt has already been completed and cannot be reopened.'
      );
    }

    // If starting from a saved quizId without an active ready session, load owned record from Supabase
    if ((!baseSession || baseSession.status === 'submitted' || params.retake) && params.quizId) {
      if (!params.accessToken || !getSupabaseAssessmentConfig()) {
        if (!baseSession) {
          throw new AssessmentHttpError(404, 'Saved assessment record could not be found.');
        }
      } else {
        const row = await fetchOwnedQuizFromSupabase(params.accessToken, params.userId, params.quizId);
        if (!row) {
          throw new AssessmentHttpError(404, 'Assessment not found or access denied.');
        }

        let mergedQuestions: ServerQuestionAnswerKey[] | null = null;
        if (row.sealed_answer_key) {
          const unsealed = unsealAnswerKeyPayload(row.sealed_answer_key, params.userId);
          if (!unsealed) {
            throw new AssessmentHttpError(
              500,
              'Unable to decrypt saved assessment answer keys. Verify ASSESSMENT_KEY_SECRET.'
            );
          }
          const keyMap = new Map(unsealed.map((k) => [k.id, k]));
          mergedQuestions = normalizeServerQuestionKeys(
            (row.questions || []).map((q, idx) => {
              const k = keyMap.get(String(q.id || `q-${idx + 1}`));
              return {
                ...q,
                correctOptionIndex: k?.correctOptionIndex ?? q.correctOptionIndex,
                expectedAnswer: k?.expectedAnswer ?? q.expectedAnswer,
                explanation: k?.explanation ?? q.explanation,
                maxMarks: k?.maxMarks ?? q.maxMarks,
                topicTag: k?.topicTag ?? q.topicTag,
              };
            })
          );
        }

        if (!mergedQuestions) {
          const hasLegacyKeys =
            Array.isArray(row.questions) &&
            row.questions.some(
              (q) =>
                typeof q.correctOptionIndex === 'number' ||
                (typeof q.expectedAnswer === 'string' && q.expectedAnswer.length > 0)
            );
          if (!hasLegacyKeys) {
            throw new AssessmentHttpError(
              404,
              'This assessment answer key is unavailable. Please generate a new assessment.'
            );
          }
          mergedQuestions = normalizeServerQuestionKeys(row.questions);
        }

        const rowMode: QuizAssessmentMode =
          row.time_limit_minutes && row.time_limit_minutes > 0 ? 'exam' : 'practice';
        const sealed = sealAnswerKeyPayload(mergedQuestions, params.userId);
        const mode: QuizAssessmentMode =
          params.assessmentMode === 'exam' || params.assessmentMode === 'practice'
            ? params.assessmentMode
            : rowMode;
        const effectiveTimeLimit =
          mode === 'exam'
            ? Math.min(180, Math.max(5, Number(params.timeLimitMinutes ?? row.time_limit_minutes) || 20))
            : null;
        const now = Date.now();
        const deadlineAtMs =
          mode === 'exam' && effectiveTimeLimit ? now + effectiveTimeLimit * 60_000 : null;
        const qStatus = computeQuestionStatusMap(mergedQuestions, {});

        let newSessionId: string = crypto.randomUUID();
        let freshPersisted = false;
        try {
          newSessionId = await persistNewSessionToSupabase({
            accessToken: params.accessToken,
            userId: params.userId,
            quizId: row.id,
            assessmentMode: mode,
            title: row.title,
            subjectArea: row.subject_area || 'General Studies',
            format: 'objective',
            difficulty: row.difficulty || 'intermediate',
            timeLimitMinutes: effectiveTimeLimit,
            sanitizedQuestions: stripAnswerKeysFromQuestions(mergedQuestions),
            sealedAnswerKey: sealed,
            status: 'active',
            startedAtMs: now,
            deadlineAtMs,
            questionStatus: qStatus,
          });
          freshPersisted = true;
        } catch (dbErr) {
          logServerError('assessment.supabase_start_saved_quiz_fallback', dbErr);
        }

        const freshSession: ServerAssessmentSession = {
          sessionId: newSessionId,
          quizId: row.id,
          userId: params.userId,
          title: row.title,
          subjectArea: row.subject_area || 'General Studies',
          format: 'objective',
          difficulty: row.difficulty || 'intermediate',
          assessmentMode: mode,
          timeLimitMinutes: effectiveTimeLimit,
          questions: mergedQuestions,
          sealedAnswerKey: sealed,
          status: 'active',
          currentQuestionIndex: 0,
          answers: {},
          questionStatus: qStatus,
          questionLocks: {},
          startedAtMs: now,
          deadlineAtMs,
          submittedAtMs: null,
          lastSavedAtMs: now,
          submitting: false,
          answeredPractice: new Map(),
          createdAtMs: now,
          persistedInSupabase: freshPersisted,
        };
        storeBoundedSession(freshSession);

        return {
          sessionId: freshSession.sessionId,
          sessionToken: sealAssessmentSessionToken(freshSession),
          quizId: freshSession.quizId,
          title: freshSession.title,
          subjectArea: freshSession.subjectArea,
          format: freshSession.format,
          difficulty: freshSession.difficulty,
          assessmentMode: freshSession.assessmentMode,
          timeLimitMinutes: freshSession.timeLimitMinutes,
          startedAtMs: now,
          deadlineAtMs,
          serverNowMs: now,
          remainingSeconds:
            deadlineAtMs !== null ? Math.max(0, Math.ceil((deadlineAtMs - now) / 1000)) : null,
          questions: stripAnswerKeysFromQuestions(freshSession.questions),
        };
      }
    }

    if (!baseSession) {
      throw new AssessmentHttpError(404, 'Assessment session not found or has expired.');
    }

    const mode: QuizAssessmentMode =
      params.assessmentMode === 'exam' || params.assessmentMode === 'practice'
        ? params.assessmentMode
        : baseSession.assessmentMode;
    const effectiveTimeLimit =
      mode === 'exam'
        ? Math.min(180, Math.max(5, Number(params.timeLimitMinutes ?? baseSession.timeLimitMinutes) || 20))
        : null;

    // Never restart an already-active session's timer when resuming the same sessionId
    if (baseSession.status === 'active' && !params.retake) {
      const now = Date.now();
      return {
        sessionId: baseSession.sessionId,
        sessionToken: sealAssessmentSessionToken(baseSession),
        quizId: baseSession.quizId,
        title: baseSession.title,
        subjectArea: baseSession.subjectArea,
        format: baseSession.format,
        difficulty: baseSession.difficulty,
        assessmentMode: baseSession.assessmentMode,
        timeLimitMinutes: baseSession.timeLimitMinutes,
        startedAtMs: baseSession.startedAtMs ?? now,
        deadlineAtMs: baseSession.deadlineAtMs,
        serverNowMs: now,
        remainingSeconds:
          baseSession.deadlineAtMs !== null
            ? Math.max(0, Math.ceil((baseSession.deadlineAtMs - now) / 1000))
            : null,
        questions: stripAnswerKeysFromQuestions(baseSession.questions),
      };
    }

    // If retaking a local/completed session without quizId, mint a fresh session
    if (baseSession.status === 'submitted' || baseSession.status === 'active') {
      const now = Date.now();
      const deadlineAtMs =
        mode === 'exam' && effectiveTimeLimit ? now + effectiveTimeLimit * 60_000 : null;
      const qStatus = computeQuestionStatusMap(baseSession.questions, {});
      let newSessionId: string = crypto.randomUUID();
      let clonedPersisted = false;
      if (getSupabaseAssessmentConfig() && params.accessToken) {
        try {
          newSessionId = await persistNewSessionToSupabase({
            accessToken: params.accessToken,
            userId: params.userId,
            quizId: baseSession.quizId,
            assessmentMode: mode,
            title: baseSession.title,
            subjectArea: baseSession.subjectArea,
            format: 'objective',
            difficulty: baseSession.difficulty,
            timeLimitMinutes: effectiveTimeLimit,
            sanitizedQuestions: stripAnswerKeysFromQuestions(baseSession.questions),
            sealedAnswerKey: baseSession.sealedAnswerKey,
            status: 'active',
            startedAtMs: now,
            deadlineAtMs,
            questionStatus: qStatus,
          });
          clonedPersisted = true;
        } catch (dbErr) {
          logServerError('assessment.supabase_retake_session_fallback', dbErr);
        }
      }
      const cloned: ServerAssessmentSession = {
        ...baseSession,
        sessionId: newSessionId,
        assessmentMode: mode,
        timeLimitMinutes: effectiveTimeLimit,
        status: 'active',
        currentQuestionIndex: 0,
        answers: {},
        questionStatus: qStatus,
        questionLocks: {},
        startedAtMs: now,
        deadlineAtMs,
        submittedAtMs: null,
        lastSavedAtMs: now,
        submitting: false,
        answeredPractice: new Map(),
        createdAtMs: now,
        persistedInSupabase: clonedPersisted,
      };
      storeBoundedSession(cloned);
      return {
        sessionId: cloned.sessionId,
        sessionToken: sealAssessmentSessionToken(cloned),
        quizId: cloned.quizId,
        title: cloned.title,
        subjectArea: cloned.subjectArea,
        format: cloned.format,
        difficulty: cloned.difficulty,
        assessmentMode: cloned.assessmentMode,
        timeLimitMinutes: cloned.timeLimitMinutes,
        startedAtMs: now,
        deadlineAtMs,
        serverNowMs: now,
        remainingSeconds:
          deadlineAtMs !== null ? Math.max(0, Math.ceil((deadlineAtMs - now) / 1000)) : null,
        questions: stripAnswerKeysFromQuestions(cloned.questions),
      };
    }

    // Transition 'ready' -> 'active'
    const now = Date.now();
    const deadlineAtMs =
      mode === 'exam' && effectiveTimeLimit ? now + effectiveTimeLimit * 60_000 : null;

    if (baseSession.persistedInSupabase && getSupabaseAssessmentConfig() && params.accessToken) {
      try {
        const updated = await patchSessionInSupabase(
          params.accessToken,
          params.userId,
          baseSession.sessionId,
          {
            assessment_mode: mode,
            time_limit_minutes: effectiveTimeLimit,
            status: 'active',
            started_at: new Date(now).toISOString(),
            deadline_at: deadlineAtMs ? new Date(deadlineAtMs).toISOString() : null,
            last_saved_at: new Date(now).toISOString(),
          },
          'eq.ready'
        );
        if (!updated) {
          const refreshed = await fetchSessionFromSupabase(
            params.accessToken,
            params.userId,
            baseSession.sessionId
          );
          if (refreshed && refreshed.status === 'active') {
            const hydrated = hydrateSessionFromRow(refreshed, params.userId);
            storeBoundedSession(hydrated);
            return {
              sessionId: hydrated.sessionId,
              sessionToken: sealAssessmentSessionToken(hydrated),
              quizId: hydrated.quizId,
              title: hydrated.title,
              subjectArea: hydrated.subjectArea,
              format: hydrated.format,
              difficulty: hydrated.difficulty,
              assessmentMode: hydrated.assessmentMode,
              timeLimitMinutes: hydrated.timeLimitMinutes,
              startedAtMs: hydrated.startedAtMs ?? now,
              deadlineAtMs: hydrated.deadlineAtMs,
              serverNowMs: now,
              remainingSeconds:
                hydrated.deadlineAtMs !== null
                  ? Math.max(0, Math.ceil((hydrated.deadlineAtMs - now) / 1000))
                  : null,
              questions: stripAnswerKeysFromQuestions(hydrated.questions),
            };
          }
          throw new AssessmentHttpError(409, 'This assessment session could not be started.');
        }
      } catch (dbErr) {
        if (dbErr instanceof AssessmentHttpError) throw dbErr;
        logServerError('assessment.supabase_start_session_fallback', dbErr);
      }
    }

    baseSession.assessmentMode = mode;
    baseSession.timeLimitMinutes = effectiveTimeLimit;
    baseSession.status = 'active';
    baseSession.startedAtMs = now;
    baseSession.deadlineAtMs = deadlineAtMs;
    baseSession.lastSavedAtMs = now;
    storeBoundedSession(baseSession);

    return {
      sessionId: baseSession.sessionId,
      sessionToken: sealAssessmentSessionToken(baseSession),
      quizId: baseSession.quizId,
      title: baseSession.title,
      subjectArea: baseSession.subjectArea,
      format: baseSession.format,
      difficulty: baseSession.difficulty,
      assessmentMode: baseSession.assessmentMode,
      timeLimitMinutes: baseSession.timeLimitMinutes,
      startedAtMs: now,
      deadlineAtMs,
      serverNowMs: now,
      remainingSeconds:
        deadlineAtMs !== null ? Math.max(0, Math.ceil((deadlineAtMs - now) / 1000)) : null,
      questions: stripAnswerKeysFromQuestions(baseSession.questions),
    };
  });
}

export async function listActiveAssessmentSessions(params: {
  userId: string;
  accessToken: string | null;
}): Promise<ActiveAssessmentSummary[]> {
  const cfg = getSupabaseAssessmentConfig();
  const now = Date.now();

  if (cfg) {
    if (!params.accessToken) return [];
    const res = await supabaseRestFetch(
      `assessment_sessions?user_id=eq.${encodeURIComponent(
        params.userId
      )}&status=in.(active,submitting)&order=last_saved_at.desc&limit=5`,
      params.accessToken
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (isMissingRelationError(res.status, errText)) {
        return [];
      }
      return [];
    }
    const rows = (await res.json()) as SupabaseAssessmentSessionRow[];
    if (!Array.isArray(rows)) return [];

    const results: ActiveAssessmentSummary[] = [];
    for (const row of rows) {
      if (row.user_id !== params.userId) continue;
      if (row.status === 'submitting') {
        const alreadyDone = await hasSubmittedSessionInSupabase(
          params.accessToken,
          params.userId,
          row.id
        );
        if (alreadyDone) continue;
      }
      const deadlineAtMs = row.deadline_at ? Date.parse(row.deadline_at) : null;
      const startedAtMs = row.started_at ? Date.parse(row.started_at) : null;
      const remainingSeconds =
        deadlineAtMs !== null && Number.isFinite(deadlineAtMs)
          ? Math.max(0, Math.ceil((deadlineAtMs - now) / 1000))
          : null;
      const qStatus = row.question_status || {};
      const answeredCount = Object.values(qStatus).filter((v) => v === 'answered').length;
      results.push({
        sessionId: String(row.id),
        quizId: row.quiz_id ? String(row.quiz_id) : null,
        title: row.title,
        subjectArea: row.subject_area || 'General Studies',
        assessmentMode: row.assessment_mode === 'exam' ? 'exam' : 'practice',
        difficulty: row.difficulty || 'intermediate',
        questionCount: Array.isArray(row.questions) ? row.questions.length : 0,
        answeredCount,
        currentQuestionIndex: row.current_question_index || 0,
        timeLimitMinutes: row.time_limit_minutes,
        startedAtMs: startedAtMs !== null && Number.isFinite(startedAtMs) ? startedAtMs : null,
        deadlineAtMs: deadlineAtMs !== null && Number.isFinite(deadlineAtMs) ? deadlineAtMs : null,
        remainingSeconds,
        isExpired:
          row.assessment_mode === 'exam' &&
          deadlineAtMs !== null &&
          Number.isFinite(deadlineAtMs) &&
          now > deadlineAtMs,
        lastSavedAt: row.last_saved_at,
      });
    }
    return results;
  }

  // Unconfigured local mode fallback
  const localActive: ActiveAssessmentSummary[] = [];
  for (const s of assessmentSessions.values()) {
    if (s.userId !== params.userId || s.status !== 'active') continue;
    const remainingSeconds =
      s.deadlineAtMs !== null ? Math.max(0, Math.ceil((s.deadlineAtMs - now) / 1000)) : null;
    const answeredCount = Object.values(s.questionStatus).filter((v) => v === 'answered').length;
    localActive.push({
      sessionId: s.sessionId,
      quizId: s.quizId,
      title: s.title,
      subjectArea: s.subjectArea,
      assessmentMode: s.assessmentMode,
      difficulty: s.difficulty,
      questionCount: s.questions.length,
      answeredCount,
      currentQuestionIndex: s.currentQuestionIndex,
      timeLimitMinutes: s.timeLimitMinutes,
      startedAtMs: s.startedAtMs,
      deadlineAtMs: s.deadlineAtMs,
      remainingSeconds,
      isExpired: s.assessmentMode === 'exam' && s.deadlineAtMs !== null && now > s.deadlineAtMs,
      lastSavedAt: new Date(s.lastSavedAtMs).toISOString(),
    });
  }
  localActive.sort((a, b) => Date.parse(b.lastSavedAt) - Date.parse(a.lastSavedAt));
  return localActive;
}

export async function saveAssessmentProgress(params: {
  userId: string;
  accessToken: string | null;
  sessionId: string;
  sessionToken?: string | null;
  currentQuestionIndex?: number;
  answers?: Record<string, StudentAnswer> | StudentAnswer[];
}): Promise<{
  ok: true;
  sessionId: string;
  sessionToken: string;
  currentQuestionIndex: number;
  answeredCount: number;
  remainingSeconds: number | null;
  lastSavedAt: string;
}> {
  return runWithSessionLock(params.sessionId, async () => {
    const session = await resolveHydratedSession(
      params.userId,
      params.accessToken,
      params.sessionId,
      params.sessionToken
    );

    if (session.status === 'submitted' || session.status === 'submitting' || session.submitting) {
      throw new AssessmentHttpError(
        409,
        'Completed assessment attempts cannot be reopened or modified.'
      );
    }

    const now = Date.now();
    if (
      session.assessmentMode === 'exam' &&
      session.deadlineAtMs !== null &&
      now > session.deadlineAtMs + EXAM_DEADLINE_GRACE_MS
    ) {
      throw new AssessmentHttpError(
        403,
        'This examination deadline has expired and progress can no longer be modified.'
      );
    }

    let nextIdx = session.currentQuestionIndex;
    if (params.currentQuestionIndex !== undefined) {
      if (
        !Number.isInteger(params.currentQuestionIndex) ||
        params.currentQuestionIndex < 0 ||
        params.currentQuestionIndex >= session.questions.length
      ) {
        throw new AssessmentHttpError(400, 'Invalid question index.');
      }
      nextIdx = params.currentQuestionIndex;
    }

    const questionById = new Map(session.questions.map((q) => [q.id, q]));
    const nextAnswers: Record<string, StudentAnswer> = { ...session.answers };

    const incomingList: StudentAnswer[] = Array.isArray(params.answers)
      ? params.answers
      : params.answers && typeof params.answers === 'object'
        ? Object.values(params.answers)
        : [];

    for (const entry of incomingList) {
      if (!entry || typeof entry.questionId !== 'string') continue;
      const q = questionById.get(entry.questionId);
      if (!q) {
        throw new AssessmentHttpError(400, 'Answer references a question outside this assessment.');
      }

      if (session.questionLocks[q.id]) {
        continue;
      }

      const rawOpt = entry.selectedOptionIndex;
      if (
        rawOpt !== undefined &&
        rawOpt !== null &&
        (!Number.isInteger(rawOpt) || rawOpt < 0 || rawOpt >= q.options.length)
      ) {
        throw new AssessmentHttpError(400, 'Invalid selected answer option index.');
      }

      nextAnswers[q.id] = {
        questionId: q.id,
        selectedOptionIndex: rawOpt !== undefined ? rawOpt : null,
      };
    }

    const nextStatusMap = computeQuestionStatusMap(session.questions, nextAnswers);
    const lastSavedIso = new Date(now).toISOString();

    if (session.persistedInSupabase && getSupabaseAssessmentConfig() && params.accessToken) {
      try {
        const patched = await patchSessionInSupabase(
          params.accessToken,
          params.userId,
          session.sessionId,
          {
            current_question_index: nextIdx,
            answers: nextAnswers,
            question_status: nextStatusMap,
            last_saved_at: lastSavedIso,
          },
          'in.(ready,active)'
        );
        if (!patched) {
          throw new AssessmentHttpError(
            409,
            'This assessment has already been submitted and cannot be modified.'
          );
        }
      } catch (dbErr) {
        if (dbErr instanceof AssessmentHttpError) throw dbErr;
        logServerError('assessment.supabase_save_progress_fallback', dbErr);
      }
    }

    session.currentQuestionIndex = nextIdx;
    session.answers = nextAnswers;
    session.questionStatus = nextStatusMap;
    session.lastSavedAtMs = now;
    storeBoundedSession(session);

    const answeredCount = Object.values(nextStatusMap).filter((v) => v === 'answered').length;
    const remainingSeconds =
      session.deadlineAtMs !== null
        ? Math.max(0, Math.ceil((session.deadlineAtMs - now) / 1000))
        : null;

    return {
      ok: true,
      sessionId: session.sessionId,
      sessionToken: sealAssessmentSessionToken(session),
      currentQuestionIndex: nextIdx,
      answeredCount,
      remainingSeconds,
      lastSavedAt: lastSavedIso,
    };
  });
}

export async function restoreServerAssessmentSession(params: {
  userId: string;
  accessToken: string | null;
  sessionId: string;
  sessionToken?: string | null;
}): Promise<RestoredQuizSessionResponse> {
  return runWithSessionLock(params.sessionId, async () => {
    const session = await resolveHydratedSession(
      params.userId,
      params.accessToken,
      params.sessionId,
      params.sessionToken
    );

    if (session.status === 'submitted') {
      throw new AssessmentHttpError(
        409,
        'This assessment attempt has already been completed and cannot be reopened.'
      );
    }

    if (session.persistedInSupabase && params.accessToken && getSupabaseAssessmentConfig()) {
      const alreadySubmitted = await hasSubmittedSessionInSupabase(
        params.accessToken,
        params.userId,
        session.sessionId
      );
      if (alreadySubmitted) {
        session.status = 'submitted';
        throw new AssessmentHttpError(
          409,
          'This assessment attempt has already been completed and cannot be reopened.'
        );
      }
    }

    const now = Date.now();

    if (
      session.assessmentMode === 'exam' &&
      session.deadlineAtMs !== null &&
      now > session.deadlineAtMs
    ) {
      const grading = await executeServerAssessmentGrading({
        session,
        userId: params.userId,
        accessToken: params.accessToken,
        submittedAnswers: Object.values(session.answers),
        clientElapsedSeconds: undefined,
        autoSubmitted: true,
        allowExpiredServerAutoSubmit: true,
      });

      return {
        status: 'expired_submitted',
        sessionId: session.sessionId,
        quizId: session.quizId,
        title: session.title,
        subjectArea: session.subjectArea,
        format: session.format,
        difficulty: session.difficulty,
        assessmentMode: session.assessmentMode,
        grading,
      };
    }

    if (session.status === 'ready') {
      const startedAtMs = session.startedAtMs ?? now;
      const deadlineAtMs =
        session.assessmentMode === 'exam' && session.timeLimitMinutes
          ? session.deadlineAtMs ?? startedAtMs + session.timeLimitMinutes * 60_000
          : null;

      if (session.persistedInSupabase && getSupabaseAssessmentConfig() && params.accessToken) {
        try {
          await patchSessionInSupabase(
            params.accessToken,
            params.userId,
            session.sessionId,
            {
              status: 'active',
              started_at: new Date(startedAtMs).toISOString(),
              deadline_at: deadlineAtMs ? new Date(deadlineAtMs).toISOString() : null,
              last_saved_at: new Date(now).toISOString(),
            },
            'in.(ready,active)'
          );
        } catch (dbErr) {
          logServerError('assessment.supabase_restore_session_fallback', dbErr);
        }
      }
      session.status = 'active';
      session.startedAtMs = startedAtMs;
      session.deadlineAtMs = deadlineAtMs;
      session.lastSavedAtMs = now;
      storeBoundedSession(session);
    }

    const practiceFeedback: Record<string, QuizAnswerCheckResponse> = {};
    const lockedQuestionIds: string[] = [];
    if (session.assessmentMode === 'practice') {
      for (const qId of Object.keys(session.questionLocks)) {
        const lockEntry = session.questionLocks[qId];
        const q = session.questions.find((item) => item.id === qId);
        if (q && lockEntry) {
          lockedQuestionIds.push(qId);
          practiceFeedback[qId] =
            session.answeredPractice.get(qId) ||
            buildPracticeCheckResult(q, lockEntry.selectedOptionIndex);
        }
      }
    }

    const remainingSeconds =
      session.deadlineAtMs !== null
        ? Math.max(0, Math.ceil((session.deadlineAtMs - now) / 1000))
        : null;

    return {
      status: 'active',
      sessionId: session.sessionId,
      sessionToken: sealAssessmentSessionToken(session),
      quizId: session.quizId,
      title: session.title,
      subjectArea: session.subjectArea,
      format: session.format,
      difficulty: session.difficulty,
      assessmentMode: session.assessmentMode,
      timeLimitMinutes: session.timeLimitMinutes,
      startedAtMs: session.startedAtMs ?? now,
      deadlineAtMs: session.deadlineAtMs,
      serverNowMs: now,
      remainingSeconds,
      currentQuestionIndex: session.currentQuestionIndex,
      answers: { ...session.answers },
      questionStatus: { ...session.questionStatus },
      lockedQuestionIds,
      practiceFeedback,
      lastSavedAt: new Date(session.lastSavedAtMs).toISOString(),
      questions: stripAnswerKeysFromQuestions(session.questions),
    };
  });
}

export async function checkPracticeQuestionAnswer(params: {
  userId: string;
  accessToken: string | null;
  sessionId: string;
  sessionToken?: string | null;
  questionId: string;
  selectedOptionIndex: number;
}): Promise<QuizAnswerCheckResponse> {
  return runWithSessionLock(params.sessionId, async () => {
    const session = await resolveHydratedSession(
      params.userId,
      params.accessToken,
      params.sessionId,
      params.sessionToken
    );

    if (session.assessmentMode === 'exam') {
      throw new AssessmentHttpError(
        403,
        'Immediate answer checking is disabled during an active timed examination.'
      );
    }
    if (session.status === 'submitted' || session.status === 'submitting' || session.submitting) {
      throw new AssessmentHttpError(409, 'This quiz attempt has already been submitted.');
    }

    const questionIndex = session.questions.findIndex((q) => q.id === params.questionId);
    if (questionIndex === -1) {
      throw new AssessmentHttpError(404, 'Question not found in this quiz session.');
    }
    const question = session.questions[questionIndex];

    if (
      !Number.isInteger(params.selectedOptionIndex) ||
      params.selectedOptionIndex < 0 ||
      params.selectedOptionIndex >= question.options.length
    ) {
      throw new AssessmentHttpError(400, 'Invalid selected answer option index.');
    }

    const existing = session.answeredPractice.get(question.id);
    if (existing) {
      return {
        ...existing,
        sessionToken: sealAssessmentSessionToken(session),
      };
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    if (session.status === 'ready') {
      session.status = 'active';
      session.startedAtMs = session.startedAtMs ?? now;
    }

    const result = buildPracticeCheckResult(question, params.selectedOptionIndex);
    const nextAnswers: Record<string, StudentAnswer> = {
      ...session.answers,
      [question.id]: {
        questionId: question.id,
        selectedOptionIndex: params.selectedOptionIndex,
      },
    };
    const nextLocks: Record<string, PracticeQuestionLockEntry> = {
      ...session.questionLocks,
      [question.id]: {
        questionId: question.id,
        selectedOptionIndex: params.selectedOptionIndex,
        lockedAt: nowIso,
      },
    };
    const nextStatus = computeQuestionStatusMap(session.questions, nextAnswers);

    if (session.persistedInSupabase && getSupabaseAssessmentConfig() && params.accessToken) {
      try {
        const patched = await patchSessionInSupabase(
          params.accessToken,
          params.userId,
          session.sessionId,
          {
            status: 'active',
            started_at: session.startedAtMs ? new Date(session.startedAtMs).toISOString() : nowIso,
            current_question_index: questionIndex,
            answers: nextAnswers,
            question_status: nextStatus,
            question_locks: nextLocks,
            last_saved_at: nowIso,
          },
          'in.(ready,active)'
        );
        if (!patched) {
          throw new AssessmentHttpError(409, 'This quiz attempt has already been submitted.');
        }
      } catch (dbErr) {
        if (dbErr instanceof AssessmentHttpError) throw dbErr;
        logServerError('assessment.supabase_check_practice_fallback', dbErr);
      }
    }

    session.answers = nextAnswers;
    session.questionLocks = nextLocks;
    session.questionStatus = nextStatus;
    session.currentQuestionIndex = questionIndex;
    session.lastSavedAtMs = now;
    session.answeredPractice.set(question.id, result);
    storeBoundedSession(session);

    return {
      ...result,
      sessionToken: sealAssessmentSessionToken(session),
    };
  });
}

const EXAM_DEADLINE_GRACE_MS = 15_000;

async function executeServerAssessmentGrading(params: {
  session: ServerAssessmentSession;
  userId: string;
  accessToken: string | null;
  submittedAnswers: StudentAnswer[];
  clientElapsedSeconds?: number;
  autoSubmitted: boolean;
  allowExpiredServerAutoSubmit: boolean;
}): Promise<QuizGradingResponse> {
  const { session } = params;

  if (session.status === 'submitted' || session.submitting) {
    throw new AssessmentHttpError(409, 'This assessment has already been submitted.');
  }

  session.submitting = true;
  let claimedDbSubmitLock = false;

  try {
    const now = Date.now();
    if (
      !params.allowExpiredServerAutoSubmit &&
      session.assessmentMode === 'exam' &&
      session.deadlineAtMs !== null
    ) {
      const allowedGrace = params.autoSubmitted ? 45_000 : EXAM_DEADLINE_GRACE_MS;
      if (now > session.deadlineAtMs + allowedGrace) {
        throw new AssessmentHttpError(
          403,
          'This examination deadline has expired and can no longer be submitted.'
        );
      }
    }

    const useSupabase = Boolean(getSupabaseAssessmentConfig() && params.accessToken);
    if (session.persistedInSupabase && useSupabase && params.accessToken) {
      const lockedRow = await patchSessionInSupabase(
        params.accessToken,
        params.userId,
        session.sessionId,
        {
          status: 'submitting',
          last_saved_at: new Date(now).toISOString(),
        },
        'in.(ready,active)'
      );

      if (!lockedRow) {
        session.status = 'submitted';
        throw new AssessmentHttpError(409, 'This assessment has already been submitted.');
      }
      claimedDbSubmitLock = true;

      const alreadyPersisted = await hasSubmittedSessionInSupabase(
        params.accessToken,
        params.userId,
        session.sessionId
      );
      if (alreadyPersisted) {
        await patchSessionInSupabase(
          params.accessToken,
          params.userId,
          session.sessionId,
          { status: 'submitted', submitted_at: new Date(now).toISOString() },
          'eq.submitting'
        ).catch(() => null);
        session.status = 'submitted';
        throw new AssessmentHttpError(409, 'This assessment has already been submitted.');
      }
    }

    const answerMap = new Map<string, StudentAnswer>();
    for (const ans of Array.isArray(params.submittedAnswers) ? params.submittedAnswers : []) {
      if (ans && typeof ans.questionId === 'string') {
        answerMap.set(ans.questionId, ans);
      }
    }

    const gradedResults: GradedQuestionResult[] = [];
    const normalizedAnswers: StudentAnswer[] = [];
    const finalAnswersRecord: Record<string, StudentAnswer> = {};
    const letter = (i: number) => String.fromCharCode(65 + i);

    for (let idx = 0; idx < session.questions.length; idx++) {
      const q = session.questions[idx];
      const practiced = session.answeredPractice.get(q.id);
      const locked = session.questionLocks[q.id];
      const saved = session.answers[q.id];
      const ans = answerMap.get(q.id);

      const rawSelected = practiced
        ? practiced.selectedOptionIndex
        : locked
          ? locked.selectedOptionIndex
          : ans !== undefined
            ? ans.selectedOptionIndex
            : saved?.selectedOptionIndex;

      if (
        rawSelected !== undefined &&
        rawSelected !== null &&
        (!Number.isInteger(rawSelected) || rawSelected < 0 || rawSelected >= q.options.length)
      ) {
        throw new AssessmentHttpError(400, 'Invalid selected answer option index.');
      }

      const selected = rawSelected !== undefined && rawSelected !== null ? rawSelected : null;
      const normalizedEntry: StudentAnswer = {
        questionId: q.id,
        selectedOptionIndex: selected,
      };
      normalizedAnswers.push(normalizedEntry);
      finalAnswersRecord[q.id] = normalizedEntry;

      const correctIdx = q.correctOptionIndex;
      if (selected === null) {
        gradedResults.push({
          questionId: q.id,
          number: q.number || idx + 1,
          type: 'objective',
          question: q.question,
          options: [...q.options],
          correctOptionIndex: correctIdx,
          selectedOptionIndex: null,
          studentAnswerDisplay: 'No answer selected',
          expectedAnswerDisplay: `${letter(correctIdx)}. ${optionsText(q, correctIdx)}`,
          status: 'unanswered',
          marksAwarded: 0,
          maxMarks: q.maxMarks,
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
          options: [...q.options],
          correctOptionIndex: correctIdx,
          selectedOptionIndex: selected,
          studentAnswerDisplay: `${letter(selected)}. ${q.options[selected] || ''}`,
          expectedAnswerDisplay: `${letter(correctIdx)}. ${optionsText(q, correctIdx)}`,
          status: 'correct',
          marksAwarded: q.maxMarks,
          maxMarks: q.maxMarks,
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
          options: [...q.options],
          correctOptionIndex: correctIdx,
          selectedOptionIndex: selected,
          studentAnswerDisplay: `${letter(selected)}. ${q.options[selected] || ''}`,
          expectedAnswerDisplay: `${letter(correctIdx)}. ${optionsText(q, correctIdx)}`,
          status: 'incorrect',
          marksAwarded: 0,
          maxMarks: q.maxMarks,
          feedback: `Incorrect. You selected option ${letter(selected)}, whereas option ${letter(
            correctIdx
          )} is correct.`,
          explanation: q.explanation,
          aiEvaluated: false,
        });
      }
    }

    const correctCount = gradedResults.filter((r) => r.status === 'correct').length;
    const unansweredCount = gradedResults.filter((r) => r.status === 'unanswered').length;
    const incorrectCount = gradedResults.length - correctCount - unansweredCount;
    const earnedMarks = Math.round(gradedResults.reduce((acc, r) => acc + r.marksAwarded, 0) * 10) / 10;
    const maxMarks = gradedResults.reduce((acc, r) => acc + r.maxMarks, 0);
    const percentage = maxMarks > 0 ? Math.round((earnedMarks / maxMarks) * 1000) / 10 : 0;

    let performanceAssessment = '';
    if (percentage >= 85) {
      performanceAssessment =
        'Strong mastery demonstrated across the tested concepts. Review any minor missed nuances below to maintain retention.';
    } else if (percentage >= 70) {
      performanceAssessment =
        'Solid foundational grasp with a few conceptual gaps. Revisit the highlighted explanations and source references below.';
    } else if (percentage >= 50) {
      performanceAssessment =
        'Developing understanding. Focus your next revision session on the topics missed below before attempting another assessment.';
    } else {
      performanceAssessment =
        'Significant gaps identified in this assessment. Review your study summary and key definitions carefully, then retake this assessment.';
    }

    const serverElapsed =
      session.startedAtMs !== null
        ? Math.max(0, Math.round((now - session.startedAtMs) / 1000))
        : Math.max(
            0,
            Number.isFinite(Number(params.clientElapsedSeconds))
              ? Math.round(Number(params.clientElapsedSeconds))
              : 0
          );
    const timeTakenSeconds =
      session.assessmentMode === 'exam' && session.timeLimitMinutes
        ? Math.min(session.timeLimitMinutes * 60, serverElapsed)
        : Math.min(14400, serverElapsed);

    const responsePayload: QuizGradingResponse = {
      attemptId: null,
      totalQuestions: gradedResults.length,
      correctCount,
      incorrectCount,
      unansweredCount,
      earnedMarks,
      maxMarks,
      percentage,
      timeTakenSeconds,
      performanceAssessment,
      gradedResults,
    };

    const finalQuestionStatus = computeQuestionStatusMap(session.questions, finalAnswersRecord);

    if (useSupabase && params.accessToken) {
      try {
        const persisted = await persistAttemptToSupabase({
          accessToken: params.accessToken,
          userId: params.userId,
          sessionId: session.sessionId,
          quizId: session.quizId,
          title: session.title,
          format: session.format,
          difficulty: session.difficulty,
          answers: normalizedAnswers,
          grading: responsePayload,
        });
        if (persisted.duplicate) {
          if (session.persistedInSupabase) {
            await patchSessionInSupabase(
              params.accessToken,
              params.userId,
              session.sessionId,
              { status: 'submitted', submitted_at: new Date(now).toISOString() },
              'eq.submitting'
            ).catch(() => null);
          }
          session.status = 'submitted';
          throw new AssessmentHttpError(409, 'This assessment has already been submitted.');
        }
        responsePayload.attemptId = persisted.attemptId;

        if (session.persistedInSupabase) {
          await patchSessionInSupabase(
            params.accessToken,
            params.userId,
            session.sessionId,
            {
              status: 'submitted',
              submitted_at: new Date(now).toISOString(),
              answers: finalAnswersRecord,
              question_status: finalQuestionStatus,
              last_saved_at: new Date(now).toISOString(),
            },
            'eq.submitting'
          );
          claimedDbSubmitLock = false;
        }
      } catch (dbErr) {
        if (dbErr instanceof AssessmentHttpError) throw dbErr;
        logServerError('assessment.supabase_grade_persist_fallback', dbErr);
      }
    }

    session.answers = finalAnswersRecord;
    session.questionStatus = finalQuestionStatus;
    session.status = 'submitted';
    session.submittedAtMs = now;
    session.lastSavedAtMs = now;
    storeBoundedSession(session);
    return responsePayload;
  } catch (err) {
    if (session.persistedInSupabase && claimedDbSubmitLock && params.accessToken && session.status !== 'submitted') {
      await patchSessionInSupabase(
        params.accessToken,
        params.userId,
        session.sessionId,
        {
          status: 'active',
          last_saved_at: new Date().toISOString(),
        },
        'eq.submitting'
      ).catch(() => null);
    }
    throw err;
  } finally {
    session.submitting = false;
  }
}

function optionsText(q: ServerQuestionAnswerKey, idx: number): string {
  return q.options[idx] || q.expectedAnswer;
}

export async function submitAndGradeServerAssessment(params: {
  userId: string;
  accessToken: string | null;
  sessionId: string;
  sessionToken?: string | null;
  answers: StudentAnswer[];
  clientElapsedSeconds?: number;
  autoSubmitted?: boolean;
}): Promise<QuizGradingResponse> {
  return runWithSessionLock(params.sessionId, async () => {
    const session = await resolveHydratedSession(
      params.userId,
      params.accessToken,
      params.sessionId,
      params.sessionToken
    );
    return executeServerAssessmentGrading({
      session,
      userId: params.userId,
      accessToken: params.accessToken,
      submittedAnswers: params.answers,
      clientElapsedSeconds: params.clientElapsedSeconds,
      autoSubmitted: Boolean(params.autoSubmitted),
      allowExpiredServerAutoSubmit: false,
    });
  });
}

export function __unsafeExpireSessionDeadlineForTest(sessionId: string, deadlineAtMs: number): void {
  const session = assessmentSessions.get(sessionId);
  if (session) {
    session.deadlineAtMs = deadlineAtMs;
  }
}

export function __unsafeClearInMemorySessionsForTest(): void {
  assessmentSessions.clear();
}
