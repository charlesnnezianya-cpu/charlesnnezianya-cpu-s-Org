import {
  normalizeText,
  segmentParagraphs,
  extractKeywords,
  chunkDocumentText,
  DocumentChunk,
} from './documentEngine.ts';
import type { StructuredSummary, SummaryLevel } from '../src/types/brainstine.ts';

interface ScoredSentence {
  text: string;
  score: number;
  pageNumber: number | null;
}

/**
 * Generates a fully extractive structured summary from document text without using any LLM/generative API.
 */
export function generateExtractiveSummary(
  title: string,
  subjectArea: string,
  extractedText: string,
  summaryLevel: SummaryLevel = 'detailed'
): Omit<StructuredSummary, 'id' | 'userId' | 'materialId' | 'createdAt' | 'updatedAt'> {
  const normalized = normalizeText(extractedText);
  if (!normalized || normalized.length < 20) {
    return {
      title: title || 'Study Summary',
      subjectArea: subjectArea || 'General Studies',
      summaryLevel,
      topicOverview: 'The provided document contains insufficient text to generate an extractive summary.',
      mainConcepts: [],
      importantDefinitions: [],
      keyTerminology: [],
      difficultConceptExplanations: [],
      importantFacts: [],
      relevantExamples: [],
      formulasOrFrameworks: [],
      comparisonTables: [],
      visualDiagrams: [],
      revisionNotes: [],
      keyTakeaways: [],
      wordCount: 0,
      chunkCount: 0,
      generatedAt: new Date().toISOString(),
      markdown: `# ${title}\n\n*Insufficient study material text available for summarization.*`,
    };
  }

  const chunks = chunkDocumentText('doc-temp', 'user-temp', normalized, 1200, 200);
  const wordCount = normalized.split(/\s+/).length;

  // 1. Sentence splitting & Scoring using Term Frequency (TF)
  const sentences: ScoredSentence[] = [];
  const globalTermFreq = new Map<string, number>();

  // First pass: build global frequency map across all text
  const rawWords = normalized.toLowerCase().match(/\b[a-z0-9][a-z0-9'-]{2,}\b/g) || [];
  for (const w of rawWords) {
    globalTermFreq.set(w, (globalTermFreq.get(w) || 0) + 1);
  }

  for (const chunk of chunks) {
    // Split chunk into sentences
    const rawSentences = chunk.originalText.split(/(?<=[.!?])\s+(?=[A-Z])/);
    for (const rs of rawSentences) {
      const sClean = rs.replace(/\s+/g, ' ').trim();
      if (sClean.length < 15) continue; // skip too short

      // Score sentence by summing term frequencies of non-stop words
      const sWords = sClean.toLowerCase().match(/\b[a-z0-9][a-z0-9'-]{2,}\b/g) || [];
      let score = 0;
      for (const sw of sWords) {
        score += globalTermFreq.get(sw) || 0;
      }
      // Normalize by sentence length to avoid bias toward very long sentences
      score = sWords.length > 0 ? score / Math.sqrt(sWords.length) : 0;

      sentences.push({
        text: sClean,
        score,
        pageNumber: chunk.pageNumber,
      });
    }
  }

  // Deduplicate identical sentences
  const seenSentences = new Set<string>();
  const uniqueSentences = sentences.filter((s) => {
    const key = s.text.toLowerCase();
    if (seenSentences.has(key)) return false;
    seenSentences.add(key);
    return true;
  });

  // Sort by score descending
  uniqueSentences.sort((a, b) => b.score - a.score);

  // 2. Extract Topic Overview (top-scoring sentence)
  const overviewSentence = uniqueSentences[0]?.text || 'Comprehensive summary generated from uploaded study material.';
  const topicOverview = `Based on the study material, ${overviewSentence.charAt(0).toLowerCase()}${overviewSentence.slice(1)}`;

  // 3. Extract Main Concepts (Group top sentences into thematic concept blocks)
  const conceptSentences = uniqueSentences.slice(1, 10);
  const mainConcepts: Array<{ heading: string; sourcePoints: string[]; aiClarification: string }> = [];

  if (conceptSentences.length > 0) {
    const batchSize = Math.max(2, Math.ceil(conceptSentences.length / 3));
    for (let i = 0; i < conceptSentences.length; i += batchSize) {
      const batch = conceptSentences.slice(i, i + batchSize);
      if (batch.length === 0) continue;
      const firstKw = extractKeywords(batch[0].text, 1)[0] || 'Core Principle';
      const heading = `Key Concept: ${firstKw.charAt(0).toUpperCase()}${firstKw.slice(1)}`;
      mainConcepts.push({
        heading,
        sourcePoints: batch.map((b) => (b.pageNumber ? `(Page ${b.pageNumber}) ${b.text}` : b.text)),
        aiClarification: `Extracted directly from source passage matching keyword '${firstKw}'.`,
      });
    }
  }

  // 4. Extract Important Definitions (Look for sentences containing 'is defined as', 'refers to', 'means', 'is a')
  const definitionSentences = uniqueSentences.filter((s) =>
    /\b(is defined as|refers to|means|is a|are defined as|consists of)\b/i.test(s.text)
  );
  const importantDefinitions = definitionSentences.slice(0, 5).map((ds) => {
    const parts = ds.text.split(/\b(is defined as|refers to|means|is a|are defined as)\b/i);
    const term = (parts[0] || 'Term').trim().replace(/[^a-zA-Z0-9\s-_]/g, '');
    const definition = ds.text;
    return {
      term: term.length > 3 && term.length < 35 ? term : 'Key Term',
      definition,
      origin: 'source' as const,
    };
  });

  // 5. Extract Key Terminology
  const allKeywords = extractKeywords(normalized, 15);
  const keyTerminology = Array.from(new Set(allKeywords));

  // 6. Important Facts
  const importantFacts = uniqueSentences.slice(3, 11).map((s) => s.text);

  // 7. Build Markdown Output
  const markdownLines: string[] = [
    `# ${title}`,
    `**Subject:** ${subjectArea} | **Format:** ${summaryLevel.toUpperCase()} Extractive Summary`,
    '',
    '## Topic Overview',
    topicOverview,
    '',
  ];

  if (mainConcepts.length > 0) {
    markdownLines.push('## Main Concepts & Points');
    for (const c of mainConcepts) {
      markdownLines.push(`### ${c.heading}`);
      for (const pt of c.sourcePoints) {
        markdownLines.push(`- [From Source] ${pt}`);
      }
      markdownLines.push('');
    }
  }

  if (importantDefinitions.length > 0) {
    markdownLines.push('## Important Definitions');
    for (const def of importantDefinitions) {
      markdownLines.push(`- **${def.term}** (From Source): ${def.definition}`);
    }
    markdownLines.push('');
  }

  if (keyTerminology.length > 0) {
    markdownLines.push('## Key Terminology');
    markdownLines.push(keyTerminology.join(', '));
    markdownLines.push('');
  }

  if (importantFacts.length > 0) {
    markdownLines.push('## Important Facts (From Source)');
    for (const f of importantFacts) {
      markdownLines.push(`- ${f}`);
    }
    markdownLines.push('');
  }

  const structuredSummary: Omit<StructuredSummary, 'id' | 'userId' | 'materialId' | 'createdAt' | 'updatedAt'> = {
    title,
    subjectArea,
    summaryLevel,
    topicOverview,
    mainConcepts,
    importantDefinitions,
    keyTerminology,
    difficultConceptExplanations: [],
    importantFacts,
    relevantExamples: [],
    formulasOrFrameworks: [],
    comparisonTables: [],
    visualDiagrams: [],
    revisionNotes: importantFacts.slice(0, 4),
    keyTakeaways: mainConcepts.map((m) => m.heading),
    wordCount,
    chunkCount: chunks.length,
    generatedAt: new Date().toISOString(),
    markdown: markdownLines.join('\n'),
  };

  return structuredSummary;
}
