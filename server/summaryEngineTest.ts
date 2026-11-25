import assert from 'node:assert/strict';
import { generateExtractiveSummary } from './summaryEngine.ts';
import { formatScientificText } from '../src/lib/scientificFormatter.ts';

function runSummaryEngineTests() {
  console.log('[SummaryEngine Test Suite] Starting comprehensive document-only tests...');

  // 0. Scientific & Chemical Formatter Edge-Case Tests
  {
    const formattedChem = formatScientificText(
      'Combustion of CH4 with O2 produces CO2 and H2O, while H2SO4 dissociates into 2H^+ and SO4^2- (Page 2). Compare B2B vs CO2.'
    );
    assert.ok(formattedChem.includes('CH₄'), 'CH4 should format to CH₄');
    assert.ok(formattedChem.includes('O₂'), 'O2 should format to O₂');
    assert.ok(formattedChem.includes('CO₂'), 'CO2 should format to CO₂');
    assert.ok(formattedChem.includes('H₂O'), 'H2O should format to H₂O');
    assert.ok(formattedChem.includes('H₂SO₄'), 'H2SO4 should format to H₂SO₄');
    assert.ok(formattedChem.includes('2H⁺'), '2H^+ should format to 2H⁺');
    assert.ok(formattedChem.includes('SO₄²⁻'), 'SO4^2- should format to SO₄²⁻');
    assert.ok(formattedChem.includes('(Page 2)'), 'Page 2 must not be corrupted');
    assert.ok(formattedChem.includes('B2B'), 'Acronym B2B must not be altered');

    const formattedPhysics = formatScientificText(
      'Acceleration is 9.81 m/s^2 and Avogadro constant is 6.022 x 10^23 mol^-1 with ΔG = ΔH - TΔS.'
    );
    assert.ok(formattedPhysics.includes('9.81 m/s²'), 'm/s^2 should format to m/s²');
    assert.ok(formattedPhysics.includes('6.022 × 10²³'), 'Scientific notation should use × and superscripts');
    assert.ok(formattedPhysics.includes('mol⁻¹'), 'mol^-1 should format to mol⁻¹');
    console.log('Test 0 [Scientific & Chemical Formatter]: PASS');
  }

  // 1. Biology Multi-Page PDF Summary Test (Definitions, Mechanisms, Page Refs, Zero Filler)
  const bioPdfText = `[Page 1]
Photosynthesis is a biological process used by plants and other organisms to convert light energy into chemical energy. Chlorophyll is the green pigment found in cyanobacteria and the chloroplasts of algae and plants.
First, light-dependent reactions capture photons inside the thylakoid membrane to split H2O into O2, protons, and electrons. Next, ATP synthase uses the proton gradient to synthesize ATP and NADPH.

[Page 2]
The Calvin cycle refers to the set of chemical reactions that take place in chloroplasts during photosynthesis. Enzyme RuBisCO catalyzes carbon fixation by combining CO2 with ribulose bisphosphate. Finally, glucose (C6H12O6) is assembled from three-carbon intermediates.
Unlike light-dependent reactions, the Calvin cycle occurs in the stroma and does not directly require photons.`;

  const bioSummary = generateExtractiveSummary('Photosynthesis Study Guide', 'General Studies', bioPdfText, 'detailed');
  assert.equal(bioSummary.title, 'Photosynthesis Study Guide');
  assert.equal(bioSummary.subjectArea, 'Biology', 'Should infer Biology subject automatically');
  assert.ok(!bioSummary.topicOverview.startsWith('Based on the study material'), 'Should avoid robotic intro padding');
  assert.ok(bioSummary.importantDefinitions.length >= 2, 'Should extract Photosynthesis, Chlorophyll, Calvin cycle definitions');
  assert.ok((bioSummary.processesAndMechanisms?.length ?? 0) >= 1, 'Should detect photosynthesis steps in order');
  assert.ok((bioSummary.importantDistinctions?.length ?? 0) >= 1, 'Should detect "Unlike light-dependent reactions..." contrast');
  assert.ok(
    JSON.stringify(bioSummary).includes('Page 1') && JSON.stringify(bioSummary).includes('Page 2'),
    'Must preserve Page 1 and Page 2 citations'
  );
  assert.ok(!bioSummary.markdown.includes('AI Clarification'), 'Must contain zero AI Clarification labels');
  console.log('Test 1 [Biology Multi-Page + Processes + Distinctions]: PASS');

  // 2. Chemistry Formulas, Stoichiometry & Units Test
  const chemText = `[Page 1]
## Acid-Base Chemistry
An Arrhenius acid is defined as a substance that increases the concentration of H^+ ions in aqueous solution. Sulfuric acid (H2SO4) is a strong diprotic acid widely used in industrial synthesis.

## Reaction & pH Equations
Photosynthesis Reaction: 6CO2 + 6H2O -> C6H12O6 + 6O2
Neutralization: H2SO4 + 2NaOH -> Na2SO4 + 2H2O
For example, hydrochloric acid reacts rapidly with sodium hydroxide to form table salt and water.
pH = -log[H^+]`;

  const chemSummary = generateExtractiveSummary('Acids and Stoichiometry', 'General Studies', chemText, 'detailed');
  assert.equal(chemSummary.subjectArea, 'Chemistry');
  assert.ok(chemSummary.formulasOrFrameworks.length >= 2, 'Should extract chemical reactions and pH formula');
  assert.ok(
    chemSummary.formulasOrFrameworks.some((f) => f.expressionOrStructure.includes('6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂')),
    'Should format balanced chemical equation cleanly'
  );
  assert.ok(
    chemSummary.formulasOrFrameworks.some((f) => f.expressionOrStructure.includes('H₂SO₄ + 2NaOH → Na₂SO₄ + 2H₂O')),
    'Should format neutralization equation cleanly'
  );
  assert.ok(chemSummary.relevantExamples.length >= 1, 'Should extract "For example" application');
  assert.ok(chemSummary.mainConcepts.some((c) => c.heading === 'Acid-Base Chemistry'), 'Should preserve explicit heading');
  console.log('Test 2 [Chemistry Reactions & Subscripts]: PASS');

  // 3. Physics Equations, Variable Meanings & Units Test
  const physicsText = `[Page 1]
## Classical Mechanics
Newton's Second Law states that F = ma, where F is net force in N, m is mass in kg, and a is acceleration in m/s^2.
Kinetic Energy: KE = 0.5mv^2, where m is object mass in kg and v is speed in m/s.
Momentum is defined as the product of mass and velocity of an object moving at speed v.`;

  const physicsSummary = generateExtractiveSummary('Newtonian Mechanics', 'General Studies', physicsText, 'detailed');
  assert.equal(physicsSummary.subjectArea, 'Physics');
  const newtonFormula = physicsSummary.formulasOrFrameworks.find((f) => f.expressionOrStructure.includes('F = ma'));
  assert.ok(newtonFormula, 'Should extract F = ma');
  assert.ok((newtonFormula?.variables?.length ?? 0) >= 2, 'Should extract F, m, a variable meanings');
  assert.ok(physicsSummary.topicOverview.includes('m/s²') || JSON.stringify(physicsSummary).includes('m/s²'), 'Should preserve m/s² unit');
  console.log('Test 3 [Physics Equations & Variable Definitions]: PASS');

  // 4. Long Repetitive Document & Noise Removal Test
  const noisyLines: string[] = [];
  for (let p = 1; p <= 4; p++) {
    noisyLines.push(`[Page ${p}]`);
    noisyLines.push('UNIVERSITY LECTURE SERIES 2026'); // repeating header chrome on every page
    noisyLines.push('In this chapter we will discuss cellular metabolism.'); // meta-filler
    noisyLines.push('Cellular respiration is vital for aerobic organisms.');
    noisyLines.push('Cellular respiration is vital for aerobic organisms.'); // exact duplicate
    if (p === 1) {
      noisyLines.push('Glycolysis splits one glucose molecule into two pyruvate molecules inside the cytoplasm.');
    } else if (p === 2) {
      noisyLines.push('Mitochondria synthesize most cellular ATP through oxidative phosphorylation across the inner membrane.');
    } else if (p === 3) {
      noisyLines.push('Fermentation regenerates NAD^+ when oxygen is absent, whereas aerobic respiration yields far more ATP.');
    } else {
      noisyLines.push('Substrate-level phosphorylation transfers a phosphate group directly from a phosphorylated intermediate to ADP.');
    }
  }
  const noisySummary = generateExtractiveSummary('Cellular Respiration', 'Biology', noisyLines.join('\n'), 'detailed');
  const allRenderedItems = [
    ...noisySummary.importantFacts,
    ...noisySummary.mainConcepts.flatMap((c) => c.sourcePoints),
  ];
  assert.ok(
    !JSON.stringify(noisySummary).includes('UNIVERSITY LECTURE SERIES 2026'),
    'Repeating page header chrome must be stripped'
  );
  assert.ok(
    !JSON.stringify(noisySummary).includes('In this chapter we will discuss'),
    'Meta-filler intro sentences should be filtered'
  );
  assert.equal(
    new Set(noisySummary.importantFacts).size,
    noisySummary.importantFacts.length,
    'Facts must contain zero duplicates'
  );
  assert.ok(allRenderedItems.length >= 2, 'Should retain unique substantive biological facts');
  console.log('Test 4 [Repetitive Document & Header Noise Removal]: PASS');

  // 5. Short & Empty Document Handling (No Forced Sections)
  const emptySummary = generateExtractiveSummary('Empty Doc', 'General', '   ', 'short');
  assert.equal(emptySummary.wordCount, 0);
  assert.ok(emptySummary.topicOverview.includes('insufficient text'));

  const briefText = 'Enzymes lower the activation energy required for biochemical reactions without being consumed.';
  const briefSummary = generateExtractiveSummary('Enzymes Quick Note', 'Biology', briefText, 'short');
  assert.ok(Boolean(briefSummary.sourceNotice), 'Brief document should surface honest sourceNotice');
  assert.equal(briefSummary.formulasOrFrameworks.length, 0, 'Must not force empty/fabricated formulas');
  assert.equal(briefSummary.importantDistinctions?.length ?? 0, 0, 'Must not force unsupported distinctions');
  console.log('Test 5 [Empty & Brief Document Honesty]: PASS');

  console.log('[SummaryEngine Test Suite] Overall Status: ALL TESTS PASSED SUCCESSFULLY');
}

runSummaryEngineTests();
