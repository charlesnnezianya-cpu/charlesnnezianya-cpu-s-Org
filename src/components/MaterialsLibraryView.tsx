import React, { useState } from 'react';
import {
  Download,
  FileAudio,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { deleteStudyMaterial, getMaterialSignedUrl } from '../lib/supabase';
import type { StudyMaterialRecord } from '../types/brainstine';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface MaterialsLibraryViewProps {
  materials: StudyMaterialRecord[];
  onRefresh: () => void;
  onSummarizeMaterial: (material: StudyMaterialRecord) => void;
  onQuizMaterial: (material: StudyMaterialRecord) => void;
  onOpenSummarizer: () => void;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function MaterialsLibraryView({
  materials,
  onRefresh,
  onSummarizeMaterial,
  onQuizMaterial,
  onOpenSummarizer,
}: MaterialsLibraryViewProps) {
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<StudyMaterialRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDownloadOriginal = async (mat: StudyMaterialRecord) => {
    if (!mat.storage_path) return;
    setErrorMsg(null);
    setBusyId(mat.id);
    try {
      const signedUrl = await getMaterialSignedUrl(mat.storage_path);
      const anchor = document.createElement('a');
      anchor.href = signedUrl;
      anchor.download = mat.file_name || mat.title;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to download file.');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || !confirmTarget) return;
    const mat = confirmTarget;
    setErrorMsg(null);
    setBusyId(mat.id);
    try {
      await deleteStudyMaterial(user.id, mat.id, mat.storage_path);
      setConfirmTarget(null);
      onRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not delete material.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 select-none dark:text-white">
            Uploaded Materials
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Access your stored PDFs, images, audio transcripts, and pasted texts.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSummarizer}
          className="min-h-11 sm:min-h-10 rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#192F5D] whitespace-nowrap shrink-0 select-none dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          Upload Material
        </button>
      </div>

      {errorMsg && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {errorMsg}
        </p>
      )}

      {materials.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-10 text-center dark:border-slate-800 dark:bg-slate-900/40">
          <FolderOpen className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 font-display text-base font-semibold text-slate-900 select-none dark:text-white">
            No uploaded materials yet
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Upload PDFs, handwritten notes, or lecture audio in the AI Summarizer to store them
            here securely.
          </p>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
          {materials.map((mat) => {
            const isExpanded = expandedId === mat.id;
            return (
              <div key={mat.id} className="py-4">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-cyan-400">
                      {mat.material_type === 'pdf' && <FileText className="h-5 w-5" aria-hidden="true" />}
                      {mat.material_type === 'image' && <ImageIcon className="h-5 w-5" aria-hidden="true" />}
                      {mat.material_type === 'audio' && <FileAudio className="h-5 w-5" aria-hidden="true" />}
                      {mat.material_type === 'text' && <Layers className="h-5 w-5" aria-hidden="true" />}
                    </div>

                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : mat.id)}
                        className="truncate text-left font-display text-base font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-cyan-400"
                      >
                        {mat.title}
                      </button>
                      <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums select-none dark:text-slate-400">
                        {mat.material_type.toUpperCase()} · {mat.word_count.toLocaleString()} words ·{' '}
                        {formatBytes(mat.file_size)} ·{' '}
                        {new Date(mat.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 select-none">
                    <button
                      type="button"
                      onClick={() => onSummarizeMaterial(mat)}
                      className="inline-flex min-h-10 sm:min-h-9 items-center gap-1.5 rounded-lg bg-[#0F1E3D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#192F5D] dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Summarize</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onQuizMaterial(mat)}
                      className="inline-flex min-h-10 sm:min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Quiz</span>
                    </button>

                    {mat.storage_path && (
                      <button
                        type="button"
                        onClick={() => handleDownloadOriginal(mat)}
                        disabled={busyId === mat.id}
                        className="inline-flex min-h-10 sm:min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>File</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setConfirmTarget(mat)}
                      disabled={busyId === mat.id}
                      aria-label={`Delete ${mat.title}`}
                      className="min-h-10 min-w-10 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                    <p className="mb-1.5 text-xs font-semibold text-slate-500 select-none dark:text-slate-400">
                      Extracted Content Preview
                    </p>
                    <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700 select-text dark:text-slate-300">
                      {mat.extracted_text}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={Boolean(confirmTarget)}
        title="Delete uploaded material?"
        itemName={confirmTarget?.title}
        description="This permanently deletes the uploaded file and extracted text from your library. Existing summaries generated from it remain saved."
        busy={Boolean(busyId)}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </section>
  );
}
