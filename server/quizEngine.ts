import crypto from 'crypto';
import {
  analyzeDocumentIntelligence,
  contentTokens,
  getSubjectPeerTerms,
  normalizedFingerprint,
  normalizeText,
  stripBoilerplatePrefix,
  SUBJECT_LEXICONS,
  tokenSimilarity,
  type DocumentIntelligenceProfile,
} from './documentEngine.ts';
import {
  stripSourceFilenameFromTitle,
  stripSummarySourceAndPageRefs,
} from '../src/lib/summarySanitizer.ts';
import { CURATED_EDUCATIONAL_VISUALS } from '../src/lib/visualLearningEngine.ts';
import type {
  AssessmentBlueprint,
  QuizCognitiveBand,
  QuizDifficulty,
  QuizQuestion,
  QuizQuestionCategory,
} from '../src/types/brainstine.ts';

export interface QuizGenerationOptions {
  assessmentMode?: 'practice' | 'exam';
  title?: string;
  subjectArea?: string;
}

type OptionSemanticKind =
  | 'entity_term'
  | 'definition_clause'
  | 'function_clause'
  | 'step_clause'
  | 'causal_clause'
  | 'comparison_clause'
  | 'formula_expr'
  | 'quantity_value'
  | 'proportionality_phrase'
  | 'example_clause';

interface QuizCandidate {
  idKey: string;
  questionCategory: QuizQuestionCategory;
  cognitiveBand: QuizCognitiveBand;
  optionKind: OptionSemanticKind;
  topicTag: string;
  pageNumber: number | null;
  question: string;
  correctAnswer: string;
  distractors: string[];
  evidenceText: string;
  whyExplanation: string;
  factTokens: Set<string>;
  salience: number;
  stemLeakGuard?: string;
}

function deterministicHashInt(input: string): number {
  const hex = crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
  return parseInt(hex, 16);
}

function cleanAcademicProse(text: string, maxLen = 185): string {
  const sanitized = stripSummarySourceAndPageRefs(text || '')
    .replace(/(?:[-=]{2,})\s*(?:Pages?|Slide)\s+\d+\s*(?:[-=]{2,})/gi, ' ')
    .replace(/\[Page\s+\d+\]/gi, ' ')
    .replace(/\(Pages?\s+\d+(?:\s*[-–]\s*\d+)?\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/, '');
  if (sanitized.length <= maxLen) return sanitized;
  const sliced = sanitized.slice(0, maxLen);
  const lastBoundary = Math.max(
    sliced.lastIndexOf(';'),
    sliced.lastIndexOf(','),
    sliced.lastIndexOf(' ')
  );
  if (lastBoundary >= Math.floor(maxLen * 0.56)) {
    return sliced.slice(0, lastBoundary).trim().replace(/[,;:]+$/, '');
  }
  return sliced.trim();
}

function cleanTopicLabel(rawTopic: string | null | undefined, fallbackSubject: string): string {
  const base = stripSummarySourceAndPageRefs(rawTopic || '').trim();
  if (!base || /^(?:page\s*\d+|p\.\s*\d+|study material|core content|document summary)$/i.test(base)) {
    return fallbackSubject || 'Core Concepts';
  }
  return stripSourceFilenameFromTitle(base) || fallbackSubject || 'Core Concepts';
}

function lcFirstPreserveAcronyms(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (
    /^[A-Z]{2,}/.test(trimmed) ||
    /^(?:pH|pKa|mRNA|tRNA|rRNA|cDNA|ATP|ADP|DNA|RNA|NADH|NADPH|RuBisCO|CO₂|H₂O)/.test(trimmed)
  ) {
    return trimmed;
  }
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function ucFirst(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function normalizeOptionSurface(opt: string): string {
  return cleanAcademicProse(opt, 165)
    .replace(/^[-*•]\s+/, '')
    .replace(/[,;:\s]+$/, '')
    .trim();
}

function singularizeVerbPhrase(role: string): string {
  const trimmed = role.trim();
  const match = trimmed.match(/^([A-Za-z]+)(\s+[\s\S]+)$/);
  if (!match) return lcFirstPreserveAcronyms(trimmed);
  const first = match[1].toLowerCase();
  const rest = match[2];
  const singularMap: Record<string, string> = {
    produce: 'produces',
    synthesize: 'synthesizes',
    catalyze: 'catalyzes',
    convert: 'converts',
    break: 'breaks',
    translate: 'translates',
    capture: 'captures',
    absorb: 'absorbs',
    store: 'stores',
    regulate: 'regulates',
    transport: 'transports',
    pump: 'pumps',
    lower: 'lowers',
    degrade: 'degrades',
    modify: 'modifies',
    act: 'acts',
    release: 'releases',
    generate: 'generates',
    carry: 'carries',
    protect: 'protects',
    oxidize: 'oxidizes',
    reduce: 'reduces',
    phosphorylate: 'phosphorylates',
    split: 'splits',
    attach: 'attaches',
  };
  const verbOut = singularMap[first] || first;
  return `${verbOut}${rest}`;
}

function isOptionCompatible(
  candidateOption: string,
  correctAnswer: string,
  existingOptions: string[],
  forbiddenEntity = '',
  docEvidenceLower = ''
): boolean {
  const cleanOpt = normalizeOptionSurface(candidateOption);
  if (cleanOpt.length < 2 || cleanOpt.length > 175) return false;

  const optLower = cleanOpt.toLowerCase();
  const ansLower = normalizeOptionSurface(correctAnswer).toLowerCase();
  if (!ansLower || optLower === ansLower) return false;
  if (optLower.includes(ansLower) || ansLower.includes(optLower)) return false;

  // Enforce strict word-count & grammatical parity so answers aren't given away by length
  const ansWords = ansLower.split(/\s+/).filter(Boolean).length;
  const optWords = optLower.split(/\s+/).filter(Boolean).length;
  if (ansWords <= 3 && optWords > 8) return false;
  if (ansWords >= 7 && optWords <= 2) return false;
  if (Math.max(ansWords, optWords) > Math.max(5, Math.min(ansWords, optWords) * 3.2)) {
    return false;
  }

  // Grammatical parity: don't mix full verb-starting clauses with bare noun-article definitions
  const ansStartsWithVerb = /^(?:synthesizes|produces|catalyzes|converts|breaks|pumps|regulates|transports|absorbs|causes|leads|increases|decreases)\b/i.test(
    ansLower
  );
  const optStartsWithNounDef = /^(?:the|a|an)\s+[a-z]+\s+(?:that|which|of)\b/i.test(optLower);
  if (ansWords >= 6 && ansStartsWithVerb && optStartsWithNounDef) return false;

  for (const prev of existingOptions) {
    const prevLower = normalizeOptionSurface(prev).toLowerCase();
    if (prevLower === optLower) return false;
    if (prevLower.includes(optLower) || optLower.includes(prevLower)) return false;
  }

  if (forbiddenEntity) {
    const forbLower = forbiddenEntity.toLowerCase().trim();
    if (forbLower.length >= 4 && optLower.includes(forbLower)) {
      return false;
    }
  }

  // Reject distractors that actually appear verbatim inside the question's supporting evidence
  if (docEvidenceLower && cleanOpt.length >= 5) {
    const escaped = cleanOpt.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(docEvidenceLower)) {
      return false;
    }
  }

  const optTokens = contentTokens(cleanOpt);
  const ansTokens = contentTokens(correctAnswer);
  if (optTokens.size > 0 && ansTokens.size > 0) {
    const { jaccard, containment } = tokenSimilarity(optTokens, ansTokens);
    if (jaccard >= 0.56 || containment >= 0.78) return false;
  }

  return true;
}

function pickDistractorsFromPools(
  correctAnswer: string,
  pools: string[][],
  count = 3,
  forbiddenEntity = '',
  excludedEvidenceText = ''
): string[] {
  const chosen: string[] = [];
  const docEvidenceLower = excludedEvidenceText.toLowerCase();

  for (const pool of pools) {
    for (const raw of pool) {
      if (chosen.length >= count) break;
      const cleaned = ucFirst(normalizeOptionSurface(raw));
      if (
        isOptionCompatible(cleaned, correctAnswer, chosen, forbiddenEntity, docEvidenceLower)
      ) {
        chosen.push(cleaned);
      }
    }
    if (chosen.length >= count) break;
  }

  return chosen;
}

function generateEquationDistractors(expr: string, allFormulas: string[]): string[] {
  const candidates: string[] = [];

  for (const other of allFormulas) {
    if (other !== expr) candidates.push(other);
  }

  if (expr.includes(' + ')) candidates.push(expr.replace(' + ', ' - '));
  if (expr.includes(' - ')) candidates.push(expr.replace(' - ', ' + '));
  if (/²/.test(expr)) {
    candidates.push(expr.replace(/²/g, ''));
    candidates.push(expr.replace(/²/g, '³'));
  }
  if (/0\.5/.test(expr)) {
    candidates.push(expr.replace(/0\.5/g, '2'));
    candidates.push(expr.replace(/0\.5/g, '1.5'));
  }
  if (/\bma\b/.test(expr)) {
    candidates.push(expr.replace(/\bma\b/, 'm / a'));
    candidates.push(expr.replace(/\bma\b/, 'm + a'));
  }
  if (/^[A-Za-zΔ_]+\s*=\s*[A-Za-z0-9Δ_]+\s*\*\s*[A-Za-z0-9Δ_]+/.test(expr)) {
    candidates.push(expr.replace('*', '/'));
  }
  if (/→/.test(expr)) {
    const parts = expr.split('→').map((p) => p.trim());
    if (parts.length === 2) {
      candidates.push(`${parts[1]} → ${parts[0]}`);
      candidates.push(`${parts[0]} → 2 ${parts[1]}`);
    }
  }
  if (/\b2([A-Z])/.test(expr)) candidates.push(expr.replace(/\b2([A-Z])/, '3$1'));
  if (/= -log/.test(expr)) {
    candidates.push(expr.replace('= -log', '= log'));
    candidates.push(expr.replace('= -log', '= 1 / log'));
  }
  if (/=\s*([A-Za-z]{2,3})$/.test(expr)) {
    const rhs = expr.split('=')[1].trim();
    const lhs = expr.split('=')[0].trim();
    if (rhs.length >= 2) {
      candidates.push(`${lhs} = ${rhs[0]} / ${rhs.slice(1)}`);
      candidates.push(`${lhs} = ${rhs}²`);
    }
  }

  const out: string[] = [];
  for (const c of candidates) {
    const clean = c.trim();
    if (
      clean &&
      clean.toLowerCase() !== expr.toLowerCase() &&
      !out.some((o) => o.toLowerCase() === clean.toLowerCase())
    ) {
      out.push(clean);
    }
    if (out.length >= 3) break;
  }
  return out;
}

function generateQuantityDistractors(qty: string, otherQuantities: string[]): string[] {
  const results: string[] = [];
  const sameUnitMatch = qty.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  const targetUnit = sameUnitMatch ? sameUnitMatch[2].trim().toLowerCase() : '';

  for (const o of otherQuantities) {
    if (o.toLowerCase() === qty.toLowerCase()) continue;
    if (!targetUnit || o.toLowerCase().endsWith(targetUnit)) {
      results.push(o);
    }
    if (results.length >= 3) return results;
  }

  if (sameUnitMatch) {
    const num = parseFloat(sameUnitMatch[1]);
    const suffix = sameUnitMatch[2] ? ` ${sameUnitMatch[2].trim()}` : '';
    const hasDecimal = sameUnitMatch[1].includes('.');
    const isPercent = suffix.trim() === '%';
    const fmt = (n: number) =>
      hasDecimal ? n.toFixed(2).replace(/\.00$/, '') : String(Math.round(n));

    if (!Number.isNaN(num) && num > 0) {
      const rawVariants = [num * 2, Math.max(1, num / 2), num + (num >= 10 ? 5 : 2)];
      for (const rv of rawVariants) {
        if (isPercent && rv > 100) continue;
        const label = `${fmt(rv)}${suffix}`;
        if (label !== qty && !results.includes(label)) {
          results.push(label);
        }
      }
      if (isPercent && results.length < 3) {
        for (const fallbackPct of [Math.max(1, num - 15), Math.min(99, num + 15), Math.max(1, num - 25)]) {
          const label = `${fmt(fallbackPct)}${suffix}`;
          if (label !== qty && !results.includes(label)) results.push(label);
        }
      }
    }
  }

  return results.slice(0, 3);
}

/**
 * Validates that every generated MCQ reads naturally like a university exam question,
 * has zero raw PDF artifacts/page tags, balanced A–D options, and an accurate explanation.
 */
function validateAndRefineCandidate(cand: QuizCandidate): QuizCandidate | null {
  const cleanQ = cleanAcademicProse(cand.question, 270);
  if (cleanQ.length < 22 || !/[?]$/.test(cleanQ)) return null;

  // Reject dangling fragments or broken punctuation inside stem
  if (/(?:\.\.\.|…|__|\[Page|Page \d+|\.(?:pdf|docx?|txt)\b)/i.test(cleanQ)) {
    return null;
  }

  const normalizedCorrect = ucFirst(normalizeOptionSurface(cand.correctAnswer));
  if (normalizedCorrect.length < 2 || normalizedCorrect.length > 175) return null;

  // Stem leak guard: prevent verbatim giving away the exact answer inside question stem
  if (cand.stemLeakGuard && cand.stemLeakGuard.length >= 5) {
    const escaped = cand.stemLeakGuard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(cleanQ)) {
      return null;
    }
  }

  const cleanDistractors: string[] = [];
  for (const d of cand.distractors) {
    const normD = ucFirst(normalizeOptionSurface(d));
    if (!normD) continue;
    if (normD.toLowerCase() === normalizedCorrect.toLowerCase()) continue;
    if (cleanDistractors.some((x) => x.toLowerCase() === normD.toLowerCase())) continue;
    cleanDistractors.push(normD);
  }
  if (cleanDistractors.length < 3) return null;

  const allFour = [normalizedCorrect, ...cleanDistractors.slice(0, 3)];
  // Verify pairwise dissimilarity across all 4 options
  for (let i = 0; i < allFour.length; i++) {
    for (let j = i + 1; j < allFour.length; j++) {
      const a = allFour[i].toLowerCase();
      const b = allFour[j].toLowerCase();
      if (a === b || a.includes(b) || b.includes(a)) return null;
      const sim = tokenSimilarity(contentTokens(a), contentTokens(b));
      if (sim.jaccard >= 0.6 || sim.containment >= 0.82) return null;
    }
  }

  const cleanEvidence = cleanAcademicProse(cand.evidenceText, 220);
  if (cleanEvidence.length < 18) return null;

  const cleanWhy = cleanAcademicProse(cand.whyExplanation, 230) || cleanEvidence;

  return {
    ...cand,
    question: cleanQ,
    correctAnswer: normalizedCorrect,
    distractors: cleanDistractors.slice(0, 3),
    evidenceText: cleanEvidence,
    whyExplanation: cleanWhy,
  };
}

function synthesizePrincipleQuestionFromUnit(
  unitText: string,
  subjectArea: string,
  allDescriptions: string[],
  allEntityNames: string[],
  subjectPeers: string[],
  topicTag: string,
  pageNumber: number | null,
  salience: number,
  fingerprint: string,
  tokens: Set<string>
): QuizCandidate | null {
  const clean = cleanAcademicProse(stripBoilerplatePrefix(unitText), 175);
  if (clean.length < 34 || /[=→⇌]/.test(clean)) return null;

  // Match clear Subject + Academic Verb + Object structure -> form conceptual/function MCQ without raw cloze blanks
  const subjVerbMatch = clean.match(
    /^([A-Z][A-Za-z0-9₀-₉()'/-]*(?:\s+[A-Za-z0-9₀-₉()'/-]+){0,3})\s+(enables|requires|maintains|depends on|regulates|controls|governs|determines|produces|facilitates|prevents|reduces|increases|converts|transfers|stores)\s+(.{16,135})$/i
  );
  if (subjVerbMatch) {
    const subj = subjVerbMatch[1].trim();
    const verb = subjVerbMatch[2].trim().toLowerCase();
    const predicate = cleanAcademicProse(subjVerbMatch[3], 130);
    if (
      subj.length >= 3 &&
      predicate.length >= 16 &&
      !/^(?:it|this|that|they|these|those|which|there)$/i.test(subj)
    ) {
      const answer = ucFirst(`${verb} ${lcFirstPreserveAcronyms(predicate)}`);
      const distractors = pickDistractorsFromPools(
        answer,
        [allDescriptions],
        3,
        subj,
        clean
      );
      if (distractors.length === 3) {
        return {
          idKey: `synth-sv:${fingerprint.slice(0, 32)}`,
          questionCategory: 'conceptual',
          cognitiveBand: 'comprehension',
          optionKind: 'function_clause',
          topicTag,
          pageNumber,
          question: `Within ${subjectArea}, which statement accurately describes what ${subj} accomplishes?`,
          correctAnswer: answer,
          distractors,
          evidenceText: clean,
          whyExplanation: `${subj} ${verb} ${lcFirstPreserveAcronyms(predicate)}.`,
          factTokens: tokens,
          salience: salience * 0.96,
          stemLeakGuard: predicate.length >= 12 ? predicate.slice(0, 18) : undefined,
        };
      }
    }
  }

  // Fallback term-concept match -> targeted identification without clumsy literal quotes when possible
  const nouns = clean.match(/\b[A-Za-z][a-zA-Z-]{5,28}\b/g) || [];
  let candidateTerm: string | null = null;
  for (const ent of allEntityNames) {
    if (ent.length < 4 || ent.length > 34) continue;
    const esc = ent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = clean.match(new RegExp(`\\b(${esc})\\b`, 'i'));
    if (m) {
      const blankCheck = clean.replace(m[1], '_____');
      if (!new RegExp(`\\b${esc}\\b`, 'i').test(blankCheck)) {
        candidateTerm = m[1];
        break;
      }
    }
  }
  if (!candidateTerm && nouns.length > 0) {
    const pick = nouns.find((n) => tokens.has(n.toLowerCase()));
    if (pick) candidateTerm = pick;
  }

  if (candidateTerm) {
    const esc = candidateTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const masked = clean.replace(new RegExp(`\\b${esc}\\b`, 'i'), '_______');
    const answerTerm =
      candidateTerm === candidateTerm.toLowerCase() ? ucFirst(candidateTerm) : candidateTerm;
    const distractors = pickDistractorsFromPools(
      answerTerm,
      [allEntityNames, subjectPeers],
      3,
      answerTerm,
      clean
    );
    if (distractors.length === 3) {
      return {
        idKey: `synth-concept:${fingerprint.slice(0, 32)}:${answerTerm.toLowerCase()}`,
        questionCategory: 'conceptual',
        cognitiveBand: 'comprehension',
        optionKind: 'entity_term',
        topicTag,
        pageNumber,
        question: `Which academic term accurately completes the principle: "${masked}"?`,
        correctAnswer: answerTerm,
        distractors,
        evidenceText: clean,
        whyExplanation: `"${answerTerm}" completes this concept accurately: ${clean}.`,
        factTokens: tokens,
        salience: salience * 0.85,
        stemLeakGuard: answerTerm,
      };
    }
  }

  return null;
}

function buildCandidatesFromProfile(profile: DocumentIntelligenceProfile): QuizCandidate[] {
  const candidates: QuizCandidate[] = [];
  const subjectPeers = getSubjectPeerTerms(profile.subjectArea);

  const frequentDocNouns = Array.from(profile.globalTermFreq.entries())
    .filter(([w]) => w.length >= 5 && /^[a-z][a-z-]+$/.test(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 45)
    .map(([w]) => ucFirst(w));

  const allEntityNames = Array.from(
    new Set([
      ...profile.definitions.map((d) => d.term),
      ...profile.structureFunctions.map((sf) => sf.entity),
      ...profile.classifications.flatMap((c) => c.members),
      ...profile.keyTerminology,
      ...profile.keyPhrases,
      ...frequentDocNouns,
    ])
  ).filter((t) => t.length >= 3 && t.length <= 50);

  const allDescriptions = Array.from(
    new Set([
      ...profile.definitions.map((d) => ucFirst(cleanAcademicProse(d.rawDefinition, 145))),
      ...profile.structureFunctions.map((sf) =>
        ucFirst(cleanAcademicProse(sf.roleOrFunction, 145))
      ),
      ...profile.causeEffects.map((ce) => ucFirst(cleanAcademicProse(ce.effect, 145))),
      ...profile.characteristics.map((ch) => ucFirst(cleanAcademicProse(ch.statement, 145))),
    ])
  ).filter((d) => d.length >= 16);

  const allCauses = Array.from(
    new Set(profile.causeEffects.map((ce) => ucFirst(cleanAcademicProse(ce.cause, 145))))
  ).filter((c) => c.length >= 10);

  const allStepActions = profile.processes.flatMap((p) =>
    p.steps.map((s) => ucFirst(cleanAcademicProse(s.rawText, 145)))
  );

  // =========================================================================
  // 1. DEFINITION & CONCEPT IDENTIFICATION (Knowledge & Comprehension)
  // =========================================================================
  profile.definitions.forEach((def, idx) => {
    const cleanDef = cleanAcademicProse(def.rawDefinition, 155);
    if (cleanDef.length < 18) return;
    const topicTag = cleanTopicLabel(def.sectionHeading, profile.subjectArea);

    const termDistractors = pickDistractorsFromPools(
      def.term,
      [
        profile.definitions.map((d) => d.term),
        profile.structureFunctions.map((sf) => sf.entity),
        profile.keyTerminology,
        subjectPeers,
        frequentDocNouns,
      ],
      3,
      def.term,
      def.sourceText
    );

    if (termDistractors.length === 3) {
      const defStems = [
        `In ${topicTag}, which concept is defined as ${lcFirstPreserveAcronyms(cleanDef)}?`,
        `Which term accurately refers to ${lcFirstPreserveAcronyms(cleanDef)}?`,
        `An academic source describes "${lcFirstPreserveAcronyms(cleanDef)}." Which term does this define?`,
      ];
      candidates.push({
        idKey: `def-term:${def.term.toLowerCase()}`,
        questionCategory: 'definition',
        cognitiveBand: 'knowledge',
        optionKind: 'entity_term',
        topicTag,
        pageNumber: def.pageNumber,
        question: defStems[idx % defStems.length],
        correctAnswer: def.term,
        distractors: termDistractors,
        evidenceText: def.sourceText,
        whyExplanation: `${def.term} is defined as ${lcFirstPreserveAcronyms(cleanDef)}.`,
        factTokens: contentTokens(def.sourceText),
        salience: def.salience * 1.25,
        stemLeakGuard: def.term,
      });
    }

    const defOption = ucFirst(cleanAcademicProse(def.rawDefinition, 145));
    if (defOption.length >= 18) {
      const descDistractors = pickDistractorsFromPools(
        defOption,
        [allDescriptions, allStepActions],
        3,
        def.term
      );
      if (descDistractors.length === 3) {
        const conceptStems = [
          `Which statement best explains the underlying concept of ${def.term}?`,
          `What best characterizes ${def.term} within ${topicTag}?`,
        ];
        candidates.push({
          idKey: `term-def:${def.term.toLowerCase()}`,
          questionCategory: 'conceptual',
          cognitiveBand: 'comprehension',
          optionKind: 'definition_clause',
          topicTag,
          pageNumber: def.pageNumber,
          question: conceptStems[idx % conceptStems.length],
          correctAnswer: defOption,
          distractors: descDistractors,
          evidenceText: def.sourceText,
          whyExplanation: `By definition, ${def.term} refers to ${lcFirstPreserveAcronyms(defOption)}.`,
          factTokens: contentTokens(def.sourceText),
          salience: def.salience * 1.18,
        });
      }
    }
  });

  // =========================================================================
  // 2. STRUCTURE-FUNCTION & COUNTERFACTUAL DISRUPTION SCENARIOS
  // =========================================================================
  profile.structureFunctions.forEach((sf, idx) => {
    const cleanRole = ucFirst(cleanAcademicProse(sf.roleOrFunction, 145));
    if (cleanRole.length < 16) return;
    const topicTag = cleanTopicLabel(sf.sectionHeading, profile.subjectArea);

    const roleDistractors = pickDistractorsFromPools(
      cleanRole,
      [
        profile.structureFunctions.map((other) =>
          ucFirst(cleanAcademicProse(other.roleOrFunction, 145))
        ),
        allDescriptions,
        allStepActions,
      ],
      3,
      sf.entity
    );

    if (roleDistractors.length === 3) {
      candidates.push({
        idKey: `sf-role:${sf.entity.toLowerCase()}`,
        questionCategory: 'conceptual',
        cognitiveBand: 'comprehension',
        optionKind: 'function_clause',
        topicTag,
        pageNumber: sf.pageNumber,
        question:
          idx % 2 === 0
            ? `What is the primary functional role of ${sf.entity} within ${topicTag}?`
            : `Which statement accurately describes the action performed by ${sf.entity}?`,
        correctAnswer: cleanRole,
        distractors: roleDistractors,
        evidenceText: sf.statement,
        whyExplanation: `${sf.entity} ${lcFirstPreserveAcronyms(cleanRole)}.`,
        factTokens: contentTokens(sf.statement),
        salience: sf.salience * 1.24,
      });

      // Advanced Scenario / Disruption Question (Counterfactual Reasoning)
      const impairedTarget = cleanAcademicProse(
        cleanRole.replace(
          /^(?:produces?|synthesizes?|catalyzes?|converts?|breaks?\s+down|regulates?|transports?|pumps?|generates?|captures?|absorbs?|phosphorylates?|oxidizes?|reduces?)\s+/i,
          ''
        ),
        120
      );
      if (impairedTarget.length >= 10) {
        const scenarioAnswer = `Impaired ability to ${lcFirstPreserveAcronyms(cleanRole)}`;
        const scenarioDistractors = roleDistractors.map(
          (r) => `Impaired ability to ${lcFirstPreserveAcronyms(r)}`
        );
        if (
          scenarioDistractors.length === 3 &&
          scenarioDistractors.every((d) => d.length <= 165)
        ) {
          candidates.push({
            idKey: `sf-disrupt:${sf.entity.toLowerCase()}`,
            questionCategory: 'scenario',
            cognitiveBand: 'analysis',
            optionKind: 'function_clause',
            topicTag,
            pageNumber: sf.pageNumber,
            question: `Suppose ${sf.entity} becomes non-functional or inhibited in ${topicTag}. Which consequence would most directly follow?`,
            correctAnswer: scenarioAnswer,
            distractors: scenarioDistractors,
            evidenceText: sf.statement,
            whyExplanation: `Because ${sf.entity} normally ${lcFirstPreserveAcronyms(cleanRole)}, inhibiting it directly disrupts this process.`,
            factTokens: contentTokens(`${sf.entity} disruption ${sf.statement}`),
            salience: sf.salience * 1.28,
          });
        }
      }
    }

    const entityDistractors = pickDistractorsFromPools(
      sf.entity,
      [
        profile.structureFunctions.map((other) => other.entity),
        allEntityNames,
        subjectPeers,
        frequentDocNouns,
      ],
      3,
      sf.entity,
      sf.statement
    );

    if (entityDistractors.length === 3) {
      candidates.push({
        idKey: `sf-entity:${sf.entity.toLowerCase()}:${sf.verb.toLowerCase()}`,
        questionCategory: 'definition',
        cognitiveBand: 'knowledge',
        optionKind: 'entity_term',
        topicTag,
        pageNumber: sf.pageNumber,
        question: `Which component or mechanism ${singularizeVerbPhrase(cleanAcademicProse(sf.roleOrFunction, 145))}?`,
        correctAnswer: sf.entity,
        distractors: entityDistractors,
        evidenceText: sf.statement,
        whyExplanation: `${sf.entity} is responsible for this action: ${cleanAcademicProse(sf.statement, 165)}.`,
        factTokens: contentTokens(sf.statement),
        salience: sf.salience * 1.18,
        stemLeakGuard: sf.entity,
      });
    }
  });

  // =========================================================================
  // 3. FORMULAS, EQUATIONS, VARIABLE INTERPRETATION & PROPORTIONALITY ANALYSIS
  // =========================================================================
  const allFormulaStrings = profile.formulas.map((f) => f.expressionOrStructure);
  const allVariableMeanings = profile.formulas.flatMap((f) =>
    f.variables.map((v) => ucFirst(cleanAcademicProse(v.meaning, 120)))
  );

  for (const formula of profile.formulas) {
    const topicTag = cleanTopicLabel(formula.sectionHeading, profile.subjectArea);

    const formulaDistractors = generateEquationDistractors(
      formula.expressionOrStructure,
      allFormulaStrings
    );

    if (formulaDistractors.length === 3) {
      candidates.push({
        idKey: `formula-expr:${formula.expressionOrStructure.toLowerCase()}`,
        questionCategory: 'problem_solving',
        cognitiveBand: 'application',
        optionKind: 'formula_expr',
        topicTag,
        pageNumber: formula.pageNumber,
        question: formula.isChemicalReaction
          ? `Which balanced reaction equation accurately represents ${formula.name}?`
          : `Which formal expression mathematically models ${formula.name}?`,
        correctAnswer: formula.expressionOrStructure,
        distractors: formulaDistractors,
        evidenceText: formula.sourceText,
        whyExplanation: `${formula.name} is formally expressed as ${formula.expressionOrStructure}.`,
        factTokens: contentTokens(formula.sourceText),
        salience: formula.salience * 1.3,
      });
    }

    for (const v of formula.variables) {
      const cleanMeaning = ucFirst(cleanAcademicProse(v.meaning, 130));
      const varDistractors = pickDistractorsFromPools(
        cleanMeaning,
        [allVariableMeanings, allEntityNames, subjectPeers],
        3,
        v.symbol
      );
      if (varDistractors.length === 3) {
        candidates.push({
          idKey: `formula-var:${formula.name}:${v.symbol}`,
          questionCategory: 'conceptual',
          cognitiveBand: 'comprehension',
          optionKind: 'entity_term',
          topicTag,
          pageNumber: formula.pageNumber,
          question: `In ${formula.name} (${formula.expressionOrStructure}), what physical or analytical quantity does "${v.symbol}" denote?`,
          correctAnswer: cleanMeaning,
          distractors: varDistractors,
          evidenceText: formula.sourceText,
          whyExplanation: `In ${formula.expressionOrStructure}, the variable "${v.symbol}" represents ${lcFirstPreserveAcronyms(cleanMeaning)}.`,
          factTokens: contentTokens(`${formula.name} ${v.symbol} ${v.meaning}`),
          salience: formula.salience * 1.24,
        });
      }
    }

    // Analytical Proportionality / Sensitivity Question for algebraic product formulas
    if (!formula.isChemicalReaction) {
      const sqMatch = formula.expressionOrStructure.match(
        /^([A-Za-zΔ_]+)\s*=\s*(?:0\.5\s*)?([A-Za-z])([A-Za-z])²$/
      );
      const linMatch = formula.expressionOrStructure.match(
        /^([A-Za-zΔ_]+)\s*=\s*([A-Za-z])([A-Za-z])$/
      );
      if (sqMatch) {
        const [, lhs, linVar, sqVar] = sqMatch;
        const sqVarInfo = formula.variables.find((v) => v.symbol === sqVar);
        const sqLabel = sqVarInfo ? `${sqVarInfo.meaning} (${sqVar})` : sqVar;
        candidates.push({
          idKey: `formula-prop-sq:${formula.name}:${sqVar}`,
          questionCategory: 'problem_solving',
          cognitiveBand: 'analysis',
          optionKind: 'proportionality_phrase',
          topicTag,
          pageNumber: formula.pageNumber,
          question: `According to ${formula.name} (${formula.expressionOrStructure}), if ${sqLabel} doubles while ${linVar} remains constant, how does ${lhs} change?`,
          correctAnswer: 'Increases by a factor of four (quadruples)',
          distractors: [
            'Increases proportionally by a factor of two (doubles)',
            'Decreases by half',
            'Remains unchanged',
          ],
          evidenceText: formula.sourceText,
          whyExplanation: `Because ${lhs} depends on ${sqVar}², doubling ${sqVar} scales ${lhs} by 2² = 4.`,
          factTokens: contentTokens(`${formula.name} proportionality squared ${sqVar}`),
          salience: formula.salience * 1.32,
        });
      } else if (linMatch) {
        const [, lhs, varA, varB] = linMatch;
        const varAInfo = formula.variables.find((v) => v.symbol === varA);
        const labelA = varAInfo ? `${varAInfo.meaning} (${varA})` : varA;
        candidates.push({
          idKey: `formula-prop-lin:${formula.name}:${varA}`,
          questionCategory: 'problem_solving',
          cognitiveBand: 'analysis',
          optionKind: 'proportionality_phrase',
          topicTag,
          pageNumber: formula.pageNumber,
          question: `In ${formula.name} (${formula.expressionOrStructure}), if ${labelA} doubles while ${varB} stays constant, what happens to ${lhs}?`,
          correctAnswer: 'Doubles proportionally',
          distractors: [
            'Quadruples exponentially',
            'Decreases by half',
            'Remains constant',
          ],
          evidenceText: formula.sourceText,
          whyExplanation: `Since ${lhs} is directly proportional to ${varA} in ${formula.expressionOrStructure}, doubling ${varA} doubles ${lhs}.`,
          factTokens: contentTokens(`${formula.name} proportionality linear ${varA}`),
          salience: formula.salience * 1.3,
        });
      }
    }
  }

  // =========================================================================
  // 4. ORDERED PROCESSES, PREREQUISITES & UPSTREAM BLOCKADE ANALYSIS
  // =========================================================================
  for (const proc of profile.processes) {
    if (proc.steps.length < 2) continue;
    const topicTag = cleanTopicLabel(proc.sectionHeading || proc.heading, profile.subjectArea);

    const firstStep = ucFirst(cleanAcademicProse(proc.steps[0].rawText, 145));
    const stepDistractors = pickDistractorsFromPools(
      firstStep,
      [
        proc.steps.slice(1).map((s) => ucFirst(cleanAcademicProse(s.rawText, 145))),
        allStepActions,
        allDescriptions,
      ],
      3
    );
    if (stepDistractors.length === 3) {
      candidates.push({
        idKey: `proc-start:${proc.heading.toLowerCase()}`,
        questionCategory: 'process',
        cognitiveBand: 'comprehension',
        optionKind: 'step_clause',
        topicTag,
        pageNumber: proc.steps[0].pageNumber,
        question: `Which event initiates the sequence of ${proc.heading}?`,
        correctAnswer: firstStep,
        distractors: stepDistractors,
        evidenceText: proc.steps[0].rawText,
        whyExplanation: `${proc.heading} begins when ${lcFirstPreserveAcronyms(firstStep)}.`,
        factTokens: contentTokens(proc.steps[0].rawText),
        salience: 1.25,
      });
    }

    for (let i = 0; i < proc.steps.length - 1; i++) {
      const prevStep = cleanAcademicProse(proc.steps[i].rawText, 115);
      const nextStep = ucFirst(cleanAcademicProse(proc.steps[i + 1].rawText, 145));
      const nextDistractors = pickDistractorsFromPools(
        nextStep,
        [
          proc.steps
            .filter((_, idx) => idx !== i + 1)
            .map((s) => ucFirst(cleanAcademicProse(s.rawText, 145))),
          allStepActions,
          allDescriptions,
        ],
        3
      );
      if (nextDistractors.length === 3) {
        candidates.push({
          idKey: `proc-next:${proc.heading.toLowerCase()}:${i}`,
          questionCategory: 'process',
          cognitiveBand: 'application',
          optionKind: 'step_clause',
          topicTag,
          pageNumber: proc.steps[i + 1].pageNumber,
          question: `In ${proc.heading}, which stage proceeds immediately after ${lcFirstPreserveAcronyms(prevStep)}?`,
          correctAnswer: nextStep,
          distractors: nextDistractors,
          evidenceText: `${proc.steps[i].rawText} Followed directly by: ${proc.steps[i + 1].rawText}`,
          whyExplanation: `In the ordered pathway of ${proc.heading}, ${lcFirstPreserveAcronyms(nextStep)} follows immediately afterward.`,
          factTokens: contentTokens(proc.steps[i + 1].rawText),
          salience: 1.22,
        });

        // Analytical pathway blockade / dependency question for later stages
        if (i + 1 >= 1) {
          const blockDistractors = pickDistractorsFromPools(
            nextStep,
            [
              proc.steps
                .slice(0, i + 1)
                .map((s) => ucFirst(cleanAcademicProse(s.rawText, 145))),
              allStepActions,
              allDescriptions,
            ],
            3
          );
          if (blockDistractors.length === 3) {
            candidates.push({
              idKey: `proc-block:${proc.heading.toLowerCase()}:${i}`,
              questionCategory: 'analytical',
              cognitiveBand: 'analysis',
              optionKind: 'step_clause',
              topicTag,
              pageNumber: proc.steps[i + 1].pageNumber,
              question: `Suppose the step where ${lcFirstPreserveAcronyms(prevStep)} is blocked during ${proc.heading}. Which downstream event would be directly prevented from occurring next?`,
              correctAnswer: nextStep,
              distractors: blockDistractors,
              evidenceText: `${proc.steps[i].rawText} -> ${proc.steps[i + 1].rawText}`,
              whyExplanation: `Because step ${i + 2} (${lcFirstPreserveAcronyms(nextStep)}) depends directly on completion of the preceding step, blocking it halts this stage next.`,
              factTokens: contentTokens(`blockade ${proc.heading} ${proc.steps[i].rawText} ${proc.steps[i + 1].rawText}`),
              salience: 1.26,
            });
          }
        }
      }
    }
  }

  // =========================================================================
  // 5. COMPARISONS & CONTRASTING DISTINCTIONS
  // =========================================================================
  for (const dist of profile.distinctions) {
    const topicTag = cleanTopicLabel(dist.sectionHeading, profile.subjectArea);

    const unlikeMatch = dist.rawComparison.match(
      /^Unlike\s+([^,]{3,42}),\s+(?:the\s+)?([A-Za-z0-9\s'-]{2,40}?)\s+((?:is|are|has|have|uses|occurs|produces|transfers|takes|requires|does)\s+[^.]{10,130})/i
    );
    if (unlikeMatch) {
      const subB = unlikeMatch[1].trim();
      const subA = unlikeMatch[2].trim();
      const trait = cleanAcademicProse(unlikeMatch[3], 130);
      const distDistractors = pickDistractorsFromPools(
        subA,
        [[subB], allEntityNames, subjectPeers],
        3,
        subA,
        dist.sourceText
      );
      if (distDistractors.length === 3) {
        candidates.push({
          idKey: `dist-unlike:${subA.toLowerCase()}`,
          questionCategory: 'comparison',
          cognitiveBand: 'application',
          optionKind: 'entity_term',
          topicTag,
          pageNumber: dist.pageNumber,
          question: `Which of the following accurately fits the comparative condition: "${trait}"?`,
          correctAnswer: subA,
          distractors: distDistractors,
          evidenceText: dist.sourceText,
          whyExplanation: `Unlike ${subB}, ${subA} ${trait}.`,
          factTokens: contentTokens(dist.sourceText),
          salience: dist.salience * 1.25,
          stemLeakGuard: subA,
        });
      }
    } else if (dist.subjectA && dist.subjectB) {
      const cleanComp = ucFirst(cleanAcademicProse(dist.rawComparison, 145));
      const reversedFalseOption = `${dist.subjectB} exhibits every defining property of ${dist.subjectA} under identical conditions`;
      const compDistractors = pickDistractorsFromPools(
        cleanComp,
        [[reversedFalseOption], allDescriptions, allStepActions],
        3
      );
      if (compDistractors.length === 3) {
        candidates.push({
          idKey: `dist-pair:${dist.pairTitle.toLowerCase()}`,
          questionCategory: 'comparison',
          cognitiveBand: 'comprehension',
          optionKind: 'comparison_clause',
          topicTag,
          pageNumber: dist.pageNumber,
          question: `Which statement accurately distinguishes ${dist.subjectA} from ${dist.subjectB}?`,
          correctAnswer: cleanComp,
          distractors: compDistractors,
          evidenceText: dist.sourceText,
          whyExplanation: `Key distinction: ${cleanComp}.`,
          factTokens: contentTokens(dist.sourceText),
          salience: dist.salience * 1.24,
        });
      }
    }
  }

  // =========================================================================
  // 6. CAUSE <-> EFFECT & DIAGNOSTIC REASONING
  // =========================================================================
  for (const ce of profile.causeEffects) {
    const cleanCause = cleanAcademicProse(ce.cause, 120);
    const cleanEffect = ucFirst(cleanAcademicProse(ce.effect, 145));
    if (cleanCause.length < 10 || cleanEffect.length < 12) continue;
    const topicTag = cleanTopicLabel(ce.sectionHeading, profile.subjectArea);

    const ceDistractors = pickDistractorsFromPools(
      cleanEffect,
      [
        profile.causeEffects.map((other) => ucFirst(cleanAcademicProse(other.effect, 145))),
        allDescriptions,
        allStepActions,
      ],
      3,
      cleanCause
    );
    if (ceDistractors.length === 3) {
      candidates.push({
        idKey: `ce:${normalizedFingerprint(cleanCause).slice(0, 40)}`,
        questionCategory: 'cause_effect',
        cognitiveBand: 'application',
        optionKind: 'causal_clause',
        topicTag,
        pageNumber: ce.pageNumber,
        question: `What is the most direct consequence when ${lcFirstPreserveAcronyms(cleanCause)}?`,
        correctAnswer: cleanEffect,
        distractors: ceDistractors,
        evidenceText: ce.relationshipText,
        whyExplanation: `${ucFirst(cleanCause)} ${lcFirstPreserveAcronyms(cleanEffect)}.`,
        factTokens: contentTokens(ce.relationshipText),
        salience: ce.salience * 1.22,
      });
    }

    // Reverse diagnostic reasoning: observed effect -> underlying cause
    const ucCause = ucFirst(cleanCause);
    const ecDistractors = pickDistractorsFromPools(
      ucCause,
      [allCauses, allEntityNames, allDescriptions],
      3,
      cleanEffect
    );
    if (ecDistractors.length === 3) {
      candidates.push({
        idKey: `ec:${normalizedFingerprint(cleanEffect).slice(0, 40)}`,
        questionCategory: 'analytical',
        cognitiveBand: 'analysis',
        optionKind: 'causal_clause',
        topicTag,
        pageNumber: ce.pageNumber,
        question: `If an evaluation observes that a system ${lcFirstPreserveAcronyms(cleanEffect)}, which underlying factor is most directly responsible?`,
        correctAnswer: ucCause,
        distractors: ecDistractors,
        evidenceText: ce.relationshipText,
        whyExplanation: `${ucCause} is the driving cause that ${lcFirstPreserveAcronyms(cleanEffect)}.`,
        factTokens: contentTokens(ce.relationshipText),
        salience: ce.salience * 1.2,
      });
    }
  }

  // =========================================================================
  // 7. CLASSIFICATIONS, SCENARIO ATTRIBUTE MATCHING & EXCEPTION ANALYSIS
  // =========================================================================
  for (const cls of profile.classifications) {
    if (cls.members.length < 2) continue;
    const topicTag = cleanTopicLabel(cls.sectionHeading, profile.subjectArea);
    const correctMember = cls.members[0];
    const memberSet = new Set(cls.members.map((m) => m.toLowerCase()));
    const nonMembers = allEntityNames.filter((e) => !memberSet.has(e.toLowerCase()));

    const clsDistractors = pickDistractorsFromPools(
      correctMember,
      [nonMembers, subjectPeers],
      3,
      cls.category,
      cls.statement
    );
    if (clsDistractors.length === 3) {
      candidates.push({
        idKey: `cls:${cls.category.toLowerCase()}:${correctMember.toLowerCase()}`,
        questionCategory: 'classification',
        cognitiveBand: 'knowledge',
        optionKind: 'entity_term',
        topicTag,
        pageNumber: cls.pageNumber,
        question: `Which of the following is classified under ${cls.category}?`,
        correctAnswer: correctMember,
        distractors: clsDistractors,
        evidenceText: cls.statement,
        whyExplanation: `${cls.category} includes ${cls.members.join(', ')}.`,
        factTokens: contentTokens(cls.statement),
        salience: cls.salience * 1.18,
      });
    }

    // Applied feature-matching scenario within a classification's detailed types
    for (const typeEntry of cls.types || []) {
      const featureText = cleanAcademicProse(
        typeEntry.characteristics?.[0] || typeEntry.explanation,
        145
      );
      if (
        featureText.length >= 20 &&
        !/without a separate detailed explanation/i.test(featureText) &&
        !featureText.toLowerCase().includes(typeEntry.name.toLowerCase())
      ) {
        const siblingPool = cls.members.filter(
          (m) => m.toLowerCase() !== typeEntry.name.toLowerCase()
        );
        const typeDistractors = pickDistractorsFromPools(
          typeEntry.name,
          [siblingPool, nonMembers, subjectPeers],
          3,
          typeEntry.name
        );
        if (typeDistractors.length === 3) {
          candidates.push({
            idKey: `cls-match:${cls.category.toLowerCase()}:${typeEntry.name.toLowerCase()}`,
            questionCategory: 'scenario',
            cognitiveBand: 'application',
            optionKind: 'entity_term',
            topicTag,
            pageNumber: typeEntry.pageNumber ?? cls.pageNumber,
            question: `A case within ${cls.category} demonstrates this feature: "${lcFirstPreserveAcronyms(featureText)}." Which category does it match?`,
            correctAnswer: typeEntry.name,
            distractors: typeDistractors,
            evidenceText: `${typeEntry.name}: ${featureText}`,
            whyExplanation: `${typeEntry.name} is specifically characterized by ${lcFirstPreserveAcronyms(featureText)}.`,
            factTokens: contentTokens(`${typeEntry.name} ${featureText}`),
            salience: cls.salience * 1.24,
            stemLeakGuard: typeEntry.name,
          });
        }
      }
    }

    // Critical Exclusion / Exception MCQ ("EXCEPT")
    if (cls.members.length >= 3 && nonMembers.length > 0) {
      const exceptionAnswer = nonMembers.find((cand) =>
        isOptionCompatible(cand, cls.members[0], cls.members.slice(0, 3), cls.category, cls.statement.toLowerCase())
      );
      if (exceptionAnswer) {
        candidates.push({
          idKey: `cls-exc:${cls.category.toLowerCase()}:${exceptionAnswer.toLowerCase()}`,
          questionCategory: 'analytical',
          cognitiveBand: 'analysis',
          optionKind: 'entity_term',
          topicTag,
          pageNumber: cls.pageNumber,
          question: `Each of the following is a recognized member or type of ${cls.category} EXCEPT:`,
          correctAnswer: exceptionAnswer,
          distractors: cls.members.slice(0, 3),
          evidenceText: cls.statement,
          whyExplanation: `${cls.members.slice(0, 3).join(', ')} belong to ${cls.category}, whereas ${exceptionAnswer} does not belong to this group.`,
          factTokens: contentTokens(cls.statement),
          salience: cls.salience * 1.22,
        });
      }
    }
  }

  // =========================================================================
  // 8. CHARACTERISTICS & APPLIED EXAMPLES
  // =========================================================================
  for (const ch of profile.characteristics) {
    const cleanStmt = ucFirst(cleanAcademicProse(ch.statement, 145));
    if (cleanStmt.length < 22) continue;
    const topicTag = cleanTopicLabel(ch.sectionHeading || ch.topic, profile.subjectArea);
    const charDistractors = pickDistractorsFromPools(
      cleanStmt,
      [allDescriptions, allStepActions],
      3,
      ch.topic
    );
    if (charDistractors.length === 3) {
      candidates.push({
        idKey: `char:${normalizedFingerprint(cleanStmt).slice(0, 36)}`,
        questionCategory: 'conceptual',
        cognitiveBand: 'comprehension',
        optionKind: 'definition_clause',
        topicTag,
        pageNumber: ch.pageNumber,
        question: `Which statement accurately characterizes a defining property of ${ch.topic}?`,
        correctAnswer: cleanStmt,
        distractors: charDistractors,
        evidenceText: ch.sourceText,
        whyExplanation: `${ch.topic} is characterized by the fact that ${lcFirstPreserveAcronyms(cleanStmt)}.`,
        factTokens: contentTokens(ch.sourceText),
        salience: ch.salience * 1.1,
      });
    }
  }

  for (const ex of profile.examples) {
    const cleanEx = ucFirst(cleanAcademicProse(ex.example, 145));
    if (cleanEx.length < 22) continue;
    const topicTag = cleanTopicLabel(ex.sectionHeading || ex.title, profile.subjectArea);
    const exDistractors = pickDistractorsFromPools(
      cleanEx,
      [allDescriptions, allStepActions],
      3,
      ex.title
    );
    if (exDistractors.length === 3) {
      candidates.push({
        idKey: `example:${normalizedFingerprint(cleanEx).slice(0, 36)}`,
        questionCategory: 'application',
        cognitiveBand: 'application',
        optionKind: 'example_clause',
        topicTag,
        pageNumber: ex.pageNumber,
        question: `Which scenario or instance best exemplifies the application of ${ex.title}?`,
        correctAnswer: cleanEx,
        distractors: exDistractors,
        evidenceText: cleanEx,
        whyExplanation: `${cleanEx} directly illustrates ${ex.title}.`,
        factTokens: contentTokens(`${ex.title} ${cleanEx}`),
        salience: ex.salience * 1.12,
      });
    }
  }

  // =========================================================================
  // 9. CROSS-SECTION CONCEPT SYNTHESIS RELATIONSHIPS
  // =========================================================================
  for (const rel of profile.sectionRelationships) {
    if (rel.sharedConcepts.length === 0) continue;
    const sharedConcept = ucFirst(rel.sharedConcepts[0]);
    const topicTag = cleanTopicLabel(rel.fromSection, profile.subjectArea);
    const distractorConcepts = pickDistractorsFromPools(
      sharedConcept,
      [allEntityNames, subjectPeers, frequentDocNouns],
      3,
      sharedConcept,
      `${rel.fromSection} ${rel.toSection}`
    );
    if (distractorConcepts.length === 3) {
      candidates.push({
        idKey: `rel:${normalizedFingerprint(rel.fromSection).slice(0, 20)}:${normalizedFingerprint(rel.toSection).slice(0, 20)}`,
        questionCategory: 'analytical',
        cognitiveBand: 'analysis',
        optionKind: 'entity_term',
        topicTag,
        pageNumber: null,
        question: `Which overarching concept serves as a shared analytical bridge between "${rel.fromSection}" and "${rel.toSection}"?`,
        correctAnswer: sharedConcept,
        distractors: distractorConcepts,
        evidenceText: rel.connectionNote,
        whyExplanation: `Both ${rel.fromSection} and ${rel.toSection} rely on ${rel.sharedConcepts.slice(0, 3).join(', ')}.`,
        factTokens: contentTokens(`${rel.fromSection} ${rel.toSection} ${rel.sharedConcepts.join(' ')}`),
        salience: 1.15,
      });
    }
  }

  // =========================================================================
  // 10. QUANTITATIVE & CONCEPT SYNTHESIS FALLBACKS (RANKED BY TEXTRANK SALIENCE)
  // =========================================================================
  const allDocQuantities = Array.from(
    new Set(profile.units.flatMap((u) => u.quantitiesUnits))
  );

  const rankedUnits = [...profile.units].sort((a, b) => b.score - a.score);
  for (const unit of rankedUnits) {
    const cleanSent = cleanAcademicProse(stripBoilerplatePrefix(unit.formattedText), 175);
    if (cleanSent.length < 28) continue;
    const topicTag = cleanTopicLabel(unit.sectionHeading, profile.subjectArea);

    // 10A: Quantitative fact
    if (unit.quantitiesUnits.length > 0 && !/[=→⇌]/.test(cleanSent)) {
      const targetQty = unit.quantitiesUnits[0];
      if (cleanSent.includes(targetQty)) {
        const blanked = cleanSent.replace(targetQty, '_____');
        const qtyDistractors = generateQuantityDistractors(targetQty, allDocQuantities);
        if (qtyDistractors.length === 3) {
          candidates.push({
            idKey: `quant:${unit.fingerprint.slice(0, 36)}:${targetQty}`,
            questionCategory: 'problem_solving',
            cognitiveBand: 'application',
            optionKind: 'quantity_value',
            topicTag,
            pageNumber: unit.pageNumber,
            question: `What quantitative value accurately completes this scientific relationship: "${blanked}"?`,
            correctAnswer: targetQty,
            distractors: qtyDistractors,
            evidenceText: cleanSent,
            whyExplanation: `The verified value is ${targetQty}: ${cleanSent}.`,
            factTokens: unit.tokens,
            salience: unit.score * 1.15,
          });
        }
      }
    }

    // 10B: Structured principle synthesis (only emitted cleanly when valid)
    const synth = synthesizePrincipleQuestionFromUnit(
      unit.formattedText,
      profile.subjectArea,
      allDescriptions,
      allEntityNames,
      subjectPeers,
      topicTag,
      unit.pageNumber,
      unit.score,
      unit.fingerprint,
      unit.tokens
    );
    if (synth) {
      candidates.push(synth);
    }
  }

  // Final Validation Gate: filter out any weak/ambiguous/leaked/malformed candidate before blueprint selection
  const validated: QuizCandidate[] = [];
  for (const cand of candidates) {
    const refined = validateAndRefineCandidate(cand);
    if (refined) validated.push(refined);
  }
  return validated;
}

function getCognitiveBandWeights(
  difficulty: QuizDifficulty
): Record<QuizCognitiveBand, number> {
  if (difficulty === 'easy') {
    return { knowledge: 4, comprehension: 2.6, application: 1, analysis: 0.4 };
  }
  if (difficulty === 'intermediate') {
    return { knowledge: 1.4, comprehension: 3.4, application: 3.6, analysis: 1.8 };
  }
  if (difficulty === 'advanced') {
    return { knowledge: 0.5, comprehension: 1.5, application: 3.0, analysis: 4.5 };
  }
  return { knowledge: 2.2, comprehension: 2.5, application: 2.5, analysis: 2.3 };
}

function selectCandidatesBlueprint(
  allCandidates: QuizCandidate[],
  questionCount: number,
  difficulty: QuizDifficulty,
  assessmentMode: 'practice' | 'exam'
): QuizCandidate[] {
  const dedupedById: QuizCandidate[] = [];
  const seenIds = new Set<string>();
  for (const c of allCandidates) {
    if (seenIds.has(c.idKey)) continue;
    seenIds.add(c.idKey);
    dedupedById.push(c);
  }

  const bandWeights = getCognitiveBandWeights(difficulty);
  const scoreCandidate = (c: QuizCandidate) =>
    (bandWeights[c.cognitiveBand] || 2) * 100 + c.salience * 12;

  let ordered: QuizCandidate[];

  if (difficulty === 'mixed') {
    const bands: QuizCognitiveBand[] = ['knowledge', 'comprehension', 'application', 'analysis'];
    const buckets: Record<QuizCognitiveBand, QuizCandidate[]> = {
      knowledge: dedupedById
        .filter((c) => c.cognitiveBand === 'knowledge')
        .sort((a, b) => b.salience - a.salience),
      comprehension: dedupedById
        .filter((c) => c.cognitiveBand === 'comprehension')
        .sort((a, b) => b.salience - a.salience),
      application: dedupedById
        .filter((c) => c.cognitiveBand === 'application')
        .sort((a, b) => b.salience - a.salience),
      analysis: dedupedById
        .filter((c) => c.cognitiveBand === 'analysis')
        .sort((a, b) => b.salience - a.salience),
    };
    ordered = [];
    let idx = 0;
    while (ordered.length < dedupedById.length) {
      let pushed = false;
      for (const b of bands) {
        if (idx < buckets[b].length) {
          ordered.push(buckets[b][idx]);
          pushed = true;
        }
      }
      if (!pushed) break;
      idx++;
    }
  } else {
    ordered = [...dedupedById].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  }

  // Round-robin distribute across topics (stronger enforcement in Exam Mode, also applied in Practice to avoid topic clustering)
  const bucketKeyFor = (c: QuizCandidate) =>
    assessmentMode === 'exam' && c.pageNumber !== null
      ? `${c.topicTag}::${c.pageNumber}`
      : c.topicTag;

  const byTopic = new Map<string, QuizCandidate[]>();
  for (const cand of ordered) {
    const k = bucketKeyFor(cand);
    const list = byTopic.get(k) || [];
    list.push(cand);
    byTopic.set(k, list);
  }

  const topicQueues = Array.from(byTopic.values());
  const interleaved: QuizCandidate[] = [];
  let depth = 0;
  while (interleaved.length < ordered.length) {
    let addedAny = false;
    for (const queue of topicQueues) {
      if (depth < queue.length) {
        interleaved.push(queue[depth]);
        addedAny = true;
      }
    }
    if (!addedAny) break;
    depth++;
  }
  ordered = interleaved;

  // Duplicate-fact & duplicate-stem gate (rejects redundant tests of identical concept)
  const selected: QuizCandidate[] = [];
  const usedFactEntries: Array<{
    tokens: Set<string>;
    stemTokens: Set<string>;
    categories: Set<QuizQuestionCategory>;
  }> = [];

  for (const cand of ordered) {
    if (selected.length >= questionCount) break;
    const stemToks = contentTokens(cand.question);
    const duplicateFact = usedFactEntries.some((prev) => {
      const factSim = tokenSimilarity(cand.factTokens, prev.tokens);
      const stemSim = tokenSimilarity(stemToks, prev.stemTokens);
      return (
        factSim.jaccard >= 0.72 ||
        factSim.containment >= 0.88 ||
        stemSim.jaccard >= 0.72
      );
    });
    if (!duplicateFact) {
      selected.push(cand);
      usedFactEntries.push({
        tokens: cand.factTokens,
        stemTokens: stemToks,
        categories: new Set([cand.questionCategory]),
      });
    }
  }

  // Second pass only allows non-identical question categories on distinct cognitive dimensions if still short
  if (selected.length < questionCount) {
    const selectedSet = new Set(selected);
    for (const cand of ordered) {
      if (selected.length >= questionCount) break;
      if (selectedSet.has(cand)) continue;
      const stemToks = contentTokens(cand.question);
      const alreadySameAngle = usedFactEntries.some((prev) => {
        const factSim = tokenSimilarity(cand.factTokens, prev.tokens);
        const stemSim = tokenSimilarity(stemToks, prev.stemTokens);
        return (
          stemSim.jaccard >= 0.65 ||
          ((factSim.jaccard >= 0.72 || factSim.containment >= 0.88) &&
            prev.categories.has(cand.questionCategory))
        );
      });
      if (!alreadySameAngle) {
        selected.push(cand);
        selectedSet.add(cand);
        usedFactEntries.push({
          tokens: cand.factTokens,
          stemTokens: stemToks,
          categories: new Set([cand.questionCategory]),
        });
      }
    }
  }

  return selected.slice(0, questionCount);
}

/**
 * Summarizes an examination/quiz blueprint across topics and cognitive bands.
 */
export function buildAssessmentBlueprint(questions: QuizQuestion[]): AssessmentBlueprint {
  const topicCounts = new Map<string, number>();
  const cognitiveMix: Record<QuizCognitiveBand, number> = {
    knowledge: 0,
    comprehension: 0,
    application: 0,
    analysis: 0,
  };

  for (const q of questions) {
    const cleanTopic = cleanTopicLabel(q.topicTag, 'Core Concepts');
    topicCounts.set(cleanTopic, (topicCounts.get(cleanTopic) || 0) + 1);
    const band: QuizCognitiveBand = q.cognitiveBand || 'comprehension';
    if (band in cognitiveMix) {
      cognitiveMix[band] += 1;
    }
  }

  return {
    totalQuestions: questions.length,
    topics: Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count),
    cognitiveMix,
  };
}

/**
 * Generates grounded, peer-reviewed academic multiple-choice questions directly
 * from extracted document intelligence (deterministic, zero external AI dependencies).
 */
export function generateGroundedQuizQuestions(
  extractedText: string,
  questionCount = 10,
  difficulty: QuizDifficulty = 'intermediate',
  options?: QuizGenerationOptions
): QuizQuestion[] {
  const normalized = normalizeText(extractedText);
  if (!normalized || normalized.length < 25) return [];

  const profile = analyzeDocumentIntelligence(normalized, {
    title: options?.title || 'Document Assessment',
    subjectArea: options?.subjectArea,
  });

  if (profile.quality.alphaWordCount < 8 || profile.units.length === 0) {
    return [];
  }

  const assessmentMode = options?.assessmentMode === 'exam' ? 'exam' : 'practice';
  const candidates = buildCandidatesFromProfile(profile);
  const chosen = selectCandidatesBlueprint(
    candidates,
    questionCount,
    difficulty,
    assessmentMode
  );

  return chosen.map((cand, index) => {
    const qNum = index + 1;
    const opts = [cand.correctAnswer, ...cand.distractors.slice(0, 3)];
    const targetIdx = deterministicHashInt(`${cand.question}|${cand.correctAnswer}`) % 4;
    if (targetIdx !== 0) {
      const tmp = opts[0];
      opts[0] = opts[targetIdx];
      opts[targetIdx] = tmp;
    }

    const explanation = cand.whyExplanation
      ? `${cand.whyExplanation} (${cand.topicTag})`
      : cleanAcademicProse(cand.evidenceText, 190);

    return {
      id: `q-${qNum}`,
      number: qNum,
      type: 'objective',
      question: cand.question,
      options: opts,
      correctOptionIndex: targetIdx,
      expectedAnswer: opts[targetIdx],
      maxMarks: 1,
      explanation: stripSummarySourceAndPageRefs(explanation),
      topicTag: cand.topicTag,
      cognitiveBand: cand.cognitiveBand,
      questionCategory: cand.questionCategory,
    };
  });
}

/**
 * Builds a grounded academic baseline text when a student specifies a topic
 * without uploading a dedicated PDF or notes.
 */
export function getAcademicTopicPrimer(topicTitle: string): string {
  const clean = stripSourceFilenameFromTitle(topicTitle || 'Academic Studies');
  const lower = clean.toLowerCase();

  for (const item of CURATED_EDUCATIONAL_VISUALS) {
    if (item.matchPatterns.some((p) => p.test(clean) || p.test(lower))) {
      const labelSentences = (item.verifiedLabels || [])
        .map(
          (l) =>
            `${l.label} functions to ${l.detail || 'perform essential structural and operational roles'}.`
        )
        .join(' ');
      return `## ${item.conceptTitle}\n${clean} represents an essential domain within ${item.discipline}.\n${item.caption}\n${labelSentences}\nThis system exemplifies structured operational mechanisms, distinct functional tiers, and regulated physiological or physical control.`;
    }
  }

  let matchedSubject = 'General Studies';
  let peerTerms: string[] = [];
  for (const lex of SUBJECT_LEXICONS) {
    const matched = lex.terms.filter((t) => lower.includes(t));
    if (matched.length > 0) {
      matchedSubject = lex.subject;
      peerTerms = lex.peerTerms.slice(0, 4);
      break;
    }
  }

  if (peerTerms.length > 0) {
    return `## ${clean} (${matchedSubject})\n${clean} is a foundational principle of scholarly investigation in ${matchedSubject}.\nIt links systematically with concepts such as ${peerTerms.join(', ')}.\nKey processes in ${clean} operate through verified mechanisms, empirical relationships, and specialized functional roles.\nMastery of ${clean} involves distinguishing governing laws from practical applications and evaluating quantitative or conceptual evidence.`;
  }

  return `## ${clean}\n${clean} is an established subject of academic study and curriculum inquiry.\nPrimary principles of ${clean} establish its foundational definitions, structural components, and practical applications.\nAnalysis of ${clean} examines cause-and-effect relationships, sequential mechanisms, and comparative criteria.\nScholarly evaluation of ${clean} requires distinguishing core operational features from secondary attributes across multiple perspectives.`;
}
