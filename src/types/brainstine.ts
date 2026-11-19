export type ThemeMode = 'light' | 'dark' | 'system';

export type SummaryLevel = 'short' | 'detailed' | 'comprehensive';

export type MaterialSourceType = 'pdf' | 'image' | 'audio' | 'text';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  theme_preference?: ThemeMode;
  created_at?: string;
  updated_at?: string;
}

export interface MainConceptSection {
  heading: string;
  sourcePoints: string[];
  aiClarification: string;
}

export interface DefinitionTerm {
  term: string;
  definition: string;
  origin: 'source' | 'ai_clarification';
}

export interface DifficultConceptExplanation {
  concept: string;
  sourceContext: string;
  plainExplanation: string;
}

export interface RelevantExample {
  title: string;
  example: string;
  origin: 'source' | 'ai_elaboration';
}

export interface FormulaOrFramework {
  name: string;
  expressionOrStructure: string;
  usage: string;
}

export interface StructuredSummary {
  title: string;
  subjectArea: string;
  summaryLevel: SummaryLevel;
  topicOverview: string;
  mainConcepts: MainConceptSection[];
  importantDefinitions: DefinitionTerm[];
  keyTerminology: string[];
  difficultConceptExplanations: DifficultConceptExplanation[];
  importantFacts: string[];
  relevantExamples: RelevantExample[];
  formulasOrFrameworks: FormulaOrFramework[];
  revisionNotes: string[];
  keyTakeaways: string[];
  markdown: string;
  wordCount: number;
  chunkCount: number;
  generatedAt: string;
}

export interface FollowUpItem {
  id: string;
  promptLabel: string;
  question: string;
  fromSource: string;
  aiExplanation: string;
  createdAt: string;
}

export interface ExtractionResult {
  title: string;
  materialType: MaterialSourceType;
  fileName: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  extractedText: string;
  chunks: string[];
  chunkCount: number;
  wordCount: number;
  characterCount: number;
  pageCount: number | null;
  extractionMethod: 'pdf-text' | 'pdf-ocr' | 'image-ocr' | 'audio-transcription' | 'direct-text';
}

export interface StudyMaterialRecord {
  id: string;
  user_id: string;
  title: string;
  material_type: MaterialSourceType;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string | null;
  extracted_text: string;
  word_count: number;
  chunk_count: number;
  created_at: string;
}

export interface StudySummaryRecord {
  id: string;
  user_id: string;
  material_id: string | null;
  title: string;
  subject_area: string;
  summary_level: SummaryLevel;
  structured_content: StructuredSummary;
  markdown_content: string;
  created_at: string;
  updated_at: string;
}

export interface StudyActivityRecord {
  id: string;
  user_id: string;
  activity_type: 'upload' | 'extract' | 'summarize' | 'save' | 'quiz' | 'chat' | 'tutor';
  title: string;
  detail: string;
  material_type: MaterialSourceType;
  summary_level: SummaryLevel | null;
  created_at: string;
}

export type QuizFormat = 'objective' | 'theory' | 'mixed';
export type QuizDifficulty = 'easy' | 'intermediate' | 'advanced' | 'mixed';
export type QuizSourceMode = 'material' | 'summary' | 'text' | 'topic';
export type QuizQuestionCount = 10 | 20 | 30 | 40;

export interface QuizQuestion {
  id: string;
  number: number;
  type: 'objective' | 'theory';
  question: string;
  options?: string[];
  correctOptionIndex?: number;
  expectedAnswer: string;
  markingCriteria?: string[];
  maxMarks: number;
  explanation: string;
  topicTag?: string;
}

export interface GeneratedQuizPayload {
  title: string;
  subjectArea: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  questionCount: number;
  questions: QuizQuestion[];
}

export interface StudentAnswer {
  questionId: string;
  selectedOptionIndex?: number | null;
  textResponse?: string;
}

export interface GradedQuestionResult {
  questionId: string;
  number: number;
  type: 'objective' | 'theory';
  question: string;
  options?: string[];
  correctOptionIndex?: number;
  selectedOptionIndex?: number | null;
  studentAnswerDisplay: string;
  expectedAnswerDisplay: string;
  status: 'correct' | 'incorrect' | 'partial' | 'unanswered';
  marksAwarded: number;
  maxMarks: number;
  feedback: string;
  missingPoints?: string[];
  explanation: string;
  aiEvaluated: boolean;
}

export interface QuizGradingResponse {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  earnedMarks: number;
  maxMarks: number;
  percentage: number;
  timeTakenSeconds: number;
  performanceAssessment: string;
  gradedResults: GradedQuestionResult[];
}

export interface QuizRecord {
  id: string;
  user_id: string;
  title: string;
  subject_area: string;
  source_mode: QuizSourceMode;
  material_id: string | null;
  summary_id: string | null;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  question_count: number;
  time_limit_minutes: number | null;
  questions: QuizQuestion[];
  created_at: string;
}

export interface QuizAttemptRecord {
  id: string;
  user_id: string;
  quiz_id: string | null;
  title: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  total_questions: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  earned_marks: number;
  max_marks: number;
  percentage: number;
  time_taken_seconds: number;
  answers: StudentAnswer[];
  graded_results: GradedQuestionResult[];
  performance_summary: string;
  created_at: string;
}

// Prompt 4: AI Chat, Personal AI Tutor, and Snap-a-Photo Types
export type AiSessionType = 'chat' | 'tutor';
export type TutorMode = 'beginner' | 'standard' | 'advanced';

export type ImageActionType =
  | 'explain'
  | 'solve'
  | 'summarize_page'
  | 'explain_diagram'
  | 'key_points'
  | 'generate_questions'
  | 'teach_topic';

export interface SnapImageAttachment {
  file?: File;
  base64: string;
  mimeType: string;
  previewUrl: string;
  fileName: string;
  fileSizeBytes: number;
}

export interface AiSessionRecord {
  id: string;
  user_id: string;
  session_type: AiSessionType;
  title: string;
  subject_area: string;
  tutor_mode: TutorMode | null;
  tutor_step: number;
  tutor_stage_label: string | null;
  attached_material_id: string | null;
  attached_summary_id: string | null;
  active_image_path: string | null;
  active_image_mime: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiMessageRecord {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  image_path: string | null;
  image_mime: string | null;
  action_tag: string | null;
  created_at: string;
  localPreviewUrl?: string;
}

export type DashboardSection =
  | 'overview'
  | 'summarizer'
  | 'chat'
  | 'tutor'
  | 'quizzes'
  | 'summaries'
  | 'materials'
  | 'settings';
