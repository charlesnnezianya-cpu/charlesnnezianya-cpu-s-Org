import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileDown,
  Layers,
  ListChecks,
} from 'lucide-react';
import { exportSummaryToPdf } from '../lib/pdfExport';
import { sanitizeStructuredSummary } from '../lib/summarySanitizer';
import type { StructuredSummary, SummaryLevel, SummaryVisualTargetSection } from '../types/brainstine';
import { DocumentFlashcardsModal } from './DocumentFlashcardsModal';
import { EducationalDiagramRenderer } from './EducationalDiagramRenderer';
import { ScientificText } from './ScientificText';
import { SummaryVisualBlock } from './SummaryVisualBlock';

interface SummaryDisplayProps {
  summary: StructuredSummary;
  onSave?: () => Promise<void> | void;
  isSaving?: boolean;
  isSaved?: boolean;
  onCreateQuizFromSummary?: () => void;
}

const LEVEL_LABELS: Record<SummaryLevel, string> = {
  short: 'Short Summary',
  detailed: 'Detailed Summary',
  comprehensive: 'Comprehensive Study Notes',
};

type SectionKey =
  | 'overview'
  | 'concepts'
  | 'definitions'
  | 'classifications'
  | 'characteristics'
  | 'processes'
  | 'formulas'
  | 'facts'
  | 'examples'
  | 'comparisons'
  | 'distinctions'
  | 'diagrams'
  | 'difficult'
  | 'terminology'
  | 'revision'
  | 'recap'
  | 'takeaways';

const ALL_SECTIONS: SectionKey[] = [
  'overview',
  'concepts',
  'definitions',
  'classifications',
  'characteristics',
  'processes',
  'formulas',
  'facts',
  'examples',
  'comparisons',
  'distinctions',
  'diagrams',
  'difficult',
  'terminology',
  'revision',
  'recap',
  'takeaways',
];

export function SummaryDisplay({
  summary: rawSummary,
  onSave,
  isSaving = false,
  isSaved = false,
  onCreateQuizFromSummary,
}: SummaryDisplayProps) {
  const summary = useMemo(() => sanitizeStructuredSummary(rawSummary), [rawSummary]);
  const [copied, setCopied] = useState(false);
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>({
    overview: true,
    concepts: true,
    definitions: true,
    classifications: true,
    characteristics: true,
    processes: true,
    formulas: true,
    facts: true,
    examples: true,
    comparisons: true,
    distinctions: true,
    diagrams: true,
    difficult: true,
    terminology: true,
    revision: true,
    recap: true,
    takeaways: true,
  });

  const allExpanded = ALL_SECTIONS.every((key) => expandedSections[key]);

  const toggleAllSections = () => {
    const nextState = !allExpanded;
    const updated = {} as Record<SectionKey, boolean>;
    for (const key of ALL_SECTIONS) {
      updated[key] = nextState;
    }
    setExpandedSections(updated);
  };

  const toggleSection = (key: SectionKey) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const renderSectionHeader = (key: SectionKey, title: string, count?: number) => {
    const isOpen = expandedSections[key];
    return (
      <button
        type="button"
        onClick={() => toggleSection(key)}
        aria-expanded={isOpen}
        className="flex min-h-11 w-full items-center justify-between gap-4 py-3.5 text-left transition-colors hover:text-blue-700 select-none sm:py-4 dark:hover:text-cyan-400"
      >
        <div className="flex items-baseline gap-2.5">
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h3>
          {typeof count === 'number' && count > 0 && (
            <span className="font-mono text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
              {count}
            </span>
          )}
        </div>
        <span className="text-slate-400 dark:text-slate-500">
          {isOpen ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>
    );
  };

  const classifications = summary.classificationsAndTypes ?? [];
  const characteristics = summary.characteristicsAndExplanations ?? [];
  const processes = summary.processesAndMechanisms ?? [];
  const distinctions = summary.importantDistinctions ?? [];
  const finalRecap = summary.finalRecap ?? [];
  const comparisons = summary.comparisonTables ?? [];
  const diagrams = summary.visualDiagrams ?? [];
  const visualAids = summary.visualAids ?? [];

  const getVisualsForSection = (section: SummaryVisualTargetSection, index?: number) =>
    visualAids.filter(
      (v) => v.targetSection === section && (index === undefined || (v.targetIndex ?? 0) === index)
    );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0D162B]">
      {/* Document Header & Actions */}
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7 sm:py-6 lg:flex-row lg:items-start dark:border-slate-800">
        <div className="min-w-0 max-w-[74ch]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 select-none dark:text-slate-400">
            <span className="font-semibold text-blue-700 dark:text-cyan-400">
              {summary.subjectArea}
            </span>
            <span aria-hidden="true">·</span>
            <span>{LEVEL_LABELS[summary.summaryLevel]}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {summary.wordCount.toLocaleString()} words
            </span>
          </div>
          <h2 className="mt-2 font-display text-xl font-bold tracking-tight text-slate-900 academic-selectable sm:text-2xl dark:text-white">
            <ScientificText text={summary.title} />
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 select-none">
          <button
            type="button"
            onClick={toggleAllSections}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 sm:min-h-8 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>

          <button
            type="button"
            onClick={handleCopySummary}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 sm:min-h-8 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={() => exportSummaryToPdf(summary)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 sm:min-h-8 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export PDF</span>
          </button>

          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || isSaved}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:min-h-8 ${
                isSaved
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-[#0F1E3D] text-white hover:bg-[#192F5D] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500'
              }`}
            >
              {isSaved ? (
                <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{isSaved ? 'Saved' : isSaving ? 'Saving...' : 'Save Summary'}</span>
            </button>
          )}

          {onCreateQuizFromSummary && (
            <button
              type="button"
              onClick={onCreateQuizFromSummary}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0 sm:min-h-8 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-cyan-300 dark:hover:bg-blue-950"
            >
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Test Myself</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setFlashcardsOpen(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 sm:min-h-8 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Flashcards</span>
          </button>
        </div>
      </header>

      {/* Honest Completeness / Source Quality Notice */}
      {summary.sourceNotice && (
        <div className="flex items-start gap-2.5 border-b border-slate-200 bg-amber-50/60 px-5 py-3 text-xs leading-relaxed text-amber-900 sm:px-7 dark:border-slate-800 dark:bg-amber-950/25 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span className="max-w-[74ch]">{summary.sourceNotice}</span>
        </div>
      )}

      {/* Clean Structured Academic Study Reader (Sections A–H) */}
      <div className="divide-y divide-slate-200/90 px-5 sm:px-7 dark:divide-slate-800/90">
        {/* A. Topic Overview */}
        {summary.topicOverview && (
          <section>
            {renderSectionHeader('overview', 'Topic Overview')}
            {expandedSections.overview && (
              <div className="pb-6 max-w-[74ch]">
                <p className="text-[15px] leading-[1.7] text-slate-800 academic-selectable dark:text-slate-200">
                  <ScientificText text={summary.topicOverview} />
                </p>
                {getVisualsForSection('overview').map((vis) => (
                  <SummaryVisualBlock key={vis.id} visual={vis} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* B. Main Concepts */}
        {summary.mainConcepts.length > 0 && (
          <section>
            {renderSectionHeader('concepts', 'Main Concepts', summary.mainConcepts.length)}
            {expandedSections.concepts && (
              <div className="space-y-6 pb-6 max-w-[74ch]">
                {summary.mainConcepts.map((concept, idx) => (
                  <div key={idx} className="space-y-2.5">
                    <h4 className="font-display text-[15px] font-semibold text-slate-900 select-text dark:text-white">
                      <span className="mr-2 font-mono text-xs text-blue-700 select-none tabular-nums dark:text-cyan-400">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <ScientificText text={concept.heading} />
                    </h4>

                    {concept.sourcePoints.length > 0 && (
                      <ul className="space-y-2 pl-6">
                        {concept.sourcePoints.map((pt, pIdx) => (
                          <li
                            key={pIdx}
                            className="relative text-sm leading-[1.7] text-slate-700 academic-selectable dark:text-slate-300"
                          >
                            <span
                              className="absolute -left-4 top-0 text-slate-400 select-none dark:text-slate-500"
                              aria-hidden="true"
                            >
                              –
                            </span>
                            <ScientificText text={pt} />
                          </li>
                        ))}
                      </ul>
                    )}

                    {concept.subsections && concept.subsections.length > 0 && (
                      <div className="mt-2.5 space-y-3 pl-6">
                        {concept.subsections.map((sub, sIdx) => (
                          <div key={sIdx}>
                            <h5 className="font-display text-xs font-semibold tracking-wide text-slate-800 dark:text-slate-200">
                              <ScientificText text={sub.heading} />
                            </h5>
                            <ul className="mt-1 space-y-1.5 pl-4">
                              {sub.points.map((subPt, spIdx) => (
                                <li
                                  key={spIdx}
                                  className="relative text-sm leading-[1.68] text-slate-700 academic-selectable dark:text-slate-300"
                                >
                                  <span
                                    className="absolute -left-3.5 top-0 text-slate-400 select-none dark:text-slate-500"
                                    aria-hidden="true"
                                  >
                                    –
                                  </span>
                                  <ScientificText text={subPt} />
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}

                    {concept.examples && concept.examples.length > 0 && (
                      <div className="ml-6 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
                        <p className="font-display text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {concept.examples.length > 1 ? 'Examples' : 'Example'}
                        </p>
                        <ul className="mt-1 space-y-1.5">
                          {concept.examples.map((ex, eIdx) => (
                            <li
                              key={eIdx}
                              className="text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300"
                            >
                              <ScientificText text={ex} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {getVisualsForSection('concepts', idx).map((vis) => (
                      <SummaryVisualBlock key={vis.id} visual={vis} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* C. Definitions */}
        {summary.importantDefinitions.length > 0 && (
          <section>
            {renderSectionHeader(
              'definitions',
              'Definitions',
              summary.importantDefinitions.length
            )}
            {expandedSections.definitions && (
              <dl className="space-y-3 pb-6 max-w-[74ch]">
                {summary.importantDefinitions.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 text-sm leading-[1.68] text-slate-700 academic-selectable dark:border-slate-800/90 dark:bg-slate-900/35 dark:text-slate-300"
                  >
                    <dt className="inline font-display font-semibold text-slate-900 dark:text-white">
                      <ScientificText text={item.term} />
                    </dt>
                    <span className="mx-1.5 text-slate-400" aria-hidden="true">
                      —
                    </span>
                    <dd className="inline">
                      <ScientificText text={item.definition} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}

        {/* D. Classifications and Types */}
        {classifications.length > 0 && (
          <section>
            {renderSectionHeader(
              'classifications',
              'Classifications and Types',
              classifications.length
            )}
            {expandedSections.classifications && (
              <div className="space-y-6 pb-6 max-w-[74ch]">
                {classifications.map((cls, cIdx) => (
                  <div key={cIdx} className="space-y-3">
                    <div>
                      <h4 className="font-display text-[15px] font-semibold text-slate-900 dark:text-white">
                        <ScientificText text={cls.topic} />
                      </h4>
                      <p className="mt-1 text-sm leading-[1.68] text-slate-700 academic-selectable dark:text-slate-300">
                        <ScientificText text={cls.overviewStatement} />
                      </p>
                    </div>

                    <div className="space-y-3 pl-2 sm:pl-4">
                      {cls.types.map((typeItem, tIdx) => (
                        <div
                          key={tIdx}
                          className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900/35"
                        >
                          <h5 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                            <span className="mr-2 font-mono text-xs text-blue-700 select-none tabular-nums dark:text-cyan-400">
                              {tIdx + 1}.
                            </span>
                            <ScientificText text={typeItem.name} />
                          </h5>

                          <p className="mt-1.5 text-sm leading-[1.68] text-slate-700 academic-selectable dark:text-slate-300">
                            <ScientificText text={typeItem.explanation} />
                          </p>

                          {typeItem.characteristics && typeItem.characteristics.length > 0 && (
                            <div className="mt-2.5">
                              <span className="font-display text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Characteristics:
                              </span>
                              <ul className="mt-1 space-y-1 pl-4">
                                {typeItem.characteristics.map((ch, chIdx) => (
                                  <li
                                    key={chIdx}
                                    className="relative text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300"
                                  >
                                    <span
                                      className="absolute -left-3.5 top-0 text-slate-400 select-none dark:text-slate-500"
                                      aria-hidden="true"
                                    >
                                      –
                                    </span>
                                    <ScientificText text={ch} />
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {typeItem.examples && typeItem.examples.length > 0 && (
                            <div className="mt-2.5">
                              <span className="font-display text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {typeItem.examples.length > 1 ? 'Examples:' : 'Example:'}
                              </span>
                              <ul className="mt-1 space-y-1 pl-4">
                                {typeItem.examples.map((ex, exIdx) => (
                                  <li
                                    key={exIdx}
                                    className="relative text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300"
                                  >
                                    <span
                                      className="absolute -left-3.5 top-0 text-slate-400 select-none dark:text-slate-500"
                                      aria-hidden="true"
                                    >
                                      –
                                    </span>
                                    <ScientificText text={ex} />
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {cls.comparisonNote && (
                      <p className="pl-2 sm:pl-4 text-sm leading-[1.68] text-slate-700 academic-selectable dark:text-slate-300">
                        <strong className="font-display font-semibold text-slate-900 dark:text-white">
                          Comparison:{' '}
                        </strong>
                        <ScientificText text={cls.comparisonNote} />
                      </p>
                    )}

                    {getVisualsForSection('classifications', cIdx).map((vis) => (
                      <SummaryVisualBlock key={vis.id} visual={vis} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* E. Characteristics and Explanations */}
        {characteristics.length > 0 && (
          <section>
            {renderSectionHeader(
              'characteristics',
              'Characteristics and Explanations',
              characteristics.reduce((sum, c) => sum + c.points.length, 0)
            )}
            {expandedSections.characteristics && (
              <div className="space-y-4 pb-6 max-w-[74ch]">
                {characteristics.map((group, idx) => (
                  <div key={idx}>
                    {characteristics.length > 1 && (
                      <h4 className="mb-1.5 font-display text-sm font-semibold text-slate-900 dark:text-white">
                        <ScientificText text={group.topic} />
                      </h4>
                    )}
                    <ul className="space-y-2 pl-5">
                      {group.points.map((pt, pIdx) => (
                        <li
                          key={pIdx}
                          className="relative text-sm leading-[1.7] text-slate-700 academic-selectable dark:text-slate-300"
                        >
                          <span
                            className="absolute -left-4 top-0 text-slate-400 select-none dark:text-slate-500"
                            aria-hidden="true"
                          >
                            –
                          </span>
                          <ScientificText text={pt} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* E2. Processes & Mechanisms */}
        {processes.length > 0 && (
          <section>
            {renderSectionHeader('processes', 'Processes & Mechanisms', processes.length)}
            {expandedSections.processes && (
              <div className="space-y-4 pb-6 max-w-[74ch]">
                {processes.map((proc, idx) => (
                  <div key={idx}>
                    {processes.length > 1 && (
                      <h4 className="mb-2 font-display text-sm font-semibold text-slate-900 dark:text-white">
                        <ScientificText text={proc.heading} />
                      </h4>
                    )}
                    <ol className="space-y-2">
                      {proc.steps.map((step, sIdx) => (
                        <li
                          key={sIdx}
                          className="flex items-start gap-2.5 text-sm leading-[1.7] text-slate-700 academic-selectable dark:text-slate-300"
                        >
                          <span className="mt-0.5 font-mono text-xs font-semibold text-blue-700 select-none tabular-nums dark:text-cyan-400">
                            {sIdx + 1}.
                          </span>
                          <span>
                            <ScientificText text={step} />
                          </span>
                        </li>
                      ))}
                    </ol>

                    {getVisualsForSection('processes', idx).map((vis) => (
                      <SummaryVisualBlock key={vis.id} visual={vis} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* E3. Formulas & Equations */}
        {summary.formulasOrFrameworks.length > 0 && (
          <section>
            {renderSectionHeader(
              'formulas',
              'Formulas & Equations',
              summary.formulasOrFrameworks.length
            )}
            {expandedSections.formulas && (
              <div className="space-y-3 pb-6 max-w-[74ch]">
                {summary.formulasOrFrameworks.map((formula, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200/90 bg-slate-50/70 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <span className="font-display text-xs font-semibold tracking-wide text-slate-600 select-text dark:text-slate-300">
                        <ScientificText text={formula.name} />
                      </span>
                      <span className="font-sans text-base font-semibold tracking-wide text-slate-900 academic-selectable dark:text-cyan-300">
                        <ScientificText text={formula.expressionOrStructure} />
                      </span>
                    </div>
                    {formula.usage && (
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600 academic-selectable dark:text-slate-400">
                        <ScientificText text={formula.usage} />
                      </p>
                    )}
                    {formula.variables && formula.variables.length > 0 && (
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 academic-selectable dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Variables:{' '}
                        </span>
                        {formula.variables.map((v, vIdx) => (
                          <React.Fragment key={vIdx}>
                            {vIdx > 0 && <span className="mx-1.5 text-slate-400">·</span>}
                            <strong className="font-semibold text-slate-800 dark:text-slate-200">
                              <ScientificText text={v.symbol} />
                            </strong>
                            {' = '}
                            <ScientificText text={v.meaning} />
                          </React.Fragment>
                        ))}
                      </p>
                    )}

                    {getVisualsForSection('formulas', idx).map((vis) => (
                      <SummaryVisualBlock key={vis.id} visual={vis} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* E4. Additional Key Details (Non-redundant factual specifics) */}
        {summary.importantFacts.length > 0 && (
          <section>
            {renderSectionHeader('facts', 'Additional Key Details', summary.importantFacts.length)}
            {expandedSections.facts && (
              <ul className="space-y-2 pb-6 pl-5 max-w-[74ch]">
                {summary.importantFacts.map((fact, idx) => (
                  <li
                    key={idx}
                    className="relative text-sm leading-[1.7] text-slate-700 academic-selectable dark:text-slate-300"
                  >
                    <span
                      className="absolute -left-4 top-0 text-slate-400 select-none dark:text-slate-500"
                      aria-hidden="true"
                    >
                      –
                    </span>
                    <ScientificText text={fact} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* F. Examples */}
        {summary.relevantExamples.length > 0 && (
          <section>
            {renderSectionHeader('examples', 'Examples', summary.relevantExamples.length)}
            {expandedSections.examples && (
              <div className="space-y-3 pb-6 max-w-[74ch]">
                {summary.relevantExamples.map((ex, idx) => (
                  <p
                    key={idx}
                    className="text-sm leading-[1.7] text-slate-700 academic-selectable dark:text-slate-300"
                  >
                    <strong className="font-display font-semibold text-slate-900 dark:text-white">
                      <ScientificText text={ex.title} />
                    </strong>
                    <span className="mx-1.5 text-slate-400" aria-hidden="true">
                      —
                    </span>
                    <ScientificText text={ex.example} />
                  </p>
                ))}
              </div>
            )}
          </section>
        )}

        {/* G. Comparisons (Tables & Distinctions) */}
        {comparisons.length > 0 && (
          <section>
            {renderSectionHeader('comparisons', 'Comparisons', comparisons.length)}
            {expandedSections.comparisons && (
              <div className="space-y-4 pb-6">
                {comparisons.map((table, tIdx) => (
                  <div
                    key={tIdx}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                      <h4 className="font-display text-xs font-semibold text-slate-900 dark:text-white">
                        <ScientificText text={table.title} />
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] border-collapse text-left text-xs sm:text-sm academic-selectable">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40">
                            <th className="px-4 py-2.5 font-display text-xs font-semibold text-slate-900 dark:text-white">
                              Criterion
                            </th>
                            {table.headers.map((h, hIdx) => (
                              <th
                                key={hIdx}
                                className="px-4 py-2.5 font-display text-xs font-semibold text-slate-900 dark:text-white"
                              >
                                <ScientificText text={h} />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {table.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="align-top">
                              <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                                <ScientificText text={row.criterion} />
                              </td>
                              {row.values.map((val, vIdx) => (
                                <td
                                  key={vIdx}
                                  className="px-4 py-2.5 leading-relaxed text-slate-700 dark:text-slate-300"
                                >
                                  <ScientificText text={val} />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {distinctions.length > 0 && (
          <section>
            {renderSectionHeader('distinctions', 'Key Distinctions', distinctions.length)}
            {expandedSections.distinctions && (
              <div className="space-y-3 pb-6 max-w-[74ch]">
                {distinctions.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 text-sm leading-[1.68] text-slate-700 academic-selectable dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300"
                  >
                    <span className="font-display font-semibold text-slate-900 dark:text-white">
                      <ScientificText text={item.pairTitle} />
                      {': '}
                    </span>
                    <ScientificText text={item.comparison} />
                    {getVisualsForSection('distinctions', idx).map((vis) => (
                      <SummaryVisualBlock key={vis.id} visual={vis} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {diagrams.length > 0 && (
          <section>
            {renderSectionHeader('diagrams', 'Diagrams & Schematics', diagrams.length)}
            {expandedSections.diagrams && (
              <div className="space-y-4 pb-6">
                {diagrams.map((diag, idx) => (
                  <EducationalDiagramRenderer key={idx} spec={diag} />
                ))}
              </div>
            )}
          </section>
        )}

        {summary.difficultConceptExplanations.length > 0 && (
          <section>
            {renderSectionHeader(
              'difficult',
              'Concept Clarifications',
              summary.difficultConceptExplanations.length
            )}
            {expandedSections.difficult && (
              <div className="space-y-3 pb-6 max-w-[74ch]">
                {summary.difficultConceptExplanations.map((item, idx) => (
                  <div
                    key={idx}
                    className="text-sm leading-[1.7] text-slate-700 academic-selectable dark:text-slate-300"
                  >
                    <strong className="font-display font-semibold text-slate-900 dark:text-white">
                      <ScientificText text={item.concept} />
                      {': '}
                    </strong>
                    <ScientificText text={item.sourceContext} />{' '}
                    {item.plainExplanation && (
                      <span className="text-slate-600 dark:text-slate-400">
                        — <ScientificText text={item.plainExplanation} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {summary.keyTerminology.length > 0 && (
          <section>
            {renderSectionHeader('terminology', 'Key Terminology', summary.keyTerminology.length)}
            {expandedSections.terminology && (
              <p className="pb-6 max-w-[74ch] text-sm leading-[1.75] text-slate-700 academic-selectable dark:text-slate-300">
                {summary.keyTerminology.map((term, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && (
                      <span className="mx-2 text-slate-400 select-none" aria-hidden="true">
                        ·
                      </span>
                    )}
                    <ScientificText text={term} />
                  </React.Fragment>
                ))}
              </p>
            )}
          </section>
        )}

        {summary.revisionNotes.length > 0 && (
          <section>
            {renderSectionHeader('revision', 'Cause & Formula Checks', summary.revisionNotes.length)}
            {expandedSections.revision && (
              <ul className="space-y-2 pb-6 max-w-[74ch]">
                {summary.revisionNotes.map((note, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-sm leading-[1.7] text-slate-700 academic-selectable dark:text-slate-300"
                  >
                    <span className="mt-0.5 font-mono text-xs font-semibold text-slate-400 select-none tabular-nums">
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <span>
                      <ScientificText text={note} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Legacy saved summary support */}
        {finalRecap.length > 0 && (
          <section>
            {renderSectionHeader('recap', 'Final Recap', finalRecap.length)}
            {expandedSections.recap && (
              <ol className="space-y-2 pb-6 max-w-[74ch]">
                {finalRecap.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-sm leading-[1.7] text-slate-800 academic-selectable dark:text-slate-200"
                  >
                    <span className="mt-0.5 font-mono text-xs font-semibold text-blue-700 select-none tabular-nums dark:text-cyan-400">
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <span>
                      <ScientificText text={item} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {/* H. Key Takeaways */}
        {summary.keyTakeaways.length > 0 && (
          <section>
            {renderSectionHeader('takeaways', 'Key Takeaways', summary.keyTakeaways.length)}
            {expandedSections.takeaways && (
              <ul className="space-y-2.5 pb-6 max-w-[74ch]">
                {summary.keyTakeaways.map((takeaway, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-sm leading-[1.7] text-slate-800 academic-selectable dark:text-slate-200"
                  >
                    <span className="mt-0.5 font-mono text-xs font-bold text-[#1D4ED8] select-none tabular-nums dark:text-cyan-400">
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <span>
                      <ScientificText text={takeaway} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <DocumentFlashcardsModal
        summary={summary}
        isOpen={flashcardsOpen}
        onClose={() => setFlashcardsOpen(false)}
      />
    </article>
  );
}
