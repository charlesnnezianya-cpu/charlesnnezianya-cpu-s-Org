import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  AiMessageRecord,
  AiSessionRecord,
  AiSessionType,
  MaterialSourceType,
  QuizAttemptRecord,
  QuizDifficulty,
  QuizFormat,
  QuizGradingResponse,
  QuizQuestion,
  QuizRecord,
  QuizSourceMode,
  SnapImageAttachment,
  StructuredSummary,
  StudentAnswer,
  StudyActivityRecord,
  StudyMaterialRecord,
  StudySummaryRecord,
  SummaryLevel,
  ThemeMode,
  TutorMode,
  UserProfile,
} from '../types/brainstine';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-id') &&
    !supabaseAnonKey.includes('your-supabase-anon-key')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment Secrets to enable authentication and cloud persistence.'
    );
  }
  return supabase;
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile:', error.message);
    return null;
  }
  return data as UserProfile | null;
}

export async function upsertUserProfile(profile: {
  id: string;
  email: string;
  display_name: string;
  theme_preference?: ThemeMode;
}): Promise<UserProfile> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .upsert(
      {
        id: profile.id,
        email: profile.email,
        display_name: profile.display_name,
        ...(profile.theme_preference ? { theme_preference: profile.theme_preference } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data as UserProfile;
}

function inferStorageMimeType(fileName: string, rawType?: string | null): string {
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

async function resolveFreshAccessToken(
  client: SupabaseClient,
  expectedUserId: string
): Promise<string> {
  const { data: sessionData, error: sessionErr } = await client.auth.getSession();
  if (sessionErr) {
    throw new Error(`Authentication check failed: ${sessionErr.message}`);
  }

  let activeSession = sessionData.session;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = activeSession?.expires_at ?? 0;

  if (!activeSession || !activeSession.access_token || (expiresAt > 0 && expiresAt - nowSeconds < 60)) {
    const { data: refreshed, error: refreshErr } = await client.auth.refreshSession();
    if (refreshErr || !refreshed.session?.access_token) {
      throw new Error(
        'Your sign-in session expired. Please sign in again before uploading study files.'
      );
    }
    activeSession = refreshed.session;
  }

  if (activeSession.user?.id && activeSession.user.id !== expectedUserId) {
    throw new Error('Your active account changed. Please refresh and sign in again.');
  }

  return activeSession.access_token;
}

function encodeStorageObjectPath(storagePath: string): string {
  return storagePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function uploadBufferToStudyMaterialsBucket(params: {
  client: SupabaseClient;
  userId: string;
  storagePath: string;
  buffer: ArrayBuffer;
  contentType: string;
  onProgress?: (percent: number) => void;
}): Promise<string> {
  const { client, userId, storagePath, buffer, contentType, onProgress } = params;
  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const encodedPath = encodeStorageObjectPath(storagePath);
  const uploadUrl = `${baseUrl}/storage/v1/object/study-materials/${encodedPath}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const accessToken = await resolveFreshAccessToken(client, userId);

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.timeout = 120000;
        xhr.setRequestHeader('apikey', supabaseAnonKey);
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.setRequestHeader('cache-control', 'max-age=3600');
        xhr.setRequestHeader('Content-Type', contentType);

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            onProgress?.(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100);
            resolve();
            return;
          }

          let serverMsg = '';
          try {
            const parsed = JSON.parse(xhr.responseText || '{}') as {
              message?: string;
              error?: string;
            };
            serverMsg = (parsed.message || parsed.error || '').trim();
          } catch {
            serverMsg = (xhr.responseText || '').trim().slice(0, 200);
          }

          if (xhr.status === 401 || xhr.status === 403) {
            reject(
              Object.assign(
                new Error(
                  `Storage upload failed (${xhr.status}): ${serverMsg || 'Permission denied by storage security policy. Please sign out and sign back in.'}`
                ),
                { retryable: false }
              )
            );
            return;
          }
          if (xhr.status === 404) {
            reject(
              Object.assign(
                new Error(
                  'Storage upload failed: The "study-materials" storage bucket was not found in Supabase.'
                ),
                { retryable: false }
              )
            );
            return;
          }
          if (xhr.status === 413) {
            reject(
              Object.assign(
                new Error(
                  'Storage upload failed: This file exceeds the Supabase Storage bucket file size limit.'
                ),
                { retryable: false }
              )
            );
            return;
          }

          reject(
            Object.assign(
              new Error(
                `Storage upload failed (HTTP ${xhr.status}): ${serverMsg || 'Unexpected storage server response.'}`
              ),
              { retryable: xhr.status >= 500 || xhr.status === 429 }
            )
          );
        };

        xhr.onerror = () => {
          reject(
            Object.assign(
              new Error(
                'Storage upload failed: Network or connection drop while sending the file to cloud storage.'
              ),
              { retryable: true }
            )
          );
        };

        xhr.ontimeout = () => {
          reject(
            Object.assign(
              new Error(
                'Storage upload failed: Timed out while uploading file to cloud storage. Check your connection speed and try again.'
              ),
              { retryable: true }
            )
          );
        };

        xhr.send(buffer);
      });

      return storagePath;
    } catch (err: unknown) {
      const retryable = Boolean((err as { retryable?: boolean })?.retryable);
      lastError = err instanceof Error ? err : new Error('Storage upload failed.');
      if (!retryable || attempt >= 2) {
        throw lastError;
      }
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }

  throw lastError || new Error('Storage upload failed.');
}

export async function uploadMaterialFileToStorage(
  userId: string,
  file: File,
  options?: { onProgress?: (percent: number) => void; preBuffered?: ArrayBuffer }
): Promise<string> {
  const client = requireSupabase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${Date.now()}-${safeName}`;
  const contentType = inferStorageMimeType(file.name, file.type);

  let buffer: ArrayBuffer;
  try {
    buffer = options?.preBuffered ?? (await file.arrayBuffer());
  } catch {
    throw new Error(
      `Unable to read "${file.name}" from your device storage. Please re-select the file and try again.`
    );
  }

  if (buffer.byteLength === 0) {
    throw new Error(`"${file.name}" is empty (0 bytes) and cannot be uploaded.`);
  }

  return uploadBufferToStudyMaterialsBucket({
    client,
    userId,
    storagePath,
    buffer,
    contentType,
    onProgress: options?.onProgress,
  });
}

export async function getMaterialSignedUrl(storagePath: string): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.storage
    .from('study-materials')
    .createSignedUrl(storagePath, 300);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Unable to generate download link.');
  }
  return data.signedUrl;
}

export async function createStudyMaterialRecord(input: {
  userId: string;
  title: string;
  materialType: MaterialSourceType;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  storagePath: string | null;
  extractedText: string;
  wordCount: number;
  chunkCount: number;
}): Promise<StudyMaterialRecord> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('study_materials')
    .insert({
      user_id: input.userId,
      title: input.title,
      material_type: input.materialType,
      file_name: input.fileName,
      file_size: input.fileSize,
      mime_type: input.mimeType,
      storage_path: input.storagePath,
      extracted_text: input.extractedText,
      word_count: input.wordCount,
      chunk_count: input.chunkCount,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save material record: ${error.message}`);
  }
  return data as StudyMaterialRecord;
}

export async function listStudyMaterials(userId: string): Promise<StudyMaterialRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('study_materials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load materials: ${error.message}`);
  }
  return (data ?? []) as StudyMaterialRecord[];
}

export async function deleteStudyMaterial(
  userId: string,
  materialId: string,
  storagePath: string | null
): Promise<void> {
  const client = requireSupabase();
  if (storagePath) {
    await client.storage.from('study-materials').remove([storagePath]);
  }
  const { error } = await client
    .from('study_materials')
    .delete()
    .eq('id', materialId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete material: ${error.message}`);
  }
}

export async function saveStudySummaryRecord(input: {
  userId: string;
  materialId: string | null;
  summary: StructuredSummary;
}): Promise<StudySummaryRecord> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('study_summaries')
    .insert({
      user_id: input.userId,
      material_id: input.materialId,
      title: input.summary.title,
      subject_area: input.summary.subjectArea,
      summary_level: input.summary.summaryLevel,
      structured_content: input.summary,
      markdown_content: input.summary.markdown,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save summary: ${error.message}`);
  }
  return data as StudySummaryRecord;
}

export async function listStudySummaries(userId: string): Promise<StudySummaryRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('study_summaries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load summaries: ${error.message}`);
  }
  return (data ?? []) as StudySummaryRecord[];
}

export async function renameStudySummary(
  userId: string,
  summaryId: string,
  newTitle: string
): Promise<StudySummaryRecord> {
  const client = requireSupabase();
  const cleanTitle = newTitle.trim();
  if (!cleanTitle) {
    throw new Error('Summary title cannot be empty.');
  }

  const { data: existing, error: fetchError } = await client
    .from('study_summaries')
    .select('*')
    .eq('id', summaryId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message || 'Summary not found.');
  }

  const prevStructured = (existing.structured_content || {}) as StructuredSummary;
  const updatedStructured: StructuredSummary = {
    ...prevStructured,
    title: cleanTitle,
  };

  const { data, error } = await client
    .from('study_summaries')
    .update({
      title: cleanTitle,
      structured_content: updatedStructured,
      updated_at: new Date().toISOString(),
    })
    .eq('id', summaryId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to rename summary: ${error.message}`);
  }
  return data as StudySummaryRecord;
}

export async function deleteStudySummary(userId: string, summaryId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('study_summaries')
    .delete()
    .eq('id', summaryId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete summary: ${error.message}`);
  }
}

export async function recordStudyActivity(input: {
  userId: string;
  activityType: 'upload' | 'extract' | 'summarize' | 'save' | 'quiz' | 'chat' | 'tutor';
  title: string;
  detail: string;
  materialType: MaterialSourceType;
  summaryLevel?: SummaryLevel | null;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('study_activities').insert({
    user_id: input.userId,
    activity_type: input.activityType,
    title: input.title,
    detail: input.detail,
    material_type: input.materialType,
    summary_level: input.summaryLevel ?? null,
  });

  if (error) {
    console.warn('Activity log insert warning:', error.message);
  }
}

export async function listStudyActivities(
  userId: string,
  limit = 12
): Promise<StudyActivityRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('study_activities')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load study activities: ${error.message}`);
  }
  return (data ?? []) as StudyActivityRecord[];
}

export async function saveQuizRecord(input: {
  userId: string;
  title: string;
  subjectArea: string;
  sourceMode: QuizSourceMode;
  materialId: string | null;
  summaryId: string | null;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  questionCount: number;
  timeLimitMinutes: number | null;
  questions: QuizQuestion[];
}): Promise<QuizRecord> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('quizzes')
    .insert({
      user_id: input.userId,
      title: input.title,
      subject_area: input.subjectArea,
      source_mode: input.sourceMode,
      material_id: input.materialId,
      summary_id: input.summaryId,
      format: input.format,
      difficulty: input.difficulty,
      question_count: input.questionCount,
      time_limit_minutes: input.timeLimitMinutes,
      questions: input.questions,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save quiz: ${error.message}`);
  }
  return data as QuizRecord;
}

export async function listQuizzes(userId: string): Promise<QuizRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('quizzes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load quizzes: ${error.message}`);
  }
  return (data ?? []) as QuizRecord[];
}

export async function deleteQuiz(userId: string, quizId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('quizzes')
    .delete()
    .eq('id', quizId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete quiz: ${error.message}`);
  }
}

export async function saveQuizAttemptRecord(input: {
  userId: string;
  quizId: string | null;
  title: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  answers: StudentAnswer[];
  grading: QuizGradingResponse;
}): Promise<QuizAttemptRecord> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('quiz_attempts')
    .insert({
      user_id: input.userId,
      quiz_id: input.quizId,
      title: input.title,
      format: input.format,
      difficulty: input.difficulty,
      total_questions: input.grading.totalQuestions,
      correct_count: input.grading.correctCount,
      incorrect_count: input.grading.incorrectCount,
      unanswered_count: input.grading.unansweredCount,
      earned_marks: input.grading.earnedMarks,
      max_marks: input.grading.maxMarks,
      percentage: input.grading.percentage,
      time_taken_seconds: input.grading.timeTakenSeconds,
      answers: input.answers,
      graded_results: input.grading.gradedResults,
      performance_summary: input.grading.performanceAssessment,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save quiz attempt: ${error.message}`);
  }
  return data as QuizAttemptRecord;
}

export async function listQuizAttempts(userId: string): Promise<QuizAttemptRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('quiz_attempts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load quiz attempts: ${error.message}`);
  }
  return (data ?? []) as QuizAttemptRecord[];
}

export async function deleteQuizAttempt(userId: string, attemptId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('quiz_attempts')
    .delete()
    .eq('id', attemptId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete quiz attempt: ${error.message}`);
  }
}

export async function uploadSessionImageToStorage(
  userId: string,
  file: File
): Promise<string> {
  const client = requireSupabase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/images/${Date.now()}-${safeName}`;
  const contentType = inferStorageMimeType(file.name, file.type);

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new Error('Image storage upload failed: Unable to read the selected image from your device.');
  }

  return uploadBufferToStudyMaterialsBucket({
    client,
    userId,
    storagePath,
    buffer,
    contentType,
  });
}

export async function restoreSessionImageAttachment(
  storagePath: string,
  mimeType?: string | null
): Promise<SnapImageAttachment | null> {
  try {
    const signedUrl = await getMaterialSignedUrl(storagePath);
    const res = await fetch(signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const rawMime = (mimeType || blob.type || 'image/jpeg').toLowerCase();
    const normalizedMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
    if (
      normalizedMime !== 'image/jpeg' &&
      normalizedMime !== 'image/png' &&
      normalizedMime !== 'image/webp'
    ) {
      return null;
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const str = typeof reader.result === 'string' ? reader.result : '';
        const commaIdx = str.indexOf(',');
        resolve(commaIdx >= 0 ? str.slice(commaIdx + 1) : str);
      };
      reader.onerror = () => reject(new Error('Failed to decode session image.'));
      reader.readAsDataURL(blob);
    });

    if (!base64) return null;
    const rawName = storagePath.split('/').pop() || 'study-image.jpg';
    const cleanName = rawName.replace(/^\d+-/, '') || 'study-image.jpg';

    return {
      base64,
      mimeType: normalizedMime,
      previewUrl: `data:${normalizedMime};base64,${base64}`,
      fileName: cleanName,
      fileSizeBytes: blob.size,
    };
  } catch {
    return null;
  }
}

export async function listAiSessions(
  userId: string,
  sessionType: AiSessionType
): Promise<AiSessionRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('ai_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_type', sessionType)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load ${sessionType} sessions: ${error.message}`);
  }
  return (data ?? []) as AiSessionRecord[];
}

export async function listAllAiSessions(userId: string): Promise<AiSessionRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('ai_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load AI sessions: ${error.message}`);
  }
  return (data ?? []) as AiSessionRecord[];
}

export async function createAiSession(input: {
  userId: string;
  sessionType: AiSessionType;
  title: string;
  subjectArea?: string;
  tutorMode?: TutorMode | null;
  tutorStep?: number;
  tutorStageLabel?: string | null;
  attachedMaterialId?: string | null;
  attachedSummaryId?: string | null;
  activeImagePath?: string | null;
  activeImageMime?: string | null;
}): Promise<AiSessionRecord> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('ai_sessions')
    .insert({
      user_id: input.userId,
      session_type: input.sessionType,
      title: input.title,
      subject_area: input.subjectArea || 'General Studies',
      tutor_mode: input.tutorMode ?? null,
      tutor_step: input.tutorStep ?? 1,
      tutor_stage_label: input.tutorStageLabel ?? null,
      attached_material_id: input.attachedMaterialId ?? null,
      attached_summary_id: input.attachedSummaryId ?? null,
      active_image_path: input.activeImagePath ?? null,
      active_image_mime: input.activeImageMime ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create ${input.sessionType} session: ${error.message}`);
  }
  return data as AiSessionRecord;
}

export async function updateAiSession(
  userId: string,
  sessionId: string,
  updates: Partial<{
    title: string;
    subject_area: string;
    tutor_mode: TutorMode | null;
    tutor_step: number;
    tutor_stage_label: string | null;
    attached_material_id: string | null;
    attached_summary_id: string | null;
    active_image_path: string | null;
    active_image_mime: string | null;
  }>
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('ai_sessions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to update session: ${error.message}`);
  }
}

export async function deleteAiSession(userId: string, sessionId: string): Promise<void> {
  const client = requireSupabase();

  try {
    const [{ data: sessionRow }, { data: msgRows }] = await Promise.all([
      client
        .from('ai_sessions')
        .select('active_image_path')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle(),
      client
        .from('ai_messages')
        .select('image_path')
        .eq('session_id', sessionId)
        .eq('user_id', userId),
    ]);

    const paths = new Set<string>();
    if (sessionRow?.active_image_path) {
      paths.add(String(sessionRow.active_image_path));
    }
    for (const row of msgRows || []) {
      if (row?.image_path) paths.add(String(row.image_path));
    }
    if (paths.size > 0) {
      await client.storage.from('study-materials').remove(Array.from(paths));
    }
  } catch (cleanupErr) {
    console.warn('Optional session image storage cleanup warning:', cleanupErr);
  }

  const { error } = await client
    .from('ai_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete session: ${error.message}`);
  }
}

export async function listAiMessages(
  userId: string,
  sessionId: string
): Promise<AiMessageRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('ai_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load messages: ${error.message}`);
  }
  return (data ?? []) as AiMessageRecord[];
}

export async function createAiMessage(input: {
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  imagePath?: string | null;
  imageMime?: string | null;
  actionTag?: string | null;
}): Promise<AiMessageRecord> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('ai_messages')
    .insert({
      session_id: input.sessionId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      image_path: input.imagePath ?? null,
      image_mime: input.imageMime ?? null,
      action_tag: input.actionTag ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save message: ${error.message}`);
  }
  return data as AiMessageRecord;
}

