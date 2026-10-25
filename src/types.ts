import type { LanguageInfo } from './utils/languageDetector';

export type ActiveTab = 
  | 'ingesta' 
  | 'curaduria'
  | 'procesamiento' 
  | 'auditoria' 
  | 'purificacion' 
  | 'estilos' 
  | 'paralelo'
  | 'generacion' 
  | 'telemetria'
  | 'pruebas';

export interface ContentSectionMapEntry {
  id: string;
  sectionName: string;
  pageRange?: string;
  contentType: 'theory' | 'question_bank' | 'multiple_choice' | 'dialogue_interview' | 'tables_statistics' | 'glossary' | 'mixed';
  description: string;
  suggestedStyles: string[];
}

export interface AuditIssue {
  id: string;
  type: 'merged_questions' | 'unformatted_table' | 'missing_options' | 'unlinked_header' | 'general';
  title: string;
  description: string;
  targetChunkId?: string;
  targetChapter?: string;
  suggestedFix: string;
  severity: 'high' | 'medium' | 'low';
}

export interface BookTocEntry {
  id: string;
  level: 1 | 2 | 3 | 4;
  title: string;
  pageNumber?: number;
  description?: string;
  sectionCode?: string; // ej: "1.1", "Capítulo 2", "Unidad IV"
}

export interface GlobalCorrectionRule {
  id: string;
  type: 'text_replace' | 'regex_replace' | 'retype_block' | 'renumber_exercises' | 'normalize_latex';
  findPattern?: string;
  replaceWith?: string;
  targetBlockType?: ContentBlockType | 'all';
  newBlockType?: ContentBlockType;
  description: string;
  appliedCount?: number;
}

export interface BatchingConfig {
  mode: 'pages_per_batch' | 'words_per_batch' | 'by_toc_chapters' | 'fixed_pages';
  batchSize?: number; // Tamaño de macro-bloque para máxima eficiencia
  pagesPerBatch?: number; // Páginas por lote/macro-bloque
  detectTocFirst?: boolean;
  preservePageBoundaries?: boolean;
  preservePageBreaks?: boolean;
  mergeContinuousDialogues?: boolean;
  useLightweightModelForBatches?: boolean;
}

export interface EditorialStyleGuide {
  taxonomyName: string;
  detectedStructure: string;
  hasExercisesWithOptions: boolean;
  hasTheoryBoxes: boolean;
  hasLatexMath: boolean;
  hasTables: boolean;
  headingLevelsDetected: string[];
  editorialRules: string[];
  hierarchy?: {
    heading1?: string;
    heading2?: string;
    heading3?: string;
    exercises?: string;
    boxes?: string;
    tables?: string;
  };
}

export interface BookMetadata {
  title: string;
  author: string;
  subject: string;
  educationLevel: string;
  language: string;
  publisherOrSource: string;
  editorialNotes: string;
  targetAudience?: string;
  genre?: 'novela' | 'cuento' | 'poesia' | 'academico' | 'ensayo' | 'mixto';
  translator?: string;
  creationYear?: string;
  isbn?: string;
  styleGuide?: EditorialStyleGuide;
  toc?: BookTocEntry[];
  contentMap?: ContentSectionMapEntry[];
}

export type ContentBlockType = 
  | 'heading1' 
  | 'heading2' 
  | 'heading3' 
  | 'heading4' 
  | 'paragraph' 
  | 'theory_box' 
  | 'important_note' 
  | 'definition' 
  | 'curiosity' 
  | 'exercise' 
  | 'table' 
  | 'latex_math' 
  | 'figure_desc' 
  | 'bullet_list' 
  | 'numbered_list' 
  | 'glossary_item'
  | 'poem_verse'
  | 'epigraph'
  | 'dedication'
  | 'epistolary_letter'
  | 'novel_dialogue'
  | 'blockquote'
  | 'ornamental_break'
  | 'author_footnote';

export interface OptionItem {
  letter: string;
  text: string;
  isCorrect?: boolean;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  caption?: string;
  alignment?: ('left' | 'center' | 'right')[];
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  content: string;
  title?: string;
  author?: string;
  options?: OptionItem[];
  solution?: string;
  explanation?: string;
  tableData?: TableData;
  latex?: string;
  figureCaption?: string;
  customStyleName?: string;
  editorialComment?: string;
  isApproved: boolean;
}

// Modelos para Paralelización Bilingüe Espejo / Facing Pages
export interface BoundaryConcordance {
  headMatch: boolean;
  tailMatch: boolean;
  headScore: number;
  tailScore: number;
  status: 'verified_mutual' | 'head_mismatch' | 'tail_mismatch' | 'total_mismatch' | 'shift_detected' | 'omission';
  headPhraseA: string;
  headPhraseB: string;
  tailPhraseA: string;
  tailPhraseB: string;
  diagnosisMessage: string;
  shiftSuggested?: 'next_b' | 'prev_b' | 'next_a' | 'prev_a';
}

export interface PostProcessTranslationAudit {
  isVerified: boolean;
  score: number; // 0 a 100
  initialPhraseMatch: boolean;
  terminalPhraseMatch: boolean;
  dateMatch: boolean;
  sharedDates: string[];
  dateMismatchDetail?: string;
  initialPhraseA: string;
  initialPhraseB: string;
  terminalPhraseA: string;
  terminalPhraseB: string;
  autoHarmonizedApplied?: boolean;
  harmonizationAction?: string;
  diagnosis: string;
}

export interface PostProcessTranslationSummary {
  totalPairsAudited: number;
  verifiedConcordantCount: number;
  concordanceRate: number; // 0 a 100%
  datesAuditedCount: number;
  datesMatchedCount: number;
  dateRepairsApplied: number;
  initialPhraseMatchRate: number; // 0 a 100%
  terminalPhraseMatchRate: number; // 0 a 100%
  autoHarmonizedCount: number;
  discrepanciesFlagged: number;
}

export interface ParallelPair {
  id: string;
  order: number;
  textA: string;
  textB: string;
  charCountA: number;
  charCountB: number;
  wordCountA: number;
  wordCountB: number;
  type: ContentBlockType;
  isHeading?: boolean;
  title?: string;
  status: 'balanced' | 'rhythm_warning' | 'manual_aligned';
  diffPercentage: number;
  note?: string;
  isContentCut?: boolean;
  contentEventSummary?: string;
  boundaryConcordance?: BoundaryConcordance;
  postProcessAudit?: PostProcessTranslationAudit;
}

export interface ParallelPageSpread {
  spreadNumber: number;
  pageLeftNumber: number; // Página Par (Izquierda - Idioma A)
  pageRightNumber: number; // Página Impar (Derecha - Idioma B)
  pairs: ParallelPair[];
  totalCharsA: number;
  totalCharsB: number;
  isBalanced: boolean;
  spreadTitle?: string;
  chapterTitle?: string;
  isChapterBreak?: boolean;
}

export interface ChapterAnchor {
  id: string;
  chapterIndex: number;
  titleA: string;
  titleB: string;
  paragraphsCountA: number;
  paragraphsCountB: number;
  status: 'perfect_match' | 'minor_variance' | 'major_gap' | 'missing_in_one';
  discrepancyNote?: string;
}

export interface EditorialOmission {
  id?: string;
  side?: 'A' | 'B';
  atParagraph?: number;
  chapterTitle?: string;
  chapterIndex?: number;
  description?: string;
  snippet?: string;
  sourceSnippet?: string;
  remedyApplied?: string;
  suggestedAction?: string;
  explanation?: string;
  type?: string;
  detectedInLanguage?: string;
  approximateWordCount?: number;
}

export interface ParallelEditorialAudit {
  totalParagraphsA: number;
  totalParagraphsB: number;
  paragraphMatchScore: number; // 0 a 100%
  chapters: ChapterAnchor[];
  prefaceA?: { hasPreface: boolean; title: string; paragraphs?: number; paragraphsCount?: number; wordCount: number; text?: string };
  prefaceB?: { hasPreface: boolean; title: string; paragraphs?: number; paragraphsCount?: number; wordCount: number; text?: string };
  prefaceHandling: 'isolated_as_preliminary' | 'symmetric_bilingual' | 'none';
  footnotesCountA: number;
  footnotesCountB: number;
  footnotesHandling: 'gathered_at_end_apparatus' | 'inline_synchronized';
  backMatterA?: { hasBackMatter: boolean; title: string; paragraphsCount?: number; wordCount: number; text?: string; type?: string };
  backMatterB?: { hasBackMatter: boolean; title: string; paragraphsCount?: number; wordCount: number; text?: string; type?: string };
  backMatterHandling?: 'isolated_from_novel' | 'none';
  omissionsDetected: EditorialOmission[];
  summaryMessage: string;
  longParagraphsSplitCount?: number;
  targetCharsPerPage?: number;
  averageCharsPerSpread?: number;
  isSynchronousAnalogSplittingActive?: boolean;
  consensusAnchorsCount?: number;
  bidirectionalPassCompleted?: boolean;
  beginningConcordanceScore?: number; // 0 a 100%
  extensionConcordanceScore?: number; // 0 a 100%
  exactStartMatchRate?: number; // 0 a 100%
  exactEndMatchRate?: number; // 0 a 100%
  spreadMirrorIntegrityScore?: number; // 0 a 100%
  reconciliationsCount?: number;
  contentMirrorCutsCount?: number;
  aiModelUsedInMirrorCuts?: string;
  discrepantPairs?: {
    order: number;
    title: string;
    startSnippetA: string;
    startSnippetB: string;
    reason: string;
  }[];
  postProcessTranslationSummary?: PostProcessTranslationSummary;
  sampleThreadAudit?: ContinuousThreadAuditEntry[];
  unbrokenThreadScore?: number; // 0-100%
  forensicQualityCertificate?: string;
  forensicSamplingAudit?: any;
}

export interface ContinuousThreadAuditEntry {
  checkpointIndex: number;
  positionPercent: number; // e.g. 10, 25, 50, 75, 90, 100
  pairOrder: number;
  chapterTitle: string;
  snippetA: string;
  snippetB: string;
  concordanceScore: number; // 0-100%
  status: 'verified_unbroken' | 'minor_variance';
  checkDetails: string;
}

export interface ParallelBookConfig {
  enabled?: boolean;
  languageA: string;
  languageB: string;
  leftPageLanguage?: string;
  rightPageLanguage?: string;
  titleA: string;
  titleB: string;
  author: string;
  layoutMode: 'facing_pages' | 'side_by_side_columns' | 'interleaved_paragraphs';
  targetCharsPerPage: number;
  targetParagraphsPerPage: number;
  syncMethod: 'by_paragraphs' | 'by_page_budget' | 'hybrid' | 'by_content_mirror';
  useAiTokensForContentCuts?: boolean;
  includeSyncHeader: boolean;
  unifyDialogueDashes: boolean;
  strictRhythmBalance?: boolean;
  isolatePrologues?: boolean;
  filterFootnotes?: boolean;
  startAtMainBodyOnly?: boolean;
  breakOnChapter?: boolean;
  gatherFootnotesAtEnd?: boolean;
  editorialAudit?: ParallelEditorialAudit;
  prologueTitleA?: string;
  prologueTitleB?: string;
  prologueTextA?: string;
  prologueTextB?: string;
  dedicationTextA?: string;
  dedicationTextB?: string;
  epigraphTextA?: string;
  epigraphTextB?: string;
  backMatterTitleA?: string;
  backMatterTitleB?: string;
  backMatterTextA?: string;
  backMatterTextB?: string;
  tokenEfficiencyMode?: 'smart_economizer' | 'pure_local' | 'ai_intensive';
  // Soporte Tetralingüe Espejo (Traducción Sombra / Google Translate)
  shadowTextA_in_B?: string;
  shadowTextB_in_A?: string;
  useShadowTranslation?: boolean;
  shadowSource?: 'google_translate_file' | 'free_web_tool' | 'manual';
  chapters?: Array<{
    id?: string;
    number?: number;
    title: string;
    level?: number;
    pageNumber?: number;
    pageNumberB?: number;
    startPhrase?: string;
    startPhraseB?: string;
  }>;
}

export const DEFAULT_PARALLEL_CONFIG: ParallelBookConfig = {
  enabled: true,
  languageA: 'Español',
  languageB: 'Inglés',
  titleA: '',
  titleB: '',
  author: '',
  layoutMode: 'facing_pages',
  targetCharsPerPage: 1800,
  targetParagraphsPerPage: 4,
  syncMethod: 'hybrid',
  includeSyncHeader: true,
  unifyDialogueDashes: true,
  strictRhythmBalance: true,
  leftPageLanguage: 'languageA',
  isolatePrologues: true,
  filterFootnotes: true,
  startAtMainBodyOnly: true,
  tokenEfficiencyMode: 'smart_economizer'
};

export interface Phase3Checkpoint {
  id: string;
  inProgress: boolean;
  currentCandidateIndex: number;
  totalCandidates: number;
  completedCount: number;
  processedPairs: ParallelPair[];
  allCandidateIds: string[];
  initialPairs: ParallelPair[];
  timestamp: number;
  status: 'idle' | 'in_progress' | 'paused' | 'rate_limited' | 'error' | 'completed';
  statusMessage?: string;
  tokensConsumedApprox?: number;
  lastActiveModel?: string;
}

// Informe de Uniformidad Transversal
export interface HierarchyAnomaly {
  id: string;
  blockId: string;
  chunkId: string;
  currentType: ContentBlockType;
  suggestedType: ContentBlockType;
  reason: string;
  titleOrPreview: string;
  severity: 'high' | 'medium' | 'low';
  type?: string;
  description?: string;
}

export interface TransversalAuditReport {
  isUniform: boolean;
  healthScore: number;
  totalBlocks: number;
  headingCounts: { h1: number; h2: number; h3: number; h4: number };
  literaryCounts: {
    poems: number;
    epigraphs: number;
    letters: number;
    dialogues: number;
    blockquotes: number;
    sceneBreaks: number;
  };
  academicCounts: {
    tables: number;
    formulas: number;
    boxes: number;
    exercises: number;
  };
  anomalies: HierarchyAnomaly[];
  detectedHierarchyPath: string[];
}

export interface CleanMetadata {
  runningHeadersRemoved?: string[];
  pageNumbersRemoved?: number[];
  latexFormulasFound?: number;
  figuresDescribed?: number;
  tablesDetected?: number;
  noiseLinesRemoved?: number;
  notes?: string;
  wordsPreservedCount?: number;
  fidelityScore?: number; // 0-100% fidelidad de transcripción
}

export type PageDiagnosisKind = 'pure_scan' | 'imperfect_ocr' | 'double_column' | 'clean_native' | 'docx_import' | 'manual_paste';

export interface PageDiagnosis {
  kind: PageDiagnosisKind;
  charCount: number;
  hasDoubleColumn?: boolean;
  confidence: number;
  description: string;
}

export interface RawChunk {
  id: string;
  index: number;
  title: string;
  rawContent: string;
  sourceType: 'pdf' | 'docx' | 'markdown' | 'txt' | 'paste' | 'image_ocr' | 'scanned_page';
  pageNumber?: number;
  status: 'pending' | 'cleaning' | 'cleaned' | 'analyzing' | 'styled' | 'error';
  cleanContent?: string;
  cleanMetadata?: CleanMetadata;
  blocks?: ContentBlock[];
  error?: string;
  tokensEstimated?: number;
  lastProcessedAt?: string;
  imageDataUrl?: string;
  isScanned?: boolean;
  ocrStatus?: 'pending' | 'processing' | 'completed' | 'error';
  diagnosis?: PageDiagnosis;
}

export interface EditorialSettings {
  primaryHeadingStyle: string;
  secondaryHeadingStyle: string;
  bodyFont: 'Calibri' | 'Arial' | 'Times New Roman' | 'Georgia' | 'Aptos' | 'Garamond';
  primaryColor: string; // ej: '#1E3A8A'
  secondaryColor: string; // ej: '#0F766E'
  tableHeaderBg: string; // ej: '#1E3A8A'
  tableHeaderTextColor: string; // ej: '#FFFFFF'
  tableBorderColor: string; // ej: '#94A3B8'
  tableAlternateRowBg: string; // ej: '#F8FAFC'
  preserveLatexAsCode: boolean;
  renderFormulasInWord: boolean;
  includeCoverPage: boolean;
  includeTableOfContents: boolean;
  includeDocumentMetadata: boolean;
  formatForGoogleDocs: boolean;
  indentationLevel: number;
  // Opciones literarias y de consistencia transversal
  novelFirstLineIndent?: boolean;
  dialogueDashStyle?: 'em_dash' | 'en_dash' | 'standard';
  poemItalic?: boolean;
  poemIndentDxa?: number;
  ornamentalBreakSymbol?: string;
  strictTransversalUniformity?: boolean;
}

export interface ModelTelemetry {
  rpmCount: number;
  tpmCount: number;
  rpdCount: number;
  lastRequestTime: number;
  dayStartTime: number;
  isOnline: boolean;
  failuresCount: number;
  rateLimitedUntil?: number;
}

export interface FallbackLog {
  timestamp: string;
  from: string;
  to: string;
  reason: string;
}

export interface TransformationProject {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt: string;
  metadata: BookMetadata;
  chunks: RawChunk[];
  settings: EditorialSettings;
  activeTab: ActiveTab;
  selectedModel: string;
  styleGuide?: EditorialStyleGuide | null;
}

export interface EbookPurificationStats {
  initialParasA: number;
  initialParasB: number;
  finalParasA: number;
  finalParasB: number;
  pageArtifactsPurgedA: number;
  pageArtifactsPurgedB: number;
  hyphenatedWordsJoinedA: number;
  hyphenatedWordsJoinedB: number;
  splitsAppliedA: number;
  splitsAppliedB: number;
  fusionsAppliedA: number;
  fusionsAppliedB: number;
  frontMatterDetachedA: boolean;
  frontMatterDetachedB: boolean;
  backMatterDetachedA: boolean;
  backMatterDetachedB: boolean;
  coherenceScore: number;
  isComplete: boolean;
  lastProcessedAt?: number;
}

export interface FootnoteItem {
  id: string;
  marker: string;
  text: string;
  sourceIndex: number;
}

export interface DetectedChapterItem {
  number: number;
  label: string;
  paragraphIndex: number;
  snippet: string;
}

export interface PosteriorContinuityReport {
  isContinuityVerified: boolean;
  confidenceScore: number; // 0 a 100%
  evaluatedParagraphsCount: number;
  averageWordsPerParagraph: number;
  hasNarrativeCadence: boolean;
  hasEmDashDialogues: boolean;
  detectedStartPattern?: string;
  detectedChapterTitle?: string;
  candidateStartSnippet: string;
  subsequentParagraphSnippets: string[];
  rejectionReason?: string;
  verificationMethod: 'heuristic_deep_analysis' | 'mini_ai_reading' | 'canonical_profile';
  explanation: string;
}

export interface PageDetailAnalysis {
  pageNumber: number;
  wordsCount: number;
  charsCount: number;
  paragraphsCount: number;
  category: 'cover_or_title' | 'legal_imprint' | 'dedication_epigraph' | 'toc' | 'prologue_preface' | 'narrative_body' | 'back_matter_colophon' | 'blank';
  snippet: string;
  isNovelStart?: boolean;
  isNovelEnd?: boolean;
}

export interface BookPageStructure {
  frontMatterPages: string;
  novelStartPage: number;
  novelEndPage: number;
  backMatterPages: string;
  totalPages: number;
  hasExplicitPages: boolean;
  pagesAnalysis?: PageDetailAnalysis[];
  posteriorContinuity?: PosteriorContinuityReport;
}

export interface BookZones {
  frontMatter: {
    title?: string;
    author?: string;
    subtitle?: string;
    dedication?: string;
    epigraph?: string;
    downloadNotice?: string;
    editorialNotice?: string;
    hasFrontMatter: boolean;
    rawText?: string;
    tableOfContents?: string;
  };
  preliminaryMatter: {
    hasPreliminary: boolean;
    title: string;
    text: string;
    wordCount: number;
    paragraphsCount: number;
    authorOrSignature?: string;
  };
  footnotes: FootnoteItem[];
  novelBody: string;
  novelParagraphs: string[];
  chapters: DetectedChapterItem[];
  backMatter: {
    hasBackMatter: boolean;
    title: string;
    text: string;
    wordCount: number;
    type: 'gutenberg_license' | 'epilogue' | 'bibliography' | 'endnotes' | 'appendix' | 'colophon' | 'other';
  };
  pageStructure?: BookPageStructure;
  continuityVerified?: boolean;
}

export interface BookEndpointInspection {
  hasCleanStart: boolean;
  hasCleanEnd: boolean;
  isCleanNovelBody: boolean;
  frontMatterRemoved: boolean;
  backMatterRemoved: boolean;
  frontMatterTitle?: string;
  backMatterTitle?: string;
  firstParagraph: string;
  lastParagraph: string;
  firstParagraphWords: number;
  lastParagraphWords: number;
  totalParagraphs: number;
  totalWords: number;
  totalChars: number;
  pureBodyText: string;
  backMatterText: string;
  backMatterWords: number;
  firstParagraphSnippet: string;
  lastParagraphSnippet: string;
  editorialBreakDetected?: string;
  editorialBreakSnippet?: string;
  hasPreface: boolean;
  prefaceTitle?: string;
  prefaceText?: string;
  prefaceWords?: number;
  prefaceParagraphs?: number;
  downloadNoticeRemoved?: boolean;
  downloadNoticeSnippet?: string;
  detectedChapters?: DetectedChapterItem[];
  chaptersCount?: number;
  zones?: BookZones;
  detectedLanguage?: LanguageInfo;
  pageStructure?: BookPageStructure;
  continuityVerified?: boolean;
}

export interface ProcessingProgressInfo {
  current: number;
  total: number;
  message: string;
  stage?: string;
  macroStage?: string;
  mesoChapter?: string;
  microDetail?: string;
  nanoToken?: string;
  activeEngine?: 'local' | 'ai';
  activeModel?: string;
  tokenNotice?: string | null;
  tokensStatus?: 'available' | 'depleted' | 'not_configured' | 'local_deterministic';
  tokensInfo?: string;
  processedDetail?: string;
  itemSnippet?: string;
  recentLogs?: string[];
  isAiDepleted?: boolean;
}

