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
  extractErrorFromHttpBody,
  formatClientApiError,
  parseApiJsonResponse,
  resolveApiUrl,
  sanitizeUserErrorMessage,
} from '../lib/apiClient';
import {
  createStudyMaterialRecord,
  getMaterialSignedUrl,
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
import { compressImageFile } from './SnapPhotoControl';
import { SubjectVisualBanner } from './SubjectVisualBanner';
import { SummaryDisplay } from './SummaryDisplay';

interface StudySummarizerProps {
  initialMaterial?: StudyMaterialRecord | null;
  onConsumeInitialMaterial?: () => void;
  geminiConfigured: boolean;
  onActivityRecorded?: () => void;
  onGenerateQuizFromSummary?: (summary: StructuredSummary) => void;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const HOSTED_DIRECT_UPLOAD_LIMIT_BYTES = Math.floor(3.8 * 1024 * 1024);

const ACCEPTED_EXTENSIONS =
  '.pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.mp3,.wav,.m4a,.webm,.ogg,.aac,.flac,.txt,.md';

function inferUploadMimeType(fileName: string, rawType?: string | null): string {
  const cleaned = (rawType || '').split(';')[0].trim().toLowerCase();
  if (cleaned && cleaned !== 'application/octet-stream') {
    return cleaned === 'image/jpg' ? 'image/jpeg' : cleaned;
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

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
  onConsumeInitialMaterial,
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
  const [uploadState, setUploadState] = useState<
    'idle' | 'reading' | 'ready' | 'uploading' | 'extracting' | 'uploaded' | 'error'
  >('idle');
  const [extracting, setExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [editableExtractedText, setEditableExtractedText] = useState('');
  const [editableTitle, setEditableTitle] = useState('');
  const [savedMaterialId, setSavedMaterialId] = useState<string | null>(null);

  const [summaryMode, setSummaryMode] = useState<'ai' | 'extractive'>('ai');
  const [summaryLevel, setSummaryLevel] = useState<SummaryLevel>('detailed');
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState<StructuredSummary | null>(null);
  const [savingSummary, setSavingSummary] = useState(false);
  const [summarySaved, setSummarySaved] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const extractingRef = useRef(false);
  const generatingRef = useRef(false);
  const bufferedBufferRef = useRef<ArrayBuffer | null>(null);
  const stagedStoragePathRef = useRef<string | null>(null);
  const fileSelectionSeqRef = useRef(0);

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
      setUploadState('uploaded');
      setSummary(null);
      setSummarySaved(false);
      setErrorMsg(null);
      setNoticeMsg(`Loaded "${initialMaterial.title}" from your uploaded materials.`);
      onConsumeInitialMaterial?.();
    }
  }, [initialMaterial, onConsumeInitialMaterial]);

  const resetAll = () => {
    fileSelectionSeqRef.current += 1;
    bufferedBufferRef.current = null;
    stagedStoragePathRef.current = null;
    setSelectedFile(null);
    setPastedTitle('');
    setPastedText('');
    setUploadProgress(0);
    setUploadState('idle');
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

  const handleFileChosen = async (file: File | null) => {
    if (!file) return;
    const seq = ++fileSelectionSeqRef.current;
    bufferedBufferRef.current = null;
    stagedStoragePathRef.current = null;
    setErrorMsg(null);
    setNoticeMsg(null);
    setExtraction(null);
    setEditableExtractedText('');
    setEditableTitle('');
    setSavedMaterialId(null);
    setSummary(null);
    setSummarySaved(false);
    setUploadProgress(0);

    const check = validateFile(file);
    if (!check.valid) {
      setSelectedFile(null);
      setUploadState('error');
      setErrorMsg(check.error || 'Unsupported file.');
      return;
    }
    if (file.size === 0) {
      setSelectedFile(null);
      setUploadState('error');
      setErrorMsg(`"${file.name}" is empty (0 bytes). Please choose a valid study document.`);
      return;
    }

    setUploadState('reading');
    setSelectedFile(file);

    try {
      // Materialize file bytes immediately while mobile content:// URI picker permissions are fresh
      const buffer = await file.arrayBuffer();
      if (seq !== fileSelectionSeqRef.current) return;

      if (buffer.byteLength === 0) {
        setSelectedFile(null);
        setUploadState('error');
        setErrorMsg(`"${file.name}" appears empty (0 bytes) and cannot be uploaded.`);
        return;
      }

      const resolvedMime = inferUploadMimeType(file.name, file.type);
      const materializedFile = new File([buffer], file.name, {
        type: resolvedMime,
        lastModified: file.lastModified || Date.now(),
      });

      bufferedBufferRef.current = buffer;
      setSelectedFile(materializedFile);
      setUploadState('ready');
    } catch {
      if (seq !== fileSelectionSeqRef.current) return;
      bufferedBufferRef.current = null;
      setSelectedFile(null);
      setUploadState('error');
      setErrorMsg(
        `Unable to read "${file.name}" from your device storage. On mobile, save or download the file locally first, then re-select it.`
      );
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setInputMode('file');
      void handleFileChosen(file);
    }
  };

  const uploadViaFetchFallback = async (formData: FormData): Promise<ExtractionResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(resolveApiUrl('/api/materials/extract'), {
        method: 'POST',
        body: formData,
        cache: 'no-store',
        signal: controller.signal,
      });
      setUploadProgress(95);
      return await parseApiJsonResponse<ExtractionResult>(
        res,
        'extracting study content from your file'
      );
    } finally {
      clearTimeout(timer);
    }
  };

  const uploadDirectWithXhrAndFallback = async (uploadFile: File): Promise<ExtractionResult> => {
    const buildFormData = () => {
      const fd = new FormData();
      fd.append('file', uploadFile, uploadFile.name);
      if (editableTitle.trim()) {
        fd.append('title', editableTitle.trim());
      }
      return fd;
    };

    try {
      return await new Promise<ExtractionResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', resolveApiUrl('/api/materials/extract'));
        xhr.timeout = 120000;
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            const pct = Math.min(55, Math.max(10, Math.round((evt.loaded / evt.total) * 55)));
            setUploadProgress(pct);
          }
        };
        xhr.onload = () => {
          setUploadProgress(95);
          const contentType = xhr.getResponseHeader('content-type') || '';
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              resolve(json as ExtractionResult);
            } catch {
              reject(
                new Error("We couldn't process your study material. Please try again.")
              );
            }
          } else {
            reject(
              Object.assign(
                new Error(
                  extractErrorFromHttpBody(
                    xhr.status,
                    xhr.responseText || '',
                    contentType,
                    'extracting study content from your file'
                  )
                ),
                { isHttpError: true }
              )
            );
          }
        };
        xhr.onerror = () =>
          reject(
            Object.assign(
              new Error(
                'Network connection error. Please check your internet connection and try again.'
              ),
              { isTransportError: true }
            )
          );
        xhr.ontimeout = () =>
          reject(
            new Error(
              'Processing your study material took too long. Please try a smaller file or split long documents.'
            )
          );
        xhr.send(buildFormData());
      });
    } catch (xhrErr: unknown) {
      if (!(xhrErr as { isTransportError?: boolean })?.isTransportError) {
        throw xhrErr;
      }
      // Mobile HTTP/2 idle-socket or XHR drop recovery: retry once via fresh fetch()
      await new Promise((r) => setTimeout(r, 650));
      setUploadProgress(25);
      return uploadViaFetchFallback(buildFormData());
    }
  };

  const extractContent = async () => {
    if (extractingRef.current) return;
    if (inputMode === 'file' && uploadState === 'reading') {
      setErrorMsg('Please wait a moment while your file finishes loading from device storage.');
      return;
    }

    setErrorMsg(null);
    setNoticeMsg(null);
    setExtraction(null);
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

    extractingRef.current = true;
    setExtracting(true);
    setUploadState('uploading');
    setUploadProgress(10);

    try {
      let result: ExtractionResult;
      let preUploadedStoragePath: string | null = stagedStoragePathRef.current;

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
        setExtractionStatus('Preparing file for upload...');

        // Ensure we have an in-memory File & ArrayBuffer even if selectedFile came from compression
        let uploadFile = selectedFile;
        let uploadBuffer = bufferedBufferRef.current;

        if (fileCheck.type === 'image') {
          uploadFile = await compressImageFile(selectedFile);
          uploadBuffer = await uploadFile.arrayBuffer();
        } else if (!uploadBuffer) {
          try {
            uploadBuffer = await selectedFile.arrayBuffer();
            const resolvedMime = inferUploadMimeType(selectedFile.name, selectedFile.type);
            uploadFile = new File([uploadBuffer], selectedFile.name, {
              type: resolvedMime,
              lastModified: selectedFile.lastModified || Date.now(),
            });
            bufferedBufferRef.current = uploadBuffer;
          } catch {
            throw new Error(
              `Unable to read "${selectedFile.name}" from your device. Please re-select the file and try again.`
            );
          }
        }

        const isLocalOrigin =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname === '[::1]';

        if (!isLocalOrigin && uploadFile.size > HOSTED_DIRECT_UPLOAD_LIMIT_BYTES) {
          if (!user || !isConfigured) {
            throw new Error(
              `Files larger than 3.8 MB require signing in to your Brainstine account (file is ${formatBytes(uploadFile.size)}). Please sign in to upload files up to 25 MB, or choose a smaller file.`
            );
          }

          if (!preUploadedStoragePath) {
            setExtractionStatus('Uploading large file for processing...');
            setUploadProgress(15);
            preUploadedStoragePath = await uploadMaterialFileToStorage(user.id, uploadFile, {
              preBuffered: uploadBuffer,
              onProgress: (pct) => {
                setUploadProgress(15 + Math.round(pct * 0.45));
              },
            });
            stagedStoragePathRef.current = preUploadedStoragePath;
          }

          setUploadProgress(62);
          setUploadState('extracting');
          const signedStorageUrl = await getMaterialSignedUrl(preUploadedStoragePath);
          setExtractionStatus(typeLabel);
          setUploadProgress(70);

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 120000);
          try {
            const extractRes = await fetch(resolveApiUrl('/api/materials/extract'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              cache: 'no-store',
              signal: controller.signal,
              body: JSON.stringify({
                signedStorageUrl,
                fileName: uploadFile.name,
                mimeType: uploadFile.type,
                fileSizeBytes: uploadFile.size,
                ...(editableTitle.trim() ? { title: editableTitle.trim() } : {}),
              }),
            });
            setUploadProgress(95);
            result = await parseApiJsonResponse<ExtractionResult>(
              extractRes,
              'extracting study content from your file'
            );
          } catch (extractErr) {
            // Reset staged path on failure so a subsequent retry can re-upload cleanly
            stagedStoragePathRef.current = null;
            throw extractErr;
          } finally {
            clearTimeout(timer);
          }
        } else {
          setExtractionStatus(typeLabel);
          setUploadState('extracting');
          result = await uploadDirectWithXhrAndFallback(uploadFile);
        }
      } else {
        setUploadState('extracting');
        setExtractionStatus('Chunking and indexing pasted study text...');
        setUploadProgress(50);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 75000);
        try {
          const res = await fetch(resolveApiUrl('/api/materials/extract'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              text: pastedText.trim(),
              title: pastedTitle.trim() || 'Pasted Study Notes',
            }),
          });
          result = await parseApiJsonResponse<ExtractionResult>(
            res,
            'processing your pasted study notes'
          );
        } finally {
          clearTimeout(timer);
        }
      }

      setUploadProgress(100);
      setUploadState('uploaded');
      setExtraction(result);
      setEditableExtractedText(result.extractedText);
      setEditableTitle(result.title);

      if (user && isConfigured) {
        try {
          setExtractionStatus('Saving material to your study library...');
          let storagePath: string | null = preUploadedStoragePath;
          if (!storagePath && inputMode === 'file' && selectedFile) {
            storagePath = await uploadMaterialFileToStorage(user.id, selectedFile, {
              preBuffered: bufferedBufferRef.current ?? undefined,
            });
            stagedStoragePathRef.current = storagePath;
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
          setNoticeMsg(
            `Content extracted, but your study library could not sync right now: ${sanitizeUserErrorMessage(
              storageErr,
              'saving your study material'
            )}`
          );
        }
      }
    } catch (err: unknown) {
      setUploadState('error');
      setExtraction(null);
      setErrorMsg(
        formatClientApiError(
          err,
          'extracting study content',
          'Content extraction timed out. Please try again.'
        )
      );
      setUploadProgress(0);
    } finally {
      extractingRef.current = false;
      setExtracting(false);
      setExtractionStatus('');
    }
  };

  const handleGenerateSummary = async () => {
    if (generatingRef.current) return;
    setErrorMsg(null);
    setNoticeMsg(null);

    if (summaryMode === 'ai' && !geminiConfigured) {
      setErrorMsg(
        'AI Summary is temporarily unavailable. Switch to Extractive Summary below to summarize directly from your study text.'
      );
      return;
    }

    const sourceText = editableExtractedText.trim();
    if (sourceText.length < 20) {
      setErrorMsg('Extracted content is too short or unreadable. Please provide at least 20 characters.');
      return;
    }

    generatingRef.current = true;
    setGenerating(true);
    setSummarySaved(false);

    const endpoint =
      summaryMode === 'extractive' ? '/api/summaries/extractive' : '/api/summaries/generate';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150000);
    try {
      const res = await fetch(resolveApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          extractedText: sourceText,
          title: editableTitle.trim() || extraction?.title || 'Study Material',
          materialType: extraction?.materialType || 'text',
          summaryLevel,
        }),
      });
      const generatedRaw = await parseApiJsonResponse<StructuredSummary>(
        res,
        'generating your study summary'
      );
      const generated: StructuredSummary = {
        ...generatedRaw,
        generationMode: generatedRaw.generationMode ?? summaryMode,
      };
      setSummary(generated);

      if (user && isConfigured) {
        try {
          await saveStudySummaryRecord({
            userId: user.id,
            materialId: savedMaterialId,
            summary: generated,
          });
          setSummarySaved(true);
          setNoticeMsg(
            `${
              summaryMode === 'extractive' ? 'Extractive Summary' : 'AI Summary'
            } generated and automatically saved to your Academic History.`
          );
        } catch (autoSaveErr) {
          console.warn('Automatic summary save warning:', autoSaveErr);
          setNoticeMsg(
            'Summary generated, but automatic cloud save encountered an issue. Click Save Summary to retry.'
          );
        }

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
          } (${summaryMode === 'extractive' ? 'Extractive' : 'AI'})`,
          materialType: extraction?.materialType || 'text',
          summaryLevel,
        });
        onActivityRecorded?.();
      }
    } catch (err: unknown) {
      setErrorMsg(
        formatClientApiError(
          err,
          'generating your study summary',
          'Summary generation timed out while waiting for the AI service. Please try again or use Extractive Summary.'
        )
      );
    } finally {
      clearTimeout(timer);
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  const handleSaveSummary = async () => {
    if (!summary || !user || !isConfigured || summarySaved || savingSummary) return;
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
      setErrorMsg(sanitizeUserErrorMessage(err, 'saving your summary'));
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
                AI Summarization Temporarily Unavailable — Extractive Summary Ready
              </h3>
              <p className="mt-1 text-xs leading-relaxed">
                AI Summary, image OCR, and audio transcription are temporarily unavailable right now.
                You can still extract PDF or pasted text and select <strong>Extractive Summary</strong>{' '}
                below to build grounded key points, definitions, terminology, and page references.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Input Workspace Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
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
            className="flex w-full items-center rounded-xl border border-slate-200 bg-slate-100 p-1 select-none sm:inline-flex sm:w-auto dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'file'}
              onClick={() => setInputMode('file')}
              className={`min-h-10 sm:min-h-9 flex-1 sm:flex-initial justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
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
              className={`min-h-10 sm:min-h-9 flex-1 sm:flex-initial justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                inputMode === 'text'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Paste Text
            </button>
          </div>
        </div>

        <SubjectVisualBanner
          visualKey="summarizer"
          variant="compact"
          title="Digital Textbook Synthesis Engine"
          subtitle="Structured chapters, definitions, comparison tables, and interactive schematics from your course notes."
          className="mt-5"
        />

        {errorMsg && (
          <div
            role="alert"
            className="mt-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
              <span className="break-words">{errorMsg}</span>
            </div>
            {inputMode === 'file' && selectedFile && uploadState === 'error' && !extracting && (
              <button
                type="button"
                onClick={extractContent}
                className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/60"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Retry Upload</span>
              </button>
            )}
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
              onChange={(e) => {
                void handleFileChosen(e.target.files?.[0] || null);
              }}
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
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors select-none sm:px-6 sm:py-10 ${
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
                      {' · '}
                      <span
                        className={
                          uploadState === 'uploaded'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : uploadState === 'error'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-blue-600 dark:text-cyan-400'
                        }
                      >
                        {uploadState === 'reading'
                          ? 'Loading file...'
                          : uploadState === 'uploading'
                            ? `Uploading ${uploadProgress}%`
                            : uploadState === 'extracting'
                              ? 'Extracting...'
                              : uploadState === 'uploaded'
                                ? 'Uploaded & extracted'
                                : uploadState === 'error'
                                  ? 'Upload failed'
                                  : 'Ready to upload'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 select-none">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={extracting || uploadState === 'reading'}
                    className="inline-flex min-h-10 sm:min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Replace</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetAll}
                    disabled={extracting}
                    className="inline-flex min-h-10 sm:min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-red-400 dark:hover:bg-red-950/30"
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
                disabled={!selectedFile || extracting || uploadState === 'reading'}
                className="inline-flex min-h-11 w-full justify-center sm:w-auto items-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Extracting Content...</span>
                  </>
                ) : uploadState === 'reading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Loading File...</span>
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

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between select-none">
              <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {pastedText.trim() ? pastedText.trim().split(/\s+/).length.toLocaleString() : 0} words
              </span>
              <button
                type="button"
                onClick={extractContent}
                disabled={extracting || pastedText.trim().length < 20}
                className="inline-flex min-h-11 w-full justify-center sm:w-auto items-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
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
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
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

            {/* Summary Mode Selector (AI Summary vs Extractive Summary) */}
            <div className="pt-2">
              <p className="mb-2.5 text-xs font-semibold text-slate-700 select-none dark:text-slate-300">
                Select Summary Mode
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      id: 'ai' as const,
                      title: 'AI Summary',
                      desc: 'AI-synthesized explanations, examples, diagrams & structured notes',
                    },
                    {
                      id: 'extractive' as const,
                      title: 'Extractive Summary',
                      desc: 'Direct document sentences, definitions, terminology & page citations (works without AI)',
                    },
                  ] as const
                ).map((opt) => {
                  const active = summaryMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSummaryMode(opt.id)}
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

            {/* Summary Depth Selector */}
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
                disabled={generating || (summaryMode === 'ai' && !geminiConfigured)}
                className="inline-flex min-h-11 w-full justify-center sm:w-auto items-center gap-2 rounded-xl bg-[#0F1E3D] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>
                      {summaryMode === 'extractive'
                        ? 'Building Extractive Summary...'
                        : 'Generating AI Summary...'}
                    </span>
                  </>
                ) : (
                  <span>
                    {summaryMode === 'extractive'
                      ? 'Generate Extractive Summary'
                      : 'Generate AI Summary'}
                  </span>
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
