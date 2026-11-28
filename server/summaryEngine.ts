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
  type ExtractedDefinition,
} from './documentEngine.ts';
import {
  buildPlainLanguageExplanation,
  composeDocumentOverview,
  composeFinalRecap,
  computeRenderedSummaryWordCount,
  condenseAcademicSentence,
  fuseRelatedUnits,
  selectDistributedSections,
  simplifyAcademicLanguage,
} from './condensationEngine.ts';
import { formatScientificText, stripUnsupportedDisplaySymbols } from '../src/lib/scientificFormatter.ts';
import {
  sanitizeStructuredSummary,
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
      const sameAsHeader =
        !f.usage ||
        normalizedFingerprint(f.usage) === normalizedFingerprint(`${f.name} ${f.expressionOrStructure}`) ||
        normalizedFingerprint(f.usage) === normalizedFingerprint(f.name) ||
        normalizedFingerprint(f.usage) === normalizedFingerprint(f.expressionOrStructure);
      lines.push(
        sameAsHeader
          ? `- **${f.name}:** ${f.expressionOrStructure}`
          : `- **${f.name}:** ${f.expressionOrStructure} — ${f.usage}`
      );
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

  // I. Final Recap
  if (summary.finalRecap && summary.finalRecap.length > 0) {
    lines.push('## Final Recap');
    for (const recap of summary.finalRecap) {
      lines.push(`- ${recap}`);
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

    // Only emit a classification comparison table when it adds multi-attribute comparison beyond repeating Core Description
    if (rows.length >= 2) {
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
  selectedUnits: AnalyzedUnit[],
  summaryLevel: SummaryLevel,
  definitions: ExtractedDefinition[],
  maxPoints: number,
  sanitizeProseFn: (s: string) => string,
  sanitizeLabelFn: (s: string) => string
): {
  sourcePoints: string[];
  subsections: Array<{ heading: string; points: string[] }>;
} {
  const ordered = [...selectedUnits].sort((a, b) => a.orderIndex - b.orderIndex);
  const hasSubheadings = ordered.some((u) => Boolean(u.subheading));

  if (!hasSubheadings) {
    const fused = fuseRelatedUnits(ordered, summaryLevel, {
      maxItems: maxPoints,
      definitions,
    })
      .map(sanitizeProseFn)
      .filter(Boolean);
    return {
      sourcePoints: fused,
      subsections: [],
    };
  }

  const topUnits: AnalyzedUnit[] = [];
  const subMap = new Map<string, AnalyzedUnit[]>();
  for (const u of ordered) {
    if (u.subheading) {
      const arr = subMap.get(u.subheading) || [];
      arr.push(u);
      subMap.set(u.subheading, arr);
    } else {
      topUnits.push(u);
    }
  }

  const topPoints = fuseRelatedUnits(topUnits, summaryLevel, {
    maxItems: Math.max(1, maxPoints),
    definitions,
  })
    .map(sanitizeProseFn)
    .filter(Boolean);

  const subLimitPerGroup = summaryLevel === 'short' ? 1 : summaryLevel === 'detailed' ? 2 : 3;
  const subsections = Array.from(subMap.entries())
    .map(([heading, units]) => ({
      heading: sanitizeLabelFn(heading),
      points: fuseRelatedUnits(units, summaryLevel, {
        maxItems: subLimitPerGroup,
        definitions,
      })
        .map(sanitizeProseFn)
        .filter(Boolean),
    }))
    .filter((sub) => sub.heading && sub.points.length > 0);

  return {
    sourcePoints: topPoints,
    subsections,
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

  const sanitizeLabel = (text: string) =>
    formatScientificText(sanitizeSummaryText(text)).replace(/[.]+$/, '').trim();

  const sanitizeOut = (text: string) => {
    const base = formatScientificText(sanitizeSummaryText(text));
    return summaryLevel === 'short'
      ? simplifyAcademicLanguage(base, profile.definitions)
      : base;
  };

  const condenseAndSanitize = (
    text: string,
    opts?: { preserveContrast?: boolean; preserveFormula?: boolean }
  ) => sanitizeOut(condenseAcademicSentence(text, summaryLevel, opts));

  const totalSections = Math.max(1, profile.sections.length);
  const isLargeDoc = profile.units.length >= 25;
  const limits =
    summaryLevel === 'short'
      ? {
          overview: 2,
          concepts: Math.max(3, Math.min(4, totalSections)),
          pointsPerConcept: totalSections >= 4 ? 1 : 2,
          defs: 3,
          clsGroups: 2,
          charsPerType: 0,
          exPerType: 0,
          charTopics: 0,
          charPoints: 0,
          procGroups: 1,
          procSteps: 3,
          formulas: 3,
          facts: 0,
          examples: 0,
          distinctions: 1,
          terms: 5,
          difficult: 0,
          tables: 0,
          revision: 0,
          takeaways: 3,
        }
      : summaryLevel === 'comprehensive'
        ? {
            overview: 3,
            concepts: Math.max(18, totalSections + 4),
            pointsPerConcept: 3,
            defs: 10,
            clsGroups: 8,
            charsPerType: 3,
            exPerType: 2,
            charTopics: 6,
            charPoints: 3,
            procGroups: 5,
            procSteps: 8,
            formulas: 10,
            facts: isLargeDoc ? 4 : 0,
            examples: isLargeDoc ? 4 : 1,
            distinctions: 6,
            terms: isLargeDoc ? 10 : 6,
            difficult: isLargeDoc ? 3 : 1,
            tables: 3,
            revision: isLargeDoc ? 4 : 2,
            takeaways: isLargeDoc ? 4 : 2,
          }
        : {
            overview: 2,
            concepts: Math.max(5, Math.min(8, totalSections)),
            pointsPerConcept: 2,
            defs: 6,
            clsGroups: 4,
            charsPerType: 2,
            exPerType: 1,
            charTopics: 4,
            charPoints: 2,
            procGroups: 3,
            procSteps: 5,
            formulas: 6,
            facts: isLargeDoc ? 3 : 1,
            examples: isLargeDoc ? 2 : 1,
            distinctions: 3,
            terms: isLargeDoc ? 8 : 5,
            difficult: isLargeDoc ? 2 : 1,
            tables: 2,
            revision: isLargeDoc ? 3 : 1,
            takeaways: isLargeDoc ? 3 : 2,
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
        .map((c) => condenseAndSanitize(c));
      trimmedChars.forEach((c) => markUsed(c));

      const trimmedExamples = t.examples
        .slice(0, limits.exPerType)
        .map((ex) => condenseAndSanitize(ex));
      trimmedExamples.forEach((ex) => markUsed(ex));

      return {
        name: sanitizeLabel(t.name),
        explanation:
          rawExpl === MISSING_TYPE_EXPLANATION
            ? rawExpl
            : condenseAndSanitize(rawExpl),
        ...(trimmedChars.length > 0 ? { characteristics: trimmedChars } : {}),
        ...(trimmedExamples.length > 0 ? { examples: trimmedExamples } : {}),
      };
    });

    markUsed(cls.statement);
    if (cls.comparisonNote) {
      markUsed(cls.comparisonNote);
    }

    classificationsAndTypes.push({
      topic: sanitizeLabel(
        cls.category.charAt(0).toUpperCase() + cls.category.slice(1)
      ),
      overviewStatement: condenseAndSanitize(cls.overviewStatement),
      types: entries,
      ...(summaryLevel !== 'short' && cls.comparisonNote
        ? {
            comparisonNote: condenseAndSanitize(cls.comparisonNote, {
              preserveContrast: true,
            }),
          }
        : {}),
    });
  }

  // --------------------------------------------------------------------------
  // C. Definitions (Important Definitions — separated cleanly from Main Concepts)
  // --------------------------------------------------------------------------
  const importantDefinitions: DefinitionTerm[] = [];
  for (const d of profile.definitions) {
    if (importantDefinitions.length >= limits.defs) break;
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
      term: sanitizeLabel(d.term),
      definition: condenseAndSanitize(d.definition),
      origin: d.origin,
    });
    markUsed(d.sourceText);
    markUsed(`${d.term} ${d.rawDefinition}`);
  }

  // Reserve formulas before Processes & Main Concepts so equations/reactions appear cleanly in Formulas & Equations
  const formulasOrFrameworks: FormulaOrFramework[] = profile.formulas
    .slice(0, limits.formulas)
    .map((f) => {
      markUsed(f.sourceText);
      markUsed(`${f.name} ${f.expressionOrStructure}`);
      return {
        name: sanitizeLabel(f.name),
        expressionOrStructure: sanitizeLabel(f.expressionOrStructure),
        usage: condenseAndSanitize(f.usage, { preserveFormula: true }),
        ...(f.variables.length > 0
          ? {
              variables: f.variables.map((v) => ({
                symbol: sanitizeLabel(v.symbol),
                meaning: sanitizeLabel(v.meaning),
              })),
            }
          : {}),
      };
    });

  // Reserve ordered process steps before Main Concepts so multi-step pathways stay intact
  const processesAndMechanisms: ProcessMechanismGroup[] = [];
  for (const proc of profile.processes) {
    if (processesAndMechanisms.length >= limits.procGroups) break;
    const nonRedundantSteps = proc.steps.filter(
      (s) =>
        !/[→⇌]/.test(s.rawText) &&
        !isRedundantAgainstPool(s.rawText, contentTokens(s.rawText), usedPool, 0.68, 0.85)
    );
    if (
      nonRedundantSteps.length >= 2 ||
      (nonRedundantSteps.length === 1 && proc.steps.length === 1)
    ) {
      const chosen = nonRedundantSteps.slice(0, limits.procSteps);
      processesAndMechanisms.push({
        heading: sanitizeLabel(proc.heading),
        steps: chosen.map((s) => condenseAndSanitize(s.text, { preserveFormula: true })),
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
      pairTitle: sanitizeLabel(dist.pairTitle),
      comparison: condenseAndSanitize(dist.comparison, { preserveContrast: true }),
    });
    markUsed(dist.sourceText, distTokens);
  }

  // --------------------------------------------------------------------------
  // A. Topic Overview (Document-wide synthesis built AFTER full-document comprehension)
  // --------------------------------------------------------------------------
  const classificationFingerprints = new Set<string>();
  for (const cls of profile.classifications) {
    for (const fp of cls.sourceFingerprints) {
      classificationFingerprints.add(fp);
    }
  }

  const rankedByScore = [...dedupedUnits].sort((a, b) => b.score - a.score);
  const { overview: topicOverview, usedFingerprints: overviewFingerprints } =
    composeDocumentOverview(profile, summaryLevel, sanitizeOut);

  for (const fp of overviewFingerprints) {
    const matched = dedupedUnits.find((u) => u.fingerprint === fp);
    if (matched) {
      markUsed(matched.formattedText, matched.tokens);
    }
  }

  // --------------------------------------------------------------------------
  // B. Main Concepts (Distributed across whole document + fused/condensed + cross-page synthesis)
  // --------------------------------------------------------------------------
  const mainConcepts: MainConceptSection[] = [];
  const attachedExampleIndices = new Set<number>();
  const alreadyCoveredHeadings = new Set<string>();

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
        attached.push(condenseAndSanitize(ex.example));
        attachedExampleIndices.add(idx);
        markUsed(ex.example, exTokens);
      }
    });
    return attached;
  };

  if (profile.quality.hasStructuredHeadings && profile.sections.length > 0) {
    const processHeadingsSet = new Set(
      processesAndMechanisms.map((p) => p.heading.toLowerCase())
    );
    const substantiveSections = profile.sections.filter((sec) => {
      const lowerHeading = sec.heading.toLowerCase();
      const isClassificationSection = classificationsAndTypes.some(
        (c) =>
          c.topic.toLowerCase() === lowerHeading ||
          `types of ${c.topic.toLowerCase()}` === lowerHeading ||
          `categories of ${c.topic.toLowerCase()}` === lowerHeading
      );
      if (isClassificationSection || processHeadingsSet.has(lowerHeading)) {
        alreadyCoveredHeadings.add(lowerHeading);
      }
      const nonRedundant = sec.units.filter(
        (u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.56, 0.76)
      );
      if (nonRedundant.length > 0) return true;

      // Preserve explicit document headings when their sentences went to Definitions (avoid omitting small sections),
      // as long as the section is not purely a Classification/Process/Overview block
      const nonOverviewUnits = sec.units.filter(
        (u) => !overviewFingerprints.includes(u.fingerprint) && !classificationFingerprints.has(u.fingerprint)
      );
      if (!isClassificationSection && !processHeadingsSet.has(lowerHeading) && nonOverviewUnits.length > 0) {
        return true;
      }
      alreadyCoveredHeadings.add(lowerHeading);
      return false;
    });

    // Stratified selection ensures beginning, middle, AND ending chapters are represented
    const chosenSections = selectDistributedSections(substantiveSections, limits.concepts);

    for (const sec of chosenSections) {
      const nonRedundantUnits = sec.units.filter(
        (u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.56, 0.76)
      );
      const fallbackTopUnits =
        nonRedundantUnits.length > 0
          ? nonRedundantUnits
          : sec.units
              .filter(
                (u) =>
                  !overviewFingerprints.includes(u.fingerprint) &&
                  !classificationFingerprints.has(u.fingerprint)
              )
              .slice(0, 1);
      if (fallbackTopUnits.length === 0) continue;

      // Pick top-scored candidate pool (slightly broader than pointsPerConcept so fusion can merge related ones)
      const candidateGroup = [...fallbackTopUnits]
        .sort((a, b) => b.score - a.score)
        .slice(0, nonRedundantUnits.length > 0 ? limits.pointsPerConcept + 2 : 1)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      // Enrich with closely related cross-page units from conceptClusters when helpful in Detailed/Comprehensive
      if (summaryLevel !== 'short' && profile.conceptClusters.length > 0) {
        const secToks = contentTokens(sec.heading);
        for (const cluster of profile.conceptClusters) {
          if (cluster.sectionHeadings.length < 2) continue;
          const touchesSection = cluster.sectionHeadings.some(
            (h) => h.toLowerCase() === sec.heading.toLowerCase()
          );
          const matchesHeading = cluster.coreTokens.some((t) => secToks.has(t));
          if (touchesSection || matchesHeading) {
            const foreignUnit = dedupedUnits.find(
              (u) =>
                cluster.unitIndices.includes(u.orderIndex) &&
                u.sectionHeading !== sec.heading &&
                !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.55, 0.74) &&
                !candidateGroup.includes(u)
            );
            if (foreignUnit && candidateGroup.length < limits.pointsPerConcept + 3) {
              candidateGroup.push(foreignUnit);
              break;
            }
          }
        }
      }

      const { sourcePoints, subsections } = buildSectionPointsAndSubsections(
        candidateGroup,
        summaryLevel,
        profile.definitions,
        limits.pointsPerConcept,
        sanitizeOut,
        sanitizeLabel
      );
      if (sourcePoints.length === 0 && subsections.length === 0) continue;

      for (const u of candidateGroup) {
        markUsed(u.formattedText, u.tokens);
      }
      sourcePoints.forEach((pt) => markUsed(pt));

      const attachedExamples =
        summaryLevel !== 'short' ? attachExamplesToHeading(sec.heading, candidateGroup) : [];

      mainConcepts.push({
        heading: sanitizeLabel(sec.heading),
        sourcePoints,
        aiClarification: '',
        ...(subsections.length > 0
          ? {
              subsections,
            }
          : {}),
        ...(attachedExamples.length > 0 ? { examples: attachedExamples } : {}),
      });
    }
  } else {
    // Unheaded multi-page document: cluster semantically across ALL pages so related concepts unite
    const remainingUnits = dedupedUnits.filter(
      (u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.55, 0.75)
    );
    const pool =
      remainingUnits.length >= 2 || dedupedUnits.length < 4
        ? remainingUnits
        : dedupedUnits.filter((u) => !overviewFingerprints.includes(u.fingerprint));

    const clusters: AnalyzedUnit[][] = [];
    for (const unit of pool) {
      let bestCluster: AnalyzedUnit[] | null = null;
      let bestSim = 0;
      for (const cluster of clusters) {
        if (cluster.length >= limits.pointsPerConcept + 2) continue;
        const sim = tokenSimilarity(unit.tokens, cluster[0].tokens).jaccard;
        if (sim > bestSim && sim >= 0.15) {
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

    clusters.sort(
      (a, b) =>
        Math.min(...a.map((u) => u.orderIndex)) - Math.min(...b.map((u) => u.orderIndex))
    );

    const distributedClusters = selectDistributedSections(clusters, limits.concepts);

    distributedClusters.forEach((cluster, idx) => {
      const topInCluster = [...cluster]
        .sort((a, b) => b.score - a.score)
        .slice(0, limits.pointsPerConcept + 2)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const heading = buildSectionClusterHeading(topInCluster, idx);
      const fusedPoints = fuseRelatedUnits(topInCluster, summaryLevel, {
        maxItems: limits.pointsPerConcept,
        definitions: profile.definitions,
      })
        .map(sanitizeOut)
        .filter(Boolean);

      if (fusedPoints.length === 0) return;
      for (const u of topInCluster) markUsed(u.formattedText, u.tokens);
      fusedPoints.forEach((pt) => markUsed(pt));

      const attachedExamples =
        summaryLevel !== 'short' ? attachExamplesToHeading(heading, topInCluster) : [];

      mainConcepts.push({
        heading: sanitizeLabel(heading),
        sourcePoints: fusedPoints,
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
    const condensed = condenseAndSanitize(ch.statement);
    if (!condensed) continue;
    list.push(condensed);
    characteristicsByTopic.set(ch.topic, list);
    markUsed(ch.sourceText, chTokens);
  }

  const characteristicsAndExplanations: StructuredCharacteristicItem[] = Array.from(
    characteristicsByTopic.entries()
  ).map(([topic, points]) => ({
    topic: sanitizeLabel(topic),
    points,
  }));

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
    const condensed = condenseAndSanitize(cand.formattedText);
    if (!condensed) continue;
    importantFacts.push(condensed);
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
      title: sanitizeLabel(ex.title),
      example: condenseAndSanitize(ex.example),
      origin: ex.origin,
    });
    markUsed(ex.example, exTokens);
  });

  // Key terminology (prose-only tokens + RAKE academic phrases)
  const keyTerminology = Array.from(
    new Set([...profile.keyTerminology, ...profile.keyPhrases].map(sanitizeLabel))
  )
    .filter(Boolean)
    .slice(0, limits.terms);

  // Concept clarifications (formula variables & plain-language breakdowns of dense concepts)
  const difficultConceptExplanations: DifficultConceptExplanation[] = [];
  if (limits.difficult > 0) {
    for (const d of profile.difficultConcepts) {
      if (difficultConceptExplanations.length >= limits.difficult) break;
      const isFormulaVarNote = /^Variables:/i.test(d.plainExplanation);
      if (
        isFormulaVarNote &&
        formulasOrFrameworks.some(
          (f) => f.name.toLowerCase() === d.concept.toLowerCase() && (f.variables?.length ?? 0) > 0
        )
      ) {
        continue;
      }
      const renderedContextRaw = sanitizeOut(condenseAcademicSentence(d.sourceContext, 'short'));
      const contextWords = renderedContextRaw.split(/\s+/).filter(Boolean);
      const renderedContext =
        contextWords.length > 11 ? `${contextWords.slice(0, 10).join(' ')}...` : renderedContextRaw;
      const builtPlain = isFormulaVarNote
        ? sanitizeOut(d.plainExplanation)
        : sanitizeOut(buildPlainLanguageExplanation(d.sourceContext, profile.definitions));
      const fallbackPlain =
        !isFormulaVarNote && normalizedFingerprint(d.plainExplanation) !== normalizedFingerprint(renderedContextRaw)
          ? sanitizeOut(d.plainExplanation)
          : '';
      const simplifiedPlain = builtPlain || fallbackPlain;
      if (!simplifiedPlain) continue;
      if (
        !isFormulaVarNote &&
        normalizedFingerprint(simplifiedPlain) === normalizedFingerprint(renderedContextRaw)
      ) {
        continue;
      }

      difficultConceptExplanations.push({
        concept: sanitizeLabel(d.concept),
        sourceContext: renderedContext,
        plainExplanation: simplifiedPlain,
      });
    }
  }

  // Detailed & Comprehensive concept relationships, cause-effect links & formula checks
  const revisionNotes: string[] = [];
  if (limits.revision > 0) {
    for (const rel of profile.sectionRelationships) {
      if (revisionNotes.length >= limits.revision) break;
      const line = sanitizeOut(rel.connectionNote);
      if (line && !revisionNotes.includes(line)) {
        revisionNotes.push(line);
      }
    }
    for (const ce of profile.causeEffects) {
      if (revisionNotes.length >= limits.revision) break;
      const condensedCause = condenseAcademicSentence(ce.cause, summaryLevel).replace(/\.$/, '');
      const condensedEffect = condenseAcademicSentence(ce.effect, summaryLevel).replace(/\.$/, '');
      const line = sanitizeOut(`Cause & Effect: ${condensedCause} → ${condensedEffect}.`);
      if (!isRedundantAgainstPool(line, contentTokens(line), usedPool, 0.65, 0.82)) {
        revisionNotes.push(line);
        markUsed(line);
      }
    }
    if (summaryLevel === 'comprehensive') {
      for (const f of formulasOrFrameworks) {
        if (revisionNotes.length >= limits.revision) break;
        const line = sanitizeOut(
          `Equation check — ${f.name}: ${f.expressionOrStructure}`
        );
        if (!revisionNotes.includes(line)) revisionNotes.push(line);
      }
    }
  }

  // --------------------------------------------------------------------------
  // H. Key Takeaways (concise exam-ready anchor rules)
  // --------------------------------------------------------------------------
  const keyTakeaways: string[] = [];
  if (classificationsAndTypes.length > 0 && keyTakeaways.length < limits.takeaways) {
    const firstCls = classificationsAndTypes[0];
    keyTakeaways.push(
      sanitizeOut(
        `${firstCls.topic} divides into ${firstCls.types.length} key ${
          firstCls.types.length === 1 ? 'category' : 'categories'
        }: ${firstCls.types.map((t) => t.name).join(', ')}.`
      )
    );
  }
  if (importantDefinitions.length > 0 && keyTakeaways.length < limits.takeaways) {
    keyTakeaways.push(
      sanitizeOut(
        `Core terms to master: ${importantDefinitions
          .slice(0, 4)
          .map((d) => d.term)
          .join(', ')}.`
      )
    );
  }
  if (formulasOrFrameworks.length > 0 && keyTakeaways.length < limits.takeaways) {
    keyTakeaways.push(
      sanitizeOut(
        `Key equations: ${formulasOrFrameworks
          .slice(0, 3)
          .map((f) => `${f.name} (${f.expressionOrStructure})`)
          .join('; ')}.`
      )
    );
  }
  if (importantDistinctions.length > 0 && keyTakeaways.length < limits.takeaways) {
    keyTakeaways.push(
      sanitizeOut(
        `Important contrasts: ${importantDistinctions
          .slice(0, 2)
          .map((d) => d.pairTitle)
          .join(', ')}.`
      )
    );
  }
  for (const ce of profile.causeEffects) {
    if (keyTakeaways.length >= limits.takeaways) break;
    const summaryLine = condenseAndSanitize(`${ce.cause} → ${ce.effect}.`);
    if (
      summaryLine &&
      !isRedundantAgainstPool(summaryLine, contentTokens(summaryLine), usedPool, 0.56, 0.72) &&
      !keyTakeaways.some((kt) => normalizedFingerprint(kt) === normalizedFingerprint(summaryLine))
    ) {
      keyTakeaways.push(summaryLine);
    }
  }
  for (const unit of rankedByScore) {
    if (keyTakeaways.length >= Math.min(2, limits.takeaways)) break;
    const candidate = condenseAndSanitize(unit.formattedText);
    if (candidate && !isRedundantAgainstPool(candidate, unit.tokens, usedPool, 0.72, 0.85)) {
      keyTakeaways.push(candidate);
    }
  }

  // Holistic Final Recap — completely distinct from keyTakeaways, revisionNotes & already-rendered concepts
  const finalRecap = composeFinalRecap(
    profile,
    keyTakeaways,
    summaryLevel,
    sanitizeOut,
    [
      topicOverview,
      ...revisionNotes,
      ...importantDistinctions.map((d) => d.comparison),
      ...mainConcepts.flatMap((c) => c.sourcePoints),
      ...processesAndMechanisms.flatMap((p) => p.steps),
    ]
  );

  // --------------------------------------------------------------------------
  // QUALITY CONTROL VALIDATION STAGE
  // Check section coverage, named-type explanations, page refs & deduplication
  // --------------------------------------------------------------------------
  const validationNotes: string[] = [];
  const coveredSectionTitles = new Set<string>([
    ...Array.from(alreadyCoveredHeadings),
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
      } else if (summaryLevel === 'comprehensive' || mainConcepts.length < limits.concepts) {
        // Recover missed substantive section in condensed form
        const topRecover = [...sec.units]
          .filter((u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.7, 0.85))
          .slice(0, Math.max(1, Math.min(2, limits.pointsPerConcept)));
        const fusedRecover = fuseRelatedUnits(topRecover, summaryLevel, {
          maxItems: 2,
          definitions: profile.definitions,
        })
          .map(sanitizeOut)
          .filter(Boolean);

        if (fusedRecover.length > 0) {
          mainConcepts.push({
            heading: sanitizeLabel(sec.heading),
            sourcePoints: fusedRecover,
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

  const basePreCount: Omit<StructuredSummary, 'markdown' | 'wordCount'> = {
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
    finalRecap,
    ...(sourceNotice ? { sourceNotice } : {}),
    comparisonTables,
    visualDiagrams: [],
    visualAids: [],
    revisionNotes,
    keyTakeaways,
    validationReport,
    chunkCount: profile.chunks.length,
    generatedAt: new Date().toISOString(),
    generationMode: 'extractive',
  };

  const condensedWordCount = computeRenderedSummaryWordCount(basePreCount);

  const baseSummary: Omit<StructuredSummary, 'markdown'> = {
    ...basePreCount,
    wordCount: condensedWordCount,
  };

  const { visualAids, visualDiagrams } = evaluateVisualLearningNeeds(baseSummary);

  return sanitizeStructuredSummary({
    ...baseSummary,
    visualDiagrams,
    visualAids,
    markdown: buildDocumentSummaryMarkdown(baseSummary),
  });
}
