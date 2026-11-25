import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Camera,
  FileAudio,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Menu,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { ThemeSelector } from './ThemeSelector';
import { BrainFallbackVisual } from './landing/BrainFallbackVisual';
import { BrainstineIntroOverlay } from './landing/BrainstineIntroOverlay';
import { FeatureShowcases } from './landing/FeatureShowcases';
import type { AuthModalMode } from './AuthModal';

const BrainstineBrainCanvas = lazy(() => import('./landing/BrainstineBrainCanvas'));

const INTRO_STORAGE_KEY = 'brainstine-intro-seen';

function shouldPlayIntroInitially(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    const seenSession = window.sessionStorage?.getItem(INTRO_STORAGE_KEY);
    const seenLocal = window.localStorage?.getItem(INTRO_STORAGE_KEY);
    return !seenSession && !seenLocal;
  } catch {
    return false;
  }
}

interface WelcomePageProps {
  onOpenAuth: (mode: AuthModalMode) => void;
  onNavigateToPrivacy: () => void;
}

export function WelcomePage({ onOpenAuth, onNavigateToPrivacy }: WelcomePageProps) {
  const [showIntro, setShowIntro] = useState<boolean>(() => shouldPlayIntroInitially());
  const [heroCanvasReady, setHeroCanvasReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  });

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const handleChange = () => setReducedMotion(media.matches);
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  const handleIntroComplete = useCallback(() => {
    try {
      window.sessionStorage?.setItem(INTRO_STORAGE_KEY, '1');
      window.localStorage?.setItem(INTRO_STORAGE_KEY, '1');
    } catch {
      // Ignore storage quota errors cleanly
    }
    setShowIntro(false);
  }, []);

  const handleReplayIntro = useCallback(() => {
    setHeroCanvasReady(false);
    setShowIntro(true);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return (
    <div className="dark min-h-screen overflow-x-clip bg-[#060B18] text-slate-100">
      {showIntro && <BrainstineIntroOverlay onComplete={handleIntroComplete} />}

      {/* 3-Zone Sticky Header Bar (solid midnight-navy translucent — zero backdrop-blur over WebGL) */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#060B18]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
          <a
            href="#top"
            className="shrink-0 whitespace-nowrap rounded-lg focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <BrandLogo size="md" tone="light" />
          </a>

          <nav
            aria-label="Primary"
            className="hidden items-center gap-7 text-sm font-medium text-slate-300 md:flex"
          >
            <a
              href="#features"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-white hover:underline hover:underline-offset-4"
            >
              Capabilities
            </a>
            <a
              href="#summarizer-showcase"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-white hover:underline hover:underline-offset-4"
            >
              Summarizer
            </a>
            <a
              href="#assessment-showcase"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-white hover:underline hover:underline-offset-4"
            >
              Quiz &amp; Exam
            </a>
            <a
              href="#learning-showcase"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-white hover:underline hover:underline-offset-4"
            >
              AI Tutor
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className="hidden min-h-10 items-center rounded-xl bg-[#1D4ED8] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0 md:inline-flex"
            >
              Get Started
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-800 text-slate-200 md:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-slate-800 bg-[#0A1326] px-4 py-4 md:hidden">
            <div className="flex flex-col gap-1 text-sm font-medium text-slate-200">
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-2 hover:bg-slate-800/70"
              >
                Capabilities
              </a>
              <a
                href="#summarizer-showcase"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-2 hover:bg-slate-800/70"
              >
                Summarizer
              </a>
              <a
                href="#assessment-showcase"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-2 hover:bg-slate-800/70"
              >
                Quiz &amp; Exam
              </a>
              <a
                href="#learning-showcase"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-2 hover:bg-slate-800/70"
              >
                AI Tutor
              </a>
              <div className="mt-2 flex items-center gap-3 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('signin');
                  }}
                  className="min-h-11 flex-1 rounded-xl border border-slate-700 px-4 py-2.5 text-center font-semibold text-slate-100"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('signup');
                  }}
                  className="min-h-11 flex-1 rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-center font-semibold text-white"
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main id="top" aria-hidden={showIntro}>
        {/* Cinematic 3D Hero Section */}
        <section
          id="overview"
          className="relative overflow-hidden border-b border-slate-800/70"
        >
          {/* Ambient radial gradient behind hero */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 60% 60% at 72% 45%, rgba(37, 99, 235, 0.2) 0%, rgba(124, 58, 237, 0.12) 38%, rgba(6, 11, 24, 0) 75%)',
            }}
          />

          <div className="relative z-10 mx-auto max-w-6xl px-4 pt-10 pb-14 sm:px-6 sm:pt-14 sm:pb-20 lg:px-8 lg:pt-16 lg:pb-24">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
              {/* Left Copy & CTAs */}
              <div className="flex flex-col justify-center lg:col-span-6">
                <p className="font-mono text-xs font-medium tracking-wider text-sky-400 uppercase">
                  Intelligent Academic Workspace
                </p>

                <h1
                  className="mt-3 font-display font-bold tracking-tight text-white text-balance academic-selectable"
                  style={{ fontSize: 'clamp(2.25rem, 4.1vw, 3.75rem)', lineHeight: 1.07 }}
                >
                  Understand More. Learn Smarter.{' '}
                  <span className="bg-gradient-to-r from-[#38BDF8] via-[#60A5FA] to-[#A78BFA] bg-clip-text text-transparent">
                    Achieve More.
                  </span>
                </h1>

                <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base academic-selectable">
                  Brainstine brings intelligent document understanding, personalised AI tutoring and
                  powerful assessment tools together in one learning environment.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-3.5">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('signup')}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/50 transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0 min-[420px]:w-auto"
                  >
                    <span>Get Started</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('signin')}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0B1428] px-6 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800 whitespace-nowrap shrink-0 min-[420px]:w-auto"
                  >
                    Sign In
                  </button>
                  <PWAInstallButton compact />
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-400">
                  <span>Document Summarizer</span>
                  <span aria-hidden="true">·</span>
                  <span>Quiz &amp; Exam Engine</span>
                  <span aria-hidden="true">·</span>
                  <span>Academic Chatbot</span>
                  <span aria-hidden="true">·</span>
                  <span>Personal AI Tutor</span>
                  {!reducedMotion && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={handleReplayIntro}
                        className="inline-flex items-center gap-1.5 text-sky-400 transition-colors hover:text-sky-300 whitespace-nowrap"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>Replay 3D Intro</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Right 3D Brainstine Stage (shares zero duplicate WebGL contexts during intro) */}
              <div className="lg:col-span-6">
                <div className="relative mx-auto flex h-[360px] w-full max-w-[600px] items-center justify-center sm:h-[450px] lg:h-[530px]">
                  {/* Instant fallback visual keeps composition aligned while intro runs or Three.js streams */}
                  <div
                    className={`absolute inset-0 transition-opacity duration-500 ${
                      !showIntro && heroCanvasReady ? 'pointer-events-none opacity-0' : 'opacity-100'
                    }`}
                  >
                    <BrainFallbackVisual className="h-full w-full" />
                  </div>

                  {!showIntro && !reducedMotion && (
                    <div
                      className={`relative z-10 h-full w-full transition-opacity duration-700 ${
                        heroCanvasReady ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      <Suspense fallback={null}>
                        <BrainstineBrainCanvas
                          phase="hero"
                          interactive
                          onCanvasReady={() => setHeroCanvasReady(true)}
                        />
                      </Suspense>
                    </div>
                  )}

                  {!reducedMotion && heroCanvasReady && !showIntro && (
                    <p className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-wide text-slate-400/90 whitespace-nowrap">
                      Drag or move cursor to inspect 3D model
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture Overview — Four Integrated Learning Engines */}
        <section
          id="features"
          className="border-b border-slate-800/70 bg-[#080F1E] py-16 lg:py-22"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="font-mono text-xs font-medium tracking-wider text-sky-400 uppercase">
                Integrated Learning Architecture
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-white text-balance sm:text-3xl">
                Four focused engines engineered for real comprehension and exam readiness.
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <a
                href="#summarizer-showcase"
                className="group rounded-2xl border border-slate-800/90 bg-[#0B1428] p-6 transition-colors hover:border-sky-500/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-sky-400 ring-1 ring-sky-400/30">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-white group-hover:text-sky-300">
                  Document Summarizer
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300 academic-selectable">
                  Deterministic structural extraction turning PDFs, notes, and audio into concise,
                  page-cited study briefs.
                </p>
              </a>

              <a
                href="#assessment-showcase"
                className="group rounded-2xl border border-slate-800/90 bg-[#0B1428] p-6 transition-colors hover:border-violet-500/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/20 text-violet-300 ring-1 ring-violet-400/30">
                  <ListChecks className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-white group-hover:text-violet-300">
                  Quiz &amp; Exam Maker
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300 academic-selectable">
                  5 to 70 objective A/B/C/D questions in Practice or timed Exam mode with verified
                  explanations and history.
                </p>
              </a>

              <a
                href="#learning-showcase"
                className="group rounded-2xl border border-slate-800/90 bg-[#0B1428] p-6 transition-colors hover:border-sky-500/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600/20 text-sky-300 ring-1 ring-sky-400/30">
                  <MessageSquareText className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-white group-hover:text-sky-300">
                  Academic AI Chatbot
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300 academic-selectable">
                  Multi-turn RAG Q&amp;A grounded in retrieved document pages, mathematical
                  formatting, and clear citations.
                </p>
              </a>

              <a
                href="#learning-showcase"
                className="group rounded-2xl border border-slate-800/90 bg-[#0B1428] p-6 transition-colors hover:border-violet-500/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-400/30">
                  <GraduationCap className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-white group-hover:text-indigo-300">
                  Personal AI Tutor
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300 academic-selectable">
                  Step-by-step instruction across Beginner, Standard, and Advanced pacing with
                  worked examples and checks.
                </p>
              </a>
            </div>
          </div>
        </section>

        {/* Scroll-Triggered Interactive Feature Showcases */}
        <div className="border-b border-slate-800/70 bg-gradient-to-b from-[#060B18] via-[#070E1F] to-[#060B18]">
          <FeatureShowcases onOpenAuth={onOpenAuth} />
        </div>

        {/* Supported Academic Inputs */}
        <section id="formats" className="border-b border-slate-800/70 bg-[#080F1E] py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                  Supported academic inputs
                </h2>
                <p className="mt-2 max-w-xl text-sm text-slate-300">
                  Validated extraction pipelines handle multi-page textbooks, scanned pages, live
                  camera captures, and lecture audio recordings cleanly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('signup')}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0 sm:w-auto"
              >
                <span>Start Studying Free</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-[#0B1428] p-5">
                <FileText className="h-5 w-5 text-sky-400" aria-hidden="true" />
                <h3 className="mt-3 font-display text-base font-semibold text-white">
                  PDF Documents
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  Text-based and scanned PDFs with page-number preservation and OCR extraction.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0B1428] p-5">
                <div className="flex items-center gap-2 text-cyan-400">
                  <ImageIcon className="h-5 w-5" aria-hidden="true" />
                  <Camera className="h-4 w-4" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-display text-base font-semibold text-white">
                  Images &amp; Camera Snap
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  PNG, JPG, and WEBP photos or live camera captures of handwritten notes and diagrams.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0B1428] p-5">
                <FileAudio className="h-5 w-5 text-violet-400" aria-hidden="true" />
                <h3 className="mt-3 font-display text-base font-semibold text-white">
                  Lecture Audio
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  MP3, WAV, M4A, WEBM, and OGG voice notes transcribed and organized by concept.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0B1428] p-5">
                <Layers className="h-5 w-5 text-slate-300" aria-hidden="true" />
                <h3 className="mt-3 font-display text-base font-semibold text-white">
                  Pasted Text
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  Direct Markdown, essay drafts, or long excerpts indexed with full section context.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Closing Call to Action */}
        <section className="relative overflow-hidden bg-[#060B18] py-20">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 55% 65% at 50% 50%, rgba(37, 99, 235, 0.16) 0%, rgba(124, 58, 237, 0.08) 45%, rgba(6, 11, 24, 0) 80%)',
            }}
          />
          <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="font-display text-3xl font-bold tracking-tight text-white text-balance sm:text-4xl">
              Bring clarity to your coursework today.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
              Create your private student workspace to upload study materials, generate structured
              summaries, test yourself with timed exams, and save your academic history.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <button
                type="button"
                onClick={() => onOpenAuth('signup')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap"
              >
                <span>Get Started</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('signin')}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-[#0B1428] px-6 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800 whitespace-nowrap"
              >
                Sign In
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 bg-[#050914] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1.5">
            <BrandLogo size="sm" tone="light" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>
                Understand More. Learn Smarter. Achieve More. · © {new Date().getFullYear()} Brainstine
              </span>
              <span aria-hidden="true">·</span>
              <a
                href="/privacy"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onNavigateToPrivacy();
                }}
                className="font-semibold text-sky-400 underline underline-offset-4 transition-colors hover:text-white"
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
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0B1428] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-sky-400/50 hover:text-white whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Replay Intro</span>
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
