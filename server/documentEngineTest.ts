import {
  normalizeText,
  segmentParagraphs,
  extractKeywords,
  chunkDocumentText,
  retrieveRelevantPassages,
} from './documentEngine.ts';

function runDocumentEngineTests() {
  console.log('[DocumentEngine Test Suite] Starting validation tests...');

  // 1. Text Normalization Test
  const rawInput = '  Hello   World! \r\n\r\n  This is a \u0000test document.  ';
  const normalized = normalizeText(rawInput);
  const normPass = normalized === 'Hello World!\n\nThis is a test document.';
  console.log(`Test 1 [Text Normalization]: ${normPass ? 'PASS' : 'FAIL'} (Result: "${normalized}")`);

  // 2. Paragraph Segmentation Test
  const multiPara = 'Paragraph one here.\n\nParagraph two here.\n\n\nParagraph three here.';
  const paras = segmentParagraphs(multiPara);
  const paraPass = paras.length === 3 && paras[0] === 'Paragraph one here.' && paras[2] === 'Paragraph three here.';
  console.log(`Test 2 [Paragraph Segmentation]: ${paraPass ? 'PASS' : 'FAIL'} (Count: ${paras.length})`);

  // 3. Chunk Boundaries & Overlap Test
  const docText = '[Page 1]\nPhotosynthesis is the process used by plants to convert light energy into chemical energy.\n\n[Page 2]\nThe Calvin cycle is part of photosynthesis that occurs in the stroma of chloroplasts.';
  const chunks = chunkDocumentText('doc-101', 'user-abc', docText, 120, 30);
  const chunkPass = chunks.length >= 2 && chunks[0].pageNumber === 1 && chunks[1].pageNumber === 2;
  console.log(`Test 3 [Chunk Boundaries & Page Preservation]: ${chunkPass ? 'PASS' : 'FAIL'} (Chunks created: ${chunks.length})`);

  // 4. Keyword Extraction Test
  const kwText = 'Mitochondria produce adenosine triphosphate (ATP) through cellular respiration.';
  const keywords = extractKeywords(kwText, 5);
  const kwPass = keywords.includes('mitochondria') || keywords.includes('adenosine') || keywords.includes('triphosphate');
  console.log(`Test 4 [Keyword Extraction]: ${kwPass ? 'PASS' : 'FAIL'} (Keywords: ${keywords.join(', ')})`);

  // 5. Retrieval Relevance Test
  const sampleChunks = [
    {
      documentId: 'doc-101',
      userId: 'user-abc',
      pageNumber: 1,
      chunkPosition: 0,
      originalText: 'Mitochondria are known as the powerhouses of the cell, generating ATP via cellular respiration.',
      keywords: ['mitochondria', 'powerhouses', 'cell', 'atp', 'respiration'],
    },
    {
      documentId: 'doc-101',
      userId: 'user-abc',
      pageNumber: 2,
      chunkPosition: 1,
      originalText: 'Ribosomes synthesize proteins by translating messenger RNA sequences.',
      keywords: ['ribosomes', 'synthesize', 'proteins', 'mrna'],
    },
  ];
  const results = retrieveRelevantPassages('What do mitochondria generate?', sampleChunks, 'user-abc', 'doc-101', 1);
  const retrievePass = results.length === 1 && results[0].chunk.documentId === 'doc-101' && results[0].score > 0;
  console.log(`Test 5 [Retrieval Relevance]: ${retrievePass ? 'PASS' : 'FAIL'} (Matched text: "${results[0]?.chunk.originalText.slice(0, 30)}...")`);

  // 6. Empty Documents & Malformed Input Test
  const emptyChunks = chunkDocumentText('doc-102', 'user-abc', '   ');
  const emptyResults = retrieveRelevantPassages('', [], 'user-abc');
  const emptyPass = emptyChunks.length === 0 && emptyResults.length === 0;
  console.log(`Test 6 [Empty Documents & Malformed Input]: ${emptyPass ? 'PASS' : 'FAIL'}`);

  // 7. User / Document Isolation Test
  const isolatedResults = retrieveRelevantPassages('mitochondria', sampleChunks, 'unauthorized-user-xyz', 'doc-101', 5);
  const isolationPass = isolatedResults.length === 0;
  console.log(`Test 7 [User / Document Authorization Isolation]: ${isolationPass ? 'PASS' : 'FAIL'} (Results returned for unauthorized user: ${isolatedResults.length})`);

  const allPassed = normPass && paraPass && chunkPass && kwPass && retrievePass && emptyPass && isolationPass;
  console.log(`[DocumentEngine Test Suite] Overall Status: ${allPassed ? 'ALL TESTS PASSED SUCCESSFULLY' : 'SOME TESTS FAILED'}`);
  return allPassed;
}

runDocumentEngineTests();
