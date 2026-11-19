import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Clock,
  FileText,
  GraduationCap,
  ListChecks,
  MessageSquareText,
  Sparkles,
} from 'lucide-react';
import type {
  DashboardSection,
  QuizAttemptRecord,
  StudyActivityRecord,
  StudyMaterialRecord,
  StudySummaryRecord,
} from '../types/brainstine';

interface DashboardOverviewProps {
  displayName: string;
  materials: StudyMaterialRecord[];
  summaries: StudySummaryRecord[];
  activities: StudyActivityRecord[];
  attempts: QuizAttemptRecord[];
  onNavigate: (section: DashboardSection) => void;
  onSummarizeMaterial: (material: StudyMaterialRecord) => void;
}

export function DashboardOverview({
  displayName,
  materials,
  summaries,
  activities,
  attempts,
  onNavigate,
  onSummarizeMaterial,
}: DashboardOverviewProps) {
  return (
    <div className="space-y-6">
      {/* Personalized Welcome Banner + Primary Tool Launch */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-[#0D162B]">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-semibold tracking-wide text-blue-700 select-none dark:text-cyan-400">
              Academic Workspace
            </p>
            <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-slate-900 select-none sm:text-3xl dark:text-white">
              Welcome back, {displayName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Upload course readings, summarize notes, ask Brainstine AI Chat, learn step by step with your Personal AI Tutor, snap study photos, or sit an exam.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0 select-none">
            <button
              type="button"
              onClick={() => onNavigate('summarizer')}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0F1E3D] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>AI Summarizer</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              <span>AI Chat</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('tutor')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              <span>AI Tutor</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('quizzes')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              <span>Quiz / Exam</span>
            </button>
          </div>
        </div>

        {/* Clean Tabular Summary Strip */}
        <div className="mt-7 grid grid-cols-1 gap-4 border-t border-slate-200 pt-6 sm:grid-cols-3 dark:border-slate-800">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-medium text-slate-500 select-none dark:text-slate-400">
              Uploaded Materials
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {materials.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-medium text-slate-500 select-none dark:text-slate-400">
              Saved Summaries
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {summaries.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-medium text-slate-500 select-none dark:text-slate-400">
              Completed Assessments
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {attempts.length}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Recent Study Activities */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-[#0D162B]">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 select-none dark:border-slate-800">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Recent Study Activities
            </h2>
            <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          {activities.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No recent activity recorded
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Upload a study file or generate a summary to track your academic progress.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {activities.slice(0, 6).map((act) => (
                <div key={act.id} className="py-3.5 first:pt-4 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {act.title}
                    </p>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0 select-none">
                      {new Date(act.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    {act.detail}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Saved Summaries & Quick Access */}
        <div className="space-y-6 lg:col-span-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 select-none dark:border-slate-800">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Saved Summaries
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('summaries')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-cyan-400"
              >
                <span>View all</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {summaries.length === 0 ? (
              <div className="py-6 text-center">
                <BookOpen className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Saved summaries will appear here for quick revision.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {summaries.slice(0, 3).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onNavigate('summaries')}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {s.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {s.subject_area} · {s.summary_level}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 select-none dark:border-slate-800">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Quick Access to Uploaded Materials
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('materials')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-cyan-400"
              >
                <span>Manage</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {materials.length === 0 ? (
              <div className="py-6 text-center">
                <FileText className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Uploaded PDFs, images, and audio transcripts appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {materials.slice(0, 3).map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {m.title}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {m.material_type.toUpperCase()} · {m.word_count.toLocaleString()} words
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSummarizeMaterial(m)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 select-none dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Summarize
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
