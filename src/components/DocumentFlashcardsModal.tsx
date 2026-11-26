import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  RotateCcw,
  RotateCw,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';
import { stripSummarySourceAndPageRefs } from '../lib/summarySanitizer';
import type { StructuredSummary } from '../types/brainstine';
import { ScientificText } from './ScientificText';

export interface DocumentFlashcard {
  id: string;
  category: 'Definition' | 'Formula & Law' | 'Core Concept' | 'Key Distinction' | 'Deep Dive' | 'Quick Review';
  front: string;
  back: string;
  context?: string;
}

interface DocumentFlashcardsModalProps {
  summary: StructuredSummary;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentFlashcardsModal({
  summary,
  isOpen,
  onClose,
}: DocumentFlashcardsModalProps) {
  // Generate flashcards from extracted document intelligence
  const initialCards = useMemo<DocumentFlashcard[]>(() => {
    const list: DocumentFlashcard[] = [];
    let counter = 1;

    // 1. Important Definitions
    if (Array.isArray(summary.importantDefinitions)) {
      for (const def of summary.importantDefinitions) {
        if (def && def.term && def.definition) {
          list.push({
            id: `def-${counter++}`,
            category: 'Definition',
            front: stripSummarySourceAndPageRefs(def.term),
            back: stripSummarySourceAndPageRefs(def.definition),
          });
        }
      }
    }

    // 2. Formulas and Frameworks
    if (Array.isArray(summary.formulasOrFrameworks)) {
      for (const f of summary.formulasOrFrameworks) {
        if (f && f.name) {
          const varText = f.variables && f.variables.length > 0
            ? f.variables.map((v) => `${v.symbol}: ${v.meaning}`).join('; ')
            : undefined;
          const backContent = f.expressionOrStructure
            ? `${f.expressionOrStructure}${f.usage ? `\n\nUsage: ${f.usage}` : ''}`
            : f.usage || f.name;
          list.push({
            id: `formula-${counter++}`,
            category: 'Formula & Law',
            front: f.name,
            back: backContent,
            context: varText,
          });
        }
      }
    }

    // 3. Classifications & Named Types
    if (Array.isArray(summary.classificationsAndTypes)) {
      for (const cls of summary.classificationsAndTypes) {
        if (cls && Array.isArray(cls.types)) {
          for (const t of cls.types) {
            if (t && t.name && t.explanation) {
              const contextParts: string[] = [];
              if (t.characteristics && t.characteristics.length > 0) {
                contextParts.push(`Characteristics: ${t.characteristics.join('; ')}`);
              }
              if (t.examples && t.examples.length > 0) {
                contextParts.push(`Examples: ${t.examples.join('; ')}`);
              }
              list.push({
                id: `cls-${counter++}`,
                category: 'Core Concept',
                front: `${cls.topic}: ${t.name}`,
                back: t.explanation,
                context: contextParts.length > 0 ? contextParts.join(' · ') : undefined,
              });
            }
          }
        }
      }
    }

    // 4. Core Concepts
    if (Array.isArray(summary.mainConcepts)) {
      for (const c of summary.mainConcepts) {
        if (c && c.heading) {
          const allPoints = [
            ...(c.sourcePoints || []),
            ...(c.subsections ? c.subsections.flatMap((s) => s.points) : []),
          ];
          const backText = allPoints.length > 0 ? allPoints.join('\n\n') : c.aiClarification || c.heading;
          const contextPoints = c.examples && c.examples.length > 0
            ? `Example: ${c.examples[0]}`
            : undefined;
          list.push({
            id: `concept-${counter++}`,
            category: 'Core Concept',
            front: c.heading,
            back: backText,
            context: contextPoints,
          });
        }
      }
    }

    // 5. Characteristics & Explanations
    if (Array.isArray(summary.characteristicsAndExplanations)) {
      for (const grp of summary.characteristicsAndExplanations) {
        if (grp && grp.topic && Array.isArray(grp.points) && grp.points.length > 0) {
          list.push({
            id: `char-${counter++}`,
            category: 'Deep Dive',
            front: `Characteristics of ${grp.topic}`,
            back: grp.points.join('\n\n'),
          });
        }
      }
    }

    // 6. Distinctions & Comparisons
    if (Array.isArray(summary.importantDistinctions)) {
      for (const d of summary.importantDistinctions) {
        if (d && d.pairTitle && d.comparison) {
          list.push({
            id: `dist-${counter++}`,
            category: 'Key Distinction',
            front: d.pairTitle,
            back: d.comparison,
          });
        }
      }
    }

    // 7. Difficult Concepts
    if (Array.isArray(summary.difficultConceptExplanations)) {
      for (const dc of summary.difficultConceptExplanations) {
        if (dc && dc.concept && dc.plainExplanation) {
          list.push({
            id: `diff-${counter++}`,
            category: 'Deep Dive',
            front: dc.concept,
            back: dc.plainExplanation,
            context: dc.sourceContext,
          });
        }
      }
    }

    // 6. Quick Revision Notes
    if (Array.isArray(summary.revisionNotes)) {
      summary.revisionNotes.forEach((note: string, idx: number) => {
        if (note && note.trim().length > 10) {
          list.push({
            id: `rev-${counter++}`,
            category: 'Quick Review',
            front: `Key Insight #${idx + 1}`,
            back: note.trim(),
          });
        }
      });
    }

    // Fallback: If minimal structured items extracted, use keyTakeaways
    if (list.length === 0 && Array.isArray(summary.keyTakeaways)) {
      summary.keyTakeaways.forEach((takeaway: string, idx: number) => {
        if (takeaway && takeaway.trim().length > 5) {
          list.push({
            id: `kt-${counter++}`,
            category: 'Quick Review',
            front: `Core Principle #${idx + 1}`,
            back: takeaway.trim(),
          });
        }
      });
    }

    return list;
  }, [summary]);

  const [cards, setCards] = useState<DocumentFlashcard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [masteredIds, setMasteredIds] = useState<Set<string>>(new Set());

  // Reset or update cards when initialCards change
  useEffect(() => {
    setCards(initialCards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setSelectedCategory('All');
    setMasteredIds(new Set());
  }, [initialCards]);

  // Categories list
  const categories = useMemo(() => {
    const cats = new Set<string>();
    initialCards.forEach((c) => cats.add(c.category));
    return ['All', ...Array.from(cats)];
  }, [initialCards]);

  // Filtered cards
  const filteredCards = useMemo(() => {
    if (selectedCategory === 'All') return cards;
    return cards.filter((c) => c.category === selectedCategory);
  }, [cards, selectedCategory]);

  const currentCard = filteredCards[currentIndex] || null;

  const handleNext = useCallback(() => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1 < filteredCards.length ? prev + 1 : 0));
  }, [filteredCards.length]);

  const handlePrev = useCallback(() => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, filteredCards.length - 1)));
  }, [filteredCards.length]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  const handleShuffle = () => {
    setIsFlipped(false);
    setCards((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    });
    setCurrentIndex(0);
  };

  const toggleMastered = (id: string) => {
    setMasteredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleResetMastery = () => {
    setMasteredIds(new Set());
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleFlip();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, handleFlip, onClose]);

  if (!isOpen) return null;

  const masteredCount = filteredCards.filter((c) => masteredIds.has(c.id)).length;
  const progressPercent = filteredCards.length > 0
    ? Math.round((masteredCount / filteredCards.length) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3.5 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Document Flashcards Study Mode"
    >
      <div className="relative flex h-[92vh] max-h-[820px] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-800 dark:bg-[#0D162B]">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-cyan-400">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white sm:text-lg">
                Document Flashcards
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Extracted directly from <span className="font-medium">{summary.title}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShuffle}
              title="Shuffle Flashcards"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Shuffle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Shuffle</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Flashcards"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar & Progress Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:px-6 dark:border-slate-800/80 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => {
              const count = cat === 'All' ? cards.length : cards.filter((c) => c.category === cat).length;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setCurrentIndex(0);
                    setIsFlipped(false);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs dark:bg-blue-500'
                      : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {masteredCount} / {filteredCards.length} Mastered
              </span>
              <span className="ml-1.5 font-mono text-[11px] text-slate-400 tabular-nums">
                ({progressPercent}%)
              </span>
            </div>
            {masteredCount > 0 && (
              <button
                type="button"
                onClick={handleResetMastery}
                title="Reset Mastery"
                className="text-[11px] text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-200"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar Line */}
        <div className="h-1 w-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Main Card Viewport */}
        <div className="flex flex-1 flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto">
          {filteredCards.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-400">
                No flashcards available for the selected category.
              </p>
            </div>
          ) : currentCard ? (
            <div className="w-full max-w-xl">
              {/* Card Meta Indicator */}
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 select-none">
                <span className="font-semibold uppercase tracking-wider text-blue-700 dark:text-cyan-400">
                  {currentCard.category}
                </span>
                <span className="font-mono tabular-nums">
                  Card {currentIndex + 1} of {filteredCards.length}
                </span>
              </div>

              {/* Interactive Flashcard Element */}
              <div
                onClick={handleFlip}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleFlip();
                  }
                }}
                className={`group relative flex min-h-[300px] sm:min-h-[340px] w-full cursor-pointer flex-col justify-between rounded-2xl border p-6 sm:p-8 transition-all duration-200 select-none shadow-md ${
                  isFlipped
                    ? 'border-blue-300 bg-blue-50/40 hover:border-blue-400 dark:border-blue-900/60 dark:bg-blue-950/20 dark:hover:border-blue-800'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg dark:border-slate-800 dark:bg-[#0B1222] dark:hover:border-slate-700'
                }`}
              >
                {/* Top Badge on Card */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      isFlipped
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-cyan-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {isFlipped ? 'Answer / Explanation' : 'Question / Term'}
                  </span>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                    <RotateCw className="h-3.5 w-3.5 transition-transform group-hover:rotate-45" />
                    <span className="text-[11px] font-medium hidden sm:inline">Click to flip</span>
                  </div>
                </div>

                {/* Card Center Content */}
                <div className="my-auto py-6 text-center">
                  {!isFlipped ? (
                    <div className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-relaxed">
                      <ScientificText text={currentCard.front} />
                    </div>
                  ) : (
                    <div className="space-y-3 text-left">
                      <div className="text-base sm:text-lg font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                        <ScientificText text={currentCard.back} />
                      </div>
                      {currentCard.context && (
                        <div className="mt-4 rounded-lg border border-blue-200/60 bg-blue-50/50 p-3 text-xs text-blue-950 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-cyan-200">
                          <span className="font-semibold">Context / Application: </span>
                          <ScientificText text={currentCard.context} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Card Footer */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800/70">
                  <span className="text-[11px] text-slate-400">
                    Space / Click to Flip · Arrow Keys to Navigate
                  </span>

                  {masteredIds.has(currentCard.id) && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mastered
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons Below Card */}
              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleMastered(currentCard.id)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                    masteredIds.has(currentCard.id)
                      ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-700'
                  }`}
                >
                  <Check className="h-4 w-4" />
                  <span>{masteredIds.has(currentCard.id) ? 'Mastered!' : 'Mark as Mastered'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
