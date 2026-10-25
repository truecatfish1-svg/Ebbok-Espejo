import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Bookmark, 
  Flag, 
  Search, 
  Sparkles, 
  CheckCircle2, 
  Layers, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  Building2, 
  Globe2, 
  Plus, 
  Trash2, 
  Edit3, 
  ArrowRight, 
  FastForward, 
  FileText,
  X,
  HelpCircle,
  Eye,
  ArrowLeft,
  Sliders,
  Maximize2,
  Minimize2,
  Copy,
  Hash,
  ExternalLink,
  RefreshCw,
  GitCompare,
  Zap,
  Check,
  Split,
  Lock,
  Type as TypeIcon,
  AlignLeft,
  Wand2
} from 'lucide-react';
import type { BookEndpointInspection } from '../types';
import { 
  extractTableOfContentsFromSpecificPage, 
  investigateBookStructureAndChaptersOnline,
  extractTOCDeterministically
} from '../utils/onlineNovelInvestigator';
import { 
  findAnalogousParallelChapterStart,
  detectPrecedingChapterTitle,
  autoSynchronizeChaptersByCanonicalPhrases,
  sanitizePageAndEditorialMarkers
} from '../utils/chapterMirrorSynchronizer';
import { lookupCanonicalWorkLocally } from '../utils/intelligentBookCurator';

export interface Phase1BookSlot {
  slot: 'A' | 'B';
  name: string;
  language: string;
  extractedText: string;
  pdfPages?: { pageNumber: number; text: string }[];
  inspection?: BookEndpointInspection | null;
  onAdjustBoundary?: (type: 'start' | 'end', delta: number) => void;
  onSetDirectParagraphBoundary?: (type: 'start' | 'end', paraIdx: number) => void;
  onSetExactTextBoundary: (type: 'start' | 'end', text: string, pageNumber?: number) => void;
}

export interface ChapterEntry {
  number: number;
  title: string;
  hasPrintedTitleA?: boolean;
  hasPrintedTitleB?: boolean;
  pageNumber?: number;       // Página en Libro A
  pageNumberB?: number;      // Página en Libro B
  startPhrase?: string;      // Frase / Párrafo de inicio en Libro A
  startPhraseB?: string;     // Frase / Párrafo de inicio en Libro B
  source?: 'online_canonical' | 'manual_mirror' | 'scanned_toc' | 'canonical_auto_match';
}

export interface Phase1ParallelDelimitationProps {
  bookA: Phase1BookSlot;
  bookB: Phase1BookSlot;
  titleA: string;
  setTitleA: (t: string) => void;
  titleB: string;
  setTitleB: (t: string) => void;
  author: string;
  setAuthor: (a: string) => void;
  languageA: string;
  setLanguageA: (l: string) => void;
  languageB: string;
  setLanguageB: (l: string) => void;
  publicationYear?: string;
  setPublicationYear?: (y: string) => void;
  publisher?: string;
  setPublisher?: (p: string) => void;
  onRunOnlineInvestigation?: () => void;
  isInvestigatingOnline?: boolean;
  onProceedToPhase2: () => void;
  onChaptersUpdated?: (chapters: ChapterEntry[]) => void;
  initialChapters?: ChapterEntry[];
}

export const Phase1ParallelDelimitation: React.FC<Phase1ParallelDelimitationProps> = ({
  bookA,
  bookB,
  titleA,
  setTitleA,
  titleB,
  setTitleB,
  author,
  setAuthor,
  languageA,
  setLanguageA,
  languageB,
  setLanguageB,
  publicationYear = '',
  setPublicationYear,
  publisher = '',
  setPublisher,
  onRunOnlineInvestigation,
  isInvestigatingOnline = false,
  onProceedToPhase2,
  onChaptersUpdated,
  initialChapters = []
}) => {
  // Estado de Selección con el Ratón para Subrayado y Fijación Milimétrica (Bloque 1)
  const [selectedMouseSnippet, setSelectedMouseSnippet] = useState<{
    text: string;
    slot: 'A' | 'B';
    pageNumber?: number;
  } | null>(null);

  // Estados de retroalimentación
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Estados de visualización del Lector / Explorador General (Bloque 1)
  const [activeViewModeA, setActiveViewModeA] = useState<'pages' | 'continuous'>('pages');
  const [activeViewModeB, setActiveViewModeB] = useState<'pages' | 'continuous'>('pages');
  const [currentPageA, setCurrentPageA] = useState<number>(1);
  const [currentPageB, setCurrentPageB] = useState<number>(1);

  // Buscador de texto en tiempo real para Libro A y B (Bloque 1)
  const [searchQueryA, setSearchQueryA] = useState('');
  const [searchQueryB, setSearchQueryB] = useState('');

  // Frases manuales directas (Bloque 1)
  const [manualStartInputA, setManualStartInputA] = useState('');
  const [manualEndInputA, setManualEndInputA] = useState('');
  const [manualStartInputB, setManualStartInputB] = useState('');
  const [manualEndInputB, setManualEndInputB] = useState('');

  // =========================================================================
  // --- ÁMBITO ESTRICTO Y DEPENDIENTE DEL BLOQUE 1 PARA EL BLOQUE 3 ---
  // =========================================================================
  const novelStartPageA = useMemo(() => {
    if (bookA.inspection?.pageStructure?.novelStartPage && bookA.inspection.pageStructure.novelStartPage > 1) {
      return bookA.inspection.pageStructure.novelStartPage;
    }
    if (bookA.pdfPages && bookA.pdfPages.length > 0 && bookA.inspection?.firstParagraph) {
      const sample = bookA.inspection.firstParagraph.slice(0, 40).toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '');
      if (sample.length >= 6) {
        const found = bookA.pdfPages.find(p => p.text.toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '').includes(sample));
        if (found) return found.pageNumber;
      }
    }
    return bookA.inspection?.pageStructure?.novelStartPage || 1;
  }, [bookA.inspection, bookA.pdfPages]);

  const novelEndPageA = useMemo(() => {
    if (bookA.inspection?.pageStructure?.novelEndPage && bookA.inspection.pageStructure.novelEndPage < (bookA.pdfPages?.length || 9999)) {
      return bookA.inspection.pageStructure.novelEndPage;
    }
    if (bookA.pdfPages && bookA.pdfPages.length > 0 && bookA.inspection?.lastParagraph) {
      const sample = bookA.inspection.lastParagraph.slice(-40).toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '');
      if (sample.length >= 6) {
        for (let i = bookA.pdfPages.length - 1; i >= 0; i--) {
          if (bookA.pdfPages[i].text.toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '').includes(sample)) {
            return bookA.pdfPages[i].pageNumber;
          }
        }
      }
    }
    return bookA.inspection?.pageStructure?.novelEndPage || bookA.pdfPages?.length || 1;
  }, [bookA.inspection, bookA.pdfPages]);

  const delimitedTextA = useMemo(() => {
    return bookA.inspection?.pureBodyText || bookA.extractedText || '';
  }, [bookA.inspection?.pureBodyText, bookA.extractedText]);

  const novelStartPageB = useMemo(() => {
    if (bookB.inspection?.pageStructure?.novelStartPage && bookB.inspection.pageStructure.novelStartPage > 1) {
      return bookB.inspection.pageStructure.novelStartPage;
    }
    if (bookB.pdfPages && bookB.pdfPages.length > 0 && bookB.inspection?.firstParagraph) {
      const sample = bookB.inspection.firstParagraph.slice(0, 40).toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '');
      if (sample.length >= 6) {
        const found = bookB.pdfPages.find(p => p.text.toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '').includes(sample));
        if (found) return found.pageNumber;
      }
    }
    return bookB.inspection?.pageStructure?.novelStartPage || 1;
  }, [bookB.inspection, bookB.pdfPages]);

  const novelEndPageB = useMemo(() => {
    if (bookB.inspection?.pageStructure?.novelEndPage && bookB.inspection.pageStructure.novelEndPage < (bookB.pdfPages?.length || 9999)) {
      return bookB.inspection.pageStructure.novelEndPage;
    }
    if (bookB.pdfPages && bookB.pdfPages.length > 0 && bookB.inspection?.lastParagraph) {
      const sample = bookB.inspection.lastParagraph.slice(-40).toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '');
      if (sample.length >= 6) {
        for (let i = bookB.pdfPages.length - 1; i >= 0; i--) {
          if (bookB.pdfPages[i].text.toLowerCase().replace(/[^a-z0-9áéíóúñäöü]/gi, '').includes(sample)) {
            return bookB.pdfPages[i].pageNumber;
          }
        }
      }
    }
    return bookB.inspection?.pageStructure?.novelEndPage || bookB.pdfPages?.length || 1;
  }, [bookB.inspection, bookB.pdfPages]);

  const delimitedTextB = useMemo(() => {
    return bookB.inspection?.pureBodyText || bookB.extractedText || '';
  }, [bookB.inspection?.pureBodyText, bookB.extractedText]);

  // Páginas acotadas estrictamente al cuerpo de la novela (sin prólogos ni colofones)
  const delimitedPagesA = useMemo(() => {
    if (!bookA.pdfPages || bookA.pdfPages.length === 0) return [];
    return bookA.pdfPages
      .filter(p => p.pageNumber >= novelStartPageA && p.pageNumber <= novelEndPageA)
      .map(p => {
        let text = p.text;
        if (p.pageNumber === novelStartPageA && bookA.inspection?.firstParagraph) {
          const sample = bookA.inspection.firstParagraph.slice(0, 30);
          const idx = text.indexOf(sample);
          if (idx !== -1) {
            text = text.slice(idx);
          }
        }
        if (p.pageNumber === novelEndPageA && bookA.inspection?.lastParagraph) {
          const sample = bookA.inspection.lastParagraph.slice(-30);
          const idx = text.indexOf(sample);
          if (idx !== -1) {
            text = text.slice(0, idx + sample.length);
          }
        }
        return { ...p, text };
      });
  }, [bookA.pdfPages, novelStartPageA, novelEndPageA, bookA.inspection?.firstParagraph, bookA.inspection?.lastParagraph]);

  const delimitedPagesB = useMemo(() => {
    if (!bookB.pdfPages || bookB.pdfPages.length === 0) return [];
    return bookB.pdfPages
      .filter(p => p.pageNumber >= novelStartPageB && p.pageNumber <= novelEndPageB)
      .map(p => {
        let text = p.text;
        if (p.pageNumber === novelStartPageB && bookB.inspection?.firstParagraph) {
          const sample = bookB.inspection.firstParagraph.slice(0, 30);
          const idx = text.indexOf(sample);
          if (idx !== -1) {
            text = text.slice(idx);
          }
        }
        if (p.pageNumber === novelEndPageB && bookB.inspection?.lastParagraph) {
          const sample = bookB.inspection.lastParagraph.slice(-30);
          const idx = text.indexOf(sample);
          if (idx !== -1) {
            text = text.slice(0, idx + sample.length);
          }
        }
        return { ...p, text };
      });
  }, [bookB.pdfPages, novelStartPageB, novelEndPageB, bookB.inspection?.firstParagraph, bookB.inspection?.lastParagraph]);

  // =========================================================================
  // --- ESTADOS DEL BLOQUE 3: ÍNDICE Y DEMARCACIÓN DE SEGMENTOS ---
  // =========================================================================
  const [structureMode, setStructureMode] = useState<'canonical_online' | 'manual_mirror'>('canonical_online');
  const [activeTocTab, setActiveTocTab] = useState<'parallel_marker' | 'scan_page' | 'paste_text' | 'online_research'>('parallel_marker');
  const [selectedTocSlot, setSelectedTocSlot] = useState<'A' | 'B'>('A');
  const [selectedTocPageNumber, setSelectedTocPageNumber] = useState<number>(1);
  const [manualTocText, setManualTocText] = useState<string>('');
  const [isExtractingToc, setIsExtractingToc] = useState(false);
  const [isInvestigatingTocOnline, setIsInvestigatingTocOnline] = useState(false);
  const [isAutoAligningChapters, setIsAutoAligningChapters] = useState(false);
  const [tocMessage, setTocMessage] = useState<string | null>(null);

  // Snippet subrayado en el lector de capítulos del Bloque 3
  const [selectedChapterSnippet, setSelectedChapterSnippet] = useState<{
    text: string;
    slot: 'A' | 'B';
    pageNumber?: number;
  } | null>(null);

  // Lista viva de capítulos estructurados
  const [chaptersList, setChaptersList] = useState<ChapterEntry[]>(initialChapters);

  // Borrador del Capítulo en Curso en el Emparejador Paralelo
  const [chapterDraft, setChapterDraft] = useState<{
    number: number;
    title: string;
    hasPrintedTitleA: boolean;
    hasPrintedTitleB: boolean;
    startPhraseA: string;
    pageA?: number;
    startPhraseB: string;
    pageB?: number;
    matchConfidence?: 'high' | 'medium' | 'estimated' | 'confirmed';
  }>({
    number: 1,
    title: 'Capítulo 1',
    hasPrintedTitleA: true,
    hasPrintedTitleB: true,
    startPhraseA: '',
    startPhraseB: '',
    matchConfidence: undefined
  });

  // Navegación independiente del visor de capítulos en Bloque 3 (restringida a páginas de novela)
  const [chapViewerPageA, setChapViewerPageA] = useState<number>(novelStartPageA);
  const [chapViewerPageB, setChapViewerPageB] = useState<number>(novelStartPageB);
  const [chapViewModeA, setChapViewModeA] = useState<'pages' | 'continuous'>('pages');
  const [chapViewModeB, setChapViewModeB] = useState<'pages' | 'continuous'>('pages');
  const [chapSearchA, setChapSearchA] = useState('');
  const [chapSearchB, setChapSearchB] = useState('');

  // Búsqueda global a lo largo de todas las páginas de la obra delimitada en Libro A
  const searchResultsA = useMemo(() => {
    const q = chapSearchA.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const results: { pageNumber: number; count: number }[] = [];
    for (const page of delimitedPagesA) {
      const textLower = page.text.toLowerCase();
      if (textLower.includes(q)) {
        const matches = textLower.split(q).length - 1;
        results.push({ pageNumber: page.pageNumber, count: matches });
      }
    }
    return results;
  }, [chapSearchA, delimitedPagesA]);

  // Búsqueda global a lo largo de todas las páginas de la obra delimitada en Libro B
  const searchResultsB = useMemo(() => {
    const q = chapSearchB.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const results: { pageNumber: number; count: number }[] = [];
    for (const page of delimitedPagesB) {
      const textLower = page.text.toLowerCase();
      if (textLower.includes(q)) {
        const matches = textLower.split(q).length - 1;
        results.push({ pageNumber: page.pageNumber, count: matches });
      }
    }
    return results;
  }, [chapSearchB, delimitedPagesB]);

  // Sincronizar capítulos iniciales desde la investigación online en segundo plano
  useEffect(() => {
    if (initialChapters && initialChapters.length > 0 && chaptersList.length === 0) {
      setChaptersList(initialChapters);
    }
  }, [initialChapters]);

  // Mantener los visores del Bloque 3 acotados a las páginas válidas cuando cambian los marcadores del Bloque 1
  useEffect(() => {
    setChapViewerPageA(prev => Math.max(novelStartPageA, Math.min(novelEndPageA, prev)));
  }, [novelStartPageA, novelEndPageA]);

  useEffect(() => {
    setChapViewerPageB(prev => Math.max(novelStartPageB, Math.min(novelEndPageB, prev)));
  }, [novelStartPageB, novelEndPageB]);

  // Manejar selección con ratón en el lector del Bloque 1
  const handleMouseUpInReader = (slot: 'A' | 'B', pageNum?: number) => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length >= 2) {
      setSelectedMouseSnippet({
        text: sel,
        slot,
        pageNumber: pageNum
      });
    }
  };

  // Manejar selección con ratón en el lector de capítulos del Bloque 3
  const handleMouseUpInChapterReader = (slot: 'A' | 'B', pageNum?: number) => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length >= 2) {
      setSelectedChapterSnippet({
        text: sel,
        slot,
        pageNumber: pageNum
      });
    }
  };

  // --- OBTENER PÁRRAFOS DELIMITADOS PARA EL BLOQUE 3 ---
  const getDelimitedPageParagraphs = (slot: 'A' | 'B', pageNum: number) => {
    const isA = slot === 'A';
    const pages = isA ? delimitedPagesA : delimitedPagesB;
    const startP = isA ? novelStartPageA : novelStartPageB;
    const endP = isA ? novelEndPageA : novelEndPageB;
    const insp = isA ? bookA.inspection : bookB.inspection;

    // Si la página solicitada está fuera del rango delimitado, retornar vacío
    if (pageNum < startP || pageNum > endP) return [];

    const pageObj = pages.find(p => p.pageNumber === pageNum);
    let rawText = pageObj ? pageObj.text : '';

    if (!rawText) return [];

    // Si es la página inicial de la obra, recortar texto antes del arranque
    if (pageNum === startP && (insp?.firstParagraph || insp?.firstParagraphSnippet)) {
      const sample = (insp.firstParagraph || insp.firstParagraphSnippet || '').slice(0, 30);
      const idx = rawText.indexOf(sample);
      if (idx !== -1) {
        rawText = rawText.slice(idx);
      }
    }

    // Si es la página final de la obra, recortar texto posterior al desenlace
    if (pageNum === endP && (insp?.lastParagraph || insp?.lastParagraphSnippet)) {
      const sample = (insp.lastParagraph || insp.lastParagraphSnippet || '').slice(-30);
      const idx = rawText.indexOf(sample);
      if (idx !== -1) {
        rawText = rawText.slice(0, idx + sample.length);
      }
    }

    return rawText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
  };

  // --- MOTOR ANALÓGICO ESPEJO PARA MARCAR INICIOS DE CAPÍTULO (BLOQUE 3) ---
  const handleMarkChapterStartInSlot = (
    slot: 'A' | 'B', 
    text: string, 
    pageNum?: number, 
    explicitHasTitle?: boolean
  ) => {
    const cleanText = sanitizePageAndEditorialMarkers(text);
    if (!cleanText) return;

    if (slot === 'A') {
      // 1. Detectar si hay un título impreso previo o si es solo párrafo narrativo
      const titleDetectionA = explicitHasTitle !== undefined
        ? { hasPrintedTitle: explicitHasTitle, title: explicitHasTitle ? cleanText.slice(0, 60) : undefined }
        : detectPrecedingChapterTitle(delimitedTextA, cleanText);

      const resolvedTitle = titleDetectionA.hasPrintedTitle && titleDetectionA.title
        ? titleDetectionA.title
        : (chapterDraft.title.startsWith('Capítulo') ? `Capítulo ${chapterDraft.number}` : chapterDraft.title);

      const updatedDraft = {
        ...chapterDraft,
        title: resolvedTitle,
        hasPrintedTitleA: titleDetectionA.hasPrintedTitle,
        startPhraseA: cleanText,
        pageA: pageNum || chapViewerPageA
      };

      // 2. Disparar Emparejador Analógico Espejo hacia Libro B dentro del cuerpo delimitado
      const matchInB = findAnalogousParallelChapterStart({
        sourceText: delimitedTextA,
        targetText: delimitedTextB,
        sourceSnippet: cleanText,
        targetPdfPages: delimitedPagesB,
        chapterNumber: chapterDraft.number
      });

      if (matchInB) {
        const sanitizedMatchB = sanitizePageAndEditorialMarkers(matchInB.matchedText);
        const titleDetectionB = detectPrecedingChapterTitle(delimitedTextB, sanitizedMatchB);
        updatedDraft.startPhraseB = sanitizedMatchB;
        updatedDraft.pageB = matchInB.pageNumber;
        updatedDraft.hasPrintedTitleB = titleDetectionB.hasPrintedTitle;
        updatedDraft.matchConfidence = matchInB.confidence;

        if (matchInB.pageNumber) {
          setChapViewerPageB(Math.max(novelStartPageB, Math.min(novelEndPageB, matchInB.pageNumber)));
        }

        setFeedbackMessage(
          `✓ Inicio de Capítulo #${chapterDraft.number} fijado en Libro A (Pág. ${pageNum || chapViewerPageA}) ` +
          `[${titleDetectionA.hasPrintedTitle ? 'Con título impreso' : 'Sin título impreso (Párrafo narrativo)'}]. ` +
          `Match espejo localizado en Libro B (Pág. ${matchInB.pageNumber || '?'}) [${titleDetectionB.hasPrintedTitle ? 'Con título impreso' : 'Sin título impreso'}].`
        );
      } else {
        setFeedbackMessage(`✓ Inicio fijado en Libro A (Pág. ${pageNum || chapViewerPageA}) [${titleDetectionA.hasPrintedTitle ? 'Con título impreso' : 'Sin título impreso'}]. Puedes marcar la contraparte en Libro B.`);
      }

      setChapterDraft(updatedDraft);
      setStructureMode('manual_mirror');
    } else {
      // Registro en Libro B
      const titleDetectionB = explicitHasTitle !== undefined
        ? { hasPrintedTitle: explicitHasTitle, title: explicitHasTitle ? cleanText.slice(0, 60) : undefined }
        : detectPrecedingChapterTitle(delimitedTextB, cleanText);

      const updatedDraft = {
        ...chapterDraft,
        startPhraseB: cleanText,
        pageB: pageNum || chapViewerPageB,
        hasPrintedTitleB: titleDetectionB.hasPrintedTitle,
        matchConfidence: 'confirmed' as const
      };

      setChapterDraft(updatedDraft);
      setStructureMode('manual_mirror');
      setFeedbackMessage(`✓ Inicio en Libro B confirmado (Pág. ${pageNum || chapViewerPageB}) [${titleDetectionB.hasPrintedTitle ? 'Con título impreso' : 'Sin título impreso (Párrafo narrativo)'}].`);
    }
  };

  // Guardar capítulo del borrador en la lista oficial (con opción de pasar al siguiente)
  const handleSaveDraftChapter = (advanceToNext: boolean = false) => {
    if (!chapterDraft.startPhraseA && !chapterDraft.startPhraseB && !chapterDraft.title.trim()) {
      setFeedbackMessage('Indica al menos el inicio en Libro A o Libro B o escribe un título para guardar el capítulo.');
      return;
    }

    const cleanTitle = (chapterDraft.title.trim() || `Capítulo ${chapterDraft.number}`).replace(/^#+\s*/, '');

    const newEntry: ChapterEntry = {
      number: chapterDraft.number,
      title: cleanTitle,
      hasPrintedTitleA: chapterDraft.hasPrintedTitleA,
      hasPrintedTitleB: chapterDraft.hasPrintedTitleB,
      pageNumber: chapterDraft.pageA,
      pageNumberB: chapterDraft.pageB,
      startPhrase: sanitizePageAndEditorialMarkers(chapterDraft.startPhraseA),
      startPhraseB: sanitizePageAndEditorialMarkers(chapterDraft.startPhraseB),
      source: 'manual_mirror'
    };

    const existingIdx = chaptersList.findIndex(c => c.number === newEntry.number);
    let updated: ChapterEntry[];
    if (existingIdx !== -1) {
      updated = [...chaptersList];
      updated[existingIdx] = newEntry;
    } else {
      updated = [...chaptersList, newEntry].sort((a, b) => a.number - b.number);
    }

    setChaptersList(updated);
    if (onChaptersUpdated) onChaptersUpdated(updated);
    setStructureMode('manual_mirror');

    if (advanceToNext) {
      // Avanzar al siguiente capítulo correlativo
      const nextNum = chapterDraft.number + 1;
      const existingNext = updated.find(c => c.number === nextNum);
      if (existingNext) {
        setChapterDraft({
          number: existingNext.number,
          title: existingNext.title.replace(/^#+\s*/, ''),
          hasPrintedTitleA: existingNext.hasPrintedTitleA !== false,
          hasPrintedTitleB: existingNext.hasPrintedTitleB !== false,
          pageA: existingNext.pageNumber,
          pageB: existingNext.pageNumberB,
          startPhraseA: existingNext.startPhrase || '',
          startPhraseB: existingNext.startPhraseB || '',
          matchConfidence: 'confirmed'
        });
        if (existingNext.pageNumber) setChapViewerPageA(Math.max(novelStartPageA, Math.min(novelEndPageA, existingNext.pageNumber)));
        if (existingNext.pageNumberB) setChapViewerPageB(Math.max(novelStartPageB, Math.min(novelEndPageB, existingNext.pageNumberB)));
        setFeedbackMessage(`✓ «${newEntry.title}» guardado. Pasando al Capítulo #${nextNum} existente para revisión.`);
      } else {
        setChapterDraft({
          number: nextNum,
          title: `Capítulo ${nextNum}`,
          hasPrintedTitleA: true,
          hasPrintedTitleB: true,
          startPhraseA: '',
          startPhraseB: '',
          matchConfidence: undefined
        });
        setFeedbackMessage(`✓ «${newEntry.title}» guardado. Listo para demarcar el nuevo Capítulo #${nextNum}.`);
      }
    } else {
      setFeedbackMessage(`✓ «${newEntry.title}» guardado en la lista.`);
    }
  };

  // Cargar un capítulo existente en el editor de demarcación
  const handleLoadChapterForEditing = (chap: ChapterEntry) => {
    setChapterDraft({
      number: chap.number,
      title: chap.title.replace(/^#+\s*/, ''),
      hasPrintedTitleA: chap.hasPrintedTitleA !== false,
      hasPrintedTitleB: chap.hasPrintedTitleB !== false,
      pageA: chap.pageNumber,
      pageB: chap.pageNumberB,
      startPhraseA: chap.startPhrase || '',
      startPhraseB: chap.startPhraseB || '',
      matchConfidence: 'confirmed'
    });
    if (chap.pageNumber) {
      setChapViewerPageA(Math.max(novelStartPageA, Math.min(novelEndPageA, chap.pageNumber)));
    }
    if (chap.pageNumberB) {
      setChapViewerPageB(Math.max(novelStartPageB, Math.min(novelEndPageB, chap.pageNumberB)));
    }
    setActiveTocTab('parallel_marker');
    setFeedbackMessage(`Cargado Capítulo #${chap.number} («${chap.title}») en el demarcador para edición.`);
  };

  // Iniciar un nuevo borrador de capítulo al final de la lista
  const handleStartNewChapter = () => {
    const nextNum = chaptersList.length > 0 ? Math.max(...chaptersList.map(c => c.number)) + 1 : 1;
    setChapterDraft({
      number: nextNum,
      title: `Capítulo ${nextNum}`,
      hasPrintedTitleA: true,
      hasPrintedTitleB: true,
      startPhraseA: '',
      startPhraseB: '',
      matchConfidence: undefined
    });
    setActiveTocTab('parallel_marker');
    setFeedbackMessage(`Iniciando nuevo borrador para Capítulo #${nextNum}.`);
  };

  // --- AUTO-SINCRONIZACIÓN AUTOMÁTICA POR FRASES CANÓNICAS Y ENCABEZADOS ---
  const handleAutoAlignByCanonicalPhrases = () => {
    if (!delimitedTextA || !delimitedTextB) {
      setFeedbackMessage('Se requieren ambos libros cargados para auto-sincronizar capítulos.');
      return;
    }

    setIsAutoAligningChapters(true);
    setFeedbackMessage('Buscando e investigando inicios de capítulo canónicos dentro del cuerpo delimitado...');

    try {
      let canonicalSource: { number: number; title: string; startPhrase?: string }[] = chaptersList.length > 0
        ? chaptersList.map(c => ({ number: c.number, title: c.title, startPhrase: c.startPhrase }))
        : [];

      if (canonicalSource.length === 0) {
        const localProf = lookupCanonicalWorkLocally(titleA || titleB || author);
        if (localProf?.chaptersList && localProf.chaptersList.length > 0) {
          canonicalSource = localProf.chaptersList.map((t, i) => ({
            number: i + 1,
            title: t.startsWith('Capítulo') || t.startsWith('Chapter') || t.startsWith('Parte') ? t : `Capítulo ${i + 1}: ${t}`
          }));
        } else {
          canonicalSource = Array.from({ length: 4 }, (_, i) => ({ number: i + 1, title: `Capítulo ${i + 1}` }));
        }
      }

      const autoSynced = autoSynchronizeChaptersByCanonicalPhrases({
        delimitedTextA,
        delimitedTextB,
        pdfPagesA: delimitedPagesA,
        pdfPagesB: delimitedPagesB,
        canonicalChapters: canonicalSource,
        workTitleHint: titleA || titleB || author
      });

      if (autoSynced.length > 0) {
        const mappedEntries: ChapterEntry[] = autoSynced.map(s => ({
          number: s.number,
          title: s.title,
          hasPrintedTitleA: s.hasPrintedTitleA,
          hasPrintedTitleB: s.hasPrintedTitleB,
          pageNumber: s.pageNumberA,
          pageNumberB: s.pageNumberB,
          startPhrase: s.startPhraseA,
          startPhraseB: s.startPhraseB,
          source: 'canonical_auto_match'
        }));

        setChaptersList(mappedEntries);
        if (onChaptersUpdated) onChaptersUpdated(mappedEntries);
        setStructureMode('manual_mirror');
        setFeedbackMessage(`✓ Éxito: Se auto-sincronizaron ${mappedEntries.length} capítulos acotados estrictamente a la obra delimitada.`);
      } else {
        setFeedbackMessage('No se detectaron transiciones claras. Puedes demarcar los capítulos manualmente con un clic.');
      }
    } catch (err) {
      console.error('Error auto-sincronizando capítulos:', err);
      setFeedbackMessage('Ocurrió un inconveniente al auto-sincronizar. Puedes utilizar la marcación manual.');
    } finally {
      setIsAutoAligningChapters(false);
    }
  };

  // Extraer Índice de una Hoja Específica
  const handleExtractTocFromPage = async () => {
    const targetBook = selectedTocSlot === 'A' ? bookA : bookB;
    const pageObj = targetBook.pdfPages?.find(p => p.pageNumber === selectedTocPageNumber);
    const pageText = pageObj?.text || '';

    if (!pageText || pageText.trim().length < 15) {
      setTocMessage(`La página ${selectedTocPageNumber} no contiene texto suficiente.`);
      return;
    }

    setIsExtractingToc(true);
    setTocMessage('Analizando estructura del índice en la página seleccionada...');
    try {
      const res = await extractTableOfContentsFromSpecificPage({
        pageText,
        pageNumber: selectedTocPageNumber,
        workTitle: titleA || titleB || 'Novela',
        author: author || ''
      });

      if (res.success && res.chapters.length > 0) {
        setChaptersList(res.chapters);
        if (onChaptersUpdated) onChaptersUpdated(res.chapters);
        setTocMessage(`✓ Éxito: Se reconocieron ${res.chapters.length} capítulos/partes en la Página ${selectedTocPageNumber}.`);
      } else {
        const local = extractTOCDeterministically(pageText);
        if (local.length > 0) {
          setChaptersList(local);
          if (onChaptersUpdated) onChaptersUpdated(local);
          setTocMessage(`✓ Se reconocieron ${local.length} capítulos por patrón editorial en la Página ${selectedTocPageNumber}.`);
        } else {
          setTocMessage(res.rawSummary || 'No se reconocieron capítulos claros en esta página.');
        }
      }
    } catch (err: any) {
      const local = extractTOCDeterministically(pageText);
      if (local.length > 0) {
        setChaptersList(local);
        if (onChaptersUpdated) onChaptersUpdated(local);
        setTocMessage(`✓ Reconocidos ${local.length} capítulos en la Página ${selectedTocPageNumber}.`);
      } else {
        setTocMessage('No se pudo extraer el índice automáticamente.');
      }
    } finally {
      setIsExtractingToc(false);
    }
  };

  // Procesar Texto Pegado como Índice
  const handleProcessManualTocText = () => {
    if (!manualTocText.trim()) {
      setTocMessage('Pega primero el texto del índice para procesarlo.');
      return;
    }
    const detected = extractTOCDeterministically(manualTocText);
    if (detected.length > 0) {
      setChaptersList(detected);
      if (onChaptersUpdated) onChaptersUpdated(detected);
      setTocMessage(`✓ Éxito: Se extrajeron ${detected.length} capítulos desde el texto.`);
    } else {
      const lines = manualTocText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 2);
      if (lines.length > 0) {
        const fallback = lines.map((l, i) => ({
          number: i + 1,
          title: l
        }));
        setChaptersList(fallback);
        if (onChaptersUpdated) onChaptersUpdated(fallback);
        setTocMessage(`✓ Se crearon ${fallback.length} capítulos a partir de las líneas detectadas.`);
      } else {
        setTocMessage('No se reconocieron líneas válidas de índice.');
      }
    }
  };

  // Estructurador inteligente cuando la novela no tiene hoja física de índice
  const handleStructureNoTocNovel = (mode: 'detect_headings' | 'continuous' | 'proportional') => {
    if (mode === 'detect_headings') {
      const detected: ChapterEntry[] = [];
      const chapRegex = /^(?:#+\s*)?(?:(CAP[IÍ]TULO|CHAPTER|KAPITEL|PARTE|PART)\s+([0-9IVXLCDM]+)|([IVXLCDM]{1,6})\.?)\s*$/i;

      for (const page of delimitedPagesA) {
        const lines = (page.text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (let lIdx = 0; lIdx < lines.length; lIdx++) {
          const l = lines[lIdx];
          if (l.length < 50 && chapRegex.test(l)) {
            const nextL = lines[lIdx + 1] || '';
            const chapNum = detected.length + 1;
            detected.push({
              number: chapNum,
              title: l.replace(/^#+\s*/, ''),
              pageNumber: page.pageNumber,
              startPhrase: nextL.slice(0, 60) || l,
              hasPrintedTitleA: true
            });
            break;
          }
        }
      }

      if (detected.length >= 2) {
        setChaptersList(detected);
        if (onChaptersUpdated) onChaptersUpdated(detected);
        handleLoadChapterForEditing(detected[0]);
        setFeedbackMessage(`✓ Se auto-detectaron ${detected.length} capítulos analizando las marcas internas en el texto.`);
        return;
      }
    }

    if (mode === 'proportional') {
      const totalPagesA = Math.max(1, novelEndPageA - novelStartPageA + 1);
      const totalPagesB = Math.max(1, novelEndPageB - novelStartPageB + 1);
      const parts = 4;
      const proportionalChaps: ChapterEntry[] = [];

      for (let i = 0; i < parts; i++) {
        const pageA = novelStartPageA + Math.round((i / parts) * (totalPagesA - 1));
        const pageB = novelStartPageB + Math.round((i / parts) * (totalPagesB - 1));
        const pObjA = delimitedPagesA.find(p => p.pageNumber === pageA);
        const pObjB = delimitedPagesB.find(p => p.pageNumber === pageB);
        proportionalChaps.push({
          number: i + 1,
          title: `Parte ${['I', 'II', 'III', 'IV'][i] || i + 1}`,
          pageNumber: pageA,
          pageNumberB: pageB,
          startPhrase: (pObjA?.text || '').slice(0, 50),
          startPhraseB: (pObjB?.text || '').slice(0, 50)
        });
      }

      setChaptersList(proportionalChaps);
      if (onChaptersUpdated) onChaptersUpdated(proportionalChaps);
      handleLoadChapterForEditing(proportionalChaps[0]);
      setFeedbackMessage('✓ Novela estructurada en 4 partes proporcionales.');
      return;
    }

    // Modo Narrativa Continua Única
    const firstA = delimitedPagesA[0]?.text || '';
    const firstB = delimitedPagesB[0]?.text || '';
    const continuous: ChapterEntry[] = [{
      number: 1,
      title: titleA || 'Obra Completa (Narrativa Continua)',
      pageNumber: novelStartPageA,
      pageNumberB: novelStartPageB,
      startPhrase: firstA.slice(0, 60),
      startPhraseB: firstB.slice(0, 60)
    }];
    setChaptersList(continuous);
    if (onChaptersUpdated) onChaptersUpdated(continuous);
    handleLoadChapterForEditing(continuous[0]);
    setFeedbackMessage('✓ Novela estructurada como Obra Completa (Narrativa Continua).');
  };

  // Investigar Estructura Canónica en Red
  const handleInvestigateChaptersOnline = async () => {
    const queryTitle = titleA || titleB;
    if (!queryTitle) {
      setTocMessage('Escribe primero el Título de la obra o Autor para investigar en red.');
      return;
    }

    setIsInvestigatingTocOnline(true);
    setTocMessage('Consultando esquema canónico de capítulos y partes en la red...');
    try {
      const res = await investigateBookStructureAndChaptersOnline({
        workTitle: queryTitle,
        author: author || '',
        language: languageA || 'Español'
      });

      if (res.chapters.length > 0) {
        setChaptersList(res.chapters);
        if (onChaptersUpdated) onChaptersUpdated(res.chapters);
        setTocMessage(`✓ Se obtuvieron ${res.chapters.length} partes/capítulos canónicos: ${res.summary}`);
      } else {
        setTocMessage(res.summary || 'No se encontró estructura de capítulos en red.');
      }
    } catch (err: any) {
      setTocMessage('No se pudo consultar la estructura en red.');
    } finally {
      setIsInvestigatingTocOnline(false);
    }
  };

  const handleRemoveChapter = (idx: number) => {
    const updated = chaptersList.filter((_, i) => i !== idx).map((c, i) => ({ ...c, number: i + 1 }));
    setChaptersList(updated);
    if (onChaptersUpdated) onChaptersUpdated(updated);
  };

  const handleJumpToPage = (slot: 'A' | 'B', page: number) => {
    if (slot === 'A') {
      setCurrentPageA(page);
      setChapViewerPageA(Math.max(novelStartPageA, Math.min(novelEndPageA, page)));
    } else {
      setCurrentPageB(page);
      setChapViewerPageB(Math.max(novelStartPageB, Math.min(novelEndPageB, page)));
    }
    setFeedbackMessage(`Navegando a la Página ${page} del Libro ${slot}.`);
  };

  // Renderizador de Columna del Lector de Delimitación de Obra (Bloque 1)
  const renderBookColumn = (book: Phase1BookSlot, isSlotA: boolean) => {
    const hasText = Boolean(book.extractedText && book.extractedText.trim().length > 0);
    const insp = book.inspection;
    const totalWords = insp?.totalWords || (insp?.pureBodyText ? insp.pureBodyText.split(/\s+/).filter(Boolean).length : 0);
    const totalParas = insp?.totalParagraphs || (insp?.pureBodyText ? insp.pureBodyText.split(/\n\s*\n+/).filter(Boolean).length : 0);

    const pdfPages = book.pdfPages || [];
    const totalPages = pdfPages.length;
    const currentPage = isSlotA ? currentPageA : currentPageB;
    const setCurrentPage = isSlotA ? setCurrentPageA : setCurrentPageB;
    const viewMode = isSlotA ? activeViewModeA : activeViewModeB;
    const setViewMode = isSlotA ? setActiveViewModeA : setActiveViewModeB;
    const searchQuery = isSlotA ? searchQueryA : searchQueryB;
    const setSearchQuery = isSlotA ? setSearchQueryA : setSearchQueryB;
    const manualStart = isSlotA ? manualStartInputA : manualStartInputB;
    const setManualStart = isSlotA ? setManualStartInputA : setManualStartInputB;
    const manualEnd = isSlotA ? manualEndInputA : manualEndInputB;
    const setManualEnd = isSlotA ? setManualEndInputA : setManualEndInputB;

    const startPage = insp?.pageStructure?.novelStartPage || 1;
    const endPage = insp?.pageStructure?.novelEndPage || totalPages || 1;

    const activePageObj = pdfPages.find(p => p.pageNumber === currentPage);
    const activeText = viewMode === 'pages' && activePageObj 
      ? activePageObj.text 
      : (book.extractedText || '');

    const startSnippet = insp?.firstParagraphSnippet || insp?.firstParagraph || 'Inicio de la novela';
    const endSnippet = insp?.lastParagraphSnippet || insp?.lastParagraph || 'Final de la novela';

    return (
      <div className="bg-[#0f1216] border border-stone-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
        {/* Cabecera del Libro */}
        <div className="pb-3 border-b border-stone-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-8 h-8 rounded-xl text-xs font-mono font-bold flex items-center justify-center ${
              isSlotA 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
            }`}>
              {book.slot}
            </span>
            <div>
              <h4 className="text-xs font-bold text-stone-100 flex items-center gap-1.5">
                <span>Libro {book.slot}</span>
                <span className="text-stone-400 font-normal">({book.language || (isSlotA ? 'Español' : 'Original')})</span>
              </h4>
              <p className="text-[11px] text-stone-400 truncate max-w-[280px]" title={book.name || 'Sin archivo'}>
                {book.name || 'Esperando archivo...'}
              </p>
            </div>
          </div>

          {hasText && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>{totalWords.toLocaleString()} pal.</span>
              </span>
            </div>
          )}
        </div>

        {!hasText ? (
          <div className="py-16 text-center text-stone-500 text-xs">
            <BookOpen className="w-8 h-8 mx-auto text-stone-600 mb-2" />
            <p>Sube el archivo en la caja superior para explorar y fijar marcadores.</p>
          </div>
        ) : (
          <div className="space-y-4 flex-1">
            {/* MARCADOR DE INICIO (ARRANQUE DE LA OBRA) */}
            <div className="bg-[#12161b] border-2 border-emerald-600/40 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wide">
                  <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Marcador de Inicio (Arranque de la Obra)</span>
                </span>
                {insp?.pageStructure?.novelStartPage ? (
                  <button
                    type="button"
                    onClick={() => handleJumpToPage(book.slot, insp.pageStructure!.novelStartPage)}
                    className="text-[10px] font-mono font-bold bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700/60 transition cursor-pointer"
                    title="Saltar a esta página en el lector"
                  >
                    Pág. {insp.pageStructure.novelStartPage} ↗
                  </button>
                ) : null}
              </div>

              <div 
                onMouseUp={() => handleMouseUpInReader(book.slot, startPage)}
                className="text-xs text-stone-100 font-sans italic bg-emerald-950/20 border-l-3 border-emerald-500 pl-3 py-2 leading-relaxed rounded-r-lg select-text cursor-text"
                title="Subraya cualquier palabra exacta con el cursor para cambiar este corte"
              >
                «{startSnippet}»
              </div>

              <div className="flex items-center justify-between pt-1 text-[11px] text-stone-400">
                <span className="italic text-[10px] text-stone-400">
                  Captura <strong>desde esta palabra exacta en adelante</strong>. Lo anterior queda excluido.
                </span>
                <button
                  type="button"
                  onClick={() => handleJumpToPage(book.slot, startPage)}
                  className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition cursor-pointer flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>Ver en Lector</span>
                </button>
              </div>
            </div>

            {/* MARCADOR DE FIN (DESENLACE DE LA OBRA) */}
            <div className="bg-[#12161b] border-2 border-purple-600/40 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-purple-400 uppercase tracking-wide">
                  <Flag className="w-3.5 h-3.5 text-purple-400" />
                  <span>Marcador de Final (Desenlace de la Obra)</span>
                </span>
                {insp?.pageStructure?.novelEndPage ? (
                  <button
                    type="button"
                    onClick={() => handleJumpToPage(book.slot, insp.pageStructure!.novelEndPage)}
                    className="text-[10px] font-mono font-bold bg-purple-950/80 hover:bg-purple-900 text-purple-300 px-2 py-0.5 rounded border border-purple-700/60 transition cursor-pointer"
                    title="Saltar a esta página en el lector"
                  >
                    Pág. {insp.pageStructure.novelEndPage} ↗
                  </button>
                ) : null}
              </div>

              <div 
                onMouseUp={() => handleMouseUpInReader(book.slot, endPage)}
                className="text-xs text-stone-100 font-sans italic bg-purple-950/20 border-l-3 border-purple-500 pl-3 py-2 leading-relaxed rounded-r-lg select-text cursor-text"
                title="Subraya cualquier palabra exacta con el cursor para cambiar este corte"
              >
                «{endSnippet}»
              </div>

              <div className="flex items-center justify-between pt-1 text-[11px] text-stone-400">
                <span className="italic text-[10px] text-stone-400">
                  Captura <strong>hacia atrás hasta esta palabra exacta</strong>. Todo lo posterior queda excluido.
                </span>
                <button
                  type="button"
                  onClick={() => handleJumpToPage(book.slot, endPage)}
                  className="text-[10px] font-semibold text-purple-400 hover:text-purple-300 transition cursor-pointer flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>Ver en Lector</span>
                </button>
              </div>
            </div>

            {/* ENTRADAS MANUALES DIRECTAS DE PALABRA O FRASE EXACTA */}
            <div className="bg-[#0b0e11] border border-stone-800 rounded-xl p-3 space-y-2 text-xs">
              <span className="text-[10px] font-bold text-stone-300 uppercase tracking-wide block">
                Fijar marcadores escribiendo o pegando la frase exacta:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={manualStart}
                    onChange={(e) => setManualStart(e.target.value)}
                    placeholder="Escribe palabra de inicio..."
                    className="flex-1 px-2.5 py-1.5 bg-[#12161b] border border-emerald-900/60 rounded-lg text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!manualStart.trim()) return;
                      book.onSetExactTextBoundary('start', manualStart.trim(), currentPage);
                      setFeedbackMessage(`Libro ${book.slot}: Inicio fijado en «${manualStart.trim()}».`);
                      setManualStart('');
                    }}
                    disabled={!manualStart.trim()}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-stone-950 font-bold rounded-lg text-xs cursor-pointer shrink-0"
                    title="Fijar como inicio de la obra"
                  >
                    Fijar Inicio
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={manualEnd}
                    onChange={(e) => setManualEnd(e.target.value)}
                    placeholder="Escribe palabra de final..."
                    className="flex-1 px-2.5 py-1.5 bg-[#12161b] border border-purple-900/60 rounded-lg text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!manualEnd.trim()) return;
                      book.onSetExactTextBoundary('end', manualEnd.trim(), currentPage);
                      setFeedbackMessage(`Libro ${book.slot}: Fin fijado en «${manualEnd.trim()}».`);
                      setManualEnd('');
                    }}
                    disabled={!manualEnd.trim()}
                    className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold rounded-lg text-xs cursor-pointer shrink-0"
                    title="Fijar como final de la obra"
                  >
                    Fijar Fin
                  </button>
                </div>
              </div>
            </div>

            {/* EXPLORADOR Y LECTOR INTERACTIVO DEL LIBRO */}
            <div className="bg-[#0b0e11] border border-stone-800 rounded-xl p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-800/80">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-stone-200">
                    Lector Completo • Libro {book.slot}
                  </span>
                  {totalPages > 0 && (
                    <span className="text-[10px] text-stone-400 font-mono">
                      (Página {currentPage} de {totalPages})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'pages' ? 'continuous' : 'pages')}
                    className="text-[10px] font-semibold px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition cursor-pointer"
                  >
                    {viewMode === 'pages' ? 'Ver Flujo Continuo' : 'Ver por Páginas'}
                  </button>
                </div>
              </div>

              {/* Controles de Salto de Página y Búsqueda */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                {totalPages > 0 && viewMode === 'pages' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage <= 1}
                      className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold disabled:opacity-40 text-[10px] cursor-pointer"
                    >
                      ◀ Anterior
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={currentPage}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= totalPages) {
                          setCurrentPage(val);
                        }
                      }}
                      className="w-12 text-center py-1 bg-[#12161b] border border-stone-700 rounded text-stone-100 font-mono text-[10px]"
                    />
                    <span className="text-[10px] text-stone-400 font-mono">/ {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage >= totalPages}
                      className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold disabled:opacity-40 text-[10px] cursor-pointer"
                    >
                      Siguiente ▶
                    </button>
                  </div>
                )}

                {/* Saltos Rápidos: Inicio, Mitad, Fin */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (totalPages > 0) setCurrentPage(startPage);
                      setFeedbackMessage(`Libro ${book.slot}: Saltando al inicio identificado.`);
                    }}
                    className="px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 text-[10px] font-bold cursor-pointer"
                  >
                    ⇤ Inicio ({startPage})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (totalPages > 0) setCurrentPage(Math.max(1, Math.floor(totalPages / 2)));
                      setFeedbackMessage(`Libro ${book.slot}: Saltando al 50% de la obra.`);
                    }}
                    className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold cursor-pointer"
                  >
                    ❖ Mitad (50%)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (totalPages > 0) setCurrentPage(endPage);
                      setFeedbackMessage(`Libro ${book.slot}: Saltando al final identificado.`);
                    }}
                    className="px-2 py-0.5 rounded bg-purple-950/70 hover:bg-purple-900 border border-purple-800/60 text-purple-300 text-[10px] font-bold cursor-pointer"
                  >
                    ⇥ Final ({endPage})
                  </button>
                </div>
              </div>

              {/* Buscador de Palabras dentro del Texto */}
              <div className="flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar palabra o frase en el libro..."
                  className="flex-1 bg-[#12161b] border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-[10px] text-stone-400 hover:text-white px-2 py-1 bg-stone-800 rounded cursor-pointer"
                  >
                    ✕ Limpiar
                  </button>
                )}
              </div>

              {/* Área de Lectura del Texto con Selección Interactiva de Palabras */}
              <div 
                onMouseUp={() => handleMouseUpInReader(book.slot, viewMode === 'pages' ? currentPage : undefined)}
                className="bg-[#080a0d] border border-stone-800/90 rounded-xl p-3.5 max-h-72 overflow-y-auto font-serif text-xs leading-relaxed text-stone-200 select-text cursor-text space-y-2"
              >
                {(() => {
                  const paras = (activeText || '').split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
                  if (paras.length === 0) {
                    return <p className="text-stone-500 italic">No hay texto para mostrar en esta vista.</p>;
                  }

                  const cleanQuery = searchQuery.trim().toLowerCase();

                  return paras.map((p, pIdx) => {
                    const matchesQuery = cleanQuery && cleanQuery.length >= 2 && p.toLowerCase().includes(cleanQuery);
                    const isStartMatch = startSnippet && p.includes(startSnippet.slice(0, 40));
                    const isEndMatch = endSnippet && p.includes(endSnippet.slice(-40));

                    return (
                      <div 
                        key={pIdx}
                        className={`p-2 rounded-lg transition group relative ${
                          matchesQuery 
                            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-100' 
                            : isStartMatch 
                              ? 'bg-emerald-950/40 border-l-3 border-emerald-500 text-emerald-100' 
                              : isEndMatch 
                                ? 'bg-purple-950/40 border-l-3 border-purple-500 text-purple-100' 
                                : 'hover:bg-stone-900/60'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[9px] text-stone-400 font-mono pb-1 select-none">
                          <span>
                            {viewMode === 'pages' ? `Pág. ${currentPage} • Párrafo ${pIdx + 1}` : `Párrafo ${pIdx + 1}`}
                          </span>
                          <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                book.onSetExactTextBoundary('start', p, viewMode === 'pages' ? currentPage : undefined);
                                setFeedbackMessage(`Libro ${book.slot}: Párrafo fijado como Inicio.`);
                              }}
                              className="px-1.5 py-0.5 rounded bg-emerald-950 hover:bg-emerald-800 text-emerald-300 font-bold border border-emerald-700/60 cursor-pointer"
                              title="Fijar este párrafo como inicio"
                            >
                              🟢 Fijar Inicio
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                book.onSetExactTextBoundary('end', p, viewMode === 'pages' ? currentPage : undefined);
                                setFeedbackMessage(`Libro ${book.slot}: Párrafo fijado como Fin.`);
                              }}
                              className="px-1.5 py-0.5 rounded bg-purple-950 hover:bg-purple-800 text-purple-300 font-bold border border-purple-700/60 cursor-pointer"
                              title="Fijar este párrafo como final"
                            >
                              🔴 Fijar Fin
                            </button>
                          </div>
                        </div>

                        <p className="select-text whitespace-pre-wrap">
                          {p}
                        </p>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="text-[10px] text-stone-400 italic flex items-center justify-between">
                <span>💡 Subraya cualquier palabra con el cursor para fijar el corte milimétrico.</span>
                <span className="font-mono">{totalParas} párrafos activos</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* BANNER FLOTANTE DE ACCIÓN TRAS SELECCIÓN CON EL RATÓN EN EL BLOQUE 1 */}
      {selectedMouseSnippet && (
        <div className="sticky top-3 z-40 p-3 rounded-2xl bg-[#14181f] border-2 border-amber-400 text-xs shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 max-w-md truncate text-amber-200">
            <span className="px-2 py-0.5 rounded bg-amber-500 text-stone-950 font-extrabold uppercase text-[10px]">
              Libro {selectedMouseSnippet.slot} • Frase Subrayada
            </span>
            <span className="italic truncate font-sans text-stone-100 font-medium">
              «{selectedMouseSnippet.text}»
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const book = selectedMouseSnippet.slot === 'A' ? bookA : bookB;
                book.onSetExactTextBoundary('start', selectedMouseSnippet.text, selectedMouseSnippet.pageNumber);
                setFeedbackMessage(`✓ Libro ${selectedMouseSnippet.slot}: Inicio fijado exactamente desde «${selectedMouseSnippet.text.slice(0, 35)}...». Lo anterior queda excluido.`);
                setSelectedMouseSnippet(null);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold text-xs cursor-pointer shadow-md flex items-center gap-1.5 transition active:scale-95"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>🟢 Fijar como Inicio Exacto</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const book = selectedMouseSnippet.slot === 'A' ? bookA : bookB;
                book.onSetExactTextBoundary('end', selectedMouseSnippet.text, selectedMouseSnippet.pageNumber);
                setFeedbackMessage(`✓ Libro ${selectedMouseSnippet.slot}: Fin fijado exactamente hasta «${selectedMouseSnippet.text.slice(0, 35)}...». Lo posterior queda excluido.`);
                setSelectedMouseSnippet(null);
              }}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs cursor-pointer shadow-md flex items-center gap-1.5 transition active:scale-95"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>🔴 Fijar como Fin Exacto</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleMarkChapterStartInSlot(selectedMouseSnippet.slot, selectedMouseSnippet.text, selectedMouseSnippet.pageNumber);
                setSelectedMouseSnippet(null);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs cursor-pointer shadow-md transition"
              title="Registrar esta frase como inicio de un capítulo y buscar su paralelo analógico"
            >
              📑 Marcar Inicio de Capítulo
            </button>

            <button
              type="button"
              onClick={() => setSelectedMouseSnippet(null)}
              className="px-2 py-1 text-stone-400 hover:text-white transition cursor-pointer text-xs"
            >
              ✕ Cancelar
            </button>
          </div>
        </div>
      )}

      {/* MENSAJE DE RETROALIMENTACIÓN */}
      {feedbackMessage && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 text-xs font-bold shadow-md animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-stone-400 hover:text-white text-xs px-2 py-0.5 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. PANEL PARALELO: AMBOS LIBROS SIEMPRE LADO A LADO */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
              1
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                <span>Marcadores de Inicio y Final de la Obra (Paralelo Libro A y Libro B)</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                  Fase 1 • Delimitación Estricta
                </span>
              </h3>
              <p className="text-[11px] text-stone-400">
                La obra se captura desde la frase de inicio en adelante, y hasta la frase final hacia atrás. Todo lo que quede fuera (portadillas, prólogos o notas de catálogo) queda 100% excluido sin pasar a las fases siguientes.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderBookColumn(bookA, true)}
          {renderBookColumn(bookB, false)}
        </div>
      </div>

      {/* 2. METADATOS CANÓNICOS DE LA OBRA Y ESTRUCTURA EN RED */}
      <div className="bg-[#101317] border border-stone-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              2
            </div>
            <div>
              <h4 className="text-xs font-bold text-stone-100 uppercase tracking-wide">
                Metadatos Canónicos e Investigación Automática en Red
              </h4>
              <p className="text-[11px] text-stone-400">
                Al subir ambos libros, se consulta en automático en segundo plano la identidad de la obra, año, editorial y su esquema canónico de capítulos.
              </p>
            </div>
          </div>

          {onRunOnlineInvestigation && (
            <button
              type="button"
              onClick={onRunOnlineInvestigation}
              disabled={isInvestigatingOnline || (!bookA.extractedText && !bookB.extractedText)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-200 text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isInvestigatingOnline ? 'Investigando en red...' : 'Re-consultar en Red'}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-stone-300 mb-1">Título de la Obra (Libro A)</label>
            <input
              type="text"
              value={titleA}
              onChange={(e) => setTitleA(e.target.value)}
              placeholder="Ej. La metamorfosis"
              className="w-full px-3 py-2 bg-[#0c0e12] border border-stone-800 rounded-xl text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-300 mb-1">Título Original (Libro B)</label>
            <input
              type="text"
              value={titleB}
              onChange={(e) => setTitleB(e.target.value)}
              placeholder="Ej. Die Verwandlung"
              className="w-full px-3 py-2 bg-[#0c0e12] border border-stone-800 rounded-xl text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-300 mb-1">Autor de la Obra</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Ej. Franz Kafka"
              className="w-full px-3 py-2 bg-[#0c0e12] border border-stone-800 rounded-xl text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-300 mb-1">Año de Publicación Original</label>
            <input
              type="text"
              value={publicationYear}
              onChange={(e) => setPublicationYear && setPublicationYear(e.target.value)}
              placeholder="Ej. 1915"
              className="w-full px-3 py-2 bg-[#0c0e12] border border-stone-800 rounded-xl text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none font-medium"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
          <div>
            <label className="block font-semibold text-stone-300 mb-1">Editorial / Edición de Procedencia</label>
            <input
              type="text"
              value={publisher}
              onChange={(e) => setPublisher && setPublisher(e.target.value)}
              placeholder="Ej. Kurt Wolff Verlag / Alianza"
              className="w-full px-3 py-2 bg-[#0c0e12] border border-stone-800 rounded-xl text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-300 mb-1">Idioma Libro A</label>
            <input
              type="text"
              value={languageA}
              onChange={(e) => setLanguageA(e.target.value)}
              placeholder="Ej. Español"
              className="w-full px-3 py-2 bg-[#0c0e12] border border-stone-800 rounded-xl text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-300 mb-1">Idioma Libro B</label>
            <input
              type="text"
              value={languageB}
              onChange={(e) => setLanguageB(e.target.value)}
              placeholder="Ej. Alemán (Original)"
              className="w-full px-3 py-2 bg-[#0c0e12] border border-stone-800 rounded-xl text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none font-medium"
            />
          </div>
        </div>

        {/* Sección Canónica de Índice Obtenido en Red */}
        <div className="mt-2 p-3.5 bg-[#0b0e11] border border-stone-800/80 rounded-xl text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-stone-200 flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Estructura Canónica de Capítulos Identificada en Red:</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 text-[10px] font-bold border border-sky-500/20">
              {chaptersList.length > 0 ? `${chaptersList.length} partes canónicas registradas` : 'Detectando en segundo plano...'}
            </span>
          </div>

          {chaptersList.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {chaptersList.slice(0, 10).map((c, i) => (
                <span key={i} className="px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-700/80 text-stone-300 text-[11px] font-mono">
                  {c.number}. {c.title}
                </span>
              ))}
              {chaptersList.length > 10 && (
                <span className="text-[10px] text-stone-400 font-mono">
                  +{chaptersList.length - 10} capítulos más...
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-stone-500 italic">
              Buscando estructura canónica en la red a partir de los títulos y autor de la obra...
            </p>
          )}
        </div>
      </div>

      {/* 3. PANEL DE ÍNDICE DE CONTENIDOS Y DEMARCACIÓN DE CAPÍTULOS / SEGMENTOS */}
      <div className="bg-[#101317] border border-stone-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold">
              3
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-stone-100 uppercase tracking-wide">
                  Índice de Contenidos y Demarcación de Capítulos / Segmentos
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 text-[10px] font-semibold border border-stone-700">
                  {chaptersList.length} capítulos registrados
                </span>
              </div>
              <p className="text-[11px] text-stone-400">
                La demarcación de capítulos es dependiente de los marcadores del Bloque 1: solo abarca el cuerpo de la obra entre inicio y fin. Si no hay títulos impresos en el PDF, se puede marcar el párrafo narrativo y asignarle título canónico.
              </p>
            </div>
          </div>

          {/* Selector de Prioridad: Red Canónica vs Demarcación Manual en Libros */}
          <div className="flex items-center gap-1.5 bg-[#0b0e11] p-1 rounded-xl border border-stone-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setStructureMode('canonical_online');
                setFeedbackMessage('Seleccionado: Usar estructura canónica de la red para despachar a Fase 2.');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                structureMode === 'canonical_online' ? 'bg-sky-600 text-white shadow-xs' : 'text-stone-400 hover:text-white'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>Estructura de Red</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStructureMode('manual_mirror');
                setActiveTocTab('parallel_marker');
                setFeedbackMessage('Seleccionado: Demarcación manual en libros espejo (tiene prioridad para Fase 2).');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                structureMode === 'manual_mirror' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-stone-400 hover:text-white'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Demarcación Manual en Libros</span>
            </button>
          </div>
        </div>

        {/* Indicador de Dependencia Estricta del Bloque 1 */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong>Ámbito Estricto:</strong> Navegando únicamente dentro de la obra delimitada arriba 
              (Libro A: Págs. {novelStartPageA}–{novelEndPageA} • Libro B: Págs. {novelStartPageB}–{novelEndPageB}). 
              Cualquier cambio de corte en el Bloque 1 actualiza este panel automáticamente.
            </span>
          </div>
        </div>

        {/* Pestañas de Herramientas de Estructura */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800/80 pb-2 text-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTocTab('parallel_marker')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTocTab === 'parallel_marker' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-stone-400 hover:text-white'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5 text-amber-400" />
              <span>Localizador y Emparejador Paralelo de Capítulos</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTocTab('scan_page')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeTocTab === 'scan_page' ? 'bg-sky-600/20 text-sky-300 border border-sky-500/40' : 'text-stone-400 hover:text-white'
              }`}
            >
              Escanear Hoja del PDF
            </button>
            <button
              type="button"
              onClick={() => setActiveTocTab('paste_text')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeTocTab === 'paste_text' ? 'bg-sky-600/20 text-sky-300 border border-sky-500/40' : 'text-stone-400 hover:text-white'
              }`}
            >
              Pegar Texto de Índice
            </button>
          </div>

          {/* BOTÓN INTELIGENTE AUTOMÁTICO: AUTO-SINCRONIZAR POR FRASES CANÓNICAS */}
          <button
            type="button"
            onClick={handleAutoAlignByCanonicalPhrases}
            disabled={isAutoAligningChapters || !delimitedTextA || !delimitedTextB}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition disabled:opacity-50 cursor-pointer active:scale-95"
            title="Investiga las frases de inicio canónicas de cada capítulo y localiza sus posiciones en ambos libros"
          >
            <Wand2 className="w-3.5 h-3.5 text-amber-300" />
            <span>{isAutoAligningChapters ? 'Sincronizando...' : 'Auto-Sincronizar por Frases Canónicas en Red'}</span>
          </button>
        </div>

        {/* ASISTENCIA RÁPIDA: NOVELA SIN ÍNDICE FÍSICO */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#10141b] border border-stone-800 rounded-xl text-xs">
          <div className="flex items-center gap-2 text-stone-300">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold text-stone-200">¿Novela sin índice impreso?</span>
            <span className="text-stone-400 hidden md:inline">Estructura rápidamente la obra para avanzar a Fase 2:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleStructureNoTocNovel('detect_headings')}
              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
              title="Escanea las páginas delimitadas buscando números romanos o palabras de capítulo"
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Detectar Marcas Internas</span>
            </button>
            <button
              type="button"
              onClick={() => handleStructureNoTocNovel('continuous')}
              className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-lg font-semibold text-[11px] transition flex items-center gap-1 cursor-pointer"
              title="Crea un único capítulo continuo que abarca toda la obra"
            >
              <BookOpen className="w-3 h-3 text-emerald-400" />
              <span>Obra Continua (Relato Único)</span>
            </button>
            <button
              type="button"
              onClick={() => handleStructureNoTocNovel('proportional')}
              className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-lg font-semibold text-[11px] transition flex items-center gap-1 cursor-pointer"
              title="Divide la obra en 4 partes homólogas equilibradas"
            >
              <Split className="w-3 h-3 text-sky-400" />
              <span>Particionar en 4 Partes</span>
            </button>
          </div>
        </div>

        {/* SUBPANEL PRINCIPAL: LOCALIZADOR Y EMPAREJADOR PARALELO DE INICIOS DE CAPÍTULO */}
        {activeTocTab === 'parallel_marker' && (
          <div className="space-y-4 animate-in fade-in">
            {/* SELECTOR RÁPIDO DE CAPÍTULOS / SEGMENTOS */}
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-[#0c1015] border border-stone-800 rounded-xl">
              <span className="text-[11px] font-bold text-stone-400 mr-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Capítulo activo:</span>
              </span>
              {chaptersList.map(chap => {
                const isSelected = chapterDraft.number === chap.number;
                return (
                  <button
                    key={chap.number}
                    type="button"
                    onClick={() => handleLoadChapterForEditing(chap)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-500 text-stone-950 shadow-md ring-2 ring-amber-300'
                        : 'bg-[#151922] hover:bg-stone-800 text-stone-300 border border-stone-700/60'
                    }`}
                    title={`Editar y revisar marcaciones del Capítulo #${chap.number}`}
                  >
                    <span>Cap. #{chap.number}</span>
                    {chap.title && <span className="opacity-75 font-normal max-w-[100px] truncate">({chap.title.replace(/^#+\s*/, '')})</span>}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleStartNewChapter}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 cursor-pointer flex items-center gap-1 transition"
                title="Comenzar a demarcar un nuevo capítulo al final de la lista"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Nuevo Cap. #{chaptersList.length + 1}</span>
              </button>
            </div>

            {/* Panel de Control del Capítulo en Curso */}
            <div className="bg-[#12161b] border-2 border-amber-500/60 rounded-2xl p-4 shadow-md space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-amber-500 text-stone-950 font-black text-sm flex items-center justify-center shrink-0 shadow">
                    #{chapterDraft.number}
                  </span>
                  <div>
                    <h5 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                      <span>Demarcando: Capítulo #{chapterDraft.number}</span>
                      {chapterDraft.matchConfidence && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          chapterDraft.matchConfidence === 'confirmed'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : chapterDraft.matchConfidence === 'high'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          {chapterDraft.matchConfidence === 'confirmed' ? '✓ Confirmado 1:1' : `⚡ Match Espejo (${chapterDraft.matchConfidence})`}
                        </span>
                      )}
                    </h5>
                    <p className="text-[11px] text-stone-400">
                      Asigna el párrafo de inicio en Libro A y Libro B. Si el libro no tiene título impreso, se fija el inicio de la narración y se le asigna el título canónico.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleAutoAlignByCanonicalPhrases}
                    disabled={isAutoAligningChapters}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-200 text-xs font-bold transition cursor-pointer"
                    title="Buscar e investigar automáticamente los inicios de capítulo con frases canónicas"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Auto-Match Canónico</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveDraftChapter(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold transition cursor-pointer border border-stone-600"
                    title="Guardar cambios de este capítulo sin avanzar"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Guardar Cap. #{chapterDraft.number}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveDraftChapter(true)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-stone-950 text-xs font-black transition cursor-pointer shadow-md active:scale-95"
                    title="Guardar este capítulo y avanzar inmediatamente al siguiente"
                  >
                    <span>Guardar y Pasar al Cap. #{chapterDraft.number + 1} ▶</span>
                  </button>
                </div>
              </div>

              {/* Formulario del borrador de capítulo y detección de títulos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-[#0b0e11] p-3 rounded-xl border border-stone-800">
                <div>
                  <label className="block font-semibold text-stone-300 mb-1">Título / Etiqueta del Capítulo:</label>
                  <input
                    type="text"
                    value={chapterDraft.title}
                    onChange={(e) => setChapterDraft({ ...chapterDraft, title: e.target.value })}
                    placeholder="Ej. Capítulo 1, o I, o Parte 1..."
                    className="w-full px-2.5 py-1.5 bg-[#14181f] border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 font-semibold"
                  />
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-stone-400">Modalidad en Libro A:</span>
                    <button
                      type="button"
                      onClick={() => setChapterDraft({ ...chapterDraft, hasPrintedTitleA: !chapterDraft.hasPrintedTitleA })}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition ${
                        chapterDraft.hasPrintedTitleA ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-stone-800 text-stone-300'
                      }`}
                    >
                      {chapterDraft.hasPrintedTitleA ? '🔤 Con título impreso' : '📄 Sin título (Párrafo narrativo)'}
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-stone-400">Modalidad en Libro B:</span>
                    <button
                      type="button"
                      onClick={() => setChapterDraft({ ...chapterDraft, hasPrintedTitleB: !chapterDraft.hasPrintedTitleB })}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition ${
                        chapterDraft.hasPrintedTitleB ? 'bg-sky-950 text-sky-300 border border-sky-800' : 'bg-stone-800 text-stone-300'
                      }`}
                    >
                      {chapterDraft.hasPrintedTitleB ? '🔤 Con título impreso' : '📄 Sin título (Párrafo narrativo)'}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-emerald-400">
                      Inicio en Libro A {chapterDraft.pageA ? `(Pág. ${chapterDraft.pageA})` : ''}:
                    </label>
                    <span className="text-[10px] text-stone-400 font-mono">
                      {chapterDraft.hasPrintedTitleA ? '🔤 Con título' : '📄 Sin título'}
                    </span>
                  </div>
                  <div className="px-2.5 py-1.5 bg-[#14181f] border border-emerald-900/60 rounded-lg text-stone-300 text-[11px] truncate italic font-sans">
                    {chapterDraft.startPhraseA ? `«${chapterDraft.startPhraseA}»` : 'Haz clic o subraya una frase en Libro A...'}
                  </div>
                  <p className="text-[9px] text-stone-500 mt-1">
                    {chapterDraft.hasPrintedTitleA ? 'El inicio incluye título impreso en texto' : 'Párrafo de inicio sin título (se asigna el título canónico)'}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-sky-400">
                      Inicio en Libro B {chapterDraft.pageB ? `(Pág. ${chapterDraft.pageB})` : ''}:
                    </label>
                    <span className="text-[10px] text-stone-400 font-mono">
                      {chapterDraft.hasPrintedTitleB ? '🔤 Con título' : '📄 Sin título'}
                    </span>
                  </div>
                  <div className="px-2.5 py-1.5 bg-[#14181f] border border-sky-900/60 rounded-lg text-stone-300 text-[11px] truncate italic font-sans">
                    {chapterDraft.startPhraseB ? `«${chapterDraft.startPhraseB}»` : 'Se emparejará al marcar Libro A (o subraya en B)...'}
                  </div>
                  <p className="text-[9px] text-stone-500 mt-1">
                    {chapterDraft.hasPrintedTitleB ? 'El inicio incluye título impreso en texto' : 'Párrafo de inicio sin título (se asigna el título canónico)'}
                  </p>
                </div>
              </div>
            </div>

            {/* BANNER FLOTANTE DE ACCIÓN PARA SUBRAYADO EN EL VISOR DE CAPÍTULOS */}
            {selectedChapterSnippet && (
              <div className="p-3 rounded-2xl bg-[#14181f] border-2 border-amber-400 text-xs shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2 max-w-md truncate text-amber-200">
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-stone-950 font-extrabold uppercase text-[10px]">
                    Cap. #{chapterDraft.number} • Subrayado en Libro {selectedChapterSnippet.slot}
                  </span>
                  <span className="italic truncate font-sans text-stone-100 font-medium">
                    «{selectedChapterSnippet.text}»
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      handleMarkChapterStartInSlot(selectedChapterSnippet.slot, selectedChapterSnippet.text, selectedChapterSnippet.pageNumber, true);
                      setSelectedChapterSnippet(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold text-xs cursor-pointer shadow-md flex items-center gap-1.5 transition active:scale-95"
                  >
                    🔤 Fijar como Título de Cap. #{chapterDraft.number}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleMarkChapterStartInSlot(selectedChapterSnippet.slot, selectedChapterSnippet.text, selectedChapterSnippet.pageNumber, false);
                      setSelectedChapterSnippet(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-xs cursor-pointer shadow-md flex items-center gap-1.5 transition active:scale-95"
                  >
                    📄 Fijar como Inicio Narrativo (Sin Título)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedChapterSnippet(null)}
                    className="px-2 py-1 text-stone-400 hover:text-white transition cursor-pointer text-xs"
                  >
                    ✕ Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Doble Visor Lado a Lado para Localización de Capítulos (Acotado a Páginas de Novela) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* LADO A: LOCALIZADOR EN LIBRO A */}
              <div className="bg-[#0b0e11] border border-stone-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-800/80">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 font-bold text-xs flex items-center justify-center">
                      A
                    </span>
                    <span className="text-xs font-bold text-stone-200">
                      Libro A ({bookA.language || 'Español'})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {delimitedPagesA.length > 0 && (
                      <div className="flex items-center gap-1 text-[11px] bg-[#14181f] px-2 py-1 rounded-lg border border-stone-800">
                        <button
                          type="button"
                          onClick={() => setChapViewerPageA(Math.max(novelStartPageA, chapViewerPageA - 1))}
                          disabled={chapViewerPageA <= novelStartPageA}
                          className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 disabled:opacity-30 cursor-pointer"
                          title="Página anterior de la obra"
                        >
                          ◀
                        </button>
                        <span className="text-stone-400">Pág.</span>
                        <input
                          type="number"
                          min={novelStartPageA}
                          max={novelEndPageA}
                          value={chapViewerPageA}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setChapViewerPageA(Math.min(novelEndPageA, Math.max(novelStartPageA, val)));
                            }
                          }}
                          className="w-14 px-1 py-0.5 bg-stone-900 border border-amber-500/60 rounded text-center font-mono font-bold text-amber-300 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                          title={`Escribe el número de página para saltar directamente (${novelStartPageA} a ${novelEndPageA})`}
                        />
                        <span className="text-stone-400">/ {novelEndPageA}</span>
                        <button
                          type="button"
                          onClick={() => setChapViewerPageA(Math.min(novelEndPageA, chapViewerPageA + 1))}
                          disabled={chapViewerPageA >= novelEndPageA}
                          className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 disabled:opacity-30 cursor-pointer"
                          title="Página siguiente de la obra"
                        >
                          ▶
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setChapViewModeA(chapViewModeA === 'pages' ? 'continuous' : 'pages')}
                      className="text-[10px] px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white cursor-pointer"
                    >
                      {chapViewModeA === 'pages' ? 'Ver Continuo' : 'Por Páginas'}
                    </button>
                  </div>
                </div>

                {/* Buscador global a lo largo de la obra en Libro A */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-stone-500" />
                    <input
                      type="text"
                      value={chapSearchA}
                      onChange={(e) => setChapSearchA(e.target.value)}
                      placeholder="Buscar frase, título o palabra en todo el Libro A..."
                      className="flex-1 bg-[#12161b] border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                    />
                    {chapSearchA && (
                      <button
                        type="button"
                        onClick={() => setChapSearchA('')}
                        className="text-[10px] text-stone-400 hover:text-white px-2 py-1 bg-stone-800 rounded cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Resultados de búsqueda global a lo largo de las páginas */}
                  {searchResultsA.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 text-[10px] bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                      <span className="font-bold text-amber-300">Encontrado en {searchResultsA.length} pág(s):</span>
                      {searchResultsA.slice(0, 10).map((r) => (
                        <button
                          key={r.pageNumber}
                          type="button"
                          onClick={() => setChapViewerPageA(r.pageNumber)}
                          className={`px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer transition ${
                            chapViewerPageA === r.pageNumber
                              ? 'bg-amber-500 text-stone-950'
                              : 'bg-stone-800 hover:bg-stone-700 text-amber-200 border border-stone-700'
                          }`}
                          title={`Saltar a la Página ${r.pageNumber} (${r.count} coincidencia${r.count > 1 ? 's' : ''})`}
                        >
                          Pág. {r.pageNumber} {r.count > 1 ? `(${r.count})` : ''}
                        </button>
                      ))}
                      {searchResultsA.length > 10 && (
                        <span className="text-stone-400 font-mono text-[9px]">+{searchResultsA.length - 10} más</span>
                      )}
                    </div>
                  )}
                  {chapSearchA.trim().length >= 2 && searchResultsA.length === 0 && (
                    <p className="text-[10px] text-stone-500 italic">
                      No se encontraron coincidencias para «{chapSearchA}» en la obra delimitada de Libro A.
                    </p>
                  )}
                </div>

                {/* Párrafos acotados estrictamente a la obra en Libro A */}
                <div 
                  onMouseUp={() => handleMouseUpInChapterReader('A', chapViewModeA === 'pages' ? chapViewerPageA : undefined)}
                  className="bg-[#080a0d] border border-stone-800/80 rounded-xl p-3 max-h-80 overflow-y-auto font-serif text-xs leading-relaxed text-stone-200 space-y-2 select-text cursor-text"
                >
                  {(() => {
                    const paras = chapViewModeA === 'pages'
                      ? getDelimitedPageParagraphs('A', chapViewerPageA)
                      : delimitedTextA.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);

                    const cleanQ = chapSearchA.trim().toLowerCase();

                    if (paras.length === 0) {
                      return <p className="text-stone-500 italic">No hay párrafos de la obra en esta vista.</p>;
                    }

                    return paras.map((p, pIdx) => {
                      // Limpiar hashtags ### para no ensuciar la lectura
                      const displayP = p.replace(/^#+\s*/, '').replace(/\n#+\s*/g, '\n');
                      const isEditorialHeading = /^#+\s*/.test(p) || /^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|PARTE)\s+[0-9IVXLCDM]+/i.test(p);
                      const matchesQ = cleanQ && cleanQ.length >= 2 && displayP.toLowerCase().includes(cleanQ);
                      const isSelectedAsStartA = chapterDraft.startPhraseA && displayP.includes(chapterDraft.startPhraseA.slice(0, 40));

                      return (
                        <div
                          key={pIdx}
                          className={`p-2.5 rounded-lg border transition group relative ${
                            isSelectedAsStartA
                              ? 'bg-emerald-950/60 border-emerald-500 text-emerald-100 shadow-sm'
                              : matchesQ
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-100'
                                : 'bg-[#0f1216] border-stone-800 hover:border-emerald-700/60 hover:bg-stone-900/80'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[9px] font-mono text-stone-400 pb-1 select-none">
                            <span className="flex items-center gap-1.5">
                              <span>{chapViewModeA === 'pages' ? `Pág. ${chapViewerPageA} • Párrafo ${pIdx + 1}` : `Párrafo ${pIdx + 1}`}</span>
                              {isEditorialHeading && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[8px] font-bold">
                                  Encabezado
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleMarkChapterStartInSlot('A', displayP, chapViewerPageA, true)}
                                className="px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-800 text-emerald-300 font-bold border border-emerald-700/60 cursor-pointer shadow-xs text-[9px]"
                                title={`Marcar como Título Impreso para el Capítulo #${chapterDraft.number}`}
                              >
                                🔤 Título Cap. #{chapterDraft.number}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMarkChapterStartInSlot('A', displayP, chapViewerPageA, false)}
                                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 font-bold border border-stone-600/60 cursor-pointer shadow-xs text-[9px]"
                                title={`Marcar como inicio narrativo sin título impreso (se le asigna el título canónico)`}
                              >
                                📄 Inicio Narrativo
                              </button>
                            </div>
                          </div>
                          <p 
                            className="select-text whitespace-pre-wrap cursor-text"
                            onClick={() => handleMarkChapterStartInSlot('A', displayP, chapViewerPageA)}
                          >
                            {displayP}
                          </p>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* LADO B: LOCALIZADOR EN LIBRO B */}
              <div className="bg-[#0b0e11] border border-stone-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-800/80">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-300 font-bold text-xs flex items-center justify-center">
                      B
                    </span>
                    <span className="text-xs font-bold text-stone-200">
                      Libro B ({bookB.language || 'Original'})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {delimitedPagesB.length > 0 && (
                      <div className="flex items-center gap-1 text-[11px] bg-[#14181f] px-2 py-1 rounded-lg border border-stone-800">
                        <button
                          type="button"
                          onClick={() => setChapViewerPageB(Math.max(novelStartPageB, chapViewerPageB - 1))}
                          disabled={chapViewerPageB <= novelStartPageB}
                          className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 disabled:opacity-30 cursor-pointer"
                          title="Página anterior de la obra"
                        >
                          ◀
                        </button>
                        <span className="text-stone-400">Pág.</span>
                        <input
                          type="number"
                          min={novelStartPageB}
                          max={novelEndPageB}
                          value={chapViewerPageB}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setChapViewerPageB(Math.min(novelEndPageB, Math.max(novelStartPageB, val)));
                            }
                          }}
                          className="w-14 px-1 py-0.5 bg-stone-900 border border-sky-500/60 rounded text-center font-mono font-bold text-sky-300 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                          title={`Escribe el número de página para saltar directamente (${novelStartPageB} a ${novelEndPageB})`}
                        />
                        <span className="text-stone-400">/ {novelEndPageB}</span>
                        <button
                          type="button"
                          onClick={() => setChapViewerPageB(Math.min(novelEndPageB, chapViewerPageB + 1))}
                          disabled={chapViewerPageB >= novelEndPageB}
                          className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 disabled:opacity-30 cursor-pointer"
                          title="Página siguiente de la obra"
                        >
                          ▶
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setChapViewModeB(chapViewModeB === 'pages' ? 'continuous' : 'pages')}
                      className="text-[10px] px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white cursor-pointer"
                    >
                      {chapViewModeB === 'pages' ? 'Ver Continuo' : 'Por Páginas'}
                    </button>
                  </div>
                </div>

                {/* Buscador global a lo largo de la obra en Libro B */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-stone-500" />
                    <input
                      type="text"
                      value={chapSearchB}
                      onChange={(e) => setChapSearchB(e.target.value)}
                      placeholder="Buscar frase, título o palabra en todo el Libro B..."
                      className="flex-1 bg-[#12161b] border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500"
                    />
                    {chapSearchB && (
                      <button
                        type="button"
                        onClick={() => setChapSearchB('')}
                        className="text-[10px] text-stone-400 hover:text-white px-2 py-1 bg-stone-800 rounded cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Resultados de búsqueda global a lo largo de las páginas */}
                  {searchResultsB.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 text-[10px] bg-sky-500/10 p-2 rounded-lg border border-sky-500/20">
                      <span className="font-bold text-sky-300">Encontrado en {searchResultsB.length} pág(s):</span>
                      {searchResultsB.slice(0, 10).map((r) => (
                        <button
                          key={r.pageNumber}
                          type="button"
                          onClick={() => setChapViewerPageB(r.pageNumber)}
                          className={`px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer transition ${
                            chapViewerPageB === r.pageNumber
                              ? 'bg-sky-500 text-stone-950'
                              : 'bg-stone-800 hover:bg-stone-700 text-sky-200 border border-stone-700'
                          }`}
                          title={`Saltar a la Página ${r.pageNumber} (${r.count} coincidencia${r.count > 1 ? 's' : ''})`}
                        >
                          Pág. {r.pageNumber} {r.count > 1 ? `(${r.count})` : ''}
                        </button>
                      ))}
                      {searchResultsB.length > 10 && (
                        <span className="text-stone-400 font-mono text-[9px]">+{searchResultsB.length - 10} más</span>
                      )}
                    </div>
                  )}
                  {chapSearchB.trim().length >= 2 && searchResultsB.length === 0 && (
                    <p className="text-[10px] text-stone-500 italic">
                      No se encontraron coincidencias para «{chapSearchB}» en la obra delimitada de Libro B.
                    </p>
                  )}
                </div>

                {/* Párrafos acotados estrictamente a la obra en Libro B */}
                <div 
                  onMouseUp={() => handleMouseUpInChapterReader('B', chapViewModeB === 'pages' ? chapViewerPageB : undefined)}
                  className="bg-[#080a0d] border border-stone-800/80 rounded-xl p-3 max-h-80 overflow-y-auto font-serif text-xs leading-relaxed text-stone-200 space-y-2 select-text cursor-text"
                >
                  {(() => {
                    const paras = chapViewModeB === 'pages'
                      ? getDelimitedPageParagraphs('B', chapViewerPageB)
                      : delimitedTextB.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);

                    const cleanQ = chapSearchB.trim().toLowerCase();

                    if (paras.length === 0) {
                      return <p className="text-stone-500 italic">No hay párrafos de la obra en esta vista.</p>;
                    }

                    return paras.map((p, pIdx) => {
                      // Limpiar hashtags ### para no ensuciar la lectura
                      const displayP = p.replace(/^#+\s*/, '').replace(/\n#+\s*/g, '\n');
                      const isEditorialHeading = /^#+\s*/.test(p) || /^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|PARTE)\s+[0-9IVXLCDM]+/i.test(p);
                      const matchesQ = cleanQ && cleanQ.length >= 2 && displayP.toLowerCase().includes(cleanQ);
                      const isSelectedAsStartB = chapterDraft.startPhraseB && displayP.includes(chapterDraft.startPhraseB.slice(0, 40));

                      return (
                        <div
                          key={pIdx}
                          className={`p-2.5 rounded-lg border transition group relative ${
                            isSelectedAsStartB
                              ? 'bg-sky-950/60 border-sky-400 text-sky-100 shadow-sm'
                              : matchesQ
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-100'
                                : 'bg-[#0f1216] border-stone-800 hover:border-sky-700/60 hover:bg-stone-900/80'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[9px] font-mono text-stone-400 pb-1 select-none">
                            <span className="flex items-center gap-1.5">
                              <span>{chapViewModeB === 'pages' ? `Pág. ${chapViewerPageB} • Párrafo ${pIdx + 1}` : `Párrafo ${pIdx + 1}`}</span>
                              {isEditorialHeading && (
                                <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[8px] font-bold">
                                  Encabezado
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleMarkChapterStartInSlot('B', displayP, chapViewerPageB, true)}
                                className="px-2 py-0.5 rounded bg-sky-950 hover:bg-sky-800 text-sky-300 font-bold border border-sky-700/60 cursor-pointer shadow-xs text-[9px]"
                                title={`Marcar como Título Impreso para el Capítulo #${chapterDraft.number}`}
                              >
                                🔤 Título Cap. #{chapterDraft.number}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMarkChapterStartInSlot('B', displayP, chapViewerPageB, false)}
                                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 font-bold border border-stone-600/60 cursor-pointer shadow-xs text-[9px]"
                                title={`Marcar como inicio narrativo sin título impreso (se le asigna el título canónico)`}
                              >
                                📄 Inicio Narrativo
                              </button>
                            </div>
                          </div>
                          <p 
                            className="select-text whitespace-pre-wrap cursor-text"
                            onClick={() => handleMarkChapterStartInSlot('B', displayP, chapViewerPageB)}
                          >
                            {displayP}
                          </p>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Escanear Hoja Específica del PDF */}
        {activeTocTab === 'scan_page' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-[#0b0e11] p-4 rounded-xl border border-stone-800/80 animate-in fade-in">
            <div>
              <label className="block font-semibold text-stone-300 mb-1">Libro donde se encuentra el Índice:</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTocSlot('A')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedTocSlot === 'A' ? 'bg-amber-500 text-stone-950 shadow' : 'bg-stone-800 text-stone-300 hover:text-white'
                  }`}
                >
                  Libro A ({bookA.name || bookA.language || 'Español'})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTocSlot('B')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedTocSlot === 'B' ? 'bg-sky-500 text-stone-950 shadow' : 'bg-stone-800 text-stone-300 hover:text-white'
                  }`}
                >
                  Libro B ({bookB.name || bookB.language || 'Original'})
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-stone-300 mb-1">
                Página del PDF correspondiente al Índice:
              </label>
              {(() => {
                const targetBook = selectedTocSlot === 'A' ? bookA : bookB;
                const hasPages = targetBook.pdfPages && targetBook.pdfPages.length > 0;

                return (
                  <select
                    value={selectedTocPageNumber}
                    onChange={(e) => setSelectedTocPageNumber(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#12161b] border border-stone-700 rounded-lg text-stone-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                  >
                    {hasPages ? (
                      targetBook.pdfPages!.map(p => (
                        <option key={p.pageNumber} value={p.pageNumber}>
                          Página {p.pageNumber} {/(?:índice|contents|table\s+of\s+contents|sommaire|inhaltsverzeichnis|sumario)/i.test(p.text) ? '★ (Posible Índice)' : ''}
                        </option>
                      ))
                    ) : (
                      Array.from({ length: 25 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>Página {n}</option>
                      ))
                    )}
                  </select>
                );
              })()}
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleExtractTocFromPage}
                disabled={isExtractingToc}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-stone-950 font-extrabold text-xs shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4 text-stone-950" />
                <span>{isExtractingToc ? 'Escaneando hoja...' : 'Escanear Índice de esta Hoja'}</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: Pegar Texto de Índice (con selector explícito de Libro A / Libro B) */}
        {activeTocTab === 'paste_text' && (
          <div className="space-y-3 bg-[#0b0e11] p-4 rounded-xl border border-stone-800/80 animate-in fade-in text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-800">
              <span className="font-bold text-stone-200">
                ¿Para cuál de los dos libros estás pegando el índice?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTocSlot('A')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedTocSlot === 'A' ? 'bg-amber-500 text-stone-950 shadow' : 'bg-stone-800 text-stone-300 hover:text-white'
                  }`}
                >
                  Libro A ({bookA.language || 'Español'})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTocSlot('B')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedTocSlot === 'B' ? 'bg-sky-500 text-stone-950 shadow' : 'bg-stone-800 text-stone-300 hover:text-white'
                  }`}
                >
                  Libro B ({bookB.language || 'Original'})
                </button>
              </div>
            </div>

            <label className="block font-semibold text-stone-300">
              Pega o escribe las líneas del índice impreso del Libro {selectedTocSlot}:
            </label>
            <textarea
              value={manualTocText}
              onChange={(e) => setManualTocText(e.target.value)}
              placeholder="Ejemplo:&#10;Capítulo I. La partida ....... 11&#10;Capítulo II. La visita ...... 34&#10;Capítulo III. El desenlace .. 78"
              rows={4}
              className="w-full p-2.5 bg-[#12161b] border border-stone-700 rounded-xl text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500 font-mono text-xs"
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[11px] text-stone-400">
                Se detectarán los números de capítulos, títulos y números de página para Libro {selectedTocSlot}.
              </span>
              <button
                type="button"
                onClick={handleProcessManualTocText}
                className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs cursor-pointer shadow-md transition"
              >
                Procesar Texto de Índice para Libro {selectedTocSlot}
              </button>
            </div>
          </div>
        )}

        {/* LISTA VIVA DE CAPÍTULOS / SEGMENTOS REGISTRADOS */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Lista de Capítulos Sincronizados ({chaptersList.length} partes):</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                structureMode === 'manual_mirror' 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                  : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
              }`}>
                {structureMode === 'manual_mirror' ? 'Modo: Demarcación Manual en Libros (Prioritaria)' : 'Modo: Estructura Canónica de Red'}
              </span>
            </span>

            <button
              type="button"
              onClick={handleStartNewChapter}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 cursor-pointer flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Agregar Nuevo Capítulo</span>
            </button>
          </div>

          {chaptersList.length === 0 ? (
            <p className="text-stone-500 italic py-2 text-xs">
              No hay capítulos registrados aún. Puedes pulsar «Auto-Sincronizar por Frases Canónicas en Red» o demarcar manualmente en los libros.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {chaptersList.map((chap, cIdx) => (
                <div key={cIdx} className="bg-[#0b0e11] border border-stone-800 hover:border-stone-700 p-3 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-5 h-5 rounded-md bg-stone-800 text-stone-300 font-mono text-[10px] flex items-center justify-center shrink-0">
                        {chap.number}
                      </span>
                      <span className="font-bold text-stone-200 truncate" title={chap.title}>
                        {chap.title.replace(/^#+\s*/, '')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleLoadChapterForEditing(chap)}
                        className="text-stone-400 hover:text-amber-300 p-1 transition cursor-pointer"
                        title="Cargar este capítulo en el demarcador para editarlo"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveChapter(cIdx)}
                        className="text-stone-500 hover:text-rose-400 p-1 transition cursor-pointer"
                        title="Eliminar este capítulo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1 text-[10px]">
                    <div className="flex items-center justify-between text-emerald-300/90 bg-emerald-950/30 px-2 py-1 rounded">
                      <span className="truncate max-w-[170px]" title={chap.startPhrase || 'Sin frase registrada'}>
                        A: {chap.startPhrase ? `«${chap.startPhrase.slice(0, 30)}...»` : 'Inicio asignado'}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-stone-400 font-mono">
                          {chap.hasPrintedTitleA !== false ? '🔤 Título' : '📄 Párrafo'}
                        </span>
                        {chap.pageNumber ? (
                          <button
                            type="button"
                            onClick={() => handleJumpToPage('A', chap.pageNumber!)}
                            className="font-mono text-emerald-400 hover:underline cursor-pointer ml-1"
                          >
                            Pág. {chap.pageNumber} ↗
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sky-300/90 bg-sky-950/30 px-2 py-1 rounded">
                      <span className="truncate max-w-[170px]" title={chap.startPhraseB || 'Sin frase registrada'}>
                        B: {chap.startPhraseB ? `«${chap.startPhraseB.slice(0, 30)}...»` : 'Inicio asignado'}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-stone-400 font-mono">
                          {chap.hasPrintedTitleB !== false ? '🔤 Título' : '📄 Párrafo'}
                        </span>
                        {chap.pageNumberB ? (
                          <button
                            type="button"
                            onClick={() => handleJumpToPage('B', chap.pageNumberB!)}
                            className="font-mono text-sky-400 hover:underline cursor-pointer ml-1"
                          >
                            Pág. {chap.pageNumberB} ↗
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {tocMessage && (
          <p className="text-xs text-sky-300 bg-sky-950/60 border border-sky-800/60 p-2.5 rounded-xl font-medium">
            {tocMessage}
          </p>
        )}
      </div>

      {/* 4. BOTÓN DE DESPACHO A FASE 2 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-[#101418] to-emerald-950/70 border border-emerald-600/50 shadow-xl">
        <div className="text-xs text-stone-300 space-y-0.5">
          <strong className="text-emerald-400 block font-bold text-sm">¿Marcadores de delimitación y capítulos listos?</strong>
          <span>
            {structureMode === 'manual_mirror' && chaptersList.length > 0
              ? `Se despacharán a Fase 2 los ${chaptersList.length} capítulos demarcados en los libros espejo.`
              : chaptersList.length > 0
                ? `Se despachará a Fase 2 la estructura canónica identificada en red (${chaptersList.length} partes).`
                : 'La obra se despachará en bloque continuo delimitado entre inicio y fin (el índice es opcional).'}
          </span>
        </div>

        <button
          type="button"
          id="btn-proceed-phase2-from-delimitation"
          onClick={onProceedToPhase2}
          disabled={!bookA.extractedText && !bookB.extractedText}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-stone-950 font-black text-xs shadow-lg transition active:scale-[0.98] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shrink-0 group"
        >
          <span>Continuar a Fase 2: Curaduría Editorial de la Novela</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition text-stone-950" />
        </button>
      </div>
    </div>
  );
};
