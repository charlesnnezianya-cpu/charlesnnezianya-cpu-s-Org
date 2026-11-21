import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  ImagePlus,
  RefreshCw,
  SwitchCamera,
  Trash2,
  X,
} from 'lucide-react';
import type { ImageActionType, SnapImageAttachment } from '../types/brainstine';

export const IMAGE_ACTIONS: {
  id: ImageActionType;
  label: string;
  defaultPrompt: string;
}[] = [
  {
    id: 'explain',
    label: 'Explain this',
    defaultPrompt: 'Please explain everything shown in this image clearly.',
  },
  {
    id: 'solve',
    label: 'Solve this question',
    defaultPrompt: 'Please solve the question shown in this image step by step.',
  },
  {
    id: 'summarize_page',
    label: 'Summarize this page',
    defaultPrompt: 'Please summarize this textbook or note page into structured key points.',
  },
  {
    id: 'explain_diagram',
    label: 'Explain this diagram',
    defaultPrompt: 'Please explain this diagram, its labels, and how the parts relate.',
  },
  {
    id: 'key_points',
    label: 'Identify key points',
    defaultPrompt: 'Please identify the most important facts, definitions, and takeaways in this image.',
  },
  {
    id: 'generate_questions',
    label: 'Generate questions',
    defaultPrompt: 'Please generate practice questions based on the material in this image.',
  },
  {
    id: 'teach_topic',
    label: 'Teach me this topic',
    defaultPrompt: 'Please teach me the topic shown in this image step by step.',
  },
];

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const TARGET_UPLOAD_IMAGE_BYTES = 1.3 * 1024 * 1024;

export async function compressImageFile(
  file: File,
  maxDimension = 1800,
  targetBytes = TARGET_UPLOAD_IMAGE_BYTES
): Promise<File> {
  if (file.size <= targetBytes) return file;

  const mime = (file.type || '').toLowerCase();
  const outputMime = mime === 'image/webp' ? 'image/webp' : 'image/jpeg';

  return new Promise<File>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height, 1));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob || blob.size >= file.size) {
              resolve(file);
              return;
            }
            const ext = outputMime === 'image/webp' ? 'webp' : 'jpg';
            const baseName = file.name ? file.name.replace(/\.[^.]+$/, '') : 'study-image';
            resolve(
              new File([blob], `${baseName}.${ext}`, {
                type: outputMime,
                lastModified: Date.now(),
              })
            );
          },
          outputMime,
          0.86
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Unable to read the selected image file.'));
    reader.readAsDataURL(file);
  });
}

export async function fileToSnapAttachment(file: File): Promise<SnapImageAttachment> {
  let mime = (file.type || '').toLowerCase();
  if (!mime && file.name) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mime = 'image/jpeg';
    else if (lowerName.endsWith('.png')) mime = 'image/png';
    else if (lowerName.endsWith('.webp')) mime = 'image/webp';
  }
  if (!ACCEPTED_IMAGE_TYPES.has(mime)) {
    throw new Error(
      'Unsupported image format. Please choose a JPG, JPEG, PNG, or WEBP image.'
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the 15 MB limit. Please upload a smaller photo.');
  }

  const processedFile = await compressImageFile(file);
  const processedMime = (processedFile.type || mime).toLowerCase();
  const base64 = await readFileAsBase64(processedFile);
  const normalizedMime = processedMime === 'image/jpg' ? 'image/jpeg' : processedMime;
  const previewUrl = `data:${normalizedMime};base64,${base64}`;
  return {
    file: processedFile,
    base64,
    mimeType: normalizedMime,
    previewUrl,
    fileName: processedFile.name || `study-snap-${Date.now()}.jpg`,
    fileSizeBytes: processedFile.size,
  };
}

interface SnapTriggerButtonsProps {
  disabled?: boolean;
  onImageSelected: (attachment: SnapImageAttachment) => void;
  onError: (message: string) => void;
}

export function SnapTriggerButtons({
  disabled,
  onImageSelected,
  onError,
}: SnapTriggerButtonsProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [startingCamera, setStartingCamera] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = useCallback(
    async (mode: 'environment' | 'user') => {
      stopCameraStream();
      setCameraError(null);
      setStartingCamera(true);
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            'Live webcam capture is unavailable in this browser context. Use the Upload Image button or native device camera option below.'
          );
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1600 }, height: { ideal: 1200 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Camera access was denied or no camera was detected.';
        setCameraError(msg);
      } finally {
        setStartingCamera(false);
      }
    },
    [stopCameraStream]
  );

  useEffect(() => {
    if (cameraOpen) {
      startCameraStream(facingMode);
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [cameraOpen, facingMode, startCameraStream, stopCameraStream]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const attachment = await fileToSnapAttachment(file);
      onImageSelected(attachment);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const handleCapturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('Camera stream is not ready yet. Please wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setCameraError('Failed to capture frame from camera.');
          return;
        }
        const capturedFile = new File([blob], `camera-snap-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        try {
          const attachment = await fileToSnapAttachment(capturedFile);
          setCameraOpen(false);
          onImageSelected(attachment);
        } catch (err: unknown) {
          setCameraError(
            err instanceof Error ? err.message : 'Unable to process captured photo.'
          );
        }
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <>
      <div className="flex items-center gap-1.5 select-none">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setCameraOpen(true)}
          title="Snap a photo with camera"
          aria-label="Snap a photo with camera"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Camera className="h-4 w-4 text-blue-600 dark:text-cyan-400" aria-hidden="true" />
          <span className="hidden sm:inline">Snap Photo</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => uploadInputRef.current?.click()}
          title="Upload image (JPG, PNG, WEBP)"
          aria-label="Upload image"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ImagePlus className="h-4 w-4 text-blue-600 dark:text-cyan-400" aria-hidden="true" />
          <span className="hidden sm:inline">Upload Image</span>
        </button>

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={handleFileInput}
        />
        <input
          ref={mobileCameraInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {cameraOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Snap a photo"
        >
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0D162B]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 select-none dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-blue-600 dark:text-cyan-400" aria-hidden="true" />
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Snap Study Material Photo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCameraOpen(false)}
                aria-label="Close camera"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              {cameraError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-semibold">Camera unavailable or permission declined</p>
                  <p className="mt-1">{cameraError}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => mobileCameraInputRef.current?.click()}
                      className="rounded-lg bg-[#0F1E3D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#192F5D] dark:bg-blue-600"
                    >
                      Use Device Camera / File Picker
                    </button>
                    <button
                      type="button"
                      onClick={() => startCameraStream(facingMode)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      Retry Camera
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-slate-950">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                  {startingCamera && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-xs font-medium text-white">
                      Starting camera...
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 select-none">
                <button
                  type="button"
                  onClick={() =>
                    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <SwitchCamera className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Flip Camera</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCameraOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  {!cameraError && (
                    <button
                      type="button"
                      disabled={startingCamera}
                      onClick={handleCapturePhoto}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#192F5D] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Capture Photo</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface SnapAttachmentPreviewProps {
  attachment: SnapImageAttachment;
  isPersistedContext?: boolean;
  disabled?: boolean;
  onReplace: (attachment: SnapImageAttachment) => void;
  onRemove: () => void;
  onQuickAction: (action: ImageActionType, defaultPrompt: string) => void;
  onError: (message: string) => void;
  showTutorHandoff?: boolean;
  onHandoffToTutor?: () => void;
}

export function SnapAttachmentPreview({
  attachment,
  isPersistedContext = false,
  disabled = false,
  onReplace,
  onRemove,
  onQuickAction,
  onError,
  showTutorHandoff = false,
  onHandoffToTutor,
}: SnapAttachmentPreviewProps) {
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const next = await fileToSnapAttachment(file);
      onReplace(next);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Unable to replace image.');
    }
  };

  const sizeKb = Math.max(1, Math.round(attachment.fileSizeBytes / 1024));

  return (
    <div className="mb-3 rounded-xl border border-blue-200/80 bg-blue-50/50 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={attachment.previewUrl}
            alt={attachment.fileName}
            className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
              {attachment.fileName}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {attachment.mimeType.replace('image/', '').toUpperCase()} · {sizeKb.toLocaleString()} KB
              {isPersistedContext ? ' · Active image context for follow-ups' : ' · Ready to analyze'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 select-none">
          <button
            type="button"
            disabled={disabled}
            onClick={() => replaceInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            <span>Replace</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            <span>Remove</span>
          </button>
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={handleReplace}
          />
        </div>
      </div>

      {/* 7 Dedicated Image Action Buttons */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-blue-200/70 pt-2.5 select-none dark:border-blue-900/50">
        <span className="mr-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          Image Actions:
        </span>
        {IMAGE_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (action.id === 'teach_topic' && showTutorHandoff && onHandoffToTutor) {
                onHandoffToTutor();
              } else {
                onQuickAction(action.id, action.defaultPrompt);
              }
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-500 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
