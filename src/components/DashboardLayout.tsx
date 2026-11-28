import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  FolderOpen,
  GraduationCap,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { parseApiJsonResponse, resolveApiUrl } from '../lib/apiClient';
import {
  listAllAiSessions,
  listQuizAttempts,
  listQuizzes,
  listStudyActivities,
  listStudyMaterials,
  listStudySummaries,
} from '../lib/supabase';
import type {
  AiSessionRecord,
  DashboardSection,
  QuizAttemptRecord,
  QuizRecord,
  QuizSourceMode,
  SnapImageAttachment,
  StructuredSummary,
  StudyActivityRecord,
  StudyMaterialRecord,
  StudySummaryRecord,
} from '../types/brainstine';
import { AcademicHistoryView } from './AcademicHistoryView';
import { AiChatWorkspace } from './AiChatWorkspace';
import { AiTutorWorkspace } from './AiTutorWorkspace';
import { BrandLogo } from './BrandLogo';
import { DashboardOverview } from './DashboardOverview';
import { MaterialsLibraryView } from './MaterialsLibraryView';
import { PWAInstallButton } from './PWAInstallButton';
import { ProfileSettingsView } from './ProfileSettingsView';
import { QuizExamSystem } from './QuizExamSystem';
import { SavedSummariesView } from './SavedSummariesView';
import { StudySummarizer } from './StudySummarizer';
import { ThemeSelector } from './ThemeSelector';

interface DashboardLayoutProps {
  initialSection?: DashboardSection | null;
  onConsumeInitialSection?: () => void;
}

export function DashboardLayout({
  initialSection = null,
  onConsumeInitialSection,
}: DashboardLayoutProps) {
  const { user, profile, signOut } = useAuth();

  const [activeSection, setActiveSection] = useState<DashboardSection>(
    () => initialSection ?? 'overview'
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
      onConsumeInitialSection?.();
    }
  }, [initialSection, onConsumeInitialSection]);

  const [geminiConfigured, setGeminiConfigured] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<StudyMaterialRecord[]>([]);
  const [summaries, setSummaries] = useState<StudySummaryRecord[]>([]);
  const [activities, setActivities] = useState<StudyActivityRecord[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([]);
  const [attempts, setAttempts] = useState<QuizAttemptRecord[]>([]);
  const [aiSessions, setAiSessions] = useState<AiSessionRecord[]>([]);

  const [summarizerMaterial, setSummarizerMaterial] =
    useState<StudyMaterialRecord | null>(null);
  const [quizPreselection, setQuizPreselection] = useState<{
    mode: QuizSourceMode;
    materialId?: string;
    summaryId?: string;
    inlineSummary?: StructuredSummary;
  } | null>(null);
  const [incomingTutorImage, setIncomingTutorImage] =
    useState<SnapImageAttachment | null>(null);

  const [openSummaryId, setOpenSummaryId] = useState<string | null>(null);
  const [openAttempt, setOpenAttempt] = useState<QuizAttemptRecord | null>(null);
  const [openChatSessionId, setOpenChatSessionId] = useState<string | null>(null);
  const [openTutorSessionId, setOpenTutorSessionId] = useState<string | null>(null);

  // Active exam/quiz navigation protection
  const [activeExamInProgress, setActiveExamInProgress] = useState(false);
  const [pendingNavSection, setPendingNavSection] = useState<DashboardSection | null>(null);

  const chatSessions = useMemo(
    () => aiSessions.filter((s) => s.session_type === 'chat'),
    [aiSessions]
  );
  const tutorSessions = useMemo(
    () => aiSessions.filter((s) => s.session_type === 'tutor'),
    [aiSessions]
  );

  const displayName =
    profile?.display_name ||
    (user?.user_metadata?.display_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'Student';

  const loadWorkspaceData = useCallback(async () => {
    if (!user) return;
    setWorkspaceLoadError(null);
    try {
      const results = await Promise.allSettled([
        listStudyMaterials(user.id),
        listStudySummaries(user.id),
        listStudyActivities(user.id, 30),
        listQuizzes(user.id),
        listQuizAttempts(user.id),
        listAllAiSessions(user.id),
      ]);
      const [matsRes, sumsRes, actsRes, qzsRes, attsRes, sessionsRes] = results;

      if (matsRes.status === 'fulfilled') setMaterials(matsRes.value);
      if (sumsRes.status === 'fulfilled') setSummaries(sumsRes.value);
      if (actsRes.status === 'fulfilled') setActivities(actsRes.value);
      if (qzsRes.status === 'fulfilled') setQuizzes(qzsRes.value);
      if (attsRes.status === 'fulfilled') setAttempts(attsRes.value);
      if (sessionsRes.status === 'fulfilled') setAiSessions(sessionsRes.value);

      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount > 0) {
        setWorkspaceLoadError(
          failedCount === results.length
            ? 'Unable to load your saved workspace records right now. Check your connection and retry.'
            : 'Some saved workspace sections could not be refreshed right now.'
        );
      }
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    fetch(resolveApiUrl('/api/health'))
      .then((res) =>
        parseApiJsonResponse<{ aiConfigured?: boolean; geminiConfigured?: boolean }>(
          res,
          'checking AI health'
        )
      )
      .then((data) => {
        const ready =
          typeof data.aiConfigured === 'boolean'
            ? data.aiConfigured
            : typeof data.geminiConfigured === 'boolean'
              ? data.geminiConfigured
              : undefined;
        if (typeof ready === 'boolean') {
          setGeminiConfigured(ready);
        }
      })
      .catch(() => {
        // Leave default true so users can still attempt requests and see detailed endpoint diagnostics
      });
  }, []);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen]);

  const navigateTo = useCallback(
    (section: DashboardSection) => {
      if (activeExamInProgress && activeSection === 'quizzes' && section !== 'quizzes') {
        setPendingNavSection(section);
        setMobileNavOpen(false);
        return;
      }
      setActiveSection(section);
      setMobileNavOpen(false);
    },
    [activeExamInProgress, activeSection]
  );

  const confirmLeaveActiveExam = () => {
    if (!pendingNavSection) return;
    const target = pendingNavSection;
    setPendingNavSection(null);
    setActiveExamInProgress(false);
    setActiveSection(target);
  };

  const handleSummarizeMaterial = (mat: StudyMaterialRecord) => {
    setSummarizerMaterial(mat);
    navigateTo('summarizer');
  };

  const handleQuizMaterial = (mat: StudyMaterialRecord) => {
    setQuizPreselection({ mode: 'material', materialId: mat.id });
    navigateTo('quizzes');
  };

  const handleQuizFromSavedSummary = (sum: StudySummaryRecord) => {
    setQuizPreselection({ mode: 'summary', summaryId: sum.id });
    navigateTo('quizzes');
  };

  const handleQuizFromInlineSummary = (sum: StructuredSummary) => {
    setQuizPreselection({ mode: 'text', inlineSummary: sum });
    navigateTo('quizzes');
  };

  const handleSendImageToTutor = (attachment: SnapImageAttachment) => {
    setIncomingTutorImage(attachment);
    navigateTo('tutor');
  };

  const handleOpenSummary = (summaryId: string) => {
    setOpenSummaryId(summaryId);
    navigateTo('summaries');
  };

  const handleOpenAttempt = (attempt: QuizAttemptRecord) => {
    setOpenAttempt(attempt);
    navigateTo('quizzes');
  };

  const handleOpenChatSession = (sessionId: string) => {
    setOpenChatSessionId(sessionId);
    navigateTo('chat');
  };

  const handleOpenTutorSession = (sessionId: string) => {
    setOpenTutorSessionId(sessionId);
    navigateTo('tutor');
  };

  const navItems: {
    id: DashboardSection;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'overview',
      label: 'Dashboard',
      icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'history',
      label: 'Academic History',
      icon: <History className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'summarizer',
      label: 'Document Summarizer',
      icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'quizzes',
      label: 'Quiz & Exam',
      icon: <ListChecks className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'chat',
      label: 'AI Chat',
      icon: <MessageSquareText className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'tutor',
      label: 'AI Tutor',
      icon: <GraduationCap className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'summaries',
      label: 'Saved Summaries',
      icon: <BookOpen className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'materials',
      label: 'Uploaded Materials',
      icon: <FolderOpen className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'settings',
      label: 'Profile & Settings',
      icon: <Settings className="h-4 w-4" aria-hidden="true" />,
    },
  ];

  const sectionTitleMap: Record<DashboardSection, string> = {
    overview: 'Dashboard',
    history: 'My Academic History',
    summarizer: 'Document Summarizer',
    chat: 'AI Academic Chatbot',
    tutor: 'Personal AI Tutor',
    quizzes: 'Quiz & Examination System',
    summaries: 'Saved Summaries',
    materials: 'Uploaded Materials',
    settings: 'Profile & Settings',
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between px-4 py-5 select-none">
      <div>
        <div className="px-2 pb-6 pr-12 lg:pr-2">
          <BrandLogo size="sm" />
        </div>

        <nav aria-label="Workspace navigation" className="space-y-1">
          {navItems.map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#0F1E3D] text-white shadow-xs dark:bg-[#1D4ED8]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
        <PWAInstallButton />
        <div className="px-2">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {displayName}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {user?.email || user?.phone || ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen overflow-x-clip bg-slate-50 text-slate-900 dark:bg-[#080F1E] dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-[#0B1325]">
        <div className="sticky top-0 h-screen overflow-y-auto">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[82vw] bg-white shadow-xl dark:bg-[#0B1325]">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close sidebar"
              className="absolute top-3.5 right-3.5 inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-[#080F1E]/90">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden dark:border-slate-800 dark:text-slate-200"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-slate-400 sm:inline">Brainstine</span>
              <span className="hidden text-slate-300 sm:inline dark:text-slate-700">/</span>
              <span className="truncate font-display font-semibold text-slate-900 dark:text-white">
                {sectionTitleMap[activeSection]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <ThemeSelector compact />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-3.5 py-5 sm:px-6 lg:px-8 lg:py-8">
          {workspaceLoadError && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-200"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>{workspaceLoadError}</span>
              </div>
              <button
                type="button"
                onClick={loadWorkspaceData}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1 font-semibold text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950"
              >
                Retry
              </button>
            </div>
          )}

          {loadingData ? (
            <div className="space-y-6">
              <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0D162B]" />
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0D162B]" />
                <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0D162B]" />
              </div>
            </div>
          ) : (
            <>
              {activeSection === 'overview' && (
                <DashboardOverview
                  displayName={displayName}
                  materials={materials}
                  summaries={summaries}
                  activities={activities}
                  quizzes={quizzes}
                  attempts={attempts}
                  chatSessions={chatSessions}
                  tutorSessions={tutorSessions}
                  onNavigate={navigateTo}
                  onSummarizeMaterial={handleSummarizeMaterial}
                  onOpenAttempt={handleOpenAttempt}
                  onOpenSummary={handleOpenSummary}
                />
              )}

              {activeSection === 'history' && (
                <AcademicHistoryView
                  summaries={summaries}
                  quizzes={quizzes}
                  attempts={attempts}
                  chatSessions={chatSessions}
                  tutorSessions={tutorSessions}
                  onRefresh={loadWorkspaceData}
                  onOpenSummary={handleOpenSummary}
                  onOpenAttempt={handleOpenAttempt}
                  onOpenChatSession={handleOpenChatSession}
                  onOpenTutorSession={handleOpenTutorSession}
                />
              )}

              {activeSection === 'summarizer' && (
                <StudySummarizer
                  initialMaterial={summarizerMaterial}
                  onConsumeInitialMaterial={() => setSummarizerMaterial(null)}
                  geminiConfigured={geminiConfigured}
                  onActivityRecorded={loadWorkspaceData}
                  onGenerateQuizFromSummary={handleQuizFromInlineSummary}
                />
              )}

              {activeSection === 'chat' && (
                <AiChatWorkspace
                  materials={materials}
                  summaries={summaries}
                  geminiConfigured={geminiConfigured}
                  initialSessionId={openChatSessionId}
                  onConsumeInitialSession={() => setOpenChatSessionId(null)}
                  onActivityRecorded={loadWorkspaceData}
                  onSendImageToTutor={handleSendImageToTutor}
                />
              )}

              {activeSection === 'tutor' && (
                <AiTutorWorkspace
                  materials={materials}
                  summaries={summaries}
                  geminiConfigured={geminiConfigured}
                  initialSessionId={openTutorSessionId}
                  onConsumeInitialSession={() => setOpenTutorSessionId(null)}
                  incomingImage={incomingTutorImage}
                  onConsumeIncomingImage={() => setIncomingTutorImage(null)}
                  onActivityRecorded={loadWorkspaceData}
                />
              )}

              {activeSection === 'quizzes' && (
                <QuizExamSystem
                  materials={materials}
                  summaries={summaries}
                  quizzes={quizzes}
                  attempts={attempts}
                  geminiConfigured={geminiConfigured}
                  initialAttemptToOpen={openAttempt}
                  onConsumeAttemptToOpen={() => setOpenAttempt(null)}
                  preselectedSource={quizPreselection}
                  onConsumePreselection={() => setQuizPreselection(null)}
                  onDataChanged={loadWorkspaceData}
                  onActiveAttemptChange={setActiveExamInProgress}
                />
              )}

              {activeSection === 'summaries' && (
                <SavedSummariesView
                  summaries={summaries}
                  materials={materials}
                  geminiConfigured={geminiConfigured}
                  initialSummaryId={openSummaryId}
                  onConsumeInitialSummary={() => setOpenSummaryId(null)}
                  onRefresh={loadWorkspaceData}
                  onOpenSummarizer={() => navigateTo('summarizer')}
                  onCreateQuizFromSummary={handleQuizFromSavedSummary}
                />
              )}

              {activeSection === 'materials' && (
                <MaterialsLibraryView
                  materials={materials}
                  onRefresh={loadWorkspaceData}
                  onSummarizeMaterial={handleSummarizeMaterial}
                  onQuizMaterial={handleQuizMaterial}
                  onOpenSummarizer={() => navigateTo('summarizer')}
                />
              )}

              {activeSection === 'settings' && <ProfileSettingsView />}
            </>
          )}
        </main>
      </div>

      {/* Active Quiz/Exam Leave Confirmation Modal */}
      {pendingNavSection && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-exam-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#0D162B]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="leave-exam-title"
                  className="font-display text-lg font-bold text-slate-900 dark:text-white"
                >
                  Assessment in Progress
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  You currently have an active quiz or exam attempt. Leaving now will discard your
                  unsubmitted responses and stop the timer.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingNavSection(null)}
                className="min-h-11 rounded-xl bg-[#0F1E3D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#192F5D] dark:bg-[#1D4ED8] dark:hover:bg-blue-500"
              >
                Stay on Assessment
              </button>
              <button
                type="button"
                onClick={confirmLeaveActiveExam}
                className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                Leave &amp; Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
