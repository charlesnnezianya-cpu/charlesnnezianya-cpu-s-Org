import assert from 'node:assert/strict';
import {
  analyzeDocumentIntelligence,
  chunkDocumentText,
  extractKeywords,
  extractMatchingStructuredHighlights,
  normalizeText,
  retrieveRelevantPassages,
  segmentParagraphs,
} from './documentEngine.ts';

function runDocumentEngineTests() {
  console.log('[DocumentEngine Test Suite] Starting validation tests...');

  // 1. Text Normalization Test
  const rawInput = '  Hello   World! \r\n\r\n  This is a \u0000test document.  ';
  const normalized = normalizeText(rawInput);
  const normPass = normalized === 'Hello World!\n\nThis is a test document.';
  assert.ok(normPass, 'Normalization should clean control characters and whitespace');
  console.log(`Test 1 [Text Normalization]: PASS (Result: "${normalized}")`);

  // 2. Paragraph Segmentation Test
  const multiPara = 'Paragraph one here.\n\nParagraph two here.\n\n\nParagraph three here.';
  const paras = segmentParagraphs(multiPara);
  const paraPass =
    paras.length === 3 &&
    paras[0] === 'Paragraph one here.' &&
    paras[2] === 'Paragraph three here.';
  assert.ok(paraPass);
  console.log(`Test 2 [Paragraph Segmentation]: PASS (Count: ${paras.length})`);

  // 3. Chunk Boundaries & Overlap Test
  const docText =
    '[Page 1]\nPhotosynthesis is the process used by plants to convert light energy into chemical energy.\n\n[Page 2]\nThe Calvin cycle is part of photosynthesis that occurs in the stroma of chloroplasts.';
  const chunks = chunkDocumentText('doc-101', 'user-abc', docText, 120, 30);
  const chunkPass = chunks.length >= 2 && chunks[0].pageNumber === 1 && chunks[1].pageNumber === 2;
  assert.ok(chunkPass);
  console.log(`Test 3 [Chunk Boundaries & Page Preservation]: PASS (Chunks created: ${chunks.length})`);

  // 4. Keyword Extraction Test
  const kwText = 'Mitochondria produce adenosine triphosphate (ATP) through cellular respiration.';
  const keywords = extractKeywords(kwText, 5);
  const kwPass =
    keywords.includes('mitochondria') ||
    keywords.includes('adenosine') ||
    keywords.includes('triphosphate');
  assert.ok(kwPass);
  console.log(`Test 4 [Keyword Extraction]: PASS (Keywords: ${keywords.join(', ')})`);

  // 5. Retrieval Relevance Test
  const sampleChunks = [
    {
      documentId: 'doc-101',
      userId: 'user-abc',
      pageNumber: 1,
      chunkPosition: 0,
      originalText:
        'Mitochondria are known as the powerhouses of the cell, generating ATP via cellular respiration.',
      keywords: ['mitochondria', 'powerhouses', 'cell', 'atp', 'respiration'],
    },
    {
      documentId: 'doc-101',
      userId: 'user-abc',
      pageNumber: 2,
      chunkPosition: 1,
      originalText:
        'Ribosomes synthesize proteins by translating messenger RNA sequences.',
      keywords: ['ribosomes', 'synthesize', 'proteins', 'mrna'],
    },
  ];
  const results = retrieveRelevantPassages(
    'What do mitochondria generate?',
    sampleChunks,
    'user-abc',
    'doc-101',
    1
  );
  assert.ok(results.length === 1 && results[0].chunk.documentId === 'doc-101' && results[0].score > 0);
  console.log(
    `Test 5 [Retrieval Relevance]: PASS (Matched text: "${results[0].chunk.originalText.slice(0, 30)}...")`
  );

  // 6. Empty Documents & Malformed Input Test
  const emptyChunks = chunkDocumentText('doc-102', 'user-abc', '   ');
  const emptyResults = retrieveRelevantPassages('', [], 'user-abc');
  assert.ok(emptyChunks.length === 0 && emptyResults.length === 0);
  console.log('Test 6 [Empty Documents & Malformed Input]: PASS');

  // 7. User / Document Isolation Test
  const isolatedResults = retrieveRelevantPassages(
    'mitochondria',
    sampleChunks,
    'unauthorized-user-xyz',
    'doc-101',
    5
  );
  assert.equal(isolatedResults.length, 0);
  console.log('Test 7 [User / Document Authorization Isolation]: PASS');

  // 8. Unified Document Intelligence Profile + Content-Hash Caching + Structured Highlights
  const richScienceDoc = `[Page 1]
## Classical Mechanics & Forces
Momentum is defined as the product of mass and velocity of a moving body.
Newton's Second Law states that F = ma, where F is net force in N, m is mass in kg, and a is acceleration in m/s^2.
Types of forces include gravitational force, frictional force, and normal force.
Increased friction causes greater thermal energy dissipation during sliding motion.

[Page 2]
## Work and Kinetic Energy
Kinetic Energy: KE = 0.5mv^2, where m is object mass in kg and v is speed in m/s.
Unlike static friction, kinetic friction opposes the ongoing relative motion of surfaces in contact.`;

  const profileA = analyzeDocumentIntelligence(richScienceDoc, {
    title: 'Mechanics Lecture',
  });
  const profileB = analyzeDocumentIntelligence(richScienceDoc, {
    title: 'Mechanics Lecture',
  });

  assert.strictEqual(
    profileA,
    profileB,
    'analyzeDocumentIntelligence must return identical cached profile for unchanged text'
  );
  assert.equal(profileA.subjectArea, 'Physics');
  assert.ok(profileA.definitions.some((d) => d.term === 'Momentum'));
  assert.ok(profileA.formulas.some((f) => f.expressionOrStructure.includes('F = ma')));
  assert.ok(profileA.classifications.length >= 1, 'Should extract classification list');
  assert.ok(profileA.causeEffects.length >= 1, 'Should extract cause-effect link');
  assert.ok(profileA.distinctions.length >= 1, 'Should extract contrast distinction');

  const highlights = extractMatchingStructuredHighlights(
    [
      {
        id: 'doc-phys-1',
        userId: 'user-abc',
        title: 'Mechanics Lecture',
        type: 'PDF',
        extractedText: richScienceDoc,
      },
    ],
    'What is the formula for Kinetic Energy KE?',
    2
  );
  assert.ok(
    highlights.some((h) => h.includes('KE = 0.5mv²')),
    'Structured highlight helper should surface matching formula cleanly'
  );
  console.log('Test 8 [Unified Intelligence Profile, Caching & RAG Highlights]: PASS');

  console.log('[DocumentEngine Test Suite] Overall Status: ALL TESTS PASSED SUCCESSFULLY');
  return true;
}

runDocumentEngineTests();

