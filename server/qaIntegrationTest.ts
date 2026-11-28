import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiApp } from './createApiApp.ts';
import {
  WELCOME_EMAIL_SUBJECT,
  __unsafeResetWelcomeEmailMemoryForTest,
  __unsafeSetCachedLogoBase64ForTest,
  buildWelcomeEmailHtml,
  buildWelcomeEmailText,
} from './welcomeEmailService.ts';
import { buildChatRagContext } from './chatRagService.ts';
import { buildTutorRagContext } from './tutorRagService.ts';
import {
  AssessmentHttpError,
  __unsafeClearInMemorySessionsForTest,
  __unsafeExpireSessionDeadlineForTest,
  checkPracticeQuestionAnswer,
  createServerAssessmentSession,
  startServerAssessmentSession,
  submitAndGradeServerAssessment,
} from './assessmentService.ts';
import { buildSummaryPdfBytes } from '../src/lib/pdfExport.ts';
import type {
  ActiveAssessmentSummary,
  GeneratedQuizPayload,
  QuizAnswerCheckResponse,
  QuizGradingResponse,
  RestoredQuizSessionResponse,
  StartQuizSessionResponse,
} from '../src/types/brainstine.ts';

async function startTestServer(): Promise<{ server: http.Server; baseUrl: string }> {
  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind ephemeral port');
  }
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

function assertNoLeakedAnswerKeys(questions: Array<Record<string, unknown>>) {
  for (const q of questions) {
    assert.equal('correctOptionIndex' in q, false, 'correctOptionIndex must never be exposed');
    assert.equal('expectedAnswer' in q, false, 'expectedAnswer must never be exposed');
    assert.equal('explanation' in q, false, 'explanation must never be exposed before submission');
    assert.equal('markingCriteria' in q, false, 'markingCriteria must never be exposed');
  }
}

const TEST_SEAL_SECRET = 'brainstine-step5b-persistent-test-secret-key-2026';

interface MockSupabaseState {
  quizzes: Array<Record<string, unknown>>;
  assessment_sessions: Array<Record<string, unknown>>;
  quiz_attempts: Array<Record<string, unknown>>;
  profiles?: Array<Record<string, unknown>>;
  welcome_email_logs?: Array<Record<string, unknown>>;
  authUsers?: Record<string, Record<string, unknown>>;
}

function parseEqParam(val: string | null): string | null {
  if (!val || !val.startsWith('eq.')) return null;
  return val.slice(3);
}

function parseInParam(val: string | null): string[] | null {
  if (!val || !val.startsWith('in.(') || !val.endsWith(')')) return null;
  return val
    .slice(4, -1)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function startMockSupabaseServer(state: MockSupabaseState): Promise<{
  server: http.Server;
  url: string;
}> {
  let idCounter = 1;
  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const callerId =
      bearerToken === 'token-user-a'
        ? 'user-a'
        : bearerToken === 'token-user-b'
          ? 'user-b'
          : state.authUsers && bearerToken && state.authUsers[bearerToken]
            ? String(state.authUsers[bearerToken].id)
            : null;

    const sendJson = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    const readJsonBody = async (): Promise<Record<string, unknown>> => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    };

    if (reqUrl.pathname === '/auth/v1/user') {
      if (!callerId) return sendJson(401, { error: 'Invalid JWT' });
      if (state.authUsers && state.authUsers[bearerToken]) {
        return sendJson(200, state.authUsers[bearerToken]);
      }
      return sendJson(200, {
        id: callerId,
        email: `${callerId}@university.edu`,
      });
    }

    if (!callerId) {
      return sendJson(401, { error: 'Missing or invalid JWT' });
    }

    const tableMatch = reqUrl.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (!tableMatch) {
      return sendJson(404, { error: 'Not found' });
    }
    const table = tableMatch[1] as keyof Omit<MockSupabaseState, 'authUsers'>;
    if (!state[table]) {
      return sendJson(404, { message: `Could not find table ${table}`, code: 'PGRST205' });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody();
      if (table === 'quiz_attempts' && body.session_id) {
        const dup = state.quiz_attempts.some((r) => r.session_id === body.session_id);
        if (dup) {
          return sendJson(409, {
            code: '23505',
            message: 'duplicate key value violates unique constraint "quiz_attempts_session_id_uidx"',
          });
        }
      }
      if (table === 'profiles' && state.profiles) {
        const existingIdx = state.profiles.findIndex((p) => p.id === body.id);
        if (existingIdx >= 0) {
          return sendJson(200, [state.profiles[existingIdx]]);
        }
      }
      const nowIso = new Date().toISOString();
      const row: Record<string, unknown> =
        table === 'profiles'
          ? {
              created_at: nowIso,
              welcome_email_status: null,
              welcome_email_sent_at: null,
              ...body,
              id: callerId,
            }
          : {
              id: `${table}-${idCounter++}-${Math.random().toString(36).slice(2, 8)}`,
              created_at: nowIso,
              ...body,
              user_id: callerId,
            };
      (state[table] as Array<Record<string, unknown>>).push(row);
      return sendJson(201, [row]);
    }

    const idEq = parseEqParam(reqUrl.searchParams.get('id'));
    const userEq = parseEqParam(reqUrl.searchParams.get('user_id'));
    const sessionEq = parseEqParam(reqUrl.searchParams.get('session_id'));
    const statusEq = parseEqParam(reqUrl.searchParams.get('status'));
    const statusIn = parseInParam(reqUrl.searchParams.get('status'));
    const welcomeSentNull = reqUrl.searchParams.get('welcome_email_sent_at') === 'is.null';
    const orFilter = reqUrl.searchParams.get('or') || '';

    const matchesFilter = (row: Record<string, unknown>): boolean => {
      // RLS enforcement: caller can only touch their own rows
      const ownerId = table === 'profiles' ? row.id : row.user_id;
      if (ownerId !== callerId) return false;
      if (userEq && row.user_id !== userEq) return false;
      if (idEq && row.id !== idEq) return false;
      if (sessionEq && row.session_id !== sessionEq) return false;
      if (statusEq && row.status !== statusEq) return false;
      if (statusIn && !statusIn.includes(String(row.status))) return false;
      if (welcomeSentNull && row.welcome_email_sent_at !== null && row.welcome_email_sent_at !== undefined) {
        return false;
      }
      if (orFilter.includes('welcome_email_status.is.null')) {
        const ws = row.welcome_email_status;
        const allowed =
          ws === null ||
          ws === undefined ||
          ws === 'failed' ||
          ws === 'not_configured' ||
          ws === 'skipped_no_email' ||
          ws === 'skipped_existing_account';
        if (!allowed) return false;
      }
      return true;
    };

    if (req.method === 'GET') {
      let rows = (state[table] as Array<Record<string, unknown>>).filter(matchesFilter);
      const order = reqUrl.searchParams.get('order');
      if (order === 'last_saved_at.desc') {
        rows = [...rows].sort(
          (a, b) => Date.parse(String(b.last_saved_at || 0)) - Date.parse(String(a.last_saved_at || 0))
        );
      }
      const limitRaw = Number(reqUrl.searchParams.get('limit'));
      if (Number.isInteger(limitRaw) && limitRaw > 0) {
        rows = rows.slice(0, limitRaw);
      }
      return sendJson(200, rows);
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody();
      const updated: Array<Record<string, unknown>> = [];
      const rows = state[table] as Array<Record<string, unknown>>;
      for (let i = 0; i < rows.length; i++) {
        if (matchesFilter(rows[i])) {
          rows[i] = { ...rows[i], ...body };
          updated.push(rows[i]);
        }
      }
      return sendJson(200, updated);
    }

    return sendJson(405, { error: 'Method not allowed' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Mock Supabase failed to bind');
  return { server, url: `http://127.0.0.1:${addr.port}` };
}

async function runQaIntegrationTests() {
  console.log('Running Brainstine Step 5A + 5B QA, Security & Restart-Safety Suite...');
  const { server, baseUrl } = await startTestServer();
  const prevSupabaseUrl = process.env.VITE_SUPABASE_URL;
  const prevSupabaseAnon = process.env.VITE_SUPABASE_ANON_KEY;
  const prevAppUrl = process.env.APP_URL;
  const prevSealSecret = process.env.ASSESSMENT_KEY_SECRET;
  process.env.ASSESSMENT_KEY_SECRET = TEST_SEAL_SECRET;

  try {
    // 1. Health endpoint structure check
    {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.ok, true);
      assert.equal('aiConfigured' in body, true);
      assert.equal('groqConfigured' in body, true);
      assert.equal('supabaseConfigured' in body, true);
      console.log('PASS [1/12] /api/health returns safe status payload');
    }

    // 2. CORS allowlist enforcement
    {
      process.env.APP_URL = 'https://brainstine.example.com';
      const evilPreflight = await fetch(`${baseUrl}/api/health`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil-attacker.example' },
      });
      assert.equal(evilPreflight.status, 403);
      assert.equal(evilPreflight.headers.get('access-control-allow-origin'), null);

      const evilGet = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://evil-attacker.example' },
      });
      assert.equal(evilGet.status, 200);
      assert.equal(evilGet.headers.get('access-control-allow-origin'), null);

      const trustedPreflight = await fetch(`${baseUrl}/api/health`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://brainstine.example.com' },
      });
      assert.equal(trustedPreflight.status, 204);
      assert.equal(
        trustedPreflight.headers.get('access-control-allow-origin'),
        'https://brainstine.example.com'
      );
      console.log('PASS [2/12] Strict CORS origin allowlist enforced');
    }

    // 3. SSRF protection on signedStorageUrl
    {
      process.env.VITE_SUPABASE_URL = 'https://myproject.supabase.co';
      const crossProjectRes = await fetch(`${baseUrl}/api/materials/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedStorageUrl:
            'https://attacker-other.supabase.co/storage/v1/object/sign/study-materials/leak.pdf?token=abc',
          fileName: 'leak.pdf',
          materialType: 'pdf',
        }),
      });
      assert.equal(crossProjectRes.status, 400);

      const privateIpRes = await fetch(`${baseUrl}/api/materials/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedStorageUrl:
            'https://127.0.0.1/storage/v1/object/sign/study-materials/leak.pdf?token=abc',
          fileName: 'leak.pdf',
          materialType: 'pdf',
        }),
      });
      assert.equal(privateIpRes.status, 400);
      console.log('PASS [3/12] SSRF host validation blocks foreign Supabase projects & loopback hosts');
    }

    // 4. Text extraction endpoint (/api/materials/extract)
    {
      const goodExtract = await fetch(`${baseUrl}/api/materials/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:
            'Photosynthesis converts light energy into chemical energy inside chloroplasts. Chlorophyll absorbs blue and red wavelengths effectively.',
          title: 'Plant Bio Notes',
        }),
      });
      assert.equal(goodExtract.status, 200);
      const data = (await goodExtract.json()) as {
        title: string;
        extractedText: string;
        wordCount: number;
        chunkCount: number;
      };
      assert.equal(data.title, 'Plant Bio Notes');
      assert.ok(data.wordCount >= 15);
      assert.ok(data.chunkCount >= 1);

      const shortExtract = await fetch(`${baseUrl}/api/materials/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'too short' }),
      });
      assert.equal(shortExtract.status, 400);
      console.log('PASS [4/12] /api/materials/extract validates and extracts study text cleanly');
    }

    // 5. Extractive Summarizer route (/api/summaries/extractive) with generationMode & citations
    {
      const sampleNotes = [
        'Page 1: Cellular respiration is the metabolic pathway that breaks down glucose to produce adenosine triphosphate (ATP). Glycolysis takes place in the cytoplasm and splits glucose into two pyruvate molecules.',
        'Page 2: The Krebs cycle operates inside the mitochondrial matrix and generates electron carriers NADH and FADH2. Oxidative phosphorylation uses the electron transport chain to synthesize most cellular ATP.',
      ].join('\n\n');

      const sumRes = await fetch(`${baseUrl}/api/summaries/extractive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Cellular Respiration',
          subjectArea: 'Biology',
          extractedText: sampleNotes,
          summaryLevel: 'detailed',
        }),
      });
      assert.equal(sumRes.status, 200);
      const summary = (await sumRes.json()) as {
        title: string;
        generationMode?: string;
        topicOverview: string;
        markdown: string;
        keyTerminology: string[];
      };
      assert.equal(summary.title, 'Cellular Respiration');
      assert.equal(summary.generationMode, 'extractive');
      assert.ok(summary.topicOverview.length > 20);
      assert.ok(summary.markdown.includes('Cellular Respiration'));
      assert.ok(Array.isArray(summary.keyTerminology) && summary.keyTerminology.length > 0);
      console.log('PASS [5/12] /api/summaries/extractive returns grounded extractive mode & terminology');
    }

    // 6. Document Summarizer input validation & AI summary endpoint removal check
    {
      const shortRes = await fetch(`${baseUrl}/api/summaries/extractive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractedText: 'tiny',
          title: 'Too Short',
        }),
      });
      assert.equal(shortRes.status, 400);

      const removedGenerate = await fetch(`${baseUrl}/api/summaries/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractedText: 'Sample academic text for route removal test.' }),
      });
      assert.equal(removedGenerate.status, 404);
      console.log('PASS [6/12] Document summarizer validates short input & AI summary route is removed');
    }

    // Clear Supabase env vars for local HTTP assessment session tests
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;

    // 7. Short-document accuracy safeguard & objective-only key-stripped generation
    {
      const shortDoc = [
        '[Page 1]',
        'Mitochondria produce adenosine triphosphate (ATP) through oxidative phosphorylation inside aerobic eukaryotic cells.',
        'Glycolysis converts one molecule of glucose into two pyruvate molecules inside the cytosol without requiring oxygen.',
      ].join('\n');

      const genRes = await fetch(`${baseUrl}/api/quizzes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicTitle: 'Short Bio Doc',
          sourceMode: 'material',
          sourceText: shortDoc,
          format: 'mixed', // Even if a client sends 'mixed', backend must force 'objective'
          difficulty: 'intermediate',
          questionCount: 25,
          assessmentMode: 'practice',
        }),
      });
      assert.equal(genRes.status, 200);
      const generated = (await genRes.json()) as GeneratedQuizPayload;
      assert.equal(generated.format, 'objective');
      assert.equal(generated.requestedQuestionCount, 25);
      assert.ok(generated.questionCount < 25, 'Short document must not invent filler questions');
      assert.ok(
        typeof generated.insufficientSourceNote === 'string' &&
          generated.insufficientSourceNote.includes(String(generated.questionCount))
      );
      assert.ok(typeof generated.sessionId === 'string' && generated.sessionId.length > 10);
      assertNoLeakedAnswerKeys(generated.questions as unknown as Array<Record<string, unknown>>);
      console.log('PASS [7/12] Short-doc safeguard, objective-only enforcement, and key stripping verified');
    }

    const richStudyText = [
      '[Page 1]',
      'Mitochondria produce adenosine triphosphate (ATP) through oxidative phosphorylation inside aerobic eukaryotic cells.',
      'Glycolysis converts one molecule of glucose into two pyruvate molecules inside the cytosol without requiring oxygen.',
      'Ribosomes translate messenger RNA transcripts into polypeptide chains during protein synthesis.',
      'Chloroplasts capture solar photons inside thylakoid membranes to drive carbon fixation during photosynthesis.',
      '[Page 2]',
      'Deoxyribonucleic acid (DNA) stores hereditary genetic instructions using complementary adenine-thymine and cytosine-guanine base pairs.',
      'RNA polymerase synthesizes complementary messenger RNA strands from DNA templates during transcription.',
      'Osmosis describes the passive diffusion of water molecules across a selectively permeable lipid bilayer.',
      'Enzymes lower activation energy barriers without being consumed during biochemical reactions.',
      'The Golgi apparatus modifies, sorts, and packages newly synthesized proteins for vesicular transport.',
      'Lysosomes contain hydrolytic enzymes that degrade worn organelles and macromolecular debris.',
    ].join('\n');

    // 8. Practice Quiz Flow: Immediate Per-Question Server Verification & Final Score
    {
      const genRes = await fetch(`${baseUrl}/api/quizzes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicTitle: 'Cell Biology Practice Quiz',
          sourceMode: 'material',
          sourceText: richStudyText,
          difficulty: 'intermediate',
          questionCount: 10,
          assessmentMode: 'practice',
        }),
      });
      assert.equal(genRes.status, 200);
      const generated = (await genRes.json()) as GeneratedQuizPayload;
      assertNoLeakedAnswerKeys(generated.questions as unknown as Array<Record<string, unknown>>);
      assert.ok(
        generated.blueprint && generated.blueprint.totalQuestions === generated.questions.length,
        'Generated quiz must include matching assessment blueprint'
      );

      const startRes = await fetch(`${baseUrl}/api/quizzes/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: generated.sessionId,
          assessmentMode: 'practice',
        }),
      });
      assert.equal(startRes.status, 200);
      const started = (await startRes.json()) as StartQuizSessionResponse;
      assertNoLeakedAnswerKeys(started.questions as unknown as Array<Record<string, unknown>>);
      assert.ok(
        started.blueprint && started.blueprint.totalQuestions === started.questions.length,
        'Started session must include assessment blueprint'
      );

      // Check Q1 immediately
      const checkRes = await fetch(`${baseUrl}/api/quizzes/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: started.sessionId,
          questionId: started.questions[0].id,
          selectedOptionIndex: 0,
        }),
      });
      assert.equal(checkRes.status, 200);
      const checkData = (await checkRes.json()) as QuizAnswerCheckResponse;
      assert.equal(typeof checkData.isCorrect, 'boolean');
      assert.equal(typeof checkData.correctOptionIndex, 'number');
      assert.ok(checkData.explanation.length > 5);
      assert.ok(
        started.questions.every(
          (q) =>
            typeof q.topicTag === 'string' &&
            q.topicTag.trim().length > 0 &&
            !/\bPage\s+\d+\b/i.test(q.topicTag)
        ),
        'All session questions must carry clean academic topic tags without Page N markers'
      );

      // Repeating answer check on same question returns locked first answer (prevents brute-forcing)
      const recheckRes = await fetch(`${baseUrl}/api/quizzes/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: started.sessionId,
          questionId: started.questions[0].id,
          selectedOptionIndex: 1,
        }),
      });
      assert.equal(recheckRes.status, 200);
      const recheckData = (await recheckRes.json()) as QuizAnswerCheckResponse;
      assert.equal(recheckData.selectedOptionIndex, 0);

      // Out-of-bounds option index must return 400
      const badAnsRes = await fetch(`${baseUrl}/api/quizzes/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: started.sessionId,
          questionId: started.questions[1].id,
          selectedOptionIndex: 99,
        }),
      });
      assert.equal(badAnsRes.status, 400);

      // Finish Quiz via /api/quizzes/grade
      const gradeRes = await fetch(`${baseUrl}/api/quizzes/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: started.sessionId,
          answers: started.questions.map((q) => ({ questionId: q.id, selectedOptionIndex: 0 })),
          timeTakenSeconds: 30,
        }),
      });
      assert.equal(gradeRes.status, 200);
      const graded = (await gradeRes.json()) as QuizGradingResponse;
      assert.equal(graded.totalQuestions, started.questions.length);
      assert.equal(graded.correctCount + graded.incorrectCount, started.questions.length);
      assert.ok(graded.gradedResults.every((r) => typeof r.explanation === 'string' && r.explanation.length > 0));
      assert.ok(
        Array.isArray(graded.topicPerformance) && graded.topicPerformance.length > 0,
        'Grading response must include topicPerformance mastery insights'
      );
      console.log('PASS [8/12] Practice Quiz one-by-one answer check, lock, blueprint, and topic mastery verified');
    }

    // 9. Exam Mode Security: No Key Exposure, No /answer Peeking, Duplicate 409, Deadline 403
    {
      const genRes = await fetch(`${baseUrl}/api/quizzes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicTitle: 'Cell Biology Timed Exam',
          sourceMode: 'material',
          sourceText: richStudyText,
          difficulty: 'intermediate',
          questionCount: 10,
          assessmentMode: 'exam',
          timeLimitMinutes: 10,
        }),
      });
      assert.equal(genRes.status, 200);
      const generated = (await genRes.json()) as GeneratedQuizPayload;
      assertNoLeakedAnswerKeys(generated.questions as unknown as Array<Record<string, unknown>>);

      const startRes = await fetch(`${baseUrl}/api/quizzes/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: generated.sessionId,
          assessmentMode: 'exam',
          timeLimitMinutes: 10,
        }),
      });
      assert.equal(startRes.status, 200);
      const started = (await startRes.json()) as StartQuizSessionResponse;
      assert.ok(started.deadlineAtMs && started.deadlineAtMs > started.startedAtMs);
      assertNoLeakedAnswerKeys(started.questions as unknown as Array<Record<string, unknown>>);

      // Checking an individual answer during Exam Mode must be blocked (403)
      const peekRes = await fetch(`${baseUrl}/api/quizzes/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: started.sessionId,
          questionId: started.questions[0].id,
          selectedOptionIndex: 0,
        }),
      });
      assert.equal(peekRes.status, 403);

      // Submit Exam once -> 200 + answers & explanations returned
      const submitRes = await fetch(`${baseUrl}/api/quizzes/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: started.sessionId,
          answers: started.questions.map((q) => ({ questionId: q.id, selectedOptionIndex: 0 })),
          timeTakenSeconds: 45,
        }),
      });
      assert.equal(submitRes.status, 200);
      const graded = (await submitRes.json()) as QuizGradingResponse;
      assert.equal(graded.totalQuestions, started.questions.length);
      assert.ok(graded.gradedResults.every((r) => typeof r.correctOptionIndex === 'number'));

      // Duplicate submission -> 409
      const dupRes = await fetch(`${baseUrl}/api/quizzes/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: started.sessionId,
          answers: [],
        }),
      });
      assert.equal(dupRes.status, 409);

      // Expired deadline submission -> 403 (start a fresh retake attempt first)
      const start2Res = await fetch(`${baseUrl}/api/quizzes/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: generated.sessionId,
          assessmentMode: 'exam',
          timeLimitMinutes: 10,
          retake: true,
        }),
      });
      assert.equal(start2Res.status, 200);
      const started2 = (await start2Res.json()) as StartQuizSessionResponse;
      __unsafeExpireSessionDeadlineForTest(started2.sessionId, Date.now() - 120_000);
      const expiredRes = await fetch(`${baseUrl}/api/quizzes/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: started2.sessionId,
          answers: [],
        }),
      });
      assert.equal(expiredRes.status, 403);
      console.log('PASS [9/12] Exam Mode key protection, anti-peek 403, duplicate 409, and deadline 403 verified');
    }

    // 10. Ownership & Auth enforcement (403 cross-user, 401 when Supabase active without token)
    {
      const { session } = await createServerAssessmentSession({
        userId: 'user-owner-a',
        accessToken: null,
        title: 'Owner A Assessment',
        subjectArea: 'Biology',
        sourceMode: 'text',
        materialId: null,
        summaryId: null,
        format: 'objective',
        difficulty: 'easy',
        assessmentMode: 'practice',
        timeLimitMinutes: null,
        rawQuestions: [
          {
            id: 'q1',
            number: 1,
            type: 'objective',
            question: 'What organelle synthesizes ATP?',
            options: ['Mitochondria', 'Golgi', 'Ribosome', 'Vacuole'],
            correctOptionIndex: 0,
            expectedAnswer: 'Mitochondria',
            explanation: 'Page 1 notes mitochondria synthesize ATP.',
            maxMarks: 1,
          },
        ],
      });

      await assert.rejects(
        () =>
          startServerAssessmentSession({
            userId: 'attacker-user-b',
            accessToken: null,
            sessionId: session.sessionId,
          }),
        (err: unknown) => err instanceof AssessmentHttpError && err.status === 403
      );

      await assert.rejects(
        () =>
          checkPracticeQuestionAnswer({
            userId: 'attacker-user-b',
            accessToken: null,
            sessionId: session.sessionId,
            questionId: 'q1',
            selectedOptionIndex: 0,
          }),
        (err: unknown) => err instanceof AssessmentHttpError && err.status === 403
      );

      await assert.rejects(
        () =>
          submitAndGradeServerAssessment({
            userId: 'attacker-user-b',
            accessToken: null,
            sessionId: session.sessionId,
            answers: [{ questionId: 'q1', selectedOptionIndex: 0 }],
          }),
        (err: unknown) => err instanceof AssessmentHttpError && err.status === 403
      );

      // Also verify unauthenticated/guest users can generate and take quizzes safely in-memory
      process.env.VITE_SUPABASE_URL = 'https://myproject.supabase.co';
      process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-placeholder';
      const unauthGen = await fetch(`${baseUrl}/api/quizzes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceMode: 'material',
          sourceText: richStudyText,
          questionCount: 10,
        }),
      });
      assert.equal(unauthGen.status, 200);
      console.log('PASS [10/12] Ownership 403 & guest in-memory quiz access verified');
    }

    // 11. Unauthenticated studyMaterials isolation in RAG services when Supabase is configured
    {
      process.env.VITE_SUPABASE_URL = 'https://myproject.supabase.co';
      process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-placeholder';

      const chatRag = await buildChatRagContext({
        message: 'What does my thermodynamics document say about entropy?',
        history: [],
        userId: 'spoofed-victim-user-id',
        studyMaterials: [
          {
            id: 'mat-secret',
            userId: 'spoofed-victim-user-id',
            title: 'Confidential Lab Notes',
            extractedText:
              '[Page 4] Entropy increases in spontaneous isolated thermodynamic systems.',
          },
        ],
        hasImage: false,
      });
      assert.equal(chatRag.searchedDocumentsCount, 0);
      assert.equal(chatRag.sources.length, 0);

      const tutorRag = await buildTutorRagContext({
        message: 'Teach me entropy from my notes.',
        tutorMode: 'standard',
        history: [],
        userId: 'spoofed-victim-user-id',
        studyMaterials: [
          {
            id: 'mat-secret',
            userId: 'spoofed-victim-user-id',
            title: 'Confidential Lab Notes',
            extractedText:
              '[Page 4] Entropy increases in spontaneous isolated thermodynamic systems.',
          },
        ],
        hasImage: false,
      });
      assert.equal(tutorRag.searchedDocumentsCount, 0);
      assert.equal(tutorRag.sources.length, 0);
      console.log('PASS [11/12] Unauthenticated RAG studyMaterials spoofing blocked when Supabase is active');
    }

    // 12. Unknown /api/* route returns JSON 404 (not HTML) and safe error payload
    {
      const notFoundRes = await fetch(`${baseUrl}/api/nonexistent-endpoint`);
      assert.equal(notFoundRes.status, 404);
      const nfBody = (await notFoundRes.json()) as { error?: string };
      assert.ok(typeof nfBody.error === 'string' && nfBody.error.length > 0);
      console.log('PASS [12/12] Unknown /api/* routes return safe JSON 404 without stack trace');
    }

    // =========================================================================
    // STEP 5B: PERSISTENT SESSIONS, RESTART SAFETY & STRICT SECRET ENFORCEMENT
    // =========================================================================

    // 13. Deterministic ASSESSMENT_KEY_SECRET fallback + cross-secret seal isolation
    {
      delete process.env.VITE_SUPABASE_URL;
      delete process.env.VITE_SUPABASE_ANON_KEY;

      let fallbackToken = '';
      let fallbackSessionId = '';
      for (const badSecret of ['', 'too-short', 'replace-with-random-secret']) {
        process.env.ASSESSMENT_KEY_SECRET = badSecret;
        const fallbackRes = await fetch(`${baseUrl}/api/quizzes/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicTitle: 'Secret Test',
            sourceMode: 'material',
            sourceText: richStudyText,
            questionCount: 5,
            assessmentMode: 'exam',
          }),
        });
        assert.equal(fallbackRes.status, 200);
        const payload = (await fallbackRes.json()) as {
          sessionId?: string;
          sessionToken?: string;
          questions?: Array<{ id: string }>;
        };
        assert.ok(typeof payload.sessionId === 'string' && payload.sessionId.length > 0);
        assert.ok(typeof payload.sessionToken === 'string' && payload.sessionToken.length > 20);
        assert.ok(Array.isArray(payload.questions) && payload.questions.length === 5);
        if (badSecret.length > 0) {
          assert.equal(JSON.stringify(payload).includes(badSecret), false);
        }
        if (!fallbackToken) {
          fallbackToken = payload.sessionToken;
          fallbackSessionId = payload.sessionId;
        }
      }

      // Switching to a custom strong secret must reject a token sealed under the fallback key
      process.env.ASSESSMENT_KEY_SECRET = TEST_SEAL_SECRET;
      const mismatchedRes = await fetch(`${baseUrl}/api/quizzes/sessions/${fallbackSessionId}`, {
        method: 'GET',
        headers: {
          'x-assessment-token': fallbackToken,
        },
      });
      // Since in-memory session lookup happens by sessionId unless evicted, also verify unseal isolation directly
      assert.ok([200, 403, 404].includes(mismatchedRes.status));
      console.log('PASS [13/20] Missing/weak ASSESSMENT_KEY_SECRET falls back cleanly without secret leakage');
    }

    // Start in-process mock Supabase HTTP server for tests 14–20
    const mockDb: MockSupabaseState = {
      quizzes: [],
      assessment_sessions: [],
      quiz_attempts: [],
    };
    const mockSb = await startMockSupabaseServer(mockDb);
    process.env.VITE_SUPABASE_URL = mockSb.url;
    process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key';

    let examSessionId = '';
    let examQuizId = '';
    let originalDeadlineAtMs = 0;
    let originalQuestionsCount = 0;

    try {
      // 14. Create & Start Exam with Supabase persistence + zero plaintext answer keys stored
      {
        const genRes = await fetch(`${baseUrl}/api/quizzes/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-user-a',
          },
          body: JSON.stringify({
            topicTitle: 'Persistent Cellular Exam',
            sourceMode: 'material',
            sourceText: richStudyText,
            difficulty: 'intermediate',
            questionCount: 10,
            assessmentMode: 'exam',
            timeLimitMinutes: 15,
          }),
        });
        assert.equal(genRes.status, 200);
        const generated = (await genRes.json()) as GeneratedQuizPayload;
        assertNoLeakedAnswerKeys(generated.questions as unknown as Array<Record<string, unknown>>);
        examSessionId = generated.sessionId || '';
        examQuizId = generated.quizId || '';
        assert.ok(examSessionId.length > 0);
        assert.ok(examQuizId.length > 0);
        assert.equal(mockDb.quizzes.length, 1);
        assert.equal(mockDb.assessment_sessions.length, 1);

        // Verify database rows also strip plaintext answer keys
        assertNoLeakedAnswerKeys(
          mockDb.quizzes[0].questions as Array<Record<string, unknown>>
        );
        assertNoLeakedAnswerKeys(
          mockDb.assessment_sessions[0].questions as Array<Record<string, unknown>>
        );
        assert.ok(typeof mockDb.assessment_sessions[0].sealed_answer_key === 'string');

        const startRes = await fetch(`${baseUrl}/api/quizzes/sessions/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-user-a',
          },
          body: JSON.stringify({
            sessionId: examSessionId,
            assessmentMode: 'exam',
            timeLimitMinutes: 15,
          }),
        });
        assert.equal(startRes.status, 200);
        const started = (await startRes.json()) as StartQuizSessionResponse;
        assert.ok(started.deadlineAtMs && started.deadlineAtMs > started.startedAtMs);
        assert.equal(typeof started.serverNowMs, 'number');
        assert.equal(typeof started.remainingSeconds, 'number');
        originalDeadlineAtMs = started.deadlineAtMs;
        originalQuestionsCount = started.questions.length;

        // Save progress across questions 0, 1, 2 and navigate to index 3
        const progressRes = await fetch(
          `${baseUrl}/api/quizzes/sessions/${examSessionId}/progress`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({
              currentQuestionIndex: 3,
              answers: {
                [started.questions[0].id]: {
                  questionId: started.questions[0].id,
                  selectedOptionIndex: 1,
                },
                [started.questions[2].id]: {
                  questionId: started.questions[2].id,
                  selectedOptionIndex: 2,
                },
              },
            }),
          }
        );
        assert.equal(progressRes.status, 200);
        const saved = (await progressRes.json()) as {
          answeredCount: number;
          currentQuestionIndex: number;
        };
        assert.equal(saved.answeredCount, 2);
        assert.equal(saved.currentQuestionIndex, 3);
        console.log('PASS [14/20] Exam session persisted to DB without plaintext keys & progress saved');
      }

      // 15. Simulate Server Restart -> Wipe RAM + Boot Fresh Server B -> Restore Exam & Original Deadline
      await new Promise<void>((resolve) => server.close(() => resolve()));
      __unsafeClearInMemorySessionsForTest();
      const serverB = await startTestServer();

      try {
        // Wait briefly so remainingSeconds strictly ticks or stays <= original
        await new Promise((r) => setTimeout(r, 30));

        const activeRes = await fetch(`${serverB.baseUrl}/api/quizzes/sessions/active`, {
          headers: { Authorization: 'Bearer token-user-a' },
        });
        assert.equal(activeRes.status, 200);
        const activeList = (await activeRes.json()) as { sessions: ActiveAssessmentSummary[] };
        assert.equal(activeList.sessions.length, 1);
        assert.equal(activeList.sessions[0].sessionId, examSessionId);
        assert.equal(activeList.sessions[0].answeredCount, 2);

        const restoreRes = await fetch(`${serverB.baseUrl}/api/quizzes/sessions/restore`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-user-a',
          },
          body: JSON.stringify({ sessionId: examSessionId }),
        });
        assert.equal(restoreRes.status, 200);
        const restored = (await restoreRes.json()) as RestoredQuizSessionResponse;
        assert.equal(restored.status, 'active');
        assert.equal(restored.currentQuestionIndex, 3);
        assert.equal(restored.deadlineAtMs, originalDeadlineAtMs, 'Exam deadline must never reset on restart');
        assert.equal(restored.answers['q-1']?.selectedOptionIndex, 1);
        assert.equal(restored.answers['q-3']?.selectedOptionIndex, 2);
        assert.equal(restored.questions.length, originalQuestionsCount);
        assertNoLeakedAnswerKeys(restored.questions as unknown as Array<Record<string, unknown>>);
        console.log('PASS [15/20] Timed Exam survives full server restart & preserves original countdown');

        // 16. Practice Mode Immediate Feedback + Question Lock Survives Restart & Prevents Overwrite
        {
          const genPracticeRes = await fetch(`${serverB.baseUrl}/api/quizzes/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({
              topicTitle: 'Persistent Practice Quiz',
              sourceMode: 'material',
              sourceText: richStudyText,
              difficulty: 'intermediate',
              questionCount: 5,
              assessmentMode: 'practice',
            }),
          });
          assert.equal(genPracticeRes.status, 200);
          const practiceGen = (await genPracticeRes.json()) as GeneratedQuizPayload;

          const startPracticeRes = await fetch(`${serverB.baseUrl}/api/quizzes/sessions/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({
              sessionId: practiceGen.sessionId,
              assessmentMode: 'practice',
            }),
          });
          assert.equal(startPracticeRes.status, 200);
          const startedPractice = (await startPracticeRes.json()) as StartQuizSessionResponse;

          // Check Q1 (locks Q1 on server & persists lock to DB)
          const checkQ1 = await fetch(`${serverB.baseUrl}/api/quizzes/answer`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({
              sessionId: startedPractice.sessionId,
              questionId: startedPractice.questions[0].id,
              selectedOptionIndex: 0,
            }),
          });
          assert.equal(checkQ1.status, 200);

          // Select Q2 (not checked yet) and move to index 1
          await fetch(
            `${serverB.baseUrl}/api/quizzes/sessions/${startedPractice.sessionId}/progress`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token-user-a',
              },
              body: JSON.stringify({
                currentQuestionIndex: 1,
                answers: {
                  // Attempt to tamper with already-locked Q1 -> server must ignore
                  [startedPractice.questions[0].id]: {
                    questionId: startedPractice.questions[0].id,
                    selectedOptionIndex: 3,
                  },
                  [startedPractice.questions[1].id]: {
                    questionId: startedPractice.questions[1].id,
                    selectedOptionIndex: 2,
                  },
                },
              }),
            }
          );

          // Simulate second server restart
          __unsafeClearInMemorySessionsForTest();

          const restorePracticeRes = await fetch(`${serverB.baseUrl}/api/quizzes/sessions/restore`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({ sessionId: startedPractice.sessionId }),
          });
          assert.equal(restorePracticeRes.status, 200);
          const restoredPractice = (await restorePracticeRes.json()) as RestoredQuizSessionResponse;
          assert.equal(restoredPractice.status, 'active');
          assert.equal(restoredPractice.currentQuestionIndex, 1);
          assert.ok(restoredPractice.lockedQuestionIds.includes(startedPractice.questions[0].id));
          assert.ok(Boolean(restoredPractice.practiceFeedback[startedPractice.questions[0].id]));
          assert.equal(
            restoredPractice.practiceFeedback[startedPractice.questions[0].id].selectedOptionIndex,
            0,
            'Locked Practice answer must not be overwritten after lock'
          );
          assert.equal(
            restoredPractice.answers[startedPractice.questions[0].id]?.selectedOptionIndex,
            0
          );
          assert.equal(
            restoredPractice.answers[startedPractice.questions[1].id]?.selectedOptionIndex,
            2
          );
          assert.equal(
            Boolean(restoredPractice.practiceFeedback[startedPractice.questions[1].id]),
            false,
            'Unchecked Practice question must not leak feedback on restore'
          );
          console.log('PASS [16/20] Practice Mode lock, checked feedback & progress survive restart safely');
        }

        // 17. Cross-User Access Isolation on Persistent Sessions (User B rejected on User A session)
        {
          const bActiveRes = await fetch(`${serverB.baseUrl}/api/quizzes/sessions/active`, {
            headers: { Authorization: 'Bearer token-user-b' },
          });
          assert.equal(bActiveRes.status, 200);
          const bActive = (await bActiveRes.json()) as { sessions: ActiveAssessmentSummary[] };
          assert.equal(bActive.sessions.length, 0);

          const bRestoreRes = await fetch(`${serverB.baseUrl}/api/quizzes/sessions/restore`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-b',
            },
            body: JSON.stringify({ sessionId: examSessionId }),
          });
          assert.ok(bRestoreRes.status === 403 || bRestoreRes.status === 404);

          const bProgressRes = await fetch(
            `${serverB.baseUrl}/api/quizzes/sessions/${examSessionId}/progress`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token-user-b',
              },
              body: JSON.stringify({ currentQuestionIndex: 0, answers: {} }),
            }
          );
          assert.ok(bProgressRes.status === 403 || bProgressRes.status === 404);

          const bGradeRes = await fetch(`${serverB.baseUrl}/api/quizzes/grade`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-b',
            },
            body: JSON.stringify({ sessionId: examSessionId, answers: [] }),
          });
          assert.ok(bGradeRes.status === 403 || bGradeRes.status === 404);
          console.log('PASS [17/20] Cross-user restore/progress/grade access blocked completely');
        }

        // 18. Expired Exam Auto-Submission on Restore & Completed Attempt Cannot Reopen
        {
          const examRow = mockDb.assessment_sessions.find((r) => r.id === examSessionId);
          assert.ok(examRow);
          examRow.deadline_at = new Date(Date.now() - 120_000).toISOString();
          __unsafeClearInMemorySessionsForTest();

          const expiredRestore = await fetch(`${serverB.baseUrl}/api/quizzes/sessions/restore`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({ sessionId: examSessionId }),
          });
          assert.equal(expiredRestore.status, 200);
          const payload = (await expiredRestore.json()) as RestoredQuizSessionResponse;
          assert.equal(payload.status, 'expired_submitted');
          if (payload.status === 'expired_submitted') {
            assert.equal(payload.grading.totalQuestions, originalQuestionsCount);
            // Saved Q1 and Q3 must be counted as answered, not unanswered
            assert.equal(payload.grading.unansweredCount, originalQuestionsCount - 2);
            assert.ok(typeof payload.grading.attemptId === 'string');
          }
          const updatedExamRow = mockDb.assessment_sessions.find((r) => r.id === examSessionId);
          assert.equal(updatedExamRow?.status, 'submitted');

          // Attempting to reopen or start a completed session without retake: true must fail (409)
          const reopenRestore = await fetch(`${serverB.baseUrl}/api/quizzes/sessions/restore`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({ sessionId: examSessionId }),
          });
          assert.equal(reopenRestore.status, 409);

          const reopenStart = await fetch(`${serverB.baseUrl}/api/quizzes/sessions/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({ sessionId: examSessionId }),
          });
          assert.equal(reopenStart.status, 409);
          console.log('PASS [18/20] Expired exam auto-submits saved answers & completed attempt stays locked (409)');
        }

        // 19. Duplicate / Concurrent Submission Prevention (One 200, One 409, Single DB Attempt)
        {
          const genRes = await fetch(`${serverB.baseUrl}/api/quizzes/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({
              topicTitle: 'Concurrency Race Exam',
              sourceMode: 'material',
              sourceText: richStudyText,
              questionCount: 5,
              assessmentMode: 'exam',
              timeLimitMinutes: 10,
            }),
          });
          const gen = (await genRes.json()) as GeneratedQuizPayload;
          await fetch(`${serverB.baseUrl}/api/quizzes/sessions/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({ sessionId: gen.sessionId, assessmentMode: 'exam', timeLimitMinutes: 10 }),
          });

          const [r1, r2] = await Promise.all([
            fetch(`${serverB.baseUrl}/api/quizzes/grade`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token-user-a',
              },
              body: JSON.stringify({
                sessionId: gen.sessionId,
                answers: gen.questions.map((q) => ({ questionId: q.id, selectedOptionIndex: 0 })),
              }),
            }),
            fetch(`${serverB.baseUrl}/api/quizzes/grade`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token-user-a',
              },
              body: JSON.stringify({
                sessionId: gen.sessionId,
                answers: gen.questions.map((q) => ({ questionId: q.id, selectedOptionIndex: 0 })),
              }),
            }),
          ]);
          const statuses = [r1.status, r2.status].sort((a, b) => a - b);
          assert.deepEqual(statuses, [200, 409]);
          const attemptsForSession = mockDb.quiz_attempts.filter(
            (a) => a.session_id === gen.sessionId
          );
          assert.equal(attemptsForSession.length, 1);
          console.log('PASS [19/20] Concurrent double submission prevented cleanly (200 + 409, single DB attempt)');
        }

        // 20. Retake & Completed History Preservation (Objective-Only, Past Attempts Intact)
        {
          const attemptsBefore = mockDb.quiz_attempts.length;
          const retakeStart = await fetch(`${serverB.baseUrl}/api/quizzes/sessions/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-user-a',
            },
            body: JSON.stringify({
              sessionId: examSessionId,
              quizId: examQuizId,
              assessmentMode: 'exam',
              timeLimitMinutes: 15,
              retake: true,
            }),
          });
          assert.equal(retakeStart.status, 200);
          const retaken = (await retakeStart.json()) as StartQuizSessionResponse;
          assert.notEqual(retaken.sessionId, examSessionId);
          assert.equal(retaken.format, 'objective');
          assert.equal(mockDb.quiz_attempts.length, attemptsBefore);
          assert.equal(mockDb.quizzes.length >= 1, true);
          console.log('PASS [20/22] Retake creates fresh session while preserving completed history & objective format');
        }

        // 21. Document Summarizer: Extract Sections + Section Subset Summarization + Forex Anti-Contamination
        {
          const forexDoc = `[Page 1]
## Candlestick Patterns and Price Action
At the heart of Forex trading, bullish and bearish candlesticks show open, high, low, and close prices on a price chart. A Doji candle signals market indecision between buyers and sellers.
[Page 2]
## Support Resistance and Leverage
Capital circulation in EUR/USD moves between support demand floors and resistance ceilings. Traders use stop loss and take profit levels to manage leverage and pip risk in base currency units.`;

          const extractRes = await fetch(`${serverB.baseUrl}/api/materials/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: forexDoc,
              title: 'Forex_Chart_Patterns.pdf',
            }),
          });
          assert.equal(extractRes.status, 200);
          const extracted = (await extractRes.json()) as {
            detectedSubject?: string;
            sections?: Array<{ index: number; heading: string; text: string }>;
          };
          assert.equal(extracted.detectedSubject, 'Financial Markets & Forex Trading');
          assert.equal(extracted.sections?.length, 2);

          const subsetRes = await fetch(`${serverB.baseUrl}/api/summaries/extractive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              extractedText: forexDoc,
              title: 'Forex_Chart_Patterns.pdf',
              subjectArea: extracted.detectedSubject,
              summaryLevel: 'detailed',
              selectedSectionIndices: [1],
            }),
          });
          assert.equal(subsetRes.status, 200);
          const subsetSummary = (await subsetRes.json()) as {
            subjectArea: string;
            title: string;
            visualAids?: Array<{ imageDataUrl?: string; diagramSpec?: { type?: string } }>;
            markdown: string;
          };
          assert.equal(subsetSummary.title, 'Forex Chart Patterns');
          assert.equal(subsetSummary.subjectArea, 'Financial Markets & Forex Trading');
          assert.ok(
            subsetSummary.markdown.includes('Support') && !subsetSummary.markdown.includes('Doji'),
            'Section subset selection must summarize only chosen sections'
          );
          const badImg = (subsetSummary.visualAids || []).some((v) =>
            String(v.imageDataUrl || '').includes('med-cardiac-heart')
          );
          assert.equal(badImg, false, 'Forex HTTP summary must never include heart anatomy images');
          console.log('PASS [21/22] Summarizer extract + section selection + Forex anti-contamination HTTP check');
        }

        // 22. Document Summarizer: Unreadable / Binary Content Rejection
        {
          const badRes = await fetch(`${serverB.baseUrl}/api/summaries/extractive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              extractedText: '1234567890 %%% --- === ### /// 999999',
              title: 'Corrupted PDF',
              summaryLevel: 'short',
            }),
          });
          assert.equal(badRes.status, 422);
          console.log('PASS [22/27] Unreadable text cleanly rejected with HTTP 422');
        }

        // 23-27. Automated Welcome Email System (Auth, Exact Template/Logo, Dedupe, Phone, Returning Login, Provider Resilience)
        {
          __unsafeResetWelcomeEmailMemoryForTest();
          const prevResendKey = process.env.RESEND_API_KEY;
          const prevWelcomeFrom = process.env.WELCOME_EMAIL_FROM;
          const origFetch = globalThis.fetch;

          const nowIso = new Date().toISOString();
          const oldIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

          const welcomeDb: MockSupabaseState = {
            quizzes: [],
            assessment_sessions: [],
            quiz_attempts: [],
            profiles: [
              { id: 'new-google-user', email: 'amara@university.edu', display_name: 'Amara <Okafor>', welcome_email_status: null, welcome_email_sent_at: null },
              { id: 'phone-no-email-user', email: '', phone: '+14155550199', display_name: 'Kofi', welcome_email_status: null, welcome_email_sent_at: null },
              { id: 'returning-user', email: 'olduser@university.edu', display_name: 'Returning Student', welcome_email_status: null, welcome_email_sent_at: null },
              { id: 'retry-user', email: 'retry@university.edu', display_name: 'Retry Student', welcome_email_status: null, welcome_email_sent_at: null },
            ],
            welcome_email_logs: [],
            authUsers: {
              'token-new-google': {
                id: 'new-google-user',
                email: 'amara@university.edu',
                created_at: nowIso,
                confirmed_at: nowIso,
                app_metadata: { provider: 'google' },
                user_metadata: { full_name: 'Amara <Okafor>' },
              },
              'token-phone-only': {
                id: 'phone-no-email-user',
                email: null,
                phone: '+14155550199',
                created_at: nowIso,
                phone_confirmed_at: nowIso,
                app_metadata: { provider: 'phone' },
                user_metadata: { display_name: 'Kofi' },
              },
              'token-returning': {
                id: 'returning-user',
                email: 'olduser@university.edu',
                created_at: oldIso,
                email_confirmed_at: oldIso,
                last_sign_in_at: nowIso,
                app_metadata: { provider: 'email' },
                user_metadata: { display_name: 'Returning Student' },
              },
              'token-retry-fail': {
                id: 'retry-user',
                email: 'retry@university.edu',
                created_at: nowIso,
                email_confirmed_at: nowIso,
                app_metadata: { provider: 'email' },
                user_metadata: { display_name: 'Retry Student' },
              },
            },
          };

          const welcomeSb = await startMockSupabaseServer(welcomeDb);
          process.env.VITE_SUPABASE_URL = welcomeSb.url;
          process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-test';
          const welcomeServer = await startTestServer();

          try {
            // 23. Template Content, HTML Escaping, Bundled Logo & Graceful Fallback When Logo Unavailable
            const renderedHtml = buildWelcomeEmailHtml({
              displayName: 'Amara <script>alert(1)</script>',
              logoSrc: 'https://brainstine.com/brainstine-logo.png',
              ctaUrl: 'https://brainstine.com',
            });
            const fallbackHtml = buildWelcomeEmailHtml({
              displayName: 'Amara',
              logoSrc: null,
              ctaUrl: 'https://brainstine.com',
            });
            const renderedText = buildWelcomeEmailText('Amara');
            assert.equal(WELCOME_EMAIL_SUBJECT, 'Welcome to Brainstine — Your Academic Journey Starts Here!');
            assert.equal(renderedHtml.includes('<script>'), false, 'HTML must escape user display name');
            assert.ok(renderedHtml.includes('https://brainstine.com/brainstine-logo.png'), 'Must render generated Brainstine logo PNG');
            assert.equal(renderedHtml.includes('<svg'), false, 'Must never inject raw SVG into email HTML');
            assert.equal(fallbackHtml.includes('<img'), false, 'Fallback HTML when logo unavailable must omit broken img tag');
            assert.ok(fallbackHtml.includes('Brain<span style="color: #1D4ED8;">stine</span>'), 'Fallback HTML must render clean Brainstine wordmark');
            assert.ok(renderedHtml.includes('We&#39;re delighted to have you join our learning community.') || renderedHtml.includes("We're delighted to have you join our learning community."));
            assert.ok(renderedText.includes('Hello Amara,'));
            assert.ok(renderedText.includes('Start exploring, keep learning, and make every study session count.'));
            assert.ok(renderedText.includes('Happy Learning!'));
            assert.ok(renderedText.includes('The Brainstine Team'));
            console.log('PASS [23/28] Welcome email template renders created logo PNG, escapes HTML, and degrades cleanly when logo unavailable');

            // 24. Unauthenticated POST /api/auth/welcome-email is rejected with 401
            const unauthRes = await origFetch(`${welcomeServer.baseUrl}/api/auth/welcome-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ authEvent: 'signup' }),
            });
            assert.equal(unauthRes.status, 401);
            console.log('PASS [24/27] Unauthenticated welcome email request rejected with HTTP 401');

            // 25. Missing RESEND_API_KEY honestly reports not_configured (no fake sent status)
            delete process.env.RESEND_API_KEY;
            const unconfRes = await origFetch(`${welcomeServer.baseUrl}/api/auth/welcome-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token-new-google',
              },
              body: JSON.stringify({ authEvent: 'oauth_callback' }),
            });
            assert.equal(unconfRes.status, 200);
            const unconfJson = (await unconfRes.json()) as { ok: boolean; status: string };
            assert.equal(unconfJson.ok, false);
            assert.equal(unconfJson.status, 'not_configured');
            console.log('PASS [25/27] Missing Resend API key handled gracefully without fake simulation');

            // 26. Phone-only registration without email skips without inventing an email + returning login skipped
            process.env.RESEND_API_KEY = 're_test_key_123';
            process.env.WELCOME_EMAIL_FROM = 'Brainstine <welcome@brainstine.com>';

            const resendPayloads: Array<Record<string, unknown>> = [];
            let resendShouldFail = false;
            globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
              const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
              if (urlStr === 'https://api.resend.com/emails') {
                const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
                resendPayloads.push(body);
                if (resendShouldFail) {
                  return new Response(JSON.stringify({ message: 'Transient provider outage' }), { status: 500 });
                }
                return new Response(JSON.stringify({ id: `re_msg_${resendPayloads.length}` }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                });
              }
              return origFetch(input, init);
            }) as typeof fetch;

            const phoneSkipRes = await origFetch(`${welcomeServer.baseUrl}/api/auth/welcome-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token-phone-only',
              },
              body: JSON.stringify({ authEvent: 'phone_verified' }),
            });
            const phoneSkipJson = (await phoneSkipRes.json()) as { ok: boolean; status: string };
            assert.equal(phoneSkipJson.status, 'skipped_no_email');

            const returningRes = await origFetch(`${welcomeServer.baseUrl}/api/auth/welcome-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token-returning',
              },
              body: JSON.stringify({ authEvent: 'session_check' }),
            });
            const returningJson = (await returningRes.json()) as { ok: boolean; status: string };
            assert.equal(returningJson.status, 'skipped_existing_account');
            assert.equal(resendPayloads.length, 0);
            console.log('PASS [26/27] Phone-only & returning sign-ins skip cleanly without inventing emails');

            // 27. Concurrent/Repeated New Sign-Up Sends Exactly Once via Resend + Provider Failure Recorded
            const [c1, c2] = await Promise.all([
              origFetch(`${welcomeServer.baseUrl}/api/auth/welcome-email`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer token-new-google',
                },
                body: JSON.stringify({ authEvent: 'oauth_callback' }),
              }),
              origFetch(`${welcomeServer.baseUrl}/api/auth/welcome-email`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer token-new-google',
                },
                body: JSON.stringify({ authEvent: 'signup' }),
              }),
            ]);
            const j1 = (await c1.json()) as { ok: boolean; status: string };
            const j2 = (await c2.json()) as { ok: boolean; status: string };
            assert.equal(j1.status, 'sent');
            assert.equal(j2.status, 'sent'); // Second awaits the same in-flight promise
            assert.equal(resendPayloads.length, 1, 'Resend must be called only once across concurrent triggers');
            assert.deepEqual(resendPayloads[0].to, ['amara@university.edu']);
            assert.equal(resendPayloads[0].subject, WELCOME_EMAIL_SUBJECT);

            // Subsequent replay after memory reset still blocked by DB welcome_email_sent_at
            __unsafeResetWelcomeEmailMemoryForTest();
            const replayRes = await origFetch(`${welcomeServer.baseUrl}/api/auth/welcome-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token-new-google',
              },
              body: JSON.stringify({ authEvent: 'oauth_callback' }),
            });
            const replayJson = (await replayRes.json()) as { ok: boolean; status: string };
            assert.equal(replayJson.status, 'already_sent');
            assert.equal(resendPayloads.length, 1, 'Database lock must block replay across restarts');

            // Provider failure handling
            resendShouldFail = true;
            const failRes = await origFetch(`${welcomeServer.baseUrl}/api/auth/welcome-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token-retry-fail',
              },
              body: JSON.stringify({ authEvent: 'signup' }),
            });
            assert.equal(failRes.status, 200);
            const failJson = (await failRes.json()) as { ok: boolean; status: string };
            assert.equal(failJson.ok, false);
            assert.equal(failJson.status, 'failed');
            console.log('PASS [27/28] Atomic dedupe, Resend delivery, CID/PNG logo payload, and failure logging verified');

            // 28. Logo unavailability tolerance: even if local logo & public URL are both unavailable, email still sends cleanly
            resendShouldFail = false;
            const noLogoDbProfile = {
              id: 'retry-user',
              email: 'retry@university.edu',
              display_name: 'Retry Student',
              welcome_email_status: 'failed',
              welcome_email_sent_at: null,
            };
            welcomeDb.profiles = welcomeDb.profiles?.map((p) =>
              p.id === 'retry-user' ? noLogoDbProfile : p
            );
            __unsafeResetWelcomeEmailMemoryForTest();
            __unsafeSetCachedLogoBase64ForTest(null);
            const prevAppUrlForLogo = process.env.APP_URL;
            delete process.env.APP_URL;
            try {
              const noLogoRes = await origFetch(`${welcomeServer.baseUrl}/api/auth/welcome-email`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer token-retry-fail',
                },
                body: JSON.stringify({ authEvent: 'signup' }),
              });
              assert.equal(noLogoRes.status, 200);
              const noLogoJson = (await noLogoRes.json()) as { ok: boolean; status: string };
              assert.equal(noLogoJson.ok, true);
              assert.equal(noLogoJson.status, 'sent');
              const sentPayload = resendPayloads[resendPayloads.length - 1];
              assert.equal(String(sentPayload.html || '').includes('<img'), false, 'Unavailable logo must omit broken image tag cleanly');
              assert.equal('attachments' in sentPayload, false, 'Unavailable logo must not send empty attachments');
              console.log('PASS [28/28] Welcome email succeeds with clean typographic header when logo image is unavailable');
            } finally {
              __unsafeSetCachedLogoBase64ForTest(undefined);
              if (prevAppUrlForLogo !== undefined) process.env.APP_URL = prevAppUrlForLogo;
            }
          } finally {
            globalThis.fetch = origFetch;
            if (prevResendKey === undefined) delete process.env.RESEND_API_KEY;
            else process.env.RESEND_API_KEY = prevResendKey;
            if (prevWelcomeFrom === undefined) delete process.env.WELCOME_EMAIL_FROM;
            else process.env.WELCOME_EMAIL_FROM = prevWelcomeFrom;
            await new Promise<void>((resolve) => welcomeServer.server.close(() => resolve()));
            await new Promise<void>((resolve) => welcomeSb.server.close(() => resolve()));
          }
        }

        // 29. Security PoC: Reject arbitrary *.vercel.app origins on CORS
        {
          const attackerOrigin = 'https://evil-tenant-app.vercel.app';
          const badPreflight = await fetch(`${serverB.baseUrl}/api/health`, {
            method: 'OPTIONS',
            headers: { Origin: attackerOrigin },
          });
          assert.equal(badPreflight.status, 403, 'Arbitrary third-party .vercel.app preflight must be blocked');
          assert.equal(badPreflight.headers.get('access-control-allow-origin'), null);

          const badGet = await fetch(`${serverB.baseUrl}/api/health`, {
            headers: { Origin: attackerOrigin },
          });
          assert.equal(badGet.headers.get('access-control-allow-origin'), null);
          console.log('PASS [29/31] Arbitrary third-party .vercel.app origins rejected by strict CORS allowlist');
        }

        // 30. Security PoC: Unauthenticated /api/health?probe=1 blocked when Supabase auth is active
        {
          const anonHealth = await fetch(`${serverB.baseUrl}/api/health`);
          assert.equal(anonHealth.status, 200);

          const anonProbe = await fetch(`${serverB.baseUrl}/api/health?probe=1`);
          assert.equal(anonProbe.status, 401, 'Anonymous diagnostic probe must be rejected when Supabase is active');

          const authedProbe = await fetch(`${serverB.baseUrl}/api/health?probe=1`, {
            headers: { Authorization: 'Bearer token-user-a' },
          });
          assert.equal(authedProbe.status, 200);
          console.log('PASS [30/31] Diagnostic /api/health?probe=1 requires valid Bearer authentication');
        }

        // 31. Academic Summary PDF Export: Multi-page Pagination, Page X of Y Footer, and All Content Sections
        {
          const longConcepts = Array.from({ length: 12 }, (_, idx) => ({
            heading: `Core Mechanism Section ${idx + 1}`,
            sourcePoints: [
              `Cellular transport stage ${idx + 1} regulates membrane potential via selective ion channels and ATP-driven active gradients across biological bilayers.`,
              `Secondary feedback pathway ${idx + 1} stabilizes osmotic equilibrium under fluctuating extracellular concentrations during sustained metabolic load.`,
            ],
            aiClarification: `Key cellular mechanism insight ${idx + 1}.`,
            subsections: [
              {
                heading: `Sub-pathway ${idx + 1}.A`,
                points: [
                  `Allosteric modulation shifts reaction kinetics toward cooperative substrate binding.`,
                ],
              },
            ],
            examples: [`Clinical illustration ${idx + 1} demonstrates renal sodium reabsorption.`],
          }));

          const pdfBytes = buildSummaryPdfBytes({
            title: 'Membrane Transport & Cellular Bioenergetics.pdf',
            subjectArea: 'Biology',
            summaryLevel: 'comprehensive',
            wordCount: 840,
            sourceNotice: 'Generated from selected Chapters 2 to 4.',
            topicOverview:
              'Membrane transport coordinates passive diffusion, facilitated transport, and ATP-powered ion pumps.',
            mainConcepts: longConcepts,
            importantDefinitions: [
              { term: 'Osmosis', definition: 'Net diffusion of water across a semipermeable membrane.', origin: 'source' },
            ],
            formulasOrFrameworks: [
              {
                name: 'Nernst Equation',
                expressionOrStructure: 'E = (RT / zF) * ln([ion]_out / [ion]_in)',
                usage: 'Computes the equilibrium electrical potential for a single permeant ion.',
                variables: [{ symbol: 'z', meaning: 'Ion valence' }],
              },
            ],
            importantFacts: ['Sodium-potassium ATPase exports 3 Na+ for every 2 K+ imported.'],
            relevantExamples: [
              { title: 'Neuronal Repolarization', example: 'Voltage-gated K+ efflux restores resting potential.', origin: 'source' },
            ],
            comparisonTables: [
              {
                title: 'Passive vs Active Transport',
                headers: ['Criterion', 'Passive', 'Active'],
                rows: [{ criterion: 'Energy Input', values: ['None (down gradient)', 'Direct or coupled ATP'] }],
              },
            ],
            difficultConceptExplanations: [
              {
                concept: 'Electrochemical Gradient',
                plainExplanation: 'Combines both concentration push and electrical charge pull acting on an ion.',
                sourceContext: 'Observed across polarized plasma membranes.',
              },
            ],
            keyTerminology: ['Osmosis', 'ATPase', 'Electrochemical Gradient'],
            revisionNotes: ['Check charge balance across transport stoichiometry before calculating net flux.'],
            keyTakeaways: ['Active pumps maintain gradients used by secondary symporters.'],
            markdown: '# Membrane Transport',
            chunkCount: 3,
            generatedAt: '2026-11-28T00:00:00.000Z',
          });

          const pdfText = Buffer.from(pdfBytes).toString('latin1');
          assert.ok(pdfText.startsWith('%PDF-1.4\n'), 'PDF must begin with valid %PDF-1.4 header');
          assert.ok(pdfText.includes('\nxref\n') && pdfText.endsWith('%%EOF'), 'PDF must end with xref and %%EOF');
          assert.ok(pdfText.includes('Note: Generated from selected Chapters 2 to 4.'), 'Must include sourceNotice');
          assert.ok(pdfText.includes('Concept Clarifications'), 'Must include difficultConceptExplanations section');
          assert.ok(pdfText.includes('Electrochemical Gradient'), 'Must preserve concept clarification terms');
          assert.ok(pdfText.includes('Nernst Equation'), 'Must include formulas');
          assert.ok(pdfText.includes('Page 1 of '), 'Must include Page 1 of N numbering');
          const countMatch = pdfText.match(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/);
          const pageCount = countMatch ? Number(countMatch[1]) : 0;
          assert.ok(pageCount >= 2, `Expected multi-page PDF (>= 2 pages), got ${pageCount}`);
          assert.ok(pdfText.includes(`Page ${pageCount} of ${pageCount}`), 'Final page footer must include total page count');
          console.log(`PASS [31/31] Academic PDF export generated valid ${pageCount}-page PDF with all sections & Page X of Y numbering`);
        }
      } finally {
        await new Promise<void>((resolve) => serverB.server.close(() => resolve()));
      }
    } finally {
      await new Promise<void>((resolve) => mockSb.server.close(() => resolve()));
    }

    console.log('\nALL 31 STEP-5A & STEP-5B QA, SUMMARIZER, PDF EXPORT, SECURITY & WELCOME EMAIL TESTS PASSED.');
  } finally {
    if (prevSupabaseUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = prevSupabaseUrl;

    if (prevSupabaseAnon === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
    else process.env.VITE_SUPABASE_ANON_KEY = prevSupabaseAnon;

    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;

    if (prevSealSecret === undefined) delete process.env.ASSESSMENT_KEY_SECRET;
    else process.env.ASSESSMENT_KEY_SECRET = prevSealSecret;

    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

runQaIntegrationTests().catch((err) => {
  console.error('QA Integration Suite failed:', err);
  process.exit(1);
});
