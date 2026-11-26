import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  ListChecks,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { AuthModalMode } from '../AuthModal';

interface RevealBlockProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}

function RevealBlock({ children, className = '', delayMs = 0 }: RevealBlockProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  });

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={`transition-all duration-700 ease-out will-change-transform ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-7 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

type SummaryTab = 'overview' | 'definitions' | 'formulas' | 'processes';
type TutorDepth = 'Beginner' | 'Standard' | 'Advanced';
type AssessmentMode = 'practice' | 'exam';

interface FeatureShowcasesProps {
  onOpenAuth: (mode: AuthModalMode) => void;
}

export function FeatureShowcases({ onOpenAuth }: FeatureShowcasesProps) {
  // Interactive Summarizer state
  const [summaryTab, setSummaryTab] = useState<SummaryTab>('overview');

  // Interactive Quiz & Exam state
  const [assessmentMode, setAssessmentMode] = useState<AssessmentMode>('practice');
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [submittedChoice, setSubmittedChoice] = useState<number | null>(null);

  // Interactive AI Chatbot prompt state
  const [chatPromptIndex, setChatPromptIndex] = useState<0 | 1>(0);

  // Interactive Personal Tutor depth & check state
  const [tutorDepth, setTutorDepth] = useState<TutorDepth>('Standard');
  const [tutorCheckAnswer, setTutorCheckAnswer] = useState<'yes' | 'unsure' | null>(null);

  const quizOptions = [
    {
      label: 'A',
      text: 'The reaction is endergonic and absorbs free energy from the surroundings.',
    },
    {
      label: 'B',
      text: 'The reaction is exergonic and can proceed spontaneously without net energy input.',
    },
    {
      label: 'C',
      text: 'The system has reached dynamic chemical equilibrium with zero net flux.',
    },
    {
      label: 'D',
      text: 'Enzymatic activation energy (Ea) becomes negative across the transition state.',
    },
  ];
  const correctQuizIndex = 1;

  const chatScenarios = [
    {
      question: 'How does ATP coupling drive thermodynamically unfavorable reactions?',
      sourceCitation: 'Page 7 · Bioenergetics & Coupled Pathways',
      sourceAnswer:
        'Cells pair an endergonic step (+ΔG) with ATP hydrolysis to ADP + Pi (−30.5 kJ/mol), yielding a net negative ΔG for the coupled pathway via a phosphorylated intermediate.',
      generalNote:
        'Enzymes lower activation energy without altering overall ΔG, allowing coupled reactions to proceed at physiological temperatures.',
    },
    {
      question: 'Where does the proton gradient form during oxidative phosphorylation?',
      sourceCitation: 'Page 14 · Chemiosmotic Electron Transport',
      sourceAnswer:
        'Complexes I, III, and IV pump H⁺ ions from the mitochondrial matrix into the intermembrane space, establishing the electrochemical proton-motive force across the inner membrane.',
      generalNote:
        'ATP synthase channels protons back down this gradient through its F₀ rotor, mechanically catalyzing ADP phosphorylation.',
    },
  ];

  const tutorContent: Record<
    TutorDepth,
    { stepTitle: string; explanation: string; example: string }
  > = {
    Beginner: {
      stepTitle: 'Step 2 of 4 · Understanding Free Energy Direction',
      explanation:
        'Think of ΔG as an energy hill. When products sit lower on the hill than reactants (negative ΔG), energy flows downhill naturally—just like ATP releasing energy when a phosphate bond is cleaved.',
      example: 'Analogy: Coupling ATP hydrolysis (−30.5 kJ/mol) pushes an uphill reaction (+13.8 kJ/mol) to a net downhill slope (−16.7 kJ/mol).',
    },
    Standard: {
      stepTitle: 'Step 2 of 4 · Thermodynamic Coupling via ΔG Additivity',
      explanation:
        'Because Gibbs free energy (ΔG = ΔH − TΔS) is a state function, sequential reaction steps are strictly additive. Coupling ATP hydrolysis drives phosphorylation of glucose in glycolysis Step 1.',
      example: 'Glucose + Pi → Glucose-6-P (+13.8 kJ/mol) + ATP → ADP + Pi (−30.5 kJ/mol) ⇒ Net ΔG°′ = −16.7 kJ/mol.',
    },
    Advanced: {
      stepTitle: 'Step 2 of 4 · Non-Standard Conditions & Mass Action Ratio',
      explanation:
        'In vivo spontaneity depends on actual cellular reactant concentrations via ΔG = ΔG°′ + RT ln(Q). Maintaining high [ATP]/[ADP][Pi] shifts effective hydrolysis closer to −50 kJ/mol.',
      example: 'At 310 K, a 10-fold shift in Q alters ΔG by RT ln(10) ≈ 5.9 kJ/mol, making near-equilibrium steps sensitive to substrate flux.',
    },
  };

  return (
    <div className="space-y-24 py-20 lg:space-y-32 lg:py-28">
      {/* 1. DOCUMENT SUMMARIZER SHOWCASE */}
      <section
        id="summarizer-showcase"
        aria-labelledby="summarizer-heading"
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
      >
        <RevealBlock className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-sky-400 uppercase">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Document Intelligence Engine</span>
            </div>
            <h2
              id="summarizer-heading"
              className="mt-3 font-display text-2xl font-bold tracking-tight text-white text-balance sm:text-4xl"
            >
              Dense PDFs distilled into structured, page-cited knowledge.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base academic-selectable">
              Our deterministic Document Intelligence Engine extracts section hierarchies, removes
              repetition, and organizes high-density Topic Overviews, Definitions, Formulas,
              and Mechanisms—with exact page citations preserved throughout.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                <span>Three study depths: Short, Detailed, and Comprehensive Study Notes.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                <span>Preserves scientific terminology, equations, numerical values, and units.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                <span>Processes PDFs, scanned notes, camera snaps, and lecture audio.</span>
              </li>
            </ul>
            <div className="mt-7">
              <button
                type="button"
                onClick={() => onOpenAuth('signup')}
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-sky-400 transition-colors hover:text-sky-300"
              >
                <span>Try Document Summarizer</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-slate-800/90 bg-[#0B1428] shadow-2xl shadow-blue-950/40">
              {/* Source Document Strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#081022] px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  <span className="font-mono text-xs font-medium text-slate-200">
                    Cellular_Bioenergetics_Ch06.pdf
                  </span>
                </div>
                <span className="font-mono text-xs text-slate-400">18 pages · Comprehensive Mode</span>
              </div>

              {/* Interactive Section Tabs */}
              <div
                role="tablist"
                aria-label="Document summary sections"
                className="flex flex-wrap gap-1.5 border-b border-slate-800/80 bg-[#0A1326] px-5 py-2.5"
              >
                {(
                  [
                    { id: 'overview', label: 'Topic Overview' },
                    { id: 'definitions', label: 'Definitions' },
                    { id: 'formulas', label: 'Formulas & Units' },
                    { id: 'processes', label: 'Processes' },
                  ] as const
                ).map((tab) => {
                  const active = summaryTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSummaryTab(tab.id)}
                      className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-blue-600/25 text-sky-300 ring-1 ring-sky-400/40'
                          : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Structured Output */}
              <div className="min-h-[240px] p-5 sm:p-6">
                {summaryTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-800/80 bg-[#0E1932] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-sm font-semibold text-white">
                          1. Energy Coupling &amp; Gibbs Free Energy
                        </h3>
                        <span className="font-mono text-xs text-sky-400">Page 4</span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-300 sm:text-sm academic-selectable">
                        Metabolic pathways sustain endergonic biosynthesis by coupling unfavorable
                        reactions (+ΔG) with exergonic ATP hydrolysis (−30.5 kJ/mol), yielding an
                        overall spontaneous reaction profile.
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800/80 bg-[#0E1932] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-sm font-semibold text-white">
                          2. Chemiosmotic Gradient &amp; ATP Synthase
                        </h3>
                        <span className="font-mono text-xs text-sky-400">Page 11</span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-300 sm:text-sm academic-selectable">
                        Electron transport complexes pump H⁺ across the inner mitochondrial
                        membrane, converting redox potential into a proton-motive gradient used to
                        phosphorylate ADP.
                      </p>
                    </div>
                  </div>
                )}

                {summaryTab === 'definitions' && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-800/80 bg-[#0E1932] p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm font-semibold text-sky-300">
                          Exergonic Reaction
                        </span>
                        <span className="font-mono text-xs text-slate-400">Page 3</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-300 sm:text-sm">
                        A chemical process with net negative free energy change (ΔG &lt; 0),
                        releasing usable work energy as reactants convert to lower-energy products.
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800/80 bg-[#0E1932] p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm font-semibold text-violet-300">
                          Substrate-Level Phosphorylation
                        </span>
                        <span className="font-mono text-xs text-slate-400">Page 8</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-300 sm:text-sm">
                        Direct enzymatic transfer of a phosphate group from a high-energy metabolic
                        intermediate onto ADP to form ATP without an electron transport chain.
                      </p>
                    </div>
                  </div>
                )}

                {summaryTab === 'formulas' && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-800/80 bg-[#0E1932] p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold text-sky-300">
                          ΔG = ΔH − T·ΔS
                        </span>
                        <span className="font-mono text-xs text-slate-400">Page 4</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-300">
                        Units: ΔG &amp; ΔH in kJ/mol, Temperature T in Kelvin (K), Entropy ΔS in
                        J/(mol·K).
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800/80 bg-[#0E1932] p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold text-violet-300">
                          ATP + H₂O → ADP + Pi (ΔG°′ = −30.5 kJ/mol)
                        </span>
                        <span className="font-mono text-xs text-slate-400">Page 7</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-300">
                        Standard biochemical conditions defined at pH 7.0, 298 K, and 1 M initial
                        solutes.
                      </p>
                    </div>
                  </div>
                )}

                {summaryTab === 'processes' && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-800/80 bg-[#0E1932] p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm font-semibold text-white">
                          Oxidative Phosphorylation Sequence
                        </span>
                        <span className="font-mono text-xs text-sky-400">Pages 12–15</span>
                      </div>
                      <ol className="mt-2.5 space-y-2 text-xs text-slate-300 sm:text-sm">
                        <li>1. NADH and FADH₂ donate high-energy electrons to Complexes I &amp; II.</li>
                        <li>2. Redox energy pumps H⁺ ions into the intermembrane space.</li>
                        <li>3. O₂ acts as terminal electron acceptor forming H₂O at Complex IV.</li>
                        <li>4. Proton flux through ATP synthase drives ADP + Pi → ATP.</li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </RevealBlock>
      </section>

      {/* 2. QUIZ & EXAM SYSTEM SHOWCASE */}
      <section
        id="assessment-showcase"
        aria-labelledby="assessment-heading"
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
      >
        <RevealBlock className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="order-2 lg:order-1 lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-slate-800/90 bg-[#0B1428] shadow-2xl shadow-blue-950/40">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#081022] px-5 py-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <ListChecks className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  <span>Question 4 of 20 · Thermodynamics</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-lg bg-[#0E1932] p-1">
                  <button
                    type="button"
                    onClick={() => setAssessmentMode('practice')}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                      assessmentMode === 'practice'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Practice Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssessmentMode('exam')}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                      assessmentMode === 'exam'
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    <span>Timed Exam</span>
                  </button>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                {assessmentMode === 'exam' && (
                  <div className="mb-4 flex items-center justify-between rounded-lg border border-violet-500/30 bg-violet-950/30 px-3.5 py-2 text-xs text-violet-200">
                    <span>Exam Timer Active · Server-Checked Grading</span>
                    <span className="font-mono font-semibold tabular-nums">18:42 remaining</span>
                  </div>
                )}

                <p className="font-display text-base font-semibold text-white sm:text-lg academic-selectable">
                  If ΔG°′ is −30.5 kJ/mol for ATP hydrolysis under standard cellular conditions,
                  what does this indicate about the reaction energetics?
                </p>

                <div className="mt-4 space-y-2.5">
                  {quizOptions.map((opt, idx) => {
                    const isSelected = selectedChoice === idx;
                    const isSubmitted = submittedChoice !== null;
                    const isCorrectOpt = idx === correctQuizIndex;
                    const showCorrectHighlight =
                      isSubmitted && assessmentMode === 'practice' && isCorrectOpt;
                    const showWrongHighlight =
                      isSubmitted &&
                      assessmentMode === 'practice' &&
                      submittedChoice === idx &&
                      !isCorrectOpt;

                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          if (submittedChoice === null) setSelectedChoice(idx);
                        }}
                        disabled={submittedChoice !== null}
                        className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left text-xs transition-colors sm:text-sm ${
                          showCorrectHighlight
                            ? 'border-emerald-500/70 bg-emerald-950/40 text-emerald-100'
                            : showWrongHighlight
                            ? 'border-rose-500/70 bg-rose-950/40 text-rose-100'
                            : isSelected
                            ? 'border-sky-400 bg-blue-950/50 text-white'
                            : 'border-slate-800 bg-[#0E1932] text-slate-300 hover:border-slate-700 hover:text-white'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold ${
                            showCorrectHighlight
                              ? 'bg-emerald-500 text-slate-950'
                              : showWrongHighlight
                              ? 'bg-rose-500 text-white'
                              : isSelected
                              ? 'bg-sky-400 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {opt.label}
                        </span>
                        <span className="pt-0.5 leading-snug">{opt.text}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  {submittedChoice === null ? (
                    <button
                      type="button"
                      disabled={selectedChoice === null}
                      onClick={() => {
                        if (selectedChoice !== null) setSubmittedChoice(selectedChoice);
                      }}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
                    >
                      Submit Answer
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChoice(null);
                        setSubmittedChoice(null);
                      }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reset Question</span>
                    </button>
                  )}
                  <span className="font-mono text-xs text-slate-400">
                    Answers verified on submission
                  </span>
                </div>

                {submittedChoice !== null && (
                  <div
                    className={`mt-4 rounded-xl border p-4 text-xs leading-relaxed ${
                      assessmentMode === 'exam'
                        ? 'border-violet-500/40 bg-violet-950/30 text-violet-100'
                        : submittedChoice === correctQuizIndex
                        ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-100'
                        : 'border-sky-500/40 bg-sky-950/30 text-slate-200'
                    }`}
                  >
                    {assessmentMode === 'exam' ? (
                      <p>
                        Answer locked for final exam grading. Full question-by-question review,
                        explanations, and topic breakdowns unlock upon exam submission.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 font-semibold">
                          {submittedChoice === correctQuizIndex ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                              <span className="text-emerald-300">Correct · Option B</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 text-rose-400" aria-hidden="true" />
                              <span className="text-rose-300">Correct Answer: Option B</span>
                            </>
                          )}
                          <span className="ml-auto font-mono text-sky-400">Source: Page 7</span>
                        </div>
                        <p className="text-slate-300">
                          A negative ΔG indicates an exergonic reaction that releases free energy and
                          can drive coupled cellular work without external energy input.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2 lg:col-span-5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-violet-400 uppercase">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              <span>Quiz &amp; Exam Maker</span>
            </div>
            <h2
              id="assessment-heading"
              className="mt-3 font-display text-2xl font-bold tracking-tight text-white text-balance sm:text-4xl"
            >
              5 to 70 targeted questions from your own notes.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base academic-selectable">
              Generate objective A/B/C/D quizzes or timed exams straight from your uploaded study
              materials. Correct answers remain hidden until submitted, followed by instant scoring,
              explanations, source page citations, and saved attempt history.
            </p>
            <div className="mt-7">
              <button
                type="button"
                onClick={() => onOpenAuth('signup')}
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
              >
                <span>Build a Practice Quiz</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </RevealBlock>
      </section>

      {/* 3. ACADEMIC AI CHATBOT & PERSONAL AI TUTOR SHOWCASE */}
      <section
        id="learning-showcase"
        aria-labelledby="learning-heading"
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
      >
        <RevealBlock className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-sky-400 uppercase">
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            <span>Hybrid AI Learning Layer</span>
          </div>
          <h2
            id="learning-heading"
            className="mt-3 font-display text-2xl font-bold tracking-tight text-white text-balance sm:text-4xl"
          >
            Source-grounded AI chat and adaptive personal tutoring.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base academic-selectable">
            Retrieved passages from your documents ground every AI conversation—separating exact
            material citations from broader academic explanations and step-by-step coaching.
          </p>
        </RevealBlock>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* AI Chatbot Interactive Preview */}
          <RevealBlock delayMs={80}>
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800/90 bg-[#0B1428] shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 bg-[#081022] px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <MessageSquareText className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  <h3 className="font-display text-sm font-semibold text-white">
                    Academic AI Chatbot
                  </h3>
                </div>
                <span className="font-mono text-xs text-sky-400">Page-Cited RAG</span>
              </div>

              <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
                <div>
                  <p className="text-xs font-medium text-slate-400">Select a sample study query:</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {chatScenarios.map((item, idx) => {
                      const active = chatPromptIndex === idx;
                      return (
                        <button
                          key={item.question}
                          type="button"
                          onClick={() => setChatPromptIndex(idx as 0 | 1)}
                          className={`rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                            active
                              ? 'border-sky-400/60 bg-sky-500/15 text-sky-200'
                              : 'border-slate-800 bg-[#0E1932] text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {idx === 0 ? 'ATP Coupling Mechanism' : 'Proton Gradient Origin'}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 space-y-3.5">
                    <div className="ml-auto max-w-[88%] rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-xs leading-relaxed text-white sm:text-sm">
                      {chatScenarios[chatPromptIndex].question}
                    </div>

                    <div className="space-y-3 rounded-xl border border-slate-800 bg-[#0E1932] p-4">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-sky-300">
                          <span className="inline-flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                            From Your Material
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {chatScenarios[chatPromptIndex].sourceCitation}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-200 sm:text-sm academic-selectable">
                          {chatScenarios[chatPromptIndex].sourceAnswer}
                        </p>
                      </div>

                      <div className="border-t border-slate-800/80 pt-3">
                        <p className="text-xs font-semibold text-violet-300">
                          General Academic Context
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">
                          {chatScenarios[chatPromptIndex].generalNote}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </RevealBlock>

          {/* Personal AI Tutor Interactive Preview */}
          <RevealBlock delayMs={160}>
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800/90 bg-[#0B1428] shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#081022] px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <GraduationCap className="h-4 w-4 text-violet-400" aria-hidden="true" />
                  <h3 className="font-display text-sm font-semibold text-white">
                    Personal AI Tutor
                  </h3>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-[#0E1932] p-1">
                  {(['Beginner', 'Standard', 'Advanced'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setTutorDepth(level)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                        tutorDepth === level
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
                <div className="space-y-4">
                  <div>
                    <p className="font-mono text-xs font-medium text-violet-300">
                      {tutorContent[tutorDepth].stepTitle}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-200 sm:text-sm academic-selectable">
                      {tutorContent[tutorDepth].explanation}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0E1932] p-3.5">
                    <p className="text-xs font-semibold text-sky-300">Worked Example</p>
                    <p className="mt-1 font-mono text-xs leading-relaxed text-slate-300">
                      {tutorContent[tutorDepth].example}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-violet-500/30 bg-violet-950/20 p-4">
                  <p className="text-xs font-semibold text-white">
                    Knowledge Check: Why must net ΔG remain negative for a coupled pathway?
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTutorCheckAnswer('yes')}
                      className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        tutorCheckAnswer === 'yes'
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-700 bg-[#0B1428] text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      To remain thermodynamically favorable
                    </button>
                    <button
                      type="button"
                      onClick={() => setTutorCheckAnswer('unsure')}
                      className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        tutorCheckAnswer === 'unsure'
                          ? 'bg-sky-600 text-white'
                          : 'border border-slate-700 bg-[#0B1428] text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      Walk me through another clue
                    </button>
                  </div>
                  {tutorCheckAnswer && (
                    <p className="mt-2.5 text-xs text-slate-300">
                      {tutorCheckAnswer === 'yes'
                        ? 'Exactly right — only reactions with net ΔG < 0 proceed spontaneously. Ready for Step 3: Enzyme Kinetics.'
                        : 'Hint: Add the positive ΔG of product formation to −30.5 kJ/mol from ATP cleavage—check if the sum stays below zero.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </RevealBlock>
        </div>
      </section>
    </div>
  );
}
