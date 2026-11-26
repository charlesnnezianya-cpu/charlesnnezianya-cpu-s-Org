import {
  analyzeDocumentIntelligence,
  buildSectionClusterHeading,
  contentTokens,
  isRedundantAgainstPool,
  normalizedFingerprint,
  normalizeText,
  stripBoilerplatePrefix,
  tokenSimilarity,
  type AnalyzedUnit,
  type DocumentIntelligenceProfile,
} from './documentEngine.ts';
import { formatScientificText, stripUnsupportedDisplaySymbols } from '../src/lib/scientificFormatter.ts';
import {
  stripSourceFilenameFromTitle,
  stripSummarySourceAndPageRefs,
} from '../src/lib/summarySanitizer.ts';
import { evaluateVisualLearningNeeds } from '../src/lib/visualLearningEngine.ts';
import type {
  ClassificationGroup,
  ClassificationTypeEntry,
  ComparisonTable,
  DefinitionTerm,
  DifficultConceptExplanation,
  DistinctionItem,
  FormulaOrFramework,
  MainConceptSection,
  ProcessMechanismGroup,
  RelevantExample,
  StructuredCharacteristicItem,
  StructuredSummary,
  SummaryLevel,
  SummaryValidationReport,
} from '../src/types/brainstine.ts';

const MISSING_TYPE_EXPLANATION =
  'Named in the study notes without a separate detailed explanation.';

function sanitizeSummaryText(text: string): string {
  const cleanedSymbols = stripUnsupportedDisplaySymbols(text);
  if (!cleanedSymbols) return '';
  return stripSummarySourceAndPageRefs(cleanedSymbols);
}

export function buildDocumentSummaryMarkdown(
  summary: Omit<StructuredSummary, 'markdown'>
): string {
  const levelLabel =
    summary.summaryLevel === 'short'
      ? 'Short Summary'
      : summary.summaryLevel === 'detailed'
        ? 'Detailed Summary'
        : 'Comprehensive Study Notes';

  const cleanTitle = stripSourceFilenameFromTitle(summary.title);
  const lines: string[] = [
    `# ${cleanTitle}`,
    `**Subject:** ${summary.subjectArea} | **Format:** ${levelLabel} | **Length:** ${summary.wordCount.toLocaleString()} words`,
    '',
  ];

  if (summary.sourceNotice) {
    lines.push(`> ${summary.sourceNotice}`);
    lines.push('');
  }

  // A. Topic Overview
  if (summary.topicOverview) {
    lines.push('## Topic Overview', summary.topicOverview, '');
  }

  // B. Main Concepts
  if (summary.mainConcepts.length > 0) {
    lines.push('## Main Concepts');
    for (const item of summary.mainConcepts) {
      lines.push(`### ${item.heading}`);
      for (const pt of item.sourcePoints) {
        lines.push(`- ${pt}`);
      }
      if (item.subsections && item.subsections.length > 0) {
        for (const sub of item.subsections) {
          lines.push(`#### ${sub.heading}`);
          for (const subPt of sub.points) {
            lines.push(`- ${subPt}`);
          }
        }
      }
      if (item.examples && item.examples.length > 0) {
        lines.push('**Examples:**');
        for (const ex of item.examples) {
          lines.push(`- ${ex}`);
        }
      }
      lines.push('');
    }
  }

  // C. Definitions
  if (summary.importantDefinitions.length > 0) {
    lines.push('## Definitions');
    for (const def of summary.importantDefinitions) {
      lines.push(`- **${def.term}** — ${def.definition}`);
    }
    lines.push('');
  }

  // D. Classifications and Types
  if (summary.classificationsAndTypes && summary.classificationsAndTypes.length > 0) {
    lines.push('## Classifications and Types');
    for (const cls of summary.classificationsAndTypes) {
      lines.push(`### ${cls.topic}`);
      lines.push(cls.overviewStatement);
      cls.types.forEach((t, idx) => {
        lines.push(`${idx + 1}. **${t.name}:** ${t.explanation}`);
        if (t.characteristics && t.characteristics.length > 0) {
          for (const ch of t.characteristics) {
            lines.push(`   - Characteristic: ${ch}`);
          }
        }
        if (t.examples && t.examples.length > 0) {
          for (const ex of t.examples) {
            lines.push(`   - Example: ${ex}`);
          }
        }
      });
      if (cls.comparisonNote) {
        lines.push(`- **Comparison:** ${cls.comparisonNote}`);
      }
      lines.push('');
    }
  }

  // E. Characteristics, Processes, and Formulas
  if (
    summary.characteristicsAndExplanations &&
    summary.characteristicsAndExplanations.length > 0
  ) {
    lines.push('## Characteristics and Explanations');
    for (const grp of summary.characteristicsAndExplanations) {
      if (summary.characteristicsAndExplanations.length > 1) {
        lines.push(`### ${grp.topic}`);
      }
      for (const pt of grp.points) {
        lines.push(`- ${pt}`);
      }
      lines.push('');
    }
  }

  if (summary.processesAndMechanisms && summary.processesAndMechanisms.length > 0) {
    lines.push('## Processes & Mechanisms');
    for (const proc of summary.processesAndMechanisms) {
      lines.push(`### ${proc.heading}`);
      proc.steps.forEach((step, idx) => {
        lines.push(`${idx + 1}. ${step}`);
      });
      lines.push('');
    }
  }

  if (summary.formulasOrFrameworks.length > 0) {
    lines.push('## Formulas & Equations');
    for (const f of summary.formulasOrFrameworks) {
      lines.push(`- **${f.name}:** ${f.expressionOrStructure} — ${f.usage}`);
      if (f.variables && f.variables.length > 0) {
        lines.push(
          `  - Variables: ${f.variables.map((v) => `${v.symbol} = ${v.meaning}`).join('; ')}`
        );
      }
    }
    lines.push('');
  }

  if (summary.importantFacts.length > 0) {
    lines.push('## Additional Key Details');
    for (const fact of summary.importantFacts) {
      lines.push(`- ${fact}`);
    }
    lines.push('');
  }

  // F. Examples
  if (summary.relevantExamples.length > 0) {
    lines.push('## Examples');
    for (const ex of summary.relevantExamples) {
      lines.push(`- **${ex.title}:** ${ex.example}`);
    }
    lines.push('');
  }

  // G. Comparisons
  if (summary.comparisonTables && summary.comparisonTables.length > 0) {
    lines.push('## Comparisons');
    for (const table of summary.comparisonTables) {
      lines.push(`### ${table.title}`);
      lines.push(`| Criterion | ${table.headers.join(' | ')} |`);
      lines.push(`| --- | ${table.headers.map(() => '---').join(' | ')} |`);
      for (const row of table.rows) {
        lines.push(`| ${row.criterion} | ${row.values.join(' | ')} |`);
      }
      lines.push('');
    }
  }

  if (summary.importantDistinctions && summary.importantDistinctions.length > 0) {
    if (!summary.comparisonTables || summary.comparisonTables.length === 0) {
      lines.push('## Comparisons');
    } else {
      lines.push('### Key Distinctions');
    }
    for (const dist of summary.importantDistinctions) {
      lines.push(`- **${dist.pairTitle}:** ${dist.comparison}`);
    }
    lines.push('');
  }

  if (summary.difficultConceptExplanations.length > 0) {
    lines.push('## Concept Clarifications');
    for (const item of summary.difficultConceptExplanations) {
      lines.push(`- **${item.concept}:** ${item.sourceContext}`);
      if (item.plainExplanation) {
        lines.push(`  - Clarification: ${item.plainExplanation}`);
      }
    }
    lines.push('');
  }

  if (summary.keyTerminology.length > 0) {
    lines.push('## Key Terminology');
    lines.push(summary.keyTerminology.join(' · '));
    lines.push('');
  }

  if (summary.revisionNotes.length > 0) {
    lines.push('## Cause & Formula Checks');
    for (const note of summary.revisionNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  // H. Key Takeaways
  if (summary.keyTakeaways.length > 0) {
    lines.push('## Key Takeaways');
    for (const kt of summary.keyTakeaways) {
      lines.push(`- ${kt}`);
    }
    lines.push('');
  }

  return stripSummarySourceAndPageRefs(lines.join('\n').trim());
}

function buildDeterministicComparisonTables(
  profile: DocumentIntelligenceProfile,
  classificationsAndTypes: ClassificationGroup[],
  maxTables: number
): ComparisonTable[] {
  if (maxTables <= 0) return [];
  const tables: ComparisonTable[] = [];

  const cleanCell = (val: string) => formatScientificText(sanitizeSummaryText(val));

  // 1. Pairwise distinctions table from grounded contrast statements
  const paired = profile.distinctions.filter((d) => d.subjectA && d.subjectB);
  if (paired.length > 0) {
    const primary = paired[0];
    const rows = paired
      .filter(
        (d) =>
          (d.subjectA === primary.subjectA && d.subjectB === primary.subjectB) ||
          (d.subjectA === primary.subjectB && d.subjectB === primary.subjectA)
      )
      .slice(0, 5)
      .map((d, idx) => {
        const comp = cleanCell(d.comparison);
        const whereasSplit = comp.split(/\bwhereas\b|\bin contrast,\b|\bunlike\b/i);
        const valA =
          whereasSplit.length >= 2
            ? cleanCell(whereasSplit[0].replace(/^unlike\s+[^,]+,\s*/i, ''))
            : comp;
        const valB =
          whereasSplit.length >= 2
            ? cleanCell(whereasSplit.slice(1).join('; '))
            : 'Contrasting focus described in the study material';
        return {
          criterion: cleanCell(d.sectionHeading || `Contrast ${idx + 1}`),
          values: [valA, valB],
        };
      })
      .filter((row) => row.values[0].length > 0 && row.values[1].length > 0);

    if (rows.length > 0 && primary.subjectA && primary.subjectB) {
      tables.push({
        title: cleanCell(`${primary.subjectA} vs. ${primary.subjectB}`),
        headers: [cleanCell(primary.subjectA), cleanCell(primary.subjectB)],
        rows,
      });
    }
  }

  // 2. Side-by-side comparison across types within a classification when grounded details exist
  for (const cls of classificationsAndTypes) {
    if (tables.length >= maxTables) break;
    if (cls.types.length < 2 || cls.types.length > 4) continue;

    // Avoid duplicating a pairwise table covering the exact same pair
    const typeNamesLower = cls.types.map((t) => t.name.toLowerCase());
    const alreadyCovered = tables.some((t) =>
      t.headers.every((h) =>
        typeNamesLower.some((n) => n.includes(h.toLowerCase()) || h.toLowerCase().includes(n))
      )
    );
    if (alreadyCovered) continue;

    const rows: ComparisonTable['rows'] = [];
    const explainedCount = cls.types.filter(
      (t) => t.explanation && t.explanation !== MISSING_TYPE_EXPLANATION
    ).length;

    if (explainedCount >= 2) {
      rows.push({
        criterion: 'Core Description',
        values: cls.types.map((t) =>
          t.explanation === MISSING_TYPE_EXPLANATION
            ? 'Not separately detailed in the material'
            : cleanCell(t.explanation)
        ),
      });
    }

    const withChars = cls.types.filter((t) => t.characteristics && t.characteristics.length > 0).length;
    if (withChars >= 2) {
      rows.push({
        criterion: 'Characteristics',
        values: cls.types.map((t) =>
          t.characteristics && t.characteristics.length > 0
            ? cleanCell(t.characteristics.slice(0, 2).join('; '))
            : '—'
        ),
      });
    }

    const withExamples = cls.types.filter((t) => t.examples && t.examples.length > 0).length;
    if (withExamples >= 2) {
      rows.push({
        criterion: 'Examples',
        values: cls.types.map((t) =>
          t.examples && t.examples.length > 0 ? cleanCell(t.examples[0]) : '—'
        ),
      });
    }

    if (rows.length > 0) {
      tables.push({
        title: cleanCell(`Comparison of ${cls.topic}`),
        headers: cls.types.map((t) => cleanCell(t.name)),
        rows,
      });
    }
  }

  return tables.slice(0, maxTables);
}

function buildSectionPointsAndSubsections(
  selectedUnits: AnalyzedUnit[]
): {
  sourcePoints: string[];
  subsections: Array<{ heading: string; points: string[] }>;
} {
  const ordered = [...selectedUnits].sort((a, b) => a.orderIndex - b.orderIndex);
  const hasSubheadings = ordered.some((u) => Boolean(u.subheading));

  if (!hasSubheadings) {
    return {
      sourcePoints: ordered.map((u) => stripBoilerplatePrefix(u.formattedText)),
      subsections: [],
    };
  }

  const topPoints: string[] = [];
  const subMap = new Map<string, string[]>();
  for (const u of ordered) {
    const clean = stripBoilerplatePrefix(u.formattedText);
    if (u.subheading) {
      const arr = subMap.get(u.subheading) || [];
      arr.push(clean);
      subMap.set(u.subheading, arr);
    } else {
      topPoints.push(clean);
    }
  }

  return {
    sourcePoints: topPoints,
    subsections: Array.from(subMap.entries()).map(([heading, points]) => ({
      heading,
      points,
    })),
  };
}

/**
 * Generates an intelligent, deterministic, document-only structured summary without generative AI APIs,
 * powered directly by the shared Document Intelligence Engine in /server/documentEngine.ts.
 */
export function generateExtractiveSummary(
  title: string,
  subjectArea: string,
  extractedText: string,
  summaryLevel: SummaryLevel = 'detailed'
): Omit<StructuredSummary, 'id' | 'userId' | 'materialId' | 'createdAt' | 'updatedAt'> {
  const normalized = normalizeText(extractedText);
  const alphaWordCount = (normalized.match(/[a-zA-Z]{2,}/g) || []).length;

  if (!normalized || normalized.length < 20 || alphaWordCount < 3) {
    const safeTitle = stripSourceFilenameFromTitle(
      stripUnsupportedDisplaySymbols(title) || 'Document Summary'
    );
    return {
      title: safeTitle,
      subjectArea: subjectArea || 'General Studies',
      summaryLevel,
      topicOverview:
        'The provided material contains insufficient text to generate a summary.',
      sourceNotice:
        'Provide readable study notes or paste at least a few complete sentences to generate structured notes.',
      mainConcepts: [],
      importantDefinitions: [],
      classificationsAndTypes: [],
      characteristicsAndExplanations: [],
      keyTerminology: [],
      difficultConceptExplanations: [],
      importantFacts: [],
      relevantExamples: [],
      formulasOrFrameworks: [],
      processesAndMechanisms: [],
      importantDistinctions: [],
      finalRecap: [],
      comparisonTables: [],
      visualDiagrams: [],
      visualAids: [],
      revisionNotes: [],
      keyTakeaways: [],
      wordCount: 0,
      chunkCount: 0,
      generatedAt: new Date().toISOString(),
      generationMode: 'extractive',
      markdown: `# ${safeTitle}\n\n*Insufficient readable text available for summarization.*`,
    };
  }

  const resolvedTitle = stripSourceFilenameFromTitle(
    stripUnsupportedDisplaySymbols((title || 'Document Summary').trim())
  );
  const profile = analyzeDocumentIntelligence(normalized, {
    title: resolvedTitle,
    subjectArea,
  });

  const dedupedUnits = profile.units;
  const wordCount = profile.quality.wordCount;

  const sanitizeOut = (text: string) =>
    formatScientificText(sanitizeSummaryText(text));

  const limits =
    summaryLevel === 'short'
      ? {
          overview: 2,
          concepts: 5,
          pointsPerConcept: 2,
          defs: 4,
          clsGroups: 3,
          charsPerType: 1,
          exPerType: 1,
          charTopics: 2,
          charPoints: 2,
          procGroups: 2,
          procSteps: 4,
          formulas: 3,
          facts: 3,
          examples: 2,
          distinctions: 2,
          terms: 8,
          difficult: 0,
          tables: 0,
          revision: 0,
          takeaways: 4,
        }
      : summaryLevel === 'comprehensive'
        ? {
            overview: 3,
            concepts: 20,
            pointsPerConcept: 6,
            defs: 14,
            clsGroups: 8,
            charsPerType: 5,
            exPerType: 3,
            charTopics: 8,
            charPoints: 5,
            procGroups: 6,
            procSteps: 8,
            formulas: 10,
            facts: 8,
            examples: 8,
            distinctions: 8,
            terms: 20,
            difficult: 4,
            tables: 3,
            revision: 6,
            takeaways: 7,
          }
        : {
            overview: 2,
            concepts: 10,
            pointsPerConcept: 4,
            defs: 8,
            clsGroups: 5,
            charsPerType: 3,
            exPerType: 2,
            charTopics: 5,
            charPoints: 4,
            procGroups: 4,
            procSteps: 6,
            formulas: 6,
            facts: 5,
            examples: 5,
            distinctions: 5,
            terms: 14,
            difficult: 3,
            tables: 2,
            revision: 0,
            takeaways: 5,
          };

  const usedPool: Array<{ fp: string; tokens: Set<string> }> = [];
  const markUsed = (text: string, tokens?: Set<string>) => {
    const clean = stripUnsupportedDisplaySymbols(text);
    const t = tokens ?? contentTokens(clean);
    usedPool.push({ fp: normalizedFingerprint(clean), tokens: t });
  };

  // --------------------------------------------------------------------------
  // D (Pre-reserved first so definitions/main concepts don't duplicate types)
  // Classifications & Types
  // --------------------------------------------------------------------------
  const classificationsAndTypes: ClassificationGroup[] = [];
  const missingExplanationTypes: string[] = [];

  for (const cls of profile.classifications.slice(0, limits.clsGroups)) {
    const entries: ClassificationTypeEntry[] = cls.types.map((t) => {
      const rawExpl = t.explanation || MISSING_TYPE_EXPLANATION;
      if (rawExpl === MISSING_TYPE_EXPLANATION) {
        missingExplanationTypes.push(t.name);
      } else {
        markUsed(rawExpl);
      }

      const trimmedChars = t.characteristics
        .slice(0, limits.charsPerType)
        .map((c) => sanitizeOut(c));
      trimmedChars.forEach((c) => markUsed(c));

      const trimmedExamples = t.examples
        .slice(0, limits.exPerType)
        .map((ex) => sanitizeOut(ex));
      trimmedExamples.forEach((ex) => markUsed(ex));

      return {
        name: sanitizeOut(t.name),
        explanation:
          rawExpl === MISSING_TYPE_EXPLANATION ? rawExpl : sanitizeOut(rawExpl),
        ...(trimmedChars.length > 0 ? { characteristics: trimmedChars } : {}),
        ...(trimmedExamples.length > 0 ? { examples: trimmedExamples } : {}),
      };
    });

    markUsed(cls.statement);
    if (cls.comparisonNote) {
      markUsed(cls.comparisonNote);
    }

    classificationsAndTypes.push({
      topic: sanitizeOut(
        cls.category.charAt(0).toUpperCase() + cls.category.slice(1)
      ),
      overviewStatement: sanitizeOut(cls.overviewStatement),
      types: entries,
      ...(summaryLevel !== 'short' && cls.comparisonNote
        ? { comparisonNote: sanitizeOut(cls.comparisonNote) }
        : {}),
    });
  }

  // --------------------------------------------------------------------------
  // C. Definitions (Important Definitions — separated cleanly from Main Concepts)
  // --------------------------------------------------------------------------
  const importantDefinitions: DefinitionTerm[] = [];
  for (const d of profile.definitions) {
    if (importantDefinitions.length >= limits.defs) break;
    // Skip if already verbatim covered as a named type explanation in Classifications
    if (
      isRedundantAgainstPool(
        d.sourceText,
        contentTokens(d.sourceText),
        usedPool,
        0.65,
        0.82
      )
    ) {
      continue;
    }
    importantDefinitions.push({
      term: sanitizeOut(d.term),
      definition: sanitizeOut(d.definition),
      origin: d.origin,
    });
    markUsed(d.sourceText);
    markUsed(`${d.term} ${d.rawDefinition}`);
  }

  // Reserve ordered process steps before Main Concepts so multi-step pathways stay intact
  const processesAndMechanisms: ProcessMechanismGroup[] = [];
  for (const proc of profile.processes) {
    if (processesAndMechanisms.length >= limits.procGroups) break;
    const nonRedundantSteps = proc.steps.filter(
      (s) => !isRedundantAgainstPool(s.rawText, contentTokens(s.rawText), usedPool, 0.68, 0.85)
    );
    if (
      nonRedundantSteps.length >= 2 ||
      (nonRedundantSteps.length === 1 && proc.steps.length === 1)
    ) {
      const chosen = nonRedundantSteps.slice(0, limits.procSteps);
      processesAndMechanisms.push({
        heading: sanitizeOut(proc.heading),
        steps: chosen.map((s) => sanitizeOut(s.text)),
      });
      for (const s of chosen) markUsed(s.rawText);
    }
  }

  // Reserve explicit Comparison Tables & Distinctions before Main Concepts consume prose units
  const comparisonTables = buildDeterministicComparisonTables(
    profile,
    classificationsAndTypes,
    limits.tables
  );

  const tableFingerprints = new Set<string>();
  for (const table of comparisonTables) {
    for (const row of table.rows) {
      for (const val of row.values) {
        tableFingerprints.add(normalizedFingerprint(val));
      }
    }
  }
  for (const cls of classificationsAndTypes) {
    if (cls.comparisonNote) {
      tableFingerprints.add(normalizedFingerprint(cls.comparisonNote));
    }
  }

  const importantDistinctions: DistinctionItem[] = [];
  for (const dist of profile.distinctions) {
    if (importantDistinctions.length >= limits.distinctions) break;
    const distTokens = contentTokens(dist.sourceText);
    const rawFp = normalizedFingerprint(dist.sourceText);
    if (
      tableFingerprints.has(rawFp) ||
      isRedundantAgainstPool(dist.sourceText, distTokens, usedPool, 0.56, 0.76)
    ) {
      continue;
    }
    importantDistinctions.push({
      pairTitle: sanitizeOut(dist.pairTitle),
      comparison: sanitizeOut(dist.comparison),
    });
    markUsed(dist.sourceText, distTokens);
  }

  // --------------------------------------------------------------------------
  // A. Topic Overview (Synthesizes central subject & TextRank prose cleanly)
  // --------------------------------------------------------------------------
  const distinctionTexts = new Set(profile.distinctions.map((d) => d.sourceText));
  const classificationFingerprints = new Set<string>();
  for (const cls of profile.classifications) {
    for (const fp of cls.sourceFingerprints) {
      classificationFingerprints.add(fp);
    }
  }

  const firstSectionHeading = profile.sections[0]?.heading || null;
  const rankedByScore = [...dedupedUnits].sort((a, b) => b.score - a.score);
  const overviewCandidates = [...dedupedUnits]
    .filter(
      (u) =>
        !/^\s*[A-Za-zΔ]+\s*[=∝]/.test(u.formattedText) &&
        !u.isStep &&
        !classificationFingerprints.has(u.fingerprint) &&
        !/^(?:first|initially|second|third|next|then|subsequently|finally)\b/i.test(
          u.formattedText
        ) &&
        !distinctionTexts.has(u.formattedText)
    )
    .sort((a, b) => {
      const aLead =
        (a.orderIndex <= 4 ? 1.45 : 1) *
        (firstSectionHeading && a.sectionHeading === firstSectionHeading ? 1.3 : 1);
      const bLead =
        (b.orderIndex <= 4 ? 1.45 : 1) *
        (firstSectionHeading && b.sectionHeading === firstSectionHeading ? 1.3 : 1);
      return b.score * bLead - a.score * aLead;
    });

  // For multi-section docs, keep Topic Overview concise from opening/central prose so later sections remain rich in Main Concepts
  const overviewTarget =
    dedupedUnits.length <= 6
      ? 1
      : profile.sections.length >= 2
        ? Math.min(2, limits.overview)
        : limits.overview;
  const selectedOverviewUnits: AnalyzedUnit[] = [];
  for (const cand of overviewCandidates) {
    if (selectedOverviewUnits.length >= overviewTarget) break;
    if (
      profile.sections.length >= 2 &&
      firstSectionHeading &&
      cand.sectionHeading &&
      cand.sectionHeading !== firstSectionHeading &&
      selectedOverviewUnits.length >= 1
    ) {
      continue;
    }
    if (isRedundantAgainstPool(cand.formattedText, cand.tokens, usedPool, 0.54, 0.74)) {
      continue;
    }
    selectedOverviewUnits.push(cand);
    markUsed(cand.formattedText, cand.tokens);
  }
  if (selectedOverviewUnits.length === 0 && dedupedUnits[0]) {
    // Allow brief intro from lead unit if overviewCandidates were already placed in Definitions/Classifications
    const leadAlt =
      dedupedUnits.find(
        (u) =>
          !classificationFingerprints.has(u.fingerprint) &&
          !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.78, 0.9)
      ) || dedupedUnits[0];
    selectedOverviewUnits.push(leadAlt);
    markUsed(leadAlt.formattedText, leadAlt.tokens);
  }

  selectedOverviewUnits.sort((a, b) => a.orderIndex - b.orderIndex);
  const overviewCore = selectedOverviewUnits
    .map((u) => sanitizeOut(stripBoilerplatePrefix(u.formattedText)))
    .join(' ');

  const namedSectionHeadings = profile.sections
    .map((s) => s.heading)
    .filter((h) => !/^Page \d+$/i.test(h))
    .slice(0, 4);
  const themeLead =
    summaryLevel !== 'short' && namedSectionHeadings.length >= 2
      ? `Key areas covered include ${namedSectionHeadings.join(', ')}. `
      : '';
  const topicOverview = sanitizeOut(`${overviewCore} ${themeLead}`.trim());

  // --------------------------------------------------------------------------
  // B. Main Concepts (strict document order + attached examples + subsections)
  // --------------------------------------------------------------------------
  const mainConcepts: MainConceptSection[] = [];
  const attachedExampleIndices = new Set<number>();

  const attachExamplesToHeading = (
    heading: string,
    sectionUnits: AnalyzedUnit[]
  ): string[] => {
    const attached: string[] = [];
    const headingTokens = contentTokens(heading);
    const secTokenUnion = new Set<string>(headingTokens);
    for (const u of sectionUnits) {
      for (const tok of u.tokens) secTokenUnion.add(tok);
    }

    profile.examples.forEach((ex, idx) => {
      if (attached.length >= 2 || attachedExampleIndices.has(idx)) return;
      const sameSection =
        ex.sectionHeading &&
        ex.sectionHeading.toLowerCase() === heading.toLowerCase();
      const exTokens = contentTokens(ex.example);
      const { containment } = tokenSimilarity(exTokens, secTokenUnion);
      if (
        (sameSection || containment >= 0.38) &&
        !isRedundantAgainstPool(ex.example, exTokens, usedPool, 0.65, 0.82)
      ) {
        attached.push(sanitizeOut(ex.example));
        attachedExampleIndices.add(idx);
        markUsed(ex.example, exTokens);
      }
    });
    return attached;
  };

  if (profile.quality.hasStructuredHeadings && profile.sections.length > 0) {
    for (const sec of profile.sections) {
      if (mainConcepts.length >= limits.concepts) break;

      // Skip sections whose entire prose belongs exclusively inside ClassificationsAndTypes
      const isClassificationSection = classificationsAndTypes.some(
        (c) =>
          c.topic.toLowerCase() === sec.heading.toLowerCase() ||
          `types of ${c.topic.toLowerCase()}` === sec.heading.toLowerCase() ||
          `categories of ${c.topic.toLowerCase()}` === sec.heading.toLowerCase()
      );

      const nonRedundantUnits = sec.units.filter(
        (u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.56, 0.76)
      );

      if (isClassificationSection && nonRedundantUnits.length === 0) {
        continue;
      }

      const fallbackUnits = sec.units.filter(
        (u) =>
          !selectedOverviewUnits.includes(u) &&
          !classificationFingerprints.has(u.fingerprint) &&
          !importantDefinitions.some(
            (d) => normalizedFingerprint(`${d.term} ${d.definition}`) === u.fingerprint
          )
      );

      const pool =
        nonRedundantUnits.length > 0
          ? nonRedundantUnits
          : !isClassificationSection && fallbackUnits.length > 0
            ? fallbackUnits
            : [];

      if (pool.length === 0) continue;

      const selectedGroup = [...pool]
        .sort((a, b) => b.score - a.score)
        .slice(0, limits.pointsPerConcept);

      const { sourcePoints, subsections } = buildSectionPointsAndSubsections(
        selectedGroup
      );
      if (sourcePoints.length === 0 && subsections.length === 0) continue;

      for (const u of selectedGroup) {
        markUsed(u.formattedText, u.tokens);
      }

      const attachedExamples =
        summaryLevel !== 'short' ? attachExamplesToHeading(sec.heading, selectedGroup) : [];

      mainConcepts.push({
        heading: sanitizeOut(sec.heading),
        sourcePoints: sourcePoints.map(sanitizeOut),
        aiClarification: '',
        ...(subsections.length > 0
          ? {
              subsections: subsections.map((sub) => ({
                heading: sanitizeOut(sub.heading),
                points: sub.points.map(sanitizeOut),
              })),
            }
          : {}),
        ...(attachedExamples.length > 0 ? { examples: attachedExamples } : {}),
      });
    }
  } else {
    // Unheaded document: cluster remaining substantive units cleanly in document order
    const remainingUnits = dedupedUnits.filter(
      (u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.55, 0.75)
    );
    const pool =
      remainingUnits.length >= 2 || dedupedUnits.length < 4
        ? remainingUnits
        : dedupedUnits.filter((u) => !selectedOverviewUnits.includes(u));

    const clusters: AnalyzedUnit[][] = [];
    for (const unit of pool) {
      if (clusters.length >= limits.concepts) {
        const bestCluster = clusters.find((c) => {
          if (c.length >= limits.pointsPerConcept) return false;
          return tokenSimilarity(unit.tokens, c[0].tokens).jaccard >= 0.16;
        });
        if (bestCluster) bestCluster.push(unit);
        continue;
      }

      let bestCluster: AnalyzedUnit[] | null = null;
      let bestSim = 0;
      for (const cluster of clusters) {
        if (cluster.length >= limits.pointsPerConcept) continue;
        const sim = tokenSimilarity(unit.tokens, cluster[0].tokens).jaccard;
        if (sim > bestSim && sim >= 0.16) {
          bestSim = sim;
          bestCluster = cluster;
        }
      }
      if (bestCluster) {
        bestCluster.push(unit);
      } else {
        clusters.push([unit]);
      }
    }

    // Order clusters by earliest appearance in the document
    clusters.sort(
      (a, b) =>
        Math.min(...a.map((u) => u.orderIndex)) - Math.min(...b.map((u) => u.orderIndex))
    );

    clusters.forEach((cluster, idx) => {
      const topInCluster = [...cluster]
        .sort((a, b) => b.score - a.score)
        .slice(0, limits.pointsPerConcept)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const heading = buildSectionClusterHeading(topInCluster, idx);
      for (const u of topInCluster) markUsed(u.formattedText, u.tokens);
      const attachedExamples =
        summaryLevel !== 'short' ? attachExamplesToHeading(heading, topInCluster) : [];

      mainConcepts.push({
        heading: sanitizeOut(heading),
        sourcePoints: topInCluster.map((u) =>
          sanitizeOut(stripBoilerplatePrefix(u.formattedText))
        ),
        aiClarification: '',
        ...(attachedExamples.length > 0 ? { examples: attachedExamples } : {}),
      });
    });
  }

  // --------------------------------------------------------------------------
  // E. Characteristics, Processes & Formulas
  // --------------------------------------------------------------------------
  const characteristicsByTopic = new Map<string, string[]>();
  for (const ch of profile.characteristics) {
    if (characteristicsByTopic.size >= limits.charTopics && !characteristicsByTopic.has(ch.topic)) {
      continue;
    }
    const chTokens = contentTokens(ch.sourceText);
    if (isRedundantAgainstPool(ch.sourceText, chTokens, usedPool, 0.56, 0.76)) continue;

    const list = characteristicsByTopic.get(ch.topic) || [];
    if (list.length >= limits.charPoints) continue;
    list.push(sanitizeOut(ch.statement));
    characteristicsByTopic.set(ch.topic, list);
    markUsed(ch.sourceText, chTokens);
  }

  const characteristicsAndExplanations: StructuredCharacteristicItem[] = Array.from(
    characteristicsByTopic.entries()
  ).map(([topic, points]) => ({
    topic: sanitizeOut(topic),
    points,
  }));

  const formulasOrFrameworks: FormulaOrFramework[] = profile.formulas
    .slice(0, limits.formulas)
    .map((f) => {
      markUsed(f.sourceText);
      return {
        name: sanitizeOut(f.name),
        expressionOrStructure: sanitizeOut(f.expressionOrStructure),
        usage: sanitizeOut(f.usage),
        ...(f.variables.length > 0
          ? {
              variables: f.variables.map((v) => ({
                symbol: sanitizeOut(v.symbol),
                meaning: sanitizeOut(v.meaning),
              })),
            }
          : {}),
      };
    });

  // Remaining distinct quantitative or causal facts not covered above
  const importantFacts: string[] = [];
  const factCandidates = rankedByScore
    .filter((u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.52, 0.72))
    .sort((a, b) => {
      const aQuant =
        a.quantitiesUnits.length > 0 ||
        /\d|%|°|mol|kg|km|nm|atm|pH|ATP|DNA|RNA/i.test(a.formattedText)
          ? 1.28
          : 1;
      const bQuant =
        b.quantitiesUnits.length > 0 ||
        /\d|%|°|mol|kg|km|nm|atm|pH|ATP|DNA|RNA/i.test(b.formattedText)
          ? 1.28
          : 1;
      return b.score * bQuant - a.score * aQuant;
    });

  for (const cand of factCandidates) {
    if (importantFacts.length >= limits.facts) break;
    importantFacts.push(
      sanitizeOut(stripBoilerplatePrefix(cand.formattedText))
    );
    markUsed(cand.formattedText, cand.tokens);
  }

  // --------------------------------------------------------------------------
  // F. Standalone Examples (excluding examples already tucked under concepts/types)
  // --------------------------------------------------------------------------
  const relevantExamples: RelevantExample[] = [];
  profile.examples.forEach((ex, idx) => {
    if (relevantExamples.length >= limits.examples || attachedExampleIndices.has(idx)) return;
    const exTokens = contentTokens(ex.example);
    if (isRedundantAgainstPool(ex.example, exTokens, usedPool, 0.56, 0.76)) return;
    relevantExamples.push({
      title: sanitizeOut(ex.title),
      example: sanitizeOut(ex.example),
      origin: ex.origin,
    });
    markUsed(ex.example, exTokens);
  });

  // Key terminology (prose-only tokens + RAKE academic phrases)
  const keyTerminology = Array.from(
    new Set([...profile.keyTerminology, ...profile.keyPhrases].map(sanitizeOut))
  )
    .filter(Boolean)
    .slice(0, limits.terms);

  // Concept clarifications (formula variables & genuinely non-redundant dense concepts)
  const difficultConceptExplanations: DifficultConceptExplanation[] = [];
  if (limits.difficult > 0) {
    for (const d of profile.difficultConcepts) {
      if (difficultConceptExplanations.length >= limits.difficult) break;
      const isFormulaVarNote = /^Variables:/i.test(d.plainExplanation);
      if (
        !isFormulaVarNote &&
        isRedundantAgainstPool(
          d.sourceContext,
          contentTokens(d.sourceContext),
          usedPool,
          0.68,
          0.84
        )
      ) {
        continue;
      }
      difficultConceptExplanations.push({
        concept: sanitizeOut(d.concept),
        sourceContext: sanitizeOut(d.sourceContext),
        plainExplanation: sanitizeOut(d.plainExplanation),
      });
    }
  }

  // Comprehensive-only non-redundant cause & formula study checks
  const revisionNotes: string[] = [];
  if (limits.revision > 0) {
    for (const ce of profile.causeEffects) {
      if (revisionNotes.length >= limits.revision) break;
      const line = sanitizeOut(`Cause & Effect: ${ce.cause} → ${ce.effect}.`);
      if (!isRedundantAgainstPool(line, contentTokens(line), usedPool, 0.65, 0.82)) {
        revisionNotes.push(line);
        markUsed(line);
      }
    }
    for (const f of formulasOrFrameworks) {
      if (revisionNotes.length >= limits.revision) break;
      const line = sanitizeOut(
        `Equation check — ${f.name}: ${f.expressionOrStructure}`
      );
      if (!revisionNotes.includes(line)) revisionNotes.push(line);
    }
  }

  // --------------------------------------------------------------------------
  // H. Key Takeaways (concise exam-ready synthesis without verbatim duplication)
  // --------------------------------------------------------------------------
  const keyTakeaways: string[] = [];
  if (classificationsAndTypes.length > 0 && keyTakeaways.length < limits.takeaways) {
    const firstCls = classificationsAndTypes[0];
    keyTakeaways.push(
      sanitizeOut(
        `${firstCls.topic} encompasses ${firstCls.types.length} named ${
          firstCls.types.length === 1 ? 'category' : 'categories'
        }: ${firstCls.types.map((t) => t.name).join(', ')}.`
      )
    );
  }
  if (importantDefinitions.length > 0 && keyTakeaways.length < limits.takeaways) {
    keyTakeaways.push(
      sanitizeOut(
        `Foundational terms to retain: ${importantDefinitions
          .slice(0, 4)
          .map((d) => d.term)
          .join(', ')}.`
      )
    );
  }
  if (formulasOrFrameworks.length > 0 && keyTakeaways.length < limits.takeaways) {
    keyTakeaways.push(
      sanitizeOut(
        `Essential equations/expressions: ${formulasOrFrameworks
          .slice(0, 3)
          .map((f) => `${f.name} (${f.expressionOrStructure})`)
          .join('; ')}.`
      )
    );
  }
  if (importantDistinctions.length > 0 && keyTakeaways.length < limits.takeaways) {
    keyTakeaways.push(
      sanitizeOut(
        `Key contrasts to distinguish: ${importantDistinctions
          .slice(0, 2)
          .map((d) => d.pairTitle)
          .join(', ')}.`
      )
    );
  }
  for (const ce of profile.causeEffects) {
    if (keyTakeaways.length >= limits.takeaways) break;
    const summaryLine = sanitizeOut(`${ce.cause} → ${ce.effect}.`);
    if (!keyTakeaways.some((kt) => normalizedFingerprint(kt) === normalizedFingerprint(summaryLine))) {
      keyTakeaways.push(summaryLine);
    }
  }
  // Fallback synthesis only if keyTakeaways is still short on concise docs
  for (const unit of rankedByScore) {
    if (keyTakeaways.length >= Math.min(2, limits.takeaways)) break;
    const candidate = sanitizeOut(stripBoilerplatePrefix(unit.formattedText));
    if (!isRedundantAgainstPool(candidate, unit.tokens, usedPool, 0.72, 0.85)) {
      keyTakeaways.push(candidate);
    }
  }

  // --------------------------------------------------------------------------
  // QUALITY CONTROL VALIDATION STAGE
  // Check section coverage, named-type explanations, page refs & deduplication
  // --------------------------------------------------------------------------
  const validationNotes: string[] = [];
  const coveredSectionTitles = new Set<string>([
    ...mainConcepts.map((c) => c.heading.toLowerCase()),
    ...classificationsAndTypes.map((c) => c.topic.toLowerCase()),
    ...processesAndMechanisms.map((p) => p.heading.toLowerCase()),
  ]);

  const missingTopics: string[] = [];
  let substantiveSectionsConsidered = 0;

  if (profile.quality.hasStructuredHeadings) {
    for (const sec of profile.sections) {
      if (sec.units.length < 2) continue;
      substantiveSectionsConsidered++;
      const lowerHeading = sec.heading.toLowerCase();
      const allUnitsAlreadyCovered = sec.units.every(
        (u) =>
          classificationFingerprints.has(u.fingerprint) ||
          isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.58, 0.78)
      );

      const isCovered =
        coveredSectionTitles.has(lowerHeading) ||
        allUnitsAlreadyCovered ||
        classificationsAndTypes.some(
          (c) =>
            lowerHeading.includes(c.topic.toLowerCase()) ||
            c.types.some((t) => lowerHeading.includes(t.name.toLowerCase()))
        );

      if (isCovered) {
        coveredSectionTitles.add(lowerHeading);
      } else {
        // Recover missed substantive document section so no major section is omitted
        const topRecover = [...sec.units]
          .filter((u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.74, 0.88))
          .slice(0, Math.max(1, Math.min(2, limits.pointsPerConcept)));

        if (topRecover.length > 0) {
          mainConcepts.push({
            heading: sanitizeOut(sec.heading),
            sourcePoints: topRecover.map((u) =>
              sanitizeOut(stripBoilerplatePrefix(u.formattedText))
            ),
            aiClarification: '',
          });
          coveredSectionTitles.add(lowerHeading);
          for (const u of topRecover) markUsed(u.formattedText, u.tokens);
        } else {
          missingTopics.push(sec.heading);
        }
      }
    }
  } else {
    substantiveSectionsConsidered = profile.sections.length;
  }

  // Honest completeness notices (without mentioning filenames, PDFs, or page numbers)
  const noticeParts: string[] = [];
  if (profile.quality.isBrief) {
    noticeParts.push(
      'This material is brief, so only directly supported sections are shown.'
    );
  } else if (profile.quality.lowClarity) {
    noticeParts.push(
      'Parts of the material contain irregular formatting or fragments; only clearly readable statements were included.'
    );
  }
  if (missingExplanationTypes.length > 0) {
    const listed = missingExplanationTypes.slice(0, 4).join(', ');
    noticeParts.push(
      `The study notes briefly name ${listed} without providing a separate detailed explanation.`
    );
    validationNotes.push(
      `Unexplained named categories: ${missingExplanationTypes.join(', ')}`
    );
  }

  const sourceNotice = noticeParts.length > 0 ? noticeParts.join(' ') : undefined;

  const validationReport: SummaryValidationReport = {
    isComplete: missingTopics.length === 0 && missingExplanationTypes.length === 0,
    sectionsConsidered: substantiveSectionsConsidered,
    sectionsCovered: coveredSectionTitles.size,
    classificationsCovered: classificationsAndTypes.reduce(
      (sum, c) => sum + c.types.length,
      0
    ),
    missingTopics,
    notes: validationNotes,
  };

  const baseSummary: Omit<StructuredSummary, 'markdown'> = {
    title: resolvedTitle,
    subjectArea: profile.subjectArea,
    summaryLevel,
    topicOverview,
    mainConcepts,
    importantDefinitions,
    classificationsAndTypes,
    characteristicsAndExplanations,
    keyTerminology,
    difficultConceptExplanations,
    importantFacts,
    relevantExamples,
    formulasOrFrameworks,
    processesAndMechanisms,
    importantDistinctions,
    finalRecap: [],
    ...(sourceNotice ? { sourceNotice } : {}),
    comparisonTables,
    visualDiagrams: [],
    visualAids: [],
    revisionNotes,
    keyTakeaways,
    validationReport,
    wordCount,
    chunkCount: profile.chunks.length,
    generatedAt: new Date().toISOString(),
    generationMode: 'extractive',
  };

  const { visualAids, visualDiagrams } = evaluateVisualLearningNeeds(baseSummary);

  return {
    ...baseSummary,
    visualDiagrams,
    visualAids,
    markdown: buildDocumentSummaryMarkdown(baseSummary),
  };
}
