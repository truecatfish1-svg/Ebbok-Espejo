import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Bookmark, 
  Flag, 
  CheckCircle2, 
  Layers, 
  Search, 
  Sliders, 
  ArrowUpRight,
  BookOpen,
  Eye,
  Zap,
  Info
} from 'lucide-react';
import type { BookPageStructure, PageDetailAnalysis } from '../types';

interface VisualDocumentReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  slotName: string;
  fullExtractedText?: string;
  pdfPages?: { pageNumber: number; text: string }[];
  pageStructure?: BookPageStructure;
  firstParagraph?: string;
  lastParagraph?: string;
  onSetDirectParagraphBoundary?: (type: 'start' | 'end', rawIdx: number, pageNumber?: number) => void;
  onSetPageBoundary?: (type: 'start' | 'end', pageNumber: number) => void;
  onSearchAndSetBoundary?: (type: 'start' | 'end', phrase: string) => void;
  onSetExactTextBoundary?: (type: 'start' | 'end', selectedText: string, pageNumber?: number) => void;
}

export const VisualDocumentReaderModal: React.FC<VisualDocumentReaderModalProps> = ({
  isOpen,
  onClose,
  slotName,
  fullExtractedText = '',
  pdfPages,
  pageStructure,
  firstParagraph = '',
  lastParagraph = '',
  onSetDirectParagraphBoundary,
  onSetPageBoundary,
  onSearchAndSetBoundary,
  onSetExactTextBoundary
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>('single');
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState('1');
  const [selectedSnippet, setSelectedSnippet] = useState<{ text: string; pageNumber: number } | null>(null);
  const [activeStartAnchor, setActiveStartAnchor] = useState<string>(firstParagraph || '');
  const [activeEndAnchor, setActiveEndAnchor] = useState<string>(lastParagraph || '');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const rawParas = React.useMemo(() => {
    return fullExtractedText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
  }, [fullExtractedText]);

  // Construir lista de páginas ya sea desde pdfPages o desde pagesAnalysis o sintéticamente
  const pagesList = React.useMemo(() => {
    if (pdfPages && pdfPages.length > 0) {
      return pdfPages.map(p => ({
        pageNumber: p.pageNumber,
        text: p.text,
        wordsCount: p.text.split(/\s+/).filter(Boolean).length
      }));
    }

    if (pageStructure?.pagesAnalysis && pageStructure.pagesAnalysis.length > 0) {
      return pageStructure.pagesAnalysis.map(pa => ({
        pageNumber: pa.pageNumber,
        text: pa.snippet || '',
        wordsCount: pa.wordsCount
      }));
    }

    // Si no hay páginas divididas, agrupar párrafos en páginas sintéticas de ~4 párrafos
    const synthetic: { pageNumber: number; text: string; wordsCount: number }[] = [];
    const chunkSize = 4;
    for (let i = 0; i < rawParas.length; i += chunkSize) {
      const pageParas = rawParas.slice(i, i + chunkSize);
      const pageText = pageParas.join('\n\n');
      synthetic.push({
        pageNumber: Math.floor(i / chunkSize) + 1,
        text: pageText,
        wordsCount: pageText.split(/\s+/).filter(Boolean).length
      });
    }
    return synthetic;
  }, [pdfPages, pageStructure, rawParas]);

  const totalPages = pagesList.length > 0 ? pagesList[pagesList.length - 1].pageNumber : 1;
  const novelStartPage = pageStructure?.novelStartPage || 1;
  const novelEndPage = pageStructure?.novelEndPage || totalPages;

  useEffect(() => {
    if (isOpen) {
      setCurrentPage(novelStartPage);
      setPageInput(String(novelStartPage));
    }
  }, [isOpen, novelStartPage]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  const handleJumpToPage = (pageNum: number) => {
    const valid = Math.max(1, Math.min(totalPages, pageNum));
    setCurrentPage(valid);
    setPageInput(String(valid));
    if (viewMode === 'continuous') {
      const el = document.getElementById(`doc-page-${valid}`);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleMouseUpSelection = (pageNum: number) => {
    const sel = window.getSelection();
    if (!sel) return;
    const text = sel.toString().trim();
    if (text.length >= 2) {
      setSelectedSnippet({ text, pageNumber: pageNum });
    }
  };

  const handleSetStartFromSelection = (text: string, pageNum: number) => {
    setActiveStartAnchor(text);
    if (onSetExactTextBoundary) {
      onSetExactTextBoundary('start', text, pageNum);
    } else if (onSearchAndSetBoundary) {
      onSearchAndSetBoundary('start', text);
    } else if (onSetPageBoundary) {
      onSetPageBoundary('start', pageNum);
    }
    const snippet = text.slice(0, 45) + (text.length > 45 ? '...' : '');
    showToast(`✓ Selección fijada como INICIO de la obra: «${snippet}». Todo lo anterior queda en amarillo (descartado).`);
    setSelectedSnippet(null);
  };

  const handleSetEndFromSelection = (text: string, pageNum: number) => {
    setActiveEndAnchor(text);
    if (onSetExactTextBoundary) {
      onSetExactTextBoundary('end', text, pageNum);
    } else if (onSearchAndSetBoundary) {
      onSearchAndSetBoundary('end', text);
    } else if (onSetPageBoundary) {
      onSetPageBoundary('end', pageNum);
    }
    const snippet = text.slice(-45);
    showToast(`✓ Fin fijado exactamente en esta frase: «...${snippet}». Solo se toma desde esta frase hacia atrás. Lo que esté adelante en el párrafo o páginas siguientes queda 100% descartado (amarillo).`);
    setSelectedSnippet(null);
  };

  const handleSetStartFromPara = (paraText: string, pageNum: number) => {
    setActiveStartAnchor(paraText);
    if (onSetExactTextBoundary) {
      onSetExactTextBoundary('start', paraText, pageNum);
      showToast(`Párrafo de la Pág. ${pageNum} fijado como Inicio de la Obra. Las páginas previas se descartan (amarillo).`);
    } else if (onSearchAndSetBoundary) {
      onSearchAndSetBoundary('start', paraText);
      showToast(`Párrafo de la Pág. ${pageNum} fijado como Inicio de la Obra. Las páginas previas se descartan (amarillo).`);
    } else if (onSetPageBoundary) {
      onSetPageBoundary('start', pageNum);
      showToast(`Página ${pageNum} fijada como Inicio.`);
    }
  };

  const handleSetEndFromPara = (paraText: string, pageNum: number) => {
    setActiveEndAnchor(paraText);
    if (onSetExactTextBoundary) {
      onSetExactTextBoundary('end', paraText, pageNum);
      const endingWords = paraText.trim().split(/\s+/).slice(-6).join(' ');
      showToast(`Párrafo de la Pág. ${pageNum} fijado como Fin de la Obra (termina en: «...${endingWords}»). Todo lo posterior se descarta (amarillo).`);
    } else if (onSearchAndSetBoundary) {
      onSearchAndSetBoundary('end', paraText);
      const endingWords = paraText.trim().split(/\s+/).slice(-6).join(' ');
      showToast(`Párrafo de la Pág. ${pageNum} fijado como Fin de la Obra (termina en: «...${endingWords}»). Todo lo posterior se descarta (amarillo).`);
    } else if (onSetPageBoundary) {
      onSetPageBoundary('end', pageNum);
      showToast(`Página ${pageNum} fijada como Fin.`);
    }
  };

  const handleSetWholePageAsStart = (pageNum: number) => {
    if (onSetPageBoundary) {
      onSetPageBoundary('start', pageNum);
      showToast(`Toda la Página ${pageNum} fijada como Inicio de la Obra.`);
    }
  };

  const handleSetWholePageAsEnd = (pageNum: number) => {
    if (onSetPageBoundary) {
      onSetPageBoundary('end', pageNum);
      showToast(`Toda la Página ${pageNum} fijada como Fin de la Obra (incluye hasta el último párrafo de la hoja).`);
    }
  };

  // Normalización para detectar si un párrafo es el de inicio o fin
  const normClean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '');
  const startNorm = normClean(firstParagraph).slice(0, 40);
  const endLastWords = lastParagraph.trim().split(/\s+/).slice(-6).join(' ');
  const endNormLast = normClean(endLastWords).slice(-40);

  const renderSinglePage = (pageObj: { pageNumber: number; text: string; wordsCount: number }) => {
    const pageNum = pageObj.pageNumber;
    const isBeforeStart = pageNum < novelStartPage;
    const isAfterEnd = pageNum > novelEndPage;
    const isStartPage = pageNum === novelStartPage;
    const isEndPage = pageNum === novelEndPage;
    const isInNovelBody = !isBeforeStart && !isAfterEnd;

    // Desglosar la página en párrafos
    const paras = pageObj.text.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);

    const renderHighlightedPara = (text: string) => {
      const startAnchorClean = activeStartAnchor.trim().slice(0, 35);
      const endAnchorClean = activeEndAnchor.trim().slice(-35);

      if (startAnchorClean.length >= 6 && text.toLowerCase().includes(startAnchorClean.toLowerCase())) {
        const idx = text.toLowerCase().indexOf(startAnchorClean.toLowerCase());
        const before = text.slice(0, idx);
        const matched = text.slice(idx, idx + startAnchorClean.length);
        const after = text.slice(idx + startAnchorClean.length);
        return (
          <span>
            {before && (
              <span className="bg-amber-950/70 text-amber-300/80 px-1 py-0.5 rounded mr-1 border border-amber-600/50 line-through decoration-amber-500/60" title="Contenido preliminar descartado antes del inicio de la obra (Amarillo)">
                {before}
              </span>
            )}
            <mark className="bg-emerald-500/35 text-emerald-100 font-bold underline decoration-emerald-400 decoration-2 px-1 py-0.5 rounded">
              {matched}
            </mark>
            {after}
          </span>
        );
      }

      if (endAnchorClean.length >= 6 && text.toLowerCase().includes(endAnchorClean.toLowerCase())) {
        const idx = text.toLowerCase().lastIndexOf(endAnchorClean.toLowerCase());
        const before = text.slice(0, idx);
        const matched = text.slice(idx, idx + endAnchorClean.length);
        const after = text.slice(idx + endAnchorClean.length);
        return (
          <span>
            {before}
            <mark className="bg-purple-500/40 text-purple-100 font-bold underline decoration-purple-400 decoration-2 px-1 py-0.5 rounded shadow-sm">
              {matched}
            </mark>
            {after && (
              <span className="bg-amber-950/70 text-amber-300/80 px-1 py-0.5 rounded ml-1 border border-amber-600/50 line-through decoration-amber-500/60" title="Contenido posterior descartado fuera del cuerpo de la obra (Amarillo)">
                {after}
              </span>
            )}
          </span>
        );
      }

      return <span>{text}</span>;
    };

    return (
      <div 
        key={pageNum}
        id={`doc-page-${pageNum}`}
        onMouseUp={() => handleMouseUpSelection(pageNum)}
        className={`rounded-2xl transition-all border-2 shadow-xl p-6 sm:p-8 space-y-4 mb-8 ${
          isBeforeStart 
            ? 'bg-[#15120c] border-amber-600/50' 
            : isAfterEnd
            ? 'bg-[#15120c] border-amber-600/50'
            : isStartPage || isEndPage
            ? 'bg-[#0f1914] border-emerald-500 ring-2 ring-emerald-500/30'
            : 'bg-[#101518] border-emerald-800/40'
        }`}
      >
        {/* Cabecera de la Página con Estado Visual y Botones Rápidos */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-stone-800/80">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-700 text-stone-200">
              Página {pageNum} de {totalPages}
            </span>

            {/* Badge de Zona Estricta */}
            {isBeforeStart && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-extrabold border border-amber-500/40 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                ZONA PRELIMINAR (AMARILLO - DESCARTADA DEL CUERPO)
              </span>
            )}
            {isStartPage && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-stone-950 text-xs font-extrabold border border-emerald-400 flex items-center gap-1 shadow-sm">
                <Bookmark className="w-3.5 h-3.5 fill-current" />
                ARRANQUE DE LA OBRA (PÁGINA DE INICIO)
              </span>
            )}
            {isInNovelBody && !isStartPage && !isEndPage && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-extrabold border border-emerald-500/40 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                CUERPO DE LA NOVELA (VERDE - INCLUIDO)
              </span>
            )}
            {isEndPage && (
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500 text-white text-xs font-extrabold border border-purple-400 flex items-center gap-1 shadow-sm">
                <Flag className="w-3.5 h-3.5 fill-current" />
                DESENLACE DE LA OBRA (PÁGINA DE FIN)
              </span>
            )}
            {isAfterEnd && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-extrabold border border-amber-500/40 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                COLOFÓN / FINAL (AMARILLO - DESCARTADO)
              </span>
            )}
          </div>

          {/* Botones de Fijación a Nivel de Página Completa */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleSetWholePageAsStart(pageNum)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                isStartPage 
                  ? 'bg-emerald-600 text-white shadow-xs cursor-default' 
                  : 'bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 active:scale-95'
              }`}
              title="Fijar toda esta página como inicio de la obra"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>{isStartPage ? 'Página de Inicio' : 'Fijar Página como Inicio [▶]'}</span>
            </button>

            <button
              onClick={() => handleSetWholePageAsEnd(pageNum)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                isEndPage 
                  ? 'bg-purple-600 text-white shadow-xs cursor-default' 
                  : 'bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300 active:scale-95'
              }`}
              title="Fijar toda esta página como fin de la obra (incluye su último párrafo)"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{isEndPage ? 'Página de Fin' : 'Fijar Página como Fin [⏹]'}</span>
            </button>
          </div>
        </div>

        {/* Párrafos de la Página con Marcadores Directos */}
        <div className="space-y-3 pt-1">
          {paras.length === 0 ? (
            <p className="text-stone-500 italic text-sm py-4 text-center">
              (Página en blanco o sin texto extraíble)
            </p>
          ) : (
            paras.map((para, pIdx) => {
              const paraNorm = normClean(para);
              const isMatchFirst = startNorm.length >= 6 && (paraNorm.includes(startNorm) || (activeStartAnchor.trim().length >= 6 && paraNorm.includes(normClean(activeStartAnchor).slice(0, 30))));
              const isMatchLast = (endNormLast.length >= 6 && paraNorm.includes(endNormLast)) || (activeEndAnchor.trim().length >= 6 && paraNorm.includes(normClean(activeEndAnchor).slice(-30)));

              return (
                <div 
                  key={pIdx}
                  className={`group relative p-3.5 rounded-xl border transition-all ${
                    isMatchFirst 
                      ? 'bg-emerald-950/70 border-emerald-500 ring-2 ring-emerald-400 shadow-md' 
                      : isMatchLast
                      ? 'bg-purple-950/70 border-purple-500 ring-2 ring-purple-400 shadow-md'
                      : isBeforeStart || isAfterEnd
                      ? 'bg-[#18150f]/80 border-amber-900/40 hover:border-amber-700/60'
                      : 'bg-[#13191d]/80 border-stone-800 hover:border-emerald-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-stone-900/90 text-stone-400 border border-stone-800">
                        §{pIdx + 1}
                      </span>
                      {isMatchFirst && (
                        <span className="text-[10px] font-extrabold text-emerald-300 uppercase tracking-wide bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/40">
                          ▶ ARRANQUE DE LA OBRA (PÁRRAFO INICIAL)
                        </span>
                      )}
                      {isMatchLast && (
                        <span className="text-[10px] font-extrabold text-purple-300 uppercase tracking-wide bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/40">
                          ⏹ DESENLACE DE LA OBRA (TERMINA EN: «...{endLastWords}»)
                        </span>
                      )}
                    </div>

                    {/* Acciones Directas en el Párrafo */}
                    <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition">
                      <button
                        onClick={() => handleSetStartFromPara(para, pageNum)}
                        className="px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-600/70 text-emerald-200 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 shadow-xs"
                        title="Fijar este párrafo exacto como el inicio del cuerpo de la novela"
                      >
                        <Bookmark className="w-3 h-3 text-emerald-400" />
                        <span>Fijar como Inicio [▶]</span>
                      </button>

                      <button
                        onClick={() => handleSetEndFromPara(para, pageNum)}
                        className="px-2 py-1 rounded bg-purple-950 hover:bg-purple-900 border border-purple-600/70 text-purple-200 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 shadow-xs"
                        title="Fijar fin en este párrafo. Si la obra concluye a mitad del párrafo, selecciona con el cursor la frase exacta y haz clic en 'Fijar como FIN [⏹]' para descartar lo posterior."
                      >
                        <Flag className="w-3 h-3 text-purple-400" />
                        <span>Fijar como Fin [⏹]</span>
                      </button>
                    </div>
                  </div>

                  {/* Texto del Párrafo */}
                  <p className={`font-sans leading-relaxed text-stone-200 selection:bg-emerald-500 selection:text-black ${
                    fontSize === 'large' ? 'text-base sm:text-lg leading-relaxed' : 'text-sm sm:text-base leading-normal'
                  } ${isBeforeStart || isAfterEnd ? 'text-amber-200/75' : 'text-stone-100'}`}>
                    {renderHighlightedPara(para)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const currentPageObj = pagesList.find(p => p.pageNumber === currentPage) || pagesList[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-hidden animate-in fade-in duration-150">
      <div className="bg-[#0b0e12] border border-stone-700/80 rounded-2xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Cabecera Principal del Visor */}
        <div className="bg-[#10141a] border-b border-stone-800 px-4 py-3 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-950 border border-emerald-600/60 flex items-center justify-center text-emerald-400 shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white font-sans flex items-center gap-2">
                  Visor Editorial y Marcador de Páginas / PDF
                </h2>
                <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-600/50 text-emerald-300 text-xs font-bold">
                  {slotName}
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Observa el libro página a página y fija con un clic el inicio o fin exacto de la novela.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* Indicador de Límite Actual */}
            <div className="hidden md:flex items-center gap-2 text-xs bg-stone-900/80 px-3 py-1.5 rounded-xl border border-stone-800">
              <span className="text-emerald-400 font-bold">Inicio: Pág. {novelStartPage}</span>
              <span className="text-stone-600">•</span>
              <span className="text-purple-400 font-bold">Fin: Pág. {novelEndPage}</span>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              title="Cerrar visor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de Control, Navegación y Leyenda de Zonas */}
        <div className="bg-[#141920] border-b border-stone-800/80 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          
          {/* Navegación por Páginas */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleJumpToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed text-stone-200 font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <div className="flex items-center gap-1 font-mono text-stone-300 bg-stone-900 px-2 py-1 rounded-lg border border-stone-700">
              <span>Pág.</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleJumpToPage(parseInt(pageInput, 10) || 1);
                  }
                }}
                className="w-12 bg-transparent text-center font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
              />
              <span>/ {totalPages}</span>
            </div>

            <button
              onClick={() => handleJumpToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed text-stone-200 font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Accesos Rápidos: Ir al Inicio e Ir al Fin */}
            <button
              onClick={() => handleJumpToPage(novelStartPage)}
              className="px-2 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 font-bold flex items-center gap-1 transition cursor-pointer ml-1"
              title="Saltar a la página de inicio"
            >
              <Bookmark className="w-3 h-3 text-emerald-400" />
              <span>Ir a Inicio (Pág. {novelStartPage})</span>
            </button>

            <button
              onClick={() => handleJumpToPage(novelEndPage)}
              className="px-2 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300 font-bold flex items-center gap-1 transition cursor-pointer"
              title="Saltar a la página de desenlace"
            >
              <Flag className="w-3 h-3 text-purple-400" />
              <span>Ir a Fin (Pág. {novelEndPage})</span>
            </button>
          </div>

          {/* Modos de Vista y Tamaño de Fuente */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-stone-900 p-0.5 rounded-lg border border-stone-800">
              <button
                onClick={() => setViewMode('single')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  viewMode === 'single' ? 'bg-stone-700 text-white' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                Página por Página
              </button>
              <button
                onClick={() => setViewMode('continuous')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  viewMode === 'continuous' ? 'bg-stone-700 text-white' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                Todas las Páginas
              </button>
            </div>

            <button
              onClick={() => setFontSize(prev => prev === 'normal' ? 'large' : 'normal')}
              className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 font-bold cursor-pointer transition"
              title="Cambiar tamaño de letra"
            >
              {fontSize === 'normal' ? 'A+' : 'A-'}
            </button>
          </div>
        </div>

        {/* Barra Flotante de Selección Manual con Cursor */}
        {selectedSnippet && (
          <div className="bg-gradient-to-r from-amber-950 via-stone-900 to-amber-950 border-b-2 border-amber-500/80 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg animate-in slide-in-from-top-1 z-30">
            <div className="flex items-center gap-2 max-w-xl">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-stone-950 font-extrabold uppercase text-[10px] tracking-wider shrink-0 shadow-xs">
                Texto Seleccionado
              </span>
              <p className="font-sans italic text-amber-100 text-xs truncate">
                «{selectedSnippet.text}»
              </p>
              <span className="text-[10px] text-amber-400 font-mono shrink-0">
                ({selectedSnippet.text.length} car.)
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={() => handleSetStartFromSelection(selectedSnippet.text, selectedSnippet.pageNumber)}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
                title="Fijar esta selección exacta como el inicio del libro (incluso si está pegada a otro texto en el PDF)"
              >
                <Bookmark className="w-3.5 h-3.5 fill-current" />
                <span>Fijar como INICIO [▶]</span>
              </button>

              <button
                onClick={() => handleSetEndFromSelection(selectedSnippet.text, selectedSnippet.pageNumber)}
                className="px-3 py-1.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
                title="Fijar esta selección exacta como el fin del libro (incluso si está pegada a otro texto en el PDF)"
              >
                <Flag className="w-3.5 h-3.5 fill-current" />
                <span>Fijar como FIN [⏹]</span>
              </button>

              <button
                onClick={() => setSelectedSnippet(null)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
                title="Descartar selección"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Notificación Flotante de Retroalimentación Inmediata */}
        {feedback && (
          <div className="bg-emerald-600 text-stone-950 px-4 py-2 text-xs font-extrabold flex items-center justify-between shrink-0 shadow-md animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-stone-950" />
              <span>{feedback}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="font-bold hover:opacity-80">✕</button>
          </div>
        )}

        {/* Área de Lectura y Visualización de Páginas */}
        <div 
          ref={scrollContainerRef}
          onMouseUp={() => handleMouseUpSelection(currentPage)}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#080b0e] select-text"
        >
          {viewMode === 'single' ? (
            currentPageObj ? (
              renderSinglePage(currentPageObj)
            ) : (
              <p className="text-center text-stone-500 py-12">No hay páginas disponibles.</p>
            )
          ) : (
            pagesList.map(p => renderSinglePage(p))
          )}
        </div>

        {/* Pie de Página con Leyenda Visual Clara */}
        <div className="bg-[#10141a] border-t border-stone-800 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 text-[11px] text-stone-400">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500 inline-block" />
              <span>Amarillo: Preliminares / Fuera de la obra (Págs. 1 a {novelStartPage - 1})</span>
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500 inline-block" />
              <span>Verde: Cuerpo de la novela (Págs. {novelStartPage} a {novelEndPage})</span>
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500 inline-block" />
              <span>Amarillo: Colofón / Fuera de la obra (Págs. {novelEndPage + 1} a {totalPages})</span>
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-extrabold rounded-xl transition cursor-pointer"
          >
            Listo / Aplicar Límites
          </button>
        </div>

      </div>
    </div>
  );
};
