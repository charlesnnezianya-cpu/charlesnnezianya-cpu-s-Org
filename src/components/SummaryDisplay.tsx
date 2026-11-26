import React, { useState } from 'react';
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
import type { StructuredSummary, SummaryLevel } from '../types/brainstine';
import { DocumentFlashcardsModal } from './DocumentFlashcardsModal';
import { EducationalDiagramRenderer } from './EducationalDiagramRenderer';
import { ScientificText } from './ScientificText';

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
  | 'processes'
  | 'formulas'
  | 'facts'
  | 'examples'
  | 'distinctions'
  | 'terminology'
  | 'recap'
  | 'comparisons'
  | 'diagrams'
  | 'difficult'
  | 'revision'
  | 'takeaways';

const ALL_SECTIONS: SectionKey[] = [
  'overview',
  'concepts',
  'definitions',
  'processes',
  'formulas',
  'facts',
  'examples',
  'distinctions',
  'terminology',
  'recap',
  'comparisons',
  'diagrams',
  'difficult',
  'revision',
  'takeaways',
];

export function SummaryDisplay({
  summary,
  onSave,
  isSaving = false,
  isSaved = false,
  onCreateQuizFromSummary,
}: SummaryDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>({
    overview: true,
    concepts: true,
    definitions: true,
    processes: true,
    formulas: true,
    facts: true,
    examples: true,
    distinctions: true,
    terminology: true,
    recap: true,
    comparisons: true,
    diagrams: true,
    difficult: true,
    revision: true,
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
        className="flex min-h-11 w-full items-center justify-between gap-4 py-3 text-left select-none sm:py-3.5"
      >
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
            {title}
          </h3>
          {typeof count === 'number' && count > 0 && (
            <span className="font-mono text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
              {count}
            </span>
          )}
        </div>
        <span className="text-slate-400">
          {isOpen ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>
    );
  };

  const processes = summary.processesAndMechanisms ?? [];
  const distinctions = summary.importantDistinctions ?? [];
  const finalRecap = summary.finalRecap ?? [];
  const comparisons = summary.comparisonTables ?? [];
  const diagrams = summary.visualDiagrams ?? [];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0D162B]">
      {/* Compact Document Header & Actions */}
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 px-4 py-5 sm:px-6 lg:flex-row lg:items-start dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 select-none dark:text-slate-400">
            <span className="font-semibold text-blue-700 dark:text-cyan-400">
              {summary.subjectArea}
            </span>
            <span aria-hidden="true">·</span>
            <span>Document Summary</span>
            <span aria-hidden="true">·</span>
            <span>{LEVEL_LABELS[summary.summaryLevel]}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {summary.wordCount.toLocaleString()} source words
            </span>
          </div>
          <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight text-slate-900 academic-selectable sm:text-2xl dark:text-white">
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
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-800 transition-colors hover:bg-purple-100 whitespace-nowrap shrink-0 sm:min-h-8 dark:border-purple-900/60 dark:bg-purple-950/50 dark:text-purple-300 dark:hover:bg-purple-900"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Flashcards</span>
          </button>
        </div>
      </header>

      {/* Honest Notice when source document is brief or fragmented */}
      {summary.sourceNotice && (
        <div className="flex items-start gap-2.5 border-b border-slate-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 sm:px-6 dark:border-slate-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>{summary.sourceNotice}</span>
        </div>
      )}

      {/* Clean Inline Academic Document Body */}
      <div className="divide-y divide-slate-200 px-4 sm:px-6 dark:divide-slate-800">
        {/* 1. Topic Overview */}
        {summary.topicOverview && (
          <section>
            {renderSectionHeader('overview', 'Topic Overview')}
            {expandedSections.overview && (
              <p className="pb-4 max-w-3xl text-[15px] leading-relaxed text-slate-800 academic-selectable dark:text-slate-200">
                <ScientificText text={summary.topicOverview} />
              </p>
            )}
          </section>
        )}

        {/* 2. Main Concepts (Clean Inline Subsections) */}
        {summary.mainConcepts.length > 0 && (
          <section>
            {renderSectionHeader('concepts', 'Main Concepts', summary.mainConcepts.length)}
            {expandedSections.concepts && (
              <div className="space-y-4 pb-5">
                {summary.mainConcepts.map((concept, idx) => (
                  <div key={idx}>
                    <h4 className="font-display text-sm font-semibold text-slate-900 select-text dark:text-white">
                      <span className="mr-2 font-mono text-xs text-blue-700 select-none tabular-nums dark:text-cyan-400">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <ScientificText text={concept.heading} />
                    </h4>

                    {concept.sourcePoints.length > 0 && (
                      <ul className="mt-1.5 space-y-1.5 pl-1">
                        {concept.sourcePoints.map((pt, pIdx) => (
                          <li
                            key={pIdx}
                            className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300"
                          >
                            <span
                              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-cyan-400"
                              aria-hidden="true"
                            />
                            <span>
                              <ScientificText text={pt} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Legacy saved summaries compatibility */}
                    {concept.aiClarification && (
                      <p className="mt-1.5 pl-4 text-xs leading-relaxed text-slate-600 italic academic-selectable dark:text-slate-400">
                        <ScientificText text={concept.aiClarification} />
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 3. Important Definitions (Clean Inline Term — Explanation list) */}
        {summary.importantDefinitions.length > 0 && (
          <section>
            {renderSectionHeader(
              'definitions',
              'Important Definitions',
              summary.importantDefinitions.length
            )}
            {expandedSections.definitions && (
              <dl className="space-y-2.5 pb-5">
                {summary.importantDefinitions.map((item, idx) => (
                  <div
                    key={idx}
                    className="text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300"
                  >
                    <dt className="inline font-semibold text-slate-900 dark:text-white">
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

        {/* 4. Processes & Mechanisms */}
        {processes.length > 0 && (
          <section>
            {renderSectionHeader('processes', 'Processes & Mechanisms', processes.length)}
            {expandedSections.processes && (
              <div className="space-y-4 pb-5">
                {processes.map((proc, idx) => (
                  <div key={idx}>
                    {processes.length > 1 && (
                      <h4 className="mb-1.5 font-display text-sm font-semibold text-slate-900 dark:text-white">
                        <ScientificText text={proc.heading} />
                      </h4>
                    )}
                    <ol className="space-y-1.5">
                      {proc.steps.map((step, sIdx) => (
                        <li
                          key={sIdx}
                          className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300"
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
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 5. Important Formulas & Equations (Compact equation strip, no cramped pill boxes) */}
        {summary.formulasOrFrameworks.length > 0 && (
          <section>
            {renderSectionHeader(
              'formulas',
              'Important Formulas & Equations',
              summary.formulasOrFrameworks.length
            )}
            {expandedSections.formulas && (
              <div className="space-y-3 pb-5">
                {summary.formulasOrFrameworks.map((formula, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200/90 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50"
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
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 academic-selectable dark:text-slate-400">
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
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 6. Key Facts */}
        {summary.importantFacts.length > 0 && (
          <section>
            {renderSectionHeader('facts', 'Key Facts', summary.importantFacts.length)}
            {expandedSections.facts && (
              <ul className="space-y-1.5 pb-5">
                {summary.importantFacts.map((fact, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300"
                  >
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-cyan-400"
                      aria-hidden="true"
                    />
                    <span>
                      <ScientificText text={fact} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* 7. Examples & Applications */}
        {summary.relevantExamples.length > 0 && (
          <section>
            {renderSectionHeader(
              'examples',
              'Examples & Applications',
              summary.relevantExamples.length
            )}
            {expandedSections.examples && (
              <div className="space-y-2.5 pb-5">
                {summary.relevantExamples.map((ex, idx) => (
                  <p
                    key={idx}
                    className="text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300"
                  >
                    <strong className="font-semibold text-slate-900 dark:text-white">
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

        {/* 8. Important Distinctions */}
        {distinctions.length > 0 && (
          <section>
            {renderSectionHeader('distinctions', 'Important Distinctions', distinctions.length)}
            {expandedSections.distinctions && (
              <div className="space-y-2.5 pb-5">
                {distinctions.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-sm leading-relaxed text-slate-700 academic-selectable dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300"
                  >
                    <span className="font-display font-semibold text-slate-900 dark:text-white">
                      <ScientificText text={item.pairTitle} />
                      {': '}
                    </span>
                    <ScientificText text={item.comparison} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 9. Key Terminology (Clean inline list separated by middot) */}
        {summary.keyTerminology.length > 0 && (
          <section>
            {renderSectionHeader('terminology', 'Key Terminology', summary.keyTerminology.length)}
            {expandedSections.terminology && (
              <p className="pb-5 text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300">
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

        {/* 10. Final Recap */}
        {finalRecap.length > 0 && (
          <section>
            {renderSectionHeader('recap', 'Final Recap', finalRecap.length)}
            {expandedSections.recap && (
              <ol className="space-y-1.5 pb-5">
                {finalRecap.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-800 academic-selectable dark:text-slate-200"
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

        {/* Legacy Saved Summary Support (only shown if legacy fields exist on older saved summaries) */}
        {comparisons.length > 0 && (
          <section>
            {renderSectionHeader('comparisons', 'Comparison Tables', comparisons.length)}
            {expandedSections.comparisons && (
              <div className="space-y-4 pb-5">
                {comparisons.map((table, tIdx) => (
                  <div
                    key={tIdx}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
                      <h4 className="font-display text-xs font-semibold text-slate-900 dark:text-white">
                        {table.title}
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[360px] border-collapse text-left text-xs sm:text-sm academic-selectable">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/50">
                            <th className="px-4 py-2 font-display text-xs font-semibold text-slate-900 dark:text-white">
                              Criterion
                            </th>
                            {table.headers.map((h, hIdx) => (
                              <th
                                key={hIdx}
                                className="px-4 py-2 font-display text-xs font-semibold text-slate-900 dark:text-white"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {table.rows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              <td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                                {row.criterion}
                              </td>
                              {row.values.map((val, vIdx) => (
                                <td
                                  key={vIdx}
                                  className="px-4 py-2 text-slate-700 dark:text-slate-300"
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

        {diagrams.length > 0 && (
          <section>
            {renderSectionHeader('diagrams', 'Diagrams & Schematics', diagrams.length)}
            {expandedSections.diagrams && (
              <div className="space-y-4 pb-5">
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
              'Concept Notes',
              summary.difficultConceptExplanations.length
            )}
            {expandedSections.difficult && (
              <div className="space-y-2.5 pb-5">
                {summary.difficultConceptExplanations.map((item, idx) => (
                  <div
                    key={idx}
                    className="text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300"
                  >
                    <strong className="font-semibold text-slate-900 dark:text-white">
                      {item.concept}:{' '}
                    </strong>
                    <ScientificText text={item.sourceContext} />{' '}
                    {item.plainExplanation && (
                      <span className="text-slate-600 dark:text-slate-400">
                        (<ScientificText text={item.plainExplanation} />)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {finalRecap.length === 0 && summary.revisionNotes.length > 0 && (
          <section>
            {renderSectionHeader('revision', 'Revision Notes', summary.revisionNotes.length)}
            {expandedSections.revision && (
              <ul className="space-y-1.5 pb-5">
                {summary.revisionNotes.map((note, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700 academic-selectable dark:text-slate-300"
                  >
                    <span className="font-mono text-xs font-semibold text-slate-400 select-none tabular-nums mt-0.5">
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

        {finalRecap.length === 0 && summary.keyTakeaways.length > 0 && (
          <section>
            {renderSectionHeader('takeaways', 'Key Takeaways', summary.keyTakeaways.length)}
            {expandedSections.takeaways && (
              <ul className="space-y-1.5 pb-5">
                {summary.keyTakeaways.map((takeaway, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-800 academic-selectable dark:text-slate-200"
                  >
                    <span className="font-mono text-xs font-bold text-[#1D4ED8] select-none tabular-nums mt-0.5 dark:text-sky-400">
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
