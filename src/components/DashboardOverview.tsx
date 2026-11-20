import React, { useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  Clock,
  FileCheck2,
  FileText,
  GraduationCap,
  History,
  ListChecks,
  MessageSquareText,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { EDUCATIONAL_VISUALS } from '../lib/educationalVisuals';
import type {
  AiSessionRecord,
  DashboardSection,
  QuizAttemptRecord,
  QuizRecord,
  StudyActivityRecord,
  StudyMaterialRecord,
  StudySummaryRecord,
} from '../types/brainstine';

interface DashboardOverviewProps {
  displayName: string;
  materials: StudyMaterialRecord[];
  summaries: StudySummaryRecord[];
  activities: StudyActivityRecord[];
  quizzes: QuizRecord[];
  attempts: QuizAttemptRecord[];
  chatSessions: AiSessionRecord[];
  tutorSessions: AiSessionRecord[];
  onNavigate: (section: DashboardSection) => void;
  onSummarizeMaterial: (material: StudyMaterialRecord) => void;
  onOpenAttempt: (attempt: QuizAttemptRecord) => void;
  onOpenSummary: (summaryId: string) => void;
}

export function DashboardOverview({
  displayName,
  materials,
  summaries,
  activities,
  quizzes,
  attempts,
  chatSessions,
  tutorSessions,
  onNavigate,
  onSummarizeMaterial,
  onOpenAttempt,
  onOpenSummary,
}: DashboardOverviewProps) {
  const quizLookup = useMemo(() => {
    const map = new Map<string, QuizRecord>();
    for (const q of quizzes) {
      map.set(q.id, q);
    }
    return map;
  }, [quizzes]);

  const performance = useMemo(() => {
    let practiceCount = 0;
    let examCount = 0;
    let scoreSum = 0;

    for (const att of attempts) {
      scoreSum += Number(att.percentage) || 0;
      const linkedQuiz = att.quiz_id ? quizLookup.get(att.quiz_id) : undefined;
      if (linkedQuiz?.time_limit_minutes && linkedQuiz.time_limit_minutes > 0) {
        examCount += 1;
      } else {
        practiceCount += 1;
      }
    }

    const averageScore =
      attempts.length > 0 ? Number((scoreSum / attempts.length).toFixed(1)) : null;

    const recentTrend = attempts
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-6);

    return {
      practiceCount,
      examCount,
      averageScore,
      totalConversations: chatSessions.length + tutorSessions.length,
      recentTrend,
    };
  }, [attempts, quizLookup, chatSessions.length, tutorSessions.length]);

  const totalSavedRecords =
    summaries.length + attempts.length + chatSessions.length + tutorSessions.length;

  return (
    <div className="space-y-6">
      {/* Executive Welcome Card & Core Metrics */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-[#0D162B]">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[#1D4ED8] dark:text-[#38BDF8]">
              Brainstine Study Workspace
            </p>
            <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Welcome back, {displayName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 academic-selectable">
              Launch any of your four AI learning engines below, inspect your visual study notes, or
              review your saved performance history.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-2.5 text-sm font-semibold text-[#0F1E3D] transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0 lg:self-center dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/60"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            <span>My Academic History</span>
          </button>
        </div>

        {/* Four Main AI Feature Launch Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 select-none">
          {[
            {
              section: 'summarizer' as DashboardSection,
              title: 'AI Study Summarizer',
              desc: 'Upload PDFs, images, audio, or notes for diagrams, tables, and structured revision.',
              icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
              iconBg: 'bg-[#0F1E3D] dark:bg-[#1D4ED8]',
              visual: EDUCATIONAL_VISUALS.summarizer,
            },
            {
              section: 'quizzes' as DashboardSection,
              title: 'AI Quiz & Exam Maker',
              desc: 'Generate 10–40 questions in Practice or timed Exam mode with graded explanations.',
              icon: <ListChecks className="h-4 w-4" aria-hidden="true" />,
              iconBg: 'bg-sky-600',
              visual: EDUCATIONAL_VISUALS.quiz,
            },
            {
              section: 'chat' as DashboardSection,
              title: 'AI Academic Chatbot',
              desc: 'Multi-turn academic Q&A with photo analysis, math equations, tables, and diagrams.',
              icon: <MessageSquareText className="h-4 w-4" aria-hidden="true" />,
              iconBg: 'bg-indigo-600',
              visual: EDUCATIONAL_VISUALS.chatbot,
            },
            {
              section: 'tutor' as DashboardSection,
              title: 'Personal AI Tutor',
              desc: 'Step-by-step guided lessons across Beginner, Standard, or Advanced pacing.',
              icon: <GraduationCap className="h-4 w-4" aria-hidden="true" />,
              iconBg: 'bg-emerald-600',
              visual: EDUCATIONAL_VISUALS.tutor,
            },
          ].map((card) => (
            <button
              key={card.section}
              type="button"
              onClick={() => onNavigate(card.section)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1D4ED8]/50 hover:bg-white hover:shadow-md active:translate-y-0 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-sky-500/50 dark:hover:bg-slate-900"
            >
              <div className="relative aspect-16/10 w-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                <img
                  src={card.visual.src}
                  alt={card.visual.alt}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent"
                />
                <div
                  className={`absolute bottom-2.5 left-3 flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm ${card.iconBg}`}
                >
                  {card.icon}
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-between p-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      {card.title}
                    </h2>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#1D4ED8] dark:group-hover:text-sky-400"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {card.desc}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Academic Performance Metrics Strip (strictly from Supabase data) */}
        <div className="mt-6 grid grid-cols-2 gap-3.5 border-t border-slate-200 pt-6 lg:grid-cols-4 select-none dark:border-slate-800">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Saved Summaries
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {summaries.length}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {materials.length} uploaded {materials.length === 1 ? 'material' : 'materials'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Completed Quizzes &amp; Exams
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {attempts.length}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {performance.practiceCount} practice · {performance.examCount} exam
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Average Quiz / Exam Score
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#1D4ED8] tabular-nums dark:text-[#38BDF8]">
              {performance.averageScore !== null ? `${performance.averageScore}%` : '—'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {attempts.length > 0
                ? 'Calculated from saved attempts'
                : 'No completed attempts yet'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              AI Study Sessions
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {performance.totalConversations}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {chatSessions.length} chat · {tutorSessions.length} tutor
            </p>
          </div>
        </div>
      </section>

      {/* My Academic History / Records Highlight Band */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-[#1D4ED8] dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-[#38BDF8]">
              <History className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                My Academic History &amp; Performance Records
              </h2>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                Search, filter by subject or date, review score trends, reopen chats or summaries,
                and manage your{' '}
                <span className="font-mono font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                  {totalSavedRecords}
                </span>{' '}
                saved Supabase records.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] whitespace-nowrap shrink-0 dark:bg-[#1D4ED8] dark:hover:bg-blue-500"
          >
            <span>Open My Records</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {performance.recentTrend.length > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <TrendingUp className="h-3.5 w-3.5 text-[#1D4ED8] dark:text-[#38BDF8]" aria-hidden="true" />
              <span>Recent Assessment Scores</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {performance.recentTrend.map((att) => {
                const pct = Math.max(0, Math.min(100, Number(att.percentage) || 0));
                const linkedQuiz = att.quiz_id ? quizLookup.get(att.quiz_id) : undefined;
                const isExam = Boolean(
                  linkedQuiz?.time_limit_minutes && linkedQuiz.time_limit_minutes > 0
                );
                return (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => onOpenAttempt(att)}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-left transition-colors hover:border-[#1D4ED8] dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 tabular-nums dark:text-white">
                        {pct}%
                      </span>
                      <span className="text-[10px] font-medium text-[#1D4ED8] dark:text-[#38BDF8]">
                        {isExam ? 'Exam' : 'Practice'}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                      {att.title}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Completed Quizzes &amp; Exams
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('history')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline dark:text-[#38BDF8]"
              >
                <span>All history</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {attempts.length === 0 ? (
              <div className="py-6 text-center">
                <ListChecks className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  No completed quizzes or exams yet. Launch AI Quiz Maker to test your knowledge.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {attempts.slice(0, 4).map((att) => {
                  const linkedQuiz = att.quiz_id ? quizLookup.get(att.quiz_id) : undefined;
                  const isExam = Boolean(
                    linkedQuiz?.time_limit_minutes && linkedQuiz.time_limit_minutes > 0
                  );
                  return (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-4 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {att.title}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                          {isExam ? 'Exam' : 'Practice'} · {att.percentage}% ({att.earned_marks}/
                          {att.max_marks}) · {new Date(att.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenAttempt(att)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>View Results</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Recent Academic Activities
              </h2>
              <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>

            {activities.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No recent activity recorded
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Generate a summary, complete a quiz, or chat with Brainstine AI to track your academic activities.
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
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
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
        </div>

        <div className="space-y-6 lg:col-span-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Saved Summaries
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('summaries')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline dark:text-[#38BDF8]"
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
                {summaries.slice(0, 4).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpenSummary(s.id)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left hover:opacity-80"
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
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Quick Access to Uploaded Materials
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('materials')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline dark:text-[#38BDF8]"
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
                {materials.slice(0, 4).map((m) => (
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
                      className="min-h-9 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
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
