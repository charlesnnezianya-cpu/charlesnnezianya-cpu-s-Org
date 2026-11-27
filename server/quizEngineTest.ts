import assert from 'node:assert/strict';
import { buildAssessmentBlueprint, generateGroundedQuizQuestions } from './quizEngine.ts';

function runQuizEngineTests() {
  console.log('[QuizEngine Test Suite] Starting intelligent deterministic quiz & exam verification...');

  const multiSectionBioDoc = `[Page 1]
## Light-Dependent Reactions
Chlorophyll is defined as the primary photosynthetic pigment that absorbs red and blue wavelengths inside thylakoid membranes.
Photosystem II captures light photons at 680 nm to split water molecules into oxygen gas, protons, and electrons.
First, Photosystem II absorbs photons and initiates electron flow along plastoquinone.
Next, cytochrome b6f pumps protons into the thylakoid lumen to establish a chemiosmotic gradient.
Finally, ATP synthase converts ADP and inorganic phosphate into ATP inside the stroma.

[Page 2]
## The Calvin Cycle
The Calvin cycle refers to the light-independent biochemical pathway that fixes carbon dioxide into three-carbon sugars.
RuBisCO catalyzes carbon fixation by attaching atmospheric carbon dioxide to ribulose bisphosphate.
Unlike light-dependent reactions, the Calvin cycle occurs in the chloroplast stroma and does not directly require photons.
Types of photosynthetic pigments include chlorophyll a, chlorophyll b, and carotenoids.
High light intensity leads to increased electron transport rate up to the enzyme saturation point.

[Page 3]
## Cellular Respiration & Energetics
Glycolysis breaks down one glucose molecule into two pyruvate molecules inside the cytoplasm.
Mitochondria generate cellular ATP through oxidative phosphorylation across the inner mitochondrial membrane.
Aerobic Respiration Reaction: C6H12O6 + 6O2 -> 6CO2 + 6H2O
Kinetic Energy: KE = 0.5mv^2, where m is particle mass in kg and v is velocity in m/s.`;

  // 1. Multi-template rich generation + zero generic placeholders + clean academic topicTag (never Page N)
  const practiceQuestions = generateGroundedQuizQuestions(multiSectionBioDoc, 10, 'intermediate', {
    assessmentMode: 'practice',
    title: 'Plant Bioenergetics',
  });
  assert.equal(practiceQuestions.length, 10, 'Should generate 10 grounded questions');

  const forbiddenPlaceholders = [
    'Primary Process',
    'Secondary Mechanism',
    'Structural Variant',
    'Control Parameter',
    'Core Subject Principles',
    'which concept relates to:',
  ];

  for (const q of practiceQuestions) {
    assert.ok(Array.isArray(q.options) && q.options.length === 4, `Question ${q.number} must have 4 options`);
    assert.equal(new Set(q.options).size, 4, `Question ${q.number} options must be unique`);
    assert.ok(
      typeof q.correctOptionIndex === 'number' &&
        q.correctOptionIndex >= 0 &&
        q.correctOptionIndex <= 3,
      `Question ${q.number} must have valid correctOptionIndex`
    );
    assert.equal(q.expectedAnswer, q.options[q.correctOptionIndex]);
    assert.ok(
      typeof q.topicTag === 'string' &&
        q.topicTag.trim().length >= 3 &&
        !/\bPage\s+\d+\b/i.test(q.topicTag),
      `Expected clean academic section topicTag without Page N, got "${q.topicTag}"`
    );
    assert.ok(
      q.cognitiveBand === 'knowledge' ||
        q.cognitiveBand === 'comprehension' ||
        q.cognitiveBand === 'application' ||
        q.cognitiveBand === 'analysis',
      `Question ${q.number} must specify valid cognitiveBand, got "${q.cognitiveBand}"`
    );
    assert.ok(
      typeof q.questionCategory === 'string' && q.questionCategory.length > 0,
      `Question ${q.number} must specify questionCategory`
    );
    for (const banned of forbiddenPlaceholders) {
      assert.ok(
        !q.question.includes(banned) && !q.options.some((o) => o.includes(banned)),
        `Must never emit generic placeholder "${banned}"`
      );
    }
  }
  console.log('Test 1 [Multi-Template Grounding, Clean Topic Tags & Zero Fake Placeholders]: PASS');

  // 2. Exam Mode distributes questions across multiple academic sections & builds blueprint
  const examQuestions = generateGroundedQuizQuestions(multiSectionBioDoc, 6, 'mixed', {
    assessmentMode: 'exam',
    title: 'Bioenergetics Midterm',
  });
  assert.equal(examQuestions.length, 6);
  const examTopics = new Set(examQuestions.map((q) => q.topicTag));
  assert.ok(
    examTopics.has('Light-Dependent Reactions') &&
      examTopics.has('The Calvin Cycle') &&
      examTopics.has('Cellular Respiration & Energetics'),
    `Exam mode must distribute across Light-Dependent Reactions, The Calvin Cycle, and Cellular Respiration & Energetics (got ${Array.from(examTopics).join(', ')})`
  );
  const blueprint = buildAssessmentBlueprint(examQuestions);
  assert.equal(blueprint.totalQuestions, 6);
  assert.ok(blueprint.topics.length >= 3, 'Blueprint should summarize all covered exam sections');
  assert.equal(
    blueprint.cognitiveMix.knowledge +
      blueprint.cognitiveMix.comprehension +
      blueprint.cognitiveMix.application +
      blueprint.cognitiveMix.analysis,
    6
  );
  console.log('Test 2 [Exam Mode Multi-Section Distribution & Blueprint]: PASS');

  // 3. Cognitive difficulty differentiation (easy favors recall vs advanced favors application/analysis)
  const easyQuestions = generateGroundedQuizQuestions(multiSectionBioDoc, 5, 'easy', {
    assessmentMode: 'practice',
  });
  const advancedQuestions = generateGroundedQuizQuestions(multiSectionBioDoc, 5, 'advanced', {
    assessmentMode: 'practice',
  });
  assert.notEqual(
    JSON.stringify(easyQuestions.map((q) => q.question)),
    JSON.stringify(advancedQuestions.map((q) => q.question)),
    'Easy and Advanced difficulties should prioritize different cognitive question types'
  );
  const advancedHigherOrderCount = advancedQuestions.filter(
    (q) => q.cognitiveBand === 'application' || q.cognitiveBand === 'analysis'
  ).length;
  assert.ok(
    advancedHigherOrderCount >= 3,
    `Advanced difficulty must prioritize application/analysis bands (got ${advancedHigherOrderCount}/5)`
  );
  assert.ok(
    advancedQuestions.some((q) =>
      /(equation|comparison|immediately after|direct consequence|factor of four|doubles|non-functional|blocked|EXCEPT|most directly responsible)/i.test(
        q.question
      )
    ),
    'Advanced difficulty should emphasize application, quantitative reasoning, sequence, scenario, or distinction questions'
  );
  console.log('Test 3 [Cognitive Difficulty Calibration (Easy vs Advanced)]: PASS');

  // 4. Short 2-sentence document stays strictly grounded and avoids over-generation
  const shortDoc =
    'Mitochondria generate cellular ATP through aerobic respiration inside eukaryotic cells. Glycolysis breaks down glucose into pyruvate inside the cytoplasm.';
  const shortQuestions = generateGroundedQuizQuestions(shortDoc, 25, 'intermediate');
  assert.ok(
    shortQuestions.length >= 1 && shortQuestions.length < 10,
    `Short 2-sentence doc should cap gracefully (got ${shortQuestions.length})`
  );
  assert.ok(
    shortQuestions.every((q) => !(q.options || []).includes('Core Subject Principles')),
    'Short doc must use domain-relevant distractors rather than generic fillers'
  );
  console.log(`Test 4 [Short Document Honest Grounding (${shortQuestions.length} questions)]: PASS`);

  // 5. Thin / ungrounded topic stub refuses to fabricate questions
  assert.deepEqual(
    generateGroundedQuizQuestions('Study topic: Quantum Physics', 10, 'intermediate'),
    [],
    'Thin ungrounded topic strings must yield [] rather than fabricated questions'
  );
  assert.deepEqual(generateGroundedQuizQuestions('   ', 10, 'easy'), []);
  console.log('Test 5 [Empty / Ungrounded Input Refusal]: PASS');

  console.log('[QuizEngine Test Suite] Overall Status: ALL TESTS PASSED SUCCESSFULLY');
}

runQuizEngineTests();
