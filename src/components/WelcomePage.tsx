import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Camera,
  FileAudio,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Menu,
  Moon,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import type { DashboardSection } from '../types/brainstine';
import type { AuthModalMode } from './AuthModal';
import { BrandLogo } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { ThemeSelector } from './ThemeSelector';
import { BrainFallbackVisual } from './landing/BrainFallbackVisual';
import { BrainstineIntroOverlay } from './landing/BrainstineIntroOverlay';
import { FeatureShowcases } from './landing/FeatureShowcases';

const BrainstineBrainCanvas = lazy(() => import('./landing/BrainstineBrainCanvas'));

class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface WelcomePageProps {
  onOpenAuth: (mode: AuthModalMode, targetSection?: DashboardSection) => void;
  onNavigateToPrivacy: () => void;
}

const TOP_NAV_ITEMS: Array<{ label: string; href: string }> = [
  { label: 'Home', href: '#top' },
  { label: 'AI Tutor', href: '#tutor-showcase' },
  { label: 'AI Chatbot', href: '#chatbot-showcase' },
  { label: 'Summarizer', href: '#summarizer-showcase' },
  { label: 'Quiz & Exams', href: '#assessment-showcase' },
];

interface HeroFeatureCard {
  title: string;
  subtitle: string;
  section: DashboardSection;
  accent: 'blue' | 'purple' | 'cyan' | 'indigo';
  icon: React.ReactNode;
}

const HERO_FEATURE_CARDS: HeroFeatureCard[] = [
  {
    title: 'Summarize Documents',
    subtitle: 'Structured visual study notes',
    section: 'summarizer',
    accent: 'blue',
    icon: <FileText className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: 'Create Quizzes & Exams',
    subtitle: 'Practice & timed assessments',
    section: 'quizzes',
    accent: 'purple',
    icon: <ListChecks className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: 'Chat with AI Tutor',
    subtitle: 'Step-by-step guided coaching',
    section: 'tutor',
    accent: 'cyan',
    icon: <GraduationCap className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: 'Track Your Progress',
    subtitle: 'Saved scores & study history',
    section: 'history',
    accent: 'indigo',
    icon: <BarChart3 className="h-5 w-5" aria-hidden="true" />,
  },
];

const STAR_SPECKS = [
  { cx: 96, cy: 112, r: 1.4, opacity: 0.55 },
  { cx: 210, cy: 68, r: 1.1, opacity: 0.42 },
  { cx: 340, cy: 195, r: 1.6, opacity: 0.65 },
  { cx: 480, cy: 84, r: 1.2, opacity: 0.45 },
  { cx: 615, cy: 150, r: 1.0, opacity: 0.35 },
  { cx: 885, cy: 96, r: 1.5, opacity: 0.6 },
  { cx: 1020, cy: 162, r: 1.2, opacity: 0.48 },
  { cx: 1185, cy: 78, r: 1.6, opacity: 0.62 },
  { cx: 1320, cy: 145, r: 1.1, opacity: 0.4 },
  { cx: 165, cy: 365, r: 1.3, opacity: 0.5 },
  { cx: 410, cy: 420, r: 1.1, opacity: 0.38 },
  { cx: 1090, cy: 340, r: 1.3, opacity: 0.52 },
  { cx: 1275, cy: 430, r: 1.5, opacity: 0.55 },
  { cx: 245, cy: 590, r: 1.2, opacity: 0.45 },
  { cx: 960, cy: 610, r: 1.1, opacity: 0.4 },
  { cx: 1360, cy: 640, r: 1.4, opacity: 0.58 },
];

export function WelcomePage({ onOpenAuth, onNavigateToPrivacy }: WelcomePageProps) {
  const { theme, setTheme } = useTheme();
  const [showIntro, setShowIntro] = useState<boolean>(false);
  const [heroCanvasReady, setHeroCanvasReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  });

  // Preserve the signature deep-navy & midnight-blue landing atmosphere unless the user explicitly toggles Light mode
  const isLightSurface = theme === 'light';

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const handleChange = () => setReducedMotion(media.matches);
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme(isLightSurface ? 'dark' : 'light');
  }, [isLightSurface, setTheme]);

  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  const handleReplayIntro = useCallback(() => {
    setHeroCanvasReady(false);
    setShowIntro(true);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const handleWatchShowcase = useCallback(() => {
    const el = document.getElementById('summarizer-showcase');
    if (el) {
      el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }, [reducedMotion]);

  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (!href.startsWith('#')) return;
      e.preventDefault();
      setMobileMenuOpen(false);
      if (href === '#top') {
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
        return;
      }
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    },
    [reducedMotion]
  );

  const cardAccentStyles: Record<
    HeroFeatureCard['accent'],
    { iconBg: string; borderHover: string }
  > = {
    blue: {
      iconBg:
        'bg-gradient-to-br from-blue-500/30 to-sky-400/20 text-sky-300 ring-1 ring-sky-400/45 shadow-[0_0_18px_rgba(56,189,248,0.28)]',
      borderHover: 'hover:border-sky-400/60',
    },
    purple: {
      iconBg:
        'bg-gradient-to-br from-violet-500/35 to-purple-500/20 text-violet-300 ring-1 ring-violet-400/45 shadow-[0_0_18px_rgba(139,92,246,0.3)]',
      borderHover: 'hover:border-violet-400/60',
    },
    cyan: {
      iconBg:
        'bg-gradient-to-br from-cyan-500/30 to-blue-500/20 text-cyan-300 ring-1 ring-cyan-400/45 shadow-[0_0_18px_rgba(34,211,238,0.28)]',
      borderHover: 'hover:border-cyan-400/60',
    },
    indigo: {
      iconBg:
        'bg-gradient-to-br from-indigo-500/35 to-violet-500/20 text-indigo-300 ring-1 ring-indigo-400/45 shadow-[0_0_18px_rgba(99,102,241,0.3)]',
      borderHover: 'hover:border-indigo-400/60',
    },
  };

  return (
    <div
      className={`min-h-screen overflow-x-clip transition-colors duration-300 ${
        isLightSurface
          ? 'bg-slate-50 text-slate-900'
          : 'dark bg-[#040817] text-slate-100'
      }`}
    >
      {showIntro && <BrainstineIntroOverlay onComplete={handleIntroComplete} />}

      {/* Top Navigation Bar (solid translucent — zero backdrop-blur over WebGL canvas) */}
      <header
        className={`sticky top-0 z-30 border-b transition-colors duration-300 ${
          isLightSurface
            ? 'border-slate-200 bg-white/95 text-slate-900'
            : 'border-blue-900/35 bg-[#04091A]/94 text-slate-100'
        }`}
      >
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-10">
          {/* Top Left: Brainstine Logo & Brand Name */}
          <a
            href="#top"
            onClick={(e) => handleNavClick(e, '#top')}
            className="shrink-0 whitespace-nowrap rounded-lg focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <BrandLogo size="md" tone={isLightSurface ? 'auto' : 'light'} />
          </a>

          {/* Top Center: 5 Exact Navigation Links */}
          <nav
            aria-label="Primary"
            className={`hidden items-center gap-6 text-sm font-medium lg:flex xl:gap-8 ${
              isLightSurface ? 'text-slate-600' : 'text-slate-300'
            }`}
          >
            {TOP_NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className={`shrink-0 whitespace-nowrap rounded-md px-1 py-1 transition-colors ${
                  isLightSurface
                    ? 'hover:text-blue-700'
                    : 'hover:text-white'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Top Right: Theme Toggle, Sign In, Get Started + Mobile Menu Toggle */}
          <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={isLightSurface ? 'Switch to dark theme' : 'Switch to light theme'}
              title={isLightSurface ? 'Switch to dark theme' : 'Switch to light theme'}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors shrink-0 ${
                isLightSurface
                  ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'border-blue-400/25 bg-[#0B1739]/85 text-slate-200 hover:border-sky-400/50 hover:text-white'
              }`}
            >
              {isLightSurface ? (
                <Moon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Sun className="h-4 w-4 text-sky-300" aria-hidden="true" />
              )}
            </button>

            <div className="hidden sm:inline-flex">
              <PWAInstallButton compact />
            </div>

            <button
              type="button"
              onClick={() => onOpenAuth('signin')}
              className={`hidden min-h-10 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 sm:inline-flex ${
                isLightSurface
                  ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                  : 'border-blue-400/30 bg-[#0A1433]/85 text-slate-100 hover:border-sky-400/55 hover:bg-[#101F4A]'
              }`}
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className="hidden min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_22px_rgba(79,70,229,0.4)] transition-opacity hover:opacity-95 whitespace-nowrap shrink-0 sm:inline-flex"
            >
              Get Started
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border lg:hidden ${
                isLightSurface
                  ? 'border-slate-300 bg-white text-slate-800'
                  : 'border-blue-400/30 bg-[#0B1739] text-slate-100'
              }`}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Responsive Mobile Drawer */}
        {mobileMenuOpen && (
          <div
            className={`border-t px-4 py-4 lg:hidden ${
              isLightSurface
                ? 'border-slate-200 bg-white text-slate-800'
                : 'border-blue-900/40 bg-[#071029] text-slate-100'
            }`}
          >
            <nav aria-label="Mobile navigation" className="flex flex-col gap-1 text-sm font-medium">
              {TOP_NAV_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item.href)}
                  className={`flex min-h-11 items-center rounded-xl px-3 transition-colors ${
                    isLightSurface ? 'hover:bg-slate-100' : 'hover:bg-blue-950/70'
                  }`}
                >
                  {item.label}
                </a>
              ))}
              <div
                className={`mt-3 flex items-center gap-3 border-t pt-3 ${
                  isLightSurface ? 'border-slate-200' : 'border-blue-900/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('signin');
                  }}
                  className={`min-h-11 flex-1 rounded-xl border px-4 py-2.5 text-center font-semibold ${
                    isLightSurface
                      ? 'border-slate-300 bg-white text-slate-900'
                      : 'border-blue-400/35 bg-[#0C183B] text-slate-100'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('signup');
                  }}
                  className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-4 py-2.5 text-center font-semibold text-white"
                >
                  Get Started
                </button>
              </div>
              <div className="mt-2 pt-2">
                <PWAInstallButton />
              </div>
            </nav>
          </div>
        )}
      </header>

      <main id="top" aria-hidden={showIntro}>
        {/* Futuristic 3D Hero Composition */}
        <section
          id="overview"
          className="relative flex min-h-[calc(100vh-4.25rem)] items-center overflow-hidden border-b border-blue-950/60 bg-gradient-to-b from-[#030715] via-[#071232] to-[#04091B] text-white"
        >
          {/* Deep Navy / Midnight-Blue Atmospheric Glows, Subtle Stars & Wave Patterns */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 52% 58% at 50% 46%, rgba(37, 99, 235, 0.28) 0%, rgba(124, 58, 237, 0.18) 36%, rgba(4, 9, 27, 0) 74%)',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 40% 24% at 50% 82%, rgba(56, 189, 248, 0.18) 0%, rgba(139, 92, 246, 0.1) 45%, rgba(4, 9, 27, 0) 78%)',
            }}
          />

          {/* Futuristic Background Waves & Subtle Stars */}
          <svg
            viewBox="0 0 1440 760"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-90"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="bs_hero_wave_a" x1="0" y1="540" x2="1440" y2="480" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
                <stop offset="30%" stopColor="#38BDF8" stopOpacity="0.22" />
                <stop offset="68%" stopColor="#8B5CF6" stopOpacity="0.26" />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="bs_hero_wave_b" x1="0" y1="620" x2="1440" y2="560" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#6366F1" stopOpacity="0" />
                <stop offset="36%" stopColor="#60A5FA" stopOpacity="0.18" />
                <stop offset="72%" stopColor="#A855F7" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
              </linearGradient>
            </defs>

            {STAR_SPECKS.map((star, idx) => (
              <circle
                key={idx}
                cx={star.cx}
                cy={star.cy}
                r={star.r}
                fill={idx % 3 === 0 ? '#C4B5FD' : '#BAE6FD'}
                fillOpacity={star.opacity}
              />
            ))}

            <path
              d="M-60 560C210 470 430 625 720 555C1010 485 1210 615 1500 520"
              stroke="url(#bs_hero_wave_a)"
              strokeWidth="1.6"
            />
            <path
              d="M-60 610C260 540 470 670 760 600C1040 532 1245 645 1500 570"
              stroke="url(#bs_hero_wave_b)"
              strokeWidth="1.35"
            />
            <path
              d="M-60 655C290 605 510 705 785 642C1070 575 1275 675 1500 622"
              stroke="url(#bs_hero_wave_a)"
              strokeWidth="1"
              strokeOpacity="0.55"
            />
          </svg>

          {/* Desktop Full-Bleed Centered 3D Brain Stage (prevents any bounding-box clipping of rings or pedestal) */}
          <div className="relative z-10 mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-6 px-4 pt-5 pb-10 sm:px-6 sm:pt-8 sm:pb-12 lg:min-h-[680px] lg:grid-cols-[1fr_1.35fr_1fr] lg:gap-4 lg:px-10 lg:py-10">
            {/* CENTER (Desktop full-bleed layer centered at 50%/50%, Mobile 1st element edge-to-edge) */}
            <div className="order-1 -mx-4 flex items-center justify-center sm:mx-0 lg:pointer-events-auto lg:absolute lg:inset-0 lg:z-0 lg:mx-0">
              <div className="relative mx-auto flex h-[360px] w-full items-center justify-center sm:h-[440px] md:h-[480px] lg:h-full lg:w-full">
                {/* Fallback / initial render keeps composition balanced immediately */}
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
                    !showIntro && heroCanvasReady ? 'pointer-events-none opacity-0' : 'opacity-100'
                  }`}
                >
                  <BrainFallbackVisual className="h-full w-full max-w-[540px]" />
                </div>

                {!showIntro && !reducedMotion && (
                  <div
                    className={`relative z-10 h-full w-full transition-opacity duration-700 ${
                      heroCanvasReady ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    <CanvasErrorBoundary onError={() => setHeroCanvasReady(false)}>
                      <Suspense fallback={null}>
                        <BrainstineBrainCanvas
                          phase="hero"
                          interactive
                          onCanvasReady={() => setHeroCanvasReady(true)}
                        />
                      </Suspense>
                    </CanvasErrorBoundary>
                  </div>
                )}
              </div>
            </div>

            {/* BOTTOM LEFT (Desktop) / 2nd on Mobile: Intro Headline, Copy & CTAs */}
            <div className="relative z-10 order-2 flex flex-col justify-end lg:order-1 lg:col-start-1 lg:h-full lg:self-end lg:pb-6">
              <div className="max-w-md">
                <h1
                  className="font-display font-bold tracking-tight text-white academic-selectable"
                  style={{ fontSize: 'clamp(2.25rem, 3.65vw, 3.65rem)', lineHeight: 1.07 }}
                >
                  <span className="block">Study Smarter.</span>
                  <span className="block">Learn Better.</span>
                  <span className="block bg-gradient-to-r from-[#A78BFA] via-[#8B5CF6] to-[#C084FC] bg-clip-text text-transparent">
                    With Brainstine.
                  </span>
                </h1>

                <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300 sm:text-base academic-selectable">
                  Your AI-powered study companion for summaries, quizzes, exams and more.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('signup')}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#7C3AED] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(79,70,229,0.45)] transition-opacity hover:opacity-95 whitespace-nowrap shrink-0 min-[420px]:w-auto"
                  >
                    <span>Get Started Free</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={handleWatchShowcase}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-400/35 bg-[#0B1739]/85 px-5 py-3 text-sm font-semibold text-slate-100 shadow-[inset_0_1px_0_rgba(147,197,253,0.16)] transition-colors hover:border-sky-400/60 hover:bg-[#11214F] whitespace-nowrap shrink-0 min-[420px]:w-auto"
                  >
                    <Play className="h-3.5 w-3.5 fill-current text-sky-300" aria-hidden="true" />
                    <span>Watch Demo</span>
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT SIDE (Desktop) / 3rd on Mobile: Four Vertically Arranged Glassmorphic Feature Cards */}
            <div className="relative z-10 order-3 flex flex-col justify-center lg:order-3 lg:col-start-3 lg:items-end">
              <div className="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2 lg:flex lg:w-full lg:max-w-[300px] lg:flex-col">
                {HERO_FEATURE_CARDS.map((card) => {
                  const accent = cardAccentStyles[card.accent];
                  return (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => onOpenAuth('signup', card.section)}
                      className={`group flex min-h-16 w-full items-center gap-3.5 rounded-2xl border border-blue-400/25 bg-[#0A1638]/82 px-4 py-3.5 text-left shadow-[inset_0_1px_0_rgba(147,197,253,0.16),0_12px_30px_rgba(2,6,20,0.48)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#0F1F4D]/92 ${accent.borderHover}`}
                    >
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${accent.iconBg}`}
                      >
                        {card.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-semibold text-white transition-colors group-hover:text-sky-200">
                          {card.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-300/90">
                          {card.subtitle}
                        </p>
                      </div>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-sky-300"
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Scroll-Triggered Interactive Feature Showcases */}
        <div
          className={`border-b ${
            isLightSurface
              ? 'dark border-slate-200 bg-slate-900'
              : 'border-slate-800/70 bg-gradient-to-b from-[#060B18] via-[#070E1F] to-[#060B18]'
          }`}
        >
          <FeatureShowcases onOpenAuth={onOpenAuth} />
        </div>

        {/* Supported Academic Inputs */}
        <section
          id="formats"
          className={`border-b py-16 ${
            isLightSurface
              ? 'border-slate-200 bg-white text-slate-900'
              : 'border-slate-800/70 bg-[#080F1E] text-white'
          }`}
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <h2
                  className={`font-display text-2xl font-bold tracking-tight ${
                    isLightSurface ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  Supported academic inputs
                </h2>
                <p
                  className={`mt-2 max-w-xl text-sm ${
                    isLightSurface ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  Validated extraction pipelines handle multi-page textbooks, scanned pages, live
                  camera captures, and lecture audio recordings cleanly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('signup', 'summarizer')}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0 sm:w-auto"
              >
                <span>Start Studying Free</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div
                className={`rounded-xl border p-5 ${
                  isLightSurface
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-slate-800 bg-[#0B1428]'
                }`}
              >
                <FileText className="h-5 w-5 text-sky-500" aria-hidden="true" />
                <h3
                  className={`mt-3 font-display text-base font-semibold ${
                    isLightSurface ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  PDF Documents
                </h3>
                <p
                  className={`mt-1.5 text-xs leading-relaxed ${
                    isLightSurface ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  Text-based and scanned PDFs with page-number preservation and OCR extraction.
                </p>
              </div>

              <div
                className={`rounded-xl border p-5 ${
                  isLightSurface
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-slate-800 bg-[#0B1428]'
                }`}
              >
                <div className="flex items-center gap-2 text-cyan-500">
                  <ImageIcon className="h-5 w-5" aria-hidden="true" />
                  <Camera className="h-4 w-4" aria-hidden="true" />
                </div>
                <h3
                  className={`mt-3 font-display text-base font-semibold ${
                    isLightSurface ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  Images &amp; Camera Snap
                </h3>
                <p
                  className={`mt-1.5 text-xs leading-relaxed ${
                    isLightSurface ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  PNG, JPG, and WEBP photos or live camera captures of handwritten notes and diagrams.
                </p>
              </div>

              <div
                className={`rounded-xl border p-5 ${
                  isLightSurface
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-slate-800 bg-[#0B1428]'
                }`}
              >
                <FileAudio className="h-5 w-5 text-violet-500" aria-hidden="true" />
                <h3
                  className={`mt-3 font-display text-base font-semibold ${
                    isLightSurface ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  Lecture Audio
                </h3>
                <p
                  className={`mt-1.5 text-xs leading-relaxed ${
                    isLightSurface ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  MP3, WAV, M4A, WEBM, and OGG voice notes transcribed and organized by concept.
                </p>
              </div>

              <div
                className={`rounded-xl border p-5 ${
                  isLightSurface
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-slate-800 bg-[#0B1428]'
                }`}
              >
                <Layers
                  className={`h-5 w-5 ${isLightSurface ? 'text-slate-600' : 'text-slate-300'}`}
                  aria-hidden="true"
                />
                <h3
                  className={`mt-3 font-display text-base font-semibold ${
                    isLightSurface ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  Pasted Text
                </h3>
                <p
                  className={`mt-1.5 text-xs leading-relaxed ${
                    isLightSurface ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  Direct Markdown, essay drafts, or long excerpts indexed with full section context.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Closing Call to Action */}
        <section
          className={`relative overflow-hidden py-20 ${
            isLightSurface ? 'bg-slate-50 text-slate-900' : 'bg-[#060B18] text-white'
          }`}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: isLightSurface
                ? 'radial-gradient(ellipse 55% 65% at 50% 50%, rgba(37, 99, 235, 0.08) 0%, rgba(124, 58, 237, 0.04) 45%, rgba(248, 250, 252, 0) 80%)'
                : 'radial-gradient(ellipse 55% 65% at 50% 50%, rgba(37, 99, 235, 0.16) 0%, rgba(124, 58, 237, 0.08) 45%, rgba(6, 11, 24, 0) 80%)',
            }}
          />
          <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-sky-400 uppercase">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Your Study Workspace</span>
            </div>
            <h2
              className={`font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl ${
                isLightSurface ? 'text-slate-900' : 'text-white'
              }`}
            >
              Bring clarity to your coursework today.
            </h2>
            <p
              className={`mt-4 text-sm leading-relaxed sm:text-base ${
                isLightSurface ? 'text-slate-600' : 'text-slate-300'
              }`}
            >
              Create your private student workspace to upload study materials, generate structured
              summaries, test yourself with timed exams, and save your academic history.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <button
                type="button"
                onClick={() => onOpenAuth('signup')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#7C3AED] px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(79,70,229,0.35)] transition-opacity hover:opacity-95 whitespace-nowrap"
              >
                <span>Get Started Free</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('signin')}
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-6 py-3 text-sm font-semibold transition-colors whitespace-nowrap ${
                  isLightSurface
                    ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                    : 'border-slate-700 bg-[#0B1428] text-slate-100 hover:bg-slate-800'
                }`}
              >
                Sign In
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer
        className={`border-t py-8 ${
          isLightSurface
            ? 'border-slate-200 bg-white text-slate-700'
            : 'border-slate-800/80 bg-[#050914] text-slate-400'
        }`}
      >
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1.5">
            <BrandLogo size="sm" tone={isLightSurface ? 'auto' : 'light'} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>
                Study Smarter. Learn Better. With Brainstine. · © {new Date().getFullYear()} Brainstine
              </span>
              <span aria-hidden="true">·</span>
              <a
                href="/privacy"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onNavigateToPrivacy();
                }}
                className={`font-semibold underline underline-offset-4 transition-colors ${
                  isLightSurface
                    ? 'text-blue-700 hover:text-slate-900'
                    : 'text-sky-400 hover:text-white'
                }`}
              >
                Privacy Policy
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!reducedMotion && (
              <button
                type="button"
                onClick={handleReplayIntro}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  isLightSurface
                    ? 'border-slate-300 bg-slate-50 text-slate-700 hover:border-blue-500 hover:text-slate-900'
                    : 'border-slate-800 bg-[#0B1428] text-slate-300 hover:border-sky-400/50 hover:text-white'
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Replay 3D Intro</span>
              </button>
            )}
            <PWAInstallButton compact />
            <ThemeSelector />
          </div>
        </div>
      </footer>
    </div>
  );
}
