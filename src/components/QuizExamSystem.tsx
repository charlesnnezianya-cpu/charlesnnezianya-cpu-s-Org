import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  FileText,
  History,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  TrendingUp,
  Upload,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  formatClientApiError,
  parseApiJsonResponse,
  resolveApiUrl,
  sanitizeUserErrorMessage,
} from '../lib/apiClient';
import {
  createStudyMaterialRecord,
  deleteQuiz,
  deleteQuizAttempt,
  getMaterialSignedUrl,
  getOptionalAccessToken,
  recordStudyActivity,
  uploadMaterialFileToStorage,
} from '../lib/supabase';
import type {
  ActiveAssessmentSummary,
  GeneratedQuizPayload,
  MaterialSourceType,
  QuizAnswerCheckResponse,
  QuizAssessmentMode,
  QuizAttemptRecord,
  QuizDifficulty,
  QuizFormat,
  QuizGradingResponse,
  QuizQuestion,
  QuizQuestionCount,
  QuizRecord,
  QuizSourceMode,
  RestoredQuizSessionResponse,
  StartQuizSessionResponse,
  StructuredSummary,
  StudentAnswer,
  StudyMaterialRecord,
  StudySummaryRecord,
} from '../types/brainstine';
import {
  hasSubjectVisualMatch,
  resolveSubjectVisual,
} from '../lib/educationalVisuals';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { EducationalDiagramRenderer } from './EducationalDiagramRenderer';
import { compressImageFile } from './SnapPhotoControl';
import { SubjectVisualBanner } from './SubjectVisualBanner';

interface QuizExamSystemProps {
  materials: StudyMaterialRecord[];
  summaries: StudySummaryRecord[];
  quizzes: QuizRecord[];
  attempts: QuizAttemptRecord[];
  geminiConfigured: boolean;
  initialAttemptToOpen?: QuizAttemptRecord | null;
  onConsumeAttemptToOpen?: () => void;
  preselectedSource?: {
    mode: QuizSourceMode;
    materialId?: string;
    summaryId?: string;
    inlineSummary?: StructuredSummary;
  } | null;
  onConsumePreselection?: () => void;
  onDataChanged: () => void;
  onActiveAttemptChange?: (active: boolean) => void;
}

type ExamStage = 'setup' | 'instructions' | 'exam' | 'results';

function formatSeconds(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function inferQuizUploadMimeType(fileName: string, rawType?: string | null): string {
  const cleaned = (rawType || '').split(';')[0].trim().toLowerCase();
  if (cleaned && cleaned !== 'application/octet-stream') {
    return cleaned === 'image/jpg' ? 'image/jpeg' : cleaned;
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function validateQuizUploadFile(file: File): {
  valid: boolean;
  type?: MaterialSourceType;
  error?: string;
} {
  if (file.size > 25 * 1024 * 1024) {
    return {
      valid: false,
      error: `"${file.name}" exceeds the 25 MB maximum upload limit. Please compress or split the file.`,
    };
  }
  const lowerName = file.name.toLowerCase();
  const lowerMime = (file.type || '').toLowerCase();
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return { valid: true, type: 'pdf' };
  }
  if (lowerMime.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif)$/.test(lowerName)) {
    return { valid: true, type: 'image' };
  }
  if (lowerMime === 'text/plain' || lowerMime === 'text/markdown' || /\.(txt|md)$/.test(lowerName)) {
    return { valid: true, type: 'text' };
  }
  return {
    valid: false,
    error: `Unsupported file type for "${file.name}". Please upload a PDF, PNG/JPG/WEBP image, or TXT/MD file.`,
  };
}

export function QuizExamSystem({
  materials,
  summaries,
  quizzes,
  attempts,
  geminiConfigured: _geminiConfigured,
  initialAttemptToOpen,
  onConsumeAttemptToOpen,
  preselectedSource,
  onConsumePreselection,
  onDataChanged,
  onActiveAttemptChange,
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

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [extractingUpload, setExtractingUpload] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [extractedUploadText, setExtractedUploadText] = useState<string>('');
  const [extractedUploadTitle, setExtractedUploadTitle] = useState<string>('');
  const [uploadedMaterialId, setUploadedMaterialId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [assessmentMode, setAssessmentMode] = useState<QuizAssessmentMode>('practice');
  const [questionCount, setQuestionCount] = useState<QuizQuestionCount>(10);
  const [format] = useState<QuizFormat>('objective');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('intermediate');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(20);

  const [generating, setGenerating] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveAssessmentSummary[]>([]);
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const generatingRef = useRef(false);
  const gradingRef = useRef(false);
  const syncTimeoutRef = useRef<number | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'quiz'; item: QuizRecord }
    | { kind: 'attempt'; item: QuizAttemptRecord }
    | null
  >(null);
  const [deletingRecord, setDeletingRecord] = useState(false);

  // Active exam / quiz state (server-managed sessionId + sealed sessionToken; zero answer keys stored client-side)
  const [activeQuiz, setActiveQuiz] = useState<{
    sessionId: string | null;
    sessionToken?: string | null;
    quizId: string | null;
    title: string;
    subjectArea: string;
    format: QuizFormat;
    difficulty: QuizDifficulty;
    assessmentMode: QuizAssessmentMode;
    timeLimitMinutes: number | null;
    startedAtMs?: number | null;
    deadlineAtMs?: number | null;
    requestedQuestionCount?: number;
    insufficientSourceNote?: string | null;
    questions: QuizQuestion[];
  } | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [answersMap, setAnswersMap] = useState<Record<string, StudentAnswer>>({});
  const [practiceFeedbackMap, setPracticeFeedbackMap] = useState<
    Record<string, QuizAnswerCheckResponse>
  >({});
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false);
  const [grading, setGrading] = useState<boolean>(false);

  // Results state
  const [gradingResult, setGradingResult] = useState<QuizGradingResponse | null>(null);
  const [resultMeta, setResultMeta] = useState<{
    attemptId?: string | null;
    quizId?: string | null;
    title: string;
    subjectArea: string;
    assessmentMode: QuizAssessmentMode;
    format: QuizFormat;
    difficulty: QuizDifficulty;
    createdAt?: string;
  } | null>(null);

  const quizLookup = useMemo(() => {
    const map = new Map<string, QuizRecord>();
    for (const q of quizzes) {
      map.set(q.id, q);
    }
    return map;
  }, [quizzes]);

  const reopenPastAttempt = useCallback(
    (attempt: QuizAttemptRecord) => {
      const linkedQuiz = attempt.quiz_id ? quizLookup.get(attempt.quiz_id) : undefined;
      const mode: QuizAssessmentMode =
        linkedQuiz && linkedQuiz.time_limit_minutes && linkedQuiz.time_limit_minutes > 0
          ? 'exam'
          : 'practice';
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
        attemptId: attempt.id,
        quizId: attempt.quiz_id,
        title: attempt.title,
        subjectArea: linkedQuiz?.subject_area || 'General Studies',
        assessmentMode: mode,
        format: attempt.format,
        difficulty: attempt.difficulty,
        createdAt: attempt.created_at,
      });
      setActiveQuiz(
        linkedQuiz
          ? {
              sessionId: null,
              quizId: linkedQuiz.id,
              title: linkedQuiz.title,
              subjectArea: linkedQuiz.subject_area,
              format: linkedQuiz.format,
              difficulty: linkedQuiz.difficulty,
              assessmentMode: mode,
              timeLimitMinutes: linkedQuiz.time_limit_minutes,
              questions: linkedQuiz.questions,
            }
          : null
      );
      setStage('results');
    },
    [quizLookup]
  );

  useEffect(() => {
    if (initialAttemptToOpen) {
      reopenPastAttempt(initialAttemptToOpen);
      onConsumeAttemptToOpen?.();
    }
  }, [initialAttemptToOpen, reopenPastAttempt, onConsumeAttemptToOpen]);

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
        setPastedText(preselectedSource.inlineSummary.markdown);
      }
      onConsumePreselection?.();
    }
  }, [preselectedSource, onConsumePreselection]);

  useEffect(() => {
    if (materials.length === 0) {
      if (selectedMaterialId) setSelectedMaterialId('');
    } else if (!selectedMaterialId || !materials.some((m) => m.id === selectedMaterialId)) {
      setSelectedMaterialId(materials[0].id);
    }
  }, [materials, selectedMaterialId]);

  useEffect(() => {
    if (summaries.length === 0) {
      if (selectedSummaryId) setSelectedSummaryId('');
    } else if (!selectedSummaryId || !summaries.some((s) => s.id === selectedSummaryId)) {
      setSelectedSummaryId(summaries[0].id);
    }
  }, [summaries, selectedSummaryId]);

  // Notify parent layout & protect against accidental browser refresh/close mid-attempt
  useEffect(() => {
    const isActive = stage === 'exam' && Boolean(activeQuiz) && !grading;
    onActiveAttemptChange?.(isActive);

    if (!isActive) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [stage, activeQuiz, grading, onActiveAttemptChange]);

  useEffect(() => {
    return () => {
      onActiveAttemptChange?.(false);
    };
  }, [onActiveAttemptChange]);

  const flushPendingSyncTimer = useCallback(() => {
    if (syncTimeoutRef.current !== null) {
      window.clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      flushPendingSyncTimer();
    };
  }, [flushPendingSyncTimer]);

  const syncProgressToServer = useCallback(
    async (
      sessionId: string | null,
      nextIdx: number,
      nextAnswers: Record<string, StudentAnswer>
    ) => {
      if (!sessionId) return;
      try {
        const accessToken = await getOptionalAccessToken();
        const res = await fetch(
          resolveApiUrl(`/api/quizzes/sessions/${encodeURIComponent(sessionId)}/progress`),
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
              sessionToken: sessionTokenRef.current,
              currentQuestionIndex: nextIdx,
              answers: nextAnswers,
            }),
          }
        );
        if (res.ok) {
          const saved = (await res.json()) as { sessionToken?: string | null };
          if (saved.sessionToken) {
            sessionTokenRef.current = saved.sessionToken;
          }
        }
      } catch {
        // Best-effort autosave; active session check or submission remains authoritative
      }
    },
    []
  );

  const scheduleProgressSync = useCallback(
    (
      sessionId: string | null,
      nextIdx: number,
      nextAnswers: Record<string, StudentAnswer>,
      immediate = false
    ) => {
      if (!sessionId) return;
      flushPendingSyncTimer();
      if (immediate) {
        void syncProgressToServer(sessionId, nextIdx, nextAnswers);
        return;
      }
      syncTimeoutRef.current = window.setTimeout(() => {
        syncTimeoutRef.current = null;
        void syncProgressToServer(sessionId, nextIdx, nextAnswers);
      }, 250);
    },
    [flushPendingSyncTimer, syncProgressToServer]
  );

  const loadActiveSessions = useCallback(async () => {
    if (isConfigured && !user) {
      setActiveSessions([]);
      return;
    }
    try {
      const accessToken = await getOptionalAccessToken();
      if (isConfigured && !accessToken) return;
      const res = await fetch(resolveApiUrl('/api/quizzes/sessions/active'), {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: ActiveAssessmentSummary[] };
      if (Array.isArray(data.sessions)) {
        setActiveSessions(data.sessions);
      }
    } catch {
      // Ignore network hiccup during passive active-session lookup
    }
  }, [isConfigured, user]);

  useEffect(() => {
    if (stage === 'setup') {
      void loadActiveSessions();
    }
  }, [stage, loadActiveSessions]);

  // Countdown & elapsed timer during active examination / quiz using server clock offset
  useEffect(() => {
    if (stage !== 'exam' || !activeQuiz || grading) return;

    const timer = window.setInterval(() => {
      const current = Date.now() + serverClockOffsetMs;
      setNowMs(current);
      if (activeQuiz.startedAtMs) {
        setElapsedSeconds(Math.max(0, Math.floor((current - activeQuiz.startedAtMs) / 1000)));
      } else {
        setElapsedSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [stage, activeQuiz, grading, serverClockOffsetMs]);

  // Auto-submit when server countdown deadline expires
  useEffect(() => {
    if (
      stage === 'exam' &&
      activeQuiz?.assessmentMode === 'exam' &&
      !grading &&
      !gradingRef.current
    ) {
      const remaining = activeQuiz.deadlineAtMs
        ? Math.max(0, Math.ceil((activeQuiz.deadlineAtMs - nowMs) / 1000))
        : activeQuiz.timeLimitMinutes && activeQuiz.timeLimitMinutes > 0
          ? Math.max(0, activeQuiz.timeLimitMinutes * 60 - elapsedSeconds)
          : null;

      if (remaining !== null && remaining <= 0) {
        submitExamination(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs, elapsedSeconds, stage, activeQuiz, grading]);

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
        text: pastedText,
        title: topicTitle || 'Study Assessment',
        materialId: null,
        summaryId: null,
      };
    }
    if (sourceMode === 'upload') {
      return {
        text: extractedUploadText,
        title: extractedUploadTitle || uploadFile?.name || 'Uploaded Assessment Material',
        materialId: uploadedMaterialId,
        summaryId: null,
      };
    }
    const topicWords = topicTitle
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9-]/g, ''))
      .filter((w) => w.length >= 3);
    let matchedTopicText = '';
    if (topicWords.length > 0) {
      const matMatches = materials
        .filter((m) => {
          const hay = `${m.title} ${m.extracted_text}`.toLowerCase();
          return topicWords.some((w) => hay.includes(w));
        })
        .map((m) => m.extracted_text);
      const sumMatches = summaries
        .filter((s) => {
          const hay = `${s.title} ${s.subject_area} ${s.markdown_content}`.toLowerCase();
          return topicWords.some((w) => hay.includes(w));
        })
        .map((s) => s.markdown_content);
      matchedTopicText = [...matMatches, ...sumMatches].slice(0, 3).join('\n\n');
    }

    return {
      text: matchedTopicText,
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
    topicTitle,
    extractedUploadText,
    extractedUploadTitle,
    uploadedMaterialId,
    uploadFile,
  ]);

  const HOSTED_DIRECT_UPLOAD_LIMIT_BYTES = Math.floor(3.8 * 1024 * 1024);
  const stagedStoragePathRef = useRef<string | null>(null);

  const handleQuizFileChosen = async (file: File | null) => {
    if (!file) return;
    if (uploading || extractingUpload) return;

    const isSameRetryFile = Boolean(uploadFile && file === uploadFile);
    if (!isSameRetryFile) {
      stagedStoragePathRef.current = null;
    }

    setUploadFile(file);
    setUploadErrorMsg(null);
    setUploadSuccessMsg(null);
    setExtractedUploadText('');
    setExtractedUploadTitle('');
    setUploadedMaterialId(null);

    const validation = validateQuizUploadFile(file);
    if (!validation.valid) {
      setUploadErrorMsg(validation.error || 'Unsupported file.');
      return;
    }

    setUploading(true);
    setExtractingUpload(true);
    setUploadProgress(15);

    try {
      let preparedFile = file;
      const inferredMime = inferQuizUploadMimeType(file.name, file.type);

      if (validation.type === 'image' && inferredMime !== 'image/gif') {
        preparedFile = await compressImageFile(file);
      }

      const arrayBuffer = await preparedFile.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        throw new Error(`"${file.name}" is empty (0 bytes). Please choose a valid study file.`);
      }

      const finalMime = inferQuizUploadMimeType(preparedFile.name, preparedFile.type || inferredMime);
      if (preparedFile.type !== finalMime) {
        preparedFile = new File([arrayBuffer], preparedFile.name, {
          type: finalMime,
          lastModified: preparedFile.lastModified || Date.now(),
        });
      }

      const isLocalOrigin =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '[::1]';

      let extractRes!: Response;
      const shouldUseStorageStaging =
        !isLocalOrigin && preparedFile.size > HOSTED_DIRECT_UPLOAD_LIMIT_BYTES;

      if (shouldUseStorageStaging) {
        if (!user || !isConfigured) {
          throw new Error(
            `Files larger than 3.8 MB require signing in with your Brainstine account (file is ${(preparedFile.size / (1024 * 1024)).toFixed(1)} MB). Please sign in or choose a smaller file.`
          );
        }

        let stagingSuccess = false;
        let storagePath = stagedStoragePathRef.current;
        if (!storagePath) {
          try {
            setUploadProgress(25);
            storagePath = await uploadMaterialFileToStorage(user.id, preparedFile, {
              preBuffered: arrayBuffer,
              onProgress: (pct) => {
                setUploadProgress(25 + Math.round(pct * 0.4));
              },
            });
            stagedStoragePathRef.current = storagePath;
            stagingSuccess = true;
          } catch (storageErr) {
            console.warn('Quiz storage staging failed, falling back to direct upload:', storageErr);
          }
        } else {
          stagingSuccess = true;
        }

        if (stagingSuccess && storagePath) {
          try {
            setUploadProgress(70);
            const signedStorageUrl = await getMaterialSignedUrl(storagePath);

            setUploadProgress(85);
            const extractController = new AbortController();
            const extractTimer = setTimeout(() => extractController.abort(), 120000);
            try {
              extractRes = await fetch(resolveApiUrl('/api/materials/extract'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                signal: extractController.signal,
                body: JSON.stringify({
                  signedStorageUrl,
                  fileName: preparedFile.name,
                  mimeType: finalMime,
                  fileSizeBytes: preparedFile.size,
                  title: file.name.replace(/\.[^/.]+$/, ''),
                }),
              });
            } finally {
              clearTimeout(extractTimer);
            }
          } catch (signedErr) {
            console.warn('Quiz signed URL extraction failed, falling back to direct upload:', signedErr);
            stagingSuccess = false;
          }
        }

        if (!stagingSuccess) {
          const formData = new FormData();
          formData.append('file', preparedFile, preparedFile.name);
          formData.append('title', file.name.replace(/\.[^/.]+$/, ''));

          setUploadProgress(50);
          const directController = new AbortController();
          const directTimer = setTimeout(() => directController.abort(), 120000);
          try {
            extractRes = await fetch(resolveApiUrl('/api/materials/extract'), {
              method: 'POST',
              signal: directController.signal,
              body: formData,
            });
          } finally {
            clearTimeout(directTimer);
          }
        }
      } else {
        const formData = new FormData();
        formData.append('file', preparedFile, preparedFile.name);
        formData.append('title', file.name.replace(/\.[^/.]+$/, ''));

        setUploadProgress(50);
        const directController = new AbortController();
        const directTimer = setTimeout(() => directController.abort(), 120000);
        try {
          extractRes = await fetch(resolveApiUrl('/api/materials/extract'), {
            method: 'POST',
            signal: directController.signal,
            body: formData,
          });
        } finally {
          clearTimeout(directTimer);
        }
      }

      setUploadProgress(95);
      const extracted = await parseApiJsonResponse<{
        title: string;
        extractedText: string;
        wordCount: number;
        chunkCount?: number;
        materialType?: MaterialSourceType;
        mimeType?: string;
      }>(extractRes, 'extracting uploaded study material');

      if (!extracted.extractedText || extracted.extractedText.trim().length < 20) {
        throw new Error(
          'Could not extract sufficient text from this document. Please ensure the document contains readable academic content or try another file.'
        );
      }

      setExtractedUploadText(extracted.extractedText);
      setExtractedUploadTitle(extracted.title);
      setUploadSuccessMsg(
        `Successfully extracted ${extracted.wordCount.toLocaleString()} words from "${extracted.title}". Ready for quiz generation.`
      );
      setUploadProgress(100);

      if (user && isConfigured) {
        try {
          const savedMat = await createStudyMaterialRecord({
            userId: user.id,
            title: extracted.title,
            materialType: extracted.materialType || validation.type || 'text',
            fileName: preparedFile.name,
            fileSize: preparedFile.size,
            mimeType: extracted.mimeType || finalMime,
            storagePath: stagedStoragePathRef.current,
            extractedText: extracted.extractedText,
            wordCount: extracted.wordCount,
            chunkCount: extracted.chunkCount ?? 1,
          });
          setUploadedMaterialId(savedMat.id);
          onDataChanged();
        } catch (dbErr) {
          console.warn('Material save notice:', dbErr);
        }
      }
    } catch (err: unknown) {
      stagedStoragePathRef.current = null;
      setUploadErrorMsg(
        formatClientApiError(
          err,
          'extracting uploaded file',
          'Document extraction timed out while waiting for the server. Your file remains selected—please click Retry to try again.'
        )
      );
    } finally {
      setUploading(false);
      setExtractingUpload(false);
    }
  };

  const handleGenerateAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (generatingRef.current) return;
    setErrorMsg(null);

    if (sourceMode === 'topic' && resolvedSource.title.trim().length < 3) {
      setErrorMsg('Please enter a subject or topic (at least 3 characters).');
      return;
    }
    if (sourceMode !== 'topic' && resolvedSource.text.trim().length < 30) {
      setErrorMsg(
        sourceMode === 'material'
          ? 'Please select a study material or choose another quiz source.'
          : sourceMode === 'upload'
            ? 'Please upload and extract a valid file or choose another quiz source.'
            : sourceMode === 'summary'
              ? 'Please save a summary first or choose another quiz source.'
              : 'Please paste at least 30 characters of study material.'
      );
      return;
    }

    const effectiveTimeLimit =
      assessmentMode === 'exam' ? Math.max(10, timeLimitMinutes || 20) : null;

    generatingRef.current = true;
    setGenerating(true);
    setCloudNotice(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150000);
    try {
      const accessToken = await getOptionalAccessToken();
      const persistedSourceMode: QuizSourceMode =
        sourceMode === 'upload'
          ? resolvedSource.materialId
            ? 'material'
            : 'text'
          : sourceMode;

      const rawText = resolvedSource.text;
      const boundedSourceText =
        rawText.length <= 750_000
          ? rawText
          : [
              rawText.slice(0, 260_000),
              rawText.slice(Math.floor(rawText.length * 0.4), Math.floor(rawText.length * 0.4) + 240_000),
              rawText.slice(rawText.length - 250_000),
            ].join('\n\n');

      const res = await fetch(resolveApiUrl('/api/quizzes/generate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          sourceMode: persistedSourceMode,
          sourceText: boundedSourceText,
          topicTitle: resolvedSource.title,
          format: 'objective',
          difficulty,
          questionCount,
          assessmentMode,
          timeLimitMinutes: effectiveTimeLimit,
          materialId: resolvedSource.materialId,
          summaryId: resolvedSource.summaryId,
        }),
      });
      const generated = await parseApiJsonResponse<GeneratedQuizPayload>(
        res,
        'generating your quiz'
      );

      if (user && isConfigured) {
        if (generated.quizId) {
          onDataChanged();
        } else {
          setCloudNotice(
            'Assessment generated for this session, but could not be saved to your cloud library right now.'
          );
        }
      }

      sessionTokenRef.current = generated.sessionToken ?? null;
      prepareExamInstructions({
        sessionId: generated.sessionId || null,
        sessionToken: generated.sessionToken ?? null,
        quizId: generated.quizId ?? null,
        title: generated.title,
        subjectArea: generated.subjectArea,
        format: generated.format,
        difficulty: generated.difficulty,
        assessmentMode: generated.assessmentMode || assessmentMode,
        timeLimitMinutes: generated.timeLimitMinutes ?? effectiveTimeLimit,
        requestedQuestionCount: generated.requestedQuestionCount ?? questionCount,
        insufficientSourceNote: generated.insufficientSourceNote ?? null,
        questions: generated.questions,
      });
    } catch (err: unknown) {
      setErrorMsg(
        formatClientApiError(
          err,
          'generating your quiz',
          'Assessment generation timed out. Please try fewer questions or try again shortly.'
        )
      );
    } finally {
      clearTimeout(timer);
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  const prepareExamInstructions = (quiz: {
    sessionId: string | null;
    sessionToken?: string | null;
    quizId: string | null;
    title: string;
    subjectArea: string;
    format: QuizFormat;
    difficulty: QuizDifficulty;
    assessmentMode: QuizAssessmentMode;
    timeLimitMinutes: number | null;
    requestedQuestionCount?: number;
    insufficientSourceNote?: string | null;
    questions: QuizQuestion[];
  }) => {
    sessionTokenRef.current = quiz.sessionToken ?? null;
    setActiveQuiz(quiz);
    setCurrentIdx(0);
    setAnswersMap({});
    setPracticeFeedbackMap({});
    setElapsedSeconds(0);
    setShowSubmitConfirm(false);
    setGradingResult(null);
    setResultMeta(null);
    setErrorMsg(null);
    setCloudNotice(null);
    setRestoredNotice(null);
    setStage('instructions');
  };

  const startExamSession = async (
    quiz: {
      sessionId: string | null;
      sessionToken?: string | null;
      quizId: string | null;
      title: string;
      subjectArea: string;
      format: QuizFormat;
      difficulty: QuizDifficulty;
      assessmentMode: QuizAssessmentMode;
      timeLimitMinutes: number | null;
      requestedQuestionCount?: number;
      insufficientSourceNote?: string | null;
      questions: QuizQuestion[];
    },
    retake = false
  ) => {
    if (startingSession) return;
    setStartingSession(true);
    setErrorMsg(null);
    setCloudNotice(null);
    setRestoredNotice(null);

    try {
      const accessToken = await getOptionalAccessToken();
      const res = await fetch(resolveApiUrl('/api/quizzes/sessions/start'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          sessionId: quiz.sessionId,
          sessionToken: quiz.sessionToken ?? sessionTokenRef.current,
          quizId: quiz.quizId,
          assessmentMode: quiz.assessmentMode,
          timeLimitMinutes: quiz.timeLimitMinutes,
          retake,
        }),
      });
      const started = await parseApiJsonResponse<StartQuizSessionResponse>(
        res,
        'starting your assessment session'
      );

      const offset =
        typeof started.serverNowMs === 'number' ? started.serverNowMs - Date.now() : 0;
      const effectiveNow = Date.now() + offset;
      setServerClockOffsetMs(offset);
      setNowMs(effectiveNow);
      sessionTokenRef.current = started.sessionToken ?? quiz.sessionToken ?? null;
      setActiveQuiz({
        sessionId: started.sessionId,
        sessionToken: started.sessionToken ?? quiz.sessionToken ?? null,
        quizId: started.quizId,
        title: started.title,
        subjectArea: started.subjectArea,
        format: started.format,
        difficulty: started.difficulty,
        assessmentMode: started.assessmentMode,
        timeLimitMinutes: started.timeLimitMinutes,
        startedAtMs: started.startedAtMs,
        deadlineAtMs: started.deadlineAtMs,
        requestedQuestionCount: quiz.requestedQuestionCount,
        insufficientSourceNote: quiz.insufficientSourceNote,
        questions: started.questions,
      });
      setCurrentIdx(0);
      setAnswersMap({});
      setPracticeFeedbackMap({});
      setElapsedSeconds(
        started.startedAtMs ? Math.max(0, Math.floor((effectiveNow - started.startedAtMs) / 1000)) : 0
      );
      setShowSubmitConfirm(false);
      setGradingResult(null);
      setResultMeta(null);
      setStage('exam');
    } catch (err: unknown) {
      setErrorMsg(
        formatClientApiError(
          err,
          'starting your assessment session',
          'Could not start this assessment session. Please generate a new assessment or try again.'
        )
      );
    } finally {
      setStartingSession(false);
    }
  };

  const handleResumeSession = async (sessionId: string) => {
    if (resumingSessionId) return;
    setResumingSessionId(sessionId);
    setErrorMsg(null);
    setCloudNotice(null);
    setRestoredNotice(null);

    try {
      const accessToken = await getOptionalAccessToken();
      const res = await fetch(resolveApiUrl('/api/quizzes/sessions/restore'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          sessionId,
          sessionToken: sessionTokenRef.current,
        }),
      });
      const restored = await parseApiJsonResponse<RestoredQuizSessionResponse>(
        res,
        'restoring your assessment session'
      );

      if (restored.status === 'expired_submitted') {
        setActiveSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        setGradingResult(restored.grading);
        setResultMeta({
          attemptId: restored.grading.attemptId ?? null,
          quizId: restored.quizId,
          title: restored.title,
          subjectArea: restored.subjectArea || 'General Studies',
          assessmentMode: restored.assessmentMode,
          format: restored.format,
          difficulty: restored.difficulty,
          createdAt: new Date().toISOString(),
        });
        const linkedQuiz = restored.quizId ? quizLookup.get(restored.quizId) : undefined;
        setActiveQuiz(
          linkedQuiz
            ? {
                sessionId: restored.sessionId,
                quizId: linkedQuiz.id,
                title: linkedQuiz.title,
                subjectArea: linkedQuiz.subject_area,
                format: linkedQuiz.format,
                difficulty: linkedQuiz.difficulty,
                assessmentMode: restored.assessmentMode,
                timeLimitMinutes: linkedQuiz.time_limit_minutes,
                questions: linkedQuiz.questions,
              }
            : {
                sessionId: restored.sessionId,
                quizId: restored.quizId,
                title: restored.title,
                subjectArea: restored.subjectArea,
                format: restored.format,
                difficulty: restored.difficulty,
                assessmentMode: restored.assessmentMode,
                timeLimitMinutes: null,
                questions: [],
              }
        );
        setCloudNotice(
          'Your timed examination deadline passed while you were away, so your previously saved answers were automatically submitted and graded.'
        );
        onDataChanged();
        setStage('results');
        return;
      }

      const offset = restored.serverNowMs - Date.now();
      const effectiveNow = Date.now() + offset;
      setServerClockOffsetMs(offset);
      setNowMs(effectiveNow);
      sessionTokenRef.current = restored.sessionToken ?? null;
      setActiveQuiz({
        sessionId: restored.sessionId,
        sessionToken: restored.sessionToken ?? null,
        quizId: restored.quizId,
        title: restored.title,
        subjectArea: restored.subjectArea,
        format: restored.format,
        difficulty: restored.difficulty,
        assessmentMode: restored.assessmentMode,
        timeLimitMinutes: restored.timeLimitMinutes,
        startedAtMs: restored.startedAtMs,
        deadlineAtMs: restored.deadlineAtMs,
        questions: restored.questions,
      });
      setCurrentIdx(
        Math.min(
          Math.max(0, restored.currentQuestionIndex || 0),
          Math.max(0, restored.questions.length - 1)
        )
      );
      setAnswersMap(restored.answers || {});
      setPracticeFeedbackMap(restored.practiceFeedback || {});
      setElapsedSeconds(
        restored.startedAtMs ? Math.max(0, Math.floor((effectiveNow - restored.startedAtMs) / 1000)) : 0
      );
      setShowSubmitConfirm(false);
      setGradingResult(null);
      setResultMeta(null);
      setRestoredNotice(
        restored.assessmentMode === 'exam'
          ? 'Examination restored with your saved answers and original server countdown.'
          : 'Quiz session restored with your saved progress and locked question feedback.'
      );
      setStage('exam');
    } catch (err: unknown) {
      await loadActiveSessions();
      setErrorMsg(
        formatClientApiError(
          err,
          'restoring your assessment session',
          'Could not restore this assessment session.'
        )
      );
    } finally {
      setResumingSessionId(null);
    }
  };

  const handleCheckPracticeAnswer = async (question: QuizQuestion) => {
    if (!activeQuiz?.sessionId || checkingAnswer) return;
    const selectedIdx = answersMap[question.id]?.selectedOptionIndex;
    if (typeof selectedIdx !== 'number') return;

    setCheckingAnswer(true);
    setErrorMsg(null);
    try {
      const accessToken = await getOptionalAccessToken();
      const res = await fetch(resolveApiUrl('/api/quizzes/answer'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          sessionId: activeQuiz.sessionId,
          sessionToken: activeQuiz.sessionToken ?? sessionTokenRef.current,
          questionId: question.id,
          selectedOptionIndex: selectedIdx,
        }),
      });
      const checked = await parseApiJsonResponse<QuizAnswerCheckResponse>(
        res,
        'checking your answer'
      );
      if (checked.sessionToken) {
        sessionTokenRef.current = checked.sessionToken;
        setActiveQuiz((prev) => (prev ? { ...prev, sessionToken: checked.sessionToken } : prev));
      }
      setPracticeFeedbackMap((prev) => ({
        ...prev,
        [question.id]: checked,
      }));
    } catch (err: unknown) {
      setErrorMsg(
        formatClientApiError(
          err,
          'checking your answer',
          'Could not verify this answer right now. Please try again.'
        )
      );
    } finally {
      setCheckingAnswer(false);
    }
  };

  const isQuestionAnswered = (q: QuizQuestion): boolean => {
    const ans = answersMap[q.id];
    if (!ans) return false;
    return ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null;
  };

  const answeredCount = activeQuiz
    ? activeQuiz.questions.filter((q) => isQuestionAnswered(q)).length
    : 0;

  const submitExamination = async (autoTriggered = false) => {
    if (!activeQuiz || !activeQuiz.sessionId || gradingRef.current) return;
    flushPendingSyncTimer();
    gradingRef.current = true;
    setShowSubmitConfirm(false);
    setGrading(true);
    setErrorMsg(null);
    setCloudNotice(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150000);

    try {
      const answersArray = activeQuiz.questions.map((q) => {
        return (
          answersMap[q.id] || {
            questionId: q.id,
            selectedOptionIndex: null,
          }
        );
      });

      const accessToken = await getOptionalAccessToken();
      const res = await fetch(resolveApiUrl('/api/quizzes/grade'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: activeQuiz.sessionId,
          sessionToken: activeQuiz.sessionToken ?? sessionTokenRef.current,
          answers: answersArray,
          timeTakenSeconds: elapsedSeconds,
          autoSubmitted: autoTriggered,
        }),
      });

      if (autoTriggered && res.status === 403) {
        const restoreRes = await fetch(resolveApiUrl('/api/quizzes/sessions/restore'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            sessionId: activeQuiz.sessionId,
            sessionToken: activeQuiz.sessionToken ?? sessionTokenRef.current,
          }),
        });
        if (restoreRes.ok) {
          const restored = (await restoreRes.json()) as RestoredQuizSessionResponse;
          if (restored.status === 'expired_submitted') {
            setActiveSessions((prev) => prev.filter((s) => s.sessionId !== activeQuiz.sessionId));
            setGradingResult(restored.grading);
            setResultMeta({
              attemptId: restored.grading.attemptId ?? null,
              quizId: activeQuiz.quizId,
              title: activeQuiz.title,
              subjectArea: activeQuiz.subjectArea || 'General Studies',
              assessmentMode: activeQuiz.assessmentMode,
              format: activeQuiz.format,
              difficulty: activeQuiz.difficulty,
              createdAt: new Date().toISOString(),
            });
            setCloudNotice(
              'The examination deadline expired and your saved answers were automatically graded.'
            );
            onDataChanged();
            setStage('results');
            return;
          }
        }
      }

      const graded = await parseApiJsonResponse<QuizGradingResponse>(
        res,
        'grading your assessment'
      );
      const mode: QuizAssessmentMode = activeQuiz.assessmentMode;
      setActiveSessions((prev) => prev.filter((s) => s.sessionId !== activeQuiz.sessionId));
      setRestoredNotice(null);

      if (user && isConfigured) {
        try {
          await recordStudyActivity({
            userId: user.id,
            activityType: 'quiz',
            title: activeQuiz.title,
            detail: `${mode === 'exam' ? 'Exam Mode' : 'Quiz Practice Mode'}${
              autoTriggered ? ' (auto-submitted)' : ''
            } · ${graded.percentage}% (${graded.earnedMarks}/${graded.maxMarks} marks)`,
            materialType: 'text',
          });
          onDataChanged();
        } catch (saveErr) {
          setCloudNotice(
            `Your score was graded, but your activity log could not sync right now: ${sanitizeUserErrorMessage(
              saveErr,
              'saving your activity'
            )}`
          );
        }
      }

      setGradingResult(graded);
      setResultMeta({
        attemptId: graded.attemptId ?? null,
        quizId: activeQuiz.quizId,
        title: activeQuiz.title,
        subjectArea: activeQuiz.subjectArea || 'General Studies',
        assessmentMode: mode,
        format: activeQuiz.format,
        difficulty: activeQuiz.difficulty,
        createdAt: new Date().toISOString(),
      });
      setStage('results');
    } catch (err: unknown) {
      setErrorMsg(
        formatClientApiError(
          err,
          'grading your assessment',
          'Submission timed out. Please try again.'
        )
      );
    } finally {
      clearTimeout(timer);
      gradingRef.current = false;
      setGrading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeletingRecord(true);
    setErrorMsg(null);
    try {
      if (deleteTarget.kind === 'quiz') {
        await deleteQuiz(user.id, deleteTarget.item.id);
      } else {
        await deleteQuizAttempt(user.id, deleteTarget.item.id);
      }
      setDeleteTarget(null);
      onDataChanged();
    } catch (err: unknown) {
      setErrorMsg(sanitizeUserErrorMessage(err, 'deleting your record'));
    } finally {
      setDeletingRecord(false);
    }
  };

  // ============================================================================
  // STAGE 1B: PRE-EXAM / PRE-QUIZ INSTRUCTIONS SCREEN
  // ============================================================================
  if (stage === 'instructions' && activeQuiz) {
    const isTimedExam =
      activeQuiz.assessmentMode === 'exam' &&
      Boolean(activeQuiz.timeLimitMinutes && activeQuiz.timeLimitMinutes > 0);
    const totalMarks = activeQuiz.questions.reduce((acc, q) => acc + (q.maxMarks || 1), 0);

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {cloudNotice && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{cloudNotice}</span>
          </div>
        )}

        {activeQuiz.insufficientSourceNote && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-cyan-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{activeQuiz.insufficientSourceNote}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-8 dark:border-slate-800 dark:bg-[#0D162B]">
          <p className="text-xs font-semibold tracking-wide text-[#1D4ED8] dark:text-[#38BDF8]">
            {isTimedExam ? 'Timed Exam Instructions' : 'Quiz Mode Instructions'} ·{' '}
            {activeQuiz.subjectArea}
          </p>
          <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
            {activeQuiz.title}
          </h2>

          <div className="mt-5 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:mt-6 sm:grid-cols-4 sm:gap-3.5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Questions</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-white">
                {activeQuiz.questions.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total Marks</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-white">
                {totalMarks}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Format</p>
              <p className="mt-1 text-xs font-semibold capitalize text-slate-900 sm:text-sm dark:text-white">
                {activeQuiz.format} · {activeQuiz.difficulty}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Duration</p>
              <p className="mt-1 font-mono text-xs font-bold text-[#1D4ED8] tabular-nums sm:text-sm dark:text-[#38BDF8]">
                {isTimedExam ? `${activeQuiz.timeLimitMinutes} mins` : 'Untimed'}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Before You Begin
            </h3>
            <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed">
              {isTimedExam ? (
                <>
                  <li>
                    Use the Question Navigator panel to jump directly to any question; your selected
                    options are preserved automatically during the session.
                  </li>
                  <li>
                    Answer keys remain strictly protected on the server until you submit or time
                    expires.
                  </li>
                  <li>
                    Your {activeQuiz.timeLimitMinutes}-minute server-tracked countdown starts
                    immediately when you click Begin Assessment and will auto-submit on expiry.
                  </li>
                </>
              ) : (
                <>
                  <li>
                    Questions are shown one at a time in sequence. Choose an option and click{' '}
                    <strong>Check Answer</strong> to see immediate feedback.
                  </li>
                  <li>
                    After checking each answer, the correct option highlights in green along with
                    an explanation and source page reference.
                  </li>
                  <li>
                    Quiz mode is untimed. When you finish the final question, your full score
                    summary is recorded automatically.
                  </li>
                </>
              )}
              <li>
                Brainstine guards against accidental page refresh or leaving this screen mid-attempt.
              </li>
            </ul>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setActiveQuiz(null);
                setStage('setup');
              }}
              disabled={startingSession}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Back to Setup
            </button>
            <button
              type="button"
              onClick={() => startExamSession(activeQuiz)}
              disabled={startingSession}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F1E3D] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-60 sm:w-auto dark:bg-[#1D4ED8] dark:hover:bg-blue-500"
            >
              {startingSession ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Starting Session...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>{isTimedExam ? 'Begin Exam' : 'Begin Quiz'}</span>
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    );
  }

  // ============================================================================
  // STAGE 2A: QUIZ PRACTICE MODE (ONE QUESTION AT A TIME + IMMEDIATE GREEN FEEDBACK)
  // ============================================================================
  if (stage === 'exam' && activeQuiz && activeQuiz.assessmentMode === 'practice') {
    const currentQuestion = activeQuiz.questions[currentIdx];
    const currentAnswer = answersMap[currentQuestion.id];
    const feedback = practiceFeedbackMap[currentQuestion.id];
    const total = activeQuiz.questions.length;
    const checkedCount = activeQuiz.questions.filter((q) => Boolean(practiceFeedbackMap[q.id])).length;
    const correctSoFar = activeQuiz.questions.filter(
      (q) => practiceFeedbackMap[q.id]?.isCorrect
    ).length;
    const progressPct = Math.round((checkedCount / total) * 100);

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-[#0D162B]">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-blue-700 select-none dark:text-cyan-400">
                Quiz Mode · Immediate Feedback · {activeQuiz.difficulty.toUpperCase()}
              </p>
              <h2 className="mt-0.5 truncate font-display text-base font-bold text-slate-900 select-none sm:text-lg dark:text-white">
                {activeQuiz.title}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 select-none">
              <div className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>
                  {correctSoFar}/{checkedCount} correct
                </span>
              </div>
              <div className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-cyan-400" aria-hidden="true" />
                <span>{formatSeconds(elapsedSeconds)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-1.5 select-none">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                Question {currentIdx + 1} of {total}
              </span>
              <span className="font-mono tabular-nums">
                {checkedCount} of {total} checked ({progressPct}%)
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

        {restoredNotice && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{restoredNotice}</span>
          </div>
        )}

        {activeQuiz.insufficientSourceNote && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-cyan-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{activeQuiz.insufficientSourceNote}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3.5 select-none sm:pb-4 dark:border-slate-800">
            <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400">
              Question {currentIdx + 1} · Objective ({currentQuestion.maxMarks || 1} mark)
            </span>
            {currentQuestion.topicTag && (
              <span className="text-xs font-medium text-blue-700 dark:text-cyan-400">
                Source: {currentQuestion.topicTag}
              </span>
            )}
          </div>

          <h3 className="mt-4 font-display text-base font-semibold leading-snug text-slate-900 academic-selectable sm:mt-5 sm:text-lg dark:text-white">
            {currentQuestion.question}
          </h3>

          <div
            className="mt-6 space-y-3"
            role="radiogroup"
            aria-label={`Options for question ${currentIdx + 1}`}
          >
            {(currentQuestion.options || []).map((optText, optIdx) => {
              const letter = String.fromCharCode(65 + optIdx);
              const isSelected = feedback
                ? feedback.selectedOptionIndex === optIdx
                : currentAnswer?.selectedOptionIndex === optIdx;
              const isCorrectOption = Boolean(feedback && optIdx === feedback.correctOptionIndex);
              const isWrongSelection = Boolean(
                feedback && optIdx === feedback.selectedOptionIndex && !feedback.isCorrect
              );

              let containerClass =
                'border-slate-200 bg-slate-50/50 text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900';
              let badgeClass =
                'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

              if (isCorrectOption) {
                containerClass =
                  'border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-100';
                badgeClass =
                  'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950';
              } else if (isWrongSelection) {
                containerClass =
                  'border-red-500 bg-red-50 text-red-950 dark:border-red-500 dark:bg-red-950/40 dark:text-red-100';
                badgeClass = 'bg-red-600 text-white';
              } else if (isSelected) {
                containerClass =
                  'border-blue-600 bg-blue-50/80 text-slate-900 dark:border-cyan-400 dark:bg-blue-950/50 dark:text-white';
                badgeClass = 'bg-blue-600 text-white dark:bg-cyan-400 dark:text-slate-950';
              }

              return (
                <button
                  key={optIdx}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={Boolean(feedback) || checkingAnswer}
                  onClick={() => {
                    if (feedback) return;
                    const nextAnswers: Record<string, StudentAnswer> = {
                      ...answersMap,
                      [currentQuestion.id]: {
                        questionId: currentQuestion.id,
                        selectedOptionIndex: optIdx,
                      },
                    };
                    setAnswersMap(nextAnswers);
                    scheduleProgressSync(activeQuiz.sessionId, currentIdx, nextAnswers, true);
                  }}
                  className={`flex min-h-12 w-full items-start gap-3.5 rounded-xl border p-3.5 text-left transition-colors select-none disabled:cursor-default sm:p-4 ${containerClass}`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold select-none ${badgeClass}`}
                  >
                    {letter}
                  </span>
                  <span className="flex-1 text-sm leading-relaxed academic-selectable select-text">
                    {optText}
                  </span>
                  {isCorrectOption && (
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  )}
                  {isWrongSelection && (
                    <XCircle
                      className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {feedback && (
            <div
              className={`mt-5 rounded-xl border p-4 ${
                feedback.isCorrect
                  ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30'
                  : 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                {feedback.isCorrect ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                    <span className="text-emerald-800 dark:text-emerald-300">
                      Correct Answer
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-700 dark:text-red-400" aria-hidden="true" />
                    <span className="text-red-800 dark:text-red-300">
                      Incorrect — Correct answer: {feedback.expectedAnswerDisplay}
                    </span>
                  </>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-800 select-text dark:text-slate-200">
                <span className="font-semibold text-slate-900 dark:text-white">Explanation: </span>
                {feedback.explanation}
              </p>
              {feedback.topicTag && (
                <p className="mt-1.5 text-xs font-medium text-blue-700 dark:text-cyan-400">
                  Source Page Reference: {feedback.topicTag}
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5 select-none dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                const nextIdx = Math.max(0, currentIdx - 1);
                setCurrentIdx(nextIdx);
                scheduleProgressSync(activeQuiz.sessionId, nextIdx, answersMap, true);
              }}
              disabled={currentIdx === 0}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 sm:min-h-9 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span>Previous</span>
            </button>

            {!feedback ? (
              <button
                type="button"
                onClick={() => handleCheckPracticeAnswer(currentQuestion)}
                disabled={
                  checkingAnswer ||
                  currentAnswer?.selectedOptionIndex === undefined ||
                  currentAnswer?.selectedOptionIndex === null
                }
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 sm:min-h-9 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {checkingAnswer ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Checking...</span>
                  </>
                ) : (
                  <span>Check Answer</span>
                )}
              </button>
            ) : currentIdx < total - 1 ? (
              <button
                type="button"
                onClick={() => {
                  const nextIdx = Math.min(total - 1, currentIdx + 1);
                  setCurrentIdx(nextIdx);
                  scheduleProgressSync(activeQuiz.sessionId, nextIdx, answersMap, true);
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0F1E3D] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] sm:min-h-9 sm:px-4 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <span>Next Question</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => submitExamination(false)}
                disabled={grading}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60 sm:min-h-9"
              >
                {grading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Saving Results...</span>
                  </>
                ) : (
                  <span>Finish & View Results</span>
                )}
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  // ============================================================================
  // STAGE 2B: ACTIVE TIMED EXAMINATION INTERFACE (ANSWER KEYS SERVER-ONLY)
  // ============================================================================
  if (stage === 'exam' && activeQuiz) {
    const currentQuestion = activeQuiz.questions[currentIdx];
    const currentAnswer = answersMap[currentQuestion.id];
    const total = activeQuiz.questions.length;
    const progressPct = Math.round((answeredCount / total) * 100);
    const remainingSeconds = activeQuiz.deadlineAtMs
      ? Math.max(0, Math.ceil((activeQuiz.deadlineAtMs - nowMs) / 1000))
      : activeQuiz.timeLimitMinutes && activeQuiz.timeLimitMinutes > 0
        ? Math.max(0, activeQuiz.timeLimitMinutes * 60 - elapsedSeconds)
        : null;

    return (
      <div className="space-y-6">
        {/* Examination Top Status Bar */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-[#0D162B]">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-blue-700 select-none dark:text-cyan-400">
                Timed Examination Mode · {activeQuiz.format.toUpperCase()} ·{' '}
                {activeQuiz.difficulty.toUpperCase()}
              </p>
              <h2 className="mt-0.5 truncate font-display text-base font-bold text-slate-900 select-none sm:text-lg dark:text-white">
                {activeQuiz.title}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 select-none sm:gap-3">
              <div className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-slate-800 sm:min-h-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
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
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-60 whitespace-nowrap shrink-0 sm:min-h-9 sm:flex-initial dark:bg-blue-600 dark:hover:bg-blue-500"
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

        {restoredNotice && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{restoredNotice}</span>
          </div>
        )}

        {activeQuiz.insufficientSourceNote && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-cyan-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{activeQuiz.insufficientSourceNote}</span>
          </div>
        )}

        {cloudNotice && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{cloudNotice}</span>
          </div>
        )}

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
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3.5 select-none sm:gap-3 sm:pb-4 dark:border-slate-800">
                <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                  Question {currentIdx + 1} · Objective ({currentQuestion.maxMarks || 1} mark)
                </span>
                {currentQuestion.topicTag && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {currentQuestion.topicTag}
                  </span>
                )}
              </div>

              <h3 className="mt-4 font-display text-base font-semibold leading-snug text-slate-900 academic-selectable sm:mt-5 sm:text-lg dark:text-white">
                {currentQuestion.question}
              </h3>

              {currentQuestion.visualAid ? (
                <div className="mt-4">
                  <EducationalDiagramRenderer spec={currentQuestion.visualAid} compact />
                </div>
              ) : (
                hasSubjectVisualMatch(
                  `${activeQuiz.subjectArea} ${currentQuestion.topicTag || ''} ${currentQuestion.question}`
                ) && (() => {
                  const plate = resolveSubjectVisual(
                    `${activeQuiz.subjectArea} ${currentQuestion.topicTag || ''} ${currentQuestion.question}`,
                    'quiz'
                  );
                  return (
                    <figure className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 select-none dark:border-slate-800">
                      <div className="relative h-36 w-full sm:h-44">
                        <img
                          src={plate.src}
                          alt={plate.alt}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent" />
                        <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3.5 py-2 text-[11px] font-medium text-slate-100">
                          <span>Subject Reference · {plate.subjectLabel}</span>
                          {currentQuestion.topicTag && (
                            <span className="truncate text-cyan-200">{currentQuestion.topicTag}</span>
                          )}
                        </figcaption>
                      </div>
                    </figure>
                  );
                })()
              )}

              <div
                className="mt-6 space-y-3"
                role="radiogroup"
                aria-label={`Options for question ${currentIdx + 1}`}
              >
                {(currentQuestion.options || []).map((optText, optIdx) => {
                  const letter = String.fromCharCode(65 + optIdx);
                  const isSelected = currentAnswer?.selectedOptionIndex === optIdx;
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        const nextAnswers: Record<string, StudentAnswer> = {
                          ...answersMap,
                          [currentQuestion.id]: {
                            questionId: currentQuestion.id,
                            selectedOptionIndex: optIdx,
                          },
                        };
                        setAnswersMap(nextAnswers);
                        scheduleProgressSync(activeQuiz.sessionId, currentIdx, nextAnswers, false);
                      }}
                      className={`flex min-h-12 w-full items-start gap-3.5 rounded-xl border p-3.5 text-left transition-colors select-none sm:p-4 ${
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
                      <span className="text-sm leading-relaxed academic-selectable select-text">
                        {optText}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Previous / Next Controls */}
              <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5 select-none dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const nextIdx = Math.max(0, currentIdx - 1);
                    setCurrentIdx(nextIdx);
                    scheduleProgressSync(activeQuiz.sessionId, nextIdx, answersMap, true);
                  }}
                  disabled={currentIdx === 0}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 sm:min-h-9 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Previous</span>
                </button>

                {currentIdx < total - 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const nextIdx = Math.min(total - 1, currentIdx + 1);
                      setCurrentIdx(nextIdx);
                      scheduleProgressSync(activeQuiz.sessionId, nextIdx, answersMap, true);
                    }}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0F1E3D] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] sm:min-h-9 sm:px-4 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={grading}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 sm:min-h-9"
                  >
                    <span>Review & Submit</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Question Navigation Panel */}
          <aside className="lg:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 select-none sm:p-5 dark:border-slate-800 dark:bg-[#0D162B]">
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
                      onClick={() => {
                        setCurrentIdx(idx);
                        scheduleProgressSync(activeQuiz.sessionId, idx, answersMap, true);
                      }}
                      aria-label={`Question ${idx + 1}${answered ? ' (answered)' : ' (unanswered)'}`}
                      className={`h-10 rounded-lg font-mono text-xs font-semibold tabular-nums transition-colors sm:h-9 ${
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
            <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#0D162B]">
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
              <div className="mt-6 flex flex-col-reverse gap-2.5 select-none sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  disabled={grading}
                  className="min-h-11 w-full rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:min-h-9 sm:w-auto dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Continue Exam
                </button>
                <button
                  type="button"
                  onClick={() => submitExamination(false)}
                  disabled={grading}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2 text-xs font-semibold text-white hover:bg-[#192F5D] disabled:opacity-60 sm:min-h-9 sm:w-auto dark:bg-blue-600 dark:hover:bg-blue-500"
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
                Scoring your examination on the server...
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
    const matchingAttempts = attempts
      .filter((a) =>
        resultMeta.quizId && a.quiz_id
          ? a.quiz_id === resultMeta.quizId
          : a.title.toLowerCase() === resultMeta.title.toLowerCase()
      )
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return (
      <div className="space-y-6">
        {cloudNotice && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{cloudNotice}</span>
          </div>
        )}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold tracking-wide text-blue-700 select-none dark:text-cyan-400">
                {resultMeta.assessmentMode === 'exam' ? 'Exam Mode' : 'Practice Mode'} ·{' '}
                {resultMeta.subjectArea} · {resultMeta.format.toUpperCase()} ·{' '}
                {resultMeta.difficulty.toUpperCase()}
                {resultMeta.createdAt
                  ? ` · ${new Date(resultMeta.createdAt).toLocaleString()}`
                  : ''}
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-slate-900 select-text sm:text-2xl dark:text-white">
                {resultMeta.title}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 select-none">
              {activeQuiz && (activeQuiz.sessionId || activeQuiz.quizId) && (
                <button
                  type="button"
                  disabled={startingSession}
                  onClick={() => startExamSession(activeQuiz, true)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:min-h-10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{startingSession ? 'Starting...' : 'Retake Assessment'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setStage('setup')}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#192F5D] sm:min-h-10 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <span>New Quiz or History</span>
              </button>
            </div>
          </div>

          <SubjectVisualBanner
            subjectHint={resultMeta.subjectArea}
            fallbackKey="quiz"
            variant="compact"
            title={`${resultMeta.subjectArea} Assessment Review`}
            subtitle={`Scored ${gradingResult.percentage}% across ${gradingResult.totalQuestions} questions with complete explanations below.`}
            className="mt-5"
          />

          {/* Metrics Grid */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3.5 lg:grid-cols-7">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
                Percentage
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-blue-700 tabular-nums sm:text-xl dark:text-cyan-400">
                {gradingResult.percentage}%
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
                Total Score
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums sm:text-xl dark:text-white">
                {gradingResult.earnedMarks}/{gradingResult.maxMarks}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
                Total Questions
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums sm:text-xl dark:text-white">
                {gradingResult.totalQuestions}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-emerald-700 select-none dark:text-emerald-400">
                Correct
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular-nums sm:text-xl dark:text-emerald-400">
                {gradingResult.correctCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-red-700 select-none dark:text-red-400">
                Incorrect
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-red-700 tabular-nums sm:text-xl dark:text-red-400">
                {gradingResult.incorrectCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
                Unanswered
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-700 tabular-nums sm:text-xl dark:text-slate-300">
                {gradingResult.unansweredCount}
              </p>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-1 sm:p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] font-medium text-slate-500 select-none dark:text-slate-400">
                Time Taken
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums sm:text-xl dark:text-white">
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

          {matchingAttempts.length > 1 && (
            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-900 select-none dark:text-cyan-300">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                <span>Attempt Comparison ({matchingAttempts.length} saved attempts)</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {matchingAttempts.map((att, idx) => {
                  const isCurrent = resultMeta.attemptId === att.id;
                  const prevPct =
                    idx > 0 ? Number(matchingAttempts[idx - 1].percentage) : null;
                  const diff =
                    prevPct !== null
                      ? Number((Number(att.percentage) - prevPct).toFixed(1))
                      : null;
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => reopenPastAttempt(att)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        isCurrent
                          ? 'border-blue-600 bg-white text-slate-900 shadow-xs dark:border-cyan-400 dark:bg-slate-900 dark:text-white'
                          : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300'
                      }`}
                    >
                      <div className="font-semibold">
                        Attempt #{idx + 1} · {att.percentage}%
                        {diff !== null && (
                          <span
                            className={`ml-1.5 font-mono ${
                              diff > 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : diff < 0
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-slate-500'
                            }`}
                          >
                            ({diff > 0 ? `+${diff}%` : `${diff}%`})
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        {new Date(att.created_at).toLocaleDateString()} ·{' '}
                        {att.correct_count}/{att.total_questions} correct
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Question-by-Question Review */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
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
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 select-none dark:text-white">
              Quiz & Examination System
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Generate document-grounded objective multiple-choice quizzes and timed examinations
              from your materials, summaries, or topics.
            </p>
          </div>

          <div
            role="tablist"
            className="flex w-full items-center rounded-xl border border-slate-200 bg-slate-100 p-1 select-none sm:inline-flex sm:w-auto dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              role="tab"
              aria-selected={setupTab === 'create'}
              onClick={() => setSetupTab('create')}
              className={`min-h-10 flex-1 rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold transition-colors whitespace-nowrap sm:min-h-9 sm:flex-initial sm:px-3 ${
                setupTab === 'create'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              New Quiz / Exam
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={setupTab === 'saved'}
              onClick={() => setSetupTab('saved')}
              className={`min-h-10 flex-1 rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold transition-colors whitespace-nowrap sm:min-h-9 sm:flex-initial sm:px-3 ${
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
              className={`min-h-10 flex-1 rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold transition-colors whitespace-nowrap sm:min-h-9 sm:flex-initial sm:px-3 ${
                setupTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Results ({attempts.length})
            </button>
          </div>
        </div>

        <SubjectVisualBanner
          visualKey="quiz"
          variant="compact"
          title="Document-Grounded Quiz & Exam Studio"
          subtitle="Build objective multiple-choice quizzes with immediate feedback or timed examinations backed by server-side grading."
          className="mt-5"
        />

        {activeSessions.length > 0 && (
          <div className="mt-5 space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-xs font-bold uppercase tracking-wide text-blue-800 select-none dark:text-cyan-300">
                Resume In-Progress Assessment ({activeSessions.length})
              </p>
            </div>
            <div className="space-y-2">
              {activeSessions.map((sess) => {
                const isResuming = resumingSessionId === sess.sessionId;
                return (
                  <div
                    key={sess.sessionId}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-blue-200/80 bg-white p-3.5 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-[#0D162B]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold text-slate-900 dark:text-white">
                        {sess.title}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {sess.assessmentMode === 'exam' ? 'Timed Exam' : 'Quiz Mode'} ·{' '}
                        {sess.answeredCount}/{sess.questionCount} answered ·{' '}
                        {sess.isExpired
                          ? 'Deadline expired — click to finalize results'
                          : sess.remainingSeconds !== null
                            ? `${formatSeconds(sess.remainingSeconds)} remaining`
                            : `Question ${sess.currentQuestionIndex + 1} of ${sess.questionCount}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(resumingSessionId)}
                      onClick={() => handleResumeSession(sess.sessionId)}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 sm:min-h-9 dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      {isResuming ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          <span>Restoring...</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{sess.isExpired ? 'Finalize & View Score' : 'Resume Assessment'}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
              <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 sm:grid-cols-5 select-none">
                {(
                  [
                    { id: 'material' as QuizSourceMode, label: 'Uploaded Material' },
                    { id: 'upload' as QuizSourceMode, label: 'Upload File' },
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
                      className={`min-h-11 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
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
                        No uploaded study materials found yet. Upload a document in the Document
                        Summarizer first, or switch to Paste Text or Subject / Topic.
                      </p>
                    ) : (
                      <select
                        value={selectedMaterialId}
                        onChange={(e) => setSelectedMaterialId(e.target.value)}
                        className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
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
                        className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
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
                      className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
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
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={topicTitle}
                      onChange={(e) => setTopicTitle(e.target.value)}
                      placeholder="Enter subject or topic (e.g., Calvin Cycle, Thermodynamics, Acid-Base Chemistry)"
                      className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Searches your uploaded study materials and saved summaries to build document-grounded questions on this topic.
                    </p>
                  </div>
                )}

                {sourceMode === 'upload' && (
                  <div className="space-y-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md"
                      className="hidden"
                      onChange={(e) => handleQuizFileChosen(e.target.files?.[0] || null)}
                    />

                    {!uploadFile ? (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragging(false);
                          handleQuizFileChosen(e.dataTransfer.files?.[0] || null);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors sm:p-8 ${
                          isDragging
                            ? 'border-blue-600 bg-blue-50/50 dark:border-cyan-400 dark:bg-blue-950/30'
                            : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:bg-slate-900'
                        }`}
                      >
                        <Upload className="mx-auto h-8 w-8 text-blue-600 dark:text-cyan-400" aria-hidden="true" />
                        <p className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                          Click to upload or drag & drop study material
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Supports PDF, PNG, JPG, WEBP photos of notes, and TXT files (up to 25 MB)
                        </p>
                        <button
                          type="button"
                          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] dark:bg-blue-600 dark:hover:bg-blue-500"
                        >
                          <span>Select Study File</span>
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="h-6 w-6 text-blue-600 shrink-0 dark:text-cyan-400" aria-hidden="true" />
                            <div className="min-w-0">
                              <p className="truncate font-display text-sm font-semibold text-slate-900 dark:text-white">
                                {uploadFile.name}
                              </p>
                              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB · {uploadFile.type || 'Document'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setUploadFile(null);
                              setExtractedUploadText('');
                              setExtractedUploadTitle('');
                              setUploadedMaterialId(null);
                              setUploadSuccessMsg(null);
                              setUploadErrorMsg(null);
                              stagedStoragePathRef.current = null;
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                            <span>Remove</span>
                          </button>
                        </div>

                        {(uploading || extractingUpload) && (
                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-cyan-400" aria-hidden="true" />
                                {uploading ? 'Uploading and extracting study text...' : 'Processing with AI...'}
                              </span>
                              <span className="font-mono tabular-nums">{uploadProgress}%</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                              <div
                                className="h-full rounded-full bg-blue-600 transition-all duration-300 dark:bg-cyan-400"
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {uploadSuccessMsg && (
                          <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                            <span>{uploadSuccessMsg}</span>
                          </div>
                        )}

                        {uploadErrorMsg && (
                          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                            <div className="flex-1">
                              <span>{uploadErrorMsg}</span>
                              <button
                                type="button"
                                onClick={() => handleQuizFileChosen(uploadFile)}
                                className="mt-2 inline-flex items-center gap-1 rounded-md bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200"
                              >
                                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                                <span>Retry Upload</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quiz vs Exam Mode */}
            <div>
              <p className="mb-2.5 text-xs font-semibold text-slate-700 select-none dark:text-slate-300">
                2. Assessment Mode
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 select-none">
                <button
                  type="button"
                  onClick={() => setAssessmentMode('practice')}
                  className={`rounded-xl border p-3.5 text-left transition-colors ${
                    assessmentMode === 'practice'
                      ? 'border-blue-600 bg-blue-50/70 dark:border-cyan-400 dark:bg-blue-950/40'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900'
                  }`}
                >
                  <p
                    className={`font-display text-sm font-semibold ${
                      assessmentMode === 'practice'
                        ? 'text-blue-800 dark:text-cyan-300'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    Quiz Mode (Immediate Feedback)
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    One question at a time with instant answer verification, green correct answer
                    highlighting, explanation, and source page reference.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAssessmentMode('exam');
                    if (timeLimitMinutes <= 0) setTimeLimitMinutes(20);
                  }}
                  className={`rounded-xl border p-3.5 text-left transition-colors ${
                    assessmentMode === 'exam'
                      ? 'border-blue-600 bg-blue-50/70 dark:border-cyan-400 dark:bg-blue-950/40'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900'
                  }`}
                >
                  <p
                    className={`font-display text-sm font-semibold ${
                      assessmentMode === 'exam'
                        ? 'text-blue-800 dark:text-cyan-300'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    Exam Mode (Timed Examination)
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Simulate real exam conditions with a server-enforced timer, protected answer
                    keys, and automatic submission on expiry.
                  </p>
                </button>
              </div>
            </div>

            {/* Parameters Row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 select-none">
              {/* Format */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  3. Question Format
                </label>
                <select
                  value={format}
                  disabled
                  aria-label="Question Format (Objective MCQ)"
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="objective">Objective (MCQ — A/B/C/D)</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Only objective multiple-choice questions are supported.
                </p>
              </div>

              {/* Quantity */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  4. Question Count
                </label>
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value) as QuizQuestionCount)}
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value={5}>5 Questions</option>
                  <option value={10}>10 Questions</option>
                  <option value={15}>15 Questions</option>
                  <option value={20}>20 Questions</option>
                  <option value={25}>25 Questions</option>
                  <option value={30}>30 Questions</option>
                  <option value={35}>35 Questions</option>
                  <option value={40}>40 Questions</option>
                  <option value={45}>45 Questions</option>
                  <option value={50}>50 Questions</option>
                  <option value={55}>55 Questions</option>
                  <option value={60}>60 Questions</option>
                  <option value={65}>65 Questions</option>
                  <option value={70}>70 Questions</option>
                </select>
              </div>

              {/* Difficulty */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  5. Difficulty Level
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="easy">Easy (Foundational)</option>
                  <option value="intermediate">Intermediate (Conceptual)</option>
                  <option value="advanced">Advanced (Analytical)</option>
                  <option value="mixed">Mixed Difficulty</option>
                </select>
              </div>

              {/* Exam Duration (active in Exam Mode) */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  6. Exam Duration
                </label>
                {assessmentMode === 'exam' ? (
                  <select
                    value={timeLimitMinutes}
                    onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value={10}>10 Minutes</option>
                    <option value={20}>20 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                ) : (
                  <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                    Untimed (Practice)
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-slate-200 pt-5 select-none dark:border-slate-800">
              <button
                type="submit"
                disabled={generating || uploading || extractingUpload}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F1E3D] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 sm:w-auto dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Generating {questionCount} Questions...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {assessmentMode === 'exam' ? 'Prepare Timed Exam' : 'Prepare Quiz'}
                    </span>
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
                          prepareExamInstructions({
                            sessionId: null,
                            quizId: q.id,
                            title: q.title,
                            subjectArea: q.subject_area,
                            format: 'objective',
                            difficulty: q.difficulty,
                            assessmentMode:
                              q.time_limit_minutes && q.time_limit_minutes > 0 ? 'exam' : 'practice',
                            timeLimitMinutes: q.time_limit_minutes,
                            questions: q.questions,
                          })
                        }
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#0F1E3D] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#192F5D] sm:min-h-8 dark:bg-blue-600 dark:hover:bg-blue-500"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {q.time_limit_minutes && q.time_limit_minutes > 0 ? 'Take Exam' : 'Take Quiz'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ kind: 'quiz', item: q })}
                        aria-label={`Delete ${q.title}`}
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 sm:min-h-8 sm:min-w-8 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
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
                {attempts.map((att) => {
                  const linkedQuiz = att.quiz_id ? quizLookup.get(att.quiz_id) : undefined;
                  const modeLabel =
                    linkedQuiz && linkedQuiz.time_limit_minutes && linkedQuiz.time_limit_minutes > 0
                      ? 'Exam Mode'
                      : 'Practice Mode';
                  return (
                    <div
                      key={att.id}
                      className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-semibold text-slate-900 dark:text-white">
                          {att.title}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                          {modeLabel} · {linkedQuiz?.subject_area || 'General Studies'} · Score:{' '}
                          {att.percentage}% ({att.earned_marks}/{att.max_marks}) ·{' '}
                          {att.correct_count}/{att.total_questions} correct ·{' '}
                          {new Date(att.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 select-none">
                        <button
                          type="button"
                          onClick={() => reopenPastAttempt(att)}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap sm:min-h-8 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>View Results</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ kind: 'attempt', item: att })}
                          aria-label={`Delete attempt ${att.title}`}
                          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 sm:min-h-8 sm:min-w-8 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        title={
          deleteTarget?.kind === 'quiz'
            ? 'Delete saved quiz template?'
            : 'Delete completed attempt?'
        }
        itemName={deleteTarget?.item.title}
        description={
          deleteTarget?.kind === 'quiz'
            ? 'This removes the saved quiz template. Previously completed score attempts remain preserved unless deleted separately.'
            : 'This permanently deletes this quiz attempt and score record from your Academic History. This action cannot be undone.'
        }
        busy={deletingRecord}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
