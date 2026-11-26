import React, { useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import type { SummaryVisualAid } from '../types/brainstine';
import { ScientificText } from './ScientificText';

interface SummaryVisualBlockProps {
  visual: SummaryVisualAid;
  className?: string;
}

const VISUAL_TYPE_LABEL: Record<SummaryVisualAid['visualType'], string> = {
  illustration: 'Conceptual Illustration',
  diagram: 'Academic Diagram',
  concept_map: 'Relational Structure',
  process_sequence: 'Process Sequence',
  comparative_visual: 'Comparative View',
  spatial_scene: 'Spatial Composition',
};

/**
 * Renders a real generated Nano Banana educational visual inline within its
 * corresponding summary section, paired with verified React-rendered labels below.
 * Never displays placeholder artwork or hides missing image errors loudly.
 */
export function SummaryVisualBlock({ visual, className = '' }: SummaryVisualBlockProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (
    !visual ||
    !visual.imageDataUrl ||
    (!visual.imageDataUrl.startsWith('data:image/') && !visual.imageDataUrl.startsWith('https://')) ||
    imageFailed
  ) {
    return null;
  }

  return (
    <>
      <figure
        className={`mt-4 overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/50 ${className}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-2.5 dark:border-slate-800">
          <div className="min-w-0">
            <span className="font-mono text-[11px] font-medium tracking-wide text-blue-700 uppercase select-none dark:text-cyan-400">
              {VISUAL_TYPE_LABEL[visual.visualType] || 'Visual Study Aid'}
            </span>
            <h5 className="truncate font-display text-sm font-semibold text-slate-900 dark:text-white">
              <ScientificText text={visual.conceptTitle} />
            </h5>
          </div>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Expand ${visual.conceptTitle} visual`}
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 select-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Expand</span>
          </button>
        </div>

        <div className="bg-white p-3 dark:bg-slate-950/60">
          <img
            src={visual.imageDataUrl}
            alt={`${visual.conceptTitle} — ${visual.caption}`}
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="mx-auto max-h-[360px] w-full rounded-lg object-contain"
          />
        </div>

        <figcaption className="border-t border-slate-200/80 px-4 py-3 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:text-slate-300">
          <p className="font-medium text-slate-800 academic-selectable dark:text-slate-200">
            <ScientificText text={visual.caption} />
          </p>

          {visual.verifiedLabels && visual.verifiedLabels.length > 0 && (
            <dl className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-1.5 border-t border-slate-200/70 pt-2.5 sm:grid-cols-2 dark:border-slate-800/80">
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
          )}
        </figcaption>
      </figure>

      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={visual.conceptTitle}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <p className="font-mono text-[11px] font-medium text-blue-700 uppercase dark:text-cyan-400">
                  {VISUAL_TYPE_LABEL[visual.visualType]} · {visual.subjectDiscipline}
                </p>
                <h4 className="mt-0.5 font-display text-lg font-bold text-slate-900 dark:text-white">
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

            <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <img
                src={visual.imageDataUrl}
                alt={`${visual.conceptTitle} — ${visual.caption}`}
                referrerPolicy="no-referrer"
                className="mx-auto max-h-[65vh] w-full rounded-lg object-contain"
              />
            </div>

            <div className="mt-4 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
              <p className="font-medium text-slate-900 dark:text-white">
                <ScientificText text={visual.caption} />
              </p>
              {visual.verifiedLabels && visual.verifiedLabels.length > 0 && (
                <dl className="grid grid-cols-1 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2 dark:border-slate-800">
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
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
