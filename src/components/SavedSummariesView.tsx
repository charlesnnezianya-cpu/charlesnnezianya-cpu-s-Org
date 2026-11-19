import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Search,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { deleteStudySummary } from '../lib/supabase';
import type {
  StudyMaterialRecord,
  StudySummaryRecord,
  SummaryLevel,
} from '../types/brainstine';
import { SummaryDisplay } from './SummaryDisplay';

interface SavedSummariesViewProps {
  summaries: StudySummaryRecord[];
  materials: StudyMaterialRecord[];
  geminiConfigured: boolean;
  onRefresh: () => void;
  onOpenSummarizer: () => void;
  onCreateQuizFromSummary: (summaryRecord: StudySummaryRecord) => void;
}

export function SavedSummariesView({
  summaries,
  materials,
  geminiConfigured,
  onRefresh,
  onOpenSummarizer,
  onCreateQuizFromSummary,
}: SavedSummariesViewProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | SummaryLevel>('all');
  const [selectedSummary, setSelectedSummary] = useState<StudySummaryRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return summaries.filter((item) => {
      const matchesLevel = levelFilter === 'all' || item.summary_level === levelFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.subject_area.toLowerCase().includes(q);
      return matchesLevel && matchesQuery;
    });
  }, [summaries, searchQuery, levelFilter]);

  const handleDelete = async (id: string) => {
    if (!user) return;
    setDeletingId(id);
    try {
      await deleteStudySummary(user.id, id);
      if (selectedSummary?.id === id) {
        setSelectedSummary(null);
      }
      onRefresh();
    } finally {
      setDeletingId(null);
    }
  };

  if (selectedSummary) {
    const linkedMaterial = selectedSummary.material_id
      ? materials.find((m) => m.id === selectedSummary.material_id)
      : undefined;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 select-none">
          <button
            type="button"
            onClick={() => setSelectedSummary(null)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0D162B] dark:text-slate-200 dark:hover:bg-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Saved Summaries</span>
          </button>

          <button
            type="button"
            onClick={() => handleDelete(selectedSummary.id)}
            disabled={deletingId === selectedSummary.id}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-slate-800 dark:bg-[#0D162B] dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>

        <SummaryDisplay
          summary={selectedSummary.structured_content}
          sourceText={linkedMaterial?.extracted_text}
          geminiConfigured={geminiConfigured}
          isSaved
          onCreateQuizFromSummary={() => onCreateQuizFromSummary(selectedSummary)}
        />
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 select-none dark:text-white">
            Saved Summaries
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Reopen any saved study guide to review, ask follow-up questions, or export as PDF.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSummarizer}
          className="rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#192F5D] whitespace-nowrap shrink-0 select-none dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          New Summary
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="mt-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or subject..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3.5 pl-9.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1 select-none dark:border-slate-800 dark:bg-slate-900">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'short', label: 'Short' },
              { id: 'detailed', label: 'Detailed' },
              { id: 'comprehensive', label: 'Comprehensive' },
            ] as const
          ).map((tab) => {
            const active = levelFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLevelFilter(tab.id)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-10 text-center dark:border-slate-800 dark:bg-slate-900/40">
          <BookOpen className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 font-display text-base font-semibold text-slate-900 select-none dark:text-white">
            {summaries.length === 0 ? 'No saved summaries yet' : 'No summaries match your filter'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summaries.length === 0
              ? 'Generate a study summary and click "Save Summary" to keep it in your library.'
              : 'Try adjusting your search keywords or summary depth filter.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 divide-y divide-slate-200 dark:divide-slate-800">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-700 select-none dark:text-cyan-400">
                  {item.subject_area} ·{' '}
                  {item.summary_level === 'short'
                    ? 'Short Summary'
                    : item.summary_level === 'detailed'
                      ? 'Detailed Summary'
                      : 'Comprehensive Study Notes'}{' '}
                  · {new Date(item.created_at).toLocaleDateString()}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedSummary(item)}
                  className="mt-1 text-left font-display text-base font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-cyan-400"
                >
                  {item.title}
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0 select-none">
                <button
                  type="button"
                  onClick={() => setSelectedSummary(item)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Open Summary
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  aria-label={`Delete ${item.title}`}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
