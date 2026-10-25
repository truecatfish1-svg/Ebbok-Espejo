import React, { useState } from 'react';
import { useSape } from '../context/SapeContext';
import { 
  BookOpen, 
  CheckCircle2, 
  Sparkles, 
  Layers, 
  ArrowRight, 
  AlertCircle, 
  FileText, 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  Info,
  Check,
  RefreshCw,
  Eye,
  Bookmark,
  Search,
  Flag,
  FastForward,
  X
} from 'lucide-react';
import type { BookEndpointInspection, PageDetailAnalysis } from '../types';
import { VisualDocumentReaderModal } from './VisualDocumentReaderModal';

interface BookStructureAnalysisCardProps {
  audit?: BookEndpointInspection | null;
  onCurateNow?: () => void;
  onReAuditWithAi?: () => void;
  onAdjustBoundary?: (type: 'start' | 'end', delta: number) => void;
  onSetPageBoundary?: (type: 'start' | 'end', pageNumber: number) => void;
  onSearchAndSetBoundary?: (type: 'start' | 'end', phrase: string) => void;
  onSetExactTextBoundary?: (type: 'start' | 'end', selectedText: string, pageNumber?: number) => void;
  fullExtractedText?: string;
  pdfPages?: { pageNumber: number; text: string }[];
  slotName?: string;
  showProceedButtons?: boolean;
}

export const BookStructureAnalysisCard: React.FC<BookStructureAnalysisCardProps> = ({
  audit: propAudit,
  onCurateNow,
  onReAuditWithAi,
  onAdjustBoundary,
  onSetPageBoundary,
  onSearchAndSetBoundary,
  onSetExactTextBoundary,
  fullExtractedText,
  pdfPages,
  slotName,
  showProceedButtons = true
}) => {
  const { 
    singleBookAudit, 
    curateAndCleanEntireBook, 
    runMiniAiStartCheck, 
    isProcessing, 
    isEbookPurified, 
    setActiveTab,
    metadata 
  } = useSape();

  const audit = propAudit || singleBookAudit;
  const [showSubsequentParas, setShowSubsequentParas] = useState(false);
  const [showPageMap, setShowPageMap] = useState(false);
  const [showVisualReader, setShowVisualReader] = useState(false);
  const [selectedPage, setSelectedPage] = useState<PageDetailAnalysis | null>(null);
  const [appliedFeedback, setAppliedFeedback] = useState<string | null>(null);
  const [cardSelectedSnippet, setCardSelectedSnippet] = useState<{ text: string; pageNumber?: number } | null>(null);
  const [showParagraphExplorer, setShowParagraphExplorer] = useState(false);

  // Estados del Buscador Interactivo de Frases en el PDF
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    snippet: string;
    pageNumber?: number;
    rawText: string;
  }[]>([]);

  if (!audit) return null;

  const pageStructure = audit.pageStructure;
  const posterior = pageStructure?.posteriorContinuity;
  const pagesAnalysis = pageStructure?.pagesAnalysis || [];

  const novelStartPage = pageStructure?.novelStartPage || 1;
  const novelEndPage = pageStructure?.novelEndPage || (pageStructure?.totalPages || pagesAnalysis.length || 1);

  const handleCurate = () => {
    if (onCurateNow) {
      onCurateNow();
    } else {
      curateAndCleanEntireBook();
    }
  };

  const handleTriggerAiAudit = () => {
    if (onReAuditWithAi) {
      onReAuditWithAi();
    } else {
      runMiniAiStartCheck();
    }
  };

  const executePdfSearch = (query: string) => {
    setSearchQuery(query);
    const cleanQ = query.trim().toLowerCase();
    if (!cleanQ || cleanQ.length < 3) {
      setSearchResults([]);
      return;
    }

    const sourceText = fullExtractedText || audit.pureBodyText || '';
    const paras = sourceText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    const results: { snippet: string; pageNumber?: number; rawText: string }[] = [];

    for (let i = 0; i < paras.length; i++) {
      const p = paras[i];
      if (p.toLowerCase().includes(cleanQ)) {
        // Encontrar página correspondiente
        let pageNum: number | undefined = undefined;
        if (pdfPages && pdfPages.length > 0) {
          const matchPage = pdfPages.find(pp => pp.text.toLowerCase().includes(cleanQ));
          if (matchPage) pageNum = matchPage.pageNumber;
        } else if (pagesAnalysis && pagesAnalysis.length > 0) {
          const matchPage = pagesAnalysis.find(pa => pa.snippet.toLowerCase().includes(cleanQ.slice(0, 20)));
          if (matchPage) pageNum = matchPage.pageNumber;
        }

        results.push({
          snippet: p.length > 180 ? p.slice(0, 180) + '...' : p,
          rawText: p,
          pageNumber: pageNum
        });
        if (results.length >= 8) break;
      }
    }
    setSearchResults(results);
  };

  const getCategoryBadge = (p: PageDetailAnalysis) => {
    const pageNum = p.pageNumber;
    if (pageNum === novelStartPage && pageNum === novelEndPage) {
      return <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-300 text-[10px] font-bold border border-emerald-500/50">▶ INICIO Y FIN</span>;
    }
    if (pageNum === novelStartPage) {
      return <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-300 text-[10px] font-bold border border-emerald-500/50">▶ INICIO DE NOVELA</span>;
    }
    if (pageNum === novelEndPage) {
      return <span className="px-2 py-0.5 rounded bg-purple-500/30 text-purple-300 text-[10px] font-bold border border-purple-500/50">⏹ FIN DE NOVELA</span>;
    }
    if (pageNum < novelStartPage) {
      return <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/30">Preliminar (Descartado - Amarillo)</span>;
    }
    if (pageNum > novelEndPage) {
      return <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/30">Colofón / Final (Descartado - Amarillo)</span>;
    }
    return <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30">Cuerpo de la Novela (Verde)</span>;
  };

  // ZONIFICACIÓN CONTIGUA ESTRICTA:
  // Antes de novelStartPage: TODO AMARILLO.
  // Entre novelStartPage y novelEndPage: TODO VERDE.
  // Después de novelEndPage: TODO AMARILLO.
  const getPageColorClass = (p: PageDetailAnalysis) => {
    const pageNum = p.pageNumber;
    if (pageNum === novelStartPage && pageNum === novelEndPage) {
      return 'bg-emerald-600 text-white font-extrabold ring-2 ring-emerald-400 ring-offset-1 ring-offset-stone-900 shadow-md';
    }
    if (pageNum === novelStartPage) {
      return 'bg-emerald-600 text-white font-extrabold ring-2 ring-emerald-400 ring-offset-1 ring-offset-stone-900 shadow-md';
    }
    if (pageNum === novelEndPage) {
      return 'bg-emerald-500 text-stone-950 font-extrabold ring-2 ring-purple-400 ring-offset-1 ring-offset-stone-900 shadow-md';
    }
    if (pageNum < novelStartPage) {
      return 'bg-amber-950/70 text-amber-200 border border-amber-600/50 hover:bg-amber-900/80';
    }
    if (pageNum > novelEndPage) {
      return 'bg-amber-950/70 text-amber-300/80 border border-amber-700/40 hover:bg-amber-900/80';
    }
    return 'bg-emerald-950/70 text-emerald-200 border border-emerald-700/60 hover:bg-emerald-900/80';
  };

  return (
    <div className="bg-[#101317] border border-stone-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Cabecera del Análisis de Páginas y Estructura */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-900/60 border border-emerald-600/50 flex items-center justify-center text-emerald-400 shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-stone-100 font-sans">
                Auditoría Integral de Páginas y Límites Editoriales {slotName ? `(${slotName})` : ''}
              </h3>
              {audit.isCleanNovelBody && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                  <CheckCircle2 className="w-3 h-3" />
                  Estructura Canónica
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-400">
              Análisis completo de preliminares, inicio narrativo y análisis posterior automático.
            </p>
          </div>
        </div>

        {/* Botones de Comprobación con IA y Búsqueda en PDF */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowVisualReader(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 active:scale-95 text-stone-950 font-extrabold rounded-xl text-xs shadow-md transition cursor-pointer"
            title="Abrir el visor interactivo de páginas del PDF con marcadores visuales de inicio y fin"
          >
            <Eye className="w-3.5 h-3.5 text-stone-950" />
            <span>Ver PDF / Marcar Visualmente</span>
          </button>

          <button
            onClick={() => setShowSearchModal(!showSearchModal)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#171d24] hover:bg-[#1f2730] border border-stone-700 text-stone-200 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            title="Buscar cualquier frase en el documento para fijarla manualmente como inicio o fin"
          >
            <Search className="w-3.5 h-3.5 text-sky-400" />
            <span>Buscar en PDF</span>
          </button>

          <button
            onClick={handleTriggerAiAudit}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/70 hover:bg-purple-900 border border-purple-700/60 text-purple-200 rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
            title="Supervisión filológica exhaustiva con Gemini Flash para ubicar el inicio y desenlace exactos de la obra"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Supervisión IA (Flash)</span>
          </button>
        </div>
      </div>

      {/* Cartel de Certeza de Límites Aplicados */}
      {appliedFeedback && (
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 text-xs font-bold shadow-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{appliedFeedback}</span>
          </div>
          <button
            onClick={() => setAppliedFeedback(null)}
            className="text-stone-400 hover:text-white px-2 py-0.5 rounded text-xs transition"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cajón de Búsqueda y Marcado Manual de Frases en el PDF */}
      {showSearchModal && (
        <div className="bg-[#12161b] border-2 border-sky-600/40 rounded-xl p-3.5 space-y-3 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-stone-100">
                Buscador y Marcador Manual de Extremos en el PDF
              </span>
            </div>
            <button
              onClick={() => setShowSearchModal(false)}
              className="p-1 text-stone-400 hover:text-stone-200 rounded transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-stone-400 leading-relaxed">
            Escribe cualquier frase (ej. primera frase de la historia, frase final o título de capítulo) para localizarla en las páginas y marcarla directamente como Inicio o Fin de la novela.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => executePdfSearch(e.target.value)}
              placeholder="Escribe frase a buscar (ej: El coleccionista, Capítulo 1, etc.)..."
              className="flex-1 bg-[#0b0e11] border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500"
            />
            {searchQuery && (
              <button
                onClick={() => executePdfSearch('')}
                className="text-[10px] text-stone-400 hover:text-stone-200 px-2 py-1 bg-stone-800 rounded"
              >
                Limpiar
              </button>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {searchResults.map((res, idx) => (
                <div key={idx} className="bg-[#0b0e11] border border-stone-800 p-2.5 rounded-lg text-xs space-y-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/40">
                      {res.pageNumber ? `Página ${res.pageNumber}` : `Resultado #${idx + 1}`}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {searchQuery.trim().length >= 3 && (
                        <button
                          onClick={() => {
                            if (onSetExactTextBoundary) {
                              onSetExactTextBoundary('end', searchQuery.trim(), res.pageNumber);
                            } else if (onSearchAndSetBoundary) {
                              onSearchAndSetBoundary('end', searchQuery.trim());
                            }
                            setAppliedFeedback(`✓ Fin fijado exactamente en la frase buscada: «${searchQuery.trim()}». La obra termina aquí (retroactivo: se toma de aquí hacia atrás, lo posterior queda descartado).`);
                            setShowSearchModal(false);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-700 hover:bg-purple-600 text-white text-[10px] font-extrabold cursor-pointer transition shadow-xs"
                          title="Fija el desenlace exactamente en la frase buscada. Todo lo posterior en el párrafo o libro se descarta (amarillo)."
                        >
                          <Flag className="w-3 h-3 text-white" />
                          <span>Fijar Fin en Frase Exacta [⏹]</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (onSetExactTextBoundary) {
                            onSetExactTextBoundary('start', res.rawText, res.pageNumber);
                          } else if (onSearchAndSetBoundary) {
                            onSearchAndSetBoundary('start', res.rawText);
                          }
                          setAppliedFeedback(`Párrafo fijado como Inicio exacto de la novela.`);
                          setShowSearchModal(false);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-[10px] font-bold cursor-pointer transition"
                        title="Fijar este párrafo completo como el inicio de la novela"
                      >
                        <Bookmark className="w-3 h-3 text-emerald-400" />
                        <span>Fijar como Inicio</span>
                      </button>
                      <button
                        onClick={() => {
                          if (onSetExactTextBoundary) {
                            onSetExactTextBoundary('end', res.rawText, res.pageNumber);
                          } else if (onSearchAndSetBoundary) {
                            onSearchAndSetBoundary('end', res.rawText);
                          }
                          setAppliedFeedback(`Párrafo fijado como Fin exacto de la novela. Todo lo posterior se descarta.`);
                          setShowSearchModal(false);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300 text-[10px] font-bold cursor-pointer transition"
                        title="Fijar este párrafo completo como el fin de la novela"
                      >
                        <Flag className="w-3 h-3 text-purple-400" />
                        <span>Fijar Párrafo como Fin</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-stone-300 font-sans italic text-[11px] leading-relaxed">
                    «{res.snippet}»
                  </p>
                </div>
              ))}
            </div>
          )}
          {searchQuery && searchResults.length === 0 && (
            <p className="text-[11px] text-stone-500 italic">
              No se encontraron coincidencias para "{searchQuery}". Intenta con menos palabras.
            </p>
          )}
        </div>
      )}

      {/* Grid de Resumen Estadístico y Distribución */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-[#14181d] border border-stone-800 p-3 rounded-xl">
          <span className="text-[10px] text-stone-400 font-medium block">Páginas Totales</span>
          <span className="text-base font-bold text-stone-100 font-mono">
            {pageStructure?.totalPages || pagesAnalysis.length || '—'}
          </span>
          <span className="text-[10px] text-emerald-400 block mt-0.5">
            {audit.totalParagraphs} párrafos • {audit.totalWords.toLocaleString()} pal.
          </span>
        </div>

        <div className="bg-[#14181d] border border-stone-800 p-3 rounded-xl">
          <span className="text-[10px] text-stone-400 font-medium block">Págs. Preliminares</span>
          <span className="text-base font-bold text-amber-300 font-mono">
            {pageStructure?.frontMatterPages || 'Aisladas'}
          </span>
          <span className="text-[10px] text-stone-400 block mt-0.5 line-clamp-1">
            {audit.hasPreface ? `Prefacio (${audit.prefaceWords} pal.)` : 'Portadilla & Créditos'}
          </span>
        </div>

        <div className="bg-[#14181d] border border-stone-800 p-3 rounded-xl">
          <span className="text-[10px] text-stone-400 font-medium block">Inicio Novela</span>
          <span className="text-base font-bold text-emerald-300 font-mono">
            Pág. {pageStructure?.novelStartPage || 1}
          </span>
          <span className="text-[10px] text-emerald-400 block mt-0.5">
            {audit.detectedChapters?.[0]?.label || 'Capítulo 1'}
          </span>
        </div>

        <div className="bg-[#14181d] border border-stone-800 p-3 rounded-xl">
          <span className="text-[10px] text-stone-400 font-medium block">Fin de Novela</span>
          <span className="text-base font-bold text-purple-300 font-mono">
            Pág. {pageStructure?.novelEndPage || pageStructure?.totalPages || 'Fin'}
          </span>
          <span className="text-[10px] text-stone-400 block mt-0.5 line-clamp-1">
            {pageStructure?.backMatterPages !== 'Ninguna' ? `Colofón (Pág ${pageStructure?.backMatterPages})` : 'Cierre limpio'}
          </span>
        </div>
      </div>

      {/* Tarjeta de Límites Editoriales Confirmados (Arranque y Desenlace con Ajuste Fino) */}
      <div className="bg-[#12161b] border border-stone-800/90 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-stone-200">
              Límites Editoriales Confirmados (Inicio y Desenlace)
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              Doble Supervisión: IA + Heurística Filológica
            </span>
          </div>

          {posterior && (
            <button
              onClick={() => setShowSubsequentParas(!showSubsequentParas)}
              className="text-[11px] text-stone-400 hover:text-stone-200 flex items-center gap-1 font-medium transition cursor-pointer"
            >
              <span>{showSubsequentParas ? 'Ocultar continuidad' : `Ver continuidad (+${posterior.evaluatedParagraphsCount - 1} párrafos)`}</span>
              {showSubsequentParas ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {posterior?.explanation && (
          <p className="text-xs text-stone-300/90 leading-relaxed bg-[#0b0e11] p-2.5 rounded-lg border border-stone-800/80">
            {posterior.explanation}
          </p>
        )}

        {/* Barra de Acción cuando el usuario subraya texto con el ratón */}
        {cardSelectedSnippet && (
          <div className="p-3 rounded-xl bg-gradient-to-r from-purple-950 via-stone-900 to-emerald-950 border-2 border-amber-400 flex flex-wrap items-center justify-between gap-2 text-xs shadow-xl animate-in fade-in sticky top-2 z-30">
            <div className="flex items-center gap-2 max-w-md truncate text-amber-200">
              <span className="font-extrabold uppercase text-[9px] bg-amber-500 text-stone-950 px-2 py-0.5 rounded shadow-xs">
                Texto Subrayado con Cursor
              </span>
              <span className="italic truncate font-sans text-stone-100">«{cardSelectedSnippet.text}»</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={() => {
                  if (onSetExactTextBoundary) {
                    onSetExactTextBoundary('start', cardSelectedSnippet.text, cardSelectedSnippet.pageNumber);
                  } else if (onSearchAndSetBoundary) {
                    onSearchAndSetBoundary('start', cardSelectedSnippet.text);
                  }
                  setAppliedFeedback(`✓ Inicio de novela fijado en: «${cardSelectedSnippet.text.slice(0, 45)}...»`);
                  setCardSelectedSnippet(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-extrabold cursor-pointer transition shadow-md flex items-center gap-1.5"
                title="Fijar desde esta frase en adelante como inicio estricto de la obra"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Fijar como Inicio [▶]</span>
              </button>
              <button
                onClick={() => {
                  if (onSetExactTextBoundary) {
                    onSetExactTextBoundary('end', cardSelectedSnippet.text, cardSelectedSnippet.pageNumber);
                  } else if (onSearchAndSetBoundary) {
                    onSearchAndSetBoundary('end', cardSelectedSnippet.text);
                  }
                  setAppliedFeedback(`✓ Fin fijado exactamente en esta frase. La obra concluye aquí y descarta todo lo posterior a amarillo.`);
                  setCardSelectedSnippet(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-extrabold cursor-pointer transition shadow-md flex items-center gap-1.5"
                title="Fijar exactamente en esta frase. Solo se toma desde aquí hacia atrás; lo posterior queda 100% descartado (amarillo)."
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Fijar como Fin [⏹] (Corte Milimétrico)</span>
              </button>
              <button
                onClick={() => setCardSelectedSnippet(null)}
                className="px-2 py-1 text-stone-400 hover:text-white transition cursor-pointer text-xs font-bold"
              >
                ✕ Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Muestra del Párrafo Inicial Exacto con Controles de Ajuste */}
        <div className="space-y-1 bg-[#0d1014] p-2.5 rounded-lg border border-stone-800">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
              Párrafo Inicial Confirmado (Arranque de la Historia):
            </span>
            {onAdjustBoundary && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-stone-400 mr-1">Ajuste manual:</span>
                <button
                  onClick={() => onAdjustBoundary('start', -5)}
                  className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 transition cursor-pointer"
                  title="Retroceder 5 párrafos hacia los preliminares"
                >
                  -5
                </button>
                <button
                  onClick={() => onAdjustBoundary('start', -1)}
                  className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 transition cursor-pointer"
                  title="Retroceder 1 párrafo (incorporar el párrafo previo como inicio)"
                >
                  -1 Párrafo
                </button>
                <button
                  onClick={() => onAdjustBoundary('start', 1)}
                  className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 transition cursor-pointer"
                  title="Avanzar 1 párrafo (omitir el párrafo actual y empezar en el siguiente)"
                >
                  +1 Párrafo
                </button>
                <button
                  onClick={() => onAdjustBoundary('start', 5)}
                  className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 transition cursor-pointer"
                  title="Avanzar 5 párrafos hacia adelante"
                >
                  +5
                </button>
              </div>
            )}
          </div>
          <div 
            onMouseUp={() => {
              const sel = window.getSelection()?.toString().trim();
              if (sel && sel.length >= 3) {
                setCardSelectedSnippet({ text: sel, pageNumber: audit.pageStructure?.novelStartPage });
              }
            }}
            className="text-xs text-stone-200 font-sans italic bg-emerald-950/20 border-l-2 border-emerald-500 pl-3 py-1.5 leading-relaxed rounded-r-lg select-text cursor-text"
            title="Puedes subrayar con el ratón cualquier frase para fijar el corte milimétrico"
          >
            «{audit.firstParagraphSnippet || audit.firstParagraph || 'Párrafo inicial identificado'}»
          </div>
        </div>

        {/* Muestra del Párrafo Final Exacto con Controles de Ajuste */}
        <div className="space-y-1 bg-[#0d1014] p-2.5 rounded-lg border border-stone-800">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
              Párrafo Final Confirmado (Desenlace Narrativo de la Novela):
            </span>
            {onAdjustBoundary && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-stone-400 mr-1">Ajuste manual:</span>
                <button
                  onClick={() => onAdjustBoundary('end', -5)}
                  className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 transition cursor-pointer"
                  title="Retroceder 5 párrafos"
                >
                  -5
                </button>
                <button
                  onClick={() => onAdjustBoundary('end', -1)}
                  className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 transition cursor-pointer"
                  title="Recortar el último párrafo (situar el desenlace 1 párrafo antes)"
                >
                  -1 Párrafo
                </button>
                <button
                  onClick={() => onAdjustBoundary('end', 1)}
                  className="px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 text-[10px] font-bold border border-emerald-700/60 transition cursor-pointer"
                  title="Extender 1 párrafo (incorporar el siguiente párrafo como desenlace)"
                >
                  +1 Párrafo
                </button>
                <button
                  onClick={() => onAdjustBoundary('end', 5)}
                  className="px-1.5 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 text-[10px] font-bold border border-emerald-700/60 transition cursor-pointer"
                  title="Extender 5 párrafos (recuperar páginas siguientes)"
                >
                  +5
                </button>
                <button
                  onClick={() => onAdjustBoundary('end', 10)}
                  className="px-1.5 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 text-[10px] font-bold border border-emerald-700/60 transition cursor-pointer"
                  title="Extender 10 párrafos (recuperar páginas siguientes)"
                >
                  +10
                </button>
                <button
                  onClick={() => onAdjustBoundary('end', 9999)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-200 text-[10px] font-bold border border-purple-700/60 transition cursor-pointer"
                  title="Extender la novela hasta el final absoluto del archivo"
                >
                  <FastForward className="w-3 h-3 text-purple-400" />
                  <span>Fin de Archivo</span>
                </button>
              </div>
            )}
          </div>
          <div 
            onMouseUp={() => {
              const sel = window.getSelection()?.toString().trim();
              if (sel && sel.length >= 3) {
                setCardSelectedSnippet({ text: sel, pageNumber: audit.pageStructure?.novelEndPage });
              }
            }}
            className="text-xs text-stone-200 font-sans italic bg-purple-950/20 border-l-2 border-purple-500 pl-3 py-1.5 leading-relaxed rounded-r-lg select-text cursor-text"
            title="Puedes subrayar con el ratón cualquier frase para fijar el corte milimétrico"
          >
            «{audit.lastParagraphSnippet || audit.lastParagraph || 'Párrafo final identificado'}»
          </div>
          {audit.lastParagraph && (
            <div className="flex items-center gap-1.5 text-[11px] text-purple-300 font-medium pl-1 pt-0.5">
              <span className="text-stone-400 font-semibold">Termina exactamente en:</span>
              <span className="font-sans italic font-bold text-purple-200 bg-purple-950/70 px-2 py-0.5 rounded border border-purple-700/60">
                «...{audit.lastParagraph.trim().split(/\s+/).slice(-8).join(' ')}»
              </span>
            </div>
          )}
        </div>

        {/* Botón para Abrir Explorador de Párrafos de Apertura y Cierre para Subrayar con Ratón */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowParagraphExplorer(!showParagraphExplorer)}
            className="w-full py-2 px-3 rounded-lg bg-[#0b0e11] hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white text-xs font-semibold flex items-center justify-between transition cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>Explorador de Párrafos de Apertura y Cierre (Subrayar con ratón para corte exacto)</span>
            </span>
            {showParagraphExplorer ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
          </button>

          {showParagraphExplorer && (
            <div className="mt-3 p-3 rounded-xl bg-[#080a0d] border border-stone-800 space-y-4 animate-in fade-in">
              {/* Primeros párrafos */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                  Primeros Párrafos del Documento (Selecciona frase para fijar Inicio):
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(fullExtractedText || audit.pureBodyText || '').split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean).slice(0, 8).map((pText, pI) => (
                    <div 
                      key={pI} 
                      onMouseUp={() => {
                        const sel = window.getSelection()?.toString().trim();
                        if (sel && sel.length >= 3) {
                          setCardSelectedSnippet({ text: sel, pageNumber: 1 });
                        }
                      }}
                      className="p-2.5 rounded-lg bg-[#0d1014] border border-stone-800/80 hover:border-emerald-600/50 space-y-1.5 select-text transition"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-mono text-stone-400">Párrafo #{pI + 1} ({pText.split(/\s+/).filter(Boolean).length} palabras)</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (onSetExactTextBoundary) {
                              onSetExactTextBoundary('start', pText, 1);
                            } else if (onSearchAndSetBoundary) {
                              onSearchAndSetBoundary('start', pText);
                            }
                            setAppliedFeedback(`Párrafo #${pI + 1} fijado como Inicio exacto.`);
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 font-bold border border-emerald-700/60 text-[10px] cursor-pointer"
                        >
                          Fijar Párrafo como Inicio [▶]
                        </button>
                      </div>
                      <p className="text-[11px] text-stone-300 font-sans italic leading-relaxed select-text">
                        «{pText}»
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Últimos párrafos */}
              <div className="space-y-2 border-t border-stone-800/80 pt-3">
                <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">
                  Últimos Párrafos del Documento (Selecciona frase para corte milimétrico de Fin):
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(() => {
                    const allP = (fullExtractedText || audit.pureBodyText || '').split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
                    const lastSlice = allP.slice(Math.max(0, allP.length - 8));
                    return lastSlice.map((pText, pI) => {
                      const realIdx = allP.length - lastSlice.length + pI + 1;
                      return (
                        <div 
                          key={pI} 
                          onMouseUp={() => {
                            const sel = window.getSelection()?.toString().trim();
                            if (sel && sel.length >= 3) {
                              setCardSelectedSnippet({ text: sel });
                            }
                          }}
                          className="p-2.5 rounded-lg bg-[#0d1014] border border-stone-800/80 hover:border-purple-600/50 space-y-1.5 select-text transition"
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-mono text-stone-400">Párrafo #{realIdx} ({pText.split(/\s+/).filter(Boolean).length} palabras)</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (onSetExactTextBoundary) {
                                  onSetExactTextBoundary('end', pText);
                                } else if (onSearchAndSetBoundary) {
                                  onSearchAndSetBoundary('end', pText);
                                }
                                setAppliedFeedback(`Párrafo #${realIdx} fijado como Fin exacto.`);
                              }}
                              className="px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-300 font-bold border border-purple-700/60 text-[10px] cursor-pointer"
                            >
                              Fijar Párrafo como Fin [⏹]
                            </button>
                          </div>
                          <p className="text-[11px] text-stone-300 font-sans italic leading-relaxed select-text">
                            «{pText}»
                          </p>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Acordeón de Párrafos Posteriores Evaluados */}
        {showSubsequentParas && posterior?.subsequentParagraphSnippets && posterior.subsequentParagraphSnippets.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-stone-800/80">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Comprobación de Continuidad: Párrafos subsiguientes analizados automáticamente
            </span>
            <div className="space-y-1.5">
              {posterior.subsequentParagraphSnippets.map((snip, idx) => (
                <div key={idx} className="bg-[#0e1115] border border-stone-800/80 rounded-lg p-2 text-xs text-stone-300 font-sans flex items-start gap-2">
                  <span className="text-[10px] font-mono text-stone-500 bg-stone-900 px-1.5 py-0.5 rounded shrink-0">
                    +{idx + 1}
                  </span>
                  <p className="italic leading-relaxed line-clamp-2">
                    «{snip}...»
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Barra de Mapeo Visual de Páginas (Expandible) */}
      {pagesAnalysis.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={() => setShowPageMap(!showPageMap)}
              className="text-stone-300 hover:text-white font-bold flex items-center gap-1.5 transition"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Mapa de Páginas del Libro ({pagesAnalysis.length} págs)</span>
              {showPageMap ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <div className="flex items-center gap-3 text-[10px] text-stone-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                Preliminares
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Cuerpo Novela
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-stone-500 inline-block" />
                Colofón
              </span>
            </div>
          </div>

          {showPageMap && (
            <div className="bg-[#0c0e12] border border-stone-800 rounded-xl p-3 space-y-3">
              <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-16 lg:grid-cols-20 gap-1.5 max-h-48 overflow-y-auto pr-1">
                {pagesAnalysis.map((p) => (
                  <button
                    key={p.pageNumber}
                    onClick={() => setSelectedPage(p)}
                    className={`h-8 rounded flex items-center justify-center text-[10px] font-mono transition cursor-pointer ${getPageColorClass(p)}`}
                    title={`Página ${p.pageNumber}: ${p.wordsCount} palabras (${p.category})`}
                  >
                    {p.pageNumber}
                  </button>
                ))}
              </div>

              {selectedPage && (() => {
                const pageText = (pdfPages && pdfPages.find(p => p.pageNumber === selectedPage.pageNumber)?.text) || selectedPage.snippet;
                const pageParas = pageText.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 5);

                return (
                  <div className="p-3 bg-[#14181e] border border-stone-700/80 rounded-xl text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-stone-200">
                        Página {selectedPage.pageNumber} • {selectedPage.wordsCount} palabras • {selectedPage.paragraphsCount} párrafos
                      </span>
                      {getCategoryBadge(selectedPage)}
                    </div>

                    {/* Botones de Página Completa */}
                    {onSetPageBoundary && (
                      <div className="flex items-center gap-2 pt-1 border-t border-stone-800/80 flex-wrap">
                        <button
                          onClick={() => {
                            onSetPageBoundary('start', selectedPage.pageNumber);
                            setAppliedFeedback(`Página ${selectedPage.pageNumber} fijada como Inicio.`);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                            selectedPage.isNovelStart 
                              ? 'bg-emerald-600 text-white cursor-default' 
                              : 'bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300'
                          }`}
                          title={`Fijar el arranque de la historia a partir de la página ${selectedPage.pageNumber}`}
                        >
                          <Bookmark className="w-3 h-3 text-emerald-400" />
                          <span>{selectedPage.isNovelStart ? 'Página de Inicio Actual' : `Fijar Toda la Pág. ${selectedPage.pageNumber} como Inicio`}</span>
                        </button>

                        <button
                          onClick={() => {
                            onSetPageBoundary('end', selectedPage.pageNumber);
                            setAppliedFeedback(`Página ${selectedPage.pageNumber} fijada como Fin (incluye toda la hoja).`);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                            selectedPage.isNovelEnd 
                              ? 'bg-purple-600 text-white cursor-default' 
                              : 'bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300'
                          }`}
                          title={`Fijar el desenlace de la historia al final de la página ${selectedPage.pageNumber}`}
                        >
                          <Flag className="w-3 h-3 text-purple-400" />
                          <span>{selectedPage.isNovelEnd ? 'Página de Fin Actual' : `Fijar Toda la Pág. ${selectedPage.pageNumber} como Fin`}</span>
                        </button>
                      </div>
                    )}

                    {/* Desglose Párrafo a Párrafo de la Hoja Seleccionada */}
                    <div className="pt-2 border-t border-stone-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-stone-300 uppercase tracking-wider block">
                          Selección Exacta por Párrafo o Cursor ({pageParas.length} párrafos):
                        </span>
                        <span className="text-[10px] text-stone-500 italic">
                          (Puedes seleccionar cualquier frase con el cursor)
                        </span>
                      </div>

                      {/* Barra de Selección por Cursor en el Card */}
                      {cardSelectedSnippet && (
                        <div className="p-2.5 rounded-lg bg-gradient-to-r from-purple-950 via-stone-900 to-purple-950 border-2 border-purple-500 flex flex-wrap items-center justify-between gap-2 text-xs shadow-md animate-in fade-in">
                          <div className="flex items-center gap-2 max-w-sm truncate text-purple-200">
                            <span className="font-extrabold uppercase text-[9px] bg-purple-600 text-white px-1.5 py-0.5 rounded shadow-xs">
                              Frase Marcada
                            </span>
                            <span className="italic truncate font-sans">«{cardSelectedSnippet.text}»</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                            <button
                              onClick={() => {
                                if (onSetExactTextBoundary) {
                                  onSetExactTextBoundary('start', cardSelectedSnippet.text, cardSelectedSnippet.pageNumber);
                                } else if (onSearchAndSetBoundary) {
                                  onSearchAndSetBoundary('start', cardSelectedSnippet.text);
                                }
                                setAppliedFeedback(`Inicio fijado en la frase seleccionada: «${cardSelectedSnippet.text.slice(0, 45)}...»`);
                                setCardSelectedSnippet(null);
                              }}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-stone-950 text-[10px] font-extrabold cursor-pointer transition shadow-xs"
                              title="Fijar desde esta frase en adelante como inicio de la obra"
                            >
                              Fijar Inicio [▶]
                            </button>
                            <button
                              onClick={() => {
                                if (onSetExactTextBoundary) {
                                  onSetExactTextBoundary('end', cardSelectedSnippet.text, cardSelectedSnippet.pageNumber);
                                } else if (onSearchAndSetBoundary) {
                                  onSearchAndSetBoundary('end', cardSelectedSnippet.text);
                                }
                                setAppliedFeedback(`✓ Fin fijado exactamente en esta frase. La obra termina aquí (retroactivo: se toma de aquí hacia atrás, descartando todo lo posterior del párrafo o libro).`);
                                setCardSelectedSnippet(null);
                              }}
                              className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-extrabold cursor-pointer transition shadow-xs"
                              title="Fijar exactamente en esta frase. Solo se toma desde aquí hacia atrás; lo posterior del párrafo queda 100% descartado (amarillo)."
                            >
                              Fijar FIN [⏹] (Corte Milimétrico)
                            </button>
                            <button
                              onClick={() => setCardSelectedSnippet(null)}
                              className="p-1 text-stone-400 hover:text-white transition cursor-pointer"
                              title="Descartar selección"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {pageParas.map((paraText, pIdx) => (
                          <div 
                            key={pIdx} 
                            onMouseUp={() => {
                              const sel = window.getSelection()?.toString().trim();
                              if (sel && sel.length >= 3) {
                                setCardSelectedSnippet({ text: sel, pageNumber: selectedPage.pageNumber });
                              }
                            }}
                            className="bg-[#0b0e11] border border-stone-800/90 p-2.5 rounded-lg space-y-1.5 select-text hover:border-stone-700 transition"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-[10px] font-mono text-stone-400 bg-stone-900 px-1.5 py-0.5 rounded border border-stone-800">
                                Párrafo #{pIdx + 1} de la Pág. {selectedPage.pageNumber}
                              </span>
                              {onSearchAndSetBoundary && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      if (onSetExactTextBoundary) {
                                        onSetExactTextBoundary('start', paraText, selectedPage.pageNumber);
                                      } else {
                                        onSearchAndSetBoundary('start', paraText);
                                      }
                                      setAppliedFeedback(`Párrafo #${pIdx + 1} de Pág. ${selectedPage.pageNumber} fijado como Inicio exacto de la novela.`);
                                    }}
                                    className="px-2 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
                                    title="Fijar este párrafo exacto como el inicio de la novela"
                                  >
                                    <Bookmark className="w-3 h-3 text-emerald-400" />
                                    <span>Fijar como Inicio</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (onSetExactTextBoundary) {
                                        onSetExactTextBoundary('end', paraText, selectedPage.pageNumber);
                                      } else {
                                        onSearchAndSetBoundary('end', paraText);
                                      }
                                      setAppliedFeedback(`Párrafo #${pIdx + 1} de Pág. ${selectedPage.pageNumber} fijado como Fin exacto (retroactivo: se toma hasta el desenlace y se descarta todo lo posterior a amarillo).`);
                                    }}
                                    className="px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
                                    title="Fijar este párrafo como el fin de la obra (retroactivo: toma hasta aquí y descarta lo posterior)"
                                  >
                                    <Flag className="w-3 h-3 text-purple-400" />
                                    <span>Fijar como Fin</span>
                                  </button>
                                </div>
                              )}
                            </div>
                            <p className="text-stone-300 font-sans italic text-[11px] leading-relaxed select-text">
                              «{paraText.length > 220 ? paraText.slice(0, 220) + '...' : paraText}»
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Botones de Acción Directa (sólo si showProceedButtons es true) */}
      {showProceedButtons && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-stone-800">
          <div className="flex items-center gap-2">
            {isEbookPurified ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-700/50">
                <Check className="w-4 h-4" />
                <span>Libro Curado: 0 Artefactos de Página y Guiones Soldados</span>
              </span>
            ) : (
              <span className="text-xs text-stone-400">
                Listo para segmentar preliminares y disolver marcas de página.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCurate}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-stone-950 font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Curar y Limpiar Libro Completo</span>
            </button>

            <button
              onClick={() => setActiveTab('curaduria')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-stone-800 hover:bg-stone-700 active:scale-[0.98] text-stone-200 font-bold rounded-xl text-xs border border-stone-700 transition"
            >
              <span>Ir al Paso 2</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          </div>
        </div>
      )}
      {/* Visor Visual Interactivo de Páginas y PDF */}
      <VisualDocumentReaderModal
        isOpen={showVisualReader}
        onClose={() => setShowVisualReader(false)}
        slotName={slotName || 'Libro'}
        fullExtractedText={fullExtractedText || audit.pureBodyText || ''}
        pdfPages={pdfPages}
        pageStructure={pageStructure}
        firstParagraph={audit.firstParagraph}
        lastParagraph={audit.lastParagraph}
        onSetPageBoundary={onSetPageBoundary}
        onSearchAndSetBoundary={onSearchAndSetBoundary}
        onSetExactTextBoundary={onSetExactTextBoundary}
      />
    </div>
  );
};
