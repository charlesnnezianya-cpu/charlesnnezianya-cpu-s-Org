export type ThemeMode = 'light' | 'dark' | 'system';

export type SummaryLevel = 'short' | 'detailed' | 'comprehensive';

export type MaterialSourceType = 'pdf' | 'image' | 'audio' | 'text';

export type EducationalDiagramType =
  | 'process_flow'
  | 'concept_map'
  | 'comparison_matrix'
  | 'cartesian_plot'
  | 'scientific_system'
  | 'candlestick_chart';

export interface DiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  detail?: string;
  group?: string;
  x?: number;
  y?: number;
  tone?: 'primary' | 'accent' | 'neutral' | 'success' | 'warning';
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  bidirectional?: boolean;
}

export interface PlotSeriesPoint {
  x: number;
  y: number;
  label?: string;
}

export interface PlotSeries {
  name: string;
  points: PlotSeriesPoint[];
  color?: 'blue' | 'cyan' | 'emerald' | 'amber';
}

export interface ComparisonRow {
  criterion: string;
  values: string[];
}

export interface ComparisonTable {
  title: string;
  headers: string[];
  rows: ComparisonRow[];
  caption?: string;
}

export interface CandlestickSampleBar {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  note?: string;
}

export interface CandlestickChartSpec {
  candles: CandlestickSampleBar[];
  supportLevel?: number;
  resistanceLevel?: number;
  supportLabel?: string;
  resistanceLabel?: string;
  timeframeLabel?: string;
  trendNote?: string;
}

export interface EducationalDiagramSpec {
  id?: string;
  type: EducationalDiagramType;
  title: string;
  subject?: string;
  caption?: string;
  nodes?: DiagramNode[];
  edges?: DiagramEdge[];
  columns?: string[];
  rows?: { label: string; cells: string[] }[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  series?: PlotSeries[];
  annotations?: { x: number; y: number; text: string }[];
  candlestickSpec?: CandlestickChartSpec;
}

export interface UserProfile {
  id: string;
  email: string;
  phone?: string | null;
  display_name: string;
  theme_preference?: ThemeMode;
  welcome_email_status?: string | null;
  welcome_email_sent_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MainConceptSection {
  heading: string;
  sourcePoints: string[];
  aiClarification: string;
  examples?: string[];
  subsections?: Array<{
    heading: string;
    points: string[];
  }>;
}

export interface ClassificationTypeEntry {
  name: string;
  explanation: string;
  characteristics?: string[];
  examples?: string[];
  pageNumber?: number | null;
}

export interface ClassificationGroup {
  topic: string;
  overviewStatement: string;
  types: ClassificationTypeEntry[];
  comparisonNote?: string;
}

export interface StructuredCharacteristicItem {
  topic: string;
  points: string[];
}

export interface SummaryValidationReport {
  isComplete: boolean;
  sectionsConsidered: number;
  sectionsCovered: number;
  classificationsCovered: number;
  missingTopics: string[];
  notes: string[];
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

export interface FormulaVariableNote {
  symbol: string;
  meaning: string;
}

export interface FormulaOrFramework {
  name: string;
  expressionOrStructure: string;
  usage: string;
  variables?: FormulaVariableNote[];
}

export interface ProcessMechanismGroup {
  heading: string;
  steps: string[];
}

export interface DistinctionItem {
  pairTitle: string;
  comparison: string;
}

export type SummaryVisualTargetSection =
  | 'overview'
  | 'concepts'
  | 'classifications'
  | 'processes'
  | 'distinctions'
  | 'formulas';

export type SummaryVisualType =
  | 'illustration'
  | 'diagram'
  | 'concept_map'
  | 'process_sequence'
  | 'comparative_visual'
  | 'spatial_scene';

export interface SummaryVisualVerifiedLabel {
  label: string;
  detail?: string;
}

export interface SummaryVisualCandidate {
  id: string;
  targetSection: SummaryVisualTargetSection;
  targetIndex?: number;
  conceptTitle: string;
  subjectDiscipline: string;
  visualType: SummaryVisualType;
  necessityReason: string;
  visualScore: number;
  caption: string;
  generationPrompt: string;
  verifiedLabels: SummaryVisualVerifiedLabel[];
  aspectRatio: '16:9' | '4:3';
}

export interface SummaryVisualAid extends SummaryVisualCandidate {
  imageDataUrl: string;
  resolution: '4K' | '2K' | '1K';
  modelUsed: string;
  generatedAt: string;
  license?: string;
  attribution?: string;
  exactResolution?: string;
  modality?: 'photography' | 'diagram' | 'hybrid';
  diagramSpec?: EducationalDiagramSpec;
}

export interface StructuredSummary {
  title: string;
  subjectArea: string;
  summaryLevel: SummaryLevel;
  topicOverview: string;
  mainConcepts: MainConceptSection[];
  importantDefinitions: DefinitionTerm[];
  classificationsAndTypes?: ClassificationGroup[];
  characteristicsAndExplanations?: StructuredCharacteristicItem[];
  keyTerminology: string[];
  difficultConceptExplanations: DifficultConceptExplanation[];
  importantFacts: string[];
  relevantExamples: RelevantExample[];
  formulasOrFrameworks: FormulaOrFramework[];
  processesAndMechanisms?: ProcessMechanismGroup[];
  importantDistinctions?: DistinctionItem[];
  finalRecap?: string[];
  sourceNotice?: string;
  comparisonTables?: ComparisonTable[];
  visualDiagrams?: EducationalDiagramSpec[];
  visualAids?: SummaryVisualAid[];
  revisionNotes: string[];
  keyTakeaways: string[];
  validationReport?: SummaryValidationReport;
  markdown: string;
  wordCount: number;
  chunkCount: number;
  generatedAt: string;
  generationMode?: 'ai' | 'extractive' | 'document';
}

export interface ExtractedDocumentSection {
  id: string;
  index: number;
  heading: string;
  preview: string;
  wordCount: number;
  unitCount: number;
  pageNumbers: number[];
  text: string;
}

export interface ExtractionResult {
  extractionId?: string;
  contentHash?: string;
  detectedSubject?: string;
  sections?: ExtractedDocumentSection[];
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
export type QuizSourceMode = 'material' | 'summary' | 'text' | 'topic' | 'upload';
export type QuizQuestionCount = 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 | 65 | 70;
export type QuizCognitiveBand = 'knowledge' | 'comprehension' | 'application' | 'analysis';
export type QuizQuestionCategory =
  | 'definition'
  | 'conceptual'
  | 'application'
  | 'scenario'
  | 'analytical'
  | 'comparison'
  | 'cause_effect'
  | 'problem_solving'
  | 'process'
  | 'classification';

export interface AssessmentBlueprintTopic {
  topic: string;
  count: number;
}

export interface AssessmentBlueprint {
  totalQuestions: number;
  topics: AssessmentBlueprintTopic[];
  cognitiveMix: Record<QuizCognitiveBand, number>;
}

export interface TopicPerformanceInsight {
  topic: string;
  totalQuestions: number;
  correctCount: number;
  earnedMarks: number;
  maxMarks: number;
  accuracyPct: number;
  status: 'strong' | 'developing' | 'needs_review';
}

export interface QuizQuestion {
  id: string;
  number: number;
  type: 'objective' | 'theory';
  question: string;
  options?: string[];
  correctOptionIndex?: number;
  expectedAnswer?: string;
  markingCriteria?: string[];
  maxMarks: number;
  explanation?: string;
  topicTag?: string;
  cognitiveBand?: QuizCognitiveBand;
  questionCategory?: QuizQuestionCategory;
  visualAid?: EducationalDiagramSpec;
}

export interface GeneratedQuizPayload {
  sessionId?: string;
  sessionToken?: string | null;
  quizId?: string | null;
  title: string;
  subjectArea: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  assessmentMode?: QuizAssessmentMode;
  timeLimitMinutes?: number | null;
  requestedQuestionCount?: number;
  questionCount: number;
  insufficientSourceNote?: string | null;
  blueprint?: AssessmentBlueprint;
  questions: QuizQuestion[];
}

export interface StartQuizSessionResponse {
  sessionId: string;
  sessionToken?: string | null;
  quizId: string | null;
  title: string;
  subjectArea: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  assessmentMode: QuizAssessmentMode;
  timeLimitMinutes: number | null;
  startedAtMs: number;
  deadlineAtMs: number | null;
  serverNowMs: number;
  remainingSeconds: number | null;
  blueprint?: AssessmentBlueprint;
  questions: QuizQuestion[];
}

export interface ActiveAssessmentSummary {
  sessionId: string;
  quizId: string | null;
  title: string;
  subjectArea: string;
  assessmentMode: QuizAssessmentMode;
  difficulty: QuizDifficulty;
  questionCount: number;
  answeredCount: number;
  currentQuestionIndex: number;
  timeLimitMinutes: number | null;
  startedAtMs: number | null;
  deadlineAtMs: number | null;
  remainingSeconds: number | null;
  isExpired: boolean;
  lastSavedAt: string;
}

export type RestoredQuizSessionResponse =
  | {
      status: 'active';
      sessionId: string;
      sessionToken?: string | null;
      quizId: string | null;
      title: string;
      subjectArea: string;
      format: QuizFormat;
      difficulty: QuizDifficulty;
      assessmentMode: QuizAssessmentMode;
      timeLimitMinutes: number | null;
      startedAtMs: number;
      deadlineAtMs: number | null;
      serverNowMs: number;
      remainingSeconds: number | null;
      currentQuestionIndex: number;
      answers: Record<string, StudentAnswer>;
      questionStatus: Record<string, 'answered' | 'unanswered'>;
      lockedQuestionIds: string[];
      practiceFeedback: Record<string, QuizAnswerCheckResponse>;
      lastSavedAt: string;
      blueprint?: AssessmentBlueprint;
      questions: QuizQuestion[];
    }
  | {
      status: 'expired_submitted';
      sessionId: string;
      quizId: string | null;
      title: string;
      subjectArea: string;
      format: QuizFormat;
      difficulty: QuizDifficulty;
      assessmentMode: QuizAssessmentMode;
      grading: QuizGradingResponse;
    };

export interface QuizAnswerCheckResponse {
  questionId: string;
  selectedOptionIndex: number;
  correctOptionIndex: number;
  isCorrect: boolean;
  expectedAnswerDisplay: string;
  explanation: string;
  topicTag?: string;
  cognitiveBand?: QuizCognitiveBand;
  questionCategory?: QuizQuestionCategory;
  options: string[];
  sessionToken?: string | null;
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
  topicTag?: string;
  cognitiveBand?: QuizCognitiveBand;
  questionCategory?: QuizQuestionCategory;
  aiEvaluated: boolean;
}

export interface QuizGradingResponse {
  attemptId?: string | null;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  earnedMarks: number;
  maxMarks: number;
  percentage: number;
  timeTakenSeconds: number;
  performanceAssessment: string;
  topicPerformance?: TopicPerformanceInsight[];
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

export type QuizAssessmentMode = 'practice' | 'exam';

export interface ChatRetrievedSource {
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  chunkPosition: number;
  matchedKeywords: string[];
  excerpt: string;
  score: number;
}

export interface ChatRagMeta {
  intent?: 'document_specific' | 'follow_up' | 'general_academic' | 'ambiguous';
  knowledgeSource?: 'study_materials' | 'general_knowledge' | 'hybrid';
  searchedDocumentsCount?: number;
  passagesRetrieved?: number;
}

export interface TutorRagMeta {
  pedagogicalAction?:
    | 'guided_full_lesson'
    | 'answer_evaluation'
    | 'simplify_reteach'
    | 'advance_next'
    | 'provide_examples'
    | 'summarize_lesson'
    | 'understanding_check'
    | 'continue_lesson'
    | 'concept_question';
  useStructuredLessonPlan?: boolean;
  knowledgeSource?: 'study_materials' | 'general_knowledge' | 'hybrid';
  searchedDocumentsCount?: number;
  passagesRetrieved?: number;
}

export type DashboardSection =
  | 'overview'
  | 'history'
  | 'summarizer'
  | 'chat'
  | 'tutor'
  | 'quizzes'
  | 'summaries'
  | 'materials'
  | 'settings';
