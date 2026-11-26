import {
  analyzeDocumentIntelligence,
  attachPageCitation,
  buildSectionClusterHeading,
  buildStudentFriendlyClarification,
  contentTokens,
  isRedundantAgainstPool,
  normalizedFingerprint,
  normalizeText,
  stripBoilerplatePrefix,
  tokenSimilarity,
  type AnalyzedUnit,
  type DocumentIntelligenceProfile,
} from './documentEngine.ts';
import { formatScientificText } from '../src/lib/scientificFormatter.ts';
import type {
  ComparisonTable,
  DefinitionTerm,
  DifficultConceptExplanation,
  DistinctionItem,
  FormulaOrFramework,
  MainConceptSection,
  ProcessMechanismGroup,
  RelevantExample,
  StructuredSummary,
  SummaryLevel,
} from '../src/types/brainstine.ts';

export function buildDocumentSummaryMarkdown(
  summary: Omit<StructuredSummary, 'markdown'>
): string {
  const levelLabel =
    summary.summaryLevel === 'short'
      ? 'Short Summary'
      : summary.summaryLevel === 'detailed'
        ? 'Detailed Summary'
        : 'Comprehensive Study Notes';

  const lines: string[] = [
    `# ${summary.title}`,
    `**Subject:** ${summary.subjectArea} | **Format:** ${levelLabel} | **Source Length:** ${summary.wordCount.toLocaleString()} words`,
    '',
  ];

  if (summary.sourceNotice) {
    lines.push(`> ${summary.sourceNotice}`);
    lines.push('');
  }

  lines.push('## Topic Overview', summary.topicOverview, '');

  if (summary.mainConcepts.length > 0) {
    lines.push('## Main Concepts');
    for (const item of summary.mainConcepts) {
      lines.push(`### ${item.heading}`);
      for (const pt of item.sourcePoints) {
        lines.push(`- ${pt}`);
      }
      if (item.aiClarification) {
        lines.push(`  *Study Note:* ${item.aiClarification}`);
      }
      lines.push('');
    }
  }

  if (summary.importantDefinitions.length > 0) {
    lines.push('## Important Definitions');
    for (const def of summary.importantDefinitions) {
      lines.push(`- **${def.term}** — ${def.definition}`);
    }
    lines.push('');
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
    lines.push('## Important Formulas & Equations');
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
    lines.push('## Key Facts');
    for (const fact of summary.importantFacts) {
      lines.push(`- ${fact}`);
    }
    lines.push('');
  }

  if (summary.relevantExamples.length > 0) {
    lines.push('## Examples & Applications');
    for (const ex of summary.relevantExamples) {
      lines.push(`- **${ex.title}:** ${ex.example}`);
    }
    lines.push('');
  }

  if (summary.importantDistinctions && summary.importantDistinctions.length > 0) {
    lines.push('## Important Distinctions');
    for (const dist of summary.importantDistinctions) {
      lines.push(`- **${dist.pairTitle}:** ${dist.comparison}`);
    }
    lines.push('');
  }

  if (summary.comparisonTables && summary.comparisonTables.length > 0) {
    lines.push('## Comparison Tables');
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
    lines.push('## Revision Notes');
    for (const note of summary.revisionNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  if (summary.finalRecap && summary.finalRecap.length > 0) {
    lines.push('## Final Recap');
    for (const r of summary.finalRecap) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  if (summary.keyTakeaways.length > 0) {
    lines.push('## Key Takeaways & Exam Focus');
    for (const kt of summary.keyTakeaways) {
      lines.push(`- ${kt}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

function buildSectionClarificationNote(
  heading: string,
  topGroup: AnalyzedUnit[],
  profile: DocumentIntelligenceProfile,
  includeClarifications: boolean
): string {
  if (!includeClarifications) return '';
  const notes: string[] = [];

  const rel = profile.sectionRelationships.find(
    (r) => r.fromSection === heading || r.toSection === heading
  );
  if (rel) {
    notes.push(rel.connectionNote);
  }

  for (const unit of topGroup.slice(0, 2)) {
    const plain = buildStudentFriendlyClarification(unit.formattedText, profile.definitions);
    if (plain && !notes.includes(plain)) {
      notes.push(plain);
      break;
    }
  }

  return notes.join(' ');
}

function buildDeterministicComparisonTables(
  profile: DocumentIntelligenceProfile,
  maxTables: number
): ComparisonTable[] {
  if (maxTables <= 0) return [];
  const tables: ComparisonTable[] = [];

  // 1. Pairwise distinctions table from structured contrast statements
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
        const comp = d.rawComparison;
        const whereasSplit = comp.split(/\bwhereas\b|\bin contrast,\b|\bunlike\b/i);
        const valA =
          whereasSplit.length >= 2
            ? whereasSplit[0].replace(/^unlike\s+[^,]+,\s*/i, '').trim()
            : comp;
        const valB =
          whereasSplit.length >= 2
            ? whereasSplit.slice(1).join('; ').trim()
            : 'Contrasting behavior described in source';
        return {
          criterion: d.sectionHeading || `Distinction ${idx + 1}`,
          values: [valA, valB],
        };
      });

    if (rows.length > 0 && primary.subjectA && primary.subjectB) {
      tables.push({
        title: `${primary.subjectA} vs. ${primary.subjectB}`,
        headers: [primary.subjectA, primary.subjectB],
        rows,
      });
    }
  }

  // 2. Category / classification overview table when multiple classifications exist
  if (tables.length < maxTables && profile.classifications.length >= 2) {
    tables.push({
      title: 'Document Classifications & Groupings',
      headers: ['Included Members / Types', 'Source Context'],
      rows: profile.classifications.slice(0, 5).map((cls) => ({
        criterion: cls.category,
        values: [
          cls.members.join(', '),
          attachPageCitation(cls.statement, cls.pageNumber),
        ],
      })),
    });
  }

  return tables.slice(0, maxTables);
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
    const safeTitle = title || 'Document Summary';
    return {
      title: safeTitle,
      subjectArea: subjectArea || 'General Studies',
      summaryLevel,
      topicOverview:
        'The provided document contains insufficient text to generate a document summary.',
      sourceNotice:
        'Upload a readable document or paste at least a few complete sentences to generate a structured summary.',
      mainConcepts: [],
      importantDefinitions: [],
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
      revisionNotes: [],
      keyTakeaways: [],
      wordCount: 0,
      chunkCount: 0,
      generatedAt: new Date().toISOString(),
      generationMode: 'extractive',
      markdown: `# ${safeTitle}\n\n*Insufficient readable source text available for summarization.*`,
    };
  }

  const resolvedTitle = (title || 'Document Summary').trim();
  const profile = analyzeDocumentIntelligence(normalized, {
    title: resolvedTitle,
    subjectArea,
  });

  const dedupedUnits = profile.units;
  const wordCount = profile.quality.wordCount;

  // Honest quality notice when source is short or noisy
  let sourceNotice: string | undefined;
  if (profile.quality.isBrief) {
    sourceNotice =
      'This source material is brief, so only directly supported summary sections are shown.';
  } else if (profile.quality.lowClarity) {
    sourceNotice =
      'Parts of the source text contain irregular formatting or fragments; only clearly readable statements were included.';
  }

  const limits =
    summaryLevel === 'short'
      ? {
          overview: 1,
          concepts: 4,
          pointsPerConcept: 2,
          defs: 4,
          procGroups: 2,
          procSteps: 4,
          formulas: 3,
          facts: 4,
          examples: 2,
          distinctions: 2,
          terms: 8,
          difficult: 0,
          tables: 0,
          revision: 0,
          recap: 3,
          takeaways: 3,
          includeClarifications: false,
        }
      : summaryLevel === 'comprehensive'
        ? {
            overview: 3,
            concepts: 16,
            pointsPerConcept: 5,
            defs: 12,
            procGroups: 5,
            procSteps: 8,
            formulas: 10,
            facts: 10,
            examples: 6,
            distinctions: 8,
            terms: 20,
            difficult: 6,
            tables: 2,
            revision: 7,
            recap: 6,
            takeaways: 7,
            includeClarifications: true,
          }
        : {
            overview: 2,
            concepts: 8,
            pointsPerConcept: 3,
            defs: 8,
            procGroups: 4,
            procSteps: 6,
            formulas: 6,
            facts: 6,
            examples: 4,
            distinctions: 5,
            terms: 14,
            difficult: 4,
            tables: 1,
            revision: 5,
            recap: 4,
            takeaways: 5,
            includeClarifications: true,
          };

  const usedPool: Array<{ fp: string; tokens: Set<string> }> = [];
  const markUsed = (text: string, tokens?: Set<string>) => {
    const t = tokens ?? contentTokens(text);
    usedPool.push({ fp: normalizedFingerprint(text), tokens: t });
  };

  // 1. Topic Overview: synthesize central message & TextRank lead statements
  const distinctionTexts = new Set(profile.distinctions.map((d) => d.sourceText));
  const rankedByScore = [...dedupedUnits].sort((a, b) => b.score - a.score);
  const overviewCandidates = [...dedupedUnits]
    .filter(
      (u) =>
        !/^\s*[A-Za-zΔ]+\s*[=∝]/.test(u.formattedText) &&
        !u.isStep &&
        !/^(?:first|initially|second|third|next|then|subsequently|finally)\b/i.test(
          u.formattedText
        ) &&
        !distinctionTexts.has(u.formattedText)
    )
    .sort((a, b) => {
      const aLeadBonus = a.orderIndex <= 2 ? 1.25 : 1;
      const bLeadBonus = b.orderIndex <= 2 ? 1.25 : 1;
      return b.score * bLeadBonus - a.score * aLeadBonus;
    });

  const overviewTarget = dedupedUnits.length <= 7 ? 1 : limits.overview;
  const selectedOverviewUnits: AnalyzedUnit[] = [];
  for (const cand of overviewCandidates) {
    if (selectedOverviewUnits.length >= overviewTarget) break;
    if (isRedundantAgainstPool(cand.formattedText, cand.tokens, usedPool, 0.52, 0.72)) continue;
    selectedOverviewUnits.push(cand);
    markUsed(cand.formattedText, cand.tokens);
  }
  if (selectedOverviewUnits.length === 0 && dedupedUnits[0]) {
    selectedOverviewUnits.push(dedupedUnits[0]);
    markUsed(dedupedUnits[0].formattedText, dedupedUnits[0].tokens);
  }

  selectedOverviewUnits.sort((a, b) => a.orderIndex - b.orderIndex);
  const overviewCore = selectedOverviewUnits
    .map((u) => attachPageCitation(stripBoilerplatePrefix(u.formattedText), u.pageNumber))
    .join(' ');

  const topThemes = profile.keyPhrases.slice(0, 4);
  const themeIntro =
    summaryLevel !== 'short' && topThemes.length >= 2 && profile.sections.length >= 2
      ? `Core themes across ${profile.sections.length} document sections include ${topThemes.join(', ')}. `
      : '';
  const topicOverview = `${themeIntro}${overviewCore}`.trim();

  // 2. Formulas & Equations from shared profile
  const formulasOrFrameworks: FormulaOrFramework[] = profile.formulas
    .slice(0, limits.formulas)
    .map((f) => {
      if (f.sourceText.length < 95) {
        markUsed(f.sourceText);
      }
      return {
        name: f.name,
        expressionOrStructure: f.expressionOrStructure,
        usage: f.usage,
        ...(f.variables.length > 0 ? { variables: f.variables } : {}),
      };
    });

  // 3. Important Definitions from shared profile
  const importantDefinitions: DefinitionTerm[] = profile.definitions
    .slice(0, limits.defs)
    .map((d) => {
      markUsed(d.sourceText);
      return {
        term: d.term,
        definition: d.definition,
        origin: d.origin,
      };
    });

  // 4. Important Distinctions from shared profile
  const importantDistinctions: DistinctionItem[] = [];
  for (const dist of profile.distinctions) {
    if (importantDistinctions.length >= limits.distinctions) break;
    const distTokens = contentTokens(dist.sourceText);
    if (isRedundantAgainstPool(dist.sourceText, distTokens, usedPool, 0.56, 0.76)) continue;
    importantDistinctions.push({
      pairTitle: dist.pairTitle,
      comparison: dist.comparison,
    });
    markUsed(dist.sourceText, distTokens);
  }

  // 5. Processes & Mechanisms from shared profile
  const processesAndMechanisms: ProcessMechanismGroup[] = [];
  for (const proc of profile.processes) {
    if (processesAndMechanisms.length >= limits.procGroups) break;
    const nonRedundantSteps = proc.steps.filter(
      (s) => !isRedundantAgainstPool(s.rawText, contentTokens(s.rawText), usedPool, 0.62, 0.8)
    );
    if (nonRedundantSteps.length >= 2 || (nonRedundantSteps.length === 1 && proc.steps.length === 1)) {
      const chosen = nonRedundantSteps.slice(0, limits.procSteps);
      processesAndMechanisms.push({
        heading: proc.heading,
        steps: chosen.map((s) => s.text),
      });
      for (const s of chosen) {
        markUsed(s.rawText);
      }
    }
  }

  // 6. Examples & Applications from shared profile
  const relevantExamples: RelevantExample[] = [];
  for (const ex of profile.examples) {
    if (relevantExamples.length >= limits.examples) break;
    const exTokens = contentTokens(ex.example);
    if (isRedundantAgainstPool(ex.example, exTokens, usedPool, 0.55, 0.76)) continue;
    relevantExamples.push({
      title: ex.title,
      example: ex.example,
      origin: ex.origin,
    });
    markUsed(ex.example, exTokens);
  }

  // 7. Main Concepts (grouped by real document headings or cohesive keyword clusters + cross-section connections)
  const mainConcepts: MainConceptSection[] = [];
  const conceptPoolCandidates = dedupedUnits.filter(
    (u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.54, 0.74)
  );

  const effectiveConceptCandidates =
    conceptPoolCandidates.length >= 2 || dedupedUnits.length < 4
      ? conceptPoolCandidates
      : dedupedUnits.filter((u) => !selectedOverviewUnits.includes(u));

  const allHeadingGroups = new Map<string, AnalyzedUnit[]>();
  const unheadedUnits: AnalyzedUnit[] = [];

  for (const u of dedupedUnits) {
    if (u.sectionHeading) {
      const arr = allHeadingGroups.get(u.sectionHeading) || [];
      arr.push(u);
      allHeadingGroups.set(u.sectionHeading, arr);
    } else if (effectiveConceptCandidates.includes(u)) {
      unheadedUnits.push(u);
    }
  }

  if (allHeadingGroups.size > 0) {
    for (const [heading, fullGroup] of allHeadingGroups.entries()) {
      if (mainConcepts.length >= limits.concepts) break;
      const unusedInGroup = fullGroup.filter(
        (u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.54, 0.74)
      );
      const fallbackGroup = fullGroup.filter((u) => !selectedOverviewUnits.includes(u));
      const candidatePool =
        unusedInGroup.length > 0
          ? unusedInGroup
          : fallbackGroup.length > 0
            ? fallbackGroup
            : fullGroup;

      const topGroup = [...candidatePool]
        .sort((a, b) => b.score - a.score)
        .slice(0, limits.pointsPerConcept)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      if (topGroup.length === 0) continue;

      mainConcepts.push({
        heading,
        sourcePoints: topGroup.map((u) =>
          attachPageCitation(stripBoilerplatePrefix(u.formattedText), u.pageNumber)
        ),
        aiClarification: buildSectionClarificationNote(
          heading,
          topGroup,
          profile,
          limits.includeClarifications
        ),
      });
      for (const u of topGroup) markUsed(u.formattedText, u.tokens);
    }
  }

  if (unheadedUnits.length > 0 && mainConcepts.length < limits.concepts) {
    const remainingSlots = limits.concepts - mainConcepts.length;
    const topUnheaded = [...unheadedUnits]
      .filter((u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.54, 0.74))
      .sort((a, b) => b.score - a.score)
      .slice(0, remainingSlots * limits.pointsPerConcept);

    const seededUnheaded =
      topUnheaded.length > 0
        ? topUnheaded
        : unheadedUnits.slice(0, remainingSlots * limits.pointsPerConcept);

    const clusters: AnalyzedUnit[][] = [];
    for (const unit of seededUnheaded) {
      let bestCluster: AnalyzedUnit[] | null = null;
      let bestSim = 0;

      for (const cluster of clusters) {
        if (cluster.length >= limits.pointsPerConcept) continue;
        const sim = tokenSimilarity(unit.tokens, cluster[0].tokens).jaccard;
        if (sim > bestSim && sim >= 0.14) {
          bestSim = sim;
          bestCluster = cluster;
        }
      }

      if (bestCluster) {
        bestCluster.push(unit);
      } else if (clusters.length < remainingSlots) {
        clusters.push([unit]);
      } else if (clusters.length > 0) {
        const smallest = clusters.reduce((a, b) => (a.length <= b.length ? a : b));
        if (smallest.length < limits.pointsPerConcept + 1) smallest.push(unit);
      }
    }

    clusters.forEach((cluster, idx) => {
      cluster.sort((a, b) => a.orderIndex - b.orderIndex);
      const clusterHeading = buildSectionClusterHeading(cluster, mainConcepts.length + idx);
      mainConcepts.push({
        heading: clusterHeading,
        sourcePoints: cluster.map((u) =>
          attachPageCitation(stripBoilerplatePrefix(u.formattedText), u.pageNumber)
        ),
        aiClarification: buildSectionClarificationNote(
          clusterHeading,
          cluster,
          profile,
          limits.includeClarifications
        ),
      });
      for (const u of cluster) markUsed(u.formattedText, u.tokens);
    });
  }

  // 8. Key Facts (distinct factual/quantitative/causal points not repeated above)
  const importantFacts: string[] = [];
  const factCandidates = rankedByScore.filter(
    (u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.52, 0.72)
  );

  factCandidates.sort((a, b) => {
    const aQuant =
      a.quantitiesUnits.length > 0 ||
      /\d|%|°|mol|kg|km|nm|atm|pH|ATP|DNA|RNA/i.test(a.formattedText)
        ? 1.25
        : 1;
    const bQuant =
      b.quantitiesUnits.length > 0 ||
      /\d|%|°|mol|kg|km|nm|atm|pH|ATP|DNA|RNA/i.test(b.formattedText)
        ? 1.25
        : 1;
    return b.score * bQuant - a.score * aQuant;
  });

  for (const cand of factCandidates) {
    if (importantFacts.length >= limits.facts) break;
    importantFacts.push(
      attachPageCitation(stripBoilerplatePrefix(cand.formattedText), cand.pageNumber)
    );
    markUsed(cand.formattedText, cand.tokens);
  }

  // 9. Key Terminology (combine RAKE keyphrases + domain terminology)
  const keyTerminology = Array.from(
    new Set([...profile.keyTerminology, ...profile.keyPhrases])
  ).slice(0, limits.terms);

  // 10. Concept Clarifications & Difficult Terms (from DocumentIntelligenceProfile)
  const difficultConceptExplanations: DifficultConceptExplanation[] =
    limits.difficult > 0
      ? profile.difficultConcepts.slice(0, limits.difficult).map((d) => ({
          concept: d.concept,
          sourceContext: d.sourceContext,
          plainExplanation: d.plainExplanation,
        }))
      : [];

  // 11. Structured Comparison Tables (for Detailed & Comprehensive modes)
  const comparisonTables = buildDeterministicComparisonTables(profile, limits.tables);

  // 12. Revision Notes (cross-section links, cause-effect rules, quantitative values)
  const revisionNotes: string[] = [];
  if (limits.revision > 0) {
    for (const rel of profile.sectionRelationships) {
      if (revisionNotes.length >= limits.revision) break;
      revisionNotes.push(rel.connectionNote);
    }
    for (const ce of profile.causeEffects) {
      if (revisionNotes.length >= limits.revision) break;
      const line = attachPageCitation(
        `Cause & Effect: ${ce.cause} -> ${ce.effect}.`,
        ce.pageNumber
      );
      if (!revisionNotes.includes(line)) {
        revisionNotes.push(line);
      }
    }
    for (const f of formulasOrFrameworks) {
      if (revisionNotes.length >= limits.revision) break;
      const line = `Formula Check (${f.name}): Memorize ${f.expressionOrStructure} and when to apply it.`;
      if (!revisionNotes.includes(line)) {
        revisionNotes.push(line);
      }
    }
  }

  // 13. Final Recap (only when document has >= 4 distinct units)
  const finalRecap: string[] = [];
  if (dedupedUnits.length >= 4) {
    const recapPool = [...dedupedUnits]
      .filter((u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.54, 0.74))
      .sort((a, b) => b.score - a.score);

    for (const u of recapPool) {
      if (finalRecap.length >= limits.recap) break;
      finalRecap.push(attachPageCitation(stripBoilerplatePrefix(u.formattedText), u.pageNumber));
      markUsed(u.formattedText, u.tokens);
    }

    if (finalRecap.length === 0 && mainConcepts.length >= 2) {
      for (const c of mainConcepts.slice(0, limits.recap)) {
        if (c.sourcePoints.length > 0 && !c.heading.startsWith('Core Concept')) {
          finalRecap.push(`${c.heading}: ${c.sourcePoints[0]}`);
        }
      }
    }
  }

  // 14. Key Takeaways & Exam Focus
  const keyTakeaways: string[] = [];
  if (importantDefinitions.length > 0) {
    const topDefs = importantDefinitions
      .slice(0, 3)
      .map((d) => d.term)
      .join(', ');
    keyTakeaways.push(`Core definitions to master: ${topDefs}.`);
  }
  if (formulasOrFrameworks.length > 0 && keyTakeaways.length < limits.takeaways) {
    keyTakeaways.push(
      `Key equations/reactions: ${formulasOrFrameworks
        .slice(0, 3)
        .map((f) => `${f.name} (${f.expressionOrStructure})`)
        .join('; ')}.`
    );
  }
  if (importantDistinctions.length > 0 && keyTakeaways.length < limits.takeaways) {
    keyTakeaways.push(
      `High-yield distinctions: ${importantDistinctions
        .slice(0, 2)
        .map((d) => d.pairTitle)
        .join(', ')}.`
    );
  }
  for (const unit of rankedByScore) {
    if (keyTakeaways.length >= limits.takeaways) break;
    const text = attachPageCitation(stripBoilerplatePrefix(unit.formattedText), unit.pageNumber);
    if (!keyTakeaways.some((kt) => kt.includes(text.slice(0, 32)))) {
      keyTakeaways.push(text);
    }
  }

  const baseSummary: Omit<StructuredSummary, 'markdown'> = {
    title: resolvedTitle,
    subjectArea: profile.subjectArea,
    summaryLevel,
    topicOverview: formatScientificText(topicOverview),
    mainConcepts,
    importantDefinitions,
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
    revisionNotes,
    keyTakeaways,
    wordCount,
    chunkCount: profile.chunks.length,
    generatedAt: new Date().toISOString(),
    generationMode: 'extractive',
  };

  return {
    ...baseSummary,
    markdown: buildDocumentSummaryMarkdown(baseSummary),
  };
}
