import assert from 'assert';
import { buildChatRagContext } from './chatRagService.ts';

function buildMultiPageBiologyPdfText(): string {
  const fillerPages = Array.from({ length: 10 }, (_, i) => {
    const pageNum = i + 6;
    return `[Page ${pageNum}]\nHistorical microscopy appendix note ${pageNum}. Early botanical illustrations catalogued leaf epidermis, guard cells, stomatal aperture variations, and transpiration rates under varying humidity chambers in nineteenth-century greenhouses. Repeated calibration logs recorded ambient lux and water vapor pressure across seasonal trials.`;
  }).join('\n\n');

  return [
    `[Page 1]
Course Overview: Plant Bioenergetics and Cellular Metabolism.
Photosynthesis converts solar energy into chemical energy stored in carbohydrates. Autotrophic organisms use chlorophyll pigments inside chloroplasts to capture photons.`,

    `[Page 2]
Light-Dependent Reactions (Thylakoid Membrane):
Photosystem II absorbs light at 680 nm to split water molecules (photolysis), releasing molecular oxygen (O2), protons, and high-energy electrons. Electrons travel down the cytochrome b6f electron transport chain to Photosystem I, pumping protons into the thylakoid lumen to build a chemiosmotic proton gradient used by ATP synthase to generate ATP and NADPH.`,

    `[Page 3]
Cellular Respiration & Glycolysis:
In the cytosol, glycolysis breaks one six-carbon glucose molecule into two three-carbon pyruvate molecules, yielding a net gain of 2 ATP and 2 NADH. Under aerobic conditions, pyruvate enters the mitochondrial matrix and is oxidized into acetyl-CoA before entering the Krebs cycle.`,

    `[Page 4]
The Calvin Cycle (Light-Independent Reactions in the Stroma):
Unlike the light-dependent reactions in the thylakoid membrane, the Calvin cycle occurs in the chloroplast stroma and uses ATP and NADPH to fix atmospheric CO2 into organic sugars. The enzyme RuBisCO (ribulose-1,5-bisphosphate carboxylase-oxygenase) catalyzes carbon fixation by attaching CO2 to RuBP, forming unstable 6-carbon intermediates that split into 3-PGA, which are then reduced to G3P.`,

    `[Page 5]
Mitochondrial ATP Synthase & Oxidative Phosphorylation:
Complexes I through IV in the inner mitochondrial membrane pump protons into the intermembrane space. ATP synthase acts as a rotary molecular turbine that harnesses this proton-motive force to phosphorylate ADP into ATP during oxidative phosphorylation.`,

    fillerPages,
  ].join('\n\n');
}

async function runChatRagTests() {
  console.log('[ChatRAG Test Suite] Starting validation tests...\n');

  const bioText = buildMultiPageBiologyPdfText();
  const bioDoc = {
    id: 'mat-bio-101',
    title: 'Plant Bioenergetics Lecture.pdf',
    type: 'Uploaded PDF Material',
    content: bioText,
  };

  // Scenario 1: Single clear question answered inside multi-page PDF
  const s1 = await buildChatRagContext({
    message: 'What is the role of RuBisCO in the Calvin cycle?',
    history: [],
    documentContext: bioDoc,
    userId: 'student-1',
    hasImage: false,
  });
  assert(s1.sources.length >= 1 && s1.sources.length <= 3, 'Scenario 1 should retrieve 1-3 passages');
  assert.strictEqual(s1.sources[0].pageNumber, 4, 'Scenario 1 must cite Page 4 where RuBisCO/Calvin cycle appears');
  assert.strictEqual(s1.sources[0].documentTitle, 'Plant Bioenergetics Lecture.pdf');
  assert.strictEqual(s1.knowledgeSource, 'study_materials');
  assert(
    s1.injectedPassageChars < bioText.length * 0.6,
    `Scenario 1 must send only relevant passages, not full PDF (${s1.injectedPassageChars} vs ${bioText.length})`
  );
  console.log(
    `Test 1 [Exact Multi-Page PDF Retrieval & Prompt Reduction]: PASS (Page ${s1.sources[0].pageNumber}, ${s1.injectedPassageChars}/${s1.totalRawDocumentChars} chars sent)`
  );

  // Scenario 2: Multi-passage synthesis across different pages
  const s2 = await buildChatRagContext({
    message: 'Compare the light-dependent reactions and the Calvin cycle across stages and locations.',
    history: [],
    documentContext: bioDoc,
    userId: 'student-1',
    hasImage: false,
  });
  const s2Pages = new Set(s2.sources.map((src) => src.pageNumber));
  assert(s2.sources.length >= 2, 'Scenario 2 must retrieve multiple passages for synthesis');
  assert(s2Pages.has(2) && s2Pages.has(4), 'Scenario 2 should retrieve both Page 2 (light-dependent) and Page 4 (Calvin cycle)');
  console.log(
    `Test 2 [Multi-Passage Synthesis Retrieval]: PASS (Pages retrieved: ${Array.from(s2Pages).sort().join(', ')})`
  );

  // Scenario 3: General academic question unrelated to uploaded materials
  const s3 = await buildChatRagContext({
    message: 'Compare SN1 and SN2 nucleophilic substitution reactions in organic chemistry.',
    history: [],
    documentContext: bioDoc,
    userId: 'student-1',
    hasImage: false,
  });
  assert.strictEqual(s3.sources.length, 0, 'Scenario 3 should NOT inject unrelated Biology passages for organic chemistry query');
  assert.strictEqual(s3.knowledgeSource, 'general_knowledge');
  assert(
    s3.documentContextPromptBlock.includes('General Academic Knowledge'),
    'Scenario 3 prompt must instruct answering via General Academic Knowledge'
  );
  console.log('Test 3 [General Academic Question Distinction]: PASS (0 false doc passages, General Knowledge mode)');

  // Scenario 4: Follow-up question referring to an earlier answer
  const s4 = await buildChatRagContext({
    message: 'Can you explain that step in simpler terms with an analogy?',
    history: [
      { role: 'user', content: 'What does RuBisCO do in the Calvin cycle?' },
      { role: 'assistant', content: 'In the Calvin cycle, RuBisCO catalyzes carbon fixation by attaching CO2 to RuBP in the chloroplast stroma.' },
    ],
    documentContext: bioDoc,
    userId: 'student-1',
    hasImage: false,
    explanationStyle: 'simpler',
  });
  assert.strictEqual(s4.intent, 'follow_up');
  assert(s4.sources.length >= 1, 'Scenario 4 follow-up should stay anchored to Calvin cycle passages via history');
  assert.strictEqual(s4.sources[0].pageNumber, 4, 'Scenario 4 follow-up should retrieve Page 4');
  console.log(`Test 4 [Follow-Up Continuity Retrieval]: PASS (Intent=${s4.intent}, anchored Page ${s4.sources[0].pageNumber})`);

  // Scenario 5: Question with no relevant document information
  const s5 = await buildChatRagContext({
    message: 'What does my uploaded PDF say about quantum entanglement and Bell inequalities?',
    history: [],
    documentContext: bioDoc,
    userId: 'student-1',
    hasImage: false,
  });
  assert.strictEqual(s5.sources.length, 0, 'Scenario 5 should find 0 matching passages');
  assert.strictEqual(s5.knowledgeSource, 'general_knowledge');
  assert(
    s5.documentContextPromptBlock.includes('NO RELEVANT DOCUMENT PASSAGES FOUND'),
    'Scenario 5 prompt must inform AI that searched materials lacked relevant passages'
  );
  console.log('Test 5 [No Relevant Document Info Handling]: PASS');

  // Scenario 6: Partial/insufficient info in uploaded document
  const s6 = await buildChatRagContext({
    message: 'According to my notes, what is the exact molecular weight in kilodaltons and X-ray crystal resolution of ATP synthase?',
    history: [],
    documentContext: bioDoc,
    userId: 'student-1',
    hasImage: false,
  });
  assert(s6.sources.length >= 1, 'Scenario 6 should retrieve the ATP synthase passages (Pages 2 & 5)');
  assert(
    s6.documentContextPromptBlock.includes('INSUFFICIENT / PARTIAL DOCUMENT INFO'),
    'Scenario 6 prompt must instruct honest admission when requested detail is missing from retrieved passage'
  );
  console.log(`Test 6 [Partial / Insufficient Info Guardrail]: PASS (${s6.sources.length} passage(s) retrieved with strict insufficiency prompt)`);

  // Scenario 7: Strict User Isolation across studyMaterials
  const s7 = await buildChatRagContext({
    message: 'What is RuBisCO?',
    history: [],
    studyMaterials: [
      {
        id: 'secret-other-doc',
        userId: 'student-other',
        title: 'Private Other User Notes.pdf',
        extractedText: '[Page 1]\nRuBisCO confidential note for student-other only.',
      },
    ],
    userId: 'student-1',
    hasImage: false,
  });
  assert.strictEqual(s7.sources.length, 0, 'Scenario 7 must enforce strict user isolation on studyMaterials');
  console.log('Test 7 [User / Document Authorization Isolation]: PASS (0 cross-user passages leaked)');

  // Scenario 8: Ambiguous query clarification detection
  const s8 = await buildChatRagContext({
    message: 'Help me',
    history: [],
    documentContext: null,
    userId: 'student-1',
    hasImage: false,
  });
  assert.strictEqual(s8.intent, 'ambiguous');
  assert.strictEqual(s8.needsClarification, true);
  console.log('Test 8 [Ambiguous Query Clarification Detection]: PASS');

  // Scenario 9: Multi-page Classification & Types retrieval + Document Outline + Ordinal Follow-up
  const problemTypesDoc = {
    id: 'mat-cs-201',
    title: 'Computational Thinking and Problem Solving.pdf',
    type: 'Uploaded PDF Material',
    content: [
      `[Page 1]
1. Problem Solving Foundations
Problem solving is defined as the systematic process of identifying a gap between a current state and a desired goal state and selecting effective actions to bridge it.

Classification of Problems:
Problems in engineering and cognitive science are classified into three main types: Well-Defined Problems, Ill-Defined Problems, and Constraint-Satisfaction Problems.`,

      `[Page 2]
Well-Defined Problems:
Well-defined problems are problems that specify clear initial conditions, permissible operators, and an explicit goal test.
Key characteristics: deterministic state transitions, verifiable solutions, and formal algorithmic steps.
For example, finding the shortest weighted path between two nodes using Dijkstra's algorithm.`,

      `[Page 3]
Ill-Defined Problems and Constraint-Satisfaction Problems:
Ill-defined problems lack an explicit goal specification or complete state boundaries, requiring iterative framing and heuristic judgment.
For example, designing a sustainable urban transit system with competing stakeholder priorities.
Constraint-Satisfaction Problems require assigning values to variables so that all domain constraints hold simultaneously, such as scheduling university final examinations without room or student conflicts.`,
    ].join('\n\n'),
  };

  const s9 = await buildChatRagContext({
    message: 'What are the types of problems described in my notes?',
    history: [],
    documentContext: problemTypesDoc,
    userId: 'student-1',
    hasImage: false,
  });
  assert.strictEqual(s9.questionType, 'classification', 'Scenario 9 must detect classification intent');
  const s9Pages = new Set(s9.sources.map((src) => src.pageNumber));
  assert(s9Pages.has(1) && s9Pages.has(2) && s9Pages.has(3), `Scenario 9 should span Pages 1, 2, and 3 (got ${Array.from(s9Pages).join(',')})`);
  assert(
    s9.documentContextPromptBlock.includes('DOCUMENT STRUCTURE OUTLINE'),
    'Scenario 9 prompt must include the Document Structure Outline'
  );
  assert(
    s9.documentContextPromptBlock.includes('EXTRACTED DOCUMENT CONCEPTS'),
    'Scenario 9 prompt must include extracted classifications/definitions'
  );
  console.log(`Test 9 [Multi-Page Classification Retrieval & Structured Grounding]: PASS (Pages: ${Array.from(s9Pages).sort().join(', ')})`);

  // Scenario 10: Ordinal follow-up coreference resolution ("explain the second type with an example")
  const s10 = await buildChatRagContext({
    message: 'Explain the second type with its example.',
    history: [
      { role: 'user', content: 'What are the types of problems?' },
      {
        role: 'assistant',
        content: [
          'Here are the three types of problems:',
          '1. **Well-Defined Problems** — clear initial conditions and goal tests.',
          '2. **Ill-Defined Problems** — unclear goal boundaries requiring heuristic framing.',
          '3. **Constraint-Satisfaction Problems** — satisfy simultaneous constraints.',
        ].join('\n'),
      },
    ],
    documentContext: problemTypesDoc,
    userId: 'student-1',
    hasImage: false,
  });
  assert(
    s10.retrievalQuery.toLowerCase().includes('ill-defined'),
    `Scenario 10 should resolve "the second type" to "Ill-Defined Problems" (got: ${s10.retrievalQuery})`
  );
  assert(s10.sources.some((s) => s.pageNumber === 3), 'Scenario 10 must retrieve Page 3 where Ill-Defined Problems and its example appear');
  console.log(`Test 10 [Ordinal Follow-Up Coreference Resolution]: PASS (Resolved query -> Page 3)`);

  // Scenario 11: Comparison Question Type Detection
  const s11 = await buildChatRagContext({
    message: 'Compare Well-Defined Problems vs Ill-Defined Problems.',
    history: [],
    documentContext: problemTypesDoc,
    userId: 'student-1',
    hasImage: false,
  });
  assert.strictEqual(s11.questionType, 'comparison');
  const s11Pages = new Set(s11.sources.map((src) => src.pageNumber));
  assert(s11Pages.has(2) && s11Pages.has(3), 'Scenario 11 comparison must retrieve both Page 2 and Page 3');
  console.log(`Test 11 [Comparison Intent & Cross-Page Evidence]: PASS (Pages: ${Array.from(s11Pages).sort().join(', ')})`);

  console.log('\n[ChatRAG Test Suite] ALL 11 UNIT TESTS PASSED SUCCESSFULLY!');
}

runChatRagTests().catch((err) => {
  console.error('[ChatRAG Test Suite] FAILED:', err);
  process.exit(1);
});
