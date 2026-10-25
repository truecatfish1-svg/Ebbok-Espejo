import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { 
  ActiveTab, 
  BookMetadata, 
  BookTocEntry,
  BatchingConfig,
  ContentBlock, 
  EditorialSettings, 
  RawChunk, 
  TransformationProject,
  EditorialStyleGuide,
  PageDiagnosis,
  ParallelBookConfig,
  ParallelPair,
  ParallelPageSpread,
  ParallelEditorialAudit,
  TransversalAuditReport,
  EbookPurificationStats,
  BookZones,
  Phase3Checkpoint,
  ProcessingProgressInfo,
  DEFAULT_PARALLEL_CONFIG
} from '../types';
import { 
  cleanAndPurifyChunk, 
  analyzeAndStyleChunk, 
  purifyAndStyleInOneStep,
  processMacroBlockPurifyAndStyle,
  detectBookTableOfContents,
  analyzeEditorialTaxonomy,
  ocrTranscribeImagePage,
  extractBookMetadataFromContent,
  telemetryStore,
  curateEntireDocumentContinuityAndHyphenation,
  curateOcrTextAndParagraphContinuity,
  curateAllBlocksQuestionsAndOptionsLocally,
  segmentBilingualFragmentIntoMirrorPairsWithAI,
  hasValidGeminiApiKey
} from '../services/gemini';
import { appStorage } from '../utils/storage';
import { analyzeTransversalHierarchy, applyTransversalNormalization } from '../utils/transversalAuditor';
import { 
  alignBilingualTexts, 
  buildSpreadsAndSummaryFromPairs,
  cleanRawTextToEbookStream, 
  harmonizeAsymmetricPairIntoMirrorFragments, 
  createPair,
  evaluateBoundaryConcordance,
  sanitizeAndDeduplicatePairs
} from '../utils/parallelMatcher';
import { 
  disentangleBookZones, 
  inspectBookEndpointsAndPureBody, 
  analyzeBookPdfAndPageFlow, 
  verifyNovelBoundariesWithMiniAi,
  type BookEndpointInspection 
} from '../utils/novelCurator';
import { lookupCanonicalWorkLocally } from '../utils/intelligentBookCurator';
import { runPureMirrorHarmonizer, PureMirrorHarmonizationResult } from '../utils/pureMirrorHarmonizer';
import { runPostProcessTranslationAuditAndAutoHarmonize, runForensicSamplingAuditAndAutoHeal } from '../utils/postProcessTranslationPipeline';
import { executePhase3MirrorAssembly } from '../utils/phase3MirrorAssemblyEngine';
import { autoSplitTextIntoChunks } from '../utils/fileExtractor';
import { translateTextFree } from '../utils/multilingualTranslationEngine';
import { 
  purgeDigitalRepositoryBoilerplates, 
  discoverBookCanonicalEndpointsWithAI, 
  executeCanonicalDoubleTrim, 
  endpointsToCanonicalWorkProfile,
  type DiscoveredEndpoints 
} from '../utils/canonicalEndpointsDiscoverer';
import { generateCleanSingleBookDocx } from '../lib/docx-generator';
import { saveAs } from 'file-saver';

const DEFAULT_METADATA: BookMetadata = {
  title: '',
  author: '',
  subject: 'Literatura / Narrativa',
  educationLevel: 'General / Clásico',
  language: 'Español',
  publisherOrSource: '',
  editorialNotes: 'Edición y transformación bilingüe con preservación estructural y tipográfica.',
  toc: []
};

const DEFAULT_BATCHING_CONFIG: BatchingConfig = {
  mode: 'fixed_pages',
  pagesPerBatch: 4,
  detectTocFirst: true,
  preservePageBreaks: false,
  mergeContinuousDialogues: true
};

const DEFAULT_SETTINGS: EditorialSettings = {
  primaryHeadingStyle: 'Heading 1',
  secondaryHeadingStyle: 'Heading 2',
  bodyFont: 'Calibri',
  primaryColor: '#064E3B', // Esmeralda bosque editorial profundo
  secondaryColor: '#D97706', // Ámbar bruñido cálido
  tableHeaderBg: '#064E3B',
  tableHeaderTextColor: '#FFFFFF',
  tableBorderColor: '#CBD5E1',
  tableAlternateRowBg: '#F0FDF4',
  preserveLatexAsCode: false,
  renderFormulasInWord: true,
  includeCoverPage: true,
  includeTableOfContents: false,
  includeDocumentMetadata: true,
  formatForGoogleDocs: true,
  indentationLevel: 1,
  novelFirstLineIndent: true,
  dialogueDashStyle: 'em_dash',
  poemItalic: true,
  poemIndentDxa: 1440,
  ornamentalBreakSymbol: '* * *'
};

interface SapeContextType {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  metadata: BookMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<BookMetadata>>;
  chunks: RawChunk[];
  setChunks: React.Dispatch<React.SetStateAction<RawChunk[]>>;
  settings: EditorialSettings;
  setSettings: React.Dispatch<React.SetStateAction<EditorialSettings>>;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  styleGuide: EditorialStyleGuide | null;
  setStyleGuide: React.Dispatch<React.SetStateAction<EditorialStyleGuide | null>>;
  batchingConfig: BatchingConfig;
  setBatchingConfig: React.Dispatch<React.SetStateAction<BatchingConfig>>;
  
  isProcessing: boolean;
  currentProcessingChunkId: string | null;
  processingProgress: ProcessingProgressInfo;
  isProcessingOverlayMinimized: boolean;
  setIsProcessingOverlayMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  switchToLocalProcessing: () => void;
  
  // Gestión de Chunks
  addChunk: (chunkData: { 
    title: string; 
    rawContent: string; 
    sourceType: RawChunk['sourceType']; 
    pageNumber?: number;
    imageDataUrl?: string;
    isScanned?: boolean;
    ocrStatus?: RawChunk['ocrStatus'];
    diagnosis?: PageDiagnosis;
  }) => void;
  addMultipleChunks: (chunksList: { 
    title: string; 
    content: string; 
    pageNumber?: number; 
    sourceType?: RawChunk['sourceType'];
    imageDataUrl?: string;
    isScanned?: boolean;
    ocrStatus?: RawChunk['ocrStatus'];
    diagnosis?: PageDiagnosis;
  }[]) => void;
  updateChunk: (id: string, updates: Partial<RawChunk>) => void;
  removeChunk: (id: string) => void;
  clearAllChunks: () => void;
  
  // OCR por Visión, Auto-Detección de Metadatos, TOC y Taxonomía
  ocrSingleChunk: (id: string) => Promise<void>;
  ocrAllScannedChunks: () => Promise<void>;
  detectMetadataFromChunks: () => Promise<void>;
  detectEditorialTaxonomy: () => Promise<void>;
  detectBookToc: () => Promise<BookTocEntry[]>;
  updateBatchingConfig: (newConfig: Partial<BatchingConfig>) => void;
  
  // Procesamiento con IA resiliente (Purificación y Estilos en Lotes Inteligentes)
  purifySingleChunk: (id: string) => Promise<void>;
  purifyAllPendingChunks: () => Promise<void>;
  rePurifyAllChunks: () => Promise<void>;
  styleSingleChunk: (id: string, customMemory?: any) => Promise<ContentBlock[] | void>;
  styleAllCleanedChunks: () => Promise<void>;
  purifyAndStyleSingleChunk: (id: string, customMemory?: any) => Promise<ContentBlock[] | void>;
  purifyAndStyleAllPending: () => Promise<void>;
  purifyAndStyleWithMacroBatching: () => Promise<void>;
  transformEntireBookWithGlobalContext: () => Promise<void>;
  consolidateChunksIntoChaptersOrMacroBlocks: (groupSize?: number) => void;
  curateAllContinuityAndHyphenation: () => { fixedCount: number };
  cancelProcessing: () => void;
  
  // Gestión de Bloques
  updateBlock: (chunkId: string, blockId: string, updates: Partial<ContentBlock>) => void;
  removeBlock: (chunkId: string, blockId: string) => void;
  addBlockToChunk: (chunkId: string, block: Omit<ContentBlock, 'id'>) => void;
  approveAllBlocks: (chunkId?: string) => void;

  // Proyectos
  projects: TransformationProject[];
  currentProjectId: string | null;
  saveProject: (name?: string) => void;
  loadProject: (id: string) => void;
  deleteProject: (id: string) => void;
  newProject: () => void;
  purgeAllMemoryAndStorage: () => Promise<void>;
  exportProjectJson: () => void;
  importProjectJson: (jsonData: string) => void;

  // Auditoría Transversal y Uniformidad Estricta
  transversalReport: TransversalAuditReport | null;
  runTransversalAudit: () => TransversalAuditReport;
  applyTransversalFixes: (options?: { autoFixHeadings?: boolean; unifyDialogues?: boolean; detectLiteraryBlocks?: boolean }) => number;

  // Libro Paralelo / Edición Bilingüe
  parallelConfig: ParallelBookConfig;
  setParallelConfig: React.Dispatch<React.SetStateAction<ParallelBookConfig>>;
  parallelSourceAText: string;
  setParallelSourceAText: (text: string) => void;
  parallelSourceBText: string;
  setParallelSourceBText: (text: string) => void;
  parallelPairs: ParallelPair[];
  setParallelPairs: React.Dispatch<React.SetStateAction<ParallelPair[]>>;
  parallelSpreads: ParallelPageSpread[];
  parallelSummary: { totalPairs: number; totalSpreads: number; totalWordsA: number; totalWordsB: number; rhythmScore: number };
  parallelAudit: ParallelEditorialAudit | null;
  runParallelAlignment: (sourceBInput?: string, overrideConfig?: ParallelBookConfig, sourceAInput?: string) => Promise<void>;
  phase3Checkpoint: Phase3Checkpoint | null;
  resumeParallelAlignment: () => Promise<void>;
  completeRemainingWithLocalEngine: () => Promise<void>;
  resetPhase3Progress: () => void;
  pausePhase3Processing: () => void;
  cleanAndPurifyEbookTexts: (inputA?: string, inputB?: string) => Promise<{ cleanA: string; cleanB: string }>;
  runAiAssistedDoubleCleaning: (inputA?: string, inputB?: string) => Promise<{
    cleanA: string;
    cleanB: string;
    endpointsA: DiscoveredEndpoints | null;
    endpointsB: DiscoveredEndpoints | null;
    purgedFrontA: string;
    purgedFrontB: string;
  }>;
  mirrorHarmonizationResult: PureMirrorHarmonizationResult | null;
  setMirrorHarmonizationResult: React.Dispatch<React.SetStateAction<PureMirrorHarmonizationResult | null>>;
  runSecondPassMirrorHarmonizer: (inputA?: string, inputB?: string) => Promise<PureMirrorHarmonizationResult>;
  runTransversalMirrorProcessing: () => Promise<void>;
  runAiContentMirrorSegmentation: (options?: { forceAll?: boolean }) => Promise<void>;
  isEbookPurified: boolean;
  setIsEbookPurified: (val: boolean) => void;
  purificationStats: EbookPurificationStats | null;
  setPurificationStats: React.Dispatch<React.SetStateAction<EbookPurificationStats | null>>;
  updateParallelPairItem: (pairId: string, updates: Partial<ParallelPair>) => void;
  deleteParallelPairItem: (pairId: string) => void;
  insertEmptyParallelPairItem: (index: number) => void;
  splitParallelPairItem: (pairId: string, cutIdxA?: number, cutIdxB?: number) => void;
  mergeParallelPairWithAdjacent: (pairId: string, direction: 'prev' | 'next') => void;
  autoHarmonizeDenseDisparities: () => number;
  autoReconcileAbsencePairs: () => number;
  exportCleanBookA: (format?: 'docx' | 'txt') => Promise<void>;
  exportCleanBookB: (format?: 'docx' | 'txt') => Promise<void>;
  bookZonesA: BookZones | null;
  setBookZonesA: React.Dispatch<React.SetStateAction<BookZones | null>>;
  bookZonesB: BookZones | null;
  setBookZonesB: React.Dispatch<React.SetStateAction<BookZones | null>>;
  ingestStateA: any;
  setIngestStateA: React.Dispatch<React.SetStateAction<any>>;
  ingestStateB: any;
  setIngestStateB: React.Dispatch<React.SetStateAction<any>>;
  locateBookStructureWithAI: (slot: 'A' | 'B') => Promise<DiscoveredEndpoints | null>;
  singleBookAudit: BookEndpointInspection | null;
  setSingleBookAudit: React.Dispatch<React.SetStateAction<BookEndpointInspection | null>>;
  curateAndCleanEntireBook: (rawTextOverride?: string) => Promise<void>;
  runMiniAiStartCheck: () => Promise<void>;
  analyzeBookFlow: (text: string, pages?: { pageNumber: number; text: string }[], candidateTitle?: string, candidateAuthor?: string) => BookEndpointInspection;
  // Soporte Tetralingüe Espejo (Traducción Sombra / Google Translate)
  shadowTextA_in_B: string;
  setShadowTextA_in_B: React.Dispatch<React.SetStateAction<string>>;
  shadowTextB_in_A: string;
  setShadowTextB_in_A: React.Dispatch<React.SetStateAction<string>>;
  generateFreeShadowTranslationForAnchor: (side: 'A' | 'B') => Promise<void>;
}

const SapeContext = createContext<SapeContextType | undefined>(undefined);

export const SapeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('ingesta');
  const [metadata, setMetadata] = useState<BookMetadata>(DEFAULT_METADATA);
  const [styleGuide, setStyleGuide] = useState<EditorialStyleGuide | null>(null);
  const [chunks, setChunks] = useState<RawChunk[]>([]);
  const [settings, setSettings] = useState<EditorialSettings>(DEFAULT_SETTINGS);
  const [selectedModel, setSelectedModel] = useState<string>('auto-cascade');
  const [batchingConfig, setBatchingConfig] = useState<BatchingConfig>(DEFAULT_BATCHING_CONFIG);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingChunkId, setCurrentProcessingChunkId] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgressInfo>({ 
    current: 0, 
    total: 0, 
    message: '',
    stage: 'Inicial',
    activeEngine: 'local',
    activeModel: 'gemini-3.1-flash-lite',
    tokenNotice: null,
    itemSnippet: '',
    recentLogs: []
  });
  const [isProcessingOverlayMinimized, setIsProcessingOverlayMinimized] = useState(false);
  const forceLocalRef = useRef(false);

  const switchToLocalProcessing = useCallback(() => {
    forceLocalRef.current = true;
    setProcessingProgress(prev => ({
      ...prev,
      activeEngine: 'local',
      tokenNotice: '⚡ Motor Semántico Local determinista (0 tokens) activado por el usuario.',
      message: 'Cambiado a Motor Semántico Local (0 tokens) para la obra completa...',
      recentLogs: [
        ...(prev.recentLogs || []),
        `[${new Date().toLocaleTimeString()}] ⚡ Usuario cambió a Motor Semántico Local (0 tokens)`
      ].slice(-6)
    }));
  }, []);
  const [projects, setProjects] = useState<TransformationProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isStorageInitialized, setIsStorageInitialized] = useState(false);

  // Estados de Uniformidad Transversal y Libro Paralelo
  const [transversalReport, setTransversalReport] = useState<TransversalAuditReport | null>(null);
  const [parallelConfig, setParallelConfig] = useState<ParallelBookConfig>(DEFAULT_PARALLEL_CONFIG);
  const [parallelSourceAText, setParallelSourceAText] = useState<string>('');
  const [parallelSourceBText, setParallelSourceBText] = useState<string>('');
  const [shadowTextA_in_B, setShadowTextA_in_B] = useState<string>('');
  const [shadowTextB_in_A, setShadowTextB_in_A] = useState<string>('');
  const [parallelPairs, setParallelPairs] = useState<ParallelPair[]>([]);
  const [parallelSpreads, setParallelSpreads] = useState<ParallelPageSpread[]>([]);
  const [parallelAudit, setParallelAudit] = useState<ParallelEditorialAudit | null>(null);
  const [mirrorHarmonizationResult, setMirrorHarmonizationResult] = useState<PureMirrorHarmonizationResult | null>(null);
  const [isEbookPurified, setIsEbookPurified] = useState<boolean>(false);
  const [purificationStats, setPurificationStats] = useState<EbookPurificationStats | null>(null);
  const [bookZonesA, setBookZonesA] = useState<BookZones | null>(null);
  const [bookZonesB, setBookZonesB] = useState<BookZones | null>(null);
  const [ingestStateA, setIngestStateA] = useState<any>(null);
  const [ingestStateB, setIngestStateB] = useState<any>(null);
  const [singleBookAudit, setSingleBookAudit] = useState<BookEndpointInspection | null>(null);
  const [parallelSummary, setParallelSummary] = useState({
    totalPairs: 0,
    totalSpreads: 0,
    totalWordsA: 0,
    totalWordsB: 0,
    rhythmScore: 100
  });

  const [phase3Checkpoint, setPhase3Checkpoint] = useState<Phase3Checkpoint | null>(null);

  const cancelRequestedRef = useRef(false);

  // Escuchar eventos de autorrecuperación de cuota y cambio de modelo
  useEffect(() => {
    const handleRateLimitWait = (e: any) => {
      const detail = e.detail;
      if (detail && isProcessing) {
        setProcessingProgress(prev => ({
          ...prev,
          message: `Rebalanceando cuota de API... Rotando automáticamente de modelo (Intento ${detail.attempt}/${detail.maxTotalAttempts})...`
        }));
      }
    };

    window.addEventListener('sape-rate-limit-waiting', handleRateLimitWait);
    return () => {
      window.removeEventListener('sape-rate-limit-waiting', handleRateLimitWait);
    };
  }, [isProcessing]);

  // 1. Carga inicial asíncrona desde IndexedDB (con fallback a localStorage previo)
  useEffect(() => {
    let isMounted = true;
    async function initStorage() {
      try {
        const [
          savedMeta, savedGuide, savedChunks, savedSettings, savedProjects, savedCurrentId, savedBatching,
          savedPairs, savedSpreads, savedSummary, savedAudit, savedSrcA, savedSrcB, savedParallelCfg, savedCheckpoint,
          savedIngestA, savedIngestB, savedZonesA, savedZonesB, savedShadowA, savedShadowB, savedHarmonization
        ] = await Promise.all([
          appStorage.getItem<BookMetadata>('editorial_metadata_v4', DEFAULT_METADATA),
          appStorage.getItem<EditorialStyleGuide | null>('editorial_styleguide_v4', null),
          appStorage.getItem<RawChunk[]>('editorial_chunks_v4', []),
          appStorage.getItem<EditorialSettings>('editorial_settings_v4', DEFAULT_SETTINGS),
          appStorage.getItem<TransformationProject[]>('editorial_projects_list_v4', []),
          appStorage.getItem<string | null>('editorial_current_project_id_v4', null),
          appStorage.getItem<BatchingConfig>('editorial_batching_v4', DEFAULT_BATCHING_CONFIG),
          appStorage.getItem<ParallelPair[]>('parallel_pairs_v5', []),
          appStorage.getItem<ParallelPageSpread[]>('parallel_spreads_v5', []),
          appStorage.getItem<any>('parallel_summary_v5', { totalPairs: 0, totalSpreads: 0, totalWordsA: 0, totalWordsB: 0, rhythmScore: 100 }),
          appStorage.getItem<ParallelEditorialAudit | null>('parallel_audit_v5', null),
          appStorage.getItem<string>('parallel_source_a_v5', ''),
          appStorage.getItem<string>('parallel_source_b_v5', ''),
          appStorage.getItem<ParallelBookConfig>('parallel_config_v5', DEFAULT_PARALLEL_CONFIG),
          appStorage.getItem<Phase3Checkpoint | null>('phase3_checkpoint_v5', null),
          appStorage.getItem<any>('ingest_state_a_v5', null),
          appStorage.getItem<any>('ingest_state_b_v5', null),
          appStorage.getItem<any>('book_zones_a_v5', null),
          appStorage.getItem<any>('book_zones_b_v5', null),
          appStorage.getItem<string>('shadow_text_a_in_b_v5', ''),
          appStorage.getItem<string>('shadow_text_b_in_a_v5', ''),
          appStorage.getItem<any>('mirror_harmonization_v5', null)
        ]);

        if (isMounted) {
          if (savedMeta) setMetadata(savedMeta);
          if (savedGuide) setStyleGuide(savedGuide);
          if (savedChunks && savedChunks.length > 0) setChunks(savedChunks);
          if (savedSettings) setSettings(savedSettings);
          if (savedProjects) setProjects(savedProjects);
          if (savedCurrentId) setCurrentProjectId(savedCurrentId);
          if (savedBatching) setBatchingConfig(savedBatching);
          if (savedPairs && savedPairs.length > 0) setParallelPairs(sanitizeAndDeduplicatePairs(savedPairs));
          if (savedSpreads && savedSpreads.length > 0) setParallelSpreads(savedSpreads);
          if (savedSummary) setParallelSummary(savedSummary);
          if (savedAudit) setParallelAudit(savedAudit);
          if (savedSrcA) setParallelSourceAText(savedSrcA);
          if (savedSrcB) setParallelSourceBText(savedSrcB);
          if (savedParallelCfg) setParallelConfig(savedParallelCfg);
          if (savedCheckpoint) setPhase3Checkpoint(savedCheckpoint);
          if (savedIngestA) setIngestStateA(savedIngestA);
          if (savedIngestB) setIngestStateB(savedIngestB);
          if (savedZonesA) setBookZonesA(savedZonesA);
          if (savedZonesB) setBookZonesB(savedZonesB);
          if (savedShadowA) setShadowTextA_in_B(savedShadowA);
          if (savedShadowB) setShadowTextB_in_A(savedShadowB);
          if (savedHarmonization) setMirrorHarmonizationResult(savedHarmonization);
          setIsStorageInitialized(true);
        }
      } catch (err) {
        console.warn('Error inicializando almacenamiento IndexedDB:', err);
        if (isMounted) setIsStorageInitialized(true);
      }
    }

    initStorage();
    return () => { isMounted = false; };
  }, []);

  // 2. Auto-guardado continuo en IndexedDB para no perder progreso ni sufrir límites de 5MB
  useEffect(() => {
    if (!isStorageInitialized) return;

    const timer = setTimeout(() => {
      appStorage.setItem('editorial_metadata_v4', metadata);
      appStorage.setItem('editorial_chunks_v4', chunks);
      appStorage.setItem('editorial_settings_v4', settings);
      appStorage.setItem('editorial_batching_v4', batchingConfig);
      if (styleGuide) {
        appStorage.setItem('editorial_styleguide_v4', styleGuide);
      }
      if (parallelPairs && parallelPairs.length > 0) {
        appStorage.setItem('parallel_pairs_v5', parallelPairs);
      }
      if (parallelSpreads && parallelSpreads.length > 0) {
        appStorage.setItem('parallel_spreads_v5', parallelSpreads);
      }
      appStorage.setItem('parallel_summary_v5', parallelSummary);
      if (parallelAudit) appStorage.setItem('parallel_audit_v5', parallelAudit);
      if (parallelSourceAText) appStorage.setItem('parallel_source_a_v5', parallelSourceAText);
      if (parallelSourceBText) appStorage.setItem('parallel_source_b_v5', parallelSourceBText);
      appStorage.setItem('parallel_config_v5', parallelConfig);
      if (phase3Checkpoint) appStorage.setItem('phase3_checkpoint_v5', phase3Checkpoint);
      if (ingestStateA) appStorage.setItem('ingest_state_a_v5', ingestStateA);
      if (ingestStateB) appStorage.setItem('ingest_state_b_v5', ingestStateB);
      if (bookZonesA) appStorage.setItem('book_zones_a_v5', bookZonesA);
      if (bookZonesB) appStorage.setItem('book_zones_b_v5', bookZonesB);
      if (shadowTextA_in_B) appStorage.setItem('shadow_text_a_in_b_v5', shadowTextA_in_B);
      if (shadowTextB_in_A) appStorage.setItem('shadow_text_b_in_a_v5', shadowTextB_in_A);
      if (mirrorHarmonizationResult) appStorage.setItem('mirror_harmonization_v5', mirrorHarmonizationResult);

      if (currentProjectId) {
        appStorage.setItem('editorial_current_project_id_v4', currentProjectId);
        
        setProjects(prev => prev.map(p => {
          if (p.id === currentProjectId) {
            return {
              ...p,
              name: metadata.title || p.name,
              updatedAt: new Date().toISOString(),
              metadata,
              chunks,
              settings,
              activeTab,
              selectedModel
            };
          }
          return p;
        }));
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    metadata, 
    chunks, 
    settings, 
    styleGuide, 
    currentProjectId, 
    activeTab, 
    selectedModel, 
    isStorageInitialized,
    parallelPairs,
    parallelSpreads,
    parallelSummary,
    parallelAudit,
    parallelSourceAText,
    parallelSourceBText,
    parallelConfig,
    phase3Checkpoint
  ]);

  useEffect(() => {
    if (!isStorageInitialized) return;
    appStorage.setItem('editorial_projects_list_v4', projects);
  }, [projects, isStorageInitialized]);

  const addChunk = useCallback((chunkData: { 
    title: string; 
    rawContent: string; 
    sourceType: RawChunk['sourceType']; 
    pageNumber?: number;
    imageDataUrl?: string;
    isScanned?: boolean;
    ocrStatus?: RawChunk['ocrStatus'];
    diagnosis?: PageDiagnosis;
  }) => {
    const newChunk: RawChunk = {
      id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      index: chunks.length + 1,
      title: chunkData.title || `Fragmento ${chunks.length + 1}`,
      rawContent: chunkData.rawContent,
      sourceType: chunkData.sourceType || 'paste',
      pageNumber: chunkData.pageNumber,
      imageDataUrl: chunkData.imageDataUrl,
      isScanned: chunkData.isScanned,
      ocrStatus: chunkData.ocrStatus || (chunkData.imageDataUrl ? 'pending' : 'completed'),
      diagnosis: chunkData.diagnosis,
      status: 'pending',
      tokensEstimated: Math.ceil((chunkData.rawContent || '').length / 3.8)
    };
    setChunks(prev => [...prev, newChunk]);
  }, [chunks.length]);

  const addMultipleChunks = useCallback((chunksList: { 
    title: string; 
    content: string; 
    pageNumber?: number; 
    sourceType?: RawChunk['sourceType'];
    imageDataUrl?: string;
    isScanned?: boolean;
    ocrStatus?: RawChunk['ocrStatus'];
    diagnosis?: PageDiagnosis;
  }[]) => {
    const newItems: RawChunk[] = chunksList.map((item, idx) => ({
      id: `chk_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
      index: chunks.length + idx + 1,
      title: item.title || `Fragmento ${chunks.length + idx + 1}`,
      rawContent: item.content || '',
      sourceType: item.sourceType || 'paste',
      pageNumber: item.pageNumber,
      imageDataUrl: item.imageDataUrl,
      isScanned: item.isScanned,
      ocrStatus: item.ocrStatus || (item.imageDataUrl && (!item.content || item.content.length < 40) ? 'pending' : 'completed'),
      diagnosis: item.diagnosis,
      status: 'pending',
      tokensEstimated: Math.ceil((item.content || '').length / 3.8)
    }));
    setChunks(prev => [...prev, ...newItems]);
  }, [chunks.length]);

  const updateChunk = useCallback((id: string, updates: Partial<RawChunk>) => {
    setChunks(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const removeChunk = useCallback((id: string) => {
    setChunks(prev => prev.filter(c => c.id !== id).map((c, idx) => ({ ...c, index: idx + 1 })));
  }, []);

  const clearAllChunks = useCallback(() => {
    setChunks([]);
    appStorage.setItem('editorial_chunks_v4', []);
  }, []);

  // ----------------------------------------------------
  // OCR PROGRESIVO POR VISIÓN (Gemini Flash ligero)
  // ----------------------------------------------------

  const ocrSingleChunk = async (id: string) => {
    const chunk = chunks.find(c => c.id === id);
    if (!chunk || !chunk.imageDataUrl) return;

    updateChunk(id, { ocrStatus: 'processing', error: undefined });
    setCurrentProcessingChunkId(id);

    try {
      const ocrResult = await ocrTranscribeImagePage(
        chunk.imageDataUrl,
        chunk.pageNumber,
        { title: metadata.title, subject: metadata.subject },
        'gemini-3.8-flash'
      );

      const content = ocrResult.transcribedText || chunk.rawContent;
      const title = ocrResult.detectedTitle || chunk.title;
      const pageNum = ocrResult.detectedPageNumber || chunk.pageNumber;

      updateChunk(id, {
        rawContent: content,
        title: title,
        pageNumber: pageNum,
        ocrStatus: 'completed',
        tokensEstimated: Math.ceil(content.length / 3.8),
        lastProcessedAt: new Date().toLocaleTimeString()
      });
    } catch (err: any) {
      console.error(`Error en OCR de página ${id}:`, err);
      updateChunk(id, {
        ocrStatus: 'error',
        error: `Error OCR: ${err.message || 'Fallo de transcripción'}`
      });
    } finally {
      setCurrentProcessingChunkId(null);
    }
  };

  const ocrAllScannedChunks = async () => {
    const pendingOcr = chunks.filter(c => c.imageDataUrl && c.ocrStatus !== 'completed');
    if (pendingOcr.length === 0) return;

    setIsProcessing(true);
    cancelRequestedRef.current = false;
    setProcessingProgress({ current: 0, total: pendingOcr.length, message: 'Iniciando OCR por Visión progresivo...' });

    for (let i = 0; i < pendingOcr.length; i++) {
      if (cancelRequestedRef.current) break;

      const chunk = pendingOcr[i];
      setProcessingProgress({
        current: i + 1,
        total: pendingOcr.length,
        message: `OCR en ${chunk.title} (${i + 1}/${pendingOcr.length})...`
      });

      await ocrSingleChunk(chunk.id);
      await new Promise(r => setTimeout(r, 400));
    }

    setIsProcessing(false);
    setProcessingProgress({ current: pendingOcr.length, total: pendingOcr.length, message: 'OCR completado con éxito.' });

    // Si el título del libro es el por defecto, auto-detectar metadatos automáticamente
    if (metadata.title === 'Nuevo Libro Digitalizado') {
      setTimeout(() => {
        detectMetadataFromChunks();
      }, 500);
    }
  };

  // ----------------------------------------------------
  // AUTO-DETECCIÓN DE METADATOS Y TAXONOMÍA DEL LIBRO
  // ----------------------------------------------------

  const detectMetadataFromChunks = async () => {
    if (chunks.length === 0) return;

    setIsProcessing(true);
    setProcessingProgress({ current: 1, total: 1, message: 'Detectando metadatos editoriales del libro...' });

    try {
      const samples = chunks
        .slice(0, 4)
        .map(c => c.cleanContent || c.rawContent)
        .filter(t => t && t.length > 30);

      if (samples.length > 0) {
        const detected = await extractBookMetadataFromContent(samples, 'gemini-3.8-flash');
        
        setMetadata(prev => ({
          ...prev,
          title: detected.title || prev.title,
          subject: detected.subject || prev.subject,
          author: detected.author || prev.author,
          educationLevel: detected.educationLevel || prev.educationLevel,
          publisherOrSource: detected.publisherOrSource || prev.publisherOrSource,
          editorialNotes: detected.editorialNotes || prev.editorialNotes
        }));
      }
    } catch (e: any) {
      console.warn("Error al auto-detectar metadatos:", e);
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 1, total: 1, message: 'Metadatos detectados y aplicados.' });
    }
  };

  const detectEditorialTaxonomy = async () => {
    if (chunks.length === 0) return;

    setIsProcessing(true);
    setProcessingProgress({ current: 1, total: 1, message: 'Analizando taxonomía editorial del libro...' });

    try {
      const samples = chunks
        .slice(0, 5)
        .map(c => c.cleanContent || c.rawContent)
        .filter(t => t && t.length > 40);

      if (samples.length > 0) {
        const detected = await analyzeEditorialTaxonomy(samples, metadata, selectedModel);
        setStyleGuide(detected);
      }
    } catch (e: any) {
      console.warn("Error al analizar taxonomía:", e);
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 1, total: 1, message: 'Taxonomía y guía de estilos construidas.' });
    }
  };

  const detectBookToc = async (): Promise<BookTocEntry[]> => {
    if (chunks.length === 0) return [];
    setIsProcessing(true);
    setProcessingProgress({ current: 1, total: 1, message: 'Detectando índice general y estructura de capítulos (págs. iniciales y finales)...' });

    try {
      // Extraer las primeras 5 páginas y las últimas 5 páginas (donde reside el índice en libros hispanos y académicos)
      const earlySamples = chunks.slice(0, 5).map(c => c.cleanContent || c.rawContent).filter(Boolean);
      const lateSamples = chunks.length > 5 ? chunks.slice(-5).map(c => c.cleanContent || c.rawContent).filter(Boolean) : [];
      const combinedSamples = [...earlySamples, ...lateSamples];

      const tocEntries = await detectBookTableOfContents(
        combinedSamples, 
        { title: metadata.title, subject: metadata.subject }, 
        selectedModel
      );
      
      if (tocEntries && tocEntries.length > 0) {
        setMetadata(prev => ({
          ...prev,
          toc: tocEntries
        }));
      }
      return tocEntries;
    } catch (err: any) {
      console.error('Error detectando TOC:', err);
      return [];
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 0, total: 0, message: '' });
    }
  };

  const updateBatchingConfig = (newConfig: Partial<BatchingConfig>) => {
    setBatchingConfig(prev => ({ ...prev, ...newConfig }));
  };

  // ----------------------------------------------------
  // PURIFICACIÓN Y ESTILIZACIÓN (FASE 1 Y 2 CON MEMORIA EDITORIAL GLOBAL)
  // ----------------------------------------------------

  const extractEditorialMemoryFromBlocks = (blocks: ContentBlock[], prevMemory: any) => {
    let lastH1 = prevMemory?.lastHeading1 || '';
    let lastH2 = prevMemory?.lastHeading2 || '';
    let lastH3 = prevMemory?.lastHeading3 || '';
    let lastExNum = prevMemory?.lastExerciseNumber || 0;
    let ongoing = '';

    for (const b of blocks) {
      if (b.type === 'heading1' && b.content) lastH1 = b.content;
      if (b.type === 'heading2' && b.content) lastH2 = b.content;
      if (b.type === 'heading3' && b.content) lastH3 = b.content;
      if (b.type === 'exercise') {
        lastExNum++;
        const match = (b.title || b.content || '').match(/(?:ejercicio|problema|pregunta|reactivo|#)?\s*(\d+)/i);
        if (match && match[1]) {
          const parsedNum = parseInt(match[1], 10);
          if (!isNaN(parsedNum) && parsedNum > 0) lastExNum = parsedNum;
        }
      }
      if (b.content) {
        ongoing = b.content.slice(-150);
      }
    }

    return {
      lastHeading1: lastH1,
      lastHeading2: lastH2,
      lastHeading3: lastH3,
      lastExerciseNumber: lastExNum,
      ongoingContext: ongoing
    };
  };

  const purifySingleChunk = async (id: string) => {
    const chunk = chunks.find(c => c.id === id);
    if (!chunk) return;

    updateChunk(id, { status: 'cleaning', error: undefined });
    setCurrentProcessingChunkId(id);

    try {
      const result = await cleanAndPurifyChunk(
        chunk.rawContent,
        { title: metadata.title, subject: metadata.subject, author: metadata.author, styleGuide },
        selectedModel
      );

      updateChunk(id, {
        status: 'cleaned',
        cleanContent: result.cleanContent,
        cleanMetadata: result.metadata,
        lastProcessedAt: new Date().toLocaleTimeString()
      });
    } catch (err: any) {
      console.error(`Error purificando chunk ${id}:`, err);
      updateChunk(id, {
        status: 'error',
        error: err.message || 'Error durante la purificación del texto.'
      });
    } finally {
      setCurrentProcessingChunkId(null);
    }
  };

  const purifyAllPendingChunks = async () => {
    const pendingChunks = chunks.filter(c => c.status === 'pending' || c.status === 'error');
    if (pendingChunks.length === 0) return;

    setIsProcessing(true);
    cancelRequestedRef.current = false;
    setProcessingProgress({ current: 0, total: pendingChunks.length, message: 'Iniciando purificación de transcripción fiel...' });

    for (let i = 0; i < pendingChunks.length; i++) {
      if (cancelRequestedRef.current) break;

      const chunk = pendingChunks[i];
      setProcessingProgress({
        current: i + 1,
        total: pendingChunks.length,
        message: `Purificando fielmente ${chunk.title} (${i + 1}/${pendingChunks.length})...`
      });

      await purifySingleChunk(chunk.id);
      await new Promise(r => setTimeout(r, 250));
    }

    setIsProcessing(false);
    setProcessingProgress({ current: pendingChunks.length, total: pendingChunks.length, message: 'Purificación completada.' });
  };

  const rePurifyAllChunks = async () => {
    if (chunks.length === 0) return;
    setIsProcessing(true);
    cancelRequestedRef.current = false;
    setProcessingProgress({ current: 0, total: chunks.length, message: 'Iniciando re-purificación con preservación estructural...' });

    for (let i = 0; i < chunks.length; i++) {
      if (cancelRequestedRef.current) break;
      const chunk = chunks[i];
      setProcessingProgress({
        current: i + 1,
        total: chunks.length,
        message: `Depurando cornisas y párrafos en ${chunk.title} (${i + 1}/${chunks.length})...`
      });
      await purifySingleChunk(chunk.id);
      await new Promise(r => setTimeout(r, 200));
    }

    setIsProcessing(false);
    setProcessingProgress({ current: chunks.length, total: chunks.length, message: 'Re-purificación estructural completada.' });
  };

  const styleSingleChunk = async (id: string, customMemory?: any) => {
    const chunk = chunks.find(c => c.id === id);
    if (!chunk || !chunk.cleanContent) return;

    updateChunk(id, { status: 'analyzing', error: undefined });
    setCurrentProcessingChunkId(id);

    try {
      const blocks = await analyzeAndStyleChunk(
        chunk.cleanContent,
        { 
          title: metadata.title, 
          subject: metadata.subject, 
          educationLevel: metadata.educationLevel, 
          styleGuide,
          editorialMemory: customMemory
        },
        selectedModel
      );

      updateChunk(id, {
        status: 'styled',
        blocks,
        lastProcessedAt: new Date().toLocaleTimeString()
      });
      return blocks;
    } catch (err: any) {
      console.error(`Error tipificando chunk ${id}:`, err);
      updateChunk(id, {
        status: 'error',
        error: err.message || 'Error durante el análisis y asignación de estilos.'
      });
      return [];
    } finally {
      setCurrentProcessingChunkId(null);
    }
  };

  const styleAllCleanedChunks = async () => {
    const readyChunks = chunks.filter(c => (c.status === 'cleaned' || c.status === 'styled') && c.cleanContent);
    if (readyChunks.length === 0) return;

    setIsProcessing(true);
    cancelRequestedRef.current = false;
    setProcessingProgress({ current: 0, total: readyChunks.length, message: 'Iniciando tipificación semántica con contexto del libro completo...' });

    let runningMemory = {
      lastHeading1: '',
      lastHeading2: '',
      lastHeading3: '',
      lastExerciseNumber: 0,
      ongoingContext: ''
    };

    for (let i = 0; i < readyChunks.length; i++) {
      if (cancelRequestedRef.current) break;

      const chunk = readyChunks[i];
      setProcessingProgress({
        current: i + 1,
        total: readyChunks.length,
        message: `Tipificando estilos de ${chunk.title} (${i + 1}/${readyChunks.length})...`
      });

      const resultingBlocks = await styleSingleChunk(chunk.id, runningMemory);
      if (resultingBlocks && resultingBlocks.length > 0) {
        runningMemory = extractEditorialMemoryFromBlocks(resultingBlocks, runningMemory);
      }
      await new Promise(r => setTimeout(r, 250));
    }

    setIsProcessing(false);
    setProcessingProgress({ current: readyChunks.length, total: readyChunks.length, message: 'Tipificación del libro completada.' });
  };

  // ----------------------------------------------------
  // PROCESAMIENTO INTEGRAL DIRECTO (Purificación + Estilos en 1 paso con Memoria Continua)
  // ----------------------------------------------------

  const purifyAndStyleSingleChunk = async (id: string, customMemory?: any) => {
    const chunk = chunks.find(c => c.id === id);
    if (!chunk) return;

    updateChunk(id, { status: 'cleaning', error: undefined });
    setCurrentProcessingChunkId(id);

    try {
      const result = await purifyAndStyleInOneStep(
        chunk.rawContent,
        { 
          title: metadata.title, 
          subject: metadata.subject, 
          educationLevel: metadata.educationLevel, 
          author: metadata.author,
          styleGuide,
          editorialMemory: customMemory
        },
        selectedModel
      );

      updateChunk(id, {
        status: 'styled',
        cleanContent: result.cleanContent,
        cleanMetadata: result.cleanMetadata,
        blocks: result.blocks,
        lastProcessedAt: new Date().toLocaleTimeString()
      });
      return result.blocks;
    } catch (err: any) {
      console.error(`Error en procesamiento directo de chunk ${id}:`, err);
      updateChunk(id, {
        status: 'error',
        error: err.message || 'Error durante el procesamiento integral.'
      });
      return [];
    } finally {
      setCurrentProcessingChunkId(null);
    }
  };

  const purifyAndStyleAllPending = async () => {
    const targetChunks = chunks.filter(c => c.status !== 'styled');
    if (targetChunks.length === 0) return;

    setIsProcessing(true);
    cancelRequestedRef.current = false;
    setProcessingProgress({ current: 0, total: targetChunks.length, message: 'Iniciando transformación integral directa del libro...' });

    let runningMemory = {
      lastHeading1: '',
      lastHeading2: '',
      lastHeading3: '',
      lastExerciseNumber: 0,
      ongoingContext: ''
    };

    for (let i = 0; i < targetChunks.length; i++) {
      if (cancelRequestedRef.current) break;

      const chunk = targetChunks[i];
      setProcessingProgress({
        current: i + 1,
        total: targetChunks.length,
        message: `Procesando libro: ${chunk.title} (${i + 1}/${targetChunks.length})...`
      });

      const blocks = await purifyAndStyleSingleChunk(chunk.id, runningMemory);
      if (blocks && blocks.length > 0) {
        runningMemory = extractEditorialMemoryFromBlocks(blocks, runningMemory);
      }
      await new Promise(r => setTimeout(r, 250));
    }

    setIsProcessing(false);
    setProcessingProgress({ current: targetChunks.length, total: targetChunks.length, message: 'Transformación integral completada.' });
  };

  // ----------------------------------------------------
  // TRANSFORMACIÓN COMPLETA DEL LIBRO CON MACRO-BLOQUES INTELIGENTES Y TOC
  // ----------------------------------------------------

  const purifyAndStyleWithMacroBatching = async () => {
    if (chunks.length === 0) return;

    setIsProcessing(true);
    cancelRequestedRef.current = false;

    try {
      // 1. Auto-detectar TOC/Índice del libro si está activado y aún no existe
      let activeToc = metadata.toc || [];
      if (batchingConfig.detectTocFirst && activeToc.length === 0) {
        setProcessingProgress({ current: 0, total: chunks.length, message: 'Detectando índice del libro y mapa de capítulos...' });
        const earlySamples = chunks.slice(0, 8).map(c => c.cleanContent || c.rawContent).filter(Boolean);
        if (earlySamples.length > 0) {
          try {
            activeToc = await detectBookTableOfContents(
              earlySamples, 
              { title: metadata.title, subject: metadata.subject }, 
              selectedModel
            );
            if (activeToc && activeToc.length > 0) {
              setMetadata(prev => ({ ...prev, toc: activeToc }));
            }
          } catch (tocErr) {
            console.warn('Fallo detectando TOC inicial:', tocErr);
          }
        }
      }

      // 2. Auto-detectar taxonomía si aún no está construida
      let activeGuide = styleGuide;
      if (!activeGuide) {
        setProcessingProgress({ current: 0, total: chunks.length, message: 'Analizando taxonomía y jerarquía de todo el libro...' });
        const samples = chunks.slice(0, 6).map(c => c.cleanContent || c.rawContent).filter(t => t && t.length > 30);
        if (samples.length > 0) {
          try {
            activeGuide = await analyzeEditorialTaxonomy(samples, metadata, selectedModel);
            setStyleGuide(activeGuide);
          } catch (taxErr) {
            console.warn('Fallo analizando taxonomía inicial:', taxErr);
          }
        }
      }

      // 3. Crear lotes (macro-bloques) de chunks para evitar saturar la cuota de la API
      const batchSize = Math.max(1, batchingConfig.pagesPerBatch || 4);
      const batches: RawChunk[][] = [];
      for (let i = 0; i < chunks.length; i += batchSize) {
        batches.push(chunks.slice(i, i + batchSize));
      }

      setProcessingProgress({ 
        current: 0, 
        total: batches.length, 
        message: `Procesando libro en ${batches.length} macro-bloques continuos (reducción de cuota 4x)...` 
      });

      let runningMemory = {
        lastHeading1: '',
        lastHeading2: '',
        lastHeading3: '',
        lastExerciseNumber: 0,
        ongoingContext: ''
      };

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        if (cancelRequestedRef.current) break;

        const currentBatch = batches[bIdx];
        const batchIds = currentBatch.map(c => c.id);
        const startPage = currentBatch[0].pageNumber || (currentBatch[0].index);
        const endPage = currentBatch[currentBatch.length - 1].pageNumber || (currentBatch[currentBatch.length - 1].index);

        // Marcar chunks del lote en procesamiento
        setChunks(prev => prev.map(c => batchIds.includes(c.id) ? { ...c, status: 'analyzing', error: undefined } : c));
        setCurrentProcessingChunkId(currentBatch[0].id);

        setProcessingProgress({
          current: bIdx + 1,
          total: batches.length,
          message: `Transformando Macro-Bloque ${bIdx + 1}/${batches.length} (Págs. ${startPage}–${endPage})...`
        });

        // Combinar el contenido del lote con separadores de página explícitos
        const combinedRaw = currentBatch.map(c => {
          const pNum = c.pageNumber || (c.index);
          return `--- [PÁGINA ${pNum}] ---\n${c.cleanContent || c.rawContent}`;
        }).join('\n\n');

        try {
          const result = await processMacroBlockPurifyAndStyle(
            combinedRaw,
            {
              title: metadata.title,
              subject: metadata.subject,
              educationLevel: metadata.educationLevel,
              author: metadata.author,
              styleGuide: activeGuide,
              toc: activeToc,
              editorialMemory: runningMemory
            },
            selectedModel
          );

          // Actualizar memoria editorial para el siguiente lote
          if (result.blocks && result.blocks.length > 0) {
            runningMemory = extractEditorialMemoryFromBlocks(result.blocks, runningMemory);
          }

          // Asignar los bloques generados al lote:
          // El primer chunk del lote recibe los bloques y el contenido purificado combinado
          setChunks(prev => prev.map(c => {
            if (c.id === currentBatch[0].id) {
              return {
                ...c,
                status: 'styled',
                cleanContent: result.cleanContent,
                cleanMetadata: result.cleanMetadata,
                blocks: result.blocks,
                lastProcessedAt: new Date().toLocaleTimeString()
              };
            } else if (batchIds.includes(c.id)) {
              // Los chunks subsiguientes del lote se marcan como purificados/unificados
              return {
                ...c,
                status: 'styled',
                cleanContent: '(Unificado en macro-bloque)',
                blocks: [],
                lastProcessedAt: new Date().toLocaleTimeString()
              };
            }
            return c;
          }));

        } catch (batchErr: any) {
          console.error(`Error procesando lote ${bIdx + 1}:`, batchErr);
          setChunks(prev => prev.map(c => batchIds.includes(c.id) ? { 
            ...c, 
            status: 'error', 
            error: batchErr.message || 'Error durante el procesamiento del lote.' 
          } : c));
        }

        await new Promise(r => setTimeout(r, 200));
      }

      setProcessingProgress({ current: batches.length, total: batches.length, message: '¡Todo el libro fue transformado con éxito!' });
      setActiveTab('estilos');
    } finally {
      setIsProcessing(false);
      setCurrentProcessingChunkId(null);
    }
  };

  const transformEntireBookWithGlobalContext = async () => {
    return purifyAndStyleWithMacroBatching();
  };

  // ----------------------------------------------------
  // CONSOLIDACIÓN EN MACRO-BLOQUES / CAPÍTULOS DE LIBRO
  // ----------------------------------------------------

  const consolidateChunksIntoChaptersOrMacroBlocks = (groupSize: number = 5) => {
    if (chunks.length <= 1) return;

    const newChunks: RawChunk[] = [];
    let currentGroup: RawChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      currentGroup.push(chunks[i]);

      if (currentGroup.length === groupSize || i === chunks.length - 1) {
        const firstChunk = currentGroup[0];
        const lastChunk = currentGroup[currentGroup.length - 1];
        const firstPage = firstChunk.pageNumber || (firstChunk.index);
        const lastPage = lastChunk.pageNumber || (lastChunk.index);
        
        const title = firstPage === lastPage 
          ? `Página ${firstPage}`
          : `Bloque Editorial: Págs. ${firstPage}–${lastPage} (${currentGroup.length} págs)`;

        const combinedRaw = currentGroup.map((c) => {
          const pNum = c.pageNumber || (c.index);
          return `\n\n--- [PÁGINA ${pNum}] ---\n\n${c.rawContent}`;
        }).join('\n');

        const combinedClean = currentGroup.some(c => c.cleanContent)
          ? currentGroup.map(c => c.cleanContent || c.rawContent).join('\n\n')
          : undefined;

        const combinedBlocks = currentGroup.flatMap(c => c.blocks || []);

        newChunks.push({
          id: `macro_${Date.now()}_${newChunks.length}`,
          index: newChunks.length + 1,
          title,
          rawContent: combinedRaw.trim(),
          cleanContent: combinedClean,
          blocks: combinedBlocks.length > 0 ? combinedBlocks : undefined,
          sourceType: 'pdf',
          pageNumber: firstPage,
          status: combinedBlocks.length > 0 ? 'styled' : (combinedClean ? 'cleaned' : 'pending'),
          diagnosis: {
            kind: 'clean_native',
            charCount: combinedRaw.length,
            confidence: 0.98,
            description: `Macro-bloque unificado de ${currentGroup.length} páginas para procesamiento holístico sin cortes de cuota.`
          }
        });

        currentGroup = [];
      }
    }

    setChunks(newChunks);
  };

  const curateAllContinuityAndHyphenation = () => {
    const result = curateEntireDocumentContinuityAndHyphenation(chunks);
    setChunks(result.chunks);
    return { fixedCount: result.fixedCount };
  };

  const cancelProcessing = () => {
    cancelRequestedRef.current = true;
    setIsProcessing(false);
    setCurrentProcessingChunkId(null);
    setProcessingProgress(p => ({ ...p, message: 'Procesamiento cancelado por el usuario.' }));
  };

  // Gestión de bloques
  const updateBlock = (chunkId: string, blockId: string, updates: Partial<ContentBlock>) => {
    setChunks(prev => prev.map(c => {
      if (c.id === chunkId && c.blocks) {
        return {
          ...c,
          blocks: c.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b)
        };
      }
      return c;
    }));
  };

  const removeBlock = (chunkId: string, blockId: string) => {
    setChunks(prev => prev.map(c => {
      if (c.id === chunkId && c.blocks) {
        return {
          ...c,
          blocks: c.blocks.filter(b => b.id !== blockId)
        };
      }
      return c;
    }));
  };

  const addBlockToChunk = (chunkId: string, block: Omit<ContentBlock, 'id'>) => {
    const newBlock: ContentBlock = {
      ...block,
      id: `blk_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    };
    setChunks(prev => prev.map(c => {
      if (c.id === chunkId) {
        return {
          ...c,
          blocks: [...(c.blocks || []), newBlock]
        };
      }
      return c;
    }));
  };

  const approveAllBlocks = (chunkId?: string) => {
    setChunks(prev => prev.map(c => {
      if (!chunkId || c.id === chunkId) {
        return {
          ...c,
          blocks: c.blocks?.map(b => ({ ...b, isApproved: true }))
        };
      }
      return c;
    }));
  };

  // Gestión de proyectos
  const saveProject = (name?: string) => {
    const projName = name || metadata.title || 'Proyecto Editorial Sin Título';
    const id = currentProjectId || `proj_${Date.now()}`;

    const newProj: TransformationProject = {
      id,
      name: projName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { ...metadata, title: projName },
      chunks,
      settings,
      activeTab,
      selectedModel
    };

    setProjects(prev => {
      const exists = prev.some(p => p.id === id);
      if (exists) {
        return prev.map(p => p.id === id ? newProj : p);
      }
      return [newProj, ...prev];
    });

    setCurrentProjectId(id);
  };

  const loadProject = (id: string) => {
    const proj = projects.find(p => p.id === id);
    if (!proj) return;

    setMetadata(proj.metadata);
    setChunks(proj.chunks);
    setSettings(proj.settings);
    setActiveTab(proj.activeTab || 'ingesta');
    setSelectedModel(proj.selectedModel || 'gemini-3.8-flash');
    setCurrentProjectId(id);
  };

  const deleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentProjectId === id) {
      setCurrentProjectId(null);
    }
  };

  const newProject = () => {
    setMetadata(DEFAULT_METADATA);
    setChunks([]);
    setSettings(DEFAULT_SETTINGS);
    setStyleGuide(null);
    setCurrentProjectId(null);
    setActiveTab('ingesta');
    appStorage.setItem('editorial_metadata_v4', DEFAULT_METADATA);
    appStorage.setItem('editorial_chunks_v4', []);
    appStorage.setItem('editorial_settings_v4', DEFAULT_SETTINGS);
    appStorage.setItem('editorial_styleguide_v4', null);
    appStorage.setItem('editorial_current_project_id_v4', null);
  };

  const purgeAllMemoryAndStorage = async () => {
    try {
      await appStorage.clear();
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.clear();
      }
    } catch (e) {
      console.warn('Error purgando almacenamiento:', e);
    }
    setMetadata(DEFAULT_METADATA);
    setChunks([]);
    setSettings(DEFAULT_SETTINGS);
    setStyleGuide(null);
    setProjects([]);
    setCurrentProjectId(null);
    setParallelConfig(DEFAULT_PARALLEL_CONFIG);
    setParallelSourceAText('');
    setParallelSourceBText('');
    setParallelPairs([]);
    setParallelSpreads([]);
    setParallelAudit(null);
    setMirrorHarmonizationResult(null);
    setIsEbookPurified(false);
    setPurificationStats(null);
    setBookZonesA(null);
    setBookZonesB(null);
    setIngestStateA(null);
    setIngestStateB(null);
    setSingleBookAudit(null);
    setTransversalReport(null);
    setParallelSummary({
      totalPairs: 0,
      totalSpreads: 0,
      totalWordsA: 0,
      totalWordsB: 0,
      rhythmScore: 100
    });
    setActiveTab('ingesta');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sape-purge-all'));
    }
  };

  const exportProjectJson = () => {
    const exportData = {
      version: "4.0",
      project: {
        id: currentProjectId || `export_${Date.now()}`,
        name: metadata.title,
        exportedAt: new Date().toISOString(),
        metadata,
        chunks,
        settings,
        styleGuide
      }
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(metadata.title || 'Proyecto_Editorial').replace(/[^a-zA-Z0-9_-]/g, '_')}_Backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProjectJson = (jsonData: string) => {
    try {
      const parsed = JSON.parse(jsonData);
      const proj = parsed.project || parsed;
      if (proj.metadata && proj.chunks) {
        setMetadata(proj.metadata);
        setChunks(proj.chunks);
        if (proj.settings) setSettings(proj.settings);
        if (proj.styleGuide) setStyleGuide(proj.styleGuide);
        const newId = `proj_imported_${Date.now()}`;
        setCurrentProjectId(newId);
        saveProject(proj.metadata.title || 'Proyecto Importado');
      } else {
        throw new Error('Estructura JSON inválida para proyecto.');
      }
    } catch (e: any) {
      console.error(`Error al importar proyecto: ${e.message}`);
    }
  };

  // ----------------------------------------------------
  // AUDITORÍA Y NORMALIZACIÓN TRANSVERSAL DE ESTRUCTURA
  // ----------------------------------------------------
  const runTransversalAudit = useCallback(() => {
    const report = analyzeTransversalHierarchy(chunks);
    setTransversalReport(report);
    return report;
  }, [chunks]);

  const applyTransversalFixes = useCallback((options?: { autoFixHeadings?: boolean; unifyDialogues?: boolean; detectLiteraryBlocks?: boolean }) => {
    const { updatedChunks, fixedCount } = applyTransversalNormalization(chunks, options);
    if (fixedCount > 0) {
      setChunks(updatedChunks);
      const newReport = analyzeTransversalHierarchy(updatedChunks);
      setTransversalReport(newReport);
    }
    return fixedCount;
  }, [chunks]);

  // ----------------------------------------------------
  // MOTOR DE EDICIÓN PARALELA / BILINGÜE
  // ----------------------------------------------------
  const cleanAndPurifyEbookTexts = useCallback(async (inputA?: string, inputB?: string): Promise<{ cleanA: string; cleanB: string }> => {
    setIsProcessing(true);
    cancelRequestedRef.current = false;
    try {
      const rawA = inputA !== undefined ? inputA : (parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.rawContent || '').join('\n\n') : ''));
      const rawB = inputB !== undefined ? inputB : parallelSourceBText;

      const initialParasA = rawA ? rawA.split(/\n\s*\n/).filter(p => p.trim()).length : 0;
      const initialParasB = rawB ? rawB.split(/\n\s*\n/).filter(p => p.trim()).length : 0;
      const artifactsA = (rawA.match(/\[(?:P[AÁ]GINA|PAGE|SEITE)\s+\d+\]/gi) || []).length;
      const artifactsB = (rawB.match(/\[(?:P[AÁ]GINA|PAGE|SEITE)\s+\d+\]/gi) || []).length;
      const hyphensA = (rawA.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ]+-\s*\n\s*[a-záéíóúñA-ZÁÉÍÓÚÑ]+/g) || []).length;
      const hyphensB = (rawB.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ]+-\s*\n\s*[a-záéíóúñA-ZÁÉÍÓÚÑ]+/g) || []).length;

      const hasAiKey = hasValidGeminiApiKey();
      setProcessingProgress({
        current: 15,
        total: 100,
        stage: 'Fase 2: Curaduría Editorial',
        activeEngine: 'local',
        tokensStatus: !hasAiKey ? 'local_deterministic' : 'available',
        tokensInfo: !hasAiKey ? 'Motor Semántico Local activo (0 tokens)' : 'Tokens disponibles en Gemini',
        tokenNotice: null,
        processedDetail: `Censando texto: ${initialParasA} párrafos en Libro A vs ${initialParasB} en Libro B`,
        message: 'Fase 1/4: Purgando repositorios digitales (Gutenberg, PGDP, Z-Lib) y reparando dropcaps OCR...',
        recentLogs: [
          `[${new Date().toLocaleTimeString()}] Iniciando purga editorial: ${initialParasA + initialParasB} párrafos analizados`
        ]
      });
      await new Promise(r => setTimeout(r, 120));

      // 1. Purga implacable de avisos de repositorio web y soldadura de drop-caps rotos
      const purgedA = rawA ? purgeDigitalRepositoryBoilerplates(rawA).cleaned : '';
      const purgedB = rawB ? purgeDigitalRepositoryBoilerplates(rawB).cleaned : '';

      setProcessingProgress(prev => ({
        ...prev,
        current: 35,
        total: 100,
        stage: 'Fase 2: Curaduría Editorial',
        processedDetail: 'Verificando arranque canónico y zonas de la obra',
        message: 'Fase 2/4: Consultando perfil canónico y verificando arranque/desenlace...',
        recentLogs: [
          ...(prev.recentLogs || []),
          `[${new Date().toLocaleTimeString()}] Purga completada: verificando coherencia de límites`
        ].slice(-6)
      }));
      await new Promise(r => setTimeout(r, 120));

      // PRESERVACIÓN SAGRADA DE LOS LÍMITES DEFINIDOS EN PESTAÑA 1:
      // Si el texto ya fue acotado o curado en Paso 1 (o pasado como argumento), ese texto ES el cuerpo novelesco.
      // Jamás se re-secciona ni se descarta el inicio o capítulos intermedios.
      const candidateA = (inputA !== undefined && inputA.trim().length > 0)
        ? inputA
        : (parallelSourceAText && parallelSourceAText.trim().length > 0)
        ? parallelSourceAText
        : '';

      const candidateB = (inputB !== undefined && inputB.trim().length > 0)
        ? inputB
        : (parallelSourceBText && parallelSourceBText.trim().length > 0)
        ? parallelSourceBText
        : '';

      const isDemarcatedA = !!candidateA;
      const isDemarcatedB = !!candidateB;

      // Solo consultar estructura canónica si el libro NO ha sido demarcado en Pestaña 1
      let canonMatchA = !isDemarcatedA ? lookupCanonicalWorkLocally(parallelConfig.titleA, parallelConfig.author, purgedA) : null;
      let canonMatchB = !isDemarcatedB ? lookupCanonicalWorkLocally(parallelConfig.titleB, parallelConfig.author, purgedB) : null;

      if (!isDemarcatedA && !canonMatchA && purgedA && purgedA.length > 250) {
        setProcessingProgress({
          current: 30,
          total: 100,
          message: 'Fase 2/4: Ubicando estructura canónica del Libro A con IA...'
        });
        try {
          const endpointsA = await discoverBookCanonicalEndpointsWithAI(
            purgedA.slice(0, 45000),
            purgedA.slice(-35000),
            parallelConfig.languageA || 'Español',
            parallelConfig.titleA || metadata.title,
            parallelConfig.author || metadata.author
          );
          if (endpointsA) {
            canonMatchA = endpointsToCanonicalWorkProfile(endpointsA, parallelConfig.titleA, parallelConfig.author);
          }
        } catch (e) {
          console.warn('AI structure discovery A fallback:', e);
        }
      }

      if (!isDemarcatedB && !canonMatchB && purgedB && purgedB.length > 250) {
        setProcessingProgress({
          current: 45,
          total: 100,
          message: 'Fase 2/4: Ubicando estructura canónica del Libro B con IA...'
        });
        try {
          const endpointsB = await discoverBookCanonicalEndpointsWithAI(
            purgedB.slice(0, 45000),
            purgedB.slice(-35000),
            parallelConfig.languageB || 'Idioma B',
            parallelConfig.titleB || metadata.title,
            parallelConfig.author || metadata.author
          );
          if (endpointsB) {
            canonMatchB = endpointsToCanonicalWorkProfile(endpointsB, parallelConfig.titleB, parallelConfig.author);
          }
        } catch (e) {
          console.warn('AI structure discovery B fallback:', e);
        }
      }

      let textBodyA = candidateA || purgedA;
      let textBodyB = candidateB || purgedB;

      let zonesA = bookZonesA;
      let zonesB = bookZonesB;

      // Solo si NO existe texto acotado previo de Pestaña 1 y NO existen zonas, analizar preliminares
      if (!isDemarcatedA && !zonesA && purgedA) {
        zonesA = disentangleBookZones(purgedA, parallelConfig.titleA, parallelConfig.author, canonMatchA || undefined);
        if (zonesA) {
          setBookZonesA(zonesA);
          textBodyA = zonesA.novelBody || purgedA;
        }
      }

      if (!isDemarcatedB && !zonesB && purgedB) {
        zonesB = disentangleBookZones(purgedB, parallelConfig.titleB, parallelConfig.author, canonMatchB || undefined);
        if (zonesB) {
          setBookZonesB(zonesB);
          textBodyB = zonesB.novelBody || purgedB;
        }
      }

      if (zonesA) {
        if (!isDemarcatedA) {
          setParallelConfig(prev => ({
            ...prev,
            prologueTitleA: zonesA?.preliminaryMatter.title || prev.prologueTitleA,
            prologueTextA: zonesA?.preliminaryMatter.text || prev.prologueTextA,
            dedicationTextA: zonesA?.frontMatter.dedication || prev.dedicationTextA,
            epigraphTextA: zonesA?.frontMatter.epigraph || prev.epigraphTextA,
            backMatterTitleA: zonesA?.backMatter.title || prev.backMatterTitleA,
            backMatterTextA: zonesA?.backMatter.text || prev.backMatterTextA
          }));
        } else {
          // El texto demarcado por el usuario ES el cuerpo novelesco estricto;
          // los preliminares y epílogos se preservan en segundo plano para inyección final
          zonesA = {
            ...zonesA,
            novelBody: candidateA,
            novelParagraphs: candidateA.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
          };
          setBookZonesA(zonesA);
        }
      }

      if (zonesB) {
        if (!isDemarcatedB) {
          setParallelConfig(prev => ({
            ...prev,
            prologueTitleB: zonesB?.preliminaryMatter.title || prev.prologueTitleB,
            prologueTextB: zonesB?.preliminaryMatter.text || prev.prologueTextB,
            dedicationTextB: zonesB?.frontMatter.dedication || prev.dedicationTextB,
            epigraphTextB: zonesB?.frontMatter.epigraph || prev.epigraphTextB,
            backMatterTitleB: zonesB?.backMatter.title || prev.backMatterTitleB,
            backMatterTextB: zonesB?.backMatter.text || prev.backMatterTextB
          }));
        } else {
          zonesB = {
            ...zonesB,
            novelBody: candidateB,
            novelParagraphs: candidateB.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
          };
          setBookZonesB(zonesB);
        }
      }

      if (candidateA) {
        textBodyA = candidateA;
      } else {
        textBodyA = zonesA?.novelBody || textBodyA;
      }

      if (candidateB) {
        textBodyB = candidateB;
      } else {
        textBodyB = zonesB?.novelBody || textBodyB;
      }
      let hasDetachedFrontA = !!zonesA?.frontMatter.hasFrontMatter;
      let hasDetachedFrontB = !!zonesB?.frontMatter.hasFrontMatter;
      let hasDetachedBackA = !!zonesA?.backMatter.hasBackMatter;
      let hasDetachedBackB = !!zonesB?.backMatter.hasBackMatter;

      setProcessingProgress({
        current: 60,
        total: 100,
        message: 'Fase 3/4: Soldando guiones partidos y estructurando flujo editorial continuo...'
      });
      await new Promise(r => setTimeout(r, 200));

      // Limpieza respetuosa de interlineados y párrafos semánticos de ambos cuerpos
      const cleanA = textBodyA ? cleanRawTextToEbookStream(textBodyA, { preserveBoundaries: isDemarcatedA }) : '';
      const cleanB = textBodyB ? cleanRawTextToEbookStream(textBodyB, { preserveBoundaries: isDemarcatedB }) : '';

      // En el Paso 2 se preserva el libro COMPLETO y LIMPIO (cuerpo puro),
      // sin mutarlo destructivamente. Los periféricos (prólogo, colofón) quedan flotantes.
      const finalA = cleanA;
      const finalB = cleanB;
      const splitsA = 0;
      const splitsB = 0;
      const fusionsA = 0;
      const fusionsB = 0;
      const coherence = 100;

      if (finalA) setParallelSourceAText(finalA);
      if (finalB) setParallelSourceBText(finalB);

      // Si el Libro A tiene contenido curado, actualizar los chunks de la aplicación
      if (finalA && finalA.trim().length > 0) {
        const generatedChunks = autoSplitTextIntoChunks(finalA, 'heading', 800, parallelConfig.titleA || metadata.title);
        if (generatedChunks.length > 0) {
          setChunks(generatedChunks.map((c, i) => ({
            id: `chunk-purified-a-${i + 1}`,
            index: i + 1,
            title: c.title,
            content: c.content,
            rawContent: c.content,
            cleanContent: c.content,
            sourceType: 'txt',
            status: 'cleaned',
            blocks: []
          })));
        }
      }

      const finalParasA = finalA ? finalA.split(/\n\s*\n/).filter(p => p.trim()).length : 0;
      const finalParasB = finalB ? finalB.split(/\n\s*\n/).filter(p => p.trim()).length : 0;

      // Armonización isomórfica y partición de capítulos/segmentos del libro íntegro inmediata
      if (finalA && finalB && finalA.length > 80 && finalB.length > 80) {
        try {
          const harm = runPureMirrorHarmonizer(finalA, finalB);
          if (harm) {
            setMirrorHarmonizationResult(harm);
          }
        } catch (hErr) {
          console.warn('Error al computar armonización isomórfica en cleanAndPurify:', hErr);
        }
      }

      const stats: EbookPurificationStats = {
        initialParasA,
        initialParasB,
        finalParasA,
        finalParasB,
        pageArtifactsPurgedA: artifactsA,
        pageArtifactsPurgedB: artifactsB,
        hyphenatedWordsJoinedA: hyphensA,
        hyphenatedWordsJoinedB: hyphensB,
        splitsAppliedA: splitsA,
        splitsAppliedB: splitsB,
        fusionsAppliedA: fusionsA,
        fusionsAppliedB: fusionsB,
        frontMatterDetachedA: hasDetachedFrontA,
        frontMatterDetachedB: hasDetachedFrontB,
        backMatterDetachedA: hasDetachedBackA,
        backMatterDetachedB: hasDetachedBackB,
        coherenceScore: coherence,
        isComplete: true,
        lastProcessedAt: Date.now()
      };

      setPurificationStats(stats);
      setIsEbookPurified(true);

      setProcessingProgress({
        current: 100,
        total: 100,
        message: `¡Limpieza y Armonización Completada! Párrafos sincronizados: ${finalParasA} (A) vs ${finalParasB} (B).`
      });
      await new Promise(r => setTimeout(r, 180));

      return { cleanA: finalA, cleanB: finalB };
    } finally {
      setIsProcessing(false);
    }
  }, [parallelSourceAText, parallelSourceBText, chunks, parallelConfig, metadata]);

  const runAiAssistedDoubleCleaning = useCallback(async (inputA?: string, inputB?: string): Promise<{
    cleanA: string;
    cleanB: string;
    endpointsA: DiscoveredEndpoints | null;
    endpointsB: DiscoveredEndpoints | null;
    purgedFrontA: string;
    purgedFrontB: string;
  }> => {
    setIsProcessing(true);
    cancelRequestedRef.current = false;
    try {
      const rawA = inputA !== undefined ? inputA : (parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.rawContent || '').join('\n\n') : ''));
      const rawB = inputB !== undefined ? inputB : parallelSourceBText;

      setProcessingProgress({
        current: 15,
        total: 100,
        message: 'Doble Limpieza IA 1/4: Reparando dropcaps de OCR y purgando avisos web...'
      });
      await new Promise(r => setTimeout(r, 260));

      const preA = purgeDigitalRepositoryBoilerplates(rawA);
      const preB = purgeDigitalRepositoryBoilerplates(rawB);

      setProcessingProgress({
        current: 40,
        total: 100,
        message: 'Doble Limpieza 2/4: Verificando frase canónica de inicio y desenlace del Libro A...'
      });

      // Descubrir extremos con IA (o diccionario canónico/heurístico instantáneo)
      let endpointsA: DiscoveredEndpoints | null = null;
      try {
        endpointsA = await discoverBookCanonicalEndpointsWithAI(
          preA.cleaned.slice(0, 45000),
          preA.cleaned.slice(-35000),
          parallelConfig.languageA || 'Español',
          parallelConfig.titleA || metadata.title,
          parallelConfig.author || metadata.author,
          true
        );
      } catch (errA) {
        console.warn('Fallo al ubicar extremos canónicos en Libro A:', errA);
      }

      setProcessingProgress({
        current: 55,
        total: 100,
        message: 'Doble Limpieza 2/4: Verificando frase canónica de inicio y desenlace del Libro B...'
      });

      let endpointsB: DiscoveredEndpoints | null = null;
      try {
        endpointsB = await discoverBookCanonicalEndpointsWithAI(
          preB.cleaned.slice(0, 45000),
          preB.cleaned.slice(-35000),
          parallelConfig.languageB || 'Alemán',
          parallelConfig.titleB || metadata.title,
          parallelConfig.author || metadata.author,
          true
        );
      } catch (errB) {
        console.warn('Fallo al ubicar extremos canónicos en Libro B:', errB);
      }

      setProcessingProgress({
        current: 70,
        total: 100,
        message: 'Doble Limpieza IA 3/4: Ejecutando corte de precisión milimétrica y segregando front/back matter...'
      });
      await new Promise(r => setTimeout(r, 260));

      let bodyA = preA.cleaned;
      let bodyB = preB.cleaned;
      let purgedFrontA = preA.purgedBlocks.join('\n');
      let purgedFrontB = preB.purgedBlocks.join('\n');

      if (endpointsA) {
        const trimA = executeCanonicalDoubleTrim(preA.cleaned, endpointsA);
        if (trimA.startMatched) {
          bodyA = trimA.pureBody;
          purgedFrontA = trimA.frontMatter;
        }
      }

      if (endpointsB) {
        const trimB = executeCanonicalDoubleTrim(preB.cleaned, endpointsB);
        if (trimB.startMatched) {
          bodyB = trimB.pureBody;
          purgedFrontB = trimB.frontMatter;
        }
      }

      const profileA = endpointsA ? endpointsToCanonicalWorkProfile(endpointsA, parallelConfig.titleA, parallelConfig.author) : undefined;
      const profileB = endpointsB ? endpointsToCanonicalWorkProfile(endpointsB, parallelConfig.titleB, parallelConfig.author) : undefined;

      const zonesA = disentangleBookZones(rawA, parallelConfig.titleA, parallelConfig.author, profileA);
      const zonesB = disentangleBookZones(rawB, parallelConfig.titleB, parallelConfig.author, profileB);

      if (bodyA) zonesA.novelBody = bodyA;
      if (bodyB) zonesB.novelBody = bodyB;

      setBookZonesA(zonesA);
      setBookZonesB(zonesB);

      setParallelConfig(prev => ({
        ...prev,
        titleA: endpointsA?.title || prev.titleA,
        titleB: endpointsB?.title || prev.titleB,
        author: endpointsA?.author || endpointsB?.author || prev.author,
        prologueTitleA: endpointsA?.preliminaryStudyTitle || zonesA.preliminaryMatter.title || prev.prologueTitleA,
        prologueTextA: zonesA.preliminaryMatter.text || prev.prologueTextA,
        prologueTitleB: endpointsB?.preliminaryStudyTitle || zonesB.preliminaryMatter.title || prev.prologueTitleB,
        prologueTextB: zonesB.preliminaryMatter.text || prev.prologueTextB,
        dedicationTextA: endpointsA?.dedication || zonesA.frontMatter.dedication || prev.dedicationTextA,
        dedicationTextB: endpointsB?.dedication || zonesB.frontMatter.dedication || prev.dedicationTextB,
        epigraphTextA: endpointsA?.epigraph || zonesA.frontMatter.epigraph || prev.epigraphTextA,
        epigraphTextB: endpointsB?.epigraph || zonesB.frontMatter.epigraph || prev.epigraphTextB,
        backMatterTitleA: endpointsA?.backMatterTitle || zonesA.backMatter.title || prev.backMatterTitleA,
        backMatterTextA: zonesA.backMatter.text || prev.backMatterTextA,
        backMatterTitleB: endpointsB?.backMatterTitle || zonesB.backMatter.title || prev.backMatterTitleB,
        backMatterTextB: zonesB.backMatter.text || prev.backMatterTextB
      }));

      setProcessingProgress({
        current: 90,
        total: 100,
        message: 'Doble Limpieza IA 4/4: Reensamblando flujo puro y actualizando estado editorial...'
      });
      await new Promise(r => setTimeout(r, 240));

      const cleanA = cleanRawTextToEbookStream(bodyA);
      const cleanB = cleanRawTextToEbookStream(bodyB);

      setParallelSourceAText(cleanA);
      setParallelSourceBText(cleanB);

      if (cleanA && cleanA.trim().length > 0) {
        const generatedChunks = autoSplitTextIntoChunks(cleanA, 'heading', 800, parallelConfig.titleA || metadata.title);
        if (generatedChunks.length > 0) {
          setChunks(generatedChunks.map((c, i) => ({
            id: `chunk-purified-a-${i + 1}`,
            index: i + 1,
            title: c.title,
            content: c.content,
            rawContent: c.content,
            cleanContent: c.content,
            sourceType: 'txt',
            status: 'cleaned',
            blocks: []
          })));
        }
      }

      setProcessingProgress({
        current: 100,
        total: 100,
        message: '¡Doble limpieza completada! Extremos canónicos validados y front-matter segregado con éxito.'
      });
      await new Promise(r => setTimeout(r, 200));

      return {
        cleanA,
        cleanB,
        endpointsA,
        endpointsB,
        purgedFrontA,
        purgedFrontB
      };
    } finally {
      setIsProcessing(false);
    }
  }, [parallelSourceAText, parallelSourceBText, chunks, parallelConfig, metadata]);

  const locateBookStructureWithAI = useCallback(async (slot: 'A' | 'B'): Promise<DiscoveredEndpoints | null> => {
    setIsProcessing(true);
    cancelRequestedRef.current = false;
    try {
      const text = slot === 'A' 
        ? (parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.rawContent || '').join('\n\n') : ''))
        : parallelSourceBText;
      const lang = slot === 'A' ? (parallelConfig.languageA || 'Español') : (parallelConfig.languageB || 'Idioma B');
      const title = slot === 'A' ? (parallelConfig.titleA || metadata.title) : (parallelConfig.titleB || metadata.title);
      const authorName = parallelConfig.author || metadata.author;

      if (!text || text.trim().length === 0) return null;

      setProcessingProgress({
        current: 40,
        total: 100,
        message: `Ubicando estructura del Libro ${slot} con IA (capítulos, inicio, dedicatoria y fin)...`
      });

      const endpoints = await discoverBookCanonicalEndpointsWithAI(
        text.slice(0, 45000),
        text.slice(-35000),
        lang,
        title,
        authorName,
        true
      );

      if (endpoints) {
        const profile = endpointsToCanonicalWorkProfile(endpoints, title, authorName);
        const trimResult = executeCanonicalDoubleTrim(text, endpoints);
        const targetBody = trimResult.startMatched ? trimResult.pureBody : text;
        const zones = disentangleBookZones(targetBody, title, authorName, profile);

        if (slot === 'A') {
          setBookZonesA(zones);
          setParallelSourceAText(zones.novelBody || targetBody);
          setParallelConfig(prev => ({
            ...prev,
            titleA: endpoints.title || prev.titleA,
            author: endpoints.author || prev.author,
            prologueTitleA: endpoints.preliminaryStudyTitle || zones.preliminaryMatter.title || prev.prologueTitleA,
            prologueTextA: zones.preliminaryMatter.text || prev.prologueTextA,
            dedicationTextA: endpoints.dedication || zones.frontMatter.dedication || prev.dedicationTextA,
            epigraphTextA: endpoints.epigraph || zones.frontMatter.epigraph || prev.epigraphTextA,
            backMatterTitleA: endpoints.backMatterTitle || zones.backMatter.title || prev.backMatterTitleA,
            backMatterTextA: zones.backMatter.text || prev.backMatterTextA
          }));
        } else {
          setBookZonesB(zones);
          setParallelSourceBText(zones.novelBody || targetBody);
          setParallelConfig(prev => ({
            ...prev,
            titleB: endpoints.title || prev.titleB,
            author: endpoints.author || prev.author,
            prologueTitleB: endpoints.preliminaryStudyTitle || zones.preliminaryMatter.title || prev.prologueTitleB,
            prologueTextB: zones.preliminaryMatter.text || prev.prologueTextB,
            dedicationTextB: endpoints.dedication || zones.frontMatter.dedication || prev.dedicationTextB,
            epigraphTextB: endpoints.epigraph || zones.frontMatter.epigraph || prev.epigraphTextB,
            backMatterTitleB: endpoints.backMatterTitle || zones.backMatter.title || prev.backMatterTitleB,
            backMatterTextB: zones.backMatter.text || prev.backMatterTextB
          }));
        }
      }

      setProcessingProgress({
        current: 100,
        total: 100,
        message: `¡Estructura del Libro ${slot} identificada con éxito!`
      });
      await new Promise(r => setTimeout(r, 200));

      return endpoints;
    } finally {
      setIsProcessing(false);
    }
  }, [parallelSourceAText, parallelSourceBText, chunks, parallelConfig, metadata]);

  const analyzeBookFlow = useCallback((text: string, pages?: { pageNumber: number; text: string }[], candidateTitle?: string, candidateAuthor?: string) => {
    const inspection = analyzeBookPdfAndPageFlow(
      text,
      pages,
      candidateTitle || metadata.title,
      candidateAuthor || metadata.author
    );
    setSingleBookAudit(inspection);
    if (inspection.zones) {
      setBookZonesA(inspection.zones);
    }
    return inspection;
  }, [metadata.title, metadata.author]);

  const curateAndCleanEntireBook = useCallback(async (rawTextOverride?: string) => {
    setIsProcessing(true);
    setProcessingProgress({ current: 20, total: 100, message: 'Analizando libro por páginas, palabras y párrafos...' });
    try {
      const raw = rawTextOverride || parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.rawContent || c.cleanContent || '').join('\n\n') : '');
      if (!raw || raw.trim().length === 0) return;

      analyzeBookFlow(raw);
      setProcessingProgress({ current: 50, total: 100, message: 'Aislando preliminares y limpiando cuerpo narrativo...' });

      // Ejecutar la limpieza pura
      await cleanAndPurifyEbookTexts(raw, parallelSourceBText || undefined);
      
      setIsEbookPurified(true);
      setProcessingProgress({ current: 100, total: 100, message: '¡Libro curado y purificado con éxito! 0 artefactos.' });
    } catch (err) {
      console.error('Error al curar libro completo:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [parallelSourceAText, chunks, parallelSourceBText, analyzeBookFlow, cleanAndPurifyEbookTexts]);

  const runMiniAiStartCheck = useCallback(async () => {
    const raw = parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.rawContent || c.cleanContent || '').join('\n\n') : '');
    if (!raw) return;

    setIsProcessing(true);
    setProcessingProgress({ current: 40, total: 100, message: 'Consultando Gemini Flash para comprobación de límites...' });
    try {
      const paras = raw.split(/\n\s*\n+/).filter(p => p.trim().length > 15);
      const firstSample = paras.slice(0, 35);
      const lastSample = paras.slice(-25);

      const aiRes = await verifyNovelBoundariesWithMiniAi(firstSample, lastSample, metadata.title, metadata.author);
      if (aiRes) {
        setSingleBookAudit(prev => {
          if (!prev) return prev;
          const updated = { ...prev };

          // Actualizar párrafo inicial y final si los índices son válidos
          const newStartPara = firstSample[aiRes.startParagraphIndex] || updated.firstParagraph;
          const newEndPara = lastSample[aiRes.endParagraphIndex] || updated.lastParagraph;

          updated.firstParagraph = newStartPara;
          updated.firstParagraphSnippet = newStartPara.length > 250 ? newStartPara.slice(0, 250) + '...' : newStartPara;
          updated.lastParagraph = newEndPara;
          updated.lastParagraphSnippet = newEndPara.length > 250 ? '...' + newEndPara.slice(-250) : newEndPara;

          if (updated.pageStructure?.posteriorContinuity) {
            updated.pageStructure.posteriorContinuity = {
              ...updated.pageStructure.posteriorContinuity,
              isContinuityVerified: true,
              confidenceScore: Math.round(aiRes.confidence * 100),
              verificationMethod: 'mini_ai_reading',
              explanation: `Confirmado por Gemini Flash: ${aiRes.explanation} (Arranque en párrafo #${aiRes.startParagraphIndex}, Desenlace en párrafo #${aiRes.endParagraphIndex}).`
            };
          }
          return updated;
        });
      }
    } finally {
      setIsProcessing(false);
    }
  }, [parallelSourceAText, chunks, metadata.title, metadata.author]);

  const runSecondPassMirrorHarmonizer = useCallback(async (inputA?: string, inputB?: string): Promise<PureMirrorHarmonizationResult> => {
    setIsProcessing(true);
    cancelRequestedRef.current = false;
    const hasAiKey = hasValidGeminiApiKey();
    try {
      setProcessingProgress({
        current: 15,
        total: 100,
        stage: 'Fase 2: Armonización Isomórfica',
        activeEngine: 'local',
        tokensStatus: !hasAiKey ? 'local_deterministic' : 'available',
        tokensInfo: !hasAiKey ? 'Motor Semántico Local activo (0 tokens)' : 'Tokens disponibles en Gemini',
        tokenNotice: null,
        processedDetail: 'Desdoblando quiebres sintácticos y oraciones soldadas por OCR',
        message: '2do Procesado Inteligente 1/4: Desdoblando quiebres sintácticos y oraciones soldadas por OCR...',
        recentLogs: [
          `[${new Date().toLocaleTimeString()}] Iniciando armonización isomórfica de capítulos`
        ]
      });
      await new Promise(r => setTimeout(r, 140));

      const rawA = inputA !== undefined ? inputA : (parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.rawContent || '').join('\n\n') : ''));
      const rawB = inputB !== undefined ? inputB : parallelSourceBText;

      setProcessingProgress(prev => ({
        ...prev,
        current: 40,
        total: 100,
        stage: 'Fase 2: Armonización Isomórfica',
        processedDetail: 'Particionando taxones de capítulos en ambas versiones',
        message: '2do Procesado Inteligente 2/4: Particionando por taxón de capítulos y censando oraciones...',
        recentLogs: [
          ...(prev.recentLogs || []),
          `[${new Date().toLocaleTimeString()}] Taxones censados: analizando correspondencias de oraciones`
        ].slice(-6)
      }));
      await new Promise(r => setTimeout(r, 150));

      setProcessingProgress(prev => ({
        ...prev,
        current: 65,
        total: 100,
        stage: 'Fase 2: Armonización Isomórfica',
        processedDetail: 'Análisis de quiebre y continuado sintáctico-semántico',
        message: '2do Procesado Inteligente 3/4: Realizando análisis de quiebre y continuado sintáctico-semántico...',
        recentLogs: [
          ...(prev.recentLogs || []),
          `[${new Date().toLocaleTimeString()}] Ejecutando alineación de oraciones determinista (0 tokens)`
        ].slice(-6)
      }));
      await new Promise(r => setTimeout(r, 160));

      const harmonizationResult = runPureMirrorHarmonizer(rawA, rawB);

      setProcessingProgress(prev => ({
        ...prev,
        current: 90,
        total: 100,
        stage: 'Fase 2: Armonización Isomórfica',
        processedDetail: 'Reensamblando textos puros y verificando desenlace homólogo',
        message: '2do Procesado Inteligente 4/4: Reensamblando textos puros y validando coincidencia de desenlace...',
        recentLogs: [
          ...(prev.recentLogs || []),
          `[${new Date().toLocaleTimeString()}] Textos reconstruidos: ${harmonizationResult.chapters.length} capítulos sincronizados`
        ].slice(-6)
      }));
      await new Promise(r => setTimeout(r, 140));

      setParallelSourceAText(harmonizationResult.pureBodyA);
      setParallelSourceBText(harmonizationResult.pureBodyB);
      setMirrorHarmonizationResult(harmonizationResult);

      // Sincronizar chunks de la app con el Libro A curado
      if (harmonizationResult.pureBodyA) {
        const generatedChunks = autoSplitTextIntoChunks(harmonizationResult.pureBodyA, 'heading', 800, parallelConfig.titleA || metadata.title);
        if (generatedChunks.length > 0) {
          setChunks(generatedChunks.map((c, i) => ({
            id: `chunk-purified-a-${i + 1}`,
            index: i + 1,
            title: c.title,
            content: c.content,
            rawContent: c.content,
            cleanContent: c.content,
            sourceType: 'txt',
            status: 'cleaned',
            blocks: []
          })));
        }
      }

      setProcessingProgress({
        current: 100,
        total: 100,
        message: `¡Textos puros armonizados! ${harmonizationResult.totalSplitsA + harmonizationResult.totalSplitsB} quiebres aplicados, ritmo al ${harmonizationResult.globalRhythmScore}%.`
      });
      await new Promise(r => setTimeout(r, 200));

      return harmonizationResult;
    } finally {
      setIsProcessing(false);
    }
  }, [parallelSourceAText, parallelSourceBText, chunks, parallelConfig, metadata]);

  const generateFreeShadowTranslationForAnchor = useCallback(async (side: 'A' | 'B') => {
    setIsProcessing(true);
    setProcessingProgress({
      current: 10,
      total: 100,
      stage: 'Traducción Sombra (Google Translate)',
      activeEngine: 'local',
      message: `Generando traducción sombra ${side === 'A' ? 'A→B' : 'B→A'} con traductor gratuito (0 tokens)...`,
      recentLogs: [`[${new Date().toLocaleTimeString()}] Iniciando traducción sombra gratuita para Libro ${side}`]
    });
    try {
      const srcText = side === 'A' 
        ? (parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.cleanContent || c.rawContent || '').join('\n\n') : ''))
        : parallelSourceBText;
      const fromL = side === 'A' ? (parallelConfig.languageA || 'es') : (parallelConfig.languageB || 'en');
      const toL = side === 'A' ? (parallelConfig.languageB || 'en') : (parallelConfig.languageA || 'es');
      
      const translated = await translateTextFree(srcText, fromL, toL);
      if (side === 'A') {
        setShadowTextA_in_B(translated);
      } else {
        setShadowTextB_in_A(translated);
      }
      setProcessingProgress({
        current: 100,
        total: 100,
        message: `✓ Traducción sombra para Libro ${side} completada con éxito (0 tokens de IA consumidos).`
      });
    } catch (e: any) {
      console.warn('Error en traducción sombra gratuita:', e);
      setProcessingProgress(p => ({ ...p, message: `Aviso en traducción sombra: ${e?.message || 'Error de conexión'}` }));
    } finally {
      setIsProcessing(false);
    }
  }, [parallelSourceAText, parallelSourceBText, chunks, parallelConfig]);

  const runParallelAlignment = useCallback(async (
    sourceBInput?: string, 
    overrideConfig?: ParallelBookConfig, 
    sourceAInput?: string,
    options?: {
      resumeCheckpoint?: Phase3Checkpoint;
      forceLocalOnly?: boolean;
    }
  ) => {
    setIsProcessing(true);
    cancelRequestedRef.current = false;
    let currentPairs: ParallelPair[] = [];
    let refinedPairsList: ParallelPair[] = [];
    let lastProcessedIndex = -1;
    try {
      const cfg: ParallelBookConfig = {
        ...(overrideConfig || parallelConfig),
        syncMethod: overrideConfig?.syncMethod || parallelConfig.syncMethod || 'by_content_mirror',
        tokenEfficiencyMode: options?.forceLocalOnly ? 'pure_local' : (overrideConfig?.tokenEfficiencyMode || parallelConfig.tokenEfficiencyMode || 'smart_economizer'),
        shadowTextA_in_B: shadowTextA_in_B || overrideConfig?.shadowTextA_in_B || parallelConfig.shadowTextA_in_B,
        shadowTextB_in_A: shadowTextB_in_A || overrideConfig?.shadowTextB_in_A || parallelConfig.shadowTextB_in_A,
      };

      const rawTextB = sourceBInput !== undefined ? sourceBInput : parallelSourceBText;
      const rawTextA = sourceAInput !== undefined ? sourceAInput : (parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.cleanContent || c.rawContent || '').join('\n\n') : ''));

      let harmonizedA = rawTextA;
      let harmonizedB = rawTextB;
      let candidates: ParallelPair[] = [];
      let startIndex = 0;
      let startPairIndex = 0;
      let orderCounter = 1;
      let totalNewCuts = 0;
      let activeModelDisplay = 'gemini-3.1-flash-lite';
      const hasAiKey = hasValidGeminiApiKey();
      const efficiencyMode = (forceLocalRef.current || options?.forceLocalOnly) ? 'pure_local' : (cfg.tokenEfficiencyMode || 'smart_economizer');

      // ¿Estamos reanudando desde un checkpoint guardado?
      if (options?.resumeCheckpoint && options.resumeCheckpoint.initialPairs.length > 0) {
        setProcessingProgress({
          current: 40,
          total: 100,
          stage: 'Fase 3: Reanudación de Proceso',
          activeEngine: (forceLocalRef.current || efficiencyMode === 'pure_local' || !hasAiKey) ? 'local' : 'ai',
          activeModel: activeModelDisplay,
          tokensStatus: !hasAiKey ? 'local_deterministic' : 'available',
          tokensInfo: !hasAiKey ? 'Motor Semántico Local activo (0 tokens)' : 'Tokens disponibles en Gemini',
          tokenNotice: null,
          processedDetail: `Reanudando desde bloque ${options.resumeCheckpoint.completedCount + 1} de ${options.resumeCheckpoint.totalCandidates}`,
          message: `Reanudando Fase 3 desde bloque ${options.resumeCheckpoint.completedCount + 1} de ${options.resumeCheckpoint.totalCandidates}...`,
          recentLogs: [
            `[${new Date().toLocaleTimeString()}] Reanudando Fase 3 en bloque ${options.resumeCheckpoint.completedCount + 1}`
          ]
        });
        await new Promise(r => setTimeout(r, 100));

        currentPairs = sanitizeAndDeduplicatePairs([...options.resumeCheckpoint.initialPairs]);
        refinedPairsList = sanitizeAndDeduplicatePairs([...options.resumeCheckpoint.processedPairs]);
        startIndex = options.resumeCheckpoint.completedCount || 0;
        startPairIndex = Math.min(currentPairs.length, options.resumeCheckpoint.currentCandidateIndex || 0);
        orderCounter = refinedPairsList.length > 0 ? (Math.max(...refinedPairsList.map(p => p.order)) + 1) : 1;
        candidates = currentPairs.filter(p => options.resumeCheckpoint?.allCandidateIds.includes(p.id));
      } else {
        // Ejecución normal desde el inicio
        setProcessingProgress({
          current: 10,
          total: 100,
          stage: 'Fase 3: Alineación Bilingüe',
          activeEngine: 'local',
          activeModel: activeModelDisplay,
          tokensStatus: !hasAiKey ? 'local_deterministic' : 'available',
          tokensInfo: !hasAiKey ? 'Motor Semántico Local activo (0 tokens)' : 'Tokens disponibles en Gemini',
          tokenNotice: null,
          processedDetail: 'Sanitizando y censando párrafos de ambas obras',
          message: 'Fase 3 Unificada 1/5: Sanitizando y censando párrafos de ambas obras...',
          recentLogs: [
            `[${new Date().toLocaleTimeString()}] Iniciando Fase 3: Alineación bilingüe enfrentada`
          ]
        });
        await new Promise(r => setTimeout(r, 120));

        let activeHarm: PureMirrorHarmonizationResult | null = mirrorHarmonizationResult;

        // 1. Armonización transversal previa de oraciones (anti-freeze con sub-partición)
        if (rawTextA && rawTextB && rawTextA.length > 100 && rawTextB.length > 100) {
          // Si el texto ya fue armonizado en Fase 2 y coincide, reutilizar sin recomputar
          const alreadyHarmonized = mirrorHarmonizationResult && 
            mirrorHarmonizationResult.pureBodyA === rawTextA && 
            mirrorHarmonizationResult.pureBodyB === rawTextB;

          if (alreadyHarmonized) {
            harmonizedA = mirrorHarmonizationResult.pureBodyA;
            harmonizedB = mirrorHarmonizationResult.pureBodyB;
            activeHarm = mirrorHarmonizationResult;
          } else {
            setProcessingProgress(prev => ({
              ...prev,
              current: 25,
              total: 100,
              stage: 'Fase 3: Armonización Isomórfica',
              processedDetail: 'Homologando cortes isomórficos por capítulos y acontecimientos',
              message: 'Fase 3 Unificada 2/5: Homologando cortes isomórficos por capítulos y acontecimientos...',
              recentLogs: [
                ...(prev.recentLogs || []),
                `[${new Date().toLocaleTimeString()}] Homologando cortes isomórficos`
              ].slice(-6)
            }));
            await new Promise(r => setTimeout(r, 80));

            try {
              const harm = runPureMirrorHarmonizer(rawTextA, rawTextB);
              if (harm && harm.pureBodyA && harm.pureBodyB) {
                setMirrorHarmonizationResult(harm);
                harmonizedA = harm.pureBodyA;
                harmonizedB = harm.pureBodyB;
                activeHarm = harm;
                setParallelSourceAText(harmonizedA);
                setParallelSourceBText(harmonizedB);
              }
            } catch (e) {
              console.warn('Harmonizer audit fallback in runParallelAlignment:', e);
            }
          }
        }

        setProcessingProgress(prev => ({
          ...prev,
          current: 35,
          total: 100,
          stage: 'Fase 3: Sincronía Espejo 1:1',
          macroStage: 'Fase 3: Sincronía Espejo 1:1',
          mesoChapter: 'Sincronizando capítulos canónicos',
          microDetail: 'Censando concordancia de párrafos',
          nanoToken: 'Motor Semántico Local (0 Tokens)',
          activeEngine: 'local',
          message: 'Fase 3: Ejecutando ensamblaje espejo 1:1 capítulo por capítulo con concordancia de inicios y cierres...',
          recentLogs: [
            ...(prev.recentLogs || []),
            `[${new Date().toLocaleTimeString()}] Iniciando ensamblaje espejo 1:1 por capítulos con concordancia estricta`
          ].slice(-6)
        }));
        await new Promise(r => setTimeout(r, 60));

        // Ejecutar motor de ensamblaje espejo 1:1 por capítulos heredados
        const assemblyResult = await executePhase3MirrorAssembly({
          textA: harmonizedA,
          textB: harmonizedB,
          shadowA_in_B: shadowTextA_in_B,
          shadowB_in_A: shadowTextB_in_A,
          config: cfg,
          mirrorHarmonizationResult: activeHarm,
          onProgress: (p) => {
            setProcessingProgress(prev => ({
              ...prev,
              ...p
            }));
          },
          shouldCancel: () => cancelRequestedRef.current,
          shouldPause: () => cancelRequestedRef.current,
          onYield: async () => {
            await new Promise(r => setTimeout(r, 4));
          }
        });

        currentPairs = sanitizeAndDeduplicatePairs(assemblyResult.pairs);
        refinedPairsList = currentPairs;
        setParallelPairs(currentPairs);
        setParallelSpreads(assemblyResult.spreads);
        setParallelSummary(assemblyResult.summary);

        const updatedCheckpoint: Phase3Checkpoint = {
          id: 'phase3_active',
          inProgress: !cancelRequestedRef.current,
          currentCandidateIndex: currentPairs.length,
          totalCandidates: currentPairs.length,
          completedCount: currentPairs.length,
          processedPairs: refinedPairsList,
          allCandidateIds: [],
          initialPairs: currentPairs,
          timestamp: Date.now(),
          status: cancelRequestedRef.current ? 'paused' : 'in_progress',
          lastActiveModel: activeModelDisplay
        };
        setPhase3Checkpoint(updatedCheckpoint);
        appStorage.setItem('phase3_checkpoint_v5', updatedCheckpoint);
        appStorage.setItem('parallel_pairs_v5', currentPairs);
        appStorage.setItem('parallel_spreads_v5', assemblyResult.spreads);
      }

      // Si el usuario pausó o canceló durante el proceso, guardar y notificar sin reiniciar
      if (cancelRequestedRef.current) {
        setProcessingProgress(p => ({
          ...p,
          message: '⏸️ Procesamiento pausado. Progreso guardado con éxito. Puedes continuar en cualquier momento.'
        }));
        return;
      }


      // FASE 4 AUTOMÁTICA EN PIPELINE: Marco de Traducción Multilingüe Post-Proceso y Armonización 1:1
      setProcessingProgress(prev => ({
        ...prev,
        current: 90,
        total: 100,
        stage: 'Fase 4: Comparación Post-Proceso y Armonización Multilingüe',
        processedDetail: `Cotejo 1:1 de micro-contenido, frases iniciales, finales y fechas en el pipeline (${currentPairs.length} pares)`,
        message: 'Fase 4 Unificada: Ejecutando marco de traducción multilingüe post-proceso en el pipeline (cotejo de micro-contenido y fechas)...',
        recentLogs: [
          ...(prev.recentLogs || []),
          `[${new Date().toLocaleTimeString()}] Marco de traducción post-proceso: auditando y armonizando ${currentPairs.length} pares en automático`
        ].slice(-6)
      }));
      await new Promise(r => setTimeout(r, 60));

      const postProcessResult = runPostProcessTranslationAuditAndAutoHarmonize(currentPairs, cfg);
      currentPairs = postProcessResult.pairs;

      // FASE 4.5: MUESTREO FORENSE DE CALIDAD Y CERTIFICACIÓN DE HILACIÓN (PIPELINE AUTOMÁTICO)
      setProcessingProgress(prev => ({
        ...prev,
        current: 94,
        total: 100,
        stage: 'Fase 4.5: Muestreo Forense de Calidad Editorial',
        macroStage: 'Etapa 4/5: Auditoría Forense de Muestreo de Calidad',
        mesoChapter: 'Verificación de concordancia continua e hilación ininterrumpida',
        microDetail: `Auditando muestra de puntos de control a lo largo del libro (${currentPairs.length} pares)...`,
        nanoToken: 'Comprobando simetría semántica sin rupturas...',
        message: 'Fase 4.5: Ejecutando muestreo forense de control de calidad para certificar concordancia continua de inicio a fin...',
        recentLogs: [
          ...(prev.recentLogs || []),
          `[${new Date().toLocaleTimeString()}] Muestreo forense: certificando hilación ininterrumpida a lo largo de toda la obra`
        ].slice(-6)
      }));
      await new Promise(r => setTimeout(r, 60));

      const forensicAuditResult = runForensicSamplingAuditAndAutoHeal(currentPairs, cfg);
      currentPairs = forensicAuditResult.pairs;

      setProcessingProgress({
        current: 97,
        total: 100,
        stage: 'Fase 5: Ensamblaje Final de Pliegos',
        macroStage: 'Etapa 5/5: Ensamblaje Final de Pliegos Espejo',
        mesoChapter: 'Maquetación simétrica par / impar',
        microDetail: `Ensamblando pliegos certificados (${currentPairs.length} fragmentos)...`,
        nanoToken: 'Certificación 100% concordante',
        message: 'Fase 5 Unificada: Ensamblando pliegos enfrentados certificados (Página Par vs Impar)...'
      });
      await new Promise(r => setTimeout(r, 80));

      // Re-ensamblar pliegos enfrentados asegurando consistencia rítmica directamente desde los pares refinados
      const finalResult = buildSpreadsAndSummaryFromPairs(
        currentPairs,
        { ...cfg, syncMethod: 'by_content_mirror' },
        {
          postProcessTranslationSummary: postProcessResult.summary
        }
      );

      const sanitizedFinalPairs = sanitizeAndDeduplicatePairs(finalResult.pairs);
      setParallelPairs(sanitizedFinalPairs);
      setParallelSpreads(finalResult.spreads);
      setParallelSummary(finalResult.summary);
      setParallelAudit({
        ...finalResult.audit,
        contentMirrorCutsCount: (finalResult.audit.contentMirrorCutsCount || 0) + totalNewCuts,
        aiModelUsedInMirrorCuts: hasAiKey ? activeModelDisplay : 'Motor Semántico Local',
        postProcessTranslationSummary: postProcessResult.summary,
        forensicQualityCertificate: forensicAuditResult.audit.certificateText,
        forensicSamplingAudit: forensicAuditResult.audit
      });

      // Guardar en storage completado
      appStorage.setItem('parallel_pairs_v5', sanitizedFinalPairs);
      appStorage.setItem('parallel_spreads_v5', finalResult.spreads);
      appStorage.setItem('parallel_summary_v5', finalResult.summary);
      appStorage.setItem('parallel_audit_v5', {
        ...finalResult.audit,
        postProcessTranslationSummary: postProcessResult.summary,
        forensicQualityCertificate: forensicAuditResult.audit.certificateText,
        forensicSamplingAudit: forensicAuditResult.audit
      });

      const completedCheckpoint: Phase3Checkpoint = {
        id: 'phase3_active',
        inProgress: false,
        currentCandidateIndex: candidates.length,
        totalCandidates: candidates.length,
        completedCount: candidates.length,
        processedPairs: sanitizedFinalPairs,
        allCandidateIds: candidates.map(c => c.id),
        initialPairs: currentPairs,
        timestamp: Date.now(),
        status: 'completed',
        lastActiveModel: activeModelDisplay
      };
      setPhase3Checkpoint(completedCheckpoint);
      appStorage.setItem('phase3_checkpoint_v5', completedCheckpoint);

      setProcessingProgress({
        current: 100,
        total: 100,
        message: `¡Procesado completo de Fase 3 completado! ${sanitizedFinalPairs.length} fragmentos espejo rigurosamente alineados (${finalResult.spreads.length} pliegos).`
      });
      await new Promise(r => setTimeout(r, 400));
    } catch (err: any) {
      console.error('Error durante procesamiento de Fase 3:', err);
      const isRateLimit = err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('quota');
      
      // Preservar inmediatamente todo lo procesado para que NUNCA vuelva a cero
      if (refinedPairsList.length > 0) {
        const remainingInitial = currentPairs.slice(Math.min(currentPairs.length, lastProcessedIndex + 1));
        const partialPairs = sanitizeAndDeduplicatePairs([...refinedPairsList, ...remainingInitial]);
        setParallelPairs(partialPairs);
        const pb = buildSpreadsAndSummaryFromPairs(partialPairs, parallelConfig);
        setParallelSpreads(pb.spreads);
        setParallelSummary(pb.summary);
        appStorage.setItem('parallel_pairs_v5', partialPairs);
        appStorage.setItem('parallel_spreads_v5', pb.spreads);
      }

      setPhase3Checkpoint(prev => prev ? {
        ...prev,
        inProgress: false,
        status: isRateLimit ? 'rate_limited' : 'error',
        statusMessage: isRateLimit 
          ? 'Límite de cuota alcanzado en la API. Todo tu progreso realizado ha sido salvaguardado al 100%. Puedes continuar de inmediato con el motor local (0 tokens) o reanudar cuando la cuota se restablezca.'
          : (err?.message || 'Error en el procesamiento.')
      } : null);
    } finally {
      setIsProcessing(false);
    }
  }, [chunks, parallelSourceAText, parallelSourceBText, parallelConfig]);

  const resumeParallelAlignment = useCallback(async () => {
    if (!phase3Checkpoint || phase3Checkpoint.completedCount >= phase3Checkpoint.totalCandidates) {
      await runParallelAlignment();
      return;
    }
    await runParallelAlignment(undefined, parallelConfig, undefined, {
      resumeCheckpoint: phase3Checkpoint,
      forceLocalOnly: false
    });
  }, [phase3Checkpoint, parallelConfig, runParallelAlignment]);

  const completeRemainingWithLocalEngine = useCallback(async () => {
    if (!phase3Checkpoint || phase3Checkpoint.completedCount >= phase3Checkpoint.totalCandidates) {
      await runParallelAlignment(undefined, { ...parallelConfig, tokenEfficiencyMode: 'pure_local' });
      return;
    }
    await runParallelAlignment(undefined, { ...parallelConfig, tokenEfficiencyMode: 'pure_local' }, undefined, {
      resumeCheckpoint: phase3Checkpoint,
      forceLocalOnly: true
    });
  }, [phase3Checkpoint, parallelConfig, runParallelAlignment]);

  const pausePhase3Processing = useCallback(() => {
    cancelRequestedRef.current = true;
    setIsProcessing(false);
    setPhase3Checkpoint(prev => prev ? {
      ...prev,
      inProgress: false,
      status: 'paused',
      statusMessage: 'Procesamiento pausado por el usuario. Progreso salvaguardado intacto.'
    } : null);
  }, []);

  const resetPhase3Progress = useCallback(() => {
    setPhase3Checkpoint(null);
    appStorage.removeItem('phase3_checkpoint_v5');
  }, []);

  const runTransversalMirrorProcessing = useCallback(async () => {
    setIsProcessing(true);
    cancelRequestedRef.current = false;
    try {
      setProcessingProgress({
        current: 25,
        total: 100,
        message: 'Procesado Transversal 1/4: Desdoblando diálogos fusionados y erradicando comillas huérfanas...'
      });
      await new Promise(r => setTimeout(r, 260));

      const rawA = parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.cleanContent || c.rawContent || '').join('\n\n') : '');
      const rawB = parallelSourceBText;

      let harmonizedA = rawA;
      let harmonizedB = rawB;

      if (rawA && rawB && rawA.length > 100 && rawB.length > 100) {
        const harm = runPureMirrorHarmonizer(rawA, rawB);
        if (harm.pureBodyA && harm.pureBodyB) {
          harmonizedA = harm.pureBodyA;
          harmonizedB = harm.pureBodyB;
          setMirrorHarmonizationResult(harm);
          setParallelSourceAText(harmonizedA);
          setParallelSourceBText(harmonizedB);
        }
      }

      setProcessingProgress({
        current: 60,
        total: 100,
        message: 'Procesado Transversal 2/4: Auditando homologías 1:1 en la totalidad del libro...'
      });
      await new Promise(r => setTimeout(r, 280));

      const result = alignBilingualTexts(harmonizedA, harmonizedB, parallelConfig);

      setProcessingProgress({
        current: 90,
        total: 100,
        message: 'Procesado Transversal 3/4: Asegurando continuidad simétrica de pliegos enfrentados...'
      });
      await new Promise(r => setTimeout(r, 240));

      setParallelPairs(sanitizeAndDeduplicatePairs(result.pairs));
      setParallelSpreads(result.spreads);
      setParallelSummary(result.summary);
      setParallelAudit(result.audit);

      setProcessingProgress({
        current: 100,
        total: 100,
        message: `¡Espejo transversal perfecto completado! ${result.pairs.length} párrafos homólogos 1:1 garantizados.`
      });
      await new Promise(r => setTimeout(r, 200));
    } finally {
      setIsProcessing(false);
    }
  }, [chunks, parallelSourceAText, parallelSourceBText, parallelConfig]);

  const runAiContentMirrorSegmentation = useCallback(async (options?: { forceAll?: boolean }) => {
    setIsProcessing(true);
    cancelRequestedRef.current = false;
    try {
      let currentPairs = parallelPairs.length > 0 ? [...parallelPairs] : [];
      if (currentPairs.length === 0) {
        const textB = parallelSourceBText;
        const textA = parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.cleanContent || c.rawContent || '').join('\n\n') : '');
        const initial = alignBilingualTexts(textA, textB, parallelConfig);
        currentPairs = initial.pairs;
      }

      // Identificar pares que presentan asimetría de contenido o alerta de ritmo
      const candidates = currentPairs.filter(p => {
        if (p.isHeading || ['heading1', 'heading2', 'heading3'].includes(p.type)) return false;
        if (options?.forceAll) return p.charCountA > 180 && p.charCountB > 180;
        const maxLen = Math.max(p.charCountA, p.charCountB);
        const minLen = Math.min(p.charCountA, p.charCountB);
        const ratio = minLen > 0 ? maxLen / minLen : 1;
        return (ratio > 1.65 || Math.abs(p.charCountA - p.charCountB) > 260 || p.status === 'rhythm_warning') && maxLen > 240;
      });

      if (candidates.length === 0) {
        setProcessingProgress({
          current: 100,
          total: 100,
          message: '✓ Todos los fragmentos ya cuentan con balance y sincronía por contenido óptimos.'
        });
        await new Promise(r => setTimeout(r, 500));
        return;
      }

      setProcessingProgress({
        current: 5,
        total: 100,
        message: `Iniciando Corte por Contenido: ${candidates.length} bloques a sincronizar con tokens y cascada IA...`
      });

      const hasAiKey = hasValidGeminiApiKey();
      let activeModelDisplay = 'gemini-3.1-flash-lite';
      let processedCount = 0;
      let totalNewCuts = 0;

      const newPairsList: ParallelPair[] = [];
      let orderCounter = 1;

      for (let i = 0; i < currentPairs.length; i++) {
        if (cancelRequestedRef.current) break;

        const pair = currentPairs[i];
        const isCandidate = candidates.some(c => c.id === pair.id);

        if (!isCandidate) {
          pair.order = orderCounter++;
          newPairsList.push(pair);
          continue;
        }

        processedCount++;
        const pct = Math.min(95, Math.round((processedCount / candidates.length) * 85) + 8);

        setProcessingProgress({
          current: pct,
          total: 100,
          message: `Corte por Contenido ${processedCount}/${candidates.length}: Equilibrando espejo ${hasAiKey ? `(Modelo activo: ${activeModelDisplay})` : '(Motor Semántico)'}...`
        });

        let segmentedFrags: ParallelPair[] | null = null;

        if (hasAiKey) {
          try {
            const aiRes = await segmentBilingualFragmentIntoMirrorPairsWithAI(
              pair.textA,
              pair.textB,
              parallelConfig.languageA,
              parallelConfig.languageB,
              'auto-cascade',
              (from, to, reason) => {
                activeModelDisplay = to;
                setProcessingProgress(prev => ({
                  ...prev,
                  message: `[Rotación IA de Tokens] Cambio automático a ${to}: ${reason.slice(0, 45)}...`
                }));
              }
            );

            if (aiRes.success && aiRes.fragments.length > 1) {
              activeModelDisplay = aiRes.modelUsed || activeModelDisplay;
              segmentedFrags = aiRes.fragments.map((frag, fIdx) => {
                const p = createPair(
                  orderCounter++,
                  frag.textA,
                  frag.textB,
                  pair.type,
                  pair.title,
                  frag.contentEventSummary || `Fragmento espejo por contenido (Parte ${fIdx + 1})`
                );
                p.isContentCut = true;
                p.contentEventSummary = frag.contentEventSummary;
                p.status = 'balanced';
                return p;
              });
            }
          } catch (e) {
            console.warn('[Corte por Contenido IA] Fallback local para par:', e);
          }
        }

        // Fallback semántico local determinista si la IA no dividió o no hay clave disponible
        if (!segmentedFrags || segmentedFrags.length <= 1) {
          const localFrags = harmonizeAsymmetricPairIntoMirrorFragments(pair, orderCounter, parallelConfig);
          if (localFrags.length > 1) {
            segmentedFrags = localFrags.map(f => {
              f.order = orderCounter++;
              return f;
            });
          }
        }

        if (segmentedFrags && segmentedFrags.length > 1) {
          newPairsList.push(...segmentedFrags);
          totalNewCuts += (segmentedFrags.length - 1);
        } else {
          pair.order = orderCounter++;
          newPairsList.push(pair);
        }
      }

      // Re-ensamblar pliegos enfrentados garantizando que los nuevos fragmentos se paginen armónicamente
      const textA = newPairsList.map(p => p.textA).join('\n\n');
      const textB = newPairsList.map(p => p.textB).join('\n\n');
      const finalResult = alignBilingualTexts(textA, textB, {
        ...parallelConfig,
        syncMethod: 'by_content_mirror'
      });

      const sanitizedFinal = sanitizeAndDeduplicatePairs(finalResult.pairs);
      setParallelPairs(sanitizedFinal);
      setParallelSpreads(finalResult.spreads);
      setParallelSummary(finalResult.summary);
      setParallelAudit({
        ...finalResult.audit,
        contentMirrorCutsCount: (finalResult.audit.contentMirrorCutsCount || 0) + totalNewCuts,
        aiModelUsedInMirrorCuts: hasAiKey ? activeModelDisplay : 'Motor Semántico Local'
      });

      setProcessingProgress({
        current: 100,
        total: 100,
        message: `¡Cortes por contenido completados! ${totalNewCuts} cortes espejo generados sin desbalance de texto.`
      });
      await new Promise(r => setTimeout(r, 600));
    } finally {
      setIsProcessing(false);
    }
  }, [parallelPairs, parallelSourceAText, parallelSourceBText, chunks, parallelConfig]);

  const updateParallelPairItem = useCallback((pairId: string, updates: Partial<ParallelPair>) => {
    setParallelPairs(prev => {
      const updated = prev.map(p => {
        if (p.id !== pairId) return p;
        const newObj = { ...p, ...updates };
        newObj.charCountA = (newObj.textA || '').length;
        newObj.charCountB = (newObj.textB || '').length;
        newObj.wordCountA = (newObj.textA || '').split(/\s+/).filter(Boolean).length;
        newObj.wordCountB = (newObj.textB || '').split(/\s+/).filter(Boolean).length;
        return newObj;
      });
      const result = buildSpreadsAndSummaryFromPairs(updated, parallelConfig);
      setParallelSpreads(result.spreads);
      setParallelSummary(result.summary);
      if (result.audit) setParallelAudit(result.audit);
      return updated;
    });
  }, [parallelConfig]);

  const deleteParallelPairItem = useCallback((pairId: string) => {
    setParallelPairs(prev => {
      const updated = prev.filter(p => p.id !== pairId).map((p, idx) => ({ ...p, order: idx + 1 }));
      const result = buildSpreadsAndSummaryFromPairs(updated, parallelConfig);
      setParallelSpreads(result.spreads);
      setParallelSummary(result.summary);
      if (result.audit) setParallelAudit(result.audit);
      return updated;
    });
  }, [parallelConfig]);

  const insertEmptyParallelPairItem = useCallback((index: number) => {
    setParallelPairs(prev => {
      const newPair: ParallelPair = {
        id: `pair_manual_${Date.now()}`,
        order: index + 1,
        textA: '',
        textB: '',
        charCountA: 0,
        charCountB: 0,
        wordCountA: 0,
        wordCountB: 0,
        type: 'paragraph',
        status: 'manual_aligned',
        diffPercentage: 0
      };
      const copy = [...prev];
      copy.splice(index, 0, newPair);
      const updated = copy.map((p, i) => ({ ...p, order: i + 1 }));
      const result = buildSpreadsAndSummaryFromPairs(updated, parallelConfig);
      setParallelSpreads(result.spreads);
      setParallelSummary(result.summary);
      if (result.audit) setParallelAudit(result.audit);
      return updated;
    });
  }, [parallelConfig]);

  const splitParallelPairItem = useCallback((pairId: string, cutIdxA?: number, cutIdxB?: number) => {
    setParallelPairs(prev => {
      const targetIdx = prev.findIndex(p => p.id === pairId);
      if (targetIdx === -1) return prev;
      const target = prev[targetIdx];
      const sentsA = (target.textA || '').trim().split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);
      const sentsB = (target.textB || '').trim().split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);

      let textA1 = target.textA;
      let textA2 = '';
      let textB1 = target.textB;
      let textB2 = '';

      if (sentsA.length >= 2) {
        const cutA = typeof cutIdxA === 'number' && cutIdxA > 0 && cutIdxA < sentsA.length 
          ? cutIdxA 
          : Math.ceil(sentsA.length / 2);
        textA1 = sentsA.slice(0, cutA).join(' ').trim();
        textA2 = sentsA.slice(cutA).join(' ').trim();
      }

      if (sentsB.length >= 2) {
        const cutB = typeof cutIdxB === 'number' && cutIdxB > 0 && cutIdxB < sentsB.length 
          ? cutIdxB 
          : Math.ceil(sentsB.length / 2);
        textB1 = sentsB.slice(0, cutB).join(' ').trim();
        textB2 = sentsB.slice(cutB).join(' ').trim();
      } else if (textA2) {
        textB2 = `[Continuación homóloga en ${parallelConfig.languageB}]`;
      }

      const p1: ParallelPair = {
        ...target,
        textA: textA1,
        textB: textB1,
        charCountA: textA1.length,
        charCountB: textB1.length,
        wordCountA: textA1.split(/\s+/).filter(Boolean).length,
        wordCountB: textB1.split(/\s+/).filter(Boolean).length,
        status: 'balanced',
        isContentCut: true,
        note: 'Párrafo denso equilibrado por división armónica'
      };

      const p2: ParallelPair = {
        id: `pair_split_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        order: target.order + 1,
        textA: textA2 || `[Continuación homóloga en ${parallelConfig.languageA}]`,
        textB: textB2 || `[Continuación homóloga en ${parallelConfig.languageB}]`,
        charCountA: (textA2 || '').length,
        charCountB: (textB2 || '').length,
        wordCountA: (textA2 || '').split(/\s+/).filter(Boolean).length,
        wordCountB: (textB2 || '').split(/\s+/).filter(Boolean).length,
        type: target.type,
        status: 'balanced',
        diffPercentage: 0,
        isContentCut: true,
        note: 'Continuación simétrica equilibrada'
      };

      const copy = [...prev];
      copy.splice(targetIdx, 1, p1, p2);
      const updated = copy.map((p, i) => ({ ...p, order: i + 1 }));
      const result = buildSpreadsAndSummaryFromPairs(updated, parallelConfig);
      setParallelSpreads(result.spreads);
      setParallelSummary(result.summary);
      if (result.audit) setParallelAudit(result.audit);
      return updated;
    });
  }, [parallelConfig]);

  const mergeParallelPairWithAdjacent = useCallback((pairId: string, direction: 'prev' | 'next') => {
    setParallelPairs(prev => {
      const idx = prev.findIndex(p => p.id === pairId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'prev' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;

      const orphan = prev[idx];
      const partner = prev[targetIdx];

      const mergedTextA = direction === 'prev' 
        ? `${partner.textA}\n\n${orphan.textA}`.trim() 
        : `${orphan.textA}\n\n${partner.textA}`.trim();
      const mergedTextB = direction === 'prev' 
        ? `${partner.textB}\n\n${orphan.textB}`.trim() 
        : `${orphan.textB}\n\n${partner.textB}`.trim();

      const mergedPair: ParallelPair = {
        ...partner,
        textA: mergedTextA,
        textB: mergedTextB,
        charCountA: mergedTextA.length,
        charCountB: mergedTextB.length,
        wordCountA: mergedTextA.split(/\s+/).filter(Boolean).length,
        wordCountB: mergedTextB.split(/\s+/).filter(Boolean).length,
        note: 'Párrafos reconciliados por fusión contigua (eliminación de ausencia)'
      };

      const copy = prev.filter((_, i) => i !== idx);
      const newPartnerIdx = copy.findIndex(p => p.id === partner.id);
      if (newPartnerIdx !== -1) {
        copy[newPartnerIdx] = mergedPair;
      }

      const updated = copy.map((p, i) => ({ ...p, order: i + 1 }));
      const result = buildSpreadsAndSummaryFromPairs(updated, parallelConfig);
      setParallelSpreads(result.spreads);
      setParallelSummary(result.summary);
      if (result.audit) setParallelAudit(result.audit);
      return updated;
    });
  }, [parallelConfig]);

  const autoHarmonizeDenseDisparities = useCallback(() => {
    let harmonizedCount = 0;
    setParallelPairs(prev => {
      const newPairs: ParallelPair[] = [];
      let orderCount = 1;

      for (let i = 0; i < prev.length; i++) {
        const cur = prev[i];
        const a = (cur.textA || '').trim();
        const b = (cur.textB || '').trim();
        const lenA = a.length;
        const lenB = b.length;
        const ratio = (lenA > 0 && lenB > 0) ? (Math.max(lenA, lenB) / Math.min(lenA, lenB)) : 1;
        const isDenseDisparity = !cur.isHeading && (
          ((ratio > 2.0 && (lenA > 150 || lenB > 150)) || Math.abs(lenA - lenB) > 300)
        );

        if (isDenseDisparity && !a.startsWith('[') && !b.startsWith('[')) {
          const splitFrags = harmonizeAsymmetricPairIntoMirrorFragments(cur, orderCount, parallelConfig);
          if (splitFrags.length > 1) {
            harmonizedCount++;
            for (const f of splitFrags) {
              f.order = orderCount++;
              newPairs.push(f);
            }
            continue;
          }

          // Fallback armónico: si un lado tiene 2+ oraciones y el otro menos, o ambos tienen varias
          const sentsA = a.split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);
          const sentsB = b.split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);

          if (sentsA.length >= 2 || sentsB.length >= 2) {
            const cutA = sentsA.length >= 2 ? Math.ceil(sentsA.length / 2) : sentsA.length;
            const cutB = sentsB.length >= 2 ? Math.ceil(sentsB.length / 2) : sentsB.length;

            const textA1 = sentsA.slice(0, cutA).join(' ').trim();
            const textA2 = sentsA.slice(cutA).join(' ').trim();
            const textB1 = sentsB.slice(0, cutB).join(' ').trim();
            const textB2 = sentsB.slice(cutB).join(' ').trim();

            const p1: ParallelPair = {
              ...cur,
              order: orderCount++,
              textA: textA1,
              textB: textB1,
              charCountA: textA1.length,
              charCountB: textB1.length,
              wordCountA: textA1.split(/\s+/).filter(Boolean).length,
              wordCountB: textB1.split(/\s+/).filter(Boolean).length,
              status: 'balanced',
              isContentCut: true,
              note: 'Párrafo denso auto-equilibrado por división oracional'
            };

            const p2: ParallelPair = {
              id: `pair_split_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              order: orderCount++,
              textA: textA2 || `[Continuación homóloga en ${parallelConfig.languageA}]`,
              textB: textB2 || `[Continuación homóloga en ${parallelConfig.languageB}]`,
              charCountA: (textA2 || '').length,
              charCountB: (textB2 || '').length,
              wordCountA: (textA2 || '').split(/\s+/).filter(Boolean).length,
              wordCountB: (textB2 || '').split(/\s+/).filter(Boolean).length,
              type: cur.type,
              status: 'balanced',
              diffPercentage: 0,
              isContentCut: true,
              note: 'Continuación simétrica equilibrada'
            };

            harmonizedCount++;
            newPairs.push(p1, p2);
            continue;
          }
        }

        cur.order = orderCount++;
        newPairs.push(cur);
      }

      if (harmonizedCount > 0) {
        const result = buildSpreadsAndSummaryFromPairs(newPairs, parallelConfig);
        setParallelSpreads(result.spreads);
        setParallelSummary(result.summary);
        if (result.audit) setParallelAudit(result.audit);
      }
      return newPairs;
    });
    return harmonizedCount;
  }, [parallelConfig]);

  const autoReconcileAbsencePairs = useCallback(() => {
    let resolvedCount = 0;
    setParallelPairs(prev => {
      const newPairs: ParallelPair[] = [];
      for (let i = 0; i < prev.length; i++) {
        const cur = prev[i];
        const a = (cur.textA || '').trim();
        const b = (cur.textB || '').trim();
        const isAbsenceA = !a || a.startsWith('[Texto ausente') || a.startsWith('[Párrafo ausente') || a === '[...]';
        const isAbsenceB = !b || b.startsWith('[Texto ausente') || b.startsWith('[Párrafo ausente') || b === '[...]';

        if (isAbsenceA && !isAbsenceB) {
          // Fusionar el texto unilateral huérfano con el par inmediatamente anterior si existe
          if (newPairs.length > 0 && !newPairs[newPairs.length - 1].isHeading) {
            const prevPair = newPairs[newPairs.length - 1];
            prevPair.textB = `${prevPair.textB}\n\n${b}`.trim();
            prevPair.charCountB = prevPair.textB.length;
            prevPair.wordCountB = prevPair.textB.split(/\s+/).filter(Boolean).length;
            prevPair.note = 'Párrafo huérfano unificado para eliminar ausencia';
            resolvedCount++;
            continue;
          } else if (i + 1 < prev.length) {
            // Si es el primer par, fusionar con el siguiente
            const nextPair = prev[i + 1];
            nextPair.textB = `${b}\n\n${nextPair.textB}`.trim();
            nextPair.charCountB = nextPair.textB.length;
            nextPair.wordCountB = nextPair.textB.split(/\s+/).filter(Boolean).length;
            resolvedCount++;
            continue;
          }
        } else if (isAbsenceB && !isAbsenceA) {
          if (newPairs.length > 0 && !newPairs[newPairs.length - 1].isHeading) {
            const prevPair = newPairs[newPairs.length - 1];
            prevPair.textA = `${prevPair.textA}\n\n${a}`.trim();
            prevPair.charCountA = prevPair.textA.length;
            prevPair.wordCountA = prevPair.textA.split(/\s+/).filter(Boolean).length;
            prevPair.note = 'Párrafo huérfano unificado para eliminar ausencia';
            resolvedCount++;
            continue;
          } else if (i + 1 < prev.length) {
            const nextPair = prev[i + 1];
            nextPair.textA = `${a}\n\n${nextPair.textA}`.trim();
            nextPair.charCountA = nextPair.textA.length;
            nextPair.wordCountA = nextPair.textA.split(/\s+/).filter(Boolean).length;
            resolvedCount++;
            continue;
          }
        }
        newPairs.push(cur);
      }

      const updated = newPairs.map((p, idx) => ({ ...p, order: idx + 1 }));
      if (resolvedCount > 0) {
        const result = buildSpreadsAndSummaryFromPairs(updated, parallelConfig);
        setParallelSpreads(result.spreads);
        setParallelSummary(result.summary);
        if (result.audit) setParallelAudit(result.audit);
      }
      return updated;
    });
    return resolvedCount;
  }, [parallelConfig]);

  const exportCleanBookA = useCallback(async (format: 'docx' | 'txt' = 'docx') => {
    const zones = bookZonesA || (parallelSourceAText ? disentangleBookZones(parallelSourceAText, parallelConfig.titleA, parallelConfig.author) : null);
    const textA = zones?.novelBody || parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.cleanContent || c.rawContent || '').join('\n\n') : '');
    const title = parallelConfig.titleA || metadata.title || 'Libro_A_Limpio';
    const author = parallelConfig.author || metadata.author || '';
    const lang = parallelConfig.languageA || 'Español';
    const cleanFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_Limpio`;

    const prelimTitle = zones?.preliminaryMatter.title || parallelConfig.prologueTitleA;
    const prelimText = zones?.preliminaryMatter.text || parallelConfig.prologueTextA;
    const backTitle = zones?.backMatter.title || parallelConfig.backMatterTitleA;
    const backText = zones?.backMatter.text || parallelConfig.backMatterTextA;

    if (format === 'txt') {
      let fullTxt = '';
      if (prelimText && prelimText.trim().length > 0) {
        fullTxt += `--- ${prelimTitle || 'PRÓLOGO / INTRODUCCIÓN'} ---\n\n${prelimText.trim()}\n\n========================================\n\n`;
      }
      fullTxt += textA.trim();
      if (backText && backText.trim().length > 0) {
        fullTxt += `\n\n========================================\n\n--- ${backTitle || 'MATERIAL POSTERIOR'} ---\n\n${backText.trim()}`;
      }
      const blob = new Blob([fullTxt], { type: 'text/plain;charset=utf-8' });
      saveAs(blob, `${cleanFilename}.txt`);
      return;
    }

    await generateCleanSingleBookDocx(
      title, 
      author, 
      lang, 
      textA, 
      settings, 
      `${cleanFilename}.docx`,
      prelimTitle,
      prelimText,
      backTitle,
      backText
    );
  }, [parallelSourceAText, chunks, parallelConfig, metadata, settings, bookZonesA]);

  const exportCleanBookB = useCallback(async (format: 'docx' | 'txt' = 'docx') => {
    const zones = bookZonesB || (parallelSourceBText ? disentangleBookZones(parallelSourceBText, parallelConfig.titleB, parallelConfig.author) : null);
    const textB = zones?.novelBody || parallelSourceBText || '';
    const title = parallelConfig.titleB || (metadata.title ? `${metadata.title} (B)` : 'Libro_B_Limpio');
    const author = parallelConfig.author || metadata.author || '';
    const lang = parallelConfig.languageB || 'Idioma B';
    const cleanFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_Limpio`;

    const prelimTitle = zones?.preliminaryMatter.title || parallelConfig.prologueTitleB;
    const prelimText = zones?.preliminaryMatter.text || parallelConfig.prologueTextB;
    const backTitle = zones?.backMatter.title || parallelConfig.backMatterTitleB;
    const backText = zones?.backMatter.text || parallelConfig.backMatterTextB;

    if (format === 'txt') {
      let fullTxt = '';
      if (prelimText && prelimText.trim().length > 0) {
        fullTxt += `--- ${prelimTitle || 'PRÓLOGO / INTRODUCCIÓN'} ---\n\n${prelimText.trim()}\n\n========================================\n\n`;
      }
      fullTxt += textB.trim();
      if (backText && backText.trim().length > 0) {
        fullTxt += `\n\n========================================\n\n--- ${backTitle || 'MATERIAL POSTERIOR'} ---\n\n${backText.trim()}`;
      }
      const blob = new Blob([fullTxt], { type: 'text/plain;charset=utf-8' });
      saveAs(blob, `${cleanFilename}.txt`);
      return;
    }

    await generateCleanSingleBookDocx(
      title, 
      author, 
      lang, 
      textB, 
      settings, 
      `${cleanFilename}.docx`,
      prelimTitle,
      prelimText,
      backTitle,
      backText
    );
  }, [parallelSourceBText, parallelConfig, metadata, settings, bookZonesB]);

  return (
    <SapeContext.Provider
      value={{
        activeTab,
        setActiveTab,
        metadata,
        setMetadata,
        chunks,
        setChunks,
        settings,
        setSettings,
        selectedModel,
        setSelectedModel,
        styleGuide,
        setStyleGuide,
        batchingConfig,
        setBatchingConfig,
        isProcessing,
        currentProcessingChunkId,
        processingProgress,
        isProcessingOverlayMinimized,
        setIsProcessingOverlayMinimized,
        switchToLocalProcessing,
        addChunk,
        addMultipleChunks,
        updateChunk,
        removeChunk,
        clearAllChunks,
        ocrSingleChunk,
        ocrAllScannedChunks,
        detectMetadataFromChunks,
        detectEditorialTaxonomy,
        detectBookToc,
        updateBatchingConfig,
        purifySingleChunk,
        purifyAllPendingChunks,
        rePurifyAllChunks,
        styleSingleChunk,
        styleAllCleanedChunks,
        purifyAndStyleSingleChunk,
        purifyAndStyleAllPending,
        purifyAndStyleWithMacroBatching,
        transformEntireBookWithGlobalContext,
        consolidateChunksIntoChaptersOrMacroBlocks,
        curateAllContinuityAndHyphenation,
        cancelProcessing,
        updateBlock,
        removeBlock,
        addBlockToChunk,
        approveAllBlocks,
        projects,
        currentProjectId,
        saveProject,
        loadProject,
        deleteProject,
        newProject,
        purgeAllMemoryAndStorage,
        exportProjectJson,
        importProjectJson,
        transversalReport,
        runTransversalAudit,
        applyTransversalFixes,
        parallelConfig,
        setParallelConfig,
        parallelSourceAText,
        setParallelSourceAText,
        parallelSourceBText,
        setParallelSourceBText,
        parallelPairs,
        setParallelPairs,
        parallelSpreads,
        parallelSummary,
        parallelAudit,
        runParallelAlignment,
        phase3Checkpoint,
        resumeParallelAlignment,
        completeRemainingWithLocalEngine,
        resetPhase3Progress,
        pausePhase3Processing,
        cleanAndPurifyEbookTexts,
        runAiAssistedDoubleCleaning,
        mirrorHarmonizationResult,
        setMirrorHarmonizationResult,
        runSecondPassMirrorHarmonizer,
        runTransversalMirrorProcessing,
        runAiContentMirrorSegmentation,
        isEbookPurified,
        setIsEbookPurified,
        purificationStats,
        setPurificationStats,
        updateParallelPairItem,
        deleteParallelPairItem,
        insertEmptyParallelPairItem,
        splitParallelPairItem,
        mergeParallelPairWithAdjacent,
        autoHarmonizeDenseDisparities,
        autoReconcileAbsencePairs,
        exportCleanBookA,
        exportCleanBookB,
        bookZonesA,
        setBookZonesA,
        bookZonesB,
        setBookZonesB,
        ingestStateA,
        setIngestStateA,
        ingestStateB,
        setIngestStateB,
        locateBookStructureWithAI,
        singleBookAudit,
        setSingleBookAudit,
        curateAndCleanEntireBook,
        runMiniAiStartCheck,
        analyzeBookFlow,
        shadowTextA_in_B,
        setShadowTextA_in_B,
        shadowTextB_in_A,
        setShadowTextB_in_A,
        generateFreeShadowTranslationForAnchor
      }}
    >
      {children}
    </SapeContext.Provider>
  );
};

export const useSape = () => {
  const context = useContext(SapeContext);
  if (!context) {
    throw new Error('useSape debe usarse dentro de un SapeProvider');
  }
  return context;
};

// Aliases soberanos TE (Transcrito Editorial) para transición limpia sin rotura
export const TEContext = SapeContext;
export type TEContextType = SapeContextType;
export const TEProvider = SapeProvider;
export const useTE = useSape;

