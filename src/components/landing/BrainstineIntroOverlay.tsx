import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { BrainFallbackVisual } from './BrainFallbackVisual';

const BrainstineBrainCanvas = lazy(() => import('./BrainstineBrainCanvas'));

interface BrainstineIntroOverlayProps {
  onComplete: () => void;
}

export function BrainstineIntroOverlay({ onComplete }: BrainstineIntroOverlayProps) {
  // Cinematic timing:
  // 0 (0.0s -> 2.65s): Full-bleed sculpted 3D human brain close-up & majestic pull-back reveal
  // 1 (2.65s -> 3.35s): Brainstine logo & wordmark fade smoothly into lower optical safe zone
  // 2 (3.35s -> 4.95s): Tagline "Understand More. Learn Smarter. Achieve More." reveals
  // 3 (4.95s -> 5.65s): Seamless camera ease & atmospheric dissolve into main Hero
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);
  const [progressStarted, setProgressStarted] = useState(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      onComplete();
      return;
    }

    const rafId = window.requestAnimationFrame(() => setProgressStarted(true));
    const t1 = window.setTimeout(() => setStage(1), 2650);
    const t2 = window.setTimeout(() => setStage(2), 3350);
    const t3 = window.setTimeout(() => setStage(3), 4950);
    const tDone = window.setTimeout(() => onComplete(), 5650);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onComplete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(tDone);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onComplete]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Brainstine introduction"
      className={`fixed inset-0 z-50 overflow-hidden bg-[#050914] transition-opacity duration-700 ease-out ${
        stage === 3 ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Atmospheric midnight-navy radial depth glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 68% 60% at 50% 42%, rgba(37, 99, 235, 0.24) 0%, rgba(124, 58, 237, 0.13) 40%, rgba(5, 9, 20, 0.99) 82%)',
        }}
      />

      {/* Full-Viewport 3D Brain Stage — the sculpted human brain dominates the scene */}
      <div className="absolute inset-0 z-10">
        <Suspense fallback={<BrainFallbackVisual className="h-full w-full" />}>
          <BrainstineBrainCanvas
            phase={stage === 3 ? 'transitioning' : 'intro'}
            interactive={false}
          />
        </Suspense>
      </div>

      {/* Subtle Bottom Scrim ensuring crisp Brand & Tagline legibility without obscuring the Brain above */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-56 sm:h-64"
        style={{
          background:
            'linear-gradient(to top, rgba(5, 9, 20, 0.96) 18%, rgba(5, 9, 20, 0.65) 58%, rgba(5, 9, 20, 0) 100%)',
        }}
      />

      {/* Top Bar: Discreet Skip Control (solid translucent navy, never backdrop-blur over WebGL) */}
      <div className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-end px-6 pt-6 sm:pt-8">
        <button
          type="button"
          onClick={onComplete}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-700/80 bg-[#0B1429]/90 px-4 py-2 text-xs font-semibold tracking-wide text-slate-200 transition-colors hover:border-sky-400/60 hover:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          <span>Skip Intro</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Lower-Third Elegant Brand & Tagline Reveal */}
      <div className="pointer-events-none absolute inset-x-0 bottom-7 z-20 flex flex-col items-center px-6 text-center sm:bottom-10">
        <div
          className={`transition-all duration-700 ease-out ${
            stage >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'
          }`}
        >
          <BrandLogo size="lg" tone="light" />
        </div>

        <p
          className={`mt-3 max-w-xl font-display text-lg font-medium tracking-tight text-slate-100 text-balance transition-all duration-700 ease-out sm:text-2xl ${
            stage >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          Understand More. Learn Smarter. Achieve More.
        </p>

        {/* Subtle Progress Line */}
        <div className="mt-5 h-0.5 w-52 overflow-hidden rounded-full bg-slate-800/80 sm:w-64">
          <div
            className="h-full origin-left rounded-full bg-gradient-to-r from-[#38BDF8] via-[#60A5FA] to-[#8B5CF6] transition-transform duration-[4900ms] ease-out"
            style={{
              transform: progressStarted ? 'scaleX(1)' : 'scaleX(0.06)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
