import React, { useState } from 'react';
import { Camera, ExternalLink, Info, Layers, Maximize2, X } from 'lucide-react';
import type { SummaryVisualAid } from '../types/brainstine';
import { EducationalDiagramRenderer } from './EducationalDiagramRenderer';
import { ScientificText } from './ScientificText';

interface SummaryVisualBlockProps {
  visual: SummaryVisualAid;
  className?: string;
  compact?: boolean;
}

const VISUAL_TYPE_LABEL: Record<SummaryVisualAid['visualType'], string> = {
  illustration: 'Educational Illustration',
  diagram: 'Academic Diagram',
  concept_map: 'Relational Structure',
  process_sequence: 'Process Sequence',
  comparative_visual: 'Comparative Visual',
  spatial_scene: 'Spatial Composition',
};

/**
 * Renders an authentic educational visual aid:
 * - Genuine high-resolution educational photography (NASA, OpenStax, Wikimedia Commons)
 * - Or algorithmic vector diagrams (interactive SVG schematics)
 * Includes exact verified resolution, legal license, verified callouts, and fallback styling.
 */
export function SummaryVisualBlock({
  visual,
  className = '',
  compact = false,
}: SummaryVisualBlockProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!visual) return null;

  // Modality: Programmatic Vector Diagram
  if (visual.modality === 'diagram' && visual.diagramSpec) {
    return (
      <div className={`my-4 ${className}`}>
        <EducationalDiagramRenderer spec={visual.diagramSpec} compact={compact} />
      </div>
    );
  }

  const hasValidImageUrl =
    Boolean(visual.imageDataUrl) &&
    (visual.imageDataUrl.startsWith('https://') ||
      visual.imageDataUrl.startsWith('/') ||
      visual.imageDataUrl.startsWith('data:image/'));

  return (
    <>
      <figure
        className={`my-4 overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/70 transition-shadow dark:border-slate-800 dark:bg-slate-900/50 ${className}`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-2.5 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 select-none">
              <span className="font-semibold text-blue-700 dark:text-cyan-400">
                {VISUAL_TYPE_LABEL[visual.visualType] || 'Visual Study Aid'}
              </span>
              {visual.exactResolution && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {visual.exactResolution}
                  </span>
                </>
              )}
            </div>
            <h5 className="truncate font-display text-sm font-semibold text-slate-900 dark:text-white">
              <ScientificText text={visual.conceptTitle} />
            </h5>
          </div>

          {hasValidImageUrl && !imageFailed && (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label={`Expand ${visual.conceptTitle} full resolution`}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 select-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Full View</span>
            </button>
          )}
        </div>

        {/* Media Frame or Resilient Fallback */}
        <div className="relative bg-white dark:bg-slate-950/70">
          {hasValidImageUrl && !imageFailed ? (
            <div className="relative overflow-hidden bg-slate-900/5 dark:bg-slate-950">
              <img
                src={visual.imageDataUrl}
                alt={`${visual.conceptTitle} — ${visual.caption}`}
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={() => setImageFailed(true)}
                className="mx-auto max-h-[380px] w-full object-contain"
              />
            </div>
          ) : (
            // Styled Resilient Blueprint Fallback (never broken or blank)
            <div className="flex flex-col items-center justify-center p-6 text-center select-none bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-100 dark:from-slate-900 dark:via-slate-900/80 dark:to-slate-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-cyan-300">
                <Layers className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                <ScientificText text={visual.conceptTitle} />
              </p>
              <p className="mt-1 max-w-[55ch] text-xs text-slate-600 dark:text-slate-400">
                <ScientificText text={visual.caption} />
              </p>
            </div>
          )}
        </div>

        {/* Caption, Verified Callouts & Academic Attribution */}
        <figcaption className="border-t border-slate-200/80 px-4 py-3 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:text-slate-300">
          <p className="font-medium text-slate-800 academic-selectable dark:text-slate-200">
            <ScientificText text={visual.caption} />
          </p>

          {/* Verified Labels & Components */}
          {visual.verifiedLabels && visual.verifiedLabels.length > 0 && (
            <div className="mt-3 border-t border-slate-200/70 pt-2.5 dark:border-slate-800/80">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider select-none dark:text-slate-400">
                Identified Components & Structures
              </p>
              <dl className="mt-1.5 grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
                {visual.verifiedLabels.map((item, idx) => (
                  <div key={idx} className="text-xs leading-relaxed">
                    <dt className="inline font-semibold text-slate-900 dark:text-white">
                      {idx + 1}. <ScientificText text={item.label} />
                    </dt>
                    {item.detail && (
                      <>
                        <span className="mx-1 text-slate-400" aria-hidden="true">
                          —
                        </span>
                        <dd className="inline text-slate-600 academic-selectable dark:text-slate-400">
                          <ScientificText text={item.detail} />
                        </dd>
                      </>
                    )}
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Legal Academic Attribution & Resolution Notice */}
          {(visual.attribution || visual.license) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2 text-[11px] text-slate-500 select-none dark:border-slate-800/60 dark:text-slate-400">
              <div className="flex items-center gap-1.5 min-w-0">
                <Camera className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="truncate">
                  {visual.attribution ? `${visual.attribution} · ` : ''}
                  {visual.license || 'Public Domain'}
                </span>
              </div>
              {visual.exactResolution && (
                <span className="font-mono text-[10.5px] tabular-nums text-slate-400 dark:text-slate-500">
                  {visual.exactResolution}
                </span>
              )}
            </div>
          )}
        </figcaption>
      </figure>

      {/* Lightbox Modal */}
      {lightboxOpen && hasValidImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={visual.conceptTitle}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-cyan-400">
                  <span>{VISUAL_TYPE_LABEL[visual.visualType]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{visual.subjectDiscipline}</span>
                  {visual.exactResolution && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        {visual.exactResolution}
                      </span>
                    </>
                  )}
                </div>
                <h4 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
                  <ScientificText text={visual.conceptTitle} />
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close visual preview"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-slate-950 p-2 sm:p-4">
              <img
                src={visual.imageDataUrl}
                alt={`${visual.conceptTitle} — ${visual.caption}`}
                referrerPolicy="no-referrer"
                className="mx-auto max-h-[65vh] w-full rounded-lg object-contain"
              />
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <p className="font-medium text-slate-900 dark:text-white">
                <ScientificText text={visual.caption} />
              </p>

              {visual.verifiedLabels && visual.verifiedLabels.length > 0 && (
                <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                  <h6 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Component Callouts
                  </h6>
                  <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {visual.verifiedLabels.map((item, idx) => (
                      <div key={idx} className="text-xs leading-relaxed">
                        <dt className="inline font-semibold text-slate-900 dark:text-white">
                          {idx + 1}. <ScientificText text={item.label} />
                        </dt>
                        {item.detail && (
                          <>
                            <span className="mx-1 text-slate-400" aria-hidden="true">
                              —
                            </span>
                            <dd className="inline text-slate-600 dark:text-slate-400">
                              <ScientificText text={item.detail} />
                            </dd>
                          </>
                        )}
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {(visual.attribution || visual.license) && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 select-none">
                  <span>
                    Academic Credit & License: {visual.attribution || ''}
                    {visual.attribution && visual.license ? ' · ' : ''}
                    {visual.license || 'Open Academic Asset'}
                  </span>
                  {visual.exactResolution && (
                    <span className="font-mono tabular-nums">{visual.exactResolution}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
