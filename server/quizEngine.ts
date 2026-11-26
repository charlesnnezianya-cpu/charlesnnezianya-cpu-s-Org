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
import { CURATED_EDUCATIONAL_VISUALS } from '../src/lib/visualLearningEngine.ts';
import type { QuizDifficulty, QuizQuestion } from '../src/types/brainstine.ts';

export interface QuizGenerationOptions {
  assessmentMode?: 'practice' | 'exam';
  title?: string;
  subjectArea?: string;
}

type CognitiveLevel = 'recall' | 'conceptual' | 'application';

type TemplateType =
  | 'definition_to_term'
  | 'term_to_definition'
  | 'structure_to_function'
  | 'function_to_structure'
  | 'classification'
  | 'classification_exception'
  | 'cause_effect'
  | 'effect_to_cause'
  | 'process_sequence'
  | 'distinction'
  | 'formula_expression'
  | 'formula_variable'
  | 'quantitative_fact'
  | 'targeted_cloze';

interface QuizCandidate {
  idKey: string;
  templateType: TemplateType;
  cognitiveLevel: CognitiveLevel;
  sectionKey: string;
  sectionHeading: string | null;
  pageNumber: number | null;
  question: string;
  correctAnswer: string;
  distractors: string[];
  evidenceText: string;
  factTokens: Set<string>;
  salience: number;
}

function deterministicHashInt(input: string): number {
  const hex = crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
  return parseInt(hex, 16);
}

function cleanSnippet(text: string, maxLen = 175): string {
  const cleaned = text
    .replace(/\(Pages?\s+\d+(?:\s*[-–]\s*\d+)?\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/, '');
  if (cleaned.length <= maxLen) return cleaned;
  const sliced = cleaned.slice(0, maxLen);
  const lastBoundary = Math.max(
    sliced.lastIndexOf(';'),
    sliced.lastIndexOf(','),
    sliced.lastIndexOf(' ')
  );
  if (lastBoundary >= Math.floor(maxLen * 0.58)) {
    return sliced.slice(0, lastBoundary).trim().replace(/[,;:]$/, '');
  }
  return sliced.trim();
}

function lcFirstPreserveAcronyms(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/^[A-Z]{2,}/.test(trimmed) || /^(?:pH|pKa|mRNA|tRNA|rRNA|cDNA|ATP|ADP|DNA|RNA|NADH|NADPH)/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function ucFirst(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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
  forbiddenContextText = ''
): boolean {
  const cleanOpt = candidateOption.trim();
  if (cleanOpt.length < 2 || cleanOpt.length > 180) return false;

  const optLower = cleanOpt.toLowerCase();
  const ansLower = correctAnswer.trim().toLowerCase();
  if (optLower === ansLower) return false;
  if (optLower.includes(ansLower) || ansLower.includes(optLower)) return false;

  // Maintain reasonable length/form parity so short single terms aren't paired with long clauses
  const ansWords = ansLower.split(/\s+/).filter(Boolean).length;
  const optWords = optLower.split(/\s+/).filter(Boolean).length;
  if (ansWords <= 3 && optWords > 9) return false;
  if (ansWords >= 7 && optWords <= 1) return false;

  for (const prev of existingOptions) {
    const prevLower = prev.toLowerCase();
    if (prevLower === optLower) return false;
    if (prevLower.includes(optLower) || optLower.includes(prevLower)) return false;
  }

  // Ensure distractor does not directly name the correct entity when testing descriptions
  if (forbiddenContextText) {
    const forbLower = forbiddenContextText.toLowerCase();
    if (forbLower.length >= 4 && optLower.includes(forbLower)) {
      return false;
    }
  }

  const optTokens = contentTokens(cleanOpt);
  const ansTokens = contentTokens(correctAnswer);
  if (optTokens.size > 0 && ansTokens.size > 0) {
    const { jaccard, containment } = tokenSimilarity(optTokens, ansTokens);
    if (jaccard >= 0.62 || containment >= 0.82) return false;
  }

  return true;
}

function pickDistractorsFromPools(
  correctAnswer: string,
  pools: string[][],
  count = 3,
  forbiddenEntity = '',
  excludedTokens?: Set<string>
): string[] {
  const chosen: string[] = [];

  for (const pool of pools) {
    for (const raw of pool) {
      if (chosen.length >= count) break;
      const cleaned = cleanSnippet(raw, 155);
      if (excludedTokens && excludedTokens.has(cleaned.toLowerCase())) continue;
      if (isOptionCompatible(cleaned, correctAnswer, chosen, forbiddenEntity)) {
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

  if (expr.includes(' + ')) {
    candidates.push(expr.replace(' + ', ' - '));
  }
  if (expr.includes(' - ')) {
    candidates.push(expr.replace(' - ', ' + '));
  }
  if (/²/.test(expr)) {
    candidates.push(expr.replace(/²/g, ''));
    candidates.push(expr.replace(/²/g, '³'));
  }
  if (/0\.5/.test(expr)) {
    candidates.push(expr.replace(/0\.5/g, '2'));
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
    }
  }
  if (/\b2([A-Z])/.test(expr)) {
    candidates.push(expr.replace(/\b2([A-Z])/, '3$1'));
  }
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
    const fmt = (n: number) => (hasDecimal ? n.toFixed(2).replace(/\.00$/, '') : String(Math.round(n)));

    if (!Number.isNaN(num) && num > 0) {
      const variants = [
        `${fmt(num * 2)}${suffix}`,
        `${fmt(Math.max(1, num / 2))}${suffix}`,
        `${fmt(num + (num >= 10 ? 5 : 1.5))}${suffix}`,
      ];
      for (const v of variants) {
        if (v !== qty && !results.includes(v)) {
          results.push(v);
        }
      }
    }
  }

  return results.slice(0, 3);
}

function buildCandidatesFromProfile(profile: DocumentIntelligenceProfile): QuizCandidate[] {
  const candidates: QuizCandidate[] = [];
  const subjectPeers = getSubjectPeerTerms(profile.subjectArea);

  const frequentDocNouns = Array.from(profile.globalTermFreq.entries())
    .filter(([w]) => w.length >= 5 && /^[a-z][a-z-]+$/.test(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
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
      ...profile.definitions.map((d) => ucFirst(cleanSnippet(d.rawDefinition, 145))),
      ...profile.structureFunctions.map((sf) => ucFirst(cleanSnippet(sf.roleOrFunction, 145))),
      ...profile.causeEffects.map((ce) => ucFirst(cleanSnippet(ce.effect, 145))),
    ])
  ).filter((d) => d.length >= 16);

  const allCauses = Array.from(
    new Set(profile.causeEffects.map((ce) => ucFirst(cleanSnippet(ce.cause, 145))))
  ).filter((c) => c.length >= 10);

  const allStepActions = profile.processes.flatMap((p) =>
    p.steps.map((s) => ucFirst(cleanSnippet(s.rawText, 145)))
  );

  // 1. Definition -> Term & Term -> Definition
  for (const def of profile.definitions) {
    const cleanDef = cleanSnippet(def.rawDefinition, 165);
    if (cleanDef.length < 18) continue;

    const sectionKey =
      def.sectionHeading || (def.pageNumber !== null ? `Page ${def.pageNumber}` : 'Core Concepts');

    const termDistractors = pickDistractorsFromPools(
      def.term,
      [
        profile.definitions.map((d) => d.term),
        profile.structureFunctions.map((sf) => sf.entity),
        profile.keyTerminology,
        profile.keyPhrases,
        subjectPeers,
        frequentDocNouns,
      ],
      3,
      def.term
    );

    if (termDistractors.length === 3) {
      candidates.push({
        idKey: `def-term:${def.term.toLowerCase()}`,
        templateType: 'definition_to_term',
        cognitiveLevel: 'recall',
        sectionKey,
        sectionHeading: def.sectionHeading,
        pageNumber: def.pageNumber,
        question: `According to the study material, which term is defined as ${lcFirstPreserveAcronyms(cleanDef)}?`,
        correctAnswer: def.term,
        distractors: termDistractors,
        evidenceText: def.sourceText,
        factTokens: contentTokens(def.sourceText),
        salience: def.salience * 1.25,
      });
    }

    const defOption = ucFirst(cleanSnippet(def.rawDefinition, 145));
    if (defOption.length >= 18) {
      const descDistractors = pickDistractorsFromPools(
        defOption,
        [allDescriptions, allStepActions],
        3,
        def.term
      );
      if (descDistractors.length === 3) {
        candidates.push({
          idKey: `term-def:${def.term.toLowerCase()}`,
          templateType: 'term_to_definition',
          cognitiveLevel: 'conceptual',
          sectionKey,
          sectionHeading: def.sectionHeading,
          pageNumber: def.pageNumber,
          question: `How does the study material define or describe ${def.term}?`,
          correctAnswer: defOption,
          distractors: descDistractors,
          evidenceText: def.sourceText,
          factTokens: contentTokens(def.sourceText),
          salience: def.salience * 1.15,
        });
      }
    }
  }

  // 2. Structure/Entity <-> Function/Role
  for (const sf of profile.structureFunctions) {
    const cleanRole = ucFirst(cleanSnippet(sf.roleOrFunction, 145));
    if (cleanRole.length < 16) continue;
    const sectionKey =
      sf.sectionHeading || (sf.pageNumber !== null ? `Page ${sf.pageNumber}` : 'Core Mechanisms');

    const roleDistractors = pickDistractorsFromPools(
      cleanRole,
      [
        profile.structureFunctions.map((other) => ucFirst(cleanSnippet(other.roleOrFunction, 145))),
        allDescriptions,
        allStepActions,
      ],
      3,
      sf.entity
    );

    if (roleDistractors.length === 3) {
      candidates.push({
        idKey: `sf-role:${sf.entity.toLowerCase()}`,
        templateType: 'structure_to_function',
        cognitiveLevel: 'conceptual',
        sectionKey,
        sectionHeading: sf.sectionHeading,
        pageNumber: sf.pageNumber,
        question: `In the study material, what primary function or action is performed by ${sf.entity}?`,
        correctAnswer: cleanRole,
        distractors: roleDistractors,
        evidenceText: sf.statement,
        factTokens: contentTokens(sf.statement),
        salience: sf.salience * 1.22,
      });
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
      sf.entity
    );

    if (entityDistractors.length === 3) {
      candidates.push({
        idKey: `sf-entity:${sf.entity.toLowerCase()}:${sf.verb.toLowerCase()}`,
        templateType: 'function_to_structure',
        cognitiveLevel: 'recall',
        sectionKey,
        sectionHeading: sf.sectionHeading,
        pageNumber: sf.pageNumber,
        question: `Which component or concept ${singularizeVerbPhrase(cleanSnippet(sf.roleOrFunction, 150))}?`,
        correctAnswer: sf.entity,
        distractors: entityDistractors,
        evidenceText: sf.statement,
        factTokens: contentTokens(sf.statement),
        salience: sf.salience * 1.18,
      });
    }
  }

  // 3. Formulas, Chemical Reactions & Variable Meanings
  const allFormulaStrings = profile.formulas.map((f) => f.expressionOrStructure);
  const allVariableMeanings = profile.formulas.flatMap((f) =>
    f.variables.map((v) => ucFirst(cleanSnippet(v.meaning, 120)))
  );

  for (const formula of profile.formulas) {
    const sectionKey =
      formula.sectionHeading ||
      (formula.pageNumber !== null ? `Page ${formula.pageNumber}` : 'Formulas & Equations');

    const formulaDistractors = generateEquationDistractors(
      formula.expressionOrStructure,
      allFormulaStrings
    );

    if (formulaDistractors.length === 3) {
      candidates.push({
        idKey: `formula-expr:${formula.expressionOrStructure.toLowerCase()}`,
        templateType: 'formula_expression',
        cognitiveLevel: 'application',
        sectionKey,
        sectionHeading: formula.sectionHeading,
        pageNumber: formula.pageNumber,
        question: formula.isChemicalReaction
          ? `Which reaction equation corresponds to ${formula.name} in the study material?`
          : `Which mathematical equation represents ${formula.name} in the study material?`,
        correctAnswer: formula.expressionOrStructure,
        distractors: formulaDistractors,
        evidenceText: formula.sourceText,
        factTokens: contentTokens(formula.sourceText),
        salience: formula.salience * 1.3,
      });
    }

    for (const v of formula.variables) {
      const cleanMeaning = ucFirst(cleanSnippet(v.meaning, 130));
      const varDistractors = pickDistractorsFromPools(
        cleanMeaning,
        [allVariableMeanings, allEntityNames, subjectPeers],
        3,
        v.symbol
      );
      if (varDistractors.length === 3) {
        candidates.push({
          idKey: `formula-var:${formula.name}:${v.symbol}`,
          templateType: 'formula_variable',
          cognitiveLevel: 'conceptual',
          sectionKey,
          sectionHeading: formula.sectionHeading,
          pageNumber: formula.pageNumber,
          question: `In ${formula.name} (${formula.expressionOrStructure}), what does the symbol "${v.symbol}" represent?`,
          correctAnswer: cleanMeaning,
          distractors: varDistractors,
          evidenceText: formula.sourceText,
          factTokens: contentTokens(`${formula.name} ${v.symbol} ${v.meaning}`),
          salience: formula.salience * 1.24,
        });
      }
    }
  }

  // 4. Ordered Process / Mechanism Sequence
  for (const proc of profile.processes) {
    if (proc.steps.length < 2) continue;
    const sectionKey =
      proc.sectionHeading ||
      (proc.steps[0]?.pageNumber !== null ? `Page ${proc.steps[0]?.pageNumber}` : proc.heading);

    const firstStep = ucFirst(cleanSnippet(proc.steps[0].rawText, 145));
    const stepDistractors = pickDistractorsFromPools(
      firstStep,
      [
        proc.steps.slice(1).map((s) => ucFirst(cleanSnippet(s.rawText, 145))),
        allStepActions,
        allDescriptions,
      ],
      3
    );
    if (stepDistractors.length === 3) {
      candidates.push({
        idKey: `proc-start:${proc.heading.toLowerCase()}`,
        templateType: 'process_sequence',
        cognitiveLevel: 'conceptual',
        sectionKey,
        sectionHeading: proc.sectionHeading,
        pageNumber: proc.steps[0].pageNumber,
        question: `In ${proc.heading}, which event occurs first according to the study material?`,
        correctAnswer: firstStep,
        distractors: stepDistractors,
        evidenceText: proc.steps[0].rawText,
        factTokens: contentTokens(proc.steps[0].rawText),
        salience: 1.25,
      });
    }

    for (let i = 0; i < proc.steps.length - 1; i++) {
      const prevStep = cleanSnippet(proc.steps[i].rawText, 120);
      const nextStep = ucFirst(cleanSnippet(proc.steps[i + 1].rawText, 145));
      const nextDistractors = pickDistractorsFromPools(
        nextStep,
        [
          proc.steps
            .filter((_, idx) => idx !== i + 1)
            .map((s) => ucFirst(cleanSnippet(s.rawText, 145))),
          allStepActions,
          allDescriptions,
        ],
        3
      );
      if (nextDistractors.length === 3) {
        candidates.push({
          idKey: `proc-next:${proc.heading.toLowerCase()}:${i}`,
          templateType: 'process_sequence',
          cognitiveLevel: 'application',
          sectionKey,
          sectionHeading: proc.sectionHeading,
          pageNumber: proc.steps[i + 1].pageNumber,
          question: `During ${proc.heading}, what happens immediately after: "${prevStep}"?`,
          correctAnswer: nextStep,
          distractors: nextDistractors,
          evidenceText: `${proc.steps[i].rawText} -> ${proc.steps[i + 1].rawText}`,
          factTokens: contentTokens(proc.steps[i + 1].rawText),
          salience: 1.2,
        });
      }
    }
  }

  // 5. Comparisons & Distinctions
  for (const dist of profile.distinctions) {
    const sectionKey =
      dist.sectionHeading ||
      (dist.pageNumber !== null ? `Page ${dist.pageNumber}` : 'Comparisons');

    const unlikeMatch = dist.rawComparison.match(
      /^Unlike\s+([^,]{3,42}),\s+(?:the\s+)?([A-Za-z0-9\s'-]{2,40}?)\s+((?:is|are|has|have|uses|occurs|produces|transfers|takes|requires|does)\s+[^.]{10,130})/i
    );
    if (unlikeMatch) {
      const subB = unlikeMatch[1].trim();
      const subA = unlikeMatch[2].trim();
      const trait = cleanSnippet(unlikeMatch[3], 130);
      const distDistractors = pickDistractorsFromPools(
        subA,
        [[subB], allEntityNames, subjectPeers],
        3,
        subA
      );
      if (distDistractors.length === 3) {
        candidates.push({
          idKey: `dist-unlike:${subA.toLowerCase()}`,
          templateType: 'distinction',
          cognitiveLevel: 'application',
          sectionKey,
          sectionHeading: dist.sectionHeading,
          pageNumber: dist.pageNumber,
          question: `According to the comparison in the material, which of the following ${trait}?`,
          correctAnswer: subA,
          distractors: distDistractors,
          evidenceText: dist.sourceText,
          factTokens: contentTokens(dist.sourceText),
          salience: dist.salience * 1.25,
        });
      }
    } else if (dist.subjectA && dist.subjectB) {
      const cleanComp = ucFirst(cleanSnippet(dist.rawComparison, 145));
      const compDistractors = pickDistractorsFromPools(
        cleanComp,
        [allDescriptions, allStepActions],
        3
      );
      if (compDistractors.length === 3) {
        candidates.push({
          idKey: `dist-pair:${dist.pairTitle.toLowerCase()}`,
          templateType: 'distinction',
          cognitiveLevel: 'application',
          sectionKey,
          sectionHeading: dist.sectionHeading,
          pageNumber: dist.pageNumber,
          question: `What key distinction does the study material make between ${dist.subjectA} and ${dist.subjectB}?`,
          correctAnswer: cleanComp,
          distractors: compDistractors,
          evidenceText: dist.sourceText,
          factTokens: contentTokens(dist.sourceText),
          salience: dist.salience * 1.2,
        });
      }
    }
  }

  // 6. Cause <-> Effect Relationships (Bidirectional: Cause->Effect and Effect->Cause)
  for (const ce of profile.causeEffects) {
    const cleanCause = cleanSnippet(ce.cause, 120);
    const cleanEffect = ucFirst(cleanSnippet(ce.effect, 145));
    if (cleanCause.length < 10 || cleanEffect.length < 12) continue;
    const sectionKey =
      ce.sectionHeading || (ce.pageNumber !== null ? `Page ${ce.pageNumber}` : 'Cause & Effect');

    const ceDistractors = pickDistractorsFromPools(
      cleanEffect,
      [
        profile.causeEffects.map((other) => ucFirst(cleanSnippet(other.effect, 145))),
        allDescriptions,
        allStepActions,
      ],
      3,
      cleanCause
    );
    if (ceDistractors.length === 3) {
      candidates.push({
        idKey: `ce:${normalizedFingerprint(cleanCause).slice(0, 40)}`,
        templateType: 'cause_effect',
        cognitiveLevel: 'application',
        sectionKey,
        sectionHeading: ce.sectionHeading,
        pageNumber: ce.pageNumber,
        question: `What direct effect results from ${lcFirstPreserveAcronyms(cleanCause)} according to the material?`,
        correctAnswer: cleanEffect,
        distractors: ceDistractors,
        evidenceText: ce.relationshipText,
        factTokens: contentTokens(ce.relationshipText),
        salience: ce.salience * 1.18,
      });
    }

    // Reverse: Effect -> Cause
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
        templateType: 'effect_to_cause',
        cognitiveLevel: 'application',
        sectionKey,
        sectionHeading: ce.sectionHeading,
        pageNumber: ce.pageNumber,
        question: `According to the study material, which factor or condition ${lcFirstPreserveAcronyms(cleanEffect)}?`,
        correctAnswer: ucCause,
        distractors: ecDistractors,
        evidenceText: ce.relationshipText,
        factTokens: contentTokens(ce.relationshipText),
        salience: ce.salience * 1.14,
      });
    }
  }

  // 7. Classifications & Groupings (+ Exception questions when >= 3 members)
  for (const cls of profile.classifications) {
    if (cls.members.length < 2) continue;
    const sectionKey =
      cls.sectionHeading || (cls.pageNumber !== null ? `Page ${cls.pageNumber}` : 'Classifications');
    const correctMember = cls.members[0];
    const memberSet = new Set(cls.members.map((m) => m.toLowerCase()));
    const nonMembers = allEntityNames.filter((e) => !memberSet.has(e.toLowerCase()));

    const clsDistractors = pickDistractorsFromPools(
      correctMember,
      [nonMembers, subjectPeers],
      3
    );
    if (clsDistractors.length === 3) {
      candidates.push({
        idKey: `cls:${cls.category.toLowerCase()}:${correctMember.toLowerCase()}`,
        templateType: 'classification',
        cognitiveLevel: 'recall',
        sectionKey,
        sectionHeading: cls.sectionHeading,
        pageNumber: cls.pageNumber,
        question: `Which of the following is classified under ${cls.category} in the study material?`,
        correctAnswer: correctMember,
        distractors: clsDistractors,
        evidenceText: cls.statement,
        factTokens: contentTokens(cls.statement),
        salience: cls.salience * 1.15,
      });
    }

    // Exception MCQ: 3 true members + 1 verified non-member from the document/peers
    if (cls.members.length >= 3 && nonMembers.length > 0) {
      const exceptionAnswer = nonMembers.find(
        (cand) =>
          isOptionCompatible(cand, cls.members[0], cls.members.slice(0, 3), cls.category)
      );
      if (exceptionAnswer) {
        candidates.push({
          idKey: `cls-exc:${cls.category.toLowerCase()}:${exceptionAnswer.toLowerCase()}`,
          templateType: 'classification_exception',
          cognitiveLevel: 'conceptual',
          sectionKey,
          sectionHeading: cls.sectionHeading,
          pageNumber: cls.pageNumber,
          question: `Which of the following is NOT listed as a type or example of ${cls.category} in the material?`,
          correctAnswer: exceptionAnswer,
          distractors: cls.members.slice(0, 3),
          evidenceText: cls.statement,
          factTokens: contentTokens(cls.statement),
          salience: cls.salience * 1.16,
        });
      }
    }
  }

  // 8. Quantitative & Targeted Concept Cloze (ranked by TextRank salience)
  const allDocQuantities = Array.from(
    new Set(profile.units.flatMap((u) => u.quantitiesUnits))
  );

  const rankedUnits = [...profile.units].sort((a, b) => b.score - a.score);
  for (const unit of rankedUnits) {
    const cleanSent = cleanSnippet(stripBoilerplatePrefix(unit.formattedText), 185);
    if (cleanSent.length < 32) continue;
    const sectionKey =
      unit.sectionHeading ||
      (unit.pageNumber !== null ? `Page ${unit.pageNumber}` : 'Key Concepts');

    // 8A: Quantitative fact
    if (unit.quantitiesUnits.length > 0 && !/[=→⇌]/.test(cleanSent)) {
      const targetQty = unit.quantitiesUnits[0];
      if (cleanSent.includes(targetQty)) {
        const blanked = cleanSent.replace(targetQty, '_____');
        const qtyDistractors = generateQuantityDistractors(targetQty, allDocQuantities);
        if (qtyDistractors.length === 3) {
          candidates.push({
            idKey: `quant:${unit.fingerprint.slice(0, 36)}:${targetQty}`,
            templateType: 'quantitative_fact',
            cognitiveLevel: 'application',
            sectionKey,
            sectionHeading: unit.sectionHeading,
            pageNumber: unit.pageNumber,
            question: `Which value completes this statement from the study material: "${blanked}"?`,
            correctAnswer: targetQty,
            distractors: qtyDistractors,
            evidenceText: unit.formattedText,
            factTokens: unit.tokens,
            salience: unit.score * 1.15,
          });
        }
      }
    }

    // 8B: Targeted concept cloze
    if (/[=→⇌]/.test(cleanSent)) continue;
    const termPool = [...profile.keyPhrases, ...profile.keyTerminology];
    let targetTerm: string | null = null;
    for (const candidateTerm of termPool) {
      if (candidateTerm.length < 4 || candidateTerm.length > 36) continue;
      const escaped = candidateTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = cleanSent.match(new RegExp(`\\b(${escaped})\\b`, 'i'));
      if (match) {
        const exactInSentence = match[1];
        const replaced = cleanSent.replace(exactInSentence, '_______');
        if (!new RegExp(`\\b${escaped}\\b`, 'i').test(replaced)) {
          targetTerm = exactInSentence;
          break;
        }
      }
    }

    if (!targetTerm) {
      const sentenceWords = cleanSent.match(/\b[A-Za-z][a-zA-Z-]{5,28}\b/g) || [];
      let bestWord: string | null = null;
      let bestTf = -1;
      for (const w of sentenceWords) {
        const lowerW = w.toLowerCase();
        if (!unit.tokens.has(lowerW)) continue;
        const tf = profile.globalTermFreq.get(lowerW) || 1;
        if (tf > bestTf) {
          bestTf = tf;
          bestWord = w;
        }
      }
      if (bestWord) {
        const escaped = bestWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const replaced = cleanSent.replace(new RegExp(`\\b${escaped}\\b`), '_______');
        if (!new RegExp(`\\b${escaped}\\b`, 'i').test(replaced)) {
          targetTerm = bestWord;
        }
      }
    }

    if (targetTerm) {
      const escaped = targetTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const clozeStem = cleanSent.replace(new RegExp(`\\b${escaped}\\b`), '_______');
      const formattedTarget =
        targetTerm === targetTerm.toLowerCase() ? ucFirst(targetTerm) : targetTerm;
      const clozeDistractors = pickDistractorsFromPools(
        formattedTarget,
        [allEntityNames, subjectPeers, frequentDocNouns],
        3,
        formattedTarget,
        unit.tokens
      );

      if (clozeDistractors.length === 3) {
        candidates.push({
          idKey: `cloze:${unit.fingerprint.slice(0, 36)}:${targetTerm.toLowerCase()}`,
          templateType: 'targeted_cloze',
          cognitiveLevel: 'conceptual',
          sectionKey,
          sectionHeading: unit.sectionHeading,
          pageNumber: unit.pageNumber,
          question: `Which term correctly completes the statement from the study material: "${clozeStem}"?`,
          correctAnswer: formattedTarget,
          distractors: clozeDistractors,
          evidenceText: unit.formattedText,
          factTokens: unit.tokens,
          salience: unit.score * 0.92,
        });
      }
    }
  }

  return candidates;
}

function getCognitivePriorityRank(level: CognitiveLevel, difficulty: QuizDifficulty): number {
  if (difficulty === 'easy') {
    return level === 'recall' ? 3 : level === 'conceptual' ? 2 : 1;
  }
  if (difficulty === 'advanced') {
    return level === 'application' ? 3 : level === 'conceptual' ? 2 : 1;
  }
  if (difficulty === 'intermediate') {
    return level === 'conceptual' ? 3 : level === 'application' ? 2 : 1;
  }
  return 2; // 'mixed'
}

function selectCandidatesBalanced(
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

  const scoreCandidate = (c: QuizCandidate) =>
    getCognitivePriorityRank(c.cognitiveLevel, difficulty) * 100 + c.salience * 10;

  let ordered: QuizCandidate[];

  if (difficulty === 'mixed') {
    // Interleave recall / conceptual / application round-robin
    const buckets: Record<CognitiveLevel, QuizCandidate[]> = {
      recall: dedupedById
        .filter((c) => c.cognitiveLevel === 'recall')
        .sort((a, b) => b.salience - a.salience),
      conceptual: dedupedById
        .filter((c) => c.cognitiveLevel === 'conceptual')
        .sort((a, b) => b.salience - a.salience),
      application: dedupedById
        .filter((c) => c.cognitiveLevel === 'application')
        .sort((a, b) => b.salience - a.salience),
    };
    ordered = [];
    let idx = 0;
    while (ordered.length < dedupedById.length) {
      let pushed = false;
      for (const lvl of ['recall', 'conceptual', 'application'] as CognitiveLevel[]) {
        if (idx < buckets[lvl].length) {
          ordered.push(buckets[lvl][idx]);
          pushed = true;
        }
      }
      if (!pushed) break;
      idx++;
    }
  } else {
    ordered = [...dedupedById].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  }

  // Exam Mode: enforce broad coverage across all document sections/pages via round-robin
  if (assessmentMode === 'exam') {
    const bySection = new Map<string, QuizCandidate[]>();
    for (const cand of ordered) {
      const list = bySection.get(cand.sectionKey) || [];
      list.push(cand);
      bySection.set(cand.sectionKey, list);
    }

    const sectionQueues = Array.from(bySection.values());
    const interleaved: QuizCandidate[] = [];
    let depth = 0;
    while (interleaved.length < ordered.length) {
      let addedAny = false;
      for (const queue of sectionQueues) {
        if (depth < queue.length) {
          interleaved.push(queue[depth]);
          addedAny = true;
        }
      }
      if (!addedAny) break;
      depth++;
    }
    ordered = interleaved;
  }

  // Two-pass selection: Pass 1 avoids testing the exact same source fact twice; Pass 2 fills remaining quota only via distinct structured template types (never redundant cloze on an already-tested fact)
  const selected: QuizCandidate[] = [];
  const usedFactEntries: Array<{ tokens: Set<string>; templates: Set<string> }> = [];

  for (const cand of ordered) {
    if (selected.length >= questionCount) break;
    const matchIdx = usedFactEntries.findIndex((prev) => {
      const { jaccard, containment } = tokenSimilarity(cand.factTokens, prev.tokens);
      return jaccard >= 0.72 || containment >= 0.88;
    });
    if (matchIdx === -1) {
      selected.push(cand);
      usedFactEntries.push({
        tokens: cand.factTokens,
        templates: new Set([cand.templateType]),
      });
    }
  }

  if (selected.length < questionCount) {
    const selectedSet = new Set(selected);
    for (const cand of ordered) {
      if (selected.length >= questionCount) break;
      if (selectedSet.has(cand) || cand.templateType === 'targeted_cloze') continue;
      const sameFactCoveredBySameTemplate = usedFactEntries.some((prev) => {
        const { jaccard, containment } = tokenSimilarity(cand.factTokens, prev.tokens);
        return (jaccard >= 0.72 || containment >= 0.88) && prev.templates.has(cand.templateType);
      });
      if (!sameFactCoveredBySameTemplate) {
        selected.push(cand);
        selectedSet.add(cand);
      }
    }
  }

  return selected.slice(0, questionCount);
}

/**
 * Generates grounded, multi-dimensional objective (multiple-choice) questions directly
 * from extracted document text using the shared Document Intelligence Engine (zero AI API calls).
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

  // Require real readable academic content; never fabricate questions from thin/unreadable inputs
  if (profile.quality.alphaWordCount < 8 || profile.units.length === 0) {
    return [];
  }

  const assessmentMode = options?.assessmentMode === 'exam' ? 'exam' : 'practice';
  const candidates = buildCandidatesFromProfile(profile);
  const chosen = selectCandidatesBalanced(candidates, questionCount, difficulty, assessmentMode);

  return chosen.map((cand, index) => {
    const qNum = index + 1;
    const opts = [cand.correctAnswer, ...cand.distractors.slice(0, 3)];
    const targetIdx = deterministicHashInt(`${cand.question}|${cand.correctAnswer}`) % 4;
    if (targetIdx !== 0) {
      const tmp = opts[0];
      opts[0] = opts[targetIdx];
      opts[targetIdx] = tmp;
    }

    const topicTag =
      cand.pageNumber !== null
        ? `Page ${cand.pageNumber}`
        : cand.sectionHeading || profile.subjectArea || 'Study Material';

    const explanation = cand.sectionHeading
      ? `Section: ${cand.sectionHeading}. Explanation: ${cleanSnippet(cand.evidenceText, 180)}`
      : `Explanation: ${cleanSnippet(cand.evidenceText, 180)}`;

    return {
      id: `q-${qNum}`,
      number: qNum,
      type: 'objective',
      question: cand.question,
      options: opts,
      correctOptionIndex: targetIdx,
      expectedAnswer: opts[targetIdx],
      maxMarks: 1,
      explanation,
      topicTag,
      ...(cand.pageNumber !== null ? { pageNumber: cand.pageNumber } : {}),
    };
  });
}

/**
 * Builds a grounded academic baseline text when a student specifies a topic
 * without uploading a dedicated PDF or notes.
 */
export function getAcademicTopicPrimer(topicTitle: string): string {
  const clean = (topicTitle || 'Academic Studies').trim();
  const lower = clean.toLowerCase();

  // 1. Check curated educational visual database
  for (const item of CURATED_EDUCATIONAL_VISUALS) {
    if (item.matchPatterns.some((p) => p.test(clean) || p.test(lower))) {
      const labelSentences = (item.verifiedLabels || [])
        .map((l) => `${l.label} functions to ${l.detail || 'perform essential structural and operational roles'}.`)
        .join(' ');
      return `## ${item.conceptTitle}\n${clean} represents an essential domain within ${item.discipline}.\n${item.caption}\n${labelSentences}\nThis system exemplifies structured operational mechanisms, distinct functional tiers, and biological or physical regulation.`;
    }
  }

  // 2. Academic subject match from SUBJECT_LEXICONS
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

  // 3. Robust academic baseline for arbitrary scholarly topic
  return `## ${clean}\n${clean} is an established subject of academic study and curriculum inquiry.\nPrimary principles of ${clean} establish its foundational definitions, structural components, and practical applications.\nAnalysis of ${clean} examines cause-and-effect relationships, sequential mechanisms, and comparative criteria.\nScholarly evaluation of ${clean} requires distinguishing core operational features from secondary attributes across multiple perspectives.`;
}
