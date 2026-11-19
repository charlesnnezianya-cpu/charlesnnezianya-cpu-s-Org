import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquareText,
  Mic,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  listQuizAttempts,
  listQuizzes,
  listStudyActivities,
  listStudyMaterials,
  listStudySummaries,
} from '../lib/supabase';
import type {
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
import { AiChatWorkspace } from './AiChatWorkspace';
import { AiTutorWorkspace } from './AiTutorWorkspace';
import { BrandLogo } from './BrandLogo';
import { DashboardOverview } from './DashboardOverview';
import { MaterialsLibraryView } from './MaterialsLibraryView';
import { ProfileSettingsView } from './ProfileSettingsView';
import { QuizExamSystem } from './QuizExamSystem';
import { SavedSummariesView } from './SavedSummariesView';
import { StudySummarizer } from './StudySummarizer';
import { ThemeSelector } from './ThemeSelector';

export function DashboardLayout() {
  const { user, profile, signOut } = useAuth();

  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [geminiConfigured, setGeminiConfigured] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [materials, setMaterials] = useState<StudyMaterialRecord[]>([]);
  const [summaries, setSummaries] = useState<StudySummaryRecord[]>([]);
  const [activities, setActivities] = useState<StudyActivityRecord[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([]);
  const [attempts, setAttempts] = useState<QuizAttemptRecord[]>([]);

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

  const displayName =
    profile?.display_name ||
    (user?.user_metadata?.display_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'Student';

  const loadWorkspaceData = useCallback(async () => {
    if (!user) return;
    try {
      const [mats, sums, acts, qzs, atts] = await Promise.all([
        listStudyMaterials(user.id).catch(() => []),
        listStudySummaries(user.id).catch(() => []),
        listStudyActivities(user.id, 12).catch(() => []),
        listQuizzes(user.id).catch(() => []),
        listQuizAttempts(user.id).catch(() => []),
      ]);
      setMaterials(mats);
      setSummaries(sums);
      setActivities(acts);
      setQuizzes(qzs);
      setAttempts(atts);
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.geminiConfigured === 'boolean') {
          setGeminiConfigured(data.geminiConfigured);
        }
      })
      .catch(() => {
        // leave default true until actual API call reports status
      });
  }, []);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  const navigateTo = (section: DashboardSection) => {
    setActiveSection(section);
    setMobileNavOpen(false);
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
      id: 'summarizer',
      label: 'AI Summarizer',
      icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
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
      id: 'quizzes',
      label: 'Quiz & Exam',
      icon: <ListChecks className="h-4 w-4" aria-hidden="true" />,
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

  const futureModules = [
    { label: 'Study Planner', icon: <CalendarDays className="h-4 w-4" aria-hidden="true" /> },
    { label: 'Voice Intelligence', icon: <Mic className="h-4 w-4" aria-hidden="true" /> },
  ];

  const sectionTitleMap: Record<DashboardSection, string> = {
    overview: 'Dashboard',
    summarizer: 'AI Study Material Summarizer',
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
        <div className="px-2 pb-6">
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
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#0F1E3D] text-white dark:bg-blue-600'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Future Brainstine Module Foundations */}
        <div className="mt-8 border-t border-slate-200 pt-5 dark:border-slate-800">
          <p className="px-3 text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
            Upcoming Modules
          </p>
          <div className="mt-2 space-y-1">
            {futureModules.map((mod) => (
              <div
                key={mod.label}
                aria-disabled="true"
                className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 dark:text-slate-500"
              >
                <span className="inline-flex items-center gap-2.5">
                  {mod.icon}
                  <span>{mod.label}</span>
                </span>
                <span className="text-[10px]">Planned</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="px-2 pb-3">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {displayName}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {user?.email}
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-[#080F1E] dark:text-slate-100">
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
          <aside className="relative z-10 w-68 max-w-[80vw] bg-white shadow-xl dark:bg-[#0B1325]">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close sidebar"
              className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
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
          <div className="flex items-center gap-3 min-w-0 select-none">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden dark:border-slate-800 dark:text-slate-200"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
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

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
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
                  attempts={attempts}
                  onNavigate={navigateTo}
                  onSummarizeMaterial={handleSummarizeMaterial}
                />
              )}

              {activeSection === 'summarizer' && (
                <StudySummarizer
                  initialMaterial={summarizerMaterial}
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
                  onActivityRecorded={loadWorkspaceData}
                  onSendImageToTutor={handleSendImageToTutor}
                />
              )}

              {activeSection === 'tutor' && (
                <AiTutorWorkspace
                  materials={materials}
                  summaries={summaries}
                  geminiConfigured={geminiConfigured}
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
                  preselectedSource={quizPreselection}
                  onDataChanged={loadWorkspaceData}
                />
              )}

              {activeSection === 'summaries' && (
                <SavedSummariesView
                  summaries={summaries}
                  materials={materials}
                  geminiConfigured={geminiConfigured}
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
    </div>
  );
}
