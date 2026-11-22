import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import {
  EDUCATIONAL_VISUALS,
  type EducationalVisualAsset,
  type EducationalVisualKey,
  resolveSubjectVisual,
} from '../lib/educationalVisuals';

interface SubjectVisualBannerProps {
  visualKey?: EducationalVisualKey;
  subjectHint?: string | null;
  fallbackKey?: EducationalVisualKey;
  title?: string;
  subtitle?: string;
  variant?: 'hero' | 'textbook' | 'compact';
  className?: string;
}

export function SubjectVisualBanner({
  visualKey,
  subjectHint,
  fallbackKey = 'summarizer',
  title,
  subtitle,
  variant = 'textbook',
  className = '',
}: SubjectVisualBannerProps) {
  const asset: EducationalVisualAsset = visualKey
    ? EDUCATIONAL_VISUALS[visualKey]
    : resolveSubjectVisual(subjectHint, fallbackKey);

  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [asset.src]);

  const heightClasses =
    variant === 'hero'
      ? 'aspect-video min-h-44 max-h-64 sm:min-h-0 sm:max-h-72'
      : variant === 'compact'
        ? 'aspect-video min-h-36 max-h-44 sm:min-h-0 sm:max-h-48'
        : 'aspect-video min-h-40 max-h-56 sm:min-h-0 sm:max-h-64';

  return (
    <figure
      className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 select-none dark:border-slate-800 dark:bg-[#081022] ${className}`}
    >
      <div className={`relative w-full overflow-hidden ${heightClasses}`}>
        {!imgFailed ? (
          <img
            src={asset.src}
            alt={asset.alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.015]"
          />
        ) : (
          <div
            className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${asset.fallbackGradient} p-6 text-white`}
          >
            <BookOpen className="h-8 w-8 opacity-90" aria-hidden="true" />
            <p className="mt-2 font-display text-sm font-semibold">{asset.subjectLabel}</p>
          </div>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent"
        />

        <figcaption className="absolute inset-x-0 bottom-0 p-3.5 sm:p-5 text-white">
          <p className="text-[11px] font-semibold tracking-wide text-sky-300">
            {asset.subjectLabel}
          </p>
          <p className="mt-0.5 font-display text-sm font-semibold leading-snug text-white sm:text-base">
            {title || asset.caption}
          </p>
          {subtitle && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-200/95">
              {subtitle}
            </p>
          )}
        </figcaption>
      </div>
    </figure>
  );
}
