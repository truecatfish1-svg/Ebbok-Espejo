import React, { useState, useRef, useEffect } from 'react';
import { useSape } from '../context/SapeContext';
import { 
  extractFromDocx, 
  extractFromPdf, 
  extractFromTextFile, 
  autoSplitTextIntoChunks 
} from '../utils/fileExtractor';
import { 
  analyzeNovelPrologueAndStart, 
  isolateFootnotesFromText, 
  disentangleOpeningFrontMatter,
  disentangleBookZones,
  inspectBookEndpointsAndPureBody,
  findPhrasePositionInText,
  NovelPrologueAnalysis,
  BookZones,
  type BookEndpointInspection
} from '../utils/novelCurator';
import { BookStructureAnalysisCard } from './BookStructureAnalysisCard';
import { Phase1ParallelDelimitation, type ChapterEntry } from './Phase1ParallelDelimitation';
import { 
  cleanBookMetadataFromFilename, 
  extractMetadataFromBookText,
  lookupCanonicalWorkLocally 
} from '../utils/intelligentBookCurator';
import { 
  discoverBookCanonicalEndpointsWithAI, 
  endpointsToCanonicalWorkProfile,
  type DiscoveredEndpoints 
} from '../utils/canonicalEndpointsDiscoverer';
import { 
  investigateBookIdentityAndEndpointsOnline,
  investigateBookStructureAndChaptersOnline,
  onlineInvestigationToCanonicalProfile,
  type OnlineInvestigationResult 
} from '../utils/onlineNovelInvestigator';
import { detectTextLanguage } from '../utils/languageDetector';
import type { PageDetailAnalysis, BookPageStructure } from '../types';
import { 
  UploadCloud, 
  FileText, 
  BookOpen, 
  Columns, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  ShieldCheck, 
  Scissors, 
  Loader2, 
  FileCheck,
  RefreshCw,
  Info,
  Compass,
  Wand2,
  Trash2,
  X,
  Bookmark,
  Flag,
  Sliders,
  Eye
} from 'lucide-react';

interface FileUploadState {
  file: File | null;
  name: string;
  size: number;
  extractedText: string;
  pageCount?: number;
  pdfPages?: { pageNumber: number; text: string }[];
  isPdfWithNativeText: boolean;
  prologueAnalysis: NovelPrologueAnalysis | null;
  zones?: BookZones | null;
  canonicalProfile?: any;
  isAiAnalyzingStructure?: boolean;
  footnotesCount: number;
  inspection?: BookEndpointInspection | null;
  boundaryStartRawIdx?: number;
  boundaryEndRawIdx?: number;
  boundaryStartCharIdx?: number;
  boundaryEndCharIdx?: number;
  isExtracting: boolean;
  progress: number;
  message: string;
  error: string | null;
}

const INITIAL_FILE_STATE: FileUploadState = {
  file: null,
  name: '',
  size: 0,
  extractedText: '',
  pageCount: 0,
  isPdfWithNativeText: false,
  prologueAnalysis: null,
  zones: null,
  footnotesCount: 0,
  boundaryStartRawIdx: undefined,
  boundaryEndRawIdx: undefined,
  boundaryStartCharIdx: undefined,
  boundaryEndCharIdx: undefined,
  isExtracting: false,
  progress: 0,
  message: '',
  error: null
};

export const DualParallelIngest: React.FC = () => {
  const { 
    parallelConfig, 
    setParallelConfig, 
    parallelSourceAText,
    setParallelSourceAText,
    parallelSourceBText,
    setParallelSourceBText, 
    addMultipleChunks, 
    clearAllChunks, 
    runParallelAlignment, 
    cleanAndPurifyEbookTexts,
    setActiveTab,
    setMetadata,
    isProcessing,
    bookZonesA,
    setBookZonesA,
    bookZonesB,
    setBookZonesB,
    ingestStateA,
    setIngestStateA,
    ingestStateB,
    setIngestStateB,
    locateBookStructureWithAI,
    purgeAllMemoryAndStorage
  } = useSape();

  const [stateA, setStateA] = useState<FileUploadState>(() => ingestStateA || INITIAL_FILE_STATE);
  const [stateB, setStateB] = useState<FileUploadState>(() => ingestStateB || INITIAL_FILE_STATE);

  // Sincronizar estados locales con SapeContext para persistencia indestructible entre pestañas
  useEffect(() => {
    if (stateA !== INITIAL_FILE_STATE && stateA.extractedText) {
      setIngestStateA(stateA);
    }
  }, [stateA, setIngestStateA]);

  useEffect(() => {
    if (stateB !== INITIAL_FILE_STATE && stateB.extractedText) {
      setIngestStateB(stateB);
    }
  }, [stateB, setIngestStateB]);

  // Si ingestState se carga desde storage tras montar o cambia externamente, actualizar estado local
  useEffect(() => {
    if (ingestStateA && ingestStateA.extractedText && stateA !== ingestStateA) {
      setStateA(ingestStateA);
    }
  }, [ingestStateA]);

  useEffect(() => {
    if (ingestStateB && ingestStateB.extractedText && stateB !== ingestStateB) {
      setStateB(ingestStateB);
    }
  }, [ingestStateB]);

  // Investigación literaria y anclaje canónico online con IA (a demanda)
  const [onlineInvestigation, setOnlineInvestigation] = useState<OnlineInvestigationResult | null>(null);
  const [isInvestigatingOnline, setIsInvestigatingOnline] = useState(false);
  const [purgeConfirmStep, setPurgeConfirmStep] = useState(false);

  // Opciones editoriales para novelas
  const [isolatePrologues, setIsolatePrologues] = useState(true);
  const [filterFootnotes, setFilterFootnotes] = useState(true);
  const [startAtChapterOne, setStartAtChapterOne] = useState(true);

  // Idiomas y Títulos sincronizados con parallelConfig
  const [languageA, setLanguageA] = useState(parallelConfig.languageA || 'Español');
  const [languageB, setLanguageB] = useState(parallelConfig.languageB || 'Alemán (Original)');
  const [titleA, setTitleA] = useState(parallelConfig.titleA || '');
  const [titleB, setTitleB] = useState(parallelConfig.titleB || '');
  const [author, setAuthor] = useState(parallelConfig.author || '');
  const [publicationYear, setPublicationYear] = useState('');
  const [publisher, setPublisher] = useState('');
  const [chaptersList, setChaptersList] = useState<ChapterEntry[]>(() => {
    if (parallelConfig.chapters && parallelConfig.chapters.length > 0) {
      return parallelConfig.chapters.map((c, idx) => ({
        number: c.number || idx + 1,
        title: c.title,
        pageNumber: c.pageNumber,
        pageNumberB: c.pageNumberB,
        startPhrase: c.startPhrase,
        startPhraseB: c.startPhraseB
      }));
    }
    return [];
  });
  const [activeManualCalibSlot, setActiveManualCalibSlot] = useState<'A' | 'B' | 'BOTH'>('BOTH');

  // Mantener sincronizado cuando parallelConfig se cargue asíncronamente desde IndexedDB
  useEffect(() => {
    if (parallelConfig.titleA && !titleA) setTitleA(parallelConfig.titleA);
    if (parallelConfig.titleB && !titleB) setTitleB(parallelConfig.titleB);
    if (parallelConfig.author && !author) setAuthor(parallelConfig.author);
    if (parallelConfig.languageA && languageA !== parallelConfig.languageA) setLanguageA(parallelConfig.languageA);
    if (parallelConfig.languageB && languageB !== parallelConfig.languageB) setLanguageB(parallelConfig.languageB);
    if (parallelConfig.chapters && parallelConfig.chapters.length > 0 && chaptersList.length === 0) {
      setChaptersList(parallelConfig.chapters.map((c, idx) => ({
        number: c.number || idx + 1,
        title: c.title,
        pageNumber: c.pageNumber,
        pageNumberB: c.pageNumberB,
        startPhrase: c.startPhrase,
        startPhraseB: c.startPhraseB
      })));
    }
  }, [parallelConfig]);

  const fileInputRefA = useRef<HTMLInputElement>(null);
  const fileInputRefB = useRef<HTMLInputElement>(null);

  // Purgar completamente la memoria y reiniciar desde cero sin rezagos de libros anteriores
  const handlePurgeAllDualIngest = async () => {
    setStateA(INITIAL_FILE_STATE);
    setStateB(INITIAL_FILE_STATE);
    setIngestStateA(null);
    setIngestStateB(null);
    setOnlineInvestigation(null);
    setTitleA('');
    setTitleB('');
    setAuthor('');
    if (fileInputRefA.current) fileInputRefA.current.value = '';
    if (fileInputRefB.current) fileInputRefB.current.value = '';
    setPurgeConfirmStep(false);
    await purgeAllMemoryAndStorage();
  };

  const handleClearSlot = (slot: 'A' | 'B') => {
    if (slot === 'A') {
      setStateA(INITIAL_FILE_STATE);
      setIngestStateA(null);
      setParallelSourceAText('');
      setBookZonesA(null);
      if (fileInputRefA.current) fileInputRefA.current.value = '';
    } else {
      setStateB(INITIAL_FILE_STATE);
      setIngestStateB(null);
      setParallelSourceBText('');
      setBookZonesB(null);
      if (fileInputRefB.current) fileInputRefB.current.value = '';
    }
  };

  useEffect(() => {
    const handleGlobalPurge = () => {
      setStateA(INITIAL_FILE_STATE);
      setStateB(INITIAL_FILE_STATE);
      setOnlineInvestigation(null);
      setTitleA('');
      setTitleB('');
      setAuthor('');
      if (fileInputRefA.current) fileInputRefA.current.value = '';
      if (fileInputRefB.current) fileInputRefB.current.value = '';
      setPurgeConfirmStep(false);
    };

    window.addEventListener('sape-purge-all', handleGlobalPurge);
    return () => window.removeEventListener('sape-purge-all', handleGlobalPurge);
  }, []);

  const handleRunOnlineInvestigation = async () => {
    if (!stateA.extractedText && !stateB.extractedText) return;
    setIsInvestigatingOnline(true);
    try {
      const inv = await investigateBookIdentityAndEndpointsOnline({
        textA: stateA.extractedText,
        textB: stateB.extractedText,
        hintTitleA: titleA || stateA.name,
        hintTitleB: titleB || stateB.name,
        hintAuthor: author,
        langA: languageA,
        langB: languageB
      });

      if (inv) {
        setOnlineInvestigation(inv);
        if (inv.workTitle && !titleA) setTitleA(inv.workTitle);
        if (inv.workTitle && !titleB) setTitleB(inv.workTitle);
        if (inv.author && !author) setAuthor(inv.author);
        if (inv.publicationYear && !publicationYear) setPublicationYear(inv.publicationYear);
        if (inv.publisher && !publisher) setPublisher(inv.publisher);
        
        let foundChapters = inv.chaptersList || [];
        if (foundChapters.length === 0 && (inv.workTitle || titleA || titleB)) {
          const autoChapters = await investigateBookStructureAndChaptersOnline({
            workTitle: inv.workTitle || titleA || titleB,
            author: inv.author || author,
            language: languageA
          });
          if (autoChapters.chapters && autoChapters.chapters.length > 0) {
            foundChapters = autoChapters.chapters;
          }
        }
        if (foundChapters.length > 0) {
          setChaptersList(foundChapters);
        }

        const profile = onlineInvestigationToCanonicalProfile(inv);

        // Re-inspeccionar Libro A con el perfil investigado
        if (stateA.extractedText) {
          const zonesA = disentangleBookZones(stateA.extractedText, inv.workTitle, inv.author, profile);
          const inspectionA = inspectBookEndpointsAndPureBody(stateA.extractedText, inv.workTitle, inv.author, profile);
          setBookZonesA(zonesA);
          setParallelSourceAText(zonesA.novelBody || stateA.extractedText);
          setStateA(prev => ({ ...prev, zones: zonesA, inspection: inspectionA, canonicalProfile: profile }));
        }

        // Re-inspeccionar Libro B con el perfil investigado
        if (stateB.extractedText) {
          const zonesB = disentangleBookZones(stateB.extractedText, inv.workTitle, inv.author, profile);
          const inspectionB = inspectBookEndpointsAndPureBody(stateB.extractedText, inv.workTitle, inv.author, profile);
          setBookZonesB(zonesB);
          setParallelSourceBText(zonesB.novelBody || stateB.extractedText);
          setStateB(prev => ({ ...prev, zones: zonesB, inspection: inspectionB, canonicalProfile: profile }));
        }
      }
    } catch (err) {
      console.error('Error durante investigación online:', err);
    } finally {
      setIsInvestigatingOnline(false);
    }
  };

  const autoInvestigatedRef = useRef(false);
  useEffect(() => {
    if (stateA.extractedText && stateB.extractedText && !autoInvestigatedRef.current && !isInvestigatingOnline) {
      autoInvestigatedRef.current = true;
      handleRunOnlineInvestigation();
    }
  }, [stateA.extractedText, stateB.extractedText]);

  const handleReAuditSlotWithDeepAi = async (slot: 'A' | 'B') => {
    const state = slot === 'A' ? stateA : stateB;
    const setState = slot === 'A' ? setStateA : setStateB;
    if (!state.extractedText) return;

    setState(prev => ({
      ...prev,
      isExtracting: true,
      message: 'Ejecutando Supervisión IA Profunda (Flash) para ubicar inicio y desenlace...'
    }));

    try {
      const candidateTitle = (slot === 'A' ? titleA : titleB) || state.canonicalProfile?.title || state.name;
      const candidateAuthor = author || state.canonicalProfile?.author || '';
      const lang = (slot === 'A' ? languageA : languageB) || 'Español';

      const endpoints = await discoverBookCanonicalEndpointsWithAI(
        state.extractedText.slice(0, 50000),
        state.extractedText.slice(-50000),
        lang,
        candidateTitle,
        candidateAuthor,
        true // forceAi = true
      );

      if (endpoints) {
        const profile = endpointsToCanonicalWorkProfile(endpoints, candidateTitle, candidateAuthor);
        const zones = disentangleBookZones(state.extractedText, candidateTitle, candidateAuthor, profile);
        const inspection = inspectBookEndpointsAndPureBody(state.extractedText, candidateTitle, candidateAuthor, profile);

        if (slot === 'A') {
          setBookZonesA(zones);
          setParallelSourceAText(zones.novelBody || state.extractedText);
        } else {
          setBookZonesB(zones);
          setParallelSourceBText(zones.novelBody || state.extractedText);
        }

        setState(prev => ({
          ...prev,
          zones,
          inspection,
          canonicalProfile: profile,
          isExtracting: false,
          message: 'Límites verificados filológicamente con IA.'
        }));
      } else {
        setState(prev => ({ ...prev, isExtracting: false, message: 'Supervisión completada.' }));
      }
    } catch (err: any) {
      console.error(`Error en re-auditoría IA para slot ${slot}:`, err);
      setState(prev => ({ ...prev, isExtracting: false, error: 'No se pudo completar la re-auditoría con IA.' }));
    }
  };

  const handleSetDirectParagraphBoundary = (
    slot: 'A' | 'B', 
    type: 'start' | 'end', 
    targetRawIdx: number, 
    explicitPageNumber?: number,
    customParas?: string[]
  ) => {
    const state = slot === 'A' ? stateA : stateB;
    const setState = slot === 'A' ? setStateA : setStateB;
    if (!state.inspection || !state.extractedText) return;

    const currentInsp = state.inspection;
    const rawParas = customParas || state.extractedText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    if (rawParas.length === 0) return;

    const curParas = currentInsp.pureBodyText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '').slice(0, 50);

    // 1. Ubicar el índice del párrafo de inicio en el texto crudo con memoria persistente
    let rawStartIdx = state.boundaryStartRawIdx !== undefined ? state.boundaryStartRawIdx : -1;
    if (rawStartIdx === -1 || rawStartIdx >= rawParas.length) {
      const curStartNorm = norm(curParas[0] || '');
      if (curStartNorm.length >= 8) {
        rawStartIdx = rawParas.findIndex(rp => {
          const rpNorm = norm(rp);
          return rpNorm.includes(curStartNorm) || curStartNorm.includes(rpNorm);
        });
      }
      if (rawStartIdx === -1 && curParas[0]) {
        const words = curParas[0].split(/\s+/).filter(w => w.length >= 4).slice(0, 4);
        if (words.length > 0) {
          rawStartIdx = rawParas.findIndex(rp => words.some(w => rp.toLowerCase().includes(w.toLowerCase())));
        }
      }
      if (rawStartIdx === -1) rawStartIdx = state.boundaryStartRawIdx !== undefined ? state.boundaryStartRawIdx : 0;
    }

    // 2. Ubicar el índice del párrafo de fin en el texto crudo con memoria persistente
    let rawEndIdx = state.boundaryEndRawIdx !== undefined ? state.boundaryEndRawIdx : -1;
    if (rawEndIdx === -1 || rawEndIdx >= rawParas.length) {
      const curEndNorm = norm(curParas[curParas.length - 1] || '');
      if (curEndNorm.length >= 8) {
        for (let i = rawParas.length - 1; i >= 0; i--) {
          const rpNorm = norm(rawParas[i]);
          if (rpNorm.includes(curEndNorm) || curEndNorm.includes(rpNorm)) {
            rawEndIdx = i;
            break;
          }
        }
      }
      if (rawEndIdx === -1 && curParas[curParas.length - 1]) {
        const words = curParas[curParas.length - 1].split(/\s+/).filter(w => w.length >= 4).slice(-4);
        if (words.length > 0) {
          for (let i = rawParas.length - 1; i >= 0; i--) {
            if (words.some(w => rawParas[i].toLowerCase().includes(w.toLowerCase()))) {
              rawEndIdx = i;
              break;
            }
          }
        }
      }
      if (rawEndIdx === -1 || rawEndIdx < rawStartIdx) rawEndIdx = state.boundaryEndRawIdx !== undefined ? state.boundaryEndRawIdx : rawParas.length - 1;
    }

    let newStartIdx = rawStartIdx;
    let newEndIdx = rawEndIdx;

    // Si se edita el inicio, el fin previo NO SE TOCA ni se desconfigura
    // Si se edita el fin, el inicio previo NO SE TOCA ni se desconfigura
    if (type === 'start') {
      newStartIdx = Math.max(0, Math.min(rawParas.length - 1, targetRawIdx));
      if (newStartIdx > newEndIdx) {
        newEndIdx = Math.min(rawParas.length - 1, Math.max(newStartIdx, newEndIdx));
      }
    } else {
      newEndIdx = Math.max(0, Math.min(rawParas.length - 1, targetRawIdx));
      if (newEndIdx < newStartIdx) {
        newStartIdx = Math.min(newStartIdx, newEndIdx);
      }
    }

    const baseParas = customParas && customParas.length === rawParas.length ? customParas : rawParas;
    const newParas = baseParas.slice(newStartIdx, newEndIdx + 1);
    const updatedText = newParas.join('\n\n');
    const newFirst = newParas[0] || '';
    const newLast = newParas[newParas.length - 1] || '';

    // Actualizar la estructura de páginas con estricta zonificación contigua
    const updatedPageStructure = currentInsp.pageStructure ? { ...currentInsp.pageStructure } : undefined;
    if (updatedPageStructure?.pagesAnalysis && updatedPageStructure.pagesAnalysis.length > 0) {
      let foundStartPage = updatedPageStructure.novelStartPage;
      let foundEndPage = updatedPageStructure.novelEndPage;

      if (type === 'start' && explicitPageNumber !== undefined) {
        foundStartPage = explicitPageNumber;
      } else if (state.pdfPages && state.pdfPages.length > 0) {
        const firstWords = newFirst.slice(0, 60).toLowerCase().replace(/[^a-z0-9]/gi, '');
        for (let i = 0; i < state.pdfPages.length; i++) {
          const pageClean = state.pdfPages[i].text.toLowerCase().replace(/[^a-z0-9]/gi, '');
          if (pageClean.includes(firstWords.slice(0, 25)) || firstWords.includes(pageClean.slice(0, 25))) {
            foundStartPage = state.pdfPages[i].pageNumber;
            break;
          }
        }
      }

      if (type === 'end' && explicitPageNumber !== undefined) {
        foundEndPage = explicitPageNumber;
      } else if (state.pdfPages && state.pdfPages.length > 0) {
        // En los párrafos finales buscamos en qué termina ese párrafo final
        const lastWords = newLast.slice(-80).toLowerCase().replace(/[^a-z0-9]/gi, '');
        for (let i = state.pdfPages.length - 1; i >= 0; i--) {
          const pageClean = state.pdfPages[i].text.toLowerCase().replace(/[^a-z0-9]/gi, '');
          if (pageClean.includes(lastWords.slice(-25)) || lastWords.includes(pageClean.slice(-25))) {
            foundEndPage = state.pdfPages[i].pageNumber;
            break;
          }
        }
      }

      if (!foundStartPage || foundStartPage < 1) {
        foundStartPage = Math.max(1, Math.ceil((newStartIdx / rawParas.length) * updatedPageStructure.totalPages));
      }
      if (!foundEndPage || foundEndPage < foundStartPage) {
        foundEndPage = Math.max(foundStartPage, Math.ceil(((newEndIdx + 1) / rawParas.length) * updatedPageStructure.totalPages));
      }

      foundStartPage = Math.min(foundStartPage, foundEndPage);
      foundEndPage = Math.max(foundStartPage, foundEndPage);

      updatedPageStructure.novelStartPage = foundStartPage;
      updatedPageStructure.novelEndPage = foundEndPage;
      updatedPageStructure.frontMatterPages = foundStartPage > 1 ? `1–${foundStartPage - 1}` : 'Ninguna';
      updatedPageStructure.backMatterPages = foundEndPage < updatedPageStructure.totalPages ? `${foundEndPage + 1}–${updatedPageStructure.totalPages}` : 'Ninguna';

      // RE-ZONIFICACIÓN ESTRICTA: Contigua al 100%
      // < foundStartPage: preliminares (amarillo)
      // foundStartPage .. foundEndPage: cuerpo (verde)
      // > foundEndPage: colofón (amarillo)
      updatedPageStructure.pagesAnalysis = updatedPageStructure.pagesAnalysis.map(pa => {
        const pNum = pa.pageNumber;
        const isStart = pNum === foundStartPage;
        const isEnd = pNum === foundEndPage;
        let category: PageDetailAnalysis['category'];
        if (pNum < foundStartPage) {
          category = 'prologue_preface';
        } else if (pNum > foundEndPage) {
          category = 'back_matter_colophon';
        } else {
          category = 'narrative_body';
        }
        return {
          ...pa,
          isNovelStart: isStart,
          isNovelEnd: isEnd,
          category
        };
      });
    }

    const updatedInspection: BookEndpointInspection = {
      ...currentInsp,
      firstParagraph: newFirst,
      firstParagraphSnippet: newFirst.length > 250 ? newFirst.slice(0, 250) + '...' : newFirst,
      lastParagraph: newLast,
      lastParagraphSnippet: newLast.length > 250 ? '...' + newLast.slice(-250) : newLast,
      pureBodyText: updatedText,
      totalParagraphs: newParas.length,
      totalWords: updatedText.split(/\s+/).filter(Boolean).length,
      pageStructure: updatedPageStructure
    };

    const updatedZones: BookZones = {
      novelBody: updatedText,
      novelParagraphs: newParas,
      preliminaryMatter: {
        hasPreliminary: false,
        title: '',
        text: '',
        wordCount: 0,
        paragraphsCount: 0
      },
      frontMatter: {
        title: state.zones?.frontMatter?.title || '',
        author: state.zones?.frontMatter?.author || '',
        hasFrontMatter: false,
        dedication: '',
        epigraph: ''
      },
      footnotes: state.zones?.footnotes || [],
      chapters: state.zones?.chapters || [],
      backMatter: {
        hasBackMatter: false,
        title: '',
        text: '',
        wordCount: 0,
        type: 'other'
      }
    };

    if (slot === 'A') {
      setParallelSourceAText(updatedText);
      setBookZonesA(updatedZones);
      setParallelConfig(prev => ({ 
        ...prev, 
        prologueTitleA: '', 
        prologueTextA: '',
        dedicationTextA: '',
        epigraphTextA: ''
      }));
    } else {
      setParallelSourceBText(updatedText);
      setBookZonesB(updatedZones);
      setParallelConfig(prev => ({ 
        ...prev, 
        prologueTitleB: '', 
        prologueTextB: '',
        dedicationTextB: '',
        epigraphTextB: ''
      }));
    }

    setState(prev => ({
      ...prev,
      boundaryStartRawIdx: newStartIdx,
      boundaryEndRawIdx: newEndIdx,
      inspection: updatedInspection,
      zones: updatedZones || prev.zones
    }));
  };

  const handleAdjustBoundary = (slot: 'A' | 'B', type: 'start' | 'end', delta: number) => {
    const state = slot === 'A' ? stateA : stateB;
    if (!state.inspection || !state.extractedText) return;

    const rawParas = state.extractedText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    if (rawParas.length === 0) return;

    const curParas = state.inspection.pureBodyText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '').slice(0, 50);

    if (type === 'start') {
      const curStartNorm = norm(curParas[0] || '');
      let rawStartIdx = rawParas.findIndex(rp => norm(rp).includes(curStartNorm) || curStartNorm.includes(norm(rp)));
      if (rawStartIdx === -1) rawStartIdx = 0;
      handleSetDirectParagraphBoundary(slot, 'start', rawStartIdx + delta);
    } else {
      if (delta === 9999) {
        handleSetDirectParagraphBoundary(slot, 'end', rawParas.length - 1);
      } else {
        const curEndNorm = norm(curParas[curParas.length - 1] || '');
        let rawEndIdx = -1;
        for (let i = rawParas.length - 1; i >= 0; i--) {
          if (norm(rawParas[i]).includes(curEndNorm) || curEndNorm.includes(norm(rawParas[i]))) {
            rawEndIdx = i;
            break;
          }
        }
        if (rawEndIdx === -1) rawEndIdx = rawParas.length - 1;
        handleSetDirectParagraphBoundary(slot, 'end', rawEndIdx + delta);
      }
    }
  };

  const handleSetPageBoundary = (slot: 'A' | 'B', type: 'start' | 'end', pageNumber: number) => {
    const state = slot === 'A' ? stateA : stateB;
    if (!state.inspection || !state.extractedText) return;

    const rawParas = state.extractedText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    if (rawParas.length === 0) return;

    // Buscar en pdfPages primero si está disponible
    if (state.pdfPages && state.pdfPages.length > 0) {
      const pageObj = state.pdfPages.find(p => p.pageNumber === pageNumber);
      if (pageObj && pageObj.text.trim()) {
        if (type === 'start') {
          const pageFirstSentence = pageObj.text.trim().slice(0, 80).toLowerCase().replace(/[^a-z0-9]/gi, '');
          const foundIdx = rawParas.findIndex(rp => rp.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(pageFirstSentence) || pageFirstSentence.includes(rp.toLowerCase().replace(/[^a-z0-9]/gi, '').slice(0, 40)));
          if (foundIdx !== -1) {
            handleSetDirectParagraphBoundary(slot, type, foundIdx, pageNumber);
            return;
          }
        } else {
          // Para FIN: localizar el ÚLTIMO párrafo de esa página para incluir la página completa
          const pageParas = pageObj.text.trim().split(/\n\s*\n+/).filter(Boolean);
          const pageLastSnippet = (pageParas[pageParas.length - 1] || pageObj.text.trim()).slice(-100).toLowerCase().replace(/[^a-z0-9]/gi, '');
          let foundIdx = -1;
          for (let i = rawParas.length - 1; i >= 0; i--) {
            const rpClean = rawParas[i].toLowerCase().replace(/[^a-z0-9]/gi, '');
            if (rpClean.includes(pageLastSnippet) || pageLastSnippet.includes(rpClean.slice(-50))) {
              foundIdx = i;
              break;
            }
          }
          if (foundIdx !== -1) {
            handleSetDirectParagraphBoundary(slot, type, foundIdx, pageNumber);
            return;
          }
        }
      }
    }

    const targetPage = state.inspection.pageStructure?.pagesAnalysis?.find(p => p.pageNumber === pageNumber);
    const targetSnippet = targetPage?.snippet;

    if (targetSnippet) {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '').slice(0, 40);
      const targetNorm = norm(targetSnippet);
      if (type === 'start') {
        const pageParaIdx = rawParas.findIndex(rp => {
          const rpNorm = norm(rp);
          return rpNorm.includes(targetNorm) || targetNorm.includes(rpNorm);
        });
        if (pageParaIdx !== -1) {
          handleSetDirectParagraphBoundary(slot, type, pageParaIdx, pageNumber);
          return;
        }
      } else {
        let lastMatchIdx = -1;
        for (let i = rawParas.length - 1; i >= 0; i--) {
          const rpNorm = norm(rawParas[i]);
          if (rpNorm.includes(targetNorm) || targetNorm.includes(rpNorm)) {
            lastMatchIdx = i;
            break;
          }
        }
        if (lastMatchIdx !== -1) {
          handleSetDirectParagraphBoundary(slot, type, lastMatchIdx, pageNumber);
          return;
        }
      }
    }

    // Fallback directo por proporción si no hubo coincidencia de snippet
    const totalPgs = state.inspection.pageStructure?.totalPages || 1;
    const estimatedIdx = type === 'start' 
      ? Math.max(0, Math.floor(((pageNumber - 1) / totalPgs) * rawParas.length))
      : Math.min(rawParas.length - 1, Math.ceil((pageNumber / totalPgs) * rawParas.length) - 1);
    handleSetDirectParagraphBoundary(slot, type, estimatedIdx, pageNumber);
  };

  const handleSearchAndSetBoundary = (slot: 'A' | 'B', type: 'start' | 'end', phrase: string) => {
    // Si el usuario busca y marca una frase, la acotación es EXACTA (corte estricto al milímetro):
    // La obra concluye exactamente donde concluye la frase marcada, descartando todo lo posterior del párrafo a amarillo.
    handleSetExactTextBoundary(slot, type, phrase);
  };

  const handleSetExactTextBoundary = (
    slot: 'A' | 'B',
    type: 'start' | 'end',
    selectedText: string,
    pageNumber?: number
  ) => {
    const state = slot === 'A' ? stateA : stateB;
    const setState = slot === 'A' ? setStateA : setStateB;
    if (!state.inspection || !state.extractedText || !selectedText.trim()) return;

    const currentInsp = state.inspection;
    const cleanSel = selectedText.trim();
    const isEnd = type === 'end';

    // 1. Localización estricta por cadena en el texto completo extraído
    let preferredOffset: number | undefined = undefined;
    if (pageNumber !== undefined && state.pdfPages && state.pdfPages.length > 0) {
      const pageObj = state.pdfPages.find(p => p.pageNumber === pageNumber);
      if (pageObj && pageObj.text.trim()) {
        const pageSample = pageObj.text.trim().slice(0, 60).toLowerCase().replace(/[^a-z0-9]/gi, '');
        if (pageSample.length >= 10) {
          const rawClean = state.extractedText.toLowerCase().replace(/[^a-z0-9]/gi, '');
          const idx = rawClean.indexOf(pageSample.slice(0, 30));
          if (idx !== -1) {
            preferredOffset = Math.floor((idx / Math.max(1, rawClean.length)) * state.extractedText.length);
          }
        }
      }
    }

    const posMatch = findPhrasePositionInText(state.extractedText, cleanSel, isEnd, preferredOffset);

    if (posMatch) {
      let cutStart = state.boundaryStartCharIdx !== undefined ? state.boundaryStartCharIdx : -1;
      let cutEnd = state.boundaryEndCharIdx !== undefined ? state.boundaryEndCharIdx : -1;

      // Preservar de manera robusta el ancla previa si ya estaba delimitada
      if (currentInsp.pureBodyText) {
        const existingPos = state.extractedText.indexOf(currentInsp.pureBodyText);
        if (existingPos >= 0) {
          if (cutStart === -1) cutStart = existingPos;
          if (cutEnd === -1) cutEnd = existingPos + currentInsp.pureBodyText.length;
        }
      }
      if (cutStart === -1) cutStart = 0;
      if (cutEnd === -1) cutEnd = state.extractedText.length;

      if (type === 'start') {
        cutStart = posMatch.start;

        // El final se mantiene donde estaba sin desconfigurar el desenlace previo
        if (cutEnd <= cutStart) {
          cutEnd = state.extractedText.length;
        }
      } else {
        // EN LOS PÁRRAFOS FINALES LA REGLA ES RETROACTIVA:
        // La obra termina EXACTAMENTE donde concluye la selección o frase (posMatch.end).
        // Todo lo que esté después en el mismo párrafo (licencias, avisos, notas, colofones) queda 100% DESCARTADO a amarillo.
        cutEnd = posMatch.end;

        // El inicio se mantiene donde estaba sin desconfigurar el arranque previo
        if (cutStart >= cutEnd) {
          cutStart = Math.min(cutStart, Math.max(0, cutEnd - 10));
        }
      }

      const exactPureBody = state.extractedText.slice(cutStart, cutEnd).trim();
      const pureParas = exactPureBody.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
      const newFirst = pureParas[0] || cleanSel;
      const newLast = pureParas[pureParas.length - 1] || cleanSel;

      // Actualizar estructura de páginas con zonificación contigua y detección garantizada de página
      const totalPagesCount = state.pdfPages?.length || currentInsp.pageStructure?.totalPages || 1;
      let updatedPageStructure: BookPageStructure = currentInsp.pageStructure 
        ? { ...currentInsp.pageStructure }
        : {
            totalPages: totalPagesCount,
            novelStartPage: 1,
            novelEndPage: totalPagesCount,
            frontMatterPages: 'Ninguna',
            backMatterPages: 'Ninguna',
            hasExplicitPages: Boolean(state.pdfPages && state.pdfPages.length > 0),
            pagesAnalysis: (state.pdfPages || []).map(p => ({
              pageNumber: p.pageNumber,
              snippet: p.text.slice(0, 100),
              wordsCount: p.text.split(/\s+/).filter(Boolean).length,
              charsCount: p.text.length,
              paragraphsCount: p.text.split(/\n\s*\n+/).filter(Boolean).length,
              category: 'narrative_body' as const,
              isNovelStart: p.pageNumber === 1,
              isNovelEnd: p.pageNumber === totalPagesCount
            }))
          };

      // Hallar la página exacta del inicio y del final en base a la posición de corte
      let foundStartPage = updatedPageStructure.novelStartPage || 1;
      let foundEndPage = updatedPageStructure.novelEndPage || totalPagesCount;

      if (state.pdfPages && state.pdfPages.length > 0) {
        if (type === 'start') {
          if (pageNumber !== undefined) {
            foundStartPage = pageNumber;
          } else {
            // Buscar la página que contiene la frase inicial
            const sample = (newFirst || cleanSel).slice(0, 40).toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '');
            if (sample.length >= 6) {
              const matchedP = state.pdfPages.find(p => p.text.toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '').includes(sample));
              if (matchedP) {
                foundStartPage = matchedP.pageNumber;
              }
            }
            if (!foundStartPage || foundStartPage === 1) {
              // Estimar por proporción
              const ratio = state.extractedText.length > 0 ? cutStart / state.extractedText.length : 0;
              foundStartPage = Math.max(1, Math.min(state.pdfPages.length, Math.floor(ratio * state.pdfPages.length) + 1));
            }
          }
        } else {
          // type === 'end'
          if (pageNumber !== undefined) {
            foundEndPage = pageNumber;
          } else {
            // Buscar la página que contiene la frase final
            const sample = (newLast || cleanSel).slice(-40).toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '');
            if (sample.length >= 6) {
              for (let i = state.pdfPages.length - 1; i >= 0; i--) {
                const p = state.pdfPages[i];
                if (p.text.toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '').includes(sample)) {
                  foundEndPage = p.pageNumber;
                  break;
                }
              }
            }
            if (!foundEndPage || foundEndPage === totalPagesCount) {
              const ratio = state.extractedText.length > 0 ? cutEnd / state.extractedText.length : 1;
              foundEndPage = Math.max(1, Math.min(state.pdfPages.length, Math.ceil(ratio * state.pdfPages.length)));
            }
          }
        }
      } else if (pageNumber !== undefined) {
        if (type === 'start') foundStartPage = pageNumber;
        else foundEndPage = pageNumber;
      }

      foundStartPage = Math.min(foundStartPage, foundEndPage);
      foundEndPage = Math.max(foundStartPage, foundEndPage);

      updatedPageStructure.novelStartPage = foundStartPage;
      updatedPageStructure.novelEndPage = foundEndPage;
      updatedPageStructure.frontMatterPages = foundStartPage > 1 ? `1–${foundStartPage - 1}` : 'Ninguna';
      updatedPageStructure.backMatterPages = foundEndPage < updatedPageStructure.totalPages ? `${foundEndPage + 1}–${updatedPageStructure.totalPages}` : 'Ninguna';

      if (updatedPageStructure.pagesAnalysis && updatedPageStructure.pagesAnalysis.length > 0) {
        updatedPageStructure.pagesAnalysis = updatedPageStructure.pagesAnalysis.map(pa => {
          const pNum = pa.pageNumber;
          const isStart = pNum === foundStartPage;
          const isEndPage = pNum === foundEndPage;
          let category: PageDetailAnalysis['category'];
          if (pNum < foundStartPage) {
            category = 'prologue_preface';
          } else if (pNum > foundEndPage) {
            category = 'back_matter_colophon';
          } else {
            category = 'narrative_body';
          }
          return {
            ...pa,
            isNovelStart: isStart,
            isNovelEnd: isEndPage,
            category
          };
        });
      }

      const updatedInspection: BookEndpointInspection = {
        ...currentInsp,
        firstParagraph: newFirst,
        firstParagraphSnippet: newFirst.length > 250 ? newFirst.slice(0, 250) + '...' : newFirst,
        lastParagraph: newLast,
        lastParagraphSnippet: newLast.length > 250 ? '...' + newLast.slice(-250) : newLast,
        pureBodyText: exactPureBody,
        totalParagraphs: pureParas.length,
        totalWords: exactPureBody.split(/\s+/).filter(Boolean).length,
        pageStructure: updatedPageStructure
      };

      const updatedZones: BookZones = {
        novelBody: exactPureBody,
        novelParagraphs: pureParas,
        preliminaryMatter: {
          hasPreliminary: false,
          title: '',
          text: '',
          wordCount: 0,
          paragraphsCount: 0
        },
        frontMatter: {
          title: state.zones?.frontMatter?.title || '',
          author: state.zones?.frontMatter?.author || '',
          hasFrontMatter: false,
          dedication: '',
          epigraph: ''
        },
        footnotes: state.zones?.footnotes || [],
        chapters: state.zones?.chapters || [],
        backMatter: {
          hasBackMatter: false,
          title: '',
          text: '',
          wordCount: 0,
          type: 'other'
        }
      };

      if (slot === 'A') {
        setParallelSourceAText(exactPureBody);
        setBookZonesA(updatedZones);
        setParallelConfig(prev => ({ 
          ...prev, 
          prologueTitleA: '', 
          prologueTextA: '',
          dedicationTextA: '',
          epigraphTextA: ''
        }));
      } else {
        setParallelSourceBText(exactPureBody);
        setBookZonesB(updatedZones);
        setParallelConfig(prev => ({ 
          ...prev, 
          prologueTitleB: '', 
          prologueTextB: '',
          dedicationTextB: '',
          epigraphTextB: ''
        }));
      }

      setState(prev => ({
        ...prev,
        boundaryStartCharIdx: cutStart,
        boundaryEndCharIdx: cutEnd,
        inspection: updatedInspection,
        zones: updatedZones || prev.zones
      }));
      return;
    }

    // 2. Fallback por párrafos si la búsqueda directa no arrojó índice
    const rawParas = state.extractedText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '');
    const searchNorm = norm(cleanSel);

    let matchIdx = -1;
    if (type === 'start') {
      matchIdx = rawParas.findIndex(p => norm(p).includes(searchNorm) || searchNorm.includes(norm(p)));
      if (matchIdx === -1) {
        const firstWords = cleanSel.split(/\s+/).slice(0, 4).join(' ');
        const firstNorm = norm(firstWords);
        if (firstNorm.length >= 4) {
          matchIdx = rawParas.findIndex(p => norm(p).includes(firstNorm));
        }
      }
    } else {
      for (let i = rawParas.length - 1; i >= 0; i--) {
        if (norm(rawParas[i]).includes(searchNorm) || searchNorm.includes(norm(rawParas[i]))) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx === -1) {
        const lastWords = cleanSel.split(/\s+/).slice(-4).join(' ');
        const lastNorm = norm(lastWords);
        if (lastNorm.length >= 4) {
          for (let i = rawParas.length - 1; i >= 0; i--) {
            if (norm(rawParas[i]).includes(lastNorm)) {
              matchIdx = i;
              break;
            }
          }
        }
      }
    }

    if (matchIdx !== -1) {
      const modifiedParas = [...rawParas];
      if (type === 'start') {
        const targetP = modifiedParas[matchIdx];
        const pNorm = targetP.toLowerCase();
        const selNorm = cleanSel.toLowerCase();
        const pos = pNorm.indexOf(selNorm);
        if (pos > 0) {
          const beforeSel = targetP.slice(0, pos);
          const chapterMatch = beforeSel.match(/(?:c\s*ap[ií]tulo|chapter|kapitel|parte|libro|\b[IVXLCDM]+\b)[^\n]*$/i);
          if (chapterMatch && chapterMatch.index !== undefined) {
            modifiedParas[matchIdx] = targetP.slice(chapterMatch.index).trim();
          } else {
            modifiedParas[matchIdx] = targetP.slice(pos).trim();
          }
        }
      } else if (type === 'end') {
        const targetP = modifiedParas[matchIdx];
        const pNorm = targetP.toLowerCase();
        const selNorm = cleanSel.toLowerCase();
        const pos = pNorm.lastIndexOf(selNorm);
        if (pos !== -1) {
          let cutEnd = pos + cleanSel.length;
          while (cutEnd < targetP.length && /[.!?"»”')\]]/.test(targetP[cutEnd])) {
            cutEnd++;
          }
          if (cutEnd < targetP.length) {
            modifiedParas[matchIdx] = targetP.slice(0, cutEnd).trim();
          }
        }
      }
      handleSetDirectParagraphBoundary(slot, type, matchIdx, pageNumber, modifiedParas);
    } else if (pageNumber !== undefined) {
      handleSetPageBoundary(slot, type, pageNumber);
    }
  };

  const processFile = async (
    file: File, 
    setState: React.Dispatch<React.SetStateAction<FileUploadState>>,
    suggestedTitleSetter?: (t: string) => void,
    slot: 'A' | 'B' = 'A'
  ) => {
    setState(prev => ({
      ...prev,
      file,
      name: file.name,
      size: file.size,
      isExtracting: true,
      progress: 10,
      message: 'Extrayendo contenido...',
      error: null
    }));

    try {
      let rawText = '';
      let isPdfNative = false;
      let pageCount = 0;
      let pdfPages: { pageNumber: number; text: string }[] | undefined = undefined;
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith('.pdf')) {
        setState(prev => ({ ...prev, message: 'Analizando páginas y capa de texto del PDF...' }));
        const pdfResult = await extractFromPdf(file, (p, msg) => {
          setState(prev => ({ ...prev, progress: p, message: msg || 'Extrayendo...' }));
        });
        rawText = pdfResult.fullText;
        pageCount = pdfResult.pages?.length || 0;
        isPdfNative = !pdfResult.isScannedPdf;
        pdfPages = pdfResult.pages?.map(p => ({ pageNumber: p.pageNumber, text: p.text }));
      } else if (lowerName.endsWith('.docx')) {
        setState(prev => ({ ...prev, message: 'Extrayendo documento Word...' }));
        const docxResult = await extractFromDocx(file);
        rawText = docxResult.fullText;
      } else {
        setState(prev => ({ ...prev, message: 'Leyendo archivo de texto plano...' }));
        const txtResult = await extractFromTextFile(file);
        rawText = txtResult.fullText;
      }

      // 1. Auto-detección inteligente del idioma de la obra y limpieza de nombre de archivo
      const detectedLang = detectTextLanguage(rawText);
      const filenameMeta = cleanBookMetadataFromFilename(file.name);
      const textMeta = extractMetadataFromBookText(rawText);

      // 2. Extraer metadatos de portadilla o cabecera
      const frontMatter = disentangleOpeningFrontMatter(rawText);
      const candidateTitle = filenameMeta.title || textMeta.title || frontMatter.title;
      const candidateAuthor = filenameMeta.author || textMeta.author || frontMatter.author || author;

      // 2b. Resolución canónica 100% determinista local (0 Tokens, instantánea)
      let canonicalProfile = lookupCanonicalWorkLocally(candidateTitle, candidateAuthor, rawText);

      // 2c. Bloquificación completa en 5 zonas canónicas (Inicio, Prólogo, Cuerpo, Notas, Final)
      const bookZones = disentangleBookZones(rawText, candidateTitle, candidateAuthor, canonicalProfile || undefined);
      const prologueAnalysis = analyzeNovelPrologueAndStart(rawText, canonicalProfile || undefined);
      const footnoteResult = isolateFootnotesFromText(rawText);

      const deducedTitle = canonicalProfile?.title || candidateTitle || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const deducedAuthor = canonicalProfile?.author || candidateAuthor || author;

      if (suggestedTitleSetter && deducedTitle) {
        suggestedTitleSetter(deducedTitle);
      }
      if (deducedAuthor && !author) {
        setAuthor(deducedAuthor);
      }

      const inspection = inspectBookEndpointsAndPureBody(
        rawText,
        deducedTitle,
        deducedAuthor,
        canonicalProfile || undefined,
        undefined,
        pdfPages
      );

      const cleanBody = inspection.pureBodyText || bookZones.novelBody || rawText;
      bookZones.novelBody = cleanBody;

      if (slot === 'A') {
        setBookZonesA(bookZones);
      } else {
        setBookZonesB(bookZones);
      }

      // 3. Configuración automática de idioma y metadatos en contexto según el slot
      if (slot === 'A') {
        if (detectedLang.confidence >= 0.25) {
          setLanguageA(detectedLang.name);
        }
        setParallelSourceAText(cleanBody);
        setMetadata(prev => ({
          ...prev,
          title: deducedTitle || prev.title,
          author: deducedAuthor || prev.author,
          language: detectedLang.name || prev.language,
          subject: filenameMeta.subject || prev.subject
        }));
        setParallelConfig(prev => ({
          ...prev,
          titleA: deducedTitle || prev.titleA,
          author: deducedAuthor || prev.author,
          languageA: detectedLang.name || prev.languageA,
          prologueTitleA: bookZones.preliminaryMatter.title || prev.prologueTitleA,
          prologueTextA: bookZones.preliminaryMatter.text || prev.prologueTextA,
          dedicationTextA: bookZones.frontMatter.dedication || prev.dedicationTextA,
          epigraphTextA: bookZones.frontMatter.epigraph || prev.epigraphTextA,
          backMatterTitleA: bookZones.backMatter.title || prev.backMatterTitleA,
          backMatterTextA: bookZones.backMatter.text || prev.backMatterTextA
        }));
      } else {
        if (detectedLang.confidence >= 0.25) {
          setLanguageB(detectedLang.name);
        }
        setParallelSourceBText(cleanBody);
        setParallelConfig(prev => ({
          ...prev,
          languageB: detectedLang.name || prev.languageB,
          titleB: canonicalProfile?.canonicalTitleOriginal || deducedTitle || prev.titleB,
          author: deducedAuthor || prev.author,
          prologueTitleB: bookZones.preliminaryMatter.title || prev.prologueTitleB,
          prologueTextB: bookZones.preliminaryMatter.text || prev.prologueTextB,
          dedicationTextB: bookZones.frontMatter.dedication || prev.dedicationTextB,
          epigraphTextB: bookZones.frontMatter.epigraph || prev.epigraphTextB,
          backMatterTitleB: bookZones.backMatter.title || prev.backMatterTitleB,
          backMatterTextB: bookZones.backMatter.text || prev.backMatterTextB
        }));
      }

      setState(prev => ({
        ...prev,
        extractedText: rawText,
        pageCount,
        pdfPages,
        isPdfWithNativeText: isPdfNative,
        prologueAnalysis,
        zones: bookZones,
        inspection,
        boundaryStartRawIdx: 0,
        boundaryEndRawIdx: Math.max(0, inspection.totalParagraphs - 1),
        boundaryStartCharIdx: 0,
        boundaryEndCharIdx: cleanBody.length,
        canonicalProfile,
        footnotesCount: footnoteResult.extractedFootnotes.length,
        isExtracting: false,
        progress: 100,
        message: 'Archivo analizado y estructura editorial extraída exitosamente.'
      }));

      // 4. Auto-bloquificación simétrica solo si AMBOS libros están presentes en el espacio de trabajo
      if (slot === 'A' && Boolean(stateB.extractedText || stateB.zones?.novelBody)) {
        setTimeout(() => {
          cleanAndPurifyEbookTexts(cleanBody, stateB.zones?.novelBody || stateB.extractedText || undefined);
        }, 150);
      } else if (slot === 'B' && Boolean(stateA.extractedText || stateA.zones?.novelBody)) {
        setTimeout(() => {
          cleanAndPurifyEbookTexts(stateA.zones?.novelBody || stateA.extractedText || undefined, cleanBody);
        }, 150);
      }

    } catch (err: any) {
      console.error('Error al procesar archivo paralelo:', err);
      setState(prev => ({
        ...prev,
        isExtracting: false,
        error: err.message || 'Error al procesar el archivo.'
      }));
    }
  };

  const handleLaunchParallelProcess = async () => {
    if (!stateA.extractedText || !stateB.extractedText) return;

    let textA = stateA.inspection?.pureBodyText || stateA.zones?.novelBody || stateA.extractedText;
    let textB = stateB.inspection?.pureBodyText || stateB.zones?.novelBody || stateB.extractedText;

    if (chaptersList.length > 0) {
      const firstChap = chaptersList[0];
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').trim().replace(/\s+/g, ' ');

      if (firstChap.startPhrase && firstChap.startPhrase.trim().length >= 5) {
        const phraseNorm = norm(firstChap.startPhrase).slice(0, 30);
        const parasA = textA.split(/\r?\n\s*\r?\n+/);
        const pIdx = parasA.findIndex(p => norm(p).includes(phraseNorm));
        if (pIdx > 0) {
          let startP = pIdx;
          if (startP > 0 && /^(?:#+\s*)?(?:cap[ií]tulo|chapter|parte|part|libro|book|[ivxlcdm]+|\d+)\b/i.test(parasA[startP - 1])) {
            startP--;
          }
          if (startP > 0) textA = parasA.slice(startP).join('\n\n');
        }
      }

      if (firstChap.startPhraseB && firstChap.startPhraseB.trim().length >= 5) {
        const phraseNorm = norm(firstChap.startPhraseB).slice(0, 30);
        const parasB = textB.split(/\r?\n\s*\r?\n+/);
        const pIdx = parasB.findIndex(p => norm(p).includes(phraseNorm));
        if (pIdx > 0) {
          let startP = pIdx;
          if (startP > 0 && /^(?:#+\s*)?(?:cap[ií]tulo|chapter|parte|part|libro|book|[ivxlcdm]+|\d+)\b/i.test(parasB[startP - 1])) {
            startP--;
          }
          if (startP > 0) textB = parasB.slice(startP).join('\n\n');
        }
      }
    }

    const resolvedAuthor = author || stateA.zones?.frontMatter.author || stateB.zones?.frontMatter.author || '';
    const resolvedTitleA = titleA || stateA.zones?.frontMatter.title || stateA.name.replace(/\.[^/.]+$/, '');
    const resolvedTitleB = titleB || stateB.zones?.frontMatter.title || stateB.name.replace(/\.[^/.]+$/, '');

    let prologueA = stateA.zones?.preliminaryMatter?.text || '';
    let prologueB = stateB.zones?.preliminaryMatter?.text || '';

    // 2. Cargar Chunks para Obra A (para visualizador y exportador principal)
    clearAllChunks();
    const chunksA = autoSplitTextIntoChunks(textA, 'heading', 800, resolvedTitleA);
    addMultipleChunks(chunksA.map(c => ({
      title: c.title,
      content: c.content,
      sourceType: stateA.isPdfWithNativeText ? 'pdf' : 'txt'
    })));

    // 3. Configurar metadatos del libro
    setMetadata(prev => ({
      ...prev,
      title: resolvedTitleA || prev.title,
      author: resolvedAuthor || prev.author,
      language: `${languageA} / ${languageB}`,
      editorialNotes: `Edición espejo bilingüe (${languageA} vs ${languageB}). Curaduría con aislamiento de prefacios y notas al pie.`
    }));

    // 4. Configurar ParallelBookConfig
    const updatedConfig = {
      ...parallelConfig,
      enabled: true,
      languageA,
      languageB,
      titleA: resolvedTitleA,
      titleB: resolvedTitleB,
      author: resolvedAuthor,
      isolatePrologues,
      filterFootnotes,
      startAtMainBodyOnly: startAtChapterOne,
      prologueTitleA: stateA.zones?.preliminaryMatter?.title || parallelConfig.prologueTitleA,
      prologueTextA: prologueA,
      prologueTitleB: stateB.zones?.preliminaryMatter?.title || parallelConfig.prologueTitleB,
      prologueTextB: prologueB,
      backMatterTitleA: stateA.zones?.backMatter?.title || parallelConfig.backMatterTitleA,
      backMatterTextA: stateA.zones?.backMatter?.text || parallelConfig.backMatterTextA,
      backMatterTitleB: stateB.zones?.backMatter?.title || parallelConfig.backMatterTitleB,
      backMatterTextB: stateB.zones?.backMatter?.text || parallelConfig.backMatterTextB
    };

    setParallelConfig(updatedConfig);
    setParallelSourceAText(textA);
    setParallelSourceBText(textB);

    // 5. Ejecutar alineación inmediata de pliegos con configuración actualizada
    await runParallelAlignment(textB, updatedConfig, textA);

    // 6. Navegar a la pestaña 'paralelo'
    setActiveTab('paralelo');
  };

  const handleGoToCuratedEbook = async () => {
    if (!stateA.extractedText && !stateB.extractedText) return;

    let textA = stateA.inspection?.pureBodyText || stateA.zones?.novelBody || stateA.extractedText;
    let textB = stateB.inspection?.pureBodyText || stateB.zones?.novelBody || stateB.extractedText;

    // Si el usuario demarcó el primer capítulo en Fase 1, asegurar que el cuerpo empiece exactamente allí
    if (chaptersList.length > 0) {
      const firstChap = chaptersList[0];
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').trim().replace(/\s+/g, ' ');

      if (firstChap.startPhrase && firstChap.startPhrase.trim().length >= 5) {
        const phraseNorm = norm(firstChap.startPhrase).slice(0, 30);
        const parasA = textA.split(/\r?\n\s*\r?\n+/);
        const pIdx = parasA.findIndex(p => norm(p).includes(phraseNorm));
        if (pIdx > 0) {
          let startP = pIdx;
          if (startP > 0 && /^(?:#+\s*)?(?:cap[ií]tulo|chapter|parte|part|libro|book|[ivxlcdm]+|\d+)\b/i.test(parasA[startP - 1])) {
            startP--;
          }
          if (startP > 0) {
            textA = parasA.slice(startP).join('\n\n');
          }
        }
      }

      if (firstChap.startPhraseB && firstChap.startPhraseB.trim().length >= 5) {
        const phraseNorm = norm(firstChap.startPhraseB).slice(0, 30);
        const parasB = textB.split(/\r?\n\s*\r?\n+/);
        const pIdx = parasB.findIndex(p => norm(p).includes(phraseNorm));
        if (pIdx > 0) {
          let startP = pIdx;
          if (startP > 0 && /^(?:#+\s*)?(?:cap[ií]tulo|chapter|parte|part|libro|book|[ivxlcdm]+|\d+)\b/i.test(parasB[startP - 1])) {
            startP--;
          }
          if (startP > 0) {
            textB = parasB.slice(startP).join('\n\n');
          }
        }
      }
    }

    const resolvedAuthor = author || stateA.zones?.frontMatter.author || stateB.zones?.frontMatter.author || '';
    const resolvedTitleA = titleA || stateA.zones?.frontMatter.title || stateA.name.replace(/\.[^/.]+$/, '');
    const resolvedTitleB = titleB || stateB.zones?.frontMatter.title || stateB.name.replace(/\.[^/.]+$/, '');

    // Configurar metadatos del libro
    setMetadata(prev => ({
      ...prev,
      title: resolvedTitleA || prev.title,
      author: resolvedAuthor || prev.author,
      language: `${languageA} / ${languageB}`,
      editorialNotes: `Edición espejo bilingüe (${languageA} vs ${languageB}). Curaduría con aislamiento de prefacios y notas al pie.`
    }));

    setParallelConfig(prev => ({
      ...prev,
      enabled: true,
      languageA,
      languageB,
      titleA: resolvedTitleA,
      titleB: resolvedTitleB,
      author: resolvedAuthor,
      isolatePrologues,
      filterFootnotes,
      startAtMainBodyOnly: startAtChapterOne,
      prologueTitleA: (stateA.boundaryStartRawIdx !== undefined || stateA.boundaryStartCharIdx !== undefined || (textA && textA !== stateA.extractedText)) ? '' : (stateA.zones?.preliminaryMatter?.title || prev.prologueTitleA),
      prologueTextA: (stateA.boundaryStartRawIdx !== undefined || stateA.boundaryStartCharIdx !== undefined || (textA && textA !== stateA.extractedText)) ? '' : (stateA.zones?.preliminaryMatter?.text || prev.prologueTextA),
      prologueTitleB: (stateB.boundaryStartRawIdx !== undefined || stateB.boundaryStartCharIdx !== undefined || (textB && textB !== stateB.extractedText)) ? '' : (stateB.zones?.preliminaryMatter?.title || prev.prologueTitleB),
      prologueTextB: (stateB.boundaryStartRawIdx !== undefined || stateB.boundaryStartCharIdx !== undefined || (textB && textB !== stateB.extractedText)) ? '' : (stateB.zones?.preliminaryMatter?.text || prev.prologueTextB),
      chapters: chaptersList.map(c => ({
        id: `chap_${c.number}`,
        number: c.number,
        title: c.title,
        level: 1,
        pageNumber: c.pageNumber,
        pageNumberB: c.pageNumberB,
        startPhrase: c.startPhrase,
        startPhraseB: c.startPhraseB
      })),
      backMatterTitleA: stateA.zones?.backMatter?.title || prev.backMatterTitleA,
      backMatterTextA: stateA.zones?.backMatter?.text || prev.backMatterTextA,
      backMatterTitleB: stateB.zones?.backMatter?.title || prev.backMatterTitleB,
      backMatterTextB: stateB.zones?.backMatter?.text || prev.backMatterTextB
    }));

    clearAllChunks();
    const chunksA = autoSplitTextIntoChunks(textA, 'heading', 800, resolvedTitleA);
    addMultipleChunks(chunksA.map(c => ({
      title: c.title,
      content: c.content,
      sourceType: stateA.isPdfWithNativeText ? 'pdf' : 'txt'
    })));

    setParallelSourceAText(textA);
    setParallelSourceBText(textB);

    // Ejecutar la limpieza interactiva con barra animada
    await cleanAndPurifyEbookTexts(textA, textB);

    // Navegar a la pestaña 'curaduria'
    setActiveTab('curaduria');
  };

  const bothReady = !!stateA.extractedText && !!stateB.extractedText;

  return (
    <div className="space-y-6">
      {/* Banner Informativo Editorial */}
      <div className="bg-emerald-950/60 border border-emerald-800/80 rounded-2xl p-5 text-emerald-100 shadow-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider border border-emerald-500/30">
                Ingesta Espejo Bilingüe
              </span>
              <span className="text-xs text-emerald-400 font-medium">• Curaduría Especializada de Novelas</span>
            </div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Columns className="w-5 h-5 text-amber-400" />
              Carga Simultánea de Dos Versiones (Idioma A + Idioma B)
            </h3>
            <p className="text-xs text-emerald-200/80 max-w-3xl leading-relaxed">
              Carga los dos archivos desde el principio para sincronizar sin desfasajes de párrafos. Detectamos si un libro incluye prefacios de traductores extensos o notas al pie críticas para que la historia comience en simetría exacta en el Capítulo 1.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2 bg-emerald-900/50 px-3 py-2 rounded-xl border border-emerald-700/50 text-xs text-emerald-300 font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>0 Tokens en PDFs con texto nativo</span>
          </div>
        </div>
      </div>

      {/* Barra de Control de Ingesta y Purga Total */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#111316] border border-stone-800 p-3.5 rounded-2xl">
        <div className="flex items-center gap-2.5 text-xs text-stone-300">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="font-bold text-stone-200">Panel de Control de Ingesta:</span>
          <span className="text-stone-400">
            {stateA.name ? `Libro A: ${stateA.name}` : 'Libro A vacío'} • {stateB.name ? `Libro B: ${stateB.name}` : 'Libro B vacío'}
          </span>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {purgeConfirmStep ? (
            <div className="flex items-center gap-2 bg-rose-950/90 border border-rose-700 px-3 py-1.5 rounded-xl shadow-md animate-in fade-in">
              <span className="text-xs font-bold text-rose-200">¿Purgar y reiniciar todo desde cero?</span>
              <button
                id="btn-confirm-purge-ingest"
                onClick={handlePurgeAllDualIngest}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-lg transition active:scale-95 cursor-pointer"
              >
                Sí, Purgar Todo
              </button>
              <button
                onClick={() => setPurgeConfirmStep(false)}
                className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs rounded-lg transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              id="btn-purge-dual-ingest-trigger"
              onClick={() => setPurgeConfirmStep(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer shadow-xs"
              title="Purgar completamente memoria, textos cargados y almacenamiento local para comenzar un libro nuevo sin rezagos"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Purgar / Iniciar Nuevo Libro</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid de Carga de Dos Archivos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* LADO A: VERSIÓN / IDIOMA A */}
        <div className="bg-[#101318] border border-zinc-800 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-xs flex items-center justify-center">
                A
              </span>
              <div>
                <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wide">
                  Libro / Versión A (Página Par Izquierda)
                </h4>
                <p className="text-[11px] text-zinc-400">Traducción o versión de lectura principal</p>
              </div>
            </div>
            {stateA.extractedText && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Cargado
                </span>
                <button
                  onClick={() => handleClearSlot('A')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-rose-950/80 hover:text-rose-300 text-zinc-400 text-[11px] border border-zinc-700/80 transition cursor-pointer"
                  title="Quitar este archivo del Libro A"
                >
                  <X className="w-3 h-3" />
                  <span>Quitar</span>
                </button>
              </div>
            )}
          </div>

          {/* Selector de Archivo A */}
          <div
            onClick={() => fileInputRefA.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files?.[0]) {
                processFile(e.dataTransfer.files[0], setStateA, setTitleA, 'A');
              }
            }}
            className="border border-zinc-800 hover:border-zinc-700 rounded-xl p-6 text-center cursor-pointer transition bg-[#0a0c10] group"
          >
            <input
              type="file"
              ref={fileInputRefA}
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  processFile(e.target.files[0], setStateA, setTitleA, 'A');
                }
              }}
            />
            <UploadCloud className="w-8 h-8 mx-auto text-zinc-400 group-hover:text-amber-400 group-hover:scale-105 transition mb-2.5" />
            <p className="text-xs font-bold text-zinc-200">
              {stateA.name ? stateA.name : 'Selecciona o arrastra el Archivo A (PDF, Word, TXT)'}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">
              {stateA.size ? `${(stateA.size / 1024).toFixed(1)} KB${stateA.pageCount ? ` • ${stateA.pageCount} páginas` : ''}` : 'Capa de texto digital o procesado'}
            </p>

            {stateA.isExtracting && (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-amber-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{stateA.message}</span>
              </div>
            )}
          </div>

          {/* Formulario de Metadatos de A */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-zinc-300 mb-1">Idioma A</label>
              <input
                type="text"
                value={languageA}
                onChange={e => setLanguageA(e.target.value)}
                placeholder="Ej. Español"
                className="w-full px-3 py-2 bg-[#0c0e12] border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-300 mb-1">Título de la Obra en A</label>
              <input
                type="text"
                value={titleA}
                onChange={e => setTitleA(e.target.value)}
                placeholder="Ej. La metamorfosis"
                className="w-full px-3 py-2 bg-[#0c0e12] border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none font-medium"
              />
            </div>
          </div>

          {/* Estado de Carga A */}
          {stateA.extractedText && (
            <div className="flex items-center justify-between p-3 bg-[#0a0c10] border border-zinc-800/80 rounded-xl text-xs text-zinc-300">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Libro A listo • {stateA.pageCount ? `${stateA.pageCount} págs. • ` : ''}{(stateA.extractedText.length / 1000).toFixed(0)}k caracteres</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                Texto Extraído
              </span>
            </div>
          )}

        </div>

        {/* LADO B: VERSIÓN / IDIOMA B (ESPEJO) */}
        <div className="bg-[#101318] border border-zinc-800 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-xs flex items-center justify-center">
                B
              </span>
              <div>
                <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wide">
                  Libro / Versión B (Página Impar Derecha)
                </h4>
                <p className="text-[11px] text-zinc-400">Texto original o idioma de contraste en espejo</p>
              </div>
            </div>
            {stateB.extractedText && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Cargado
                </span>
                <button
                  onClick={() => handleClearSlot('B')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-rose-950/80 hover:text-rose-300 text-zinc-400 text-[11px] border border-zinc-700/80 transition cursor-pointer"
                  title="Quitar este archivo del Libro B"
                >
                  <X className="w-3 h-3" />
                  <span>Quitar</span>
                </button>
              </div>
            )}
          </div>

          {/* Selector de Archivo B */}
          <div
            onClick={() => fileInputRefB.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files?.[0]) {
                processFile(e.dataTransfer.files[0], setStateB, setTitleB, 'B');
              }
            }}
            className="border border-zinc-800 hover:border-zinc-700 rounded-xl p-6 text-center cursor-pointer transition bg-[#0a0c10] group"
          >
            <input
              type="file"
              ref={fileInputRefB}
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  processFile(e.target.files[0], setStateB, setTitleB, 'B');
                }
              }}
            />
            <UploadCloud className="w-8 h-8 mx-auto text-zinc-400 group-hover:text-amber-400 group-hover:scale-105 transition mb-2.5" />
            <p className="text-xs font-bold text-zinc-200">
              {stateB.name ? stateB.name : 'Selecciona o arrastra el Archivo B (PDF, Word, TXT)'}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">
              {stateB.size ? `${(stateB.size / 1024).toFixed(1)} KB${stateB.pageCount ? ` • ${stateB.pageCount} páginas` : ''}` : 'Texto original a emparejar'}
            </p>

            {stateB.isExtracting && (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-amber-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{stateB.message}</span>
              </div>
            )}
          </div>

          {/* Formulario de Metadatos de B */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-zinc-300 mb-1">Idioma B</label>
              <input
                type="text"
                value={languageB}
                onChange={e => setLanguageB(e.target.value)}
                placeholder="Ej. Alemán (Original)"
                className="w-full px-3 py-2 bg-[#0c0e12] border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-300 mb-1">Título de la Obra en B</label>
              <input
                type="text"
                value={titleB}
                onChange={e => setTitleB(e.target.value)}
                placeholder="Ej. Die Verwandlung"
                className="w-full px-3 py-2 bg-[#0c0e12] border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none font-medium"
              />
            </div>
          </div>

          {/* Estado de Carga B */}
          {stateB.extractedText && (
            <div className="flex items-center justify-between p-3 bg-[#0a0c10] border border-zinc-800/80 rounded-xl text-xs text-zinc-300">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Libro B listo • {stateB.pageCount ? `${stateB.pageCount} págs. • ` : ''}{(stateB.extractedText.length / 1000).toFixed(0)}k caracteres</span>
              </span>
              <span className="text-[10px] text-sky-400 font-mono font-bold bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/60">
                Texto Extraído
              </span>
            </div>
          )}
        </div>
      </div>

      {/* PANEL PARALELO DE DELIMITACIÓN Y RECONOCIMIENTO (FASE 1) */}
      {(stateA.extractedText || stateB.extractedText) && (
        <Phase1ParallelDelimitation
          bookA={{
            slot: 'A',
            name: stateA.name,
            language: languageA,
            extractedText: stateA.extractedText,
            pdfPages: stateA.pdfPages,
            inspection: stateA.inspection,
            onAdjustBoundary: (type, delta) => handleAdjustBoundary('A', type, delta),
            onSetExactTextBoundary: (type, text, page) => handleSetExactTextBoundary('A', type, text, page)
          }}
          bookB={{
            slot: 'B',
            name: stateB.name,
            language: languageB,
            extractedText: stateB.extractedText,
            pdfPages: stateB.pdfPages,
            inspection: stateB.inspection,
            onAdjustBoundary: (type, delta) => handleAdjustBoundary('B', type, delta),
            onSetExactTextBoundary: (type, text, page) => handleSetExactTextBoundary('B', type, text, page)
          }}
          titleA={titleA}
          setTitleA={setTitleA}
          titleB={titleB}
          setTitleB={setTitleB}
          author={author}
          setAuthor={setAuthor}
          languageA={languageA}
          setLanguageA={setLanguageA}
          languageB={languageB}
          setLanguageB={setLanguageB}
          publicationYear={publicationYear}
          setPublicationYear={setPublicationYear}
          publisher={publisher}
          setPublisher={setPublisher}
          onRunOnlineInvestigation={handleRunOnlineInvestigation}
          isInvestigatingOnline={isInvestigatingOnline}
          onProceedToPhase2={handleGoToCuratedEbook}
          initialChapters={chaptersList}
          onChaptersUpdated={(newChapters) => {
            setChaptersList(newChapters);
            setParallelConfig(prev => ({
              ...prev,
              chapters: newChapters.map(c => ({
                id: `chap_${c.number}`,
                number: c.number,
                title: c.title,
                level: 1,
                pageNumber: c.pageNumber,
                pageNumberB: c.pageNumberB,
                startPhrase: c.startPhrase,
                startPhraseB: c.startPhraseB
              }))
            }));
          }}
        />
      )}
    </div>
  );
};
