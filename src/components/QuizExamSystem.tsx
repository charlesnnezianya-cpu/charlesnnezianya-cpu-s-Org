import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  History,
  KeyRound,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  deleteQuiz,
  recordStudyActivity,
  saveQuizAttemptRecord,
  saveQuizRecord,
} from '../lib/supabase';
import type {
  GeneratedQuizPayload,
  QuizAttemptRecord,
  QuizDifficulty,
  QuizFormat,
  QuizGradingResponse,
  QuizQuestion,
  QuizQuestionCount,
  QuizRecord,
  QuizSourceMode,
  StructuredSummary,
  StudentAnswer,
  StudyMaterialRecord,
  StudySummaryRecord,
} from '../types/brainstine';

interface QuizExamSystemProps {
  materials: StudyMaterialRecord[];
  summaries: StudySummaryRecord[];
  quizzes: QuizRecord[];
  attempts: QuizAttemptRecord[];
  geminiConfigured: boolean;
  preselectedSource?: {
    mode: QuizSourceMode;
    materialId?: string;
    summaryId?: string;
    inlineSummary?: StructuredSummary;
  } | null;
  onDataChanged: () => void;
}

type ExamStage = 'setup' | 'exam' | 'results';

function formatSeconds(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function QuizExamSystem({
  materials,
  summaries,
  quizzes,
  attempts,
  geminiConfigured,
  preselectedSource,
  onDataChanged,
}: QuizExamSystemProps) {
  const { user, isConfigured } = useAuth();

  const [stage, setStage] = useState<ExamStage>('setup');
  const [setupTab, setSetupTab] = useState<'create' | 'saved' | 'history'>('create');

  // Setup state
  const [sourceMode, setSourceMode] = useState<QuizSourceMode>('material');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [selectedSummaryId, setSelectedSummaryId] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');
  const [topicTitle, setTopicTitle] = useState<string>('');
  const [inlineSummaryText, setInlineSummaryText] = useState<string>('');

  const [questionCount, setQuestionCount] = useState<QuizQuestionCount>(10);
  const [format, setFormat] = useState<QuizFormat>('objective');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('intermediate');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(0); // 0 = untimed

  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active exam state
  const [activeQuiz, setActiveQuiz] = useState<{
    quizId: string | null;
    title: string;
    subjectArea: string;
    format: QuizFormat;
    difficulty: QuizDifficulty;
    timeLimitMinutes: number | null;
    questions: QuizQuestion[];
  } | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [answersMap, setAnswersMap] = useState<Record<string, StudentAnswer>>({});
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false);
  const [grading, setGrading] = useState<boolean>(false);

  // Results state
  const [gradingResult, setGradingResult] = useState<QuizGradingResponse | null>(null);
  const [resultMeta, setResultMeta] = useState<{
    title: string;
    format: QuizFormat;
    difficulty: QuizDifficulty;
    createdAt?: string;
  } | null>(null);

  useEffect(() => {
    if (preselectedSource) {
      setStage('setup');
      setSetupTab('create');
      setSourceMode(preselectedSource.mode);
      if (preselectedSource.materialId) {
        setSelectedMaterialId(preselectedSource.materialId);
      }
      if (preselectedSource.summaryId) {
        setSelectedSummaryId(preselectedSource.summaryId);
      }
      if (preselectedSource.inlineSummary) {
        setSourceMode('text');
        setTopicTitle(preselectedSource.inlineSummary.title);
        setInlineSummaryText(preselectedSource.inlineSummary.markdown);
        setPastedText(preselectedSource.inlineSummary.markdown);
      }
    }
  }, [preselectedSource]);

  useEffect(() => {
    if (!selectedMaterialId && materials.length > 0) {
      setSelectedMaterialId(materials[0].id);
    }
  }, [materials, selectedMaterialId]);

  useEffect(() => {
    if (!selectedSummaryId && summaries.length > 0) {
      setSelectedSummaryId(summaries[0].id);
    }
  }, [summaries, selectedSummaryId]);

  // Countdown & elapsed timer during active examination
  useEffect(() => {
    if (stage !== 'exam' || !activeQuiz || grading) return;

    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [stage, activeQuiz, grading]);

  // Auto-submit when countdown timer expires
  useEffect(() => {
    if (
      stage === 'exam' &&
      activeQuiz?.timeLimitMinutes &&
      activeQuiz.timeLimitMinutes > 0 &&
      !grading
    ) {
      const limitSec = activeQuiz.timeLimitMinutes * 60;
      if (elapsedSeconds >= limitSec) {
        submitExamination(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds, stage, activeQuiz, grading]);

  const resolvedSource = useMemo(() => {
    if (sourceMode === 'material') {
      const mat = materials.find((m) => m.id === selectedMaterialId);
      return {
        text: mat?.extracted_text || '',
        title: mat?.title || '',
        materialId: mat?.id || null,
        summaryId: null,
      };
    }
    if (sourceMode === 'summary') {
      const sum = summaries.find((s) => s.id === selectedSummaryId);
      return {
        text: sum?.markdown_content || '',
        title: sum?.title || '',
        materialId: sum?.material_id || null,
        summaryId: sum?.id || null,
      };
    }
    if (sourceMode === 'text') {
      return {
        text: pastedText || inlineSummaryText,
        title: topicTitle || 'Study Assessment',
        materialId: null,
        summaryId: null,
      };
    }
    return {
      text: '',
      title: topicTitle,
      materialId: null,
      summaryId: null,
    };
  }, [
    sourceMode,
    materials,
    selectedMaterialId,
    summaries,
    selectedSummaryId,
    pastedText,
    inlineSummaryText,
    topicTitle,
  ]);

  const handleGenerateAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!geminiConfigured) {
      setErrorMsg(
        'GEMINI_API_KEY is missing. Configure GEMINI_API_KEY in Replit Secrets (or Settings > Secrets) to generate quizzes.'
      );
      return;
    }

    if (sourceMode === 'topic' && resolvedSource.title.trim().length < 3) {
      setErrorMsg('Please enter a subject or topic (at least 3 characters).');
      return;
    }
    if (sourceMode !== 'topic' && resolvedSource.text.trim().length < 30) {
      setErrorMsg(
        sourceMode === 'material'
          ? 'Please upload a study material first or choose another quiz source.'
          : sourceMode === 'summary'
            ? 'Please save a summary first or choose another quiz source.'
            : 'Please paste at least 30 characters of study material.'
      );
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/quizzes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceMode,
          sourceText: resolvedSource.text,
          topicTitle: resolvedSource.title,
          format,
          difficulty,
          questionCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Quiz generation failed.');
      }

      const generated = data as GeneratedQuizPayload;
      let savedQuizId: string | null = null;

      if (user && isConfigured) {
        try {
          const saved = await saveQuizRecord({
            userId: user.id,
            title: generated.title,
            subjectArea: generated.subjectArea,
            sourceMode,
            materialId: resolvedSource.materialId,
            summaryId: resolvedSource.summaryId,
            format: generated.format,
            difficulty: generated.difficulty,
            questionCount: generated.questionCount,
            timeLimitMinutes: timeLimitMinutes > 0 ? timeLimitMinutes : null,
            questions: generated.questions,
          });
          savedQuizId = saved.id;
          onDataChanged();
        } catch (saveErr) {
          console.warn('Quiz save warning:', saveErr);
        }
      }

      startExamSession({
        quizId: savedQuizId,
        title: generated.title,
        subjectArea: generated.subjectArea,
        format: generated.format,
        difficulty: generated.difficulty,
        timeLimitMinutes: timeLimitMinutes > 0 ? timeLimitMinutes : null,
        questions: generated.questions,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate quiz.');
    } finally {
      setGenerating(false);
    }
  };

  const startExamSession = (quiz: {
    quizId: string | null;
    title: string;
    subjectArea: string;
    format: QuizFormat;
    difficulty: QuizDifficulty;
    timeLimitMinutes: number | null;
    questions: QuizQuestion[];
  }) => {
    setActiveQuiz(quiz);
    setCurrentIdx(0);
    setAnswersMap({});
    setElapsedSeconds(0);
    setShowSubmitConfirm(false);
    setGradingResult(null);
    setResultMeta(null);
    setErrorMsg(null);
    setStage('exam');
  };

  const isQuestionAnswered = (q: QuizQuestion): boolean => {
    const ans = answersMap[q.id];
    if (!ans) return false;
    if (q.type === 'objective') {
      return ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null;
    }
    return Boolean(ans.textResponse && ans.textResponse.trim().length > 0);
  };

  const answeredCount = activeQuiz
    ? activeQuiz.questions.filter((q) => isQuestionAnswered(q)).length
    : 0;

  const submitExamination = async (autoTriggered = false) => {
    if (!activeQuiz || grading) return;
    setShowSubmitConfirm(false);
    setGrading(true);
    setErrorMsg(null);

    try {
      const answersArray = activeQuiz.questions.map((q) => {
        return (
          answersMap[q.id] || {
            questionId: q.id,
            selectedOptionIndex: null,
            textResponse: '',
          }
        );
      });

      const res = await fetch('/api/quizzes/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizTitle: activeQuiz.title,
          questions: activeQuiz.questions,
          answers: answersArray,
          timeTakenSeconds: elapsedSeconds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Examination grading failed.');
      }

      const graded = data as QuizGradingResponse;
      setGradingResult(graded);
      setResultMeta({
        title: activeQuiz.title,
        format: activeQuiz.format,
        difficulty: activeQuiz.difficulty,
        createdAt: new Date().toISOString(),
      });
      setStage('results');

      if (user && isConfigured) {
        try {
          await saveQuizAttemptRecord({
            userId: user.id,
            quizId: activeQuiz.quizId,
            title: activeQuiz.title,
            format: activeQuiz.format,
            difficulty: activeQuiz.difficulty,
            answers: answersArray,
            grading: graded,
          });
          await recordStudyActivity({
            userId: user.id,
            activityType: 'quiz',
            title: activeQuiz.title,
            detail: `${autoTriggered ? 'Timed auto-submit' : 'Completed'} · ${graded.percentage}% (${graded.earnedMarks}/${graded.maxMarks} marks)`,
            materialType: 'text',
          });
          onDataChanged();
        } catch (saveErr) {
          console.warn('Attempt persistence warning:', saveErr);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to grade examination.');
    } finally {
      setGrading(false);
    }
  };

  const reopenPastAttempt = (attempt: QuizAttemptRecord) => {
    setGradingResult({
      totalQuestions: attempt.total_questions,
      correctCount: attempt.correct_count,
      incorrectCount: attempt.incorrect_count,
      unansweredCount: attempt.unanswered_count,
      earnedMarks: Number(attempt.earned_marks),
      maxMarks: Number(attempt.max_marks),
      percentage: Number(attempt.percentage),
      timeTakenSeconds: attempt.time_taken_seconds,
      performanceAssessment: attempt.performance_summary,
      gradedResults: attempt.graded_results,
    });
    setResultMeta({
      title: attempt.title,
      format: attempt.format,
      difficulty: attempt.difficulty,
      createdAt: attempt.created_at,
    });
    setActiveQuiz(null);
    setStage('results');
  };

  const handleDeleteSavedQuiz = async (quizId: string) => {
    if (!user) return;
    try {
      await deleteQuiz(user.id, quizId);
      onDataChanged();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not delete quiz.');
    }
  };

  // ============================================================================
  // STAGE 2: ACTIVE EXAMINATION INTERFACE
  // ============================================================================
  if (stage === 'exam' && activeQuiz) {
    const currentQuestion = activeQuiz.questions[currentIdx];
    const currentAnswer = answersMap[currentQuestion.id];
    const total = activeQuiz.questions.length;
    const progressPct = Math.round((answeredCount / total) * 100);
    const remainingSeconds =
      activeQuiz.timeLimitMinutes && activeQuiz.timeLimitMinutes > 0
        ? Math.max(0, activeQuiz.timeLimitMinutes * 60 - elapsedSeconds)
        : null;

    return (
      <div className="space-y-6">
        {/* Examination Top Status Bar */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D162B]">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-blue-700 select-none dark:text-cyan-400">
                Examination Mode · {activeQuiz.format.toUpperCase()} · {activeQuiz.difficulty.toUpperCase()}
              </p>
              <h2 className="mt-0.5 truncate font-display text-lg font-bold text-slate-900 select-none dark:text-white">
                {activeQuiz.title}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0 select-none">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-cyan-400" aria-hidden="true" />
                {remainingSeconds !== null ? (
                  <span className={remainingSeconds <= 60 ? 'text-red-600 dark:text-red-400' : ''}>
                    Time left: {formatSeconds(remainingSeconds)}
                  </span>
                ) : (
                  <span>Elapsed: {formatSeconds(elapsedSeconds)}</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowSubmitConfirm(true)}
                disabled={grading}
                className="rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-60 whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {grading ? 'Grading...' : 'Submit Examination'}
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-1.5 select-none">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                Question {currentIdx + 1} of {total}
              </span>
              <span className="font-mono tabular-nums">
                {answeredCount} of {total} answered ({progressPct}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-200 dark:bg-cyan-400"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </section>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Question Stage */}
          <div className="lg:col-span-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4 select-none dark:border-slate-800">
                <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                  Question {currentIdx + 1} ·{' '}
                  {currentQuestion.type === 'objective' ? 'Objective (1 mark)' : `Theory (${currentQuestion.maxMarks} marks)`}
                </span>
                {currentQuestion.topicTag && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {currentQuestion.topicTag}
                  </span>
                )}
              </div>

              <h3 className="mt-5 font-display text-lg font-semibold leading-snug text-slate-900 select-text dark:text-white">
                {currentQuestion.question}
              </h3>

              {currentQuestion.type === 'objective' && currentQuestion.options ? (
                <div className="mt-6 space-y-3" role="radiogroup" aria-label={`Options for question ${currentIdx + 1}`}>
                  {currentQuestion.options.map((optText, optIdx) => {
                    const letter = String.fromCharCode(65 + optIdx);
                    const isSelected = currentAnswer?.selectedOptionIndex === optIdx;
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() =>
                          setAnswersMap((prev) => ({
                            ...prev,
                            [currentQuestion.id]: {
                              questionId: currentQuestion.id,
                              selectedOptionIndex: optIdx,
                            },
                          }))
                        }
                        className={`flex w-full items-start gap-3.5 rounded-xl border p-4 text-left transition-colors ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/80 text-slate-900 dark:border-cyan-400 dark:bg-blue-950/50 dark:text-white'
                            : 'border-slate-200 bg-slate-50/50 text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold select-none ${
                            isSelected
                              ? 'bg-blue-600 text-white dark:bg-cyan-400 dark:text-slate-950'
                              : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                          }`}
                        >
                          {letter}
                        </span>
                        <span className="text-sm leading-relaxed select-text">{optText}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6">
                  <label
                    htmlFor={`theory-input-${currentQuestion.id}`}
                    className="mb-2 block text-xs font-medium text-slate-600 select-none dark:text-slate-400"
                  >
                    Write your response clearly (key concepts, reasoning, and examples):
                  </label>
                  <textarea
                    id={`theory-input-${currentQuestion.id}`}
                    rows={7}
                    value={currentAnswer?.textResponse || ''}
                    onChange={(e) =>
                      setAnswersMap((prev) => ({
                        ...prev,
                        [currentQuestion.id]: {
                          questionId: currentQuestion.id,
                          textResponse: e.target.value,
                        },
                      }))
                    }
                    placeholder="Type your answer here..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              )}

              {/* Previous / Next Controls */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-5 select-none dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Previous</span>
                </button>

                {currentIdx < total - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentIdx((i) => Math.min(total - 1, i + 1))}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={grading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                  >
                    <span>Review & Submit</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Question Navigation Panel */}
          <aside className="lg:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 select-none dark:border-slate-800 dark:bg-[#0D162B]">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Question Navigator
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Answers are saved automatically as you move between questions.
              </p>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {activeQuiz.questions.map((q, idx) => {
                  const isCurrent = idx === currentIdx;
                  const answered = isQuestionAnswered(q);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIdx(idx)}
                      aria-label={`Question ${idx + 1}${answered ? ' (answered)' : ' (unanswered)'}`}
                      className={`h-9 rounded-lg font-mono text-xs font-semibold tabular-nums transition-colors ${
                        isCurrent
                          ? 'bg-[#0F1E3D] text-white ring-2 ring-blue-500 ring-offset-1 dark:bg-blue-600 dark:ring-cyan-400 dark:ring-offset-slate-950'
                          : answered
                            ? 'border border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-cyan-300'
                            : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center gap-4 border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border border-blue-300 bg-blue-100 dark:border-blue-700 dark:bg-blue-950" />
                  Answered ({answeredCount})
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900" />
                  Unanswered ({total - answeredCount})
                </span>
              </div>
            </div>
          </aside>
        </div>

        {/* Manual Submission Confirmation Modal */}
        {showSubmitConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#0D162B]">
              <h3 className="font-display text-lg font-bold text-slate-900 select-none dark:text-white">
                Submit Examination?
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                You have answered <strong className="font-mono tabular-nums">{answeredCount}</strong> of{' '}
                <strong className="font-mono tabular-nums">{total}</strong> questions.
                {total - answeredCount > 0 && (
                  <span className="block mt-1.5 text-amber-700 dark:text-amber-300">
                    {total - answeredCount} question{total - answeredCount === 1 ? '' : 's'} remain unanswered.
                  </span>
                )}
              </p>
              <div className="mt-6 flex items-center justify-end gap-3 select-none">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  disabled={grading}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Continue Exam
                </button>
                <button
                  type="button"
                  onClick={() => submitExamination(false)}
                  disabled={grading}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2 text-xs font-semibold text-white hover:bg-[#192F5D] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  {grading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>Grading Examination...</span>
                    </>
                  ) : (
                    <span>Confirm & Submit</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fullscreen Grading Overlay */}
        {grading && !showSubmitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
            <div className="rounded-2xl border border-slate-200 bg-white px-8 py-6 text-center shadow-xl dark:border-slate-800 dark:bg-[#0D162B]">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-600 dark:text-cyan-400" />
              <p className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                Evaluating your examination responses...
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // STAGE 3: RESULTS AND PERFORMANCE ANALYSIS
  // ============================================================================
  if (stage === 'results' && gradingResult && resultMeta) {
    const hasAiTheory = gradingResult.gradedResults.some((r) => r.aiEvaluated);

    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold tracking-wide text-blue-700 select-none dark:text-cyan-400">
                Examination Results · {resultMeta.format.toUpperCase()} · {resultMeta.difficulty.toUpperCase()}
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 select-text dark:text-white">
                {resultMeta.title}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 select-none">
              {activeQuiz && (
                <button
                  type="button"
                  onClick={() => startExamSession(activeQuiz)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Retake Exam</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setStage('setup')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#192F5D] dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <span>New Quiz or History</span>
              </button>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
                Percentage
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-blue-700 tabular-nums dark:text-cyan-400">
                {gradingResult.percentage}%
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
                Total Score
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                {gradingResult.earnedMarks}/{gradingResult.maxMarks}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
                Total Questions
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                {gradingResult.totalQuestions}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-emerald-700 select-none dark:text-emerald-400">
                Correct
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                {gradingResult.correctCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-red-700 select-none dark:text-red-400">
                Incorrect
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-red-700 tabular-nums dark:text-red-400">
                {gradingResult.incorrectCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
                Unanswered
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-700 tabular-nums dark:text-slate-300">
                {gradingResult.unansweredCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
                Time Taken
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                {formatSeconds(gradingResult.timeTakenSeconds)}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-700 select-none dark:text-slate-300">
              Performance Assessment
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700 select-text dark:text-slate-300">
              {gradingResult.performanceAssessment}
            </p>
            {hasAiTheory && (
              <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                Note: Theory question scores and feedback are automated AI evaluations based on the
                generated marking criteria and are intended for study practice, not official
                academic grading.
              </p>
            )}
          </div>
        </section>

        {/* Question-by-Question Review */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
          <h3 className="font-display text-lg font-bold text-slate-900 select-none dark:text-white">
            Question-by-Question Review
          </h3>

          <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {gradingResult.gradedResults.map((item) => {
              const statusLabel =
                item.status === 'correct'
                  ? 'Correct'
                  : item.status === 'partial'
                    ? 'Partial Credit'
                    : item.status === 'unanswered'
                      ? 'Unanswered'
                      : 'Incorrect';

              const statusColor =
                item.status === 'correct'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : item.status === 'partial'
                    ? 'text-amber-700 dark:text-amber-400'
                    : item.status === 'unanswered'
                      ? 'text-slate-500 dark:text-slate-400'
                      : 'text-red-700 dark:text-red-400';

              return (
                <div key={item.questionId} className="py-5 first:pt-2 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 select-none">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className="font-mono text-slate-500 tabular-nums dark:text-slate-400">
                        Q{item.number}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={`inline-flex items-center gap-1 ${statusColor}`}>
                        {item.status === 'correct' ? (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : item.status === 'incorrect' ? (
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : null}
                        {statusLabel}
                      </span>
                      {item.aiEvaluated && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-indigo-700 dark:text-indigo-400">
                            Automated AI Evaluation
                          </span>
                        </>
                      )}
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                      {item.marksAwarded} / {item.maxMarks} marks
                    </span>
                  </div>

                  <p className="mt-2 font-display text-base font-semibold text-slate-900 select-text dark:text-white">
                    {item.question}
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
                      <p className="text-[11px] font-semibold text-slate-500 select-none dark:text-slate-400">
                        Your Submitted Answer
                      </p>
                      <p className="mt-1 text-sm text-slate-800 select-text dark:text-slate-200">
                        {item.studentAnswerDisplay}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
                      <p className="text-[11px] font-semibold text-emerald-700 select-none dark:text-emerald-400">
                        Correct / Expected Answer
                      </p>
                      <p className="mt-1 text-sm text-slate-800 select-text dark:text-slate-200">
                        {item.expectedAnswerDisplay}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-slate-700 select-text dark:text-slate-300">
                    {item.feedback && (
                      <p>
                        <span className="font-semibold text-slate-900 select-none dark:text-white">
                          Feedback:{' '}
                        </span>
                        {item.feedback}
                      </p>
                    )}
                    {item.missingPoints && item.missingPoints.length > 0 && (
                      <p>
                        <span className="font-semibold text-amber-800 select-none dark:text-amber-300">
                          Missing points:{' '}
                        </span>
                        {item.missingPoints.join('; ')}
                      </p>
                    )}
                    <p>
                      <span className="font-semibold text-blue-700 select-none dark:text-cyan-400">
                        Explanation:{' '}
                      </span>
                      {item.explanation}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  // ============================================================================
  // STAGE 1: QUIZ GENERATOR & SAVED HISTORY
  // ============================================================================
  return (
    <div className="space-y-6">
      {!geminiConfigured && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <h3 className="font-display font-semibold select-none">
                AI Provider Configuration Required
              </h3>
              <p className="mt-1 text-xs leading-relaxed">
                Configure <code className="font-mono font-semibold">GEMINI_API_KEY</code> in Replit Secrets
                to generate new quizzes and grade theory responses. You can still review past
                examination results in your history below.
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 select-none dark:text-white">
              Quiz & Examination System
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Generate objective, theory, or mixed assessments from your materials, summaries, or
              topics.
            </p>
          </div>

          <div
            role="tablist"
            className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1 select-none dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              role="tab"
              aria-selected={setupTab === 'create'}
              onClick={() => setSetupTab('create')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                setupTab === 'create'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              New Exam
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={setupTab === 'saved'}
              onClick={() => setSetupTab('saved')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                setupTab === 'saved'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Saved ({quizzes.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={setupTab === 'history'}
              onClick={() => setSetupTab('history')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                setupTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Results ({attempts.length})
            </button>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {setupTab === 'create' && (
          <form onSubmit={handleGenerateAndStart} className="mt-6 space-y-6">
            {/* Source Mode */}
            <div>
              <p className="mb-2.5 text-xs font-semibold text-slate-700 select-none dark:text-slate-300">
                1. Assessment Source
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 select-none">
                {(
                  [
                    { id: 'material' as QuizSourceMode, label: 'Uploaded Material' },
                    { id: 'summary' as QuizSourceMode, label: 'Saved Summary' },
                    { id: 'text' as QuizSourceMode, label: 'Paste Text' },
                    { id: 'topic' as QuizSourceMode, label: 'Subject / Topic' },
                  ] as const
                ).map((item) => {
                  const active = sourceMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSourceMode(item.id)}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-cyan-400 dark:bg-blue-950/40 dark:text-cyan-300'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                {sourceMode === 'material' && (
                  <div>
                    {materials.length === 0 ? (
                      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                        No uploaded study materials found yet. Upload a document in the AI
                        Summarizer first, or switch to Paste Text or Subject / Topic.
                      </p>
                    ) : (
                      <select
                        value={selectedMaterialId}
                        onChange={(e) => setSelectedMaterialId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.title} ({m.material_type.toUpperCase()} · {m.word_count.toLocaleString()} words)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {sourceMode === 'summary' && (
                  <div>
                    {summaries.length === 0 ? (
                      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                        No saved summaries yet. Save a generated summary first, or switch to Paste
                        Text or Subject / Topic.
                      </p>
                    ) : (
                      <select
                        value={selectedSummaryId}
                        onChange={(e) => setSelectedSummaryId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        {summaries.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title} ({s.subject_area} · {s.summary_level})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {sourceMode === 'text' && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={topicTitle}
                      onChange={(e) => setTopicTitle(e.target.value)}
                      placeholder="Assessment title (optional)"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <textarea
                      rows={5}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="Paste study notes, lecture excerpts, or textbook paragraphs here..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                )}

                {sourceMode === 'topic' && (
                  <input
                    type="text"
                    value={topicTitle}
                    onChange={(e) => setTopicTitle(e.target.value)}
                    placeholder="Enter subject or topic (e.g., Keynesian Macroeconomics, Cellular Mitosis, Thermodynamics)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                )}
              </div>
            </div>

            {/* Parameters Row */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 select-none">
              {/* Format */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  2. Question Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as QuizFormat)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="objective">Objective (OBJ — A/B/C/D)</option>
                  <option value="theory">Theory (Short & Long Answer)</option>
                  <option value="mixed">Mixed (Objective + Theory)</option>
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  3. Question Count
                </label>
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value) as QuizQuestionCount)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value={10}>10 Questions</option>
                  <option value={20}>20 Questions</option>
                  <option value={30}>30 Questions</option>
                  <option value={40}>40 Questions</option>
                </select>
              </div>

              {/* Difficulty */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  4. Difficulty Level
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="easy">Easy (Foundational)</option>
                  <option value="intermediate">Intermediate (Conceptual)</option>
                  <option value="advanced">Advanced (Analytical)</option>
                  <option value="mixed">Mixed Difficulty</option>
                </select>
              </div>

              {/* Optional Countdown Timer */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  5. Countdown Timer
                </label>
                <select
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value={0}>No Time Limit</option>
                  <option value={10}>10 Minutes</option>
                  <option value={20}>20 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-slate-200 pt-5 select-none dark:border-slate-800">
              <button
                type="submit"
                disabled={generating || !geminiConfigured}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F1E3D] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Generating {questionCount} Questions...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    <span>Start Examination</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {setupTab === 'saved' && (
          <div className="mt-6">
            {quizzes.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
                <ListChecks className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                <p className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                  No saved quizzes yet
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Generated examinations are automatically saved here so you can retake them anytime.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {quizzes.map((q) => (
                  <div
                    key={q.id}
                    className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold text-slate-900 dark:text-white">
                        {q.title}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {q.subject_area} · {q.question_count} questions · {q.format} · {q.difficulty}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 select-none">
                      <button
                        type="button"
                        onClick={() =>
                          startExamSession({
                            quizId: q.id,
                            title: q.title,
                            subjectArea: q.subject_area,
                            format: q.format,
                            difficulty: q.difficulty,
                            timeLimitMinutes: q.time_limit_minutes,
                            questions: q.questions,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E3D] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#192F5D] dark:bg-blue-600 dark:hover:bg-blue-500"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Take Exam</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedQuiz(q.id)}
                        aria-label={`Delete ${q.title}`}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {setupTab === 'history' && (
          <div className="mt-6">
            {attempts.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
                <History className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                <p className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                  No completed examinations yet
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Complete a quiz or examination to review your scores and detailed question feedback.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {attempts.map((att) => (
                  <div
                    key={att.id}
                    className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold text-slate-900 dark:text-white">
                        {att.title}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        Score: {att.percentage}% ({att.earned_marks}/{att.max_marks}) · {att.format} ·{' '}
                        {new Date(att.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => reopenPastAttempt(att)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 select-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>View Results</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
