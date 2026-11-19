import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  Copy,
  FileText,
  GraduationCap,
  History,
  Layers,
  Loader2,
  Paperclip,
  PlusCircle,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { postSseStream } from '../lib/sseClient';
import {
  createAiMessage,
  createAiSession,
  deleteAiSession,
  getMaterialSignedUrl,
  isSupabaseConfigured,
  listAiMessages,
  listAiSessions,
  recordStudyActivity,
  updateAiSession,
  uploadSessionImageToStorage,
} from '../lib/supabase';
import type {
  AiMessageRecord,
  AiSessionRecord,
  ImageActionType,
  SnapImageAttachment,
  StudyMaterialRecord,
  StudySummaryRecord,
  TutorMode,
} from '../types/brainstine';
import { AcademicContentRenderer } from './AcademicContentRenderer';
import {
  SnapAttachmentPreview,
  SnapTriggerButtons,
} from './SnapPhotoControl';

interface AiTutorWorkspaceProps {
  materials: StudyMaterialRecord[];
  summaries: StudySummaryRecord[];
  geminiConfigured: boolean;
  incomingImage?: SnapImageAttachment | null;
  onConsumeIncomingImage?: () => void;
  onActivityRecorded: () => void;
}

const TUTOR_MODES: { id: TutorMode; label: string; description: string }[] = [
  {
    id: 'beginner',
    label: 'Beginner Mode',
    description: 'Everyday language, analogies, and foundational steps',
  },
  {
    id: 'standard',
    label: 'Standard Mode',
    description: 'Clear university-level explanations and guided checks',
  },
  {
    id: 'advanced',
    label: 'Advanced Mode',
    description: 'Formal derivations, mechanisms, and deep synthesis',
  },
];

const INTERACTIVE_TUTOR_PROMPTS: { label: string; command: string }[] = [
  {
    label: 'Teach from beginning',
    command: 'Teach me this topic from the beginning, starting with Step 1.',
  },
  {
    label: 'Explain like a beginner',
    command: 'Explain this like I am a complete beginner using a simple analogy.',
  },
  {
    label: 'Give another example',
    command: 'Give me another concrete example to illustrate this concept.',
  },
  {
    label: 'Explain that step again',
    command: 'Explain that previous step again more clearly before we move on.',
  },
  {
    label: 'Test my understanding',
    command: 'Ask me a practice question to test my understanding of what we just covered.',
  },
  {
    label: 'Make it easier',
    command: 'Break this down into smaller, easier pieces.',
  },
  {
    label: 'Next level',
    command: 'Take me to the next level and teach the next concept in sequence.',
  },
];

const TOPIC_STARTERS = [
  { title: 'Cellular Respiration', area: 'Biology' },
  { title: 'Acid-Base Equilibria & Buffers', area: 'Chemistry' },
  { title: 'Eigenvalues & Eigenvectors', area: 'Linear Algebra' },
  { title: 'Cardiac Cycle Physiology', area: 'Medicine' },
  { title: 'Dynamic Programming Fundamentals', area: 'Computer Science' },
  { title: 'Thermodynamics & Entropy', area: 'Physics' },
];

export function AiTutorWorkspace({
  materials,
  summaries,
  geminiConfigured,
  incomingImage,
  onConsumeIncomingImage,
  onActivityRecorded,
}: AiTutorWorkspaceProps) {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<AiSessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageRecord[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [tutorMode, setTutorMode] = useState<TutorMode>('standard');
  const [currentTopic, setCurrentTopic] = useState('');
  const [subjectArea, setSubjectArea] = useState('Personal Guided Study');
  const [tutorStep, setTutorStep] = useState(1);
  const [stageLabel, setStageLabel] = useState('Ready to begin');

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null);

  const [pendingImage, setPendingImage] = useState<SnapImageAttachment | null>(null);
  const [activeSessionImage, setActiveSessionImage] = useState<SnapImageAttachment | null>(null);
  const [signedImageUrls, setSignedImageUrls] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!sending) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [sending]);

  // Accept incoming image handed off from AI Chat ("Teach me this topic")
  useEffect(() => {
    if (incomingImage) {
      abortControllerRef.current?.abort();
      inFlightRef.current = false;
      setSending(false);
      setStreamingContent('');
      setActiveSessionId(null);
      setMessages([]);
      setCurrentTopic('');
      setTutorStep(1);
      setStageLabel('Image lesson ready');
      setPendingImage(incomingImage);
      setActiveSessionImage(null);
      onConsumeIncomingImage?.();
    }
  }, [incomingImage, onConsumeIncomingImage]);

  const activeDocumentContext = useMemo(() => {
    if (selectedMaterialId) {
      const mat = materials.find((m) => m.id === selectedMaterialId);
      if (mat) {
        return {
          title: mat.title,
          type: `Uploaded ${mat.material_type.toUpperCase()} Material`,
          content: mat.extracted_text,
        };
      }
    }
    if (selectedSummaryId) {
      const sum = summaries.find((s) => s.id === selectedSummaryId);
      if (sum) {
        return {
          title: sum.title,
          type: 'Saved Study Summary',
          content: sum.markdown_content,
        };
      }
    }
    return null;
  }, [materials, summaries, selectedMaterialId, selectedSummaryId]);

  const loadSessions = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setLoadingSessions(false);
      return;
    }
    try {
      const list = await listAiSessions(user.id, 'tutor');
      setSessions(list);
    } catch (err) {
      console.warn('Could not load tutoring sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, [user]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, streamingContent]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const pathsToResolve = messages
      .map((m) => m.image_path)
      .filter((p): p is string => Boolean(p && !signedImageUrls[p]));
    if (pathsToResolve.length === 0) return;

    let cancelled = false;
    Promise.all(
      pathsToResolve.map(async (path) => {
        try {
          const url = await getMaterialSignedUrl(path);
          return [path, url] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const updates: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) updates[entry[0]] = entry[1];
      }
      if (Object.keys(updates).length > 0) {
        setSignedImageUrls((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [messages, signedImageUrls]);

  const handleNewSession = () => {
    abortControllerRef.current?.abort();
    inFlightRef.current = false;
    setSending(false);
    setStreamingContent('');
    setActiveSessionId(null);
    setMessages([]);
    setCurrentTopic('');
    setSubjectArea('Personal Guided Study');
    setTutorStep(1);
    setStageLabel('Ready to begin');
    setInputText('');
    setPendingImage(null);
    setActiveSessionImage(null);
    setError(null);
    setHistoryOpen(false);
  };

  const handleSelectSession = async (session: AiSessionRecord) => {
    abortControllerRef.current?.abort();
    inFlightRef.current = false;
    setSending(false);
    setStreamingContent('');
    setActiveSessionId(session.id);
    setCurrentTopic(session.title);
    setSubjectArea(session.subject_area || 'Guided Study');
    setTutorMode(session.tutor_mode || 'standard');
    setTutorStep(session.tutor_step || 1);
    setStageLabel(session.tutor_stage_label || 'Guided Concept Exploration');
    setSelectedMaterialId(session.attached_material_id);
    setSelectedSummaryId(session.attached_summary_id);
    setPendingImage(null);
    setActiveSessionImage(null);
    setError(null);
    setHistoryOpen(false);

    if (!user || !isSupabaseConfigured) return;
    setLoadingMessages(true);
    try {
      const loaded = await listAiMessages(user.id, session.id);
      setMessages(loaded);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load tutoring session.');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleDeleteSession = async (
    e: React.MouseEvent,
    sessionId: string
  ) => {
    e.stopPropagation();
    if (!user || !isSupabaseConfigured) return;
    try {
      await deleteAiSession(user.id, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        handleNewSession();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete session.');
    }
  };

  const handleModeChange = async (nextMode: TutorMode) => {
    setTutorMode(nextMode);
    if (user && isSupabaseConfigured && activeSessionId) {
      await updateAiSession(user.id, activeSessionId, {
        tutor_mode: nextMode,
      }).catch(() => {});
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId ? { ...s, tutor_mode: nextMode } : s
        )
      );
    }
  };

  const handleAttachContext = async (
    materialId: string | null,
    summaryId: string | null
  ) => {
    setSelectedMaterialId(materialId);
    setSelectedSummaryId(summaryId);
    setContextPickerOpen(false);
    if (user && isSupabaseConfigured && activeSessionId) {
      await updateAiSession(user.id, activeSessionId, {
        attached_material_id: materialId,
        attached_summary_id: summaryId,
      }).catch(() => {});
    }
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const sendTutorTurn = async (options?: {
    overrideText?: string;
    quickAction?: string;
    imageAction?: ImageActionType;
    overrideMode?: TutorMode;
  }) => {
    if (inFlightRef.current) return;

    const cleanText = (options?.overrideText ?? inputText).trim();
    const effectiveMode = options?.overrideMode ?? tutorMode;
    const imageToSend = pendingImage || activeSessionImage;

    if (!cleanText && !options?.quickAction && !pendingImage && !options?.imageAction) {
      setError('Enter a topic, answer, or attach a study photo to continue tutoring.');
      return;
    }

    inFlightRef.current = true;
    setError(null);
    setSending(true);
    setStreamingContent('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const isFirstTurn = messages.length === 0;
    const isNewPendingImage = Boolean(pendingImage);
    const outgoingImage = pendingImage;
    const previousActiveImage = activeSessionImage;
    const typedInputSnapshot = !options?.overrideText ? inputText : null;

    if (!options?.overrideText) {
      setInputText('');
    }
    if (pendingImage) {
      setActiveSessionImage(pendingImage);
      setPendingImage(null);
    }

    const displayUserContent =
      cleanText ||
      options?.quickAction ||
      'Teach me the topic shown in this image step by step.';

    const tempUserMsg: AiMessageRecord = {
      id: `local-tutor-user-${Date.now()}`,
      session_id: activeSessionId || 'local',
      user_id: user?.id || 'local',
      role: 'user',
      content: displayUserContent,
      image_path: null,
      image_mime: outgoingImage?.mimeType || null,
      action_tag: options?.imageAction || options?.quickAction || null,
      created_at: new Date().toISOString(),
      localPreviewUrl: outgoingImage?.previewUrl,
    };

    const historyForApi = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const data = await postSseStream<{
        reply: string;
        topicTitle?: string;
        subjectArea?: string;
        currentStageLabel?: string;
        advanceStep?: boolean;
      }>({
        url: '/api/ai/tutor/stream',
        body: {
          message: cleanText,
          history: historyForApi,
          tutorMode: effectiveMode,
          currentTopic: currentTopic || undefined,
          currentStep: tutorStep,
          quickAction: options?.quickAction,
          documentContext: activeDocumentContext,
          image: imageToSend
            ? { data: imageToSend.base64, mimeType: imageToSend.mimeType }
            : null,
          imageAction: options?.imageAction,
        },
        signal: controller.signal,
        idleTimeoutMs: 150000,
        fallbackErrorMessage: 'Personal AI Tutor request failed.',
        onChunk: (_delta, accumulated) => {
          setStreamingContent(accumulated);
        },
      });

      const replyText: string = data.reply || '';
      const nextTopic: string = data.topicTitle || currentTopic || 'Tutoring Session';
      const nextArea: string = data.subjectArea || subjectArea || 'General Studies';
      const nextStage: string = data.currentStageLabel || 'Guided Concept Exploration';
      const nextStep = data.advanceStep && !isFirstTurn ? tutorStep + 1 : tutorStep;

      setCurrentTopic(nextTopic);
      setSubjectArea(nextArea);
      setStageLabel(nextStage);
      setTutorStep(nextStep);
      setStreamingContent('');

      let resolvedSessionId = activeSessionId;
      let uploadedImagePath: string | null = null;

      if (user && isSupabaseConfigured) {
        try {
          if (isNewPendingImage && outgoingImage?.file) {
            try {
              uploadedImagePath = await uploadSessionImageToStorage(
                user.id,
                outgoingImage.file
              );
            } catch (uploadErr) {
              console.warn('Optional tutor image upload failed:', uploadErr);
            }
          }

          if (!resolvedSessionId) {
            const created = await createAiSession({
              userId: user.id,
              sessionType: 'tutor',
              title: nextTopic,
              subjectArea: nextArea,
              tutorMode: effectiveMode,
              tutorStep: nextStep,
              tutorStageLabel: nextStage,
              attachedMaterialId: selectedMaterialId,
              attachedSummaryId: selectedSummaryId,
              activeImagePath: uploadedImagePath,
              activeImageMime: outgoingImage?.mimeType || null,
            });
            resolvedSessionId = created.id;
            setActiveSessionId(created.id);
            setSessions((prev) => [created, ...prev]);
          } else {
            await updateAiSession(user.id, resolvedSessionId, {
              title: nextTopic,
              subject_area: nextArea,
              tutor_mode: effectiveMode,
              tutor_step: nextStep,
              tutor_stage_label: nextStage,
              ...(uploadedImagePath
                ? {
                    active_image_path: uploadedImagePath,
                    active_image_mime: outgoingImage?.mimeType || null,
                  }
                : {}),
            });
            setSessions((prev) =>
              prev.map((s) =>
                s.id === resolvedSessionId
                  ? {
                      ...s,
                      title: nextTopic,
                      subject_area: nextArea,
                      tutor_mode: effectiveMode,
                      tutor_step: nextStep,
                      tutor_stage_label: nextStage,
                      updated_at: new Date().toISOString(),
                    }
                  : s
              )
            );
          }

          const savedUserMsg = await createAiMessage({
            sessionId: resolvedSessionId,
            userId: user.id,
            role: 'user',
            content: displayUserContent,
            imagePath: uploadedImagePath,
            imageMime: outgoingImage?.mimeType || null,
            actionTag: options?.imageAction || options?.quickAction || null,
          });

          const savedAssistantMsg = await createAiMessage({
            sessionId: resolvedSessionId,
            userId: user.id,
            role: 'assistant',
            content: replyText,
            actionTag: effectiveMode,
          });

          if (isFirstTurn) {
            await recordStudyActivity({
              userId: user.id,
              activityType: 'tutor',
              title: `Tutor: ${nextTopic}`,
              detail: `${nextArea} · ${effectiveMode} mode`,
              materialType: outgoingImage ? 'image' : 'text',
            });
            onActivityRecorded();
          }

          setMessages((prev) => [
            ...prev.filter((m) => m.id !== tempUserMsg.id),
            { ...savedUserMsg, localPreviewUrl: outgoingImage?.previewUrl },
            savedAssistantMsg,
          ]);
        } catch (persistErr: unknown) {
          const localAssistantMsg: AiMessageRecord = {
            id: `local-tutor-ai-${Date.now()}`,
            session_id: resolvedSessionId || 'local',
            user_id: user.id,
            role: 'assistant',
            content: replyText,
            image_path: null,
            image_mime: null,
            action_tag: effectiveMode,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, localAssistantMsg]);
          setError(
            persistErr instanceof Error
              ? `Lesson step generated, but could not save to cloud history: ${persistErr.message}`
              : 'Lesson step generated, but could not save to cloud history.'
          );
        }
      } else {
        const localAssistantMsg: AiMessageRecord = {
          id: `local-tutor-ai-${Date.now()}`,
          session_id: 'local',
          user_id: 'local',
          role: 'assistant',
          content: replyText,
          image_path: null,
          image_mime: null,
          action_tag: effectiveMode,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, localAssistantMsg]);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError' && controller.signal.aborted) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to reach Personal AI Tutor.');
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      if (typedInputSnapshot !== null) {
        setInputText(typedInputSnapshot);
      }
      if (isNewPendingImage && outgoingImage) {
        setPendingImage(outgoingImage);
        setActiveSessionImage(previousActiveImage);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setStreamingContent('');
        setSending(false);
        inFlightRef.current = false;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!inFlightRef.current && !sending) {
        sendTutorTurn();
      }
    }
  };

  const previewAttachment = pendingImage || activeSessionImage;
  const maxStepDisplay = Math.max(5, tutorStep);

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-8.5rem)] lg:flex-row">
      {/* Left Tutoring Sessions Sidebar */}
      <aside
        className={`${
          historyOpen ? 'block' : 'hidden'
        } w-full shrink-0 flex-col rounded-2xl border border-slate-200 bg-white lg:flex lg:w-72 dark:border-slate-800 dark:bg-[#0D162B]`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 select-none dark:border-slate-800">
          <div className="flex items-center gap-2">
            <GraduationCap
              className="h-4 w-4 text-blue-600 dark:text-cyan-400"
              aria-hidden="true"
            />
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Tutoring Sessions
            </h2>
          </div>
          <button
            type="button"
            onClick={handleNewSession}
            className="inline-flex items-center gap-1 rounded-lg bg-[#0F1E3D] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#192F5D] dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New</span>
          </button>
        </div>

        <div className="max-h-64 flex-1 overflow-y-auto p-2.5 lg:max-h-none">
          {!isSupabaseConfigured ? (
            <p className="p-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Active locally. Configure Supabase to save tutoring progress and reopen past lessons.
            </p>
          ) : loadingSessions ? (
            <div className="space-y-2 p-2">
              <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <GraduationCap className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Your step-by-step tutoring sessions will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleSelectSession(session);
                      }
                    }}
                    className={`group flex cursor-pointer items-start justify-between gap-2 rounded-xl px-3 py-2.5 transition-colors select-none ${
                      isActive
                        ? 'bg-blue-50 text-blue-950 dark:bg-blue-950/50 dark:text-white'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">
                        {session.title}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        Step {session.tutor_step} · {(session.tutor_mode || 'standard').toUpperCase()} · {session.subject_area}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      aria-label={`Delete ${session.title}`}
                      className="rounded-md p-1 text-slate-400 opacity-70 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Main Structured Tutoring Workspace */}
      <section className="flex min-h-[560px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0D162B]">
        {/* Tutor Progress & Mode Header */}
        <header className="border-b border-slate-200 px-5 py-3.5 select-none dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 lg:hidden dark:border-slate-700 dark:text-slate-200"
                >
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sessions</span>
                </button>
                <h1 className="truncate font-display text-base font-bold text-slate-900 dark:text-white">
                  {currentTopic || 'Personal AI Tutor'}
                </h1>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {subjectArea} · {stageLabel}
                {activeDocumentContext ? ` · Source: "${activeDocumentContext.title}"` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Attach Reference Material/Summary */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setContextPickerOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activeDocumentContext
                      ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{activeDocumentContext ? 'Material Linked' : 'Study Material'}</span>
                </button>

                {contextPickerOpen && (
                  <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-[#0B1325]">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Teach From Study Material
                      </p>
                      <button
                        type="button"
                        onClick={() => setContextPickerOpen(false)}
                        className="rounded p-0.5 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                      {activeDocumentContext && (
                        <button
                          type="button"
                          onClick={() => handleAttachContext(null, null)}
                          className="w-full rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-left text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                        >
                          Remove Material Link
                        </button>
                      )}
                      {materials.length === 0 && summaries.length === 0 ? (
                        <p className="py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                          No uploaded materials or saved summaries available yet.
                        </p>
                      ) : (
                        <>
                          {materials.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => handleAttachContext(m.id, null)}
                              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                                selectedMaterialId === m.id
                                  ? 'bg-blue-50 font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-cyan-300'
                                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                              }`}
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{m.title}</span>
                            </button>
                          ))}
                          {summaries.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleAttachContext(null, s.id)}
                              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                                selectedSummaryId === s.id
                                  ? 'bg-blue-50 font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-cyan-300'
                                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                              }`}
                            >
                              <BookOpen className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{s.title}</span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Learning Mode Switcher */}
              <div
                className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-700 dark:bg-slate-900"
                role="group"
                aria-label="Tutor learning mode"
              >
                {TUTOR_MODES.map((m) => {
                  const active = tutorMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      title={m.description}
                      onClick={() => handleModeChange(m.id)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        active
                          ? 'bg-[#0F1E3D] text-white dark:bg-blue-600'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      {m.label.replace(' Mode', '')}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Step-by-Step Progress Strip */}
          {messages.length > 0 && (
            <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2.5 dark:border-slate-800/80">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-cyan-400">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono tabular-nums">Step {tutorStep}</span>
              </div>
              <div className="flex flex-1 items-center gap-1.5">
                {Array.from({ length: maxStepDisplay }, (_, i) => i + 1).map((stepNum) => (
                  <div
                    key={stepNum}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      stepNum <= tutorStep
                        ? 'bg-blue-600 dark:bg-cyan-400'
                        : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                ))}
              </div>
              <span className="hidden text-[11px] font-medium text-slate-500 sm:inline dark:text-slate-400">
                {TUTOR_MODES.find((m) => m.id === tutorMode)?.label}
              </span>
            </div>
          )}
        </header>

        {!geminiConfigured && (
          <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">GEMINI_API_KEY is not configured</p>
              <p className="mt-0.5">
                Add <code className="font-mono">GEMINI_API_KEY</code> in Secrets to start live guided tutoring sessions.
              </p>
            </div>
          </div>
        )}

        {/* Lesson Thread */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loadingMessages ? (
            <div className="flex h-full items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-cyan-400">
                <GraduationCap className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-slate-900 select-none dark:text-white">
                Step-by-Step Guided Academic Tutoring
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Choose a learning depth above, enter a topic or upload a photo of a lesson problem, and Brainstine will teach you progressively with worked examples and check-for-understanding practice.
              </p>

              {/* Mode Overview Strip */}
              <div className="mt-5 grid w-full grid-cols-1 gap-2.5 text-left sm:grid-cols-3">
                {TUTOR_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModeChange(m.id)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      tutorMode === m.id
                        ? 'border-blue-400 bg-blue-50/70 dark:border-cyan-500 dark:bg-cyan-950/30'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900 select-none dark:text-white">
                      {m.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                      {m.description}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-5 w-full">
                <p className="mb-2 text-left text-xs font-semibold text-slate-500 select-none dark:text-slate-400">
                  Start Teaching a Topic Immediately
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TOPIC_STARTERS.map((topic) => (
                    <button
                      key={topic.title}
                      type="button"
                      disabled={sending}
                      onClick={() =>
                        sendTutorTurn({
                          overrideText: `Teach me ${topic.title} from the beginning, step by step.`,
                          quickAction: 'Teach me this topic from the beginning',
                        })
                      }
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-cyan-700 dark:hover:bg-slate-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                          {topic.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {topic.area}
                        </p>
                      </div>
                      <Sparkles
                        className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-cyan-400"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const imgSrc =
                  msg.localPreviewUrl ||
                  (msg.image_path ? signedImageUrls[msg.image_path] : undefined);

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-3.5 sm:max-w-[85%] ${
                        isUser
                          ? 'bg-[#0F1E3D] text-white dark:bg-blue-600'
                          : 'w-full border border-slate-200 bg-slate-50/70 text-slate-900 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100'
                      }`}
                    >
                      {!isUser && (
                        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 select-none dark:text-cyan-400">
                          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>
                            Brainstine Tutor · {(msg.action_tag || tutorMode).toUpperCase()}
                          </span>
                        </div>
                      )}

                      {imgSrc && (
                        <div className="mb-2.5 overflow-hidden rounded-xl border border-white/15 bg-slate-950/20">
                          <img
                            src={imgSrc}
                            alt="Study material photo"
                            className="max-h-64 w-auto object-contain"
                          />
                        </div>
                      )}

                      {isUser ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed select-text">
                          {msg.content}
                        </p>
                      ) : (
                        <AcademicContentRenderer content={msg.content} />
                      )}
                    </div>

                    {!isUser && (
                      <div className="mt-1 pl-1 select-none">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-500" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {sending && streamingContent ? (
                <div className="flex flex-col items-start">
                  <div className="w-full max-w-[90%] rounded-2xl border border-blue-200/80 bg-slate-50/90 px-4 py-3.5 text-slate-900 sm:max-w-[85%] dark:border-cyan-900/50 dark:bg-slate-900/60 dark:text-slate-100">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-blue-700 select-none dark:text-cyan-400">
                      <span className="inline-flex items-center gap-1.5">
                        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Brainstine Tutor · {tutorMode.toUpperCase()}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        <span>Streaming...</span>
                      </span>
                    </div>
                    <AcademicContentRenderer content={streamingContent} />
                  </div>
                </div>
              ) : sending ? (
                <div className="flex items-start">
                  <div className="inline-flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 select-none dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-cyan-400" />
                    <span>
                      {elapsedSeconds >= 8
                        ? `Preparing detailed step-by-step explanation (${elapsedSeconds}s) — still working...`
                        : 'Preparing your next guided step...'}
                    </span>
                  </div>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Bottom Interactive Prompts & Composer */}
        <div className="border-t border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-[#0D162B]">
          {error && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="p-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 7 Interactive Tutoring Controls */}
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5 select-none">
            {INTERACTIVE_TUTOR_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={sending}
                onClick={() => {
                  let overrideMode: TutorMode | undefined;
                  if (item.label === 'Explain like a beginner' || item.label === 'Make it easier') {
                    overrideMode = 'beginner';
                    handleModeChange('beginner');
                  } else if (item.label === 'Next level' && tutorMode === 'beginner') {
                    overrideMode = 'standard';
                    handleModeChange('standard');
                  }
                  sendTutorTurn({
                    overrideText: item.command,
                    quickAction: item.label,
                    overrideMode,
                  });
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-500 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
              >
                {item.label}
              </button>
            ))}
          </div>

          {previewAttachment && (
            <SnapAttachmentPreview
              attachment={previewAttachment}
              isPersistedContext={!pendingImage && Boolean(activeSessionImage)}
              disabled={sending}
              onReplace={(next) => setPendingImage(next)}
              onRemove={() => {
                setPendingImage(null);
                setActiveSessionImage(null);
              }}
              onQuickAction={(action, defaultPrompt) =>
                sendTutorTurn({ overrideText: defaultPrompt, imageAction: action })
              }
              onError={(msg) => setError(msg)}
            />
          )}

          <div className="flex flex-wrap items-end gap-2">
            <SnapTriggerButtons
              disabled={sending}
              onImageSelected={(att) => {
                setPendingImage(att);
                setError(null);
              }}
              onError={(msg) => setError(msg)}
            />

            <textarea
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder={
                messages.length === 0
                  ? 'Enter a topic you want to learn, or snap/upload a photo of a page or problem...'
                  : 'Answer the tutor’s check question, ask for clarification, or describe what confused you...'
              }
              className="min-h-11 max-h-36 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden select-text dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:focus:border-cyan-500 dark:focus:bg-slate-900"
            />

            <button
              type="button"
              disabled={sending || (!inputText.trim() && !pendingImage)}
              onClick={() => sendTutorTurn()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0F1E3D] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:cursor-not-allowed disabled:opacity-50 select-none dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{messages.length === 0 ? 'Start Lesson' : 'Reply'}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
