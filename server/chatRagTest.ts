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

  console.log('\n[ChatRAG Test Suite] ALL 8 UNIT TESTS PASSED SUCCESSFULLY!');
}

runChatRagTests().catch((err) => {
  console.error('[ChatRAG Test Suite] FAILED:', err);
  process.exit(1);
});
