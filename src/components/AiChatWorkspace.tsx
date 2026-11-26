import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  GraduationCap,
  History,
  Loader2,
  MessageSquarePlus,
  MessageSquareText,
  Mic,
  Paperclip,
  Pause,
  Play,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatClientApiError, sanitizeUserErrorMessage } from '../lib/apiClient';
import {
  useChatbotSpeechPlayback,
  useChatbotVoiceInput,
} from '../lib/chatbotVoice';
import { postSseStream } from '../lib/sseClient';
import {
  createAiMessage,
  createAiSession,
  deleteAiSession,
  getMaterialSignedUrl,
  getOptionalAccessToken,
  isSupabaseConfigured,
  listAiMessages,
  listAiSessions,
  recordStudyActivity,
  restoreSessionImageAttachment,
  updateAiSession,
  uploadSessionImageToStorage,
} from '../lib/supabase';
import type {
  AiMessageRecord,
  AiSessionRecord,
  ChatRagMeta,
  ChatRetrievedSource,
  ImageActionType,
  SnapImageAttachment,
  StudyMaterialRecord,
  StudySummaryRecord,
} from '../types/brainstine';
import { resolveSubjectVisual } from '../lib/educationalVisuals';
import { stripUnsupportedDisplaySymbols } from '../lib/scientificFormatter';
import { AcademicContentRenderer } from './AcademicContentRenderer';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import {
  SnapAttachmentPreview,
  SnapTriggerButtons,
} from './SnapPhotoControl';
import { SubjectVisualBanner } from './SubjectVisualBanner';

interface AiChatWorkspaceProps {
  materials: StudyMaterialRecord[];
  summaries: StudySummaryRecord[];
  geminiConfigured: boolean;
  initialSessionId?: string | null;
  onConsumeInitialSession?: () => void;
  onActivityRecorded: () => void;
  onSendImageToTutor: (attachment: SnapImageAttachment) => void;
}

const STARTER_PROMPTS = [
  {
    subject: 'Biology & Medicine',
    prompt: 'Explain the mechanism of action potentials across a neuronal membrane step by step.',
  },
  {
    subject: 'Chemistry',
    prompt: 'Compare SN1 and SN2 nucleophilic substitution reactions with energy diagrams and examples.',
  },
  {
    subject: 'Mathematics',
    prompt: 'Solve the integral of x * e^(2x) dx using integration by parts and show every step.',
  },
  {
    subject: 'Computer Science',
    prompt: 'Explain time and space complexity differences between Merge Sort and Quick Sort with code.',
  },
];

export function AiChatWorkspace({
  materials,
  summaries,
  geminiConfigured,
  initialSessionId,
  onConsumeInitialSession,
  onActivityRecorded,
  onSendImageToTutor,
}: AiChatWorkspaceProps) {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<AiSessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageRecord[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AiSessionRecord | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);

  // Document Context attachment
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null);

  // Image Snap/Upload Context
  const [pendingImage, setPendingImage] = useState<SnapImageAttachment | null>(null);
  const [activeSessionImage, setActiveSessionImage] = useState<SnapImageAttachment | null>(null);
  const [signedImageUrls, setSignedImageUrls] = useState<Record<string, string>>({});

  // RAG Source References per message (in-memory for active session turns)
  const [messageRagById, setMessageRagById] = useState<
    Record<string, { sources: ChatRetrievedSource[]; ragMeta?: ChatRagMeta }>
  >({});
  const [streamingRag, setStreamingRag] = useState<{
    sources: ChatRetrievedSource[];
    ragMeta?: ChatRagMeta;
  } | null>(null);
  const [expandedSourceKey, setExpandedSourceKey] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleVoiceError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  const {
    isListening,
    interimTranscript,
    startListening,
    stopListening,
    cancelListening,
  } = useChatbotVoiceInput({
    currentInput: inputText,
    onInputChange: setInputText,
    onError: handleVoiceError,
  });

  const speechPlayback = useChatbotSpeechPlayback(handleVoiceError);

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

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const activeDocumentContext = useMemo(() => {
    if (selectedMaterialId) {
      const mat = materials.find((m) => m.id === selectedMaterialId);
      if (mat) {
        return {
          id: mat.id,
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
          id: sum.id,
          title: sum.title,
          type: 'Saved Study Summary',
          content: sum.markdown_content,
        };
      }
    }
    return null;
  }, [materials, summaries, selectedMaterialId, selectedSummaryId]);

  useEffect(() => {
    if (selectedMaterialId && !materials.some((m) => m.id === selectedMaterialId)) {
      setSelectedMaterialId(null);
    }
  }, [materials, selectedMaterialId]);

  useEffect(() => {
    if (selectedSummaryId && !summaries.some((s) => s.id === selectedSummaryId)) {
      setSelectedSummaryId(null);
    }
  }, [summaries, selectedSummaryId]);

  const loadSessions = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setLoadingSessions(false);
      return;
    }
    try {
      const list = await listAiSessions(user.id, 'chat');
      setSessions(list);
    } catch (err) {
      console.warn('Could not load chat sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, [user]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (streamingContent) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [streamingContent]);

  // Resolve signed URLs for stored message images
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

  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const handleSelectSession = useCallback(async (session: AiSessionRecord) => {
    abortControllerRef.current?.abort();
    if (isListening) cancelListening();
    speechPlayback.stop();
    inFlightRef.current = false;
    setSending(false);
    setStreamingContent('');
    setStreamingRag(null);
    setExpandedSourceKey(null);
    activeSessionIdRef.current = session.id;
    setActiveSessionId(session.id);
    setSelectedMaterialId(session.attached_material_id);
    setSelectedSummaryId(session.attached_summary_id);
    setPendingImage(null);
    setActiveSessionImage(null);
    setError(null);
    setHistorySidebarOpen(false);

    if (!user || !isSupabaseConfigured) return;
    setLoadingMessages(true);
    try {
      const [loaded, restoredImage] = await Promise.all([
        listAiMessages(user.id, session.id),
        session.active_image_path
          ? restoreSessionImageAttachment(session.active_image_path, session.active_image_mime)
          : Promise.resolve(null),
      ]);
      if (activeSessionIdRef.current !== session.id) return;
      setMessages(loaded);
      if (restoredImage) {
        setActiveSessionImage(restoredImage);
      }
    } catch (err: unknown) {
      setError(sanitizeUserErrorMessage(err, 'loading your conversation'));
    } finally {
      setLoadingMessages(false);
    }
  }, [user, isListening, cancelListening, speechPlayback]);

  useEffect(() => {
    if (!initialSessionId || loadingSessions) return;
    const match = sessions.find((s) => s.id === initialSessionId);
    if (match) {
      handleSelectSession(match);
    }
    onConsumeInitialSession?.();
  }, [initialSessionId, loadingSessions, sessions, handleSelectSession, onConsumeInitialSession]);

  const handleNewChat = () => {
    abortControllerRef.current?.abort();
    if (isListening) cancelListening();
    speechPlayback.stop();
    inFlightRef.current = false;
    setSending(false);
    setStreamingContent('');
    setStreamingRag(null);
    setExpandedSourceKey(null);
    setMessageRagById({});
    setActiveSessionId(null);
    setMessages([]);
    setInputText('');
    setPendingImage(null);
    setActiveSessionImage(null);
    setError(null);
    setHistorySidebarOpen(false);
  };

  const requestDeleteSession = (
    e: React.MouseEvent,
    session: AiSessionRecord
  ) => {
    e.stopPropagation();
    setDeleteTarget(session);
  };

  const confirmDeleteSession = async () => {
    if (!user || !isSupabaseConfigured || !deleteTarget) return;
    const sessionId = deleteTarget.id;
    setDeletingSession(true);
    try {
      await deleteAiSession(user.id, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        handleNewChat();
      }
      setDeleteTarget(null);
      onActivityRecorded();
    } catch (err: unknown) {
      setError(sanitizeUserErrorMessage(err, 'deleting your conversation'));
    } finally {
      setDeletingSession(false);
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

  const sendMessage = async (options?: {
    overrideText?: string;
    imageAction?: ImageActionType;
    explanationStyle?: 'default' | 'shorter' | 'simpler' | 'detailed';
  }) => {
    if (inFlightRef.current) return;
    if (isListening) {
      stopListening();
    }

    const cleanText = (options?.overrideText ?? inputText).trim();
    const imageToSend = pendingImage || activeSessionImage;

    if (!cleanText && !pendingImage && !options?.imageAction) {
      setError('Enter a question or attach an image to ask Brainstine AI Chat.');
      return;
    }

    inFlightRef.current = true;
    setError(null);
    setSending(true);
    setStreamingContent('');
    setStreamingRag(null);

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
      (options?.imageAction
        ? `Analyze attached image (${options.imageAction.replace('_', ' ')})`
        : 'Analyze attached study image');

    const tempUserMsg: AiMessageRecord = {
      id: `local-user-${Date.now()}`,
      session_id: activeSessionId || 'local',
      user_id: user?.id || 'local',
      role: 'user',
      content: displayUserContent,
      image_path: null,
      image_mime: outgoingImage?.mimeType || null,
      action_tag: options?.imageAction || null,
      created_at: new Date().toISOString(),
      localPreviewUrl: outgoingImage?.previewUrl,
    };

    const historyForApi = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const accessToken = isSupabaseConfigured ? await getOptionalAccessToken() : null;
      const fallbackLocalMaterials =
        !accessToken && !activeDocumentContext && materials.length > 0
          ? materials.slice(0, 10).map((m) => ({
              id: m.id,
              userId: m.user_id,
              title: m.title,
              materialType: m.material_type,
              extractedText: m.extracted_text,
            }))
          : undefined;

      const data = await postSseStream<{
        reply: string;
        suggestedTitle?: string;
        subjectArea?: string;
        sources?: ChatRetrievedSource[];
        ragMeta?: ChatRagMeta;
      }>({
        url: '/api/ai/chat/stream',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        body: {
          message: displayUserContent,
          history: historyForApi,
          documentContext: activeDocumentContext,
          attachedDocumentId: selectedMaterialId || selectedSummaryId || null,
          userId: user?.id || null,
          ...(fallbackLocalMaterials ? { studyMaterials: fallbackLocalMaterials } : {}),
          image: imageToSend
            ? { data: imageToSend.base64, mimeType: imageToSend.mimeType }
            : null,
          imageAction: options?.imageAction,
          explanationStyle: options?.explanationStyle || 'default',
          needsTitle: isFirstTurn,
        },
        signal: controller.signal,
        idleTimeoutMs: 75000,
        fallbackErrorMessage:
          'Unable to get a response from AI Academic Chat. Your message has been preserved—please try again.',
        contextAction: 'generating an AI Academic Chat response',
        onSources: (payload) => {
          const srcs = Array.isArray(payload.sources)
            ? (payload.sources as ChatRetrievedSource[])
            : [];
          const meta = (payload.ragMeta as ChatRagMeta | undefined) || undefined;
          setStreamingRag({ sources: srcs, ragMeta: meta });
        },
        onChunk: (_delta, accumulated) => {
          setStreamingContent(accumulated);
        },
      });

      const assistantReply: string = data.reply || '';
      const suggestedTitle: string | undefined = data.suggestedTitle;
      const subjectArea: string | undefined = data.subjectArea;
      const finalSources: ChatRetrievedSource[] = Array.isArray(data.sources) ? data.sources : [];
      const finalRagMeta: ChatRagMeta | undefined = data.ragMeta;
      setStreamingContent('');
      setStreamingRag(null);

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
              console.warn('Optional session image upload failed:', uploadErr);
            }
          }

          if (!resolvedSessionId) {
            const created = await createAiSession({
              userId: user.id,
              sessionType: 'chat',
              title:
                suggestedTitle ||
                displayUserContent.slice(0, 48) ||
                'Academic Study Chat',
              subjectArea: subjectArea || 'General Studies',
              attachedMaterialId: selectedMaterialId,
              attachedSummaryId: selectedSummaryId,
              activeImagePath: uploadedImagePath,
              activeImageMime: outgoingImage?.mimeType || null,
            });
            resolvedSessionId = created.id;
            setActiveSessionId(created.id);
            setSessions((prev) => [created, ...prev]);
          } else {
            const updates: Partial<AiSessionRecord> = {};
            if (suggestedTitle) updates.title = suggestedTitle;
            if (subjectArea) updates.subject_area = subjectArea;
            if (uploadedImagePath) {
              updates.active_image_path = uploadedImagePath;
              updates.active_image_mime = outgoingImage?.mimeType || null;
            }
            await updateAiSession(user.id, resolvedSessionId, updates);
            setSessions((prev) =>
              prev.map((s) =>
                s.id === resolvedSessionId
                  ? {
                      ...s,
                      ...(suggestedTitle ? { title: suggestedTitle } : {}),
                      ...(subjectArea ? { subject_area: subjectArea } : {}),
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
            actionTag: options?.imageAction || null,
          });

          const savedAssistantMsg = await createAiMessage({
            sessionId: resolvedSessionId,
            userId: user.id,
            role: 'assistant',
            content: assistantReply,
            actionTag: options?.explanationStyle || options?.imageAction || null,
          });

          if (isFirstTurn) {
            await recordStudyActivity({
              userId: user.id,
              activityType: 'chat',
              title: suggestedTitle || 'AI Academic Chat',
              detail: `${subjectArea || 'Academic'} · ${displayUserContent.slice(0, 72)}`,
              materialType: outgoingImage ? 'image' : 'text',
            });
            onActivityRecorded();
          }

          setMessages((prev) => [
            ...prev.filter((m) => m.id !== tempUserMsg.id),
            { ...savedUserMsg, localPreviewUrl: outgoingImage?.previewUrl },
            savedAssistantMsg,
          ]);
          if (finalSources.length > 0 || finalRagMeta) {
            setMessageRagById((prev) => ({
              ...prev,
              [savedAssistantMsg.id]: { sources: finalSources, ragMeta: finalRagMeta },
            }));
          }
        } catch (persistErr: unknown) {
          const localId = `local-ai-${Date.now()}`;
          const localAssistantMsg: AiMessageRecord = {
            id: localId,
            session_id: resolvedSessionId || 'local',
            user_id: user.id,
            role: 'assistant',
            content: assistantReply,
            image_path: null,
            image_mime: null,
            action_tag: options?.explanationStyle || options?.imageAction || null,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, localAssistantMsg]);
          if (finalSources.length > 0 || finalRagMeta) {
            setMessageRagById((prev) => ({
              ...prev,
              [localId]: { sources: finalSources, ragMeta: finalRagMeta },
            }));
          }
          setError(
            `Response generated, but could not save to your history right now: ${sanitizeUserErrorMessage(
              persistErr,
              'saving your message'
            )}`
          );
        }
      } else {
        const localId = `local-ai-${Date.now()}`;
        const localAssistantMsg: AiMessageRecord = {
          id: localId,
          session_id: 'local',
          user_id: 'local',
          role: 'assistant',
          content: assistantReply,
          image_path: null,
          image_mime: null,
          action_tag: options?.explanationStyle || null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, localAssistantMsg]);
        if (finalSources.length > 0 || finalRagMeta) {
          setMessageRagById((prev) => ({
            ...prev,
            [localId]: { sources: finalSources, ragMeta: finalRagMeta },
          }));
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError' && controller.signal.aborted) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        return;
      }
      setError(formatClientApiError(err, 'contacting AI Academic Chat'));
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
        setStreamingRag(null);
        setSending(false);
        inFlightRef.current = false;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!inFlightRef.current && !sending) {
        sendMessage();
      }
    }
  };

  const previewAttachment = pendingImage || activeSessionImage;

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-8.5rem)] lg:flex-row">
      {/* Left Conversation History Sidebar */}
      <aside
        className={`${
          historySidebarOpen ? 'block' : 'hidden'
        } w-full shrink-0 flex-col rounded-2xl border border-slate-200 bg-white lg:flex lg:w-72 dark:border-slate-800 dark:bg-[#0D162B]`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 select-none dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Chat History
            </h2>
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-[#0F1E3D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#192F5D] sm:min-h-8 sm:px-2.5 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New Chat</span>
          </button>
        </div>

        <div className="max-h-64 flex-1 overflow-y-auto p-2.5 lg:max-h-none">
          {!isSupabaseConfigured ? (
            <p className="p-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Current session active locally. Sign in when cloud sync is enabled to save and reopen chat history across sessions.
            </p>
          ) : loadingSessions ? (
            <div className="space-y-2 p-2">
              <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MessageSquareText className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Your saved academic conversations will appear here.
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
                        {session.subject_area} · {new Date(session.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => requestDeleteSession(e, session)}
                      aria-label={`Delete ${session.title}`}
                      className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md p-1 text-slate-400 opacity-75 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 sm:min-h-0 sm:min-w-0 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
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

      {/* Main Conversational Panel */}
      <section className="flex min-h-[480px] sm:min-h-[540px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0D162B]">
        {/* Top Chat Workspace Bar */}
        <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 px-3.5 py-3 select-none sm:gap-3 sm:px-5 sm:py-3.5 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHistorySidebarOpen((prev) => !prev)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 lg:hidden dark:border-slate-700 dark:text-slate-200"
              >
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                <span>History</span>
              </button>
              <h1 className="truncate font-display text-base font-bold text-slate-900 dark:text-white">
                {activeSession?.title || 'AI Academic Chatbot'}
              </h1>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {activeSession?.subject_area || 'All academic subjects'}
              {activeDocumentContext
                ? ` · Grounded in "${activeDocumentContext.title}"`
                : ' · Context-aware Q&A, problem solving & photo analysis'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Document Context Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setContextPickerOpen((prev) => !prev)}
                className={`inline-flex min-h-10 sm:min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeDocumentContext
                    ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden min-[380px]:inline">
                  {activeDocumentContext ? 'Study Doc Attached' : 'Attach Study Doc'}
                </span>
                <span className="min-[380px]:hidden">
                  {activeDocumentContext ? 'Attached' : 'Attach Doc'}
                </span>
              </button>

              {contextPickerOpen && (
                <div className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-[#0B1325]">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Ground Chat in Study Material
                    </p>
                    <button
                      type="button"
                      onClick={() => setContextPickerOpen(false)}
                      aria-label="Close document picker"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                    {activeDocumentContext && (
                      <button
                        type="button"
                        onClick={() => handleAttachContext(null, null)}
                        className="w-full rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-left text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                      >
                        Detach Current Document
                      </button>
                    )}

                    {materials.length === 0 && summaries.length === 0 ? (
                      <p className="py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                        No uploaded materials or saved summaries found yet.
                      </p>
                    ) : (
                      <>
                        {materials.length > 0 && (
                          <div>
                            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Uploaded Materials
                            </p>
                            <div className="mt-1 space-y-1">
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
                            </div>
                          </div>
                        )}

                        {summaries.length > 0 && (
                          <div>
                            <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Saved Summaries
                            </p>
                            <div className="mt-1 space-y-1">
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
                                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{s.title}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex min-h-10 sm:min-h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="New AI chat"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </header>

        {!geminiConfigured && (
          <div className="mx-3.5 sm:mx-5 mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">AI Academic Chat Temporarily Unavailable</p>
              <p className="mt-0.5">
                Live AI Academic Chat and image analysis are temporarily unavailable right now.
                Please try again shortly. Your saved conversation history remains browsable.
              </p>
            </div>
          </div>
        )}

        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 sm:px-5 sm:py-5">
          {loadingMessages ? (
            <div className="flex h-full items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-4 text-center">
              <SubjectVisualBanner
                visualKey="chatbot"
                variant="hero"
                title="AI Academic Chatbot · Research & Problem Solving"
                subtitle="Work through equations step by step, compare concepts with structured tables, attach your notes, or snap a photo of a diagram."
                className="w-full text-left"
              />

              <div className="mt-5 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2">
                {STARTER_PROMPTS.map((item) => {
                  const thumb = resolveSubjectVisual(`${item.subject} ${item.prompt}`, 'chatbot');
                  return (
                    <button
                      key={item.subject}
                      type="button"
                      disabled={sending}
                      onClick={() => sendMessage({ overrideText: item.prompt })}
                      className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/60 hover:shadow-sm disabled:opacity-50 select-none dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-cyan-700 dark:hover:bg-slate-800/80"
                    >
                      <div className="aspect-[16/9] w-full overflow-hidden border-b border-slate-200/80 bg-slate-900 dark:border-slate-800">
                        <img
                          src={thumb.src}
                          alt={thumb.alt}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-3.5">
                        <p className="text-[11px] font-semibold text-blue-700 dark:text-cyan-400">
                          {item.subject}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                          {item.prompt}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const imgSrc =
                  msg.localPreviewUrl ||
                  (msg.image_path ? signedImageUrls[msg.image_path] : undefined);
                const isLatestAssistant = !isUser && idx === messages.length - 1;

                const isSpeakingThisMessage =
                  speechPlayback.activeMessageId === msg.id &&
                  speechPlayback.status === 'speaking';
                const isPausedThisMessage =
                  speechPlayback.activeMessageId === msg.id &&
                  speechPlayback.status === 'paused';

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`min-w-0 rounded-2xl ${
                        isUser
                          ? 'max-w-[92%] bg-[#0F1E3D] px-4 py-3 text-white sm:max-w-[80%] dark:bg-blue-600'
                          : 'w-full max-w-full overflow-hidden border border-slate-200/90 bg-slate-50/55 px-4 py-4 text-slate-900 sm:max-w-[92%] sm:px-6 sm:py-5 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100'
                      }`}
                    >
                      {imgSrc && (
                        <div className="mb-3 overflow-hidden rounded-xl border border-white/15 bg-slate-950/20">
                          <img
                            src={imgSrc}
                            alt="Uploaded study snapshot"
                            className="max-h-64 w-auto object-contain"
                          />
                        </div>
                      )}

                      {isUser ? (
                        <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed select-text">
                          {msg.content}
                        </p>
                      ) : (
                        <>
                          <AcademicContentRenderer content={msg.content} collapsibleSections />
                          {(() => {
                            const ragInfo = messageRagById[msg.id];
                            if (!ragInfo) return null;
                            if (ragInfo.sources.length > 0) {
                              return (
                                <div className="mt-4 max-w-[74ch] border-t border-slate-200/80 pt-3 dark:border-slate-800">
                                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    <BookOpen className="h-3.5 w-3.5 text-blue-600 dark:text-cyan-400" aria-hidden="true" />
                                    <span>Study Material References</span>
                                  </p>
                                  <div className="space-y-1.5">
                                    {ragInfo.sources.map((src, sIdx) => {
                                      const srcKey = `${msg.id}-${src.documentId}-${src.chunkPosition}-${sIdx}`;
                                      const isExpanded = expandedSourceKey === srcKey;
                                      return (
                                        <div
                                          key={srcKey}
                                          className="rounded-lg border border-slate-200/90 bg-white/80 dark:border-slate-800 dark:bg-slate-950/45"
                                        >
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedSourceKey(isExpanded ? null : srcKey)
                                            }
                                            aria-expanded={isExpanded}
                                            className="flex min-h-9 w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                          >
                                            <span className="flex min-w-0 items-center gap-2 text-slate-800 dark:text-slate-200">
                                              <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-cyan-400" aria-hidden="true" />
                                              <span className="truncate font-medium">
                                                {src.documentTitle}
                                              </span>
                                            </span>
                                            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                                              {src.pageNumber !== null ? `Page ${src.pageNumber}` : 'Excerpt'}
                                              {isExpanded ? (
                                                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                                              ) : (
                                                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                                              )}
                                            </span>
                                          </button>
                                          {isExpanded && (
                                            <div className="border-t border-slate-200/80 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:text-slate-300">
                                              {stripUnsupportedDisplaySymbols(src.excerpt)}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            }
                            if ((ragInfo.ragMeta?.searchedDocumentsCount ?? 0) > 0) {
                              return (
                                <p className="mt-4 border-t border-slate-200/80 pt-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                  General academic knowledge · No matching excerpt found in your uploaded study materials
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </>
                      )}
                    </div>

                    {!isUser && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-0.5 select-none">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="inline-flex min-h-9 sm:min-h-7 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
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

                        {/* Spoken AI Response Controls (Text-to-Speech) */}
                        {isSpeakingThisMessage ? (
                          <>
                            <button
                              type="button"
                              onClick={() => speechPlayback.pause()}
                              aria-label="Pause spoken response"
                              className="inline-flex min-h-9 sm:min-h-7 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 transition-colors hover:bg-blue-100 dark:border-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300"
                            >
                              <Pause className="h-3 w-3" aria-hidden="true" />
                              <span>Pause</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => speechPlayback.stop()}
                              aria-label="Stop spoken response"
                              className="inline-flex min-h-9 sm:min-h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                              <span>Stop</span>
                            </button>
                          </>
                        ) : isPausedThisMessage ? (
                          <>
                            <button
                              type="button"
                              onClick={() => speechPlayback.resume()}
                              aria-label="Resume spoken response"
                              className="inline-flex min-h-9 sm:min-h-7 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 transition-colors hover:bg-blue-100 dark:border-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300"
                            >
                              <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                              <span>Resume</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => speechPlayback.stop()}
                              aria-label="Stop spoken response"
                              className="inline-flex min-h-9 sm:min-h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                              <span>Stop</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => speechPlayback.playMessage(msg.id, msg.content)}
                            aria-label="Listen to response aloud"
                            className="inline-flex min-h-9 sm:min-h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                          >
                            <Volume2 className="h-3 w-3" aria-hidden="true" />
                            <span>Listen</span>
                          </button>
                        )}

                        {isLatestAssistant && (
                          <>
                            <span className="hidden text-slate-300 sm:inline dark:text-slate-700">·</span>
                            <button
                              type="button"
                              disabled={sending}
                              onClick={() =>
                                sendMessage({
                                  overrideText:
                                    'Summarize your previous explanation into a much shorter version with just the key points.',
                                  explanationStyle: 'shorter',
                                })
                              }
                              className="min-h-9 sm:min-h-7 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Make Shorter
                            </button>
                            <button
                              type="button"
                              disabled={sending}
                              onClick={() =>
                                sendMessage({
                                  overrideText:
                                    'Re-explain your previous answer in much simpler, beginner-friendly terms with a clear analogy.',
                                  explanationStyle: 'simpler',
                                })
                              }
                              className="min-h-9 sm:min-h-7 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Explain Simpler
                            </button>
                            <button
                              type="button"
                              disabled={sending}
                              onClick={() =>
                                sendMessage({
                                  overrideText:
                                    'Expand your previous explanation with deeper academic detail, mechanisms, and concrete examples.',
                                  explanationStyle: 'detailed',
                                })
                              }
                              className="min-h-9 sm:min-h-7 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              More Detailed
                            </button>
                            {activeSessionImage && (
                              <button
                                type="button"
                                disabled={sending}
                                onClick={() => onSendImageToTutor(activeSessionImage)}
                                className="inline-flex min-h-9 sm:min-h-7 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300"
                              >
                                <GraduationCap className="h-3 w-3" />
                                <span>Open in AI Tutor</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {sending && streamingContent ? (
                <div className="flex flex-col items-start">
                  <div className="w-full max-w-full rounded-2xl border border-blue-200/80 bg-slate-50/85 px-4 py-4 text-slate-900 sm:max-w-[92%] sm:px-6 sm:py-5 dark:border-cyan-900/50 dark:bg-slate-900/60 dark:text-slate-100">
                    <div className="mb-2.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-blue-700 select-none dark:text-cyan-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Brainstine Document Assistant</span>
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        <span>Drafting...</span>
                      </span>
                    </div>
                    <AcademicContentRenderer content={streamingContent} />
                    {streamingRag && streamingRag.sources.length > 0 && (
                      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200/80 pt-2.5 text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <BookOpen className="h-3 w-3 text-blue-600 dark:text-cyan-400" aria-hidden="true" />
                          <span>References:</span>
                        </span>
                        {streamingRag.sources.map((src, sIdx) => (
                          <span
                            key={`stream-src-${sIdx}`}
                            className="font-mono text-[11px] text-slate-600 tabular-nums dark:text-slate-300"
                          >
                            {src.documentTitle}
                            {src.pageNumber !== null ? ` (Page ${src.pageNumber})` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : sending ? (
                <div className="flex items-start">
                  <div className="inline-flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 select-none dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-cyan-400" />
                    <span>
                      {elapsedSeconds >= 8
                        ? `Drafting detailed academic response (${elapsedSeconds}s) — still working...`
                        : 'Analyzing & drafting academic response...'}
                    </span>
                  </div>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Bottom Composer */}
        <div className="border-t border-slate-200 bg-white px-3.5 py-3 sm:px-5 sm:py-3.5 dark:border-slate-800 dark:bg-[#0D162B]">
          {error && (
            <div
              role="alert"
              className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-rose-100 dark:hover:bg-rose-900/40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {previewAttachment && (
            <SnapAttachmentPreview
              attachment={previewAttachment}
              isPersistedContext={!pendingImage && Boolean(activeSessionImage)}
              disabled={sending}
              onReplace={(next) => setPendingImage(next)}
              onRemove={() => {
                const hadPersisted = Boolean(activeSessionImage);
                setPendingImage(null);
                setActiveSessionImage(null);
                if (hadPersisted && user && isSupabaseConfigured && activeSessionId) {
                  updateAiSession(user.id, activeSessionId, {
                    active_image_path: null,
                    active_image_mime: null,
                  }).catch(() => {});
                  setSessions((prev) =>
                    prev.map((s) =>
                      s.id === activeSessionId
                        ? { ...s, active_image_path: null, active_image_mime: null }
                        : s
                    )
                  );
                }
              }}
              onQuickAction={(action, defaultPrompt) =>
                sendMessage({ overrideText: defaultPrompt, imageAction: action })
              }
              onError={(msg) => setError(msg)}
              showTutorHandoff
              onHandoffToTutor={() => onSendImageToTutor(previewAttachment)}
            />
          )}

          {isListening && (
            <div
              role="status"
              aria-live="polite"
              className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3 py-2 text-xs text-rose-950 select-none dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-100"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
                </span>
                <span className="font-semibold">
                  Listening… Speak your question (you can edit before sending)
                </span>
                {interimTranscript && (
                  <span className="hidden truncate text-[11px] italic text-rose-700 sm:inline dark:text-rose-300">
                    “{interimTranscript}”
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={stopListening}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-rose-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-rose-700"
                >
                  <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                  <span>Stop</span>
                </button>
                <button
                  type="button"
                  onClick={cancelListening}
                  className="inline-flex min-h-9 items-center rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="order-2 flex items-center justify-between gap-2 sm:order-1 sm:justify-start">
              <div className="flex items-center gap-1.5">
                <SnapTriggerButtons
                  disabled={sending}
                  onImageSelected={(att) => {
                    setPendingImage(att);
                    setError(null);
                  }}
                  onError={(msg) => setError(msg)}
                />

                <button
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    setError(null);
                    if (isListening) {
                      stopListening();
                    } else {
                      startListening();
                    }
                  }}
                  aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                  aria-pressed={isListening}
                  title={isListening ? 'Stop voice recording' : 'Ask a question by voice'}
                  className={`inline-flex h-11 min-w-11 sm:h-10 sm:min-w-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 select-none ${
                    isListening
                      ? 'border-rose-400 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Mic
                    className={`h-4 w-4 ${
                      isListening
                        ? 'animate-pulse text-rose-600 dark:text-rose-400'
                        : 'text-blue-600 dark:text-cyan-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="hidden md:inline">{isListening ? 'Stop' : 'Voice'}</span>
                </button>
              </div>

              <button
                type="button"
                disabled={sending || (!inputText.trim() && !pendingImage)}
                onClick={() => sendMessage()}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0F1E3D] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:cursor-not-allowed disabled:opacity-50 select-none sm:hidden dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                <span>Send</span>
              </button>
            </div>

            <textarea
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder={
                previewAttachment
                  ? 'Ask a specific question about this photo or click an Image Action above...'
                  : 'Ask an academic question, paste a problem, or use the mic to dictate...'
              }
              className="order-1 min-h-11 max-h-36 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden select-text sm:order-2 sm:flex-1 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:focus:border-cyan-500 dark:focus:bg-slate-900"
            />

            <button
              type="button"
              disabled={sending || (!inputText.trim() && !pendingImage)}
              onClick={() => sendMessage()}
              className="hidden sm:order-3 sm:inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0F1E3D] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:cursor-not-allowed disabled:opacity-50 select-none dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              <span>Send</span>
            </button>
          </div>
        </div>
      </section>

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        title="Delete chat conversation?"
        itemName={deleteTarget?.title}
        description="This permanently deletes this conversation and all saved messages from your Academic History. This action cannot be undone."
        busy={deletingSession}
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
