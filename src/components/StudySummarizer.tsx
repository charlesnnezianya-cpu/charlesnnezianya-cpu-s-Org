import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileAudio,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  createStudyMaterialRecord,
  recordStudyActivity,
  saveStudySummaryRecord,
  uploadMaterialFileToStorage,
} from '../lib/supabase';
import type {
  ExtractionResult,
  MaterialSourceType,
  StructuredSummary,
  StudyMaterialRecord,
  SummaryLevel,
} from '../types/brainstine';
import { SummaryDisplay } from './SummaryDisplay';

interface StudySummarizerProps {
  initialMaterial?: StudyMaterialRecord | null;
  geminiConfigured: boolean;
  onActivityRecorded?: () => void;
  onGenerateQuizFromSummary?: (summary: StructuredSummary) => void;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const ACCEPTED_EXTENSIONS =
  '.pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.mp3,.wav,.m4a,.webm,.ogg,.aac,.flac,.txt,.md';

function validateFile(file: File): { valid: boolean; error?: string; type?: MaterialSourceType } {
  if (file.size > MAX_FILE_BYTES) {
    return {
      valid: false,
      error: `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB, which exceeds the 25 MB upload limit.`,
    };
  }
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return { valid: true, type: 'pdf' };
  }
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif)$/.test(name)) {
    return { valid: true, type: 'image' };
  }
  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|webm|ogg|aac|flac)$/.test(name)) {
    return { valid: true, type: 'audio' };
  }
  if (mime === 'text/plain' || mime === 'text/markdown' || /\.(txt|md)$/.test(name)) {
    return { valid: true, type: 'text' };
  }
  return {
    valid: false,
    error: `Unsupported file type for "${file.name}". Supported formats: PDF, PNG/JPG/WEBP images, MP3/WAV/M4A/WEBM/OGG audio, and TXT/MD text.`,
  };
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function StudySummarizer({
  initialMaterial,
  geminiConfigured,
  onActivityRecorded,
  onGenerateQuizFromSummary,
}: StudySummarizerProps) {
  const { user, isConfigured } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pastedTitle, setPastedTitle] = useState('');
  const [pastedText, setPastedText] = useState('');

  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [extracting, setExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [editableExtractedText, setEditableExtractedText] = useState('');
  const [editableTitle, setEditableTitle] = useState('');
  const [savedMaterialId, setSavedMaterialId] = useState<string | null>(null);

  const [summaryLevel, setSummaryLevel] = useState<SummaryLevel>('detailed');
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState<StructuredSummary | null>(null);
  const [savingSummary, setSavingSummary] = useState(false);
  const [summarySaved, setSummarySaved] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialMaterial) {
      setExtraction({
        title: initialMaterial.title,
        materialType: initialMaterial.material_type,
        fileName: initialMaterial.file_name,
        fileSizeBytes: initialMaterial.file_size,
        mimeType: initialMaterial.mime_type,
        extractedText: initialMaterial.extracted_text,
        chunks: [initialMaterial.extracted_text],
        chunkCount: initialMaterial.chunk_count || 1,
        wordCount: initialMaterial.word_count,
        characterCount: initialMaterial.extracted_text.length,
        pageCount: null,
        extractionMethod: 'direct-text',
      });
      setEditableExtractedText(initialMaterial.extracted_text);
      setEditableTitle(initialMaterial.title);
      setSavedMaterialId(initialMaterial.id);
      setSummary(null);
      setSummarySaved(false);
      setErrorMsg(null);
      setNoticeMsg(`Loaded "${initialMaterial.title}" from your uploaded materials.`);
    }
  }, [initialMaterial]);

  const resetAll = () => {
    setSelectedFile(null);
    setPastedTitle('');
    setPastedText('');
    setUploadProgress(0);
    setExtraction(null);
    setEditableExtractedText('');
    setEditableTitle('');
    setSavedMaterialId(null);
    setSummary(null);
    setSummarySaved(false);
    setErrorMsg(null);
    setNoticeMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChosen = (file: File | null) => {
    if (!file) return;
    setErrorMsg(null);
    setNoticeMsg(null);
    const check = validateFile(file);
    if (!check.valid) {
      setErrorMsg(check.error || 'Unsupported file.');
      return;
    }
    setSelectedFile(file);
    setExtraction(null);
    setSummary(null);
    setSummarySaved(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setInputMode('file');
      handleFileChosen(file);
    }
  };

  const extractContent = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setSummary(null);
    setSummarySaved(false);

    if (inputMode === 'file' && !selectedFile) {
      setErrorMsg('Please select or drop a file to extract.');
      return;
    }
    if (inputMode === 'text' && pastedText.trim().length < 20) {
      setErrorMsg('Please paste at least 20 characters of study content before extracting.');
      return;
    }

    setExtracting(true);
    setUploadProgress(10);

    try {
      let result: ExtractionResult;

      if (inputMode === 'file' && selectedFile) {
        const fileCheck = validateFile(selectedFile);
        const typeLabel =
          fileCheck.type === 'pdf'
            ? 'Extracting text from PDF...'
            : fileCheck.type === 'image'
              ? 'Running OCR on image notes...'
              : fileCheck.type === 'audio'
                ? 'Transcribing lecture audio...'
                : 'Reading text file...';
        setExtractionStatus(typeLabel);

        const formData = new FormData();
        formData.append('file', selectedFile);
        if (editableTitle.trim()) {
          formData.append('title', editableTitle.trim());
        }

        result = await new Promise<ExtractionResult>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/materials/extract');
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              const pct = Math.min(55, Math.round((evt.loaded / evt.total) * 55));
              setUploadProgress(pct);
            }
          };
          xhr.onload = () => {
            setUploadProgress(95);
            try {
              const json = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(json as ExtractionResult);
              } else {
                reject(new Error(json.error || 'Content extraction failed.'));
              }
            } catch {
              reject(new Error('Invalid server response during extraction.'));
            }
          };
          xhr.onerror = () => reject(new Error('Network error while uploading file.'));
          xhr.send(formData);
        });
      } else {
        setExtractionStatus('Chunking and indexing pasted study text...');
        setUploadProgress(50);
        const res = await fetch('/api/materials/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: pastedText.trim(),
            title: pastedTitle.trim() || 'Pasted Study Notes',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Text processing failed.');
        }
        result = data as ExtractionResult;
      }

      setUploadProgress(100);
      setExtraction(result);
      setEditableExtractedText(result.extractedText);
      setEditableTitle(result.title);

      if (user && isConfigured) {
        try {
          setExtractionStatus('Saving material to your Supabase library...');
          let storagePath: string | null = null;
          if (inputMode === 'file' && selectedFile) {
            storagePath = await uploadMaterialFileToStorage(user.id, selectedFile);
          }
          const materialRecord = await createStudyMaterialRecord({
            userId: user.id,
            title: result.title,
            materialType: result.materialType,
            fileName: result.fileName,
            fileSize: result.fileSizeBytes,
            mimeType: result.mimeType,
            storagePath,
            extractedText: result.extractedText,
            wordCount: result.wordCount,
            chunkCount: result.chunkCount,
          });
          setSavedMaterialId(materialRecord.id);

          await recordStudyActivity({
            userId: user.id,
            activityType: inputMode === 'file' ? 'upload' : 'extract',
            title: result.title,
            detail: `Extracted ${result.wordCount.toLocaleString()} words (${result.chunkCount} ${
              result.chunkCount === 1 ? 'chunk' : 'chunks'
            })`,
            materialType: result.materialType,
          });
          onActivityRecorded?.();
        } catch (storageErr) {
          console.warn('Material cloud sync notice:', storageErr);
          setNoticeMsg(
            `Content extracted, but cloud sync encountered an issue: ${
              storageErr instanceof Error ? storageErr.message : 'Check Supabase schema/bucket.'
            }`
          );
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to extract content.');
      setUploadProgress(0);
    } finally {
      setExtracting(false);
      setExtractionStatus('');
    }
  };

  const handleGenerateSummary = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);

    if (!geminiConfigured) {
      setErrorMsg(
        'GEMINI_API_KEY is missing. Configure GEMINI_API_KEY in Replit Secrets (or Settings > Secrets) before generating AI summaries.'
      );
      return;
    }

    const sourceText = editableExtractedText.trim();
    if (sourceText.length < 20) {
      setErrorMsg('Extracted content is too short. Please provide at least 20 characters.');
      return;
    }

    setGenerating(true);
    setSummarySaved(false);

    try {
      const res = await fetch('/api/summaries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractedText: sourceText,
          title: editableTitle.trim() || extraction?.title || 'Study Material',
          materialType: extraction?.materialType || 'text',
          summaryLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Summary generation failed.');
      }

      const generated = data as StructuredSummary;
      setSummary(generated);

      if (user && isConfigured) {
        await recordStudyActivity({
          userId: user.id,
          activityType: 'summarize',
          title: generated.title,
          detail: `Generated ${
            summaryLevel === 'short'
              ? 'Short Summary'
              : summaryLevel === 'detailed'
                ? 'Detailed Summary'
                : 'Comprehensive Study Notes'
          }`,
          materialType: extraction?.materialType || 'text',
          summaryLevel,
        });
        onActivityRecorded?.();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate summary.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveSummary = async () => {
    if (!summary || !user || !isConfigured) return;
    setSavingSummary(true);
    setErrorMsg(null);
    try {
      await saveStudySummaryRecord({
        userId: user.id,
        materialId: savedMaterialId,
        summary,
      });
      await recordStudyActivity({
        userId: user.id,
        activityType: 'save',
        title: summary.title,
        detail: `Saved to study library (${summary.subjectArea})`,
        materialType: extraction?.materialType || 'text',
        summaryLevel: summary.summaryLevel,
      });
      setSummarySaved(true);
      setNoticeMsg('Summary saved to your library.');
      onActivityRecorded?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save summary.');
    } finally {
      setSavingSummary(false);
    }
  };

  const selectedFileCheck = selectedFile ? validateFile(selectedFile) : null;

  return (
    <div className="space-y-6">
      {!geminiConfigured && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <h3 className="font-display font-semibold select-none">
                AI Provider Configuration Required
              </h3>
              <p className="mt-1 text-xs leading-relaxed">
                The server environment variable <code className="font-mono font-semibold">GEMINI_API_KEY</code> is
                currently missing. Configure <code className="font-mono">GEMINI_API_KEY</code> in{' '}
                <strong>Replit Secrets</strong> (or the <strong>Settings &gt; Secrets</strong> panel) and
                restart the server to enable image OCR, audio transcription, and AI summarization.
                Non-AI features such as saving raw text materials, browsing your library, and theme
                settings remain fully usable.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Input Workspace Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 select-none dark:text-white">
              AI Study Material Summarizer
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Upload a PDF, photo of notes, or lecture audio, or paste study text directly.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Material input mode"
            className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1 select-none dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'file'}
              onClick={() => setInputMode('file')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                inputMode === 'file'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Upload File
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'text'}
              onClick={() => setInputMode('text')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                inputMode === 'text'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Paste Text
            </button>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {noticeMsg && !errorMsg && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>{noticeMsg}</span>
          </div>
        )}

        {inputMode === 'file' ? (
          <div className="mt-5 space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={(e) => handleFileChosen(e.target.files?.[0] || null)}
              className="sr-only"
              id="study-material-file-input"
            />

            {!selectedFile ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors select-none ${
                  isDragging
                    ? 'border-blue-600 bg-blue-50/70 dark:border-cyan-400 dark:bg-blue-950/30'
                    : 'border-slate-300 bg-slate-50/60 hover:border-blue-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-blue-500'
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-cyan-400">
                  <Upload className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mt-3.5 text-sm font-semibold text-slate-900 dark:text-white">
                  Drag and drop your study file here, or click to browse
                </p>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  PDF documents · PNG, JPG, WEBP note images · MP3, WAV, M4A, WEBM, OGG audio · TXT/MD (max 25 MB)
                </p>
              </div>
            ) : (
              <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex min-w-0 items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-cyan-400">
                    {selectedFileCheck?.type === 'pdf' && <FileText className="h-5 w-5" aria-hidden="true" />}
                    {selectedFileCheck?.type === 'image' && <ImageIcon className="h-5 w-5" aria-hidden="true" />}
                    {selectedFileCheck?.type === 'audio' && <FileAudio className="h-5 w-5" aria-hidden="true" />}
                    {selectedFileCheck?.type === 'text' && <Layers className="h-5 w-5" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 select-text dark:text-white">
                      {selectedFile.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums select-none dark:text-slate-400">
                      {selectedFileCheck?.type?.toUpperCase()} · {formatBytes(selectedFile.size)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 select-none">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={extracting}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Replace</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetAll}
                    disabled={extracting}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            )}

            {extracting && (
              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
                <div className="flex items-center justify-between text-xs font-medium text-blue-900 select-none dark:text-blue-200">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {extractionStatus || 'Extracting content...'}
                  </span>
                  <span className="font-mono tabular-nums">{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300 dark:bg-cyan-400"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end select-none">
              <button
                type="button"
                onClick={extractContent}
                disabled={!selectedFile || extracting}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Extracting Content...</span>
                  </>
                ) : (
                  <span>Extract Study Content</span>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="pasted-material-title"
                className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
              >
                Topic or chapter title (optional)
              </label>
              <input
                id="pasted-material-title"
                type="text"
                value={pastedTitle}
                onChange={(e) => setPastedTitle(e.target.value)}
                placeholder="e.g. Lecture 06 — Cellular Respiration & ATP Synthesis"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="pasted-material-body"
                className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
              >
                Paste lecture notes, article excerpts, or study material
              </label>
              <textarea
                id="pasted-material-body"
                rows={7}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste your textbook passage, transcript, or raw notes here..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between gap-4 select-none">
              <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {pastedText.trim() ? pastedText.trim().split(/\s+/).length.toLocaleString() : 0} words
              </span>
              <button
                type="button"
                onClick={extractContent}
                disabled={extracting || pastedText.trim().length < 20}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Preparing Text...</span>
                  </>
                ) : (
                  <span>Prepare Content for Summary</span>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Extracted Content & Summary Configuration */}
      {extraction && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0D162B]">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900 select-none dark:text-white">
                Extracted Study Content
              </h3>
              <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums select-none dark:text-slate-400">
                Method: {extraction.extractionMethod} · {extraction.wordCount.toLocaleString()} words ·{' '}
                {extraction.chunkCount} {extraction.chunkCount === 1 ? 'chunk' : 'chunks'}
                {extraction.pageCount ? ` · ${extraction.pageCount} pages` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={resetAll}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 select-none dark:text-slate-400 dark:hover:text-slate-200"
            >
              Clear Workspace
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="extracted-title"
                className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
              >
                Study Material Title
              </label>
              <input
                id="extracted-title"
                type="text"
                value={editableTitle}
                onChange={(e) => setEditableTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="extracted-text-preview"
                className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
              >
                Extracted Text (inspect, select, or refine before summarizing)
              </label>
              <textarea
                id="extracted-text-preview"
                rows={7}
                value={editableExtractedText}
                onChange={(e) => setEditableExtractedText(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 font-sans text-sm leading-relaxed text-slate-800 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            {/* Summary Mode Selector */}
            <div className="pt-2">
              <p className="mb-2.5 text-xs font-semibold text-slate-700 select-none dark:text-slate-300">
                Select Summary Depth
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(
                  [
                    {
                      id: 'short' as SummaryLevel,
                      title: 'Short Summary',
                      desc: 'Concise overview & essential points',
                    },
                    {
                      id: 'detailed' as SummaryLevel,
                      title: 'Detailed Summary',
                      desc: 'Thorough explanation of key concepts',
                    },
                    {
                      id: 'comprehensive' as SummaryLevel,
                      title: 'Comprehensive Study Notes',
                      desc: 'Extensive academic guide & revision notes',
                    },
                  ] as const
                ).map((opt) => {
                  const active = summaryLevel === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSummaryLevel(opt.id)}
                      className={`rounded-xl border p-3.5 text-left transition-colors select-none ${
                        active
                          ? 'border-blue-600 bg-blue-50/70 dark:border-cyan-400 dark:bg-blue-950/40'
                          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <p
                        className={`font-display text-sm font-semibold ${
                          active
                            ? 'text-blue-800 dark:text-cyan-300'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {opt.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2 select-none">
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={generating || !geminiConfigured}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F1E3D] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Generating Academic Summary...</span>
                  </>
                ) : (
                  <span>Generate Summary</span>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Generated Structured Academic Summary */}
      {summary && (
        <SummaryDisplay
          summary={summary}
          sourceText={editableExtractedText}
          geminiConfigured={geminiConfigured}
          onSave={user && isConfigured ? handleSaveSummary : undefined}
          isSaving={savingSummary}
          isSaved={summarySaved}
          onCreateQuizFromSummary={
            onGenerateQuizFromSummary ? () => onGenerateQuizFromSummary(summary) : undefined
          }
        />
      )}
    </div>
  );
}
