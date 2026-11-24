import { generateExtractiveSummary } from './summaryEngine.ts';

function runSummaryEngineTests() {
  console.log('[SummaryEngine Test Suite] Starting validation tests...');

  const samplePdfText = `[Page 1]
Photosynthesis is a biological process used by plants and other organisms to convert light energy into chemical energy. This process is defined as the synthesis of organic compounds from carbon dioxide and water using sunlight. Chlorophyll is the green pigment found in cyanobacteria and the chloroplasts of algae and plants.

[Page 2]
The Calvin cycle refers to the set of chemical reactions that take place in chloroplasts during photosynthesis. Enzyme RuBisCO plays a crucial role in fixing carbon dioxide during the light-independent reactions. Energy carriers such as ATP and NADPH are produced during the initial light-dependent reactions.`;

  // 1. Ordinary PDF Summary Test
  const summary = generateExtractiveSummary('Photosynthesis Study Guide', 'Biology', samplePdfText, 'detailed');
  const ordinaryPass = summary.title === 'Photosynthesis Study Guide' && summary.topicOverview.length > 10 && summary.mainConcepts.length > 0;
  console.log(`Test 1 [Ordinary PDF Summary]: ${ordinaryPass ? 'PASS' : 'FAIL'} (Overview: "${summary.topicOverview.slice(0, 40)}...")`);

  // 2. Important Definitions Detection Test
  const hasDefinitions = summary.importantDefinitions.length > 0;
  console.log(`Test 2 [Definition Detection]: ${hasDefinitions ? 'PASS' : 'FAIL'} (Definitions found: ${summary.importantDefinitions.length})`);

  // 3. Page Reference Preservation Test
  const hasPageRef = summary.mainConcepts.some((c) => c.sourcePoints.some((pt) => pt.includes('Page 1') || pt.includes('Page 2')));
  console.log(`Test 3 [Page Reference Preservation]: ${hasPageRef ? 'PASS' : 'FAIL'}`);

  // 4. Empty / Unreadable PDF Test
  const emptySummary = generateExtractiveSummary('Empty Doc', 'General', '   ', 'short');
  const emptyPass = emptySummary.wordCount === 0 && emptySummary.topicOverview.includes('insufficient text');
  console.log(`Test 4 [Empty / Unreadable PDF Handling]: ${emptyPass ? 'PASS' : 'FAIL'}`);

  // 5. Repeated Sentences / Noise Removal Test
  const noisyText = 'Cellular respiration is vital. Cellular respiration is vital. Cell respiration is vital. [Page 1] Mitochondria produce ATP.';
  const noisySummary = generateExtractiveSummary('Noisy Doc', 'Biology', noisyText, 'short');
  const uniqueSentences = new Set(noisySummary.importantFacts);
  const noisePass = uniqueSentences.size === noisySummary.importantFacts.length;
  console.log(`Test 5 [Repeated Sentence & Noise Removal]: ${noisePass ? 'PASS' : 'FAIL'} (Unique facts: ${uniqueSentences.size})`);

  const allPassed = ordinaryPass && hasDefinitions && hasPageRef && emptyPass && noisePass;
  console.log(`[SummaryEngine Test Suite] Overall Status: ${allPassed ? 'ALL TESTS PASSED SUCCESSFULLY' : 'SOME TESTS FAILED'}`);
  return allPassed;
}

runSummaryEngineTests();
