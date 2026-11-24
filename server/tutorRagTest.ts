import assert from 'assert';
import http from 'http';
import {
  analyzeTutorPedagogicalState,
  buildTutorRagContext,
} from './tutorRagService.ts';
import { createApiApp } from './createApiApp.ts';

function buildMultiPageBiologyNotes(): string {
  const appendixPages = Array.from({ length: 10 }, (_, i) => {
    const pageNum = i + 6;
    return `[Page ${pageNum}]\nHistorical laboratory instrumentation log ${pageNum}. Calibration trials recorded ambient barometric pressure, spectrophotometer baseline drift, distilled water conductivity, and glassware thermal expansion coefficients across weekly undergraduate teaching labs.`;
  }).join('\n\n');

  return [
    `[Page 1]
Unit 1 Introduction: Cellular Bioenergetics.
Living cells harvest free energy from chemical bonds or sunlight to drive endergonic metabolic work through coupled ATP hydrolysis.`,

    `[Page 2]
Light-Dependent Reactions (Photosystem II & Thylakoid Membrane):
In the light-dependent reactions, Photosystem II absorbs 680 nm photons to split water molecules (photolysis), releasing molecular oxygen (O2), protons, and energized electrons. Electrons pass through plastoquinone, cytochrome b6f, and plastocyanin to Photosystem I while pumping H+ into the thylakoid lumen. ATP synthase uses this proton-motive gradient to synthesize ATP and NADPH.`,

    `[Page 3]
Glycolysis & Pyruvate Oxidation:
In the cytosol, glycolysis breaks one 6-carbon glucose into two 3-carbon pyruvate molecules with a net yield of 2 ATP and 2 NADH. Under aerobic conditions, pyruvate enters the mitochondrial matrix and is oxidized into acetyl-CoA before entering the Krebs cycle.`,

    `[Page 4]
The Calvin Cycle (Chloroplast Stroma):
Unlike light-dependent reactions on the thylakoid membrane, the Calvin cycle takes place in the chloroplast stroma and fixes atmospheric CO2 into organic sugars using ATP and NADPH. RuBisCO (ribulose-1,5-bisphosphate carboxylase-oxygenase) attaches CO2 to RuBP, creating unstable 6-carbon intermediates that split into 3-PGA before reduction to G3P.`,

    `[Page 5]
Oxidative Phosphorylation & Chemiosmosis:
Complexes I through IV along the inner mitochondrial membrane transfer electrons from NADH and FADH2 to oxygen, pumping protons into the intermembrane space. ATP synthase rotates as protons flow back into the matrix, catalyzing ADP phosphorylation.`,

    appendixPages,
  ].join('\n\n');
}

async function runTutorRagTests() {
  console.log('[TutorRAG Test Suite] Starting verification tests...\n');

  const bioNotes = buildMultiPageBiologyNotes();
  const bioDoc = {
    id: 'mat-bio-tutor-1',
    title: 'Cellular Bioenergetics Lecture.pdf',
    type: 'Uploaded PDF Material',
    content: bioNotes,
  };

  // Test 1: Guided Full Lesson activation + Document RAG retrieval + Prompt reduction
  const t1 = await buildTutorRagContext({
    message: 'Teach me the Calvin Cycle and how it compares to light-dependent reactions.',
    quickAction: 'Start guided lesson',
    currentStep: 1,
    tutorMode: 'standard',
    history: [],
    documentContext: bioDoc,
    userId: 'student-1',
    hasImage: false,
  });
  assert.strictEqual(t1.pedagogicalAction, 'guided_full_lesson');
  assert.strictEqual(t1.useStructuredLessonPlan, true);
  assert(t1.tutorPromptDirective.includes('8-part Guided Learning'), 'Must include selective 8-part guided lesson plan');
  assert(t1.sources.length >= 2 && t1.sources.length <= 5, 'Should retrieve 2-5 focused passages for synthesis lesson');
  const t1Pages = new Set(t1.sources.map((s) => s.pageNumber));
  assert(t1Pages.has(4) && t1Pages.has(2), `Expected Pages 2 and 4 in sources, got ${Array.from(t1Pages).join(', ')}`);
  assert(
    t1.injectedPassageChars < bioNotes.length * 0.65,
    `Must NOT dump full PDF (${t1.injectedPassageChars} vs ${bioNotes.length})`
  );
  console.log(
    `Test 1 [Guided Lesson + Multi-Page RAG & Prompt Reduction]: PASS (${t1.sources.length} passages, Pages ${Array.from(
      t1Pages
    )
      .sort()
      .join(', ')}, ${t1.injectedPassageChars}/${t1.totalRawDocumentChars} chars)`
  );

  // Test 2: Normal mid-lesson conceptual question must NOT force 8-part template
  const t2 = await buildTutorRagContext({
    message: 'Wait, why does RuBisCO need RuBP to fix carbon dioxide?',
    currentTopic: 'Calvin Cycle',
    currentStep: 2,
    tutorMode: 'standard',
    history: [
      { role: 'user', content: 'Start a guided lesson on the Calvin Cycle.' },
      { role: 'assistant', content: 'Step 1: The Calvin Cycle occurs in the stroma and fixes CO2 using RuBisCO.' },
    ],
    documentContext: bioDoc,
    userId: 'student-1',
    hasImage: false,
  });
  assert.strictEqual(t2.pedagogicalAction, 'concept_question');
  assert.strictEqual(t2.useStructuredLessonPlan, false, 'Mid-lesson Q&A must stay conversational/focused, not forced into 8-part template');
  assert(t2.sources.some((s) => s.pageNumber === 4), 'Should ground mid-lesson RuBisCO answer in Page 4');
  console.log('Test 2 [Selective Guided Plan & Mid-Lesson Q&A Grounding]: PASS');

  // Test 3: Understanding-check answer evaluation
  const t3 = analyzeTutorPedagogicalState({
    message: 'It happens in the thylakoid membrane and produces oxygen directly from CO2.',
    currentTopic: 'Calvin Cycle',
    currentStep: 2,
    tutorMode: 'standard',
    history: [
      { role: 'user', content: 'Teach me the Calvin Cycle.' },
      {
        role: 'assistant',
        content:
          'Great start!\n\n> **Knowledge Check:** Where does the Calvin Cycle take place in the chloroplast, and which molecule is split to produce oxygen?',
      },
    ],
    hasImage: false,
  });
  assert.strictEqual(t3.pedagogicalAction, 'answer_evaluation');
  assert(
    t3.tutorPromptDirective.includes('Evaluate their answer warmly') &&
      t3.tutorPromptDirective.includes('advanceStep'),
    'Must instruct tutor to evaluate misconceptions and adjust step progression'
  );
  console.log('Test 3 [Understanding Check Answer Evaluation]: PASS');

  // Test 4: Adaptive personalization controls (simplify, examples, summarize, continue)
  const simplify = analyzeTutorPedagogicalState({
    message: 'Break this down into smaller, easier pieces.',
    quickAction: 'Make it easier',
    currentTopic: 'Calvin Cycle',
    currentStep: 2,
    tutorMode: 'beginner',
    history: [
      { role: 'user', content: 'Teach Calvin Cycle' },
      { role: 'assistant', content: 'Step 1 explanation...' },
    ],
    hasImage: false,
  });
  assert.strictEqual(simplify.pedagogicalAction, 'simplify_reteach');
  assert(simplify.tutorPromptDirective.includes('"advanceStep": false'));

  const summarize = analyzeTutorPedagogicalState({
    message: 'Summarize what we have covered so far with key points and terms.',
    quickAction: 'Summarize lesson',
    currentTopic: 'Calvin Cycle',
    currentStep: 3,
    tutorMode: 'standard',
    history: [
      { role: 'user', content: 'Teach Calvin Cycle' },
      { role: 'assistant', content: 'Step 1...' },
    ],
    hasImage: false,
  });
  assert.strictEqual(summarize.pedagogicalAction, 'summarize_lesson');

  const cont = analyzeTutorPedagogicalState({
    message: 'Continue our lesson seamlessly from where we stopped.',
    quickAction: 'Continue lesson',
    currentTopic: 'Calvin Cycle',
    currentStep: 3,
    tutorMode: 'standard',
    history: [
      { role: 'user', content: 'Teach Calvin Cycle' },
      { role: 'assistant', content: 'Step 1...' },
    ],
    hasImage: false,
  });
  assert.strictEqual(cont.pedagogicalAction, 'continue_lesson');
  assert(cont.tutorPromptDirective.includes('Step 3'));
  console.log('Test 4 [Adaptive Personalization Actions]: PASS (simplify, summarize, continue verified)');

  // Test 5: Dual-source distinction when uploaded document is unrelated + generic guided lesson fallback
  const unrelated = await buildTutorRagContext({
    message: 'Teach me SN1 vs SN2 organic chemistry mechanisms from scratch.',
    quickAction: 'Start guided lesson',
    currentStep: 1,
    tutorMode: 'standard',
    history: [],
    studyMaterials: [
      {
        id: 'mat-bio-only',
        userId: 'student-1',
        title: bioDoc.title,
        extractedText: bioNotes,
      },
    ],
    userId: 'student-1',
    hasImage: false,
  });
  assert.strictEqual(unrelated.sources.length, 0, 'Must not inject irrelevant Biology passages for Organic Chemistry');
  assert.strictEqual(unrelated.knowledgeSource, 'general_knowledge');
  assert(unrelated.documentContextPromptBlock.includes('General Academic Knowledge'));

  const linkedStart = await buildTutorRagContext({
    message: 'Start a full guided lesson on this document from the beginning.',
    quickAction: 'Start guided lesson',
    currentStep: 1,
    tutorMode: 'standard',
    history: [],
    documentContext: bioDoc,
    userId: 'student-1',
    hasImage: false,
  });
  assert(linkedStart.sources.length >= 1, 'Linked document guided-start fallback should pull initial document passages');
  console.log('Test 5 [Dual-Source Separation & Linked-Doc Start Fallback]: PASS');

  // Test 6: Strict User Isolation across studyMaterials
  const isolated = await buildTutorRagContext({
    message: 'Explain RuBisCO and Calvin cycle carbon fixation.',
    currentStep: 1,
    tutorMode: 'standard',
    history: [],
    studyMaterials: [
      {
        id: 'other-user-doc',
        userId: 'student-B',
        title: 'Confidential Biology Notes.pdf',
        extractedText: bioNotes,
      },
    ],
    userId: 'student-A',
    hasImage: false,
  });
  assert.strictEqual(isolated.sources.length, 0, 'Must never retrieve another student study material');
  console.log('Test 6 [Strict User Isolation]: PASS');

  // Test 7: End-to-End Express HTTP tests for /api/ai/tutor and /api/ai/tutor/stream (local stubbed Groq upstream)
  const originalFetch = globalThis.fetch;
  const originalGroqKey = process.env.GROQ_API_KEY_1;
  process.env.GROQ_API_KEY_1 = 'gsk_test_local_stub_key_12345';
  delete process.env.GEMINI_API_KEY; // Verifies lazy Gemini init does NOT throw when Groq handles text requests

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('https://api.groq.com/')) {
      const parsedBody = init?.body ? JSON.parse(String(init.body)) : {};
      if (parsedBody.stream) {
        const ssePayload = [
          'data: {"choices":[{"delta":{"content":"### Calvin Cycle Lesson\\n\\nIn **Page 4**, RuBisCO fixes $CO_2$ onto RuBP.\\n\\n> **Example:** Think of RuBisCO as a molecular stapler.\\n\\n> **Knowledge Check:** Where does this cycle occur?\\n"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"[[TUTOR_META:{\\"topicTitle\\":\\"Calvin Cycle Mastery\\",\\"subjectArea\\":\\"Biology\\",\\"currentStageLabel\\":\\"Core Carbon Fixation\\",\\"advanceStep\\":true}]]"}}]}\n\n',
          'data: [DONE]\n\n',
        ].join('');
        return new Response(ssePayload, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '### Calvin Cycle Step\nGrounded in Page 4: RuBisCO attaches CO2 to RuBP.',
                  topicTitle: 'Calvin Cycle Mastery',
                  subjectArea: 'Biology',
                  currentStageLabel: 'Carbon Fixation',
                  advanceStep: true,
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 7a: Empty input validation returns 400
    const badRes = await originalFetch(`${baseUrl}/api/ai/tutor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });
    assert.strictEqual(badRes.status, 400, 'Empty tutor request must return 400');

    // 7b: /api/ai/tutor JSON route returns RAG sources + metadata + lazy Gemini skip
    const jsonRes = await originalFetch(`${baseUrl}/api/ai/tutor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain RuBisCO in the Calvin cycle',
        tutorMode: 'standard',
        documentContext: bioDoc,
        userId: 'student-1',
      }),
    });
    assert.strictEqual(jsonRes.status, 200, `Expected 200 on /api/ai/tutor, got ${jsonRes.status}`);
    const jsonBody = (await jsonRes.json()) as {
      reply: string;
      topicTitle: string;
      sources: Array<{ pageNumber: number | null; documentTitle: string }>;
      ragMeta: { injectedPassageChars: number; totalRawDocumentChars: number; knowledgeSource: string };
    };
    assert(jsonBody.reply.includes('Page 4'));
    assert(jsonBody.sources.some((s) => s.pageNumber === 4));
    assert(jsonBody.ragMeta.injectedPassageChars < jsonBody.ragMeta.totalRawDocumentChars);

    // 7c: /api/ai/tutor/stream SSE route emits sources, chunk, and done
    const streamRes = await originalFetch(`${baseUrl}/api/ai/tutor/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Teach me the Calvin Cycle from the beginning',
        quickAction: 'Start guided lesson',
        tutorMode: 'standard',
        documentContext: bioDoc,
        userId: 'student-1',
      }),
    });
    assert.strictEqual(streamRes.status, 200, `Expected 200 on /api/ai/tutor/stream, got ${streamRes.status}`);
    const rawSse = await streamRes.text();
    assert(rawSse.includes('event: start'), 'Stream must emit event: start');
    assert(rawSse.includes('event: sources'), 'Stream must emit event: sources');
    assert(rawSse.includes('event: chunk'), 'Stream must emit event: chunk');
    assert(rawSse.includes('event: done'), 'Stream must emit event: done');
    assert(!rawSse.includes('[[TUTOR_META:'), 'Stream chunks/done reply must strip internal TUTOR_META marker');
    console.log('Test 7 [HTTP /api/ai/tutor & /api/ai/tutor/stream E2E]: PASS (400 validation, lazy Gemini, SSE sources+chunk+done)');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    globalThis.fetch = originalFetch;
    if (originalGroqKey === undefined) {
      delete process.env.GROQ_API_KEY_1;
    } else {
      process.env.GROQ_API_KEY_1 = originalGroqKey;
    }
  }

  console.log('\n[TutorRAG Test Suite] All 7 test groups passed successfully!');
}

runTutorRagTests().catch((err) => {
  console.error('[TutorRAG Test Suite] FAILED:', err);
  process.exit(1);
});
