import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Camera,
  FileAudio,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Menu,
  MessageSquareText,
  Sparkles,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { ThemeSelector } from './ThemeSelector';
import type { AuthModalMode } from './AuthModal';

interface WelcomePageProps {
  onOpenAuth: (mode: AuthModalMode) => void;
  onNavigateToPrivacy: () => void;
}

export function WelcomePage({ onOpenAuth, onNavigateToPrivacy }: WelcomePageProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [synthImgFailed, setSynthImgFailed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-50 text-slate-900 dark:bg-[#080F1E] dark:text-slate-100">
      {/* 3-Zone Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#080F1E]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
          <a
            href="#top"
            className="shrink-0 whitespace-nowrap rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <BrandLogo size="md" />
          </a>

          <nav
            aria-label="Primary"
            className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex dark:text-slate-300"
          >
            <a
              href="#features"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0F1E3D] hover:underline hover:underline-offset-4 dark:hover:text-white"
            >
              AI Suite
            </a>
            <a
              href="#workflow"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0F1E3D] hover:underline hover:underline-offset-4 dark:hover:text-white"
            >
              Workflow
            </a>
            <a
              href="#modes"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0F1E3D] hover:underline hover:underline-offset-4 dark:hover:text-white"
            >
              Study Depths
            </a>
            <a
              href="#formats"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[#0F1E3D] hover:underline hover:underline-offset-4 dark:hover:text-white"
            >
              Formats
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className="hidden min-h-10 items-center rounded-xl bg-[#0F1E3D] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] whitespace-nowrap shrink-0 md:inline-flex dark:bg-[#1D4ED8] dark:hover:bg-blue-500"
            >
              Get Started
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden dark:border-slate-800 dark:text-slate-200"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden dark:border-slate-800 dark:bg-[#0D162B]">
            <div className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="py-2.5">
                AI Suite
              </a>
              <a href="#workflow" onClick={() => setMobileMenuOpen(false)} className="py-2.5">
                Workflow
              </a>
              <a href="#modes" onClick={() => setMobileMenuOpen(false)} className="py-2.5">
                Study Depths
              </a>
              <a href="#formats" onClick={() => setMobileMenuOpen(false)} className="py-2.5">
                Formats
              </a>
              <div className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('signin');
                  }}
                  className="min-h-11 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-center font-semibold dark:border-slate-700"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('signup');
                  }}
                  className="min-h-11 flex-1 rounded-xl bg-[#0F1E3D] px-4 py-2.5 text-center font-semibold text-white dark:bg-[#1D4ED8]"
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        {/* Hero Section */}
        <section id="overview" className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 lg:px-8 lg:pt-18 lg:pb-24">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-sm font-semibold tracking-wide text-[#1D4ED8] dark:text-[#38BDF8]">
                Your Personal AI-Powered Academic Companion
              </p>
              <h1 className="mt-2 font-display text-5xl font-bold tracking-tight text-[#0B1528] sm:text-6xl dark:text-white academic-selectable">
                Brainstine
              </h1>
              <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-slate-800 text-balance sm:text-3xl dark:text-slate-100">
                Master complex coursework with structured summaries, exams, and guided tutoring.
              </p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300 academic-selectable">
                Brainstine transforms PDFs, handwritten notebook photos, and lecture audio into
                diagram-rich summaries, 10–40 question assessments, context-aware academic chat, and
                step-by-step personal tutoring—saved securely to your account.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => onOpenAuth('signup')}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0F1E3D] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#192F5D] whitespace-nowrap shrink-0 dark:bg-[#1D4ED8] dark:hover:bg-blue-500"
                >
                  <span>Get Started</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('signin')}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Sign In
                </button>
                <PWAInstallButton compact />
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>AI Study Summarizer</span>
                <span aria-hidden="true">·</span>
                <span>Quiz &amp; Exam Engine</span>
                <span aria-hidden="true">·</span>
                <span>Academic Chatbot</span>
                <span aria-hidden="true">·</span>
                <span>Personal AI Tutor</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_academic_study_1795007734160.jpg"
                    alt="Modern sunlit university desk with an open academic notebook and laptop displaying structured study notes"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="aspect-video h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#0F1E3D] via-[#1E3A8A] to-[#0891B2] p-8 text-white">
                    <GraduationCap className="h-12 w-12 opacity-90" aria-hidden="true" />
                    <p className="mt-4 font-display text-lg font-semibold">Brainstine Study Workspace</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Four Main AI Capabilities */}
        <section
          id="features"
          className="border-t border-slate-200 bg-white py-16 lg:py-20 dark:border-slate-800/80 dark:bg-[#0B1325]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-wide text-[#1D4ED8] dark:text-[#38BDF8]">
                Four Integrated Learning Engines
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 text-balance dark:text-white">
                Focused academic tools built to help you actually understand and retain.
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-[#0D162B]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F1E3D] text-white dark:bg-[#1D4ED8]">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-white">
                  AI Study Summarizer
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 academic-selectable">
                  Convert PDFs, photos, and audio into structured study notes with visual diagrams,
                  comparison tables, formulas, and clear source attribution.
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-[#0D162B]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
                  <ListChecks className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-white">
                  AI Quiz &amp; Exam Maker
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 academic-selectable">
                  Generate 10, 20, 30, or 40 objective, theory, or mixed questions in Practice or
                  timed Exam mode with instant grading and full answer explanations.
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-[#0D162B]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  <MessageSquareText className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-white">
                  AI Academic Chatbot
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 academic-selectable">
                  Ask multi-turn questions anchored in your saved materials or snapped photos, with
                  rich tables, formatted math, code, and schematic diagrams.
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-[#0D162B]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                  <GraduationCap className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-white">
                  Personal AI Tutor
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 academic-selectable">
                  Learn step by step across Beginner, Standard, and Advanced pacing with worked
                  examples, visual guides, and interactive check-for-understanding prompts.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Workflow & Extraction Mechanism */}
        <section
          id="workflow"
          className="border-t border-slate-200 bg-slate-50 py-16 lg:py-24 dark:border-slate-800/80 dark:bg-[#080F1E]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
              <div className="order-2 lg:order-1 lg:col-span-5">
                <div className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  {!synthImgFailed ? (
                    <img
                      src="/src/assets/images/academic_material_synthesis_1795007733268.jpg"
                      alt="Organized lecture slides and study flashcards on a clean study desk"
                      referrerPolicy="no-referrer"
                      onError={() => setSynthImgFailed(true)}
                      className="aspect-4/3 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-4/3 h-full w-full flex-col items-center justify-center bg-slate-100 p-8 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      <BookOpen className="h-10 w-10" aria-hidden="true" />
                      <p className="mt-3 font-display text-base font-semibold">Material Synthesis</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="order-1 flex flex-col justify-center lg:order-2 lg:col-span-7">
                <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance dark:text-white">
                  Built for real coursework, from raw file to exam mastery.
                </h2>
                <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-300 academic-selectable">
                  Every document passes through dedicated extraction and chunking pipelines before
                  synthesis, preserving section progression, formulas, and technical terminology.
                </p>

                <div className="mt-8 divide-y divide-slate-200 border-t border-b border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  <div className="py-5">
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      01. Upload files, snap notes, or paste text
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      Drop PDF handouts, slide decks, camera snapshots of whiteboards, audio
                      recordings, or copied text into one private workspace.
                    </p>
                  </div>
                  <div className="py-5">
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      02. Inspect visual summaries and study diagrams
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      Review structured takeaways, comparison tables, process diagrams, and clear
                      separation between source facts and AI clarifications.
                    </p>
                  </div>
                  <div className="py-5">
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      03. Practice, test, and track academic history
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      Turn any material into timed exams or guided tutoring sessions and reopen any
                      saved record anytime from My Academic History.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Summary Modes */}
        <section id="modes" className="border-t border-slate-200 bg-white py-16 lg:py-24 dark:border-slate-800/80 dark:bg-[#0B1325]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance dark:text-white">
                Three study depths for every stage of your semester.
              </h2>
              <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
                Choose the exact level of academic detail you need, whether previewing a chapter
                before class or preparing for final exams.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-[#0D162B]">
                <p className="font-mono text-xs font-medium text-[#1D4ED8] dark:text-[#38BDF8]">
                  Mode 01 · Rapid Review
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold text-slate-900 dark:text-white">
                  Short Summary
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  A crisp, high-signal overview capturing the central thesis, essential terminology,
                  and immediate takeaways in minutes.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-[#0D162B]">
                <p className="font-mono text-xs font-medium text-[#1D4ED8] dark:text-[#38BDF8]">
                  Mode 02 · Core Mastery
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold text-slate-900 dark:text-white">
                  Detailed Summary
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  Thorough conceptual explanations showing how mechanisms, arguments, comparisons,
                  and formulas connect across the reading.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-[#0D162B]">
                <p className="font-mono text-xs font-medium text-indigo-700 dark:text-indigo-400">
                  Mode 03 · Exam Preparation
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold text-slate-900 dark:text-white">
                  Comprehensive Study Notes
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  Extensive, structured academic notes with complete glossaries, labeled diagrams,
                  formal frameworks, and exam-ready revision notes.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Supported Inputs */}
        <section
          id="formats"
          className="border-t border-slate-200 bg-slate-50 py-16 dark:border-slate-800/80 dark:bg-[#080F1E]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Supported academic inputs
                </h2>
                <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">
                  Validated extraction pipelines handle multi-page readings, live camera snaps, and
                  recorded lecture audio cleanly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('signup')}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] whitespace-nowrap shrink-0 dark:bg-[#1D4ED8] dark:hover:bg-blue-500"
              >
                Start Studying Free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D162B]">
                <FileText className="h-5 w-5 text-[#1D4ED8] dark:text-blue-400" aria-hidden="true" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
                  PDF Documents
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Digital textbooks, research papers, and scanned PDFs with automatic OCR fallback.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D162B]">
                <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-400">
                  <ImageIcon className="h-5 w-5" aria-hidden="true" />
                  <Camera className="h-4 w-4" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
                  Images &amp; Camera Snap
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  PNG, JPG, and WEBP photos or live camera captures of handwritten notes and diagrams.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D162B]">
                <FileAudio className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
                  Lecture Audio
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  MP3, WAV, M4A, WEBM, and OGG voice notes transcribed and organized by concept.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D162B]">
                <Layers className="h-5 w-5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-white">
                  Pasted Text
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Direct Markdown, essay drafts, or long article excerpts chunked without losing context.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-[#080F1E]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1.5">
            <BrandLogo size="sm" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Your Personal AI-Powered Academic Companion · © {new Date().getFullYear()} Brainstine
              </span>
              <span aria-hidden="true">·</span>
              <a
                href="/privacy"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onNavigateToPrivacy();
                }}
                className="font-semibold text-[#1D4ED8] underline underline-offset-4 transition-colors hover:text-[#0F1E3D] dark:text-[#38BDF8] dark:hover:text-white"
              >
                Privacy Policy
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PWAInstallButton compact />
            <ThemeSelector />
          </div>
        </div>
      </footer>
    </div>
  );
}
