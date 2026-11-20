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
  HelpCircle,
  Lightbulb,
  ListChecks,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import { exportSummaryToPdf } from '../lib/pdfExport';
import type { FollowUpItem, StructuredSummary, SummaryLevel } from '../types/brainstine';
import { EducationalDiagramRenderer } from './EducationalDiagramRenderer';
import { SubjectVisualBanner } from './SubjectVisualBanner';

interface SummaryDisplayProps {
  summary: StructuredSummary;
  sourceText?: string;
  geminiConfigured?: boolean;
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
  | 'diagrams'
  | 'concepts'
  | 'comparisons'
  | 'definitions'
  | 'terminology'
  | 'difficult'
  | 'facts'
  | 'examples'
  | 'formulas'
  | 'revision'
  | 'takeaways';

const ALL_SECTIONS: SectionKey[] = [
  'overview',
  'diagrams',
  'concepts',
  'comparisons',
  'definitions',
  'terminology',
  'difficult',
  'facts',
  'examples',
  'formulas',
  'revision',
  'takeaways',
];

export function SummaryDisplay({
  summary,
  sourceText,
  geminiConfigured = true,
  onSave,
  isSaving = false,
  isSaved = false,
  onCreateQuizFromSummary,
}: SummaryDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>({
    overview: true,
    diagrams: true,
    concepts: true,
    comparisons: true,
    definitions: true,
    terminology: true,
    difficult: true,
    facts: true,
    examples: true,
    formulas: true,
    revision: true,
    takeaways: true,
  });

  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

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

  const runFollowUp = async (
    actionType: 'question' | 'simpler_explanation' | 'examples' | 'revision_notes',
    customQuestion?: string
  ) => {
    setFollowUpError(null);
    if (!geminiConfigured) {
      setFollowUpError(
        'AI follow-up requires GEMINI_API_KEY to be configured in your Secrets panel.'
      );
      return;
    }
    if (actionType === 'question' && (!customQuestion || !customQuestion.trim())) {
      setFollowUpError('Please type a follow-up question first.');
      return;
    }

    setFollowUpLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 75000);
    try {
      const res = await fetch('/api/summaries/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          actionType,
          question: customQuestion?.trim(),
          summary,
          sourceText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Follow-up request failed.');
      }

      const labelMap = {
        question: 'Follow-Up Question',
        simpler_explanation: 'Simpler Explanation',
        examples: 'Additional Examples',
        revision_notes: 'Focused Revision Notes',
      };

      const item: FollowUpItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        promptLabel: labelMap[actionType],
        question:
          actionType === 'question'
            ? customQuestion!.trim()
            : labelMap[actionType],
        fromSource: data.fromSource,
        aiExplanation: data.aiExplanation,
        createdAt: new Date().toISOString(),
      };

      setFollowUps((prev) => [item, ...prev]);
      if (actionType === 'question') {
        setQuestionInput('');
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        setFollowUpError('Follow-up request timed out. Please try again in a moment.');
      } else {
        setFollowUpError(err instanceof Error ? err.message : 'Unable to process follow-up.');
      }
    } finally {
      clearTimeout(timer);
      setFollowUpLoading(false);
    }
  };

  const renderSectionHeader = (key: SectionKey, title: string, originHint?: string) => {
    const isOpen = expandedSections[key];
    return (
      <button
        type="button"
        onClick={() => toggleSection(key)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 py-4 text-left select-none"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
            {title}
          </h3>
          {originHint && (
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              · {originHint}
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

  return (
    <div className="space-y-6">
      <article className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0D162B]">
        {/* Header & Primary Export/Save Controls */}
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-4 py-5 sm:px-6 lg:flex-row lg:items-start dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 select-none dark:text-slate-400">
              <span className="text-blue-700 dark:text-cyan-400">{summary.subjectArea}</span>
              <span aria-hidden="true">·</span>
              <span>{LEVEL_LABELS[summary.summaryLevel]}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {summary.wordCount.toLocaleString()} source words
              </span>
              {summary.chunkCount > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{summary.chunkCount} chunks</span>
                </>
              )}
            </div>
            <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight text-slate-900 academic-selectable sm:text-2xl dark:text-white">
              {summary.title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 select-none">
            <button
              type="button"
              onClick={toggleAllSections}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export PDF</span>
            </button>

            {onSave && (
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving || isSaved}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-cyan-300 dark:hover:bg-blue-950"
              >
                <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Test Myself</span>
              </button>
            )}
          </div>
        </div>

        {/* Attribution Legend */}
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600 select-none sm:px-6 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Source Provenance: </span>
          Direct source extractions are labeled <span className="font-semibold text-blue-700 dark:text-cyan-400">From Source Material</span>; supplemental conceptual explanations are labeled <span className="font-semibold text-indigo-700 dark:text-indigo-400">AI Clarification</span>.
        </div>

        {/* Illustrated Digital Textbook Subject Cover */}
        <div className="px-4 pt-5 sm:px-6">
          <SubjectVisualBanner
            subjectHint={`${summary.subjectArea} ${summary.title}`}
            fallbackKey="summarizer"
            title={summary.title}
            subtitle={summary.topicOverview}
            variant="textbook"
          />
        </div>

        {/* Collapsible Summary Sections */}
        <div className="divide-y divide-slate-200 px-4 sm:px-6 dark:divide-slate-800">
          {/* 1. Topic Overview */}
          <section>
            {renderSectionHeader('overview', 'Topic Overview', 'From Source Material')}
            {expandedSections.overview && (
              <p className="pb-5 max-w-3xl text-base leading-relaxed text-slate-800 academic-selectable dark:text-slate-200">
                {summary.topicOverview}
              </p>
            )}
          </section>

          {/* 1B. Visual Diagrams & Schematics */}
          {(summary.visualDiagrams ?? []).length > 0 && (
            <section>
              {renderSectionHeader(
                'diagrams',
                'Visual Diagrams & Concept Maps',
                'Interactive Visual Aids'
              )}
              {expandedSections.diagrams && (
                <div className="space-y-4 pb-5">
                  {(summary.visualDiagrams ?? []).map((diag, idx) => (
                    <EducationalDiagramRenderer key={idx} spec={diag} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 2. Main Concepts Arranged Under Headings */}
          {summary.mainConcepts.length > 0 && (
            <section>
              {renderSectionHeader('concepts', 'Main Concepts & Points', 'Structured by Heading')}
              {expandedSections.concepts && (
                <div className="divide-y divide-slate-100 pb-5 dark:divide-slate-800/80">
                  {summary.mainConcepts.map((concept, idx) => (
                    <div key={idx} className="py-4 first:pt-1 last:pb-0">
                      <h4 className="font-display text-base font-semibold text-slate-900 select-text dark:text-white">
                        <span className="mr-2 font-mono text-xs text-blue-700 select-none tabular-nums dark:text-cyan-400">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        {concept.heading}
                      </h4>

                      {concept.sourcePoints.length > 0 && (
                        <div className="mt-2.5">
                          <p className="text-[11px] font-semibold tracking-wide text-blue-700 select-none dark:text-cyan-400">
                            From Source Material
                          </p>
                          <ul className="mt-1.5 space-y-1.5">
                            {concept.sourcePoints.map((pt, pIdx) => (
                              <li
                                key={pIdx}
                                className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700 select-text dark:text-slate-300"
                              >
                                <span
                                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-cyan-400"
                                  aria-hidden="true"
                                />
                                <span>{pt}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {concept.aiClarification && (
                        <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 dark:border-indigo-900/50 dark:bg-indigo-950/25">
                          <p className="text-[11px] font-semibold tracking-wide text-indigo-700 select-none dark:text-indigo-300">
                            AI Clarification
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-slate-700 select-text dark:text-slate-300">
                            {concept.aiClarification}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 2B. Comparison Tables */}
          {(summary.comparisonTables ?? []).length > 0 && (
            <section>
              {renderSectionHeader('comparisons', 'Comparison Tables', 'Structured Contrasts')}
              {expandedSections.comparisons && (
                <div className="space-y-5 pb-5">
                  {(summary.comparisonTables ?? []).map((table, tIdx) => (
                    <div
                      key={tIdx}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50"
                    >
                      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                        <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                          {table.title}
                        </h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs sm:text-sm academic-selectable">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/50">
                              <th className="px-4 py-2.5 font-display text-xs font-semibold text-slate-900 dark:text-white">
                                Criterion
                              </th>
                              {table.headers.map((h, hIdx) => (
                                <th
                                  key={hIdx}
                                  className="px-4 py-2.5 font-display text-xs font-semibold text-slate-900 dark:text-white"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {table.rows.map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-transparent dark:even:bg-slate-800/20"
                              >
                                <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                                  {row.criterion}
                                </td>
                                {row.values.map((val, vIdx) => (
                                  <td
                                    key={vIdx}
                                    className="px-4 py-2.5 text-slate-700 dark:text-slate-300"
                                  >
                                    {val}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {table.caption && (
                        <p className="border-t border-slate-200 bg-slate-50/50 px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                          {table.caption}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 3. Important Definitions */}
          {summary.importantDefinitions.length > 0 && (
            <section>
              {renderSectionHeader('definitions', 'Important Definitions')}
              {expandedSections.definitions && (
                <dl className="grid grid-cols-1 gap-4 pb-5 sm:grid-cols-2">
                  {summary.importantDefinitions.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="font-display text-sm font-semibold text-slate-900 select-text dark:text-white">
                          {item.term}
                        </dt>
                        <span
                          className={`text-[11px] font-medium select-none shrink-0 ${
                            item.origin === 'source'
                              ? 'text-blue-700 dark:text-cyan-400'
                              : 'text-indigo-700 dark:text-indigo-400'
                          }`}
                        >
                          {item.origin === 'source' ? 'From Source' : 'AI Clarification'}
                        </span>
                      </div>
                      <dd className="mt-1.5 text-sm leading-relaxed text-slate-600 select-text dark:text-slate-300">
                        {item.definition}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}

          {/* 4. Key Terminology */}
          {summary.keyTerminology.length > 0 && (
            <section>
              {renderSectionHeader('terminology', 'Key Terminology', 'From Source Material')}
              {expandedSections.terminology && (
                <p className="pb-5 text-sm leading-relaxed text-slate-700 select-text dark:text-slate-300">
                  {summary.keyTerminology.join(' · ')}
                </p>
              )}
            </section>
          )}

          {/* 5. Explanations of Difficult Concepts */}
          {summary.difficultConceptExplanations.length > 0 && (
            <section>
              {renderSectionHeader(
                'difficult',
                'Explanations of Difficult Concepts',
                'Source Context + AI Clarification'
              )}
              {expandedSections.difficult && (
                <div className="space-y-4 pb-5">
                  {summary.difficultConceptExplanations.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40"
                    >
                      <h4 className="font-display text-sm font-semibold text-slate-900 select-text dark:text-white">
                        {item.concept}
                      </h4>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600 select-text dark:text-slate-400">
                        <span className="font-semibold text-blue-700 select-none dark:text-cyan-400">
                          From Source Material:{' '}
                        </span>
                        {item.sourceContext}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-800 select-text dark:text-slate-200">
                        <span className="font-semibold text-indigo-700 select-none dark:text-indigo-400">
                          AI Clarification:{' '}
                        </span>
                        {item.plainExplanation}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 6. Important Facts */}
          {summary.importantFacts.length > 0 && (
            <section>
              {renderSectionHeader('facts', 'Important Facts', 'From Source Material')}
              {expandedSections.facts && (
                <ul className="space-y-2 pb-5">
                  {summary.importantFacts.map((fact, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700 select-text dark:text-slate-300"
                    >
                      <span
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-cyan-400"
                        aria-hidden="true"
                      />
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* 7. Relevant Examples */}
          {summary.relevantExamples.length > 0 && (
            <section>
              {renderSectionHeader('examples', 'Relevant Examples')}
              {expandedSections.examples && (
                <div className="space-y-3 pb-5">
                  {summary.relevantExamples.map((ex, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="font-display text-sm font-semibold text-slate-900 select-text dark:text-white">
                          {ex.title}
                        </h4>
                        <span
                          className={`text-[11px] font-medium select-none shrink-0 ${
                            ex.origin === 'source'
                              ? 'text-blue-700 dark:text-cyan-400'
                              : 'text-indigo-700 dark:text-indigo-400'
                          }`}
                        >
                          {ex.origin === 'source' ? 'From Source' : 'AI Elaboration'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-700 select-text dark:text-slate-300">
                        {ex.example}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 8. Formulas or Frameworks */}
          {summary.formulasOrFrameworks.length > 0 && (
            <section>
              {renderSectionHeader('formulas', 'Formulas, Equations & Frameworks')}
              {expandedSections.formulas && (
                <div className="space-y-3 pb-5">
                  {summary.formulasOrFrameworks.map((formula, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                    >
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <span className="font-display text-sm font-semibold text-slate-900 select-text dark:text-white">
                          {formula.name}
                        </span>
                        <code className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs font-medium text-blue-800 select-text dark:border-slate-700 dark:bg-slate-950 dark:text-cyan-300">
                          {formula.expressionOrStructure}
                        </code>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600 select-text dark:text-slate-400">
                        {formula.usage}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 9. Revision Notes */}
          {summary.revisionNotes.length > 0 && (
            <section>
              {renderSectionHeader('revision', 'Revision Notes')}
              {expandedSections.revision && (
                <ul className="space-y-2 pb-5">
                  {summary.revisionNotes.map((note, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700 select-text dark:text-slate-300"
                    >
                      <span className="font-mono text-xs font-semibold text-slate-400 select-none tabular-nums mt-0.5">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* 10. Key Takeaways */}
          {summary.keyTakeaways.length > 0 && (
            <section>
              {renderSectionHeader('takeaways', 'Key Takeaways')}
              {expandedSections.takeaways && (
                <div className="grid grid-cols-1 gap-3 pb-5 sm:grid-cols-2">
                  {summary.keyTakeaways.map((takeaway, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 rounded-xl border border-sky-200/80 bg-sky-50/60 p-3.5 text-sm leading-relaxed text-slate-800 academic-selectable dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-slate-200"
                    >
                      <span className="mt-0.5 font-mono text-xs font-bold text-[#1D4ED8] select-none tabular-nums dark:text-sky-400">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span>{takeaway}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </article>

      {/* Summary Interaction & Scoped Follow-up Panel */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 select-none dark:text-white">
              Deepen Your Understanding
            </h3>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Ask a follow-up question on this summary, or request simpler explanations, examples,
              or condensed revision notes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 select-none">
            <button
              type="button"
              disabled={followUpLoading}
              onClick={() => runFollowUp('simpler_explanation')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <HelpCircle className="h-3.5 w-3.5 text-blue-600 dark:text-cyan-400" aria-hidden="true" />
              <span>Request Simpler Explanation</span>
            </button>
            <button
              type="button"
              disabled={followUpLoading}
              onClick={() => runFollowUp('examples')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Lightbulb className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span>Request Examples</span>
            </button>
            <button
              type="button"
              disabled={followUpLoading}
              onClick={() => runFollowUp('revision_notes')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
              <span>Generate Revision Notes</span>
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runFollowUp('question', questionInput);
          }}
          className="mt-4 flex flex-col gap-2.5 sm:flex-row"
        >
          <label htmlFor="summary-followup-input" className="sr-only">
            Ask a follow-up question about this summary
          </label>
          <input
            id="summary-followup-input"
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="Ask a specific question about a concept, term, or step in this summary..."
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={followUpLoading || !questionInput.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 whitespace-nowrap shrink-0 select-none dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {followUpLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Thinking...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden="true" />
                <span>Ask Follow-up</span>
              </>
            )}
          </button>
        </form>

        {followUpError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <span>{followUpError}</span>
          </div>
        )}

        {followUps.length > 0 && (
          <div className="mt-5 space-y-4">
            {followUps.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 select-none dark:text-slate-400">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {item.promptLabel}
                  </span>
                  <span className="font-mono tabular-nums">
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {item.promptLabel === 'Follow-Up Question' && (
                  <p className="mt-1.5 text-sm font-medium text-slate-900 select-text dark:text-white">
                    {item.question}
                  </p>
                )}
                <div className="mt-3 space-y-2.5 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <div>
                    <p className="text-[11px] font-semibold tracking-wide text-blue-700 select-none dark:text-cyan-400">
                      From Source Material
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700 select-text dark:text-slate-300">
                      {item.fromSource}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold tracking-wide text-indigo-700 select-none dark:text-indigo-400">
                      AI Clarification
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-800 select-text dark:text-slate-200">
                      {item.aiExplanation}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
