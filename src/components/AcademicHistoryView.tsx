import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  BookOpen,
  Calendar,
  Check,
  FileCheck2,
  GraduationCap,
  History,
  ListChecks,
  MessageSquareText,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  deleteAiSession,
  deleteQuizAttempt,
  deleteStudySummary,
  renameStudySummary,
} from '../lib/supabase';
import type {
  AiSessionRecord,
  QuizAttemptRecord,
  QuizRecord,
  StudySummaryRecord,
} from '../types/brainstine';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface AcademicHistoryViewProps {
  summaries: StudySummaryRecord[];
  quizzes: QuizRecord[];
  attempts: QuizAttemptRecord[];
  chatSessions: AiSessionRecord[];
  tutorSessions: AiSessionRecord[];
  onRefresh: () => void;
  onOpenSummary: (summaryId: string) => void;
  onOpenAttempt: (attempt: QuizAttemptRecord) => void;
  onOpenChatSession: (sessionId: string) => void;
  onOpenTutorSession: (sessionId: string) => void;
}

type HistoryFilterType = 'all' | 'assessment' | 'summary' | 'chat' | 'tutor';
type DateFilterPreset = 'all' | 'today' | '7d' | '30d' | 'custom';
type SortDirection = 'newest' | 'oldest';

type UnifiedRecord =
  | {
      kind: 'assessment';
      id: string;
      title: string;
      subject: string;
      timestamp: string;
      mode: 'practice' | 'exam';
      attempt: QuizAttemptRecord;
      attemptNumber: number;
      attemptTotal: number;
      deltaPct: number | null;
    }
  | {
      kind: 'summary';
      id: string;
      title: string;
      subject: string;
      timestamp: string;
      summary: StudySummaryRecord;
    }
  | {
      kind: 'chat';
      id: string;
      title: string;
      subject: string;
      timestamp: string;
      session: AiSessionRecord;
    }
  | {
      kind: 'tutor';
      id: string;
      title: string;
      subject: string;
      timestamp: string;
      session: AiSessionRecord;
    };

export function AcademicHistoryView({
  summaries,
  quizzes,
  attempts,
  chatSessions,
  tutorSessions,
  onRefresh,
  onOpenSummary,
  onOpenAttempt,
  onOpenChatSession,
  onOpenTutorSession,
}: AcademicHistoryViewProps) {
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<HistoryFilterType>('all');
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sortOrder, setSortOrder] = useState<SortDirection>('newest');

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UnifiedRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const quizLookup = useMemo(() => {
    const map = new Map<string, QuizRecord>();
    for (const q of quizzes) {
      map.set(q.id, q);
    }
    return map;
  }, [quizzes]);

  const enrichedAttempts = useMemo(() => {
    // Group by quiz_id or normalized title to compute Attempt # and score deltas
    const groups = new Map<string, QuizAttemptRecord[]>();
    const asc = attempts
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    for (const att of asc) {
      const key = att.quiz_id ? `q:${att.quiz_id}` : `t:${att.title.toLowerCase()}`;
      const list = groups.get(key) || [];
      list.push(att);
      groups.set(key, list);
    }

    const metaById = new Map<
      string,
      {
        mode: 'practice' | 'exam';
        subject: string;
        attemptNumber: number;
        attemptTotal: number;
        deltaPct: number | null;
      }
    >();

    for (const [, group] of groups) {
      for (let i = 0; i < group.length; i++) {
        const att = group[i];
        const linkedQuiz = att.quiz_id ? quizLookup.get(att.quiz_id) : undefined;
        const mode: 'practice' | 'exam' =
          linkedQuiz && linkedQuiz.time_limit_minutes && linkedQuiz.time_limit_minutes > 0
            ? 'exam'
            : 'practice';
        const prevPct = i > 0 ? Number(group[i - 1].percentage) : null;
        const deltaPct =
          prevPct !== null ? Number((Number(att.percentage) - prevPct).toFixed(1)) : null;

        metaById.set(att.id, {
          mode,
          subject: linkedQuiz?.subject_area || 'General Studies',
          attemptNumber: i + 1,
          attemptTotal: group.length,
          deltaPct,
        });
      }
    }

    return { asc, metaById };
  }, [attempts, quizLookup]);

  // Overall Performance Stats (100% genuine Supabase records)
  const stats = useMemo(() => {
    let practiceCount = 0;
    let examCount = 0;
    let practiceSum = 0;
    let examSum = 0;
    let totalSum = 0;

    for (const att of attempts) {
      const pct = Number(att.percentage) || 0;
      totalSum += pct;
      const meta = enrichedAttempts.metaById.get(att.id);
      if (meta?.mode === 'exam') {
        examCount += 1;
        examSum += pct;
      } else {
        practiceCount += 1;
        practiceSum += pct;
      }
    }

    const avgScore =
      attempts.length > 0 ? Number((totalSum / attempts.length).toFixed(1)) : null;
    const practiceAvg =
      practiceCount > 0 ? Number((practiceSum / practiceCount).toFixed(1)) : null;
    const examAvg = examCount > 0 ? Number((examSum / examCount).toFixed(1)) : null;

    const trendPoints = enrichedAttempts.asc.slice(-10);
    const overallDelta =
      trendPoints.length >= 2
        ? Number(
            (
              Number(trendPoints[trendPoints.length - 1].percentage) -
              Number(trendPoints[0].percentage)
            ).toFixed(1)
          )
        : null;

    return {
      totalSummaries: summaries.length,
      practiceCount,
      examCount,
      totalAssessments: attempts.length,
      totalTutorSessions: tutorSessions.length,
      totalChatSessions: chatSessions.length,
      avgScore,
      practiceAvg,
      examAvg,
      trendPoints,
      overallDelta,
    };
  }, [summaries.length, attempts, enrichedAttempts, tutorSessions.length, chatSessions.length]);

  const allRecords = useMemo<UnifiedRecord[]>(() => {
    const list: UnifiedRecord[] = [];

    for (const att of attempts) {
      const meta = enrichedAttempts.metaById.get(att.id);
      list.push({
        kind: 'assessment',
        id: att.id,
        title: att.title,
        subject: meta?.subject || 'General Studies',
        timestamp: att.created_at,
        mode: meta?.mode || 'practice',
        attempt: att,
        attemptNumber: meta?.attemptNumber || 1,
        attemptTotal: meta?.attemptTotal || 1,
        deltaPct: meta?.deltaPct ?? null,
      });
    }

    for (const sum of summaries) {
      list.push({
        kind: 'summary',
        id: sum.id,
        title: sum.title,
        subject: sum.subject_area || 'General Studies',
        timestamp: sum.updated_at || sum.created_at,
        summary: sum,
      });
    }

    for (const session of chatSessions) {
      list.push({
        kind: 'chat',
        id: session.id,
        title: session.title,
        subject: session.subject_area || 'General Studies',
        timestamp: session.updated_at || session.created_at,
        session,
      });
    }

    for (const session of tutorSessions) {
      list.push({
        kind: 'tutor',
        id: session.id,
        title: session.title,
        subject: session.subject_area || 'Guided Study',
        timestamp: session.updated_at || session.created_at,
        session,
      });
    }

    return list;
  }, [attempts, enrichedAttempts.metaById, summaries, chatSessions, tutorSessions]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const fromMs = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null;
    const toMs = customTo ? new Date(`${customTo}T23:59:59.999`).getTime() : null;

    return allRecords
      .filter((rec) => {
        if (typeFilter !== 'all' && rec.kind !== typeFilter) return false;
        if (
          q &&
          !rec.title.toLowerCase().includes(q) &&
          !rec.subject.toLowerCase().includes(q)
        ) {
          return false;
        }

        const ts = new Date(rec.timestamp).getTime();
        if (datePreset === 'today' && ts < startOfToday.getTime()) return false;
        if (datePreset === '7d' && ts < now - 7 * 24 * 60 * 60 * 1000) return false;
        if (datePreset === '30d' && ts < now - 30 * 24 * 60 * 60 * 1000) return false;
        if (datePreset === 'custom') {
          if (fromMs !== null && ts < fromMs) return false;
          if (toMs !== null && ts > toMs) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const ta = new Date(a.timestamp).getTime();
        const tb = new Date(b.timestamp).getTime();
        return sortOrder === 'newest' ? tb - ta : ta - tb;
      });
  }, [allRecords, typeFilter, searchQuery, datePreset, customFrom, customTo, sortOrder]);

  const startRename = (summary: StudySummaryRecord) => {
    setErrorMsg(null);
    setRenamingId(summary.id);
    setRenameDraft(summary.title);
  };

  const submitRename = async (summary: StudySummaryRecord) => {
    if (!user || savingRename) return;
    const clean = renameDraft.trim();
    if (!clean) {
      setErrorMsg('Please enter a non-empty summary title.');
      return;
    }
    setSavingRename(true);
    setErrorMsg(null);
    try {
      await renameStudySummary(user.id, summary.id, clean);
      setRenamingId(null);
      setRenameDraft('');
      onRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to rename summary.');
    } finally {
      setSavingRename(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      if (deleteTarget.kind === 'assessment') {
        await deleteQuizAttempt(user.id, deleteTarget.id);
      } else if (deleteTarget.kind === 'summary') {
        await deleteStudySummary(user.id, deleteTarget.id);
      } else {
        await deleteAiSession(user.id, deleteTarget.id);
      }
      setDeleteTarget(null);
      onRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete academic record.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall Academic Performance Summary */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold tracking-wide text-blue-700 select-none dark:text-cyan-400">
              My Academic History & Records
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-slate-900 select-none dark:text-white">
              Overall Academic Performance
            </h2>
          </div>
          <span className="font-mono text-xs text-slate-500 tabular-nums select-none dark:text-slate-400">
            {allRecords.length} total saved {allRecords.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
              Summaries Saved
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
              {stats.totalSummaries}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
              Quizzes Completed
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
              {stats.practiceCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
              Exams Completed
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
              {stats.examCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
              Avg Quiz & Exam
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-blue-700 tabular-nums dark:text-cyan-400">
              {stats.avgScore !== null ? `${stats.avgScore}%` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
              Chatbot Chats
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
              {stats.totalChatSessions}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
              Tutoring Sessions
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
              {stats.totalTutorSessions}
            </p>
          </div>
        </div>

        {/* Performance Trends Over Time (from actual completed attempts only) */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-2 select-none">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <TrendingUp className="h-4 w-4 text-blue-700 dark:text-cyan-400" aria-hidden="true" />
              <span>Performance Trend Over Time</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {stats.practiceAvg !== null && <span>Practice Avg: {stats.practiceAvg}%</span>}
              {stats.examAvg !== null && <span>Exam Avg: {stats.examAvg}%</span>}
              {stats.overallDelta !== null && (
                <span
                  className={
                    stats.overallDelta > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : stats.overallDelta < 0
                        ? 'text-red-700 dark:text-red-400'
                        : ''
                  }
                >
                  Recent Change: {stats.overallDelta > 0 ? `+${stats.overallDelta}%` : `${stats.overallDelta}%`}
                </span>
              )}
            </div>
          </div>

          {stats.trendPoints.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Complete a quiz or exam in Quiz &amp; Exam to see your genuine score progression over time.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5 lg:grid-cols-10">
              {stats.trendPoints.map((pt) => {
                const pct = Math.max(0, Math.min(100, Number(pt.percentage) || 0));
                const meta = enrichedAttempts.metaById.get(pt.id);
                return (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() => onOpenAttempt(pt)}
                    title={`${pt.title} · ${pct}%`}
                    className="group flex flex-col justify-end rounded-lg border border-slate-200 bg-white p-2 text-left transition-colors hover:border-blue-500 dark:border-slate-800 dark:bg-slate-950/60"
                  >
                    <div className="flex h-16 w-full items-end rounded-sm bg-slate-100 p-0.5 dark:bg-slate-900">
                      <div
                        className={`w-full rounded-xs transition-all ${
                          meta?.mode === 'exam'
                            ? 'bg-[#0F1E3D] dark:bg-blue-500'
                            : 'bg-blue-600 dark:bg-cyan-400'
                        }`}
                        style={{ height: `${Math.max(8, pct)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 font-mono text-xs font-bold text-slate-900 tabular-nums dark:text-white">
                      {pct}%
                    </p>
                    <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                      {new Date(pt.created_at).toLocaleDateString()}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Search, Filters & Unified Academic Records */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 select-none dark:text-white">
              Saved Academic Records
            </h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Search, filter, reopen, rename, or remove your saved quizzes, summaries, AI chats, and tutoring sessions.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 select-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}</span>
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Filter Controls */}
        <div className="mt-5 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

            <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 select-none dark:border-slate-800 dark:bg-slate-900">
              {(
                [
                  { id: 'all', label: 'All Types' },
                  { id: 'assessment', label: 'Quizzes & Exams' },
                  { id: 'summary', label: 'Summaries' },
                  { id: 'chat', label: 'AI Chat' },
                  { id: 'tutor', label: 'AI Tutor' },
                ] as const
              ).map((tab) => {
                const active = typeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTypeFilter(tab.id)}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
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

          <div className="flex flex-wrap items-center gap-2 select-none">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Date:</span>
            </span>
            {(
              [
                { id: 'all', label: 'All Dates' },
                { id: 'today', label: 'Today' },
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
                { id: 'custom', label: 'Custom Range' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDatePreset(opt.id)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  datePreset === opt.id
                    ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-cyan-400 dark:bg-blue-950/40 dark:text-cyan-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}

            {datePreset === 'custom' && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label="From date"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label="To date"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            )}
          </div>
        </div>

        {/* Records List */}
        {filteredRecords.length === 0 ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-10 text-center dark:border-slate-800 dark:bg-slate-900/40">
            <History className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-3 font-display text-base font-semibold text-slate-900 select-none dark:text-white">
              {allRecords.length === 0 ? 'No academic records yet' : 'No records match your filters'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {allRecords.length === 0
                ? 'Summaries, completed quizzes/exams, AI chat conversations, and AI tutor sessions will automatically appear here.'
                : 'Try clearing your search query or adjusting the activity type or date filter.'}
            </p>
          </div>
        ) : (
          <div className="mt-5 divide-y divide-slate-200 dark:divide-slate-800">
            {filteredRecords.map((rec) => {
              const icon =
                rec.kind === 'assessment' ? (
                  <ListChecks className="h-4 w-4" aria-hidden="true" />
                ) : rec.kind === 'summary' ? (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                ) : rec.kind === 'chat' ? (
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <GraduationCap className="h-4 w-4" aria-hidden="true" />
                );

              const typeLabel =
                rec.kind === 'assessment'
                  ? rec.mode === 'exam'
                    ? 'Exam'
                    : 'Quiz (Practice)'
                  : rec.kind === 'summary'
                    ? 'Summary'
                    : rec.kind === 'chat'
                      ? 'AI Chat'
                      : 'AI Tutor';

              return (
                <div
                  key={`${rec.kind}-${rec.id}`}
                  className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 items-start gap-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-cyan-400">
                      {icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-blue-700 select-none dark:text-cyan-400">
                        {typeLabel} · {rec.subject} ·{' '}
                        <span className="font-mono text-slate-500 tabular-nums dark:text-slate-400">
                          {new Date(rec.timestamp).toLocaleString()}
                        </span>
                      </p>

                      {rec.kind === 'summary' && renamingId === rec.id ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') submitRename(rec.summary);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            aria-label="New summary title"
                            className="w-full max-w-sm rounded-lg border border-blue-500 bg-white px-3 py-1 text-sm font-medium text-slate-900 select-text focus:outline-none dark:bg-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => submitRename(rec.summary)}
                            disabled={savingRename}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#0F1E3D] px-2.5 py-1 text-xs font-semibold text-white dark:bg-blue-600"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className="rounded-lg border border-slate-200 p-1 text-slate-500 dark:border-slate-700"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <p className="mt-0.5 truncate font-display text-sm font-semibold text-slate-900 select-text dark:text-white">
                          {rec.title}
                        </p>
                      )}

                      {rec.kind === 'assessment' && (
                        <p className="mt-0.5 font-mono text-xs text-slate-600 tabular-nums dark:text-slate-400">
                          Score: {rec.attempt.percentage}% ({rec.attempt.earned_marks}/
                          {rec.attempt.max_marks}) · {rec.attempt.correct_count}/
                          {rec.attempt.total_questions} correct
                          {rec.attemptTotal > 1 &&
                            ` · Attempt #${rec.attemptNumber} of ${rec.attemptTotal}`}
                          {rec.deltaPct !== null && (
                            <span
                              className={`ml-1.5 ${
                                rec.deltaPct > 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : rec.deltaPct < 0
                                    ? 'text-red-700 dark:text-red-400'
                                    : ''
                              }`}
                            >
                              ({rec.deltaPct > 0 ? `+${rec.deltaPct}%` : `${rec.deltaPct}%`} vs prev)
                            </span>
                          )}
                        </p>
                      )}

                      {rec.kind === 'summary' && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {rec.summary.summary_level === 'short'
                            ? 'Short Summary'
                            : rec.summary.summary_level === 'detailed'
                              ? 'Detailed Summary'
                              : 'Comprehensive Study Notes'}
                        </p>
                      )}

                      {rec.kind === 'tutor' && (
                        <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                          Level: {(rec.session.tutor_mode || 'standard').toUpperCase()} · Step{' '}
                          {rec.session.tutor_step}
                          {rec.session.tutor_stage_label
                            ? ` · ${rec.session.tutor_stage_label}`
                            : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 select-none">
                    {rec.kind === 'assessment' && (
                      <button
                        type="button"
                        onClick={() => onOpenAttempt(rec.attempt)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>View Results</span>
                      </button>
                    )}

                    {rec.kind === 'summary' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenSummary(rec.summary.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Open Summary</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => startRename(rec.summary)}
                          aria-label={`Rename ${rec.title}`}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </>
                    )}

                    {rec.kind === 'chat' && (
                      <button
                        type="button"
                        onClick={() => onOpenChatSession(rec.session.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Continue Chat</span>
                      </button>
                    )}

                    {rec.kind === 'tutor' && (
                      <button
                        type="button"
                        onClick={() => onOpenTutorSession(rec.session.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Resume Lesson</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(rec)}
                      aria-label={`Delete ${rec.title}`}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        title="Delete academic record?"
        itemName={deleteTarget?.title}
        description="This permanently removes this record from your Supabase Academic History. This action cannot be undone."
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
