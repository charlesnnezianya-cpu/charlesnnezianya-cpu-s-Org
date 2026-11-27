import React, { useEffect } from 'react';
import { Check, CheckSquare, Loader2, Square, X } from 'lucide-react';
import type { ExtractedDocumentSection, SummaryLevel } from '../types/brainstine';

interface SectionSelectorModalProps {
  isOpen: boolean;
  documentTitle: string;
  detectedSubject?: string;
  sections: ExtractedDocumentSection[];
  selectedSectionIds: string[];
  summaryLevel: SummaryLevel;
  generating: boolean;
  onToggleSection: (sectionId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onChangeSummaryLevel: (level: SummaryLevel) => void;
  onGenerate: () => void;
  onClose: () => void;
}

const STYLE_OPTIONS: ReadonlyArray<{
  id: SummaryLevel;
  label: string;
  description: string;
}> = [
  {
    id: 'short',
    label: 'Simple',
    description: 'Easy-to-understand explanations using straightforward language',
  },
  {
    id: 'detailed',
    label: 'Detailed',
    description: 'Thorough explanations of concepts, definitions, examples, and relationships',
  },
  {
    id: 'comprehensive',
    label: 'Comprehensive',
    description: 'In-depth summary covering all significant details across selected parts',
  },
];

export function SectionSelectorModal({
  isOpen,
  documentTitle,
  detectedSubject,
  sections,
  selectedSectionIds,
  summaryLevel,
  generating,
  onToggleSection,
  onSelectAll,
  onClearSelection,
  onChangeSummaryLevel,
  onGenerate,
  onClose,
}: SectionSelectorModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generating) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, generating, onClose]);

  if (!isOpen) return null;

  const selectedSet = new Set(selectedSectionIds);
  const selectedSections = sections.filter((s) => selectedSet.has(s.id));
  const selectedWords = selectedSections.reduce((acc, s) => acc + s.wordCount, 0);
  const allSelected = sections.length > 0 && selectedSections.length === sections.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="section-selector-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !generating) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[86dvh] sm:max-w-2xl sm:rounded-2xl dark:border-slate-800 dark:bg-[#0D162B]">
        {/* Mobile Sheet Handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Sticky Modal Header */}
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6 dark:border-slate-800">
          <div className="min-w-0">
            <h2
              id="section-selector-title"
              className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white"
            >
              Select summary parts
            </h2>
            <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-400">
              {documentTitle}
              {detectedSubject && detectedSubject !== 'General Studies'
                ? ` · ${detectedSubject}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            aria-label="Close section selector"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {/* Bulk Selection Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-600 tabular-nums dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">
                {selectedSections.length} of {sections.length}
              </span>{' '}
              {sections.length === 1 ? 'section' : 'sections'} selected
              {selectedWords > 0 ? ` · ${selectedWords.toLocaleString()} words` : ''}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSelectAll}
                disabled={allSelected || sections.length === 0}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-45 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Select All</span>
              </button>
              <button
                type="button"
                onClick={onClearSelection}
                disabled={selectedSections.length === 0}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-45 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Clear Selection</span>
              </button>
            </div>
          </div>

          {/* Section List */}
          <div
            role="group"
            aria-label="Document sections"
            className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/40"
          >
            {sections.map((section) => {
              const checked = selectedSet.has(section.id);
              const pageInfo =
                section.pageNumbers.length === 1
                  ? `p. ${section.pageNumbers[0]}`
                  : section.pageNumbers.length > 1
                    ? `pp. ${section.pageNumbers[0]}–${section.pageNumbers[section.pageNumbers.length - 1]}`
                    : '';

              return (
                <button
                  key={section.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => onToggleSection(section.id)}
                  className={`flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    checked
                      ? 'bg-blue-50/75 dark:bg-blue-950/35'
                      : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      checked
                        ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white dark:border-blue-500 dark:bg-blue-600'
                        : 'border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-900'
                    }`}
                    aria-hidden="true"
                  >
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                        <span className="mr-2 font-mono text-xs text-blue-700 tabular-nums dark:text-cyan-400">
                          {String(section.index + 1).padStart(2, '0')}.
                        </span>
                        {section.heading}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap shrink-0 dark:text-slate-400">
                        {section.wordCount.toLocaleString()} words
                        {pageInfo ? ` · ${pageInfo}` : ''}
                      </span>
                    </div>
                    {section.preview && section.preview !== section.heading && (
                      <p className="mt-1 line-clamp-1 text-xs text-slate-600 dark:text-slate-400">
                        {section.preview}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Summary Style Selector */}
          <div className="space-y-2.5 pt-1">
            <p className="text-xs font-semibold tracking-wide text-slate-700 uppercase dark:text-slate-300">
              Summary Style
            </p>
            <div
              role="radiogroup"
              aria-label="Summary style"
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
            >
              {STYLE_OPTIONS.map((opt) => {
                const active = summaryLevel === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChangeSummaryLevel(opt.id)}
                    className={`flex min-h-12 flex-col justify-start rounded-xl border p-3.5 text-left transition-colors ${
                      active
                        ? 'border-[#1D4ED8] bg-blue-50/75 dark:border-cyan-400 dark:bg-blue-950/40'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-display text-sm font-semibold ${
                          active
                            ? 'text-[#1D4ED8] dark:text-cyan-300'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span
                        className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${
                          active
                            ? 'border-[#1D4ED8] bg-[#1D4ED8] dark:border-cyan-400 dark:bg-cyan-400'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sticky Footer Actions */}
        <footer className="flex flex-col-reverse gap-2.5 border-t border-slate-200 bg-slate-50/70 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-slate-800 dark:bg-slate-900/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {selectedSections.length === 0
              ? 'Select at least one section to continue.'
              : `Style: ${STYLE_OPTIONS.find((o) => o.id === summaryLevel)?.label}`}
          </p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 sm:flex-initial dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating || selectedSections.length === 0}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 whitespace-nowrap shrink-0 sm:flex-initial dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>Generate Summary</span>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
