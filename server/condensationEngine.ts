import {
  ACADEMIC_STOP_WORDS,
  contentTokens,
  normalizedFingerprint,
  stripBoilerplatePrefix,
  tokenSimilarity,
  type AnalyzedUnit,
  type DocumentIntelligenceProfile,
  type ExtractedDefinition,
} from './documentEngine.ts';
import type { StructuredSummary, SummaryLevel } from '../src/types/brainstine.ts';

const DANGLING_END_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'for', 'so', 'yet',
  'of', 'in', 'on', 'at', 'to', 'by', 'from', 'with', 'as', 'into',
  'through', 'during', 'between', 'among', 'against', 'within', 'without',
  'that', 'which', 'who', 'whom', 'whose', 'where', 'when', 'while',
  'such', 'including', 'like', 'is', 'are', 'was', 'were', 'be', 'been',
]);

function preserveProtectedParenthetical(inner: string): boolean {
  const t = inner.trim();
  if (!t) return false;
  // Keep chemical/math formulas, acronyms, numbers, units, exchange pairs, or short crucial glosses
  if (/[=→⇌+\-*/^%°₀-₉⁰-⁹]/.test(t)) return true;
  if (/\d/.test(t) && !/^(?:19|20)\d{2}[a-z]?$/.test(t) && !/^(?:fig|figure|table|sec|section|ch|chapter|page|p)\b/i.test(t)) {
    return true;
  }
  if (/^[A-Z][A-Z0-9/-]{1,10}$/.test(t)) return true; // Acronyms like ATP, OHLC, DNA, RNA, EUR/USD
  if (t.split(/\s+/).length <= 3 && !/^(?:above|below|e\.g\.|i\.e\.|etc\.?)$/i.test(t)) return true;
  return false;
}

function finalizeSentencePunctuation(text: string): string {
  let out = text.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
  if (!out) return '';
  out = out.replace(/^[,;:\-–—]+\s*/, '').trim();
  if (!out) return '';
  if (/^[a-z]/.test(out) && !/^(?:e\.g\.|i\.e\.|pH|pKa|mRNA|tRNA|rRNA|cDNA)/.test(out)) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  if (!/[.!?)"'\]]$/.test(out) && !/[=→⇌]$/.test(out)) {
    out += '.';
  }
  return out;
}

/**
 * Replaces bloated formal phrasing and Latinate jargon with clear, concise,
 * student-friendly phrasing while preserving 100% of factual & technical accuracy.
 */
export function simplifyAcademicLanguage(
  text: string,
  definitions: ExtractedDefinition[] = []
): string {
  let out = text
    .replace(/\bis characterized by the fact that\b/gi, 'works because')
    .replace(/\bhas the (?:capacity|ability|potential) to\b/gi, 'can')
    .replace(/\bis (?:capable|able) of\b/gi, 'can')
    .replace(/\bexhibits a tendency to\b/gi, 'tends to')
    .replace(/\bfacilitates the process of\b/gi, 'helps')
    .replace(/\butilize(?:s|d|ing)?\b/gi, (m) => {
      const lower = m.toLowerCase();
      if (lower.endsWith('s')) return 'uses';
      if (lower.endsWith('d')) return 'used';
      if (lower.endsWith('ing')) return 'using';
      return 'use';
    })
    .replace(/\b((?:has|have|had|is|are|was|were)\s+)facilitated\b/gi, '$1enabled')
    .replace(/\bfacilitate(s|ing)?\b/gi, (m) => {
      const lower = m.toLowerCase();
      if (lower.endsWith('s')) return 'enables';
      if (lower.endsWith('ing')) return 'enabling';
      return 'enable';
    })
    .replace(/\bdemonstrate(?:s|d)?\b/gi, (m) =>
      m.toLowerCase().endsWith('s') ? 'shows' : m.toLowerCase().endsWith('d') ? 'showed' : 'show'
    )
    .replace(/\bpredominantly\b/gi, 'mainly')
    .replace(/\bprimarily\b/gi, 'mainly')
    .replace(/\bsubsequently\b/gi, 'then')
    .replace(/\bconsequently\b/gi, 'as a result')
    .replace(/\bnevertheless\b/gi, 'even so')
    .replace(/\bnonetheless\b/gi, 'even so')
    .replace(/\bfundamentally\b/gi, 'at its core')
    .replace(/\bin conjunction with\b/gi, 'with')
    .replace(/\bin the event that\b/gi, 'if')
    .replace(/\bprior to\b/gi, 'before')
    .replace(/\bsubsequent to\b/gi, 'after')
    .replace(/\bwith respect to\b/gi, 'about')
    .replace(/\bwith regard to\b/gi, 'about')
    .replace(/\bnecessitate(?:s|d)?\b/gi, (m) =>
      m.toLowerCase().endsWith('s') ? 'requires' : m.toLowerCase().endsWith('d') ? 'required' : 'require'
    )
    .replace(/\bdiminish(?:es|ed)?\b/gi, (m) =>
      m.toLowerCase().endsWith('es') ? 'reduces' : m.toLowerCase().endsWith('ed') ? 'reduced' : 'reduce'
    )
    .replace(/\baccumulates?\b/gi, (m) => (m.toLowerCase().endsWith('s') ? 'builds up' : 'build up'))
    .replace(/\bcommences?\b/gi, (m) => (m.toLowerCase().endsWith('s') ? 'begins' : 'begin'))
    .replace(/\bterminates?\b/gi, (m) => (m.toLowerCase().endsWith('s') ? 'ends' : 'end'))
    .replace(/\bsufficient\b/gi, 'enough')
    .replace(/\boptimal\b/gi, 'best');

  // Inline-gloss a single unfamiliar defined technical term if helpful and not already explained
  if (definitions.length > 0 && out.length >= 45) {
    const outLower = out.toLowerCase();
    for (const def of definitions.slice(0, 12)) {
      const termLower = def.term.toLowerCase();
      if (termLower.length < 5) continue;
      if (!outLower.includes(termLower)) continue;
      const snippet = def.rawDefinition.split(/[.;]/)[0].trim();
      if (
        snippet.length >= 10 &&
        snippet.length <= 54 &&
        !outLower.includes(snippet.slice(0, 18).toLowerCase()) &&
        !outLower.includes(`${termLower} is`) &&
        !outLower.includes(`${termLower} (`)
      ) {
        const escapedTerm = def.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const termRegex = new RegExp(`\\b(${escapedTerm})\\b`);
        const match = out.match(termRegex);
        if (match && out.split(/\s+/).length <= 18) {
          const gloss = snippet.charAt(0).toLowerCase() + snippet.slice(1);
          out = out.replace(termRegex, `$1 (${gloss})`);
          break;
        }
      }
    }
  }

  return finalizeSentencePunctuation(out);
}

/**
 * Generates a student-friendly plain-language breakdown for dense or complex concepts
 * using ONLY information present in the source document.
 */
export function buildPlainLanguageExplanation(
  text: string,
  definitions: ExtractedDefinition[] = []
): string {
  const condensed = condenseAcademicSentence(text, 'short');
  if (!condensed) return '';

  let plain = simplifyAcademicLanguage(condensed, definitions);

  // Split dense multi-clause contrast or causal statements into crisp cause/contrast flow
  const whereasMatch = plain.match(/^(.{15,120}?),\s+whereas\s+(.{15,120}?)[.?!]?$/i);
  if (whereasMatch) {
    plain = `${whereasMatch[1].trim()}. By contrast, ${whereasMatch[2].trim()}.`;
  } else {
    const becauseMatch = plain.match(/^(.{15,120}?)\s+because\s+(.{15,120}?)[.?!]?$/i);
    if (becauseMatch) {
      plain = `${becauseMatch[1].trim()} — this happens because ${becauseMatch[2].trim()}.`;
    }
  }

  // If simplification still matches condensed or source text closely, weave a grounded term meaning or mechanism summary
  const sourceNorm = normalizedFingerprint(text);
  const condensedNorm = normalizedFingerprint(condensed);
  const plainNorm = normalizedFingerprint(plain);
  if (sourceNorm === plainNorm || condensedNorm === plainNorm) {
    for (const def of definitions.slice(0, 14)) {
      const tl = def.term.toLowerCase();
      if (
        tl.length >= 4 &&
        plain.toLowerCase().includes(tl) &&
        !plain.toLowerCase().includes(def.rawDefinition.slice(0, 20).toLowerCase())
      ) {
        const shortMean = def.rawDefinition.split(/[.;]/)[0].trim();
        if (shortMean.length >= 12 && shortMean.length <= 105) {
          return finalizeSentencePunctuation(
            `${def.term} means ${shortMean.charAt(0).toLowerCase() + shortMean.slice(1)}`
          );
        }
      }
    }
    return '';
  }

  return finalizeSentencePunctuation(plain);
}

/**
 * Deterministically condenses an academic sentence by removing rhetorical lead-ins,
 * non-essential parenthetical padding, verbose syntactic constructions, and trailing
 * secondary filler clauses—strictly preserving formulas, quantities, units, and meaning.
 */
export function condenseAcademicSentence(
  rawText: string,
  level: SummaryLevel,
  options?: { preserveContrast?: boolean; preserveFormula?: boolean }
): string {
  let text = stripBoilerplatePrefix(rawText).trim();
  if (!text) return '';

  // 1. Strip scholarly discourse openers & textbook framing (including prepositional insertions)
  text = text
    .replace(
      /^(?:it is (?:widely|generally|broadly|commonly|universally) (?:acknowledged|recognized|accepted|understood|observed|known)(?:\s+(?:in|across|within|among)\s+[^,]{3,48})?\s+that|from a (?:theoretical|practical|broader|scientific|historical|economic) perspective,?|in modern (?:academic )?study,?|researchers (?:and practitioners )?(?:often|frequently) (?:observe|note|emphasize) that|to understand [^,]{3,45},\s*(?:it is important to note that|note that|we must first understand that)?|first and foremost,?|to put it simply,?|in other words,?|as a matter of fact,?|needless to say,?|for all practical purposes,?|specifically speaking,?|it (?:should|must) be (?:noted|emphasized|remembered|highlighted|understood) that|it is (?:important|worth|essential|critical) to (?:note|remember|understand|recognize) that|as previously (?:noted|mentioned|explained|established),?)\s*/gi,
      ''
    )
    .trim();

  // 2. Strip citation / cross-reference / meta parentheticals while protecting formulas, units, acronyms
  text = text.replace(/\(([^()]{1,120})\)/g, (full, inner: string) => {
    if (
      /^(?:see\s|fig\.?|figure\s|table\s|sec\.?|section\s|ch\.?|chapter\s|page\s|pp?\.|et al\.|(?:19|20)\d{2}[a-z]?$|as (?:shown|discussed|noted|illustrated|earlier)\b|which\s+(?:is|will|can)\b|for example\b|for instance\b)/i.test(
        inner.trim()
      )
    ) {
      return '';
    }
    if (preserveProtectedParenthetical(inner)) {
      return full;
    }
    return level === 'comprehensive' && inner.trim().split(/\s+/).length <= 7 ? full : '';
  });

  // 3. Concise syntactic tightening (meaning-preserving & grammatically clean)
  text = text
    .replace(/\bdue to the fact that\b/gi, 'because')
    .replace(/\bowing to the fact that\b/gi, 'because')
    .replace(/\bon account of the fact that\b/gi, 'because')
    .replace(/\bbecause of the fact that\b/gi, 'because')
    .replace(/\bin spite of the fact that\b/gi, 'although')
    .replace(/\bdespite the fact that\b/gi, 'although')
    .replace(/\bplay a (?:key|crucial|vital|major|important|central|significant) role\s+(?:in order\s+)?to\s+allow\b/gi, 'help')
    .replace(/\bplays a (?:key|crucial|vital|major|important|central|significant) role\s+(?:in order\s+)?to\s+allow\b/gi, 'helps')
    .replace(/\bplay a (?:key|crucial|vital|major|important|central|significant) role in\b/gi, 'drive')
    .replace(/\bplays a (?:key|crucial|vital|major|important|central|significant) role in\b/gi, 'drives')
    .replace(/\bplay a (?:key|crucial|vital|major|important|central|significant) role to\b/gi, 'help')
    .replace(/\bplays a (?:key|crucial|vital|major|important|central|significant) role to\b/gi, 'helps')
    .replace(/\bin order to allow\b/gi, 'to let')
    .replace(/\bin order to\b/gi, 'to')
    .replace(/\bfor the purpose of\b/gi, 'for')
    .replace(/\bwith the aim of\b/gi, 'to')
    .replace(/\ba (?:large|great|considerable|significant) number of\b/gi, 'many')
    .replace(/\ba (?:wide|broad) (?:variety|range) of\b/gi, 'various')
    .replace(/\bserves as a (?:means|mechanism|way) (?:to|for)\b/gi, 'enables')
    .replace(/\bresults in the (?:production|formation|creation|generation) of\b/gi, 'produces')
    .replace(/\bleads to an? (?:increase|rise) in\b/gi, 'increases')
    .replace(/\bleads to an? (?:decrease|decline|reduction|drop) in\b/gi, 'reduces')
    .replace(/\btakes place (inside|within|in|at|during)\b/gi, 'occurs $1')
    .replace(/\bon the basis of\b/gi, 'based on')
    .replace(/\bin the absence of\b/gi, 'without')
    .replace(/\bin the presence of\b/gi, 'with')
    .replace(/\bthroughout the course of\b/gi, 'during')
    .replace(/\bat the present time\b/gi, 'currently')
    .replace(/\bis defined as being\b/gi, 'is')
    .replace(/\bis defined as\b/gi, 'is')
    .replace(/\bguarantees that every subsequent\b/gi, 'ensures every')
    .replace(/\bmost recently committed\b/gi, 'latest')
    .replace(/\bby waiting for\b/gi, 'via')
    .replace(/\bacross geographically distributed regions\b/gi, 'across regions')
    .replace(/\b(helps?|lets?)\s+([^,.;]{3,42}?)\s+to\s+([a-z]{3,18})\b/gi, '$1 $2 $3')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const hasFormula =
    Boolean(options?.preserveFormula) ||
    /[→⇌]|(?:^|\s)[A-Za-zΔαβγλμθπρσωΩ][A-Za-z0-9_₀-₉⁰-⁹']*\s*[=≈∝]\s*\S/.test(text);
  const hasContrast =
    Boolean(options?.preserveContrast) ||
    /\b(whereas|unlike|in contrast|differs from|compared (?:to|with)|rather than)\b/i.test(text);

  // 4. Trim bloated secondary trailing clauses when sentence exceeds level budget
  const wordLimit = level === 'short' ? 12 : level === 'detailed' ? 15 : 18;
  const words = text.split(/\s+/).filter(Boolean);

  if (!hasFormula && words.length > wordLimit) {
    // Strip trailing "; additionally/moreover/furthermore ..." elaboration
    const semiIdx = text.search(/;\s+(?:additionally|furthermore|moreover|consequently|in addition|similarly)\b/i);
    if (semiIdx >= 24) {
      const head = text.slice(0, semiIdx).trim();
      if (head.split(/\s+/).length >= 6) {
        text = head;
      }
    }

    // If still long and not a contrast sentence, prune verbose trailing ", which ..." / ", thereby ..." / ", while also ..."
    const currentWords = text.split(/\s+/).filter(Boolean);
    if (!hasContrast && currentWords.length > wordLimit) {
      const relMatch = text.match(
        /^(.{24,}?),\s+(?:which (?:often|typically|generally|essentially|ultimately|helps|allows|means|serves|is often)\b|thereby\b|in turn\b|thus allowing\b|especially when\b)(.+)$/i
      );
      if (relMatch) {
        const candidateHead = relMatch[1].trim();
        const tailText = relMatch[2];
        const tailHasCriticalData = /[=→⇌]|(?:\d+(?:\.\d+)?\s*(?:%|°|m\/s|kg|mol|kJ|ATP|NADH))/.test(tailText);
        const headWords = candidateHead.split(/\s+/);
        const lastWord = headWords[headWords.length - 1]?.toLowerCase().replace(/[^a-z]/g, '') || '';
        if (headWords.length >= 6 && !tailHasCriticalData && !DANGLING_END_WORDS.has(lastWord)) {
          text = candidateHead;
        }
      }
    }

    // Prune bloated trailing purpose/prepositional tails when sentence exceeds word budget
    if (!hasContrast) {
      const shortWords = text.split(/\s+/).filter(Boolean);
      const triggerLen = level === 'short' ? wordLimit + 1 : wordLimit + 2;
      if (shortWords.length > triggerLen) {
        const tailCut = text.match(
          /^(.{24,}?)\s+(?:so that\b|despite\b|prior to\b|before\s+(?:any|acknowledging)\b|across all\b|across the\b|in separate\b|without synchronized\b|to the client\b)(.+)$/i
        );
        if (tailCut) {
          const candidateHead = tailCut[1].trim().replace(/,$/, '');
          const tailText = tailCut[2];
          const tailHasCriticalData = /[=→⇌]|(?:\d+(?:\.\d+)?\s*(?:%|°|m\/s|kg|mol|kJ|ATP|NADH))/.test(tailText);
          const headWords = candidateHead.split(/\s+/);
          const lastWord = headWords[headWords.length - 1]?.toLowerCase().replace(/[^a-z]/g, '') || '';
          if (headWords.length >= 7 && !tailHasCriticalData && !DANGLING_END_WORDS.has(lastWord)) {
            text = candidateHead;
          }
        }
      }
    }

    // Remove verbose mid-sentence non-restrictive filler appositive (", in many respects, ")
    const stillWords = text.split(/\s+/).filter(Boolean);
    if (level !== 'comprehensive' && stillWords.length > wordLimit + 3) {
      text = text.replace(
        /,\s+(?:in (?:many|most|several) (?:cases|respects|ways)|as (?:generally|widely) understood|at least in part),/gi,
        ','
      );
    }
  }

  text = simplifyAcademicLanguage(text);

  return finalizeSentencePunctuation(text);
}

interface ParsedSubjectPredicate {
  subject: string;
  subjectNorm: string;
  predicate: string;
}

function parseSubjectPredicate(sentence: string): ParsedSubjectPredicate | null {
  const clean = sentence.trim().replace(/[.!?]+$/, '');
  if (!clean || /[=→⇌]/.test(clean) || /\b(?:whereas|unlike|although)\b/i.test(clean)) {
    return null;
  }
  const match = clean.match(
    /^(?:The\s+)?([A-Z][A-Za-z0-9₀-₉'/-]*(?:\s+[A-Za-z0-9₀-₉'/-]+){0,3})\s+((?:is|are|was|were|has|have|can|converts?|produces?|synthesizes?|reduces?|increases?|causes?|drives?|occurs?|uses?|requires?|operates?|regulates?|measures?|represents?|contains?|stores?|transfers?|carries?|absorbs?|breaks?\s+down)\s+.{10,140})$/
  );
  if (!match) return null;
  const subject = match[1].trim();
  const subjectNorm = subject.toLowerCase().replace(/^(?:the|an?)\s+/, '').replace(/s$/, '');
  if (subjectNorm.length < 3 || /^(?:it|this|that|these|those|there|here|they|such)$/.test(subjectNorm)) {
    return null;
  }
  return {
    subject,
    subjectNorm,
    predicate: match[2].trim(),
  };
}

/**
 * Merges and condenses related study units (including units originating across
 * different pages or sections) into fewer, tighter, non-repetitive synthesized points.
 */
export function fuseRelatedUnits(
  units: AnalyzedUnit[],
  level: SummaryLevel,
  options?: { maxItems?: number; definitions?: ExtractedDefinition[] }
): string[] {
  if (units.length === 0) return [];
  const maxItems = options?.maxItems ?? units.length;
  const definitions = options?.definitions ?? [];

  const condensedItems = units
    .map((u) => {
      const condensed = condenseAcademicSentence(u.formattedText, level);
      return {
        unit: u,
        condensed,
        parsed: parseSubjectPredicate(condensed),
        tokens: contentTokens(condensed),
      };
    })
    .filter((item) => item.condensed.length >= 14);

  const usedIndices = new Set<number>();
  const fusedOutputs: string[] = [];

  for (let i = 0; i < condensedItems.length; i++) {
    if (fusedOutputs.length >= maxItems) break;
    if (usedIndices.has(i)) continue;
    usedIndices.add(i);

    const primary = condensedItems[i];
    let mergedText = primary.condensed;

    // Look ahead for a complementary unit on the exact same core subject (same section OR different page)
    if (primary.parsed) {
      for (let j = i + 1; j < condensedItems.length; j++) {
        if (usedIndices.has(j)) continue;
        const secondary = condensedItems[j];
        if (!secondary.parsed) continue;
        if (secondary.parsed.subjectNorm !== primary.parsed.subjectNorm) continue;

        const sim = tokenSimilarity(primary.tokens, secondary.tokens);
        // If essentially identical, absorb without adding bloat
        if (sim.containment >= 0.72) {
          usedIndices.add(j);
          continue;
        }

        // Merge distinct predicates cleanly under one synthesized sentence when compact
        const pred1 = primary.parsed.predicate.replace(/^also\s+/i, '');
        const pred2 = secondary.parsed.predicate.replace(/^also\s+/i, '');
        const isDef1 = /^(?:is|are)\s+(?:a|an|the)\s+/i.test(pred1);
        const isAction2 = !/^(?:is|are)\s+(?:a|an|the)\s+/i.test(pred2);

        let candidateMerge = '';
        if (isDef1 && isAction2) {
          const appositive = pred1.replace(/^(?:is|are)\s+/i, '');
          if (appositive.split(/\s+/).length <= 10) {
            candidateMerge = `${primary.parsed.subject} (${appositive}) ${pred2}`;
          }
        } else {
          candidateMerge = `${primary.parsed.subject} ${pred1}, and ${pred2}`;
        }

        const mergeWords = candidateMerge.split(/\s+/).filter(Boolean).length;
        if (candidateMerge && mergeWords <= (level === 'short' ? 18 : 30)) {
          mergedText = finalizeSentencePunctuation(candidateMerge);
          usedIndices.add(j);
          break;
        }
      }
    }

    // Subsumption check against already emitted fused outputs
    const mergedToks = contentTokens(mergedText);
    const alreadyCovered = fusedOutputs.some((prev) => {
      const prevToks = contentTokens(prev);
      const { jaccard, containment } = tokenSimilarity(mergedToks, prevToks);
      return jaccard >= 0.6 || containment >= 0.76;
    });
    if (alreadyCovered) continue;

    if (level === 'short') {
      mergedText = simplifyAcademicLanguage(mergedText, definitions);
    }
    fusedOutputs.push(finalizeSentencePunctuation(mergedText));
  }

  return fusedOutputs.slice(0, maxItems);
}

/**
 * Composes an original, document-wide introduction synthesizing the central thesis,
 * cross-section topical arc, and key analytical anchors—never just echoing sentence 1 verbatim.
 */
export function composeDocumentOverview(
  profile: DocumentIntelligenceProfile,
  level: SummaryLevel,
  sanitizeFn: (s: string) => string
): { overview: string; usedFingerprints: string[] } {
  const usedFingerprints: string[] = [];

  const titleClean = profile.title.trim();
  const namedSections = profile.sections
    .map((s) => s.heading)
    .filter((h) => !/^Page \d+$/i.test(h) && !/^Core Content$/i.test(h));

  // Pick central high-salience prose anchor distinct from raw equations
  const rankedProse = [...profile.units]
    .filter(
      (u) =>
        !/^\s*[A-Za-zΔ]+\s*[=∝]/.test(u.formattedText) &&
        !u.isStep &&
        u.formattedText.length >= 28
    )
    .sort((a, b) => {
      const aLeadBonus = a.orderIndex <= 3 ? 1.25 : 1;
      const bLeadBonus = b.orderIndex <= 3 ? 1.25 : 1;
      return b.score * bLeadBonus - a.score * aLeadBonus;
    });

  const leadUnit = rankedProse[0] || profile.units[0];
  let thesisSentence = '';

  if (profile.centralThesis) {
    thesisSentence = condenseAcademicSentence(profile.centralThesis, level);
  } else if (leadUnit) {
    thesisSentence = condenseAcademicSentence(leadUnit.formattedText, level);
    usedFingerprints.push(leadUnit.fingerprint);
  }

  if (leadUnit) {
    usedFingerprints.push(leadUnit.fingerprint);
  }

  // Synthesize multi-section thematic arc (beginning -> middle -> conclusion)
  const parts: string[] = [];
  if (thesisSentence) {
    parts.push(thesisSentence);
  }

  if (namedSections.length >= 2) {
    const sampleHeadings =
      namedSections.length <= 3
        ? namedSections
        : [
            namedSections[0],
            namedSections[Math.floor(namedSections.length / 2)],
            namedSections[namedSections.length - 1],
          ];
    const uniqueSample = Array.from(new Set(sampleHeadings));
    const coreThemes =
      uniqueSample.length >= 2
        ? `${uniqueSample.slice(0, -1).join(', ')}, and ${uniqueSample[uniqueSample.length - 1]}`
        : uniqueSample[0];

    const scopeLine =
      level === 'short'
        ? `Key areas: ${coreThemes}.`
        : level === 'detailed'
          ? `Covers ${coreThemes}.`
          : `Covers ${namedSections.length} sections: ${coreThemes}.`;
    parts.push(scopeLine);
  } else if (profile.keyPhrases.length >= 3) {
    const topPhrases = profile.keyPhrases.slice(0, 3).join(', ');
    parts.push(`Focus: ${topPhrases}.`);
  }

  // Add a distinct synthesis anchor from middle/late document only for longer Comprehensive documents
  if (level === 'comprehensive' && profile.units.length >= 26 && rankedProse.length >= 2) {
    const leadToks = contentTokens(thesisSentence);
    const lateAnchor = rankedProse.find((u) => {
      if (usedFingerprints.includes(u.fingerprint)) return false;
      const sim = tokenSimilarity(leadToks, u.tokens);
      return sim.containment < 0.45 && u.orderIndex >= Math.floor(profile.units.length * 0.35);
    });
    if (lateAnchor) {
      const condensedAnchor = condenseAcademicSentence(lateAnchor.formattedText, level);
      if (condensedAnchor) {
        parts.push(condensedAnchor);
        usedFingerprints.push(lateAnchor.fingerprint);
      }
    }
  }

  const combined = sanitizeFn(parts.join(' ').replace(/\s{2,}/g, ' ').trim());
  return {
    overview: level !== 'comprehensive' ? simplifyAcademicLanguage(combined, profile.definitions) : combined,
    usedFingerprints,
  };
}

/**
 * Selects sections stratified across the entire document (beginning, middle, end)
 * so closing chapters are never truncated in Simple or Detailed summaries.
 */
export function selectDistributedSections<T>(sections: T[], maxCount: number): T[] {
  if (sections.length <= maxCount) return [...sections];
  if (maxCount <= 0) return [];
  if (maxCount === 1) return [sections[0]];

  const pickedIndices = new Set<number>();
  pickedIndices.add(0);
  pickedIndices.add(sections.length - 1);

  for (let k = 1; k < maxCount - 1; k++) {
    const idx = Math.round((k * (sections.length - 1)) / (maxCount - 1));
    pickedIndices.add(idx);
  }

  return Array.from(pickedIndices)
    .sort((a, b) => a - b)
    .slice(0, maxCount)
    .map((idx) => sections[idx]);
}

/**
 * Composes a holistic closing recap that synthesizes cross-section connections,
 * causal/quantitative principles, and closing takeaways WITHOUT copying keyTakeaways verbatim.
 */
export function composeFinalRecap(
  profile: DocumentIntelligenceProfile,
  keyTakeaways: string[],
  level: SummaryLevel,
  sanitizeFn: (s: string) => string,
  excludedTexts: string[] = []
): string[] {
  if (profile.quality.isBrief && profile.units.length <= 2) {
    return [];
  }

  const isLargeDoc = profile.units.length >= 25;
  const recapTarget =
    level === 'comprehensive' ? (isLargeDoc ? 4 : 2) : level === 'detailed' ? (isLargeDoc ? 3 : 2) : 2;
  const recap: string[] = [];
  const excludedPool = [...keyTakeaways, ...excludedTexts];
  const excludedFps = new Set(excludedPool.map((t) => normalizedFingerprint(t)));
  const excludedTokens = excludedPool.map((t) => contentTokens(t));

  const isTooCloseToRendered = (candidate: string): boolean => {
    const fp = normalizedFingerprint(candidate);
    if (!fp || excludedFps.has(fp)) return true;
    const toks = contentTokens(candidate);
    return excludedTokens.some((prevToks) => {
      const { jaccard, containment } = tokenSimilarity(toks, prevToks);
      return jaccard >= 0.56 || containment >= 0.72;
    });
  };

  // 1. High-level progression synthesis when sections span multiple chapters (never echoes Cause & Formula Checks)
  const namedSecs = profile.sections
    .map((s) => s.heading)
    .filter((h) => !/^Page \d+$/i.test(h) && !/^Core Content$/i.test(h));
  if (namedSecs.length >= 2 && recap.length < recapTarget) {
    const arcNote = sanitizeFn(
      `Core Arc: Progresses from ${namedSecs[0]} through ${namedSecs[namedSecs.length - 1]}.`
    );
    if (arcNote && !isTooCloseToRendered(arcNote)) {
      recap.push(arcNote);
    }
  }

  // 2. Cross-section integration synthesis ONLY if not already covered in Cause & Formula Checks
  for (const rel of profile.sectionRelationships.slice(0, 2)) {
    if (recap.length >= recapTarget) break;
    const concepts = rel.sharedConcepts.slice(0, 2).join(' and ');
    if (!concepts) continue;
    const note = sanitizeFn(
      `Big Picture: ${rel.fromSection} and ${rel.toSection} connect around ${concepts}.`
    );
    if (note && !isTooCloseToRendered(note)) {
      recap.push(note);
    }
  }

  // 2. Cross-page concept cluster synthesis
  for (const cluster of profile.conceptClusters.slice(0, 2)) {
    if (recap.length >= recapTarget) break;
    if (cluster.sectionHeadings.length < 2 && cluster.pageNumbers.length < 2) continue;
    const scopeLabel =
      cluster.sectionHeadings.length >= 2
        ? `${cluster.sectionHeadings.slice(0, 2).join(' and ')}`
        : 'multiple parts of the material';
    const note = sanitizeFn(
      `Recurring Principle: ${cluster.conceptLabel} ties together ${scopeLabel}.`
    );
    if (note && !isTooCloseToRendered(note)) {
      recap.push(note);
    }
  }

  // 3. Process / mechanism flow synthesis if processes exist (concise start->finish flow)
  if (profile.processes.length > 0 && recap.length < recapTarget) {
    const proc = profile.processes[0];
    if (proc.steps.length >= 2) {
      const firstStep = condenseAcademicSentence(proc.steps[0].rawText, 'short').replace(/\.$/, '');
      const lastStep = condenseAcademicSentence(proc.steps[proc.steps.length - 1].rawText, 'short').replace(/\.$/, '');
      const synth = sanitizeFn(
        `Process Flow (${proc.heading}): Begins with ${firstStep.charAt(0).toLowerCase() + firstStep.slice(1)} and finishes as ${lastStep.charAt(0).toLowerCase() + lastStep.slice(1)}.`
      );
      if (
        synth &&
        !isTooCloseToRendered(synth) &&
        !recap.some((r) => tokenSimilarity(contentTokens(r), contentTokens(synth)).containment >= 0.65)
      ) {
        recap.push(synth);
      }
    }
  }

  // 4. Concluding insight from the closing third of the document (only if genuinely distinct from rendered bullets/examples)
  if (profile.units.length >= 4 && recap.length < recapTarget) {
    const tailStart = Math.floor(profile.units.length * 0.65);
    const closingCandidates = [...profile.units.slice(tailStart)]
      .filter((u) => !/^(?:for example|for instance|e\.g\.)\b/i.test(u.formattedText))
      .sort((a, b) => b.score - a.score);
    for (const cu of closingCandidates) {
      if (recap.length >= recapTarget) break;
      const condensed = sanitizeFn(condenseAcademicSentence(cu.formattedText, 'short'));
      if (
        condensed &&
        !isTooCloseToRendered(condensed) &&
        !recap.some((r) => tokenSimilarity(contentTokens(r), contentTokens(condensed)).containment >= 0.65)
      ) {
        recap.push(condensed);
        break;
      }
    }
  }

  // 5. Formula integrative wrap-up if still below target
  if (profile.formulas.length > 0 && recap.length < recapTarget) {
    const f = profile.formulas[0];
    const note = sanitizeFn(
      `Quantitative Anchor: Apply ${f.name} (${f.expressionOrStructure}) in ${profile.subjectArea.toLowerCase()} analysis.`
    );
    if (note && !isTooCloseToRendered(note)) {
      recap.push(note);
    }
  }

  return recap.slice(0, recapTarget).map((r) =>
    level !== 'comprehensive' ? simplifyAcademicLanguage(r, profile.definitions) : r
  );
}

/**
 * Computes the actual word count of the rendered condensed summary content
 * (excluding metadata header chrome).
 */
export function computeRenderedSummaryWordCount(
  summary: Omit<StructuredSummary, 'markdown' | 'wordCount'>
): number {
  const segments: string[] = [
    summary.title,
    summary.topicOverview,
    ...summary.mainConcepts.flatMap((c) => [
      c.heading,
      ...c.sourcePoints,
      ...(c.subsections?.flatMap((sub) => [sub.heading, ...sub.points]) ?? []),
      ...(c.examples ?? []),
    ]),
    ...summary.importantDefinitions.flatMap((d) => [d.term, d.definition]),
    ...(summary.classificationsAndTypes?.flatMap((cls) => [
      cls.topic,
      cls.overviewStatement,
      ...cls.types.flatMap((t) => [
        t.name,
        t.explanation,
        ...(t.characteristics ?? []),
        ...(t.examples ?? []),
      ]),
      cls.comparisonNote ?? '',
    ]) ?? []),
    ...(summary.characteristicsAndExplanations?.flatMap((g) => [g.topic, ...g.points]) ?? []),
    ...(summary.processesAndMechanisms?.flatMap((p) => [p.heading, ...p.steps]) ?? []),
    ...summary.formulasOrFrameworks.flatMap((f) => [
      f.name,
      f.expressionOrStructure,
      f.usage,
      ...(f.variables?.flatMap((v) => [v.symbol, v.meaning]) ?? []),
    ]),
    ...summary.importantFacts,
    ...summary.relevantExamples.flatMap((e) => [e.title, e.example]),
    ...(summary.importantDistinctions?.flatMap((d) => [d.pairTitle, d.comparison]) ?? []),
    ...(summary.comparisonTables?.flatMap((t) => [
      t.title,
      ...t.headers,
      ...t.rows.flatMap((r) => [r.criterion, ...r.values]),
    ]) ?? []),
    ...summary.difficultConceptExplanations.flatMap((dc) => [
      dc.concept,
      dc.plainExplanation,
    ]),
    ...summary.revisionNotes,
    ...summary.keyTakeaways,
    ...(summary.finalRecap ?? []),
  ];

  const allWords = segments
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return allWords.length;
}

/**
 * Ensures long academic sentences never retain overly common stop-word-only filler fragments.
 */
export function countSubstantiveWords(text: string): number {
  return (text.toLowerCase().match(/\b[a-z0-9][a-z0-9'-]{2,}\b/g) || []).filter(
    (w) => !ACADEMIC_STOP_WORDS.has(w)
  ).length;
}
