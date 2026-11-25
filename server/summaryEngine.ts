import {
  analyzeDocumentIntelligence,
  attachPageCitation,
  buildSectionClusterHeading,
  contentTokens,
  isRedundantAgainstPool,
  normalizedFingerprint,
  normalizeText,
  stripBoilerplatePrefix,
  tokenSimilarity,
  type AnalyzedUnit,
} from './documentEngine.ts';
import { formatScientificText } from '../src/lib/scientificFormatter.ts';
import type {
  DefinitionTerm,
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

  if (summary.keyTerminology.length > 0) {
    lines.push('## Key Terminology');
    lines.push(summary.keyTerminology.join(' · '));
    lines.push('');
  }

  if (summary.finalRecap && summary.finalRecap.length > 0) {
    lines.push('## Final Recap');
    for (const r of summary.finalRecap) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
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
          procs: 4,
          formulas: 4,
          facts: 4,
          examples: 2,
          distinctions: 3,
          terms: 8,
          recap: 3,
        }
      : summaryLevel === 'comprehensive'
        ? {
            overview: 3,
            concepts: 12,
            pointsPerConcept: 4,
            defs: 10,
            procs: 8,
            formulas: 8,
            facts: 9,
            examples: 5,
            distinctions: 6,
            terms: 18,
            recap: 5,
          }
        : {
            overview: 2,
            concepts: 7,
            pointsPerConcept: 3,
            defs: 7,
            procs: 6,
            formulas: 6,
            facts: 6,
            examples: 4,
            distinctions: 4,
            terms: 13,
            recap: 4,
          };

  const usedPool: Array<{ fp: string; tokens: Set<string> }> = [];
  const markUsed = (text: string, tokens?: Set<string>) => {
    const t = tokens ?? contentTokens(text);
    usedPool.push({ fp: normalizedFingerprint(text), tokens: t });
  };

  // 1. Topic Overview: select high-salience lead/thesis statements
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
  const topicOverview = selectedOverviewUnits
    .map((u) => attachPageCitation(stripBoilerplatePrefix(u.formattedText), u.pageNumber))
    .join(' ');

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
    if (processesAndMechanisms.length >= 3) break;
    const nonRedundantSteps = proc.steps.filter(
      (s) => !isRedundantAgainstPool(s.rawText, contentTokens(s.rawText), usedPool, 0.62, 0.8)
    );
    if (nonRedundantSteps.length >= 2 || (nonRedundantSteps.length === 1 && proc.steps.length === 1)) {
      const chosen = nonRedundantSteps.slice(0, limits.procs);
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

  // 7. Main Concepts (grouped by real document headings or cohesive keyword clusters)
  const mainConcepts: MainConceptSection[] = [];
  const conceptPoolCandidates = dedupedUnits.filter(
    (u) => !isRedundantAgainstPool(u.formattedText, u.tokens, usedPool, 0.54, 0.74)
  );

  const effectiveConceptCandidates =
    conceptPoolCandidates.length > 0
      ? conceptPoolCandidates
      : dedupedUnits.filter((u) => !selectedOverviewUnits.includes(u));

  const explicitHeadingGroups = new Map<string, AnalyzedUnit[]>();
  const unheadedUnits: AnalyzedUnit[] = [];

  for (const u of effectiveConceptCandidates) {
    if (u.sectionHeading) {
      const arr = explicitHeadingGroups.get(u.sectionHeading) || [];
      arr.push(u);
      explicitHeadingGroups.set(u.sectionHeading, arr);
    } else {
      unheadedUnits.push(u);
    }
  }

  if (explicitHeadingGroups.size > 0) {
    for (const [heading, group] of explicitHeadingGroups.entries()) {
      if (mainConcepts.length >= limits.concepts) break;
      const topGroup = [...group]
        .sort((a, b) => b.score - a.score)
        .slice(0, limits.pointsPerConcept)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      if (topGroup.length === 0) continue;

      mainConcepts.push({
        heading,
        sourcePoints: topGroup.map((u) =>
          attachPageCitation(stripBoilerplatePrefix(u.formattedText), u.pageNumber)
        ),
        aiClarification: '',
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
      mainConcepts.push({
        heading: buildSectionClusterHeading(cluster, mainConcepts.length + idx),
        sourcePoints: cluster.map((u) =>
          attachPageCitation(stripBoilerplatePrefix(u.formattedText), u.pageNumber)
        ),
        aiClarification: '',
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

  // 9. Key Terminology
  const keyTerminology = profile.keyTerminology.slice(0, limits.terms);

  // 10. Final Recap (only when document has >= 4 distinct units and non-redundant takeaways exist)
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

  const baseSummary: Omit<StructuredSummary, 'markdown'> = {
    title: resolvedTitle,
    subjectArea: profile.subjectArea,
    summaryLevel,
    topicOverview: formatScientificText(topicOverview),
    mainConcepts,
    importantDefinitions,
    keyTerminology,
    difficultConceptExplanations: [],
    importantFacts,
    relevantExamples,
    formulasOrFrameworks,
    processesAndMechanisms,
    importantDistinctions,
    finalRecap,
    ...(sourceNotice ? { sourceNotice } : {}),
    comparisonTables: [],
    visualDiagrams: [],
    revisionNotes: [],
    keyTakeaways: [],
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
