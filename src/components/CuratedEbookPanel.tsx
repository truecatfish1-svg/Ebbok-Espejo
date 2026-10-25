import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSape } from '../context/SapeContext';
import { 
  Sparkles, 
  CheckCircle2, 
  ArrowRight, 
  RotateCw, 
  FileText, 
  ShieldCheck, 
  Columns, 
  Sliders, 
  Eye, 
  Edit3, 
  Layers, 
  Info,
  Check,
  AlertCircle,
  Tag,
  Bookmark,
  Languages,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Zap,
  Search,
  Upload,
  Download,
  Copy,
  Table,
  CheckCheck,
  Split,
  Combine,
  FileCheck,
  RotateCcw,
  ListOrdered,
  Plus,
  Trash2,
  Settings,
  X
} from 'lucide-react';
import { hasValidGeminiApiKey } from '../services/gemini';
import { 
  executePhase2UnifiedCurator,
  CanonicalChapterDiagnostic,
  CleanEbookChapter,
  ParallelQuartetBook,
  SubsegmentPairProposal,
  Phase2ProgressState,
  Phase2FullCuratorResult
} from '../utils/phase2CuratorEngine';
import { parseManualTableOfContents } from '../utils/novelCurator';
import { sanitizePageAndEditorialMarkers } from '../utils/chapterMirrorSynchronizer';
import type { PureMirrorHarmonizationResult } from '../utils/pureMirrorHarmonizer';

export const CuratedEbookPanel: React.FC = () => {
  const { 
    chunks,
    parallelConfig, 
    setParallelConfig,
    parallelSourceAText, 
    setParallelSourceAText,
    parallelSourceBText, 
    setParallelSourceBText,
    setActiveTab,
    isEbookPurified,
    setIsEbookPurified,
    shadowTextA_in_B,
    setShadowTextA_in_B,
    shadowTextB_in_A,
    setShadowTextB_in_A,
    setMirrorHarmonizationResult,
    mirrorHarmonizationResult
  } = useSape();

  // Estados de control de vista
  const [activeSubView, setActiveSubView] = useState<'resumen' | 'cuarteto' | 'subsegmentos' | 'ebooks'>('resumen');
  const [isProcessing, setIsProcessing] = useState(false);
  const [curatorResult, setCuratorResult] = useState<Phase2FullCuratorResult | null>(null);
  const [progress, setProgress] = useState<Phase2ProgressState>({
    macroPercent: 0,
    macroStage: 'Esperando inicio de curaduría',
    mesoChapter: 'Listo',
    microDetail: 'Presiona «Ejecutar Curaduría y Alineación Espejo» para iniciar.',
    recentLogs: []
  });

  // Filtros y búsquedas
  const [chapterFilter, setChapterFilter] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuartetSlot, setSelectedQuartetSlot] = useState<'A' | 'A_trans' | 'B' | 'B_trans'>('A');
  const [translationEngine, setTranslationEngine] = useState<'google_turbo' | 'gemini_macro'>('google_turbo');

  // Modal para subir / pegar traducción manual externa
  const [showUploadModal, setShowUploadModal] = useState<'A' | 'B' | null>(null);
  const [uploadText, setUploadText] = useState('');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Textos fuentes recibidos de Fase 1
  const rawTextA = parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.rawContent || '').join('\n\n') : '');
  const rawTextB = parallelSourceBText || '';

  const hasCachedTranslations = Boolean(shadowTextA_in_B && shadowTextA_in_B.length > 50 && shadowTextB_in_A && shadowTextB_in_A.length > 50);

  // Capítulos canónicos recibidos de Fase 1
  const canonicalChaptersFromPhase1 = useMemo(() => {
    if (parallelConfig.chapters && parallelConfig.chapters.length > 0) {
      return parallelConfig.chapters.map((c, idx) => ({
        number: c.number || idx + 1,
        title: (c.title || `Capítulo ${idx + 1}`).replace(/^#+\s*/, ''),
        pageNumber: c.pageNumber,
        pageNumberB: c.pageNumberB,
        startPhrase: c.startPhrase,
        startPhraseB: c.startPhraseB
      }));
    }
    return [];
  }, [parallelConfig.chapters]);

  // Estados para Gestor y Editor Manual de Capítulos / TOC en Fase 2
  const [showChapterConfigModal, setShowChapterConfigModal] = useState(false);
  const [showPasteTocModal, setShowPasteTocModal] = useState(false);
  const [manualTocText, setManualTocText] = useState('');
  const [editableChapters, setEditableChapters] = useState<Array<{
    number: number;
    title: string;
    startPhrase?: string;
    startPhraseB?: string;
    pageNumber?: number;
    pageNumberB?: number;
  }>>([]);

  const handleOpenChapterConfig = () => {
    let source: Array<{
      number: number;
      title: string;
      startPhrase?: string;
      startPhraseB?: string;
      pageNumber?: number;
      pageNumberB?: number;
    }> = [];

    if (canonicalChaptersFromPhase1.length > 0) {
      source = canonicalChaptersFromPhase1;
    } else if (parallelConfig.chapters && parallelConfig.chapters.length > 0) {
      source = parallelConfig.chapters.map((c, idx) => ({
        number: c.number || idx + 1,
        title: (c.title || `Capítulo ${idx + 1}`).replace(/^#+\s*/, ''),
        startPhrase: c.startPhrase,
        startPhraseB: c.startPhraseB,
        pageNumber: c.pageNumber,
        pageNumberB: c.pageNumberB
      }));
    } else if (curatorResult?.cleanChapters) {
      source = curatorResult.cleanChapters.map((ch, idx) => ({
        number: ch.chapterIndex || idx + 1,
        title: ch.title,
        startPhrase: ch.cleanParagraphsA.find(p => p.length > 25)?.slice(0, 100) || ch.cleanParagraphsA[0]?.slice(0, 100),
        startPhraseB: ch.cleanParagraphsB.find(p => p.length > 25)?.slice(0, 100) || ch.cleanParagraphsB[0]?.slice(0, 100)
      }));
    }

    setEditableChapters(source.length > 0 ? [...source] : [{ number: 1, title: 'Capítulo 1' }]);
    setShowChapterConfigModal(true);
  };

  const handleApplyManualTocInPhase2 = async () => {
    if (!manualTocText.trim()) return;
    const parsed = parseManualTableOfContents(manualTocText);
    const chs = parsed.filter(c => c.type === 'chapter' || !c.type);
    if (chs.length === 0) {
      setNoticeMessage('No se detectaron líneas de capítulo en el índice ingresado.');
      return;
    }
    const newChaps = chs.map((c, idx) => ({
      number: c.index || idx + 1,
      title: c.title,
      pageNumber: c.pageOrMarker ? parseInt(c.pageOrMarker, 10) : undefined
    }));

    setParallelConfig(prev => ({
      ...prev,
      chapters: newChaps.map(c => ({
        id: `chap_${c.number}`,
        number: c.number,
        title: c.title,
        level: 1,
        pageNumber: c.pageNumber
      }))
    }));

    setShowPasteTocModal(false);
    setManualTocText('');
    setNoticeMessage(`✓ Aplicando índice de ${newChaps.length} capítulos y re-segmentando la obra para Fase 3...`);
    await handleExecuteCurator(false, newChaps);
  };

  const handleSaveAndApplyEditedChapters = async () => {
    if (editableChapters.length === 0) return;
    const cleaned = editableChapters.map((c, idx) => ({
      ...c,
      number: idx + 1,
      title: c.title.trim() || `Capítulo ${idx + 1}`,
      startPhrase: sanitizePageAndEditorialMarkers(c.startPhrase || ''),
      startPhraseB: sanitizePageAndEditorialMarkers(c.startPhraseB || '')
    }));

    setParallelConfig(prev => ({
      ...prev,
      chapters: cleaned.map(c => ({
        id: `chap_${c.number}`,
        number: c.number,
        title: c.title,
        level: 1,
        startPhrase: c.startPhrase,
        startPhraseB: c.startPhraseB,
        pageNumber: c.pageNumber,
        pageNumberB: c.pageNumberB
      }))
    }));

    setShowChapterConfigModal(false);
    setNoticeMessage(`✓ Guardados ${cleaned.length} capítulos. Re-segmentando la obra para Fase 3...`);
    await handleExecuteCurator(false, cleaned);
  };

  // Ejecutar el pipeline unificado de Fase 2
  const handleExecuteCurator = async (
    forcePurge: boolean = false,
    customChapters?: Array<{
      number: number;
      title: string;
      startPhrase?: string;
      startPhraseB?: string;
      pageNumber?: number;
      pageNumberB?: number;
    }>
  ) => {
    if (!rawTextA && !rawTextB) {
      setNoticeMessage('No hay textos de novela disponibles para curar. Regresa a Fase 1.');
      return;
    }

    if (forcePurge) {
      setShadowTextA_in_B('');
      setShadowTextB_in_A('');
    }

    setIsProcessing(true);
    setNoticeMessage(null);

    try {
      const chaptersToWork = (customChapters && customChapters.length > 0)
        ? customChapters
        : canonicalChaptersFromPhase1;

      const result = await executePhase2UnifiedCurator({
        rawBodyA: rawTextA,
        rawBodyB: rawTextB,
        canonicalChapters: chaptersToWork,
        titleA: parallelConfig.titleA || 'Libro A',
        titleB: parallelConfig.titleB || 'Libro B',
        author: parallelConfig.author || '',
        languageA: parallelConfig.languageA || 'Español',
        languageB: parallelConfig.languageB || 'Original',
        preExistingShadowA_in_B: forcePurge ? '' : shadowTextA_in_B,
        preExistingShadowB_in_A: forcePurge ? '' : shadowTextB_in_A,
        translationEngine,
        forcePurgeCache: forcePurge,
        onProgress: (pState) => {
          setProgress(pState);
        }
      });

      setCuratorResult(result);

      // Actualizar SapeContext con los ebooks limpios y las traducciones espejo
      setParallelSourceAText(result.cleanEbookA);
      setParallelSourceBText(result.cleanEbookB);
      setShadowTextA_in_B(result.quartet.bookA_translatedToB);
      setShadowTextB_in_A(result.quartet.bookB_translatedToA);
      setIsEbookPurified(true);

      // Sincronizar parallelConfig con los capítulos limpios verificados preservando frases manuales sagradas
      setParallelConfig(prev => {
        const sourceMap = new Map((chaptersToWork || []).map(c => [c.number, c]));
        return {
          ...prev,
          chapters: result.cleanChapters.map((ch, idx) => {
            const orig = sourceMap.get(ch.chapterIndex) || prev.chapters?.find(c => c.number === ch.chapterIndex) || prev.chapters?.[idx];
            const fallbackA = ch.cleanParagraphsA.find(p => p.length > 25)?.slice(0, 100) || ch.cleanParagraphsA[0]?.slice(0, 100);
            const fallbackB = ch.cleanParagraphsB.find(p => p.length > 25)?.slice(0, 100) || ch.cleanParagraphsB[0]?.slice(0, 100);

            const origId = (orig && 'id' in orig && typeof orig.id === 'string') ? orig.id : `chap_${ch.chapterIndex}`;
            return {
              id: origId,
              number: ch.chapterIndex,
              title: ch.title || orig?.title || `Capítulo ${ch.chapterIndex}`,
              level: 1,
              startPhrase: orig?.startPhrase || fallbackA,
              startPhraseB: orig?.startPhraseB || fallbackB,
              pageNumber: orig?.pageNumber,
              pageNumberB: orig?.pageNumberB
            };
          })
        };
      });

      // Estructurar el resultado para Fase 3 basado estrictamente en capítulos canónicos
      const harmonizedCleanChapters: PureMirrorHarmonizationResult = {
        pureBodyA: result.cleanEbookA,
        pureBodyB: result.cleanEbookB,
        chapters: result.cleanChapters.map((ch, idx) => ({
          chapterIndex: ch.chapterIndex,
          titleA: ch.title,
          titleB: ch.title,
          paragraphsA: ch.cleanParagraphsA,
          paragraphsB: ch.cleanParagraphsB,
          initialCountA: ch.cleanParagraphsA.length,
          initialCountB: ch.cleanParagraphsB.length,
          finalCountA: ch.cleanParagraphsA.length,
          finalCountB: ch.cleanParagraphsB.length,
          splitsAppliedA: ch.softWrapsRepairedA,
          splitsAppliedB: ch.softWrapsRepairedB,
          fusionsAppliedA: 0,
          fusionsAppliedB: 0,
          isomorphic: ch.cleanParagraphsA.length === ch.cleanParagraphsB.length,
          coherenceScore: result.chaptersDiagnostics[idx]?.initialConcordanceScore || 85
        })),
        totalParagraphsA: result.globalStats.totalParasA,
        totalParagraphsB: result.globalStats.totalParasB,
        totalSplitsA: 0,
        totalSplitsB: 0,
        totalFusionsA: 0,
        totalFusionsB: 0,
        globalRhythmScore: result.globalStats.globalConcordancePercent,
        breaksApplied: [],
        concludingMirrorMatch: {
          matched: true,
          endSnippetA: result.cleanEbookA.slice(-60),
          endSnippetB: result.cleanEbookB.slice(-60),
          confidenceScore: 95
        }
      };

      setMirrorHarmonizationResult(harmonizedCleanChapters);
      setNoticeMessage(`✓ Curaduría y Cuarteto completados exitosamente (${result.cleanChapters.length} capítulos). Concordancia: ${result.globalStats.globalConcordancePercent}%.`);
    } catch (err: any) {
      console.error('Error ejecutando Fase 2:', err);
      setNoticeMessage(`Ocurrió un error en la curaduría: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Despacho oficial a Fase 3
  const handleProceedToPhase3 = () => {
    setActiveTab('paralelo');
  };

  // Carga de archivo traducido externamente por el usuario (si usó Google Translate / Docs fuera)
  const handleApplyImportedTranslation = () => {
    if (!uploadText.trim() || !showUploadModal) return;

    if (showUploadModal === 'A') {
      // Es Libro A traducido a idioma B
      setShadowTextA_in_B(uploadText.trim());
      if (curatorResult) {
        setCuratorResult({
          ...curatorResult,
          quartet: {
            ...curatorResult.quartet,
            bookA_translatedToB: uploadText.trim(),
            translationSource: 'user_imported'
          }
        });
      }
      setNoticeMessage('✓ Traducción de Libro A importada correctamente.');
    } else {
      // Es Libro B traducido a idioma A
      setShadowTextB_in_A(uploadText.trim());
      if (curatorResult) {
        setCuratorResult({
          ...curatorResult,
          quartet: {
            ...curatorResult.quartet,
            bookB_translatedToA: uploadText.trim(),
            translationSource: 'user_imported'
          }
        });
      }
      setNoticeMessage('✓ Traducción de Libro B importada correctamente.');
    }

    setShowUploadModal(null);
    setUploadText('');
  };

  // Subsegmentos filtrados por capítulo y búsqueda
  const filteredProposals = useMemo(() => {
    if (!curatorResult) return [];
    let list = curatorResult.subsegmentProposals;

    if (chapterFilter !== 'ALL') {
      list = list.filter(p => p.chapterIndex === chapterFilter);
    }

    if (searchQuery.trim().length >= 2) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.textA.toLowerCase().includes(q) || p.textB.toLowerCase().includes(q));
    }

    return list;
  }, [curatorResult, chapterFilter, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-in fade-in">
      {/* 1. ENCABEZADO Y PROPÓSITO EDITORIAL DE FASE 2 */}
      <div className="bg-[#0e1318] border border-stone-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-3 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Fase 2: Curaduría Editorial & Cuarteto Paralelo</span>
              </span>
              <span className="text-xs text-stone-400">• Marco Canónico por Capítulos</span>
            </div>
            <h2 className="text-xl font-black text-white flex items-center gap-2.5">
              <BookOpen className="w-6 h-6 text-amber-400" />
              <span>Diagnóstico Estadístico, Limpieza Ebook y Cuarteto Espejo</span>
            </h2>
            <p className="text-xs text-stone-300 max-w-4xl leading-relaxed">
              En este proceso se analiza la concordancia estadística entre ambas obras delimitadas, se limpian oraciones cortadas por el PDF, y se construye el <strong>Cuarteto de 4 Libros</strong> mediante traducción turbo acelerada para proponer emparejamientos de subsegmentos con auditoría transparente antes de la Fase 3.
            </p>

            {/* Selector de Motor de Traducción y Estado de Caché */}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              <div className="flex items-center gap-2 bg-stone-900/90 px-3 py-1.5 rounded-xl border border-stone-800">
                <span className="text-stone-400 font-semibold">Motor de Traducción:</span>
                <select
                  value={translationEngine}
                  onChange={(e) => setTranslationEngine(e.target.value as any)}
                  disabled={isProcessing}
                  className="bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="google_turbo">⚡ Google Turbo por Lotes (0 Tokens - Gratuito)</option>
                  {hasValidGeminiApiKey() && (
                    <option value="gemini_macro">✨ Gemini 2.5 Flash (Documental Inmediato)</option>
                  )}
                </select>
              </div>

              {hasCachedTranslations && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs">
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Caché lista: {Math.round(shadowTextA_in_B.length / 1000)}k car. en A→B y {Math.round(shadowTextB_in_A.length / 1000)}k car. en B→A</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {hasCachedTranslations && (
              <button
                type="button"
                onClick={() => handleExecuteCurator(true)}
                disabled={isProcessing}
                className="px-3.5 py-3 rounded-2xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 hover:text-rose-300 font-bold text-xs transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                title="Borra las traducciones previas y regenera el cuarteto desde cero"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Purgar y re-traducir</span>
              </button>
            )}

            <button
              type="button"
              id="btn-run-phase2-curator"
              onClick={() => handleExecuteCurator(false)}
              disabled={isProcessing || (!rawTextA && !rawTextB)}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-stone-950 font-black text-xs shadow-lg transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              <Zap className={`w-4 h-4 ${isProcessing ? 'animate-spin' : 'text-stone-950'}`} />
              <span>
                {isProcessing 
                  ? 'Procesando Curaduría...' 
                  : hasCachedTranslations 
                  ? 'Continuar Curaduría (Reutilizar existente)' 
                  : curatorResult 
                  ? 'Re-ejecutar Curaduría Unificada' 
                  : 'Ejecutar Curaduría y Alineación Espejo'}
              </span>
            </button>

            {curatorResult && (
              <button
                type="button"
                onClick={handleProceedToPhase3}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-stone-950 font-black text-xs shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <span>Continuar a Fase 3 ▶</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Notificaciones y Alertas */}
        {noticeMessage && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
            <span className="font-medium">{noticeMessage}</span>
            <button
              type="button"
              onClick={() => setNoticeMessage(null)}
              className="text-stone-400 hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* BARRA DE PROGRESO DE 3 NIVELES (MACRO / MESO / MICRO) */}
        {isProcessing && (
          <div className="space-y-3 bg-[#0a0d11] p-4 rounded-2xl border border-amber-500/40 shadow-inner">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
              <span className="font-extrabold text-amber-300 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                <span>{progress.macroStage}</span>
              </span>
              <span className="font-mono font-bold text-amber-400">{progress.macroPercent}% Completado</span>
            </div>

            {/* Barra Macro */}
            <div className="w-full h-3 bg-stone-900 rounded-full overflow-hidden border border-stone-800 p-0.5">
              <div 
                className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, progress.macroPercent)}%` }}
              />
            </div>

            {/* Niveles Meso y Micro */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-1">
              <div className="bg-[#12161d] p-2.5 rounded-xl border border-stone-800 flex items-center gap-2 truncate">
                <span className="font-bold text-stone-400 shrink-0">Nivel Meso (Capítulo):</span>
                <span className="text-stone-200 font-semibold truncate">{progress.mesoChapter}</span>
              </div>
              <div className="bg-[#12161d] p-2.5 rounded-xl border border-stone-800 flex items-center gap-2 truncate">
                <span className="font-bold text-stone-400 shrink-0">Nivel Micro (Acción):</span>
                <span className="text-amber-200 font-mono truncate">{progress.microDetail}</span>
              </div>
            </div>

            {/* Caja de Registro en Vivo (Anti-Freeze Visual) */}
            {progress.recentLogs.length > 0 && (
              <div className="bg-[#05070a] p-2.5 rounded-xl border border-stone-900 font-mono text-[10px] text-stone-400 max-h-24 overflow-y-auto space-y-0.5">
                {progress.recentLogs.slice(-4).map((l, i) => (
                  <div key={i} className="truncate">{l}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. PANEL EJECUTIVO DE ESTADÍSTICAS Y CONCORDANCIA (TRAS COMPLETAR O CARGAR) */}
      {curatorResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-[#0e1318] border border-stone-800 p-4 rounded-2xl space-y-1">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Concordancia Global:</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-black ${curatorResult.globalStats.isOptimal ? 'text-emerald-400' : 'text-amber-400'}`}>
                {curatorResult.globalStats.globalConcordancePercent}%
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                curatorResult.globalStats.isOptimal ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}>
                {curatorResult.globalStats.isOptimal ? '✓ Óptimo (≥ 80%)' : 'Modo Asimétrico'}
              </span>
            </div>
            <p className="text-[10px] text-stone-400">Umbral crítico de concordancia superado.</p>
          </div>

          <div className="bg-[#0e1318] border border-stone-800 p-4 rounded-2xl space-y-1">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Marco Canónico:</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{curatorResult.globalStats.totalChapters}</span>
              <span className="text-xs text-stone-300 font-semibold">capítulos canónicos</span>
            </div>
            <p className="text-[10px] text-stone-400">
              A: {curatorResult.globalStats.totalParasA} párrafos • B: {curatorResult.globalStats.totalParasB} párrafos
            </p>
          </div>

          <div className="bg-[#0e1318] border border-stone-800 p-4 rounded-2xl space-y-1">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Cuarteto Paralelo:</span>
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>4 Libros Espejo Listos</span>
            </div>
            <p className="text-[10px] text-stone-400">
              Traducción {curatorResult.quartet.translationSource === 'user_imported' ? 'Importada' : 'Google Translate (0 Tokens)'}
            </p>
          </div>

          <div className="bg-[#0e1318] border border-stone-800 p-4 rounded-2xl space-y-1">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Subsegmentos Homólogos:</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-400">{curatorResult.subsegmentProposals.length}</span>
              <span className="text-xs text-stone-300 font-semibold">propuestas auditables</span>
            </div>
            <p className="text-[10px] text-stone-400">Emparejamientos párrafo a párrafo reversibles.</p>
          </div>
        </div>
      )}

      {/* 3. PESTAÑAS DE VISUALIZACIÓN Y AUDITORÍA TRANSPARENTE */}
      <div className="bg-[#0e1318] border border-stone-800 rounded-3xl p-5 space-y-4">
        {/* Selector de Pestaña de Fase 2 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 pb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveSubView('resumen')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
                activeSubView === 'resumen'
                  ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                  : 'bg-stone-900 text-stone-400 hover:text-white'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>1. Diagnóstico de Capítulos y Concordancia</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('cuarteto')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
                activeSubView === 'cuarteto'
                  ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                  : 'bg-stone-900 text-stone-400 hover:text-white'
              }`}
            >
              <Columns className="w-4 h-4" />
              <span>2. El Cuarteto Paralelo (4 Libros)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('subsegmentos')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
                activeSubView === 'subsegmentos'
                  ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                  : 'bg-stone-900 text-stone-400 hover:text-white'
              }`}
            >
              <CheckCheck className="w-4 h-4" />
              <span>3. Propuestas de Subsegmentos</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('ebooks')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
                activeSubView === 'ebooks'
                  ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                  : 'bg-stone-900 text-stone-400 hover:text-white'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>4. Ebooks Limpios (Texto Puro)</span>
            </button>
          </div>

          {/* Acciones de Traducción Externa */}
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowUploadModal('A')}
              className="px-2.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-700 cursor-pointer flex items-center gap-1.5 text-[11px]"
              title="Importar o pegar traducción completa de Libro A generada externamente"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>Subir Traducción A</span>
            </button>
            <button
              type="button"
              onClick={() => setShowUploadModal('B')}
              className="px-2.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-700 cursor-pointer flex items-center gap-1.5 text-[11px]"
              title="Importar o pegar traducción completa de Libro B generada externamente"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>Subir Traducción B</span>
            </button>
          </div>
        </div>

        {/* CONTENIDO DE PESTAÑA 1: DIAGNÓSTICO ESTADÍSTICO DE CAPÍTULOS */}
        {activeSubView === 'resumen' && (
          <div className="space-y-4">
            {/* Barra de Herramientas Canónicas de Capítulos e Índice */}
            <div className="bg-[#11151c] border border-stone-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center text-xs font-bold">
                    §
                  </span>
                  <h4 className="text-xs font-bold text-stone-100 uppercase tracking-wide">
                    Estructura de Capítulos e Índice Canónico
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 text-[10px] font-semibold border border-stone-700">
                    {canonicalChaptersFromPhase1.length > 0 
                      ? `${canonicalChaptersFromPhase1.length} capítulos registrados` 
                      : (curatorResult?.cleanChapters.length ? `${curatorResult.cleanChapters.length} capítulos auto-detectados` : 'Obra Continua')}
                  </span>
                </div>
                <p className="text-[11px] text-stone-400">
                  Los capítulos aquí configurados son respetados estrictamente en la partición y se transfieren íntegramente a Fase 3.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowPasteTocModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-200 border border-stone-700 text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition"
                  title="Pegar líneas del índice de la obra para re-segmentar capítulos"
                >
                  <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pegar Índice (TOC)</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenChapterConfig}
                  className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-200 border border-stone-700 text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition"
                  title="Configurar títulos y frases de inicio de cada capítulo"
                >
                  <Settings className="w-3.5 h-3.5 text-sky-400" />
                  <span>Configurar Capítulos</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExecuteCurator(false)}
                  disabled={isProcessing}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold cursor-pointer shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{curatorResult ? 'Re-ejecutar Curaduría' : 'Ejecutar Curaduría'}</span>
                </button>
              </div>
            </div>

            {!curatorResult ? (
              <div className="text-center py-10 space-y-3 bg-[#0a0d11] p-6 rounded-2xl border border-stone-800">
                <Table className="w-10 h-10 text-stone-600 mx-auto" />
                <h4 className="text-sm font-bold text-stone-200">Curaduría Editorial de Fase 2 Pendiente</h4>
                <p className="text-xs text-stone-400 max-w-md mx-auto">
                  Configura o pega el índice arriba si lo deseas, o presiona el botón «Ejecutar Curaduría» para procesar los capítulos, limpiar saltos de línea y generar el cuarteto de 4 libros.
                </p>
                <div className="pt-2 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleExecuteCurator(false)}
                    disabled={isProcessing}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs cursor-pointer shadow-md transition flex items-center gap-2"
                  >
                    <Zap className="w-4 h-4 text-stone-950" />
                    <span>Ejecutar Curaduría Ahora</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-stone-200">
                    Capítulos Canónicos Analizados ({curatorResult.chaptersDiagnostics.length} secciones de la obra):
                  </span>
                  <span className="text-[11px] text-stone-400">
                    Observación previa pura: cada capítulo opera dentro de su marco legítimo sin fragmentación errónea.
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-stone-800">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#12161d] border-b border-stone-800 text-[11px] text-stone-400 uppercase tracking-wider font-semibold">
                        <th className="py-2.5 px-3.5">#</th>
                        <th className="py-2.5 px-3.5">Capítulo Canónico</th>
                        <th className="py-2.5 px-3.5 text-center">Párrafos (A vs B)</th>
                        <th className="py-2.5 px-3.5 text-center">Palabras (A vs B)</th>
                        <th className="py-2.5 px-3.5 text-center">Ratio de Longitud</th>
                        <th className="py-2.5 px-3.5 text-center">Concordancia Inicial</th>
                        <th className="py-2.5 px-3.5 text-right">Diagnóstico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-850 font-mono text-xs">
                      {curatorResult.chaptersDiagnostics.map((diag) => (
                        <tr key={diag.chapterIndex} className="hover:bg-stone-900/50 transition">
                          <td className="py-3 px-3.5 font-bold text-amber-400">
                            #{diag.chapterIndex}
                          </td>
                          <td className="py-3 px-3.5 font-sans font-semibold text-stone-200 max-w-[240px] truncate" title={diag.canonicalTitle}>
                            {diag.canonicalTitle}
                          </td>
                          <td className="py-3 px-3.5 text-center text-stone-300">
                            A: {diag.paragraphsCountA} • B: {diag.paragraphsCountB}
                          </td>
                          <td className="py-3 px-3.5 text-center text-stone-400 text-[11px]">
                            {diag.wordsA.toLocaleString()} vs {diag.wordsB.toLocaleString()}
                          </td>
                          <td className="py-3 px-3.5 text-center text-stone-300">
                            {diag.lengthRatio}x
                          </td>
                          <td className="py-3 px-3.5 text-center font-bold">
                            <span className={diag.initialConcordanceScore >= 80 ? 'text-emerald-400' : 'text-amber-400'}>
                              {diag.initialConcordanceScore}%
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-right font-sans">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              diag.diagnosticStatus === 'optimal'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : diag.diagnosticStatus === 'moderate'
                                  ? 'bg-sky-950 text-sky-300 border border-sky-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}>
                              {diag.diagnosticStatus === 'optimal' ? '✓ Simétrico' : diag.diagnosticStatus === 'moderate' ? 'Aceptable' : 'Asimétrico'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO DE PESTAÑA 2: EL CUARTETO PARALELO (4 LIBROS SIN TOKENS) */}
        {activeSubView === 'cuarteto' && (
          <div className="space-y-4">
            {!curatorResult ? (
              <p className="text-stone-500 italic text-xs py-8 text-center">
                Ejecuta primero la curaduría para generar el cuarteto paralelo.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-stone-300 mr-1">Ver documento del Cuarteto:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedQuartetSlot('A')}
                      className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer text-xs ${
                        selectedQuartetSlot === 'A' ? 'bg-amber-500 text-stone-950 shadow' : 'bg-stone-900 text-stone-300 hover:text-white'
                      }`}
                    >
                      1. Libro A ({curatorResult.quartet.languageA})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedQuartetSlot('A_trans')}
                      className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer text-xs ${
                        selectedQuartetSlot === 'A_trans' ? 'bg-amber-500 text-stone-950 shadow' : 'bg-stone-900 text-stone-300 hover:text-white'
                      }`}
                    >
                      2. Libro A Traducido a {curatorResult.quartet.languageB}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedQuartetSlot('B')}
                      className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer text-xs ${
                        selectedQuartetSlot === 'B' ? 'bg-sky-500 text-stone-950 shadow' : 'bg-stone-900 text-stone-300 hover:text-white'
                      }`}
                    >
                      3. Libro B ({curatorResult.quartet.languageB})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedQuartetSlot('B_trans')}
                      className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer text-xs ${
                        selectedQuartetSlot === 'B_trans' ? 'bg-sky-500 text-stone-950 shadow' : 'bg-stone-900 text-stone-300 hover:text-white'
                      }`}
                    >
                      4. Libro B Traducido a {curatorResult.quartet.languageA}
                    </button>
                  </div>

                  <span className="text-[11px] text-stone-400">
                    Fuente: {curatorResult.quartet.translationSource === 'user_imported' ? 'Archivo Importado por Usuario' : 'Google Translate Web [0 Tokens]'}
                  </span>
                </div>

                {/* Visor del Documento Seleccionado */}
                <div className="bg-[#080b0f] p-4 rounded-2xl border border-stone-800 font-serif text-xs leading-relaxed text-stone-200 max-h-96 overflow-y-auto space-y-3 whitespace-pre-wrap select-text">
                  {(() => {
                    if (selectedQuartetSlot === 'A') return curatorResult.quartet.bookA_clean;
                    if (selectedQuartetSlot === 'A_trans') return curatorResult.quartet.bookA_translatedToB || 'Traducción no disponible.';
                    if (selectedQuartetSlot === 'B') return curatorResult.quartet.bookB_clean;
                    return curatorResult.quartet.bookB_translatedToA || 'Traducción no disponible.';
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO DE PESTAÑA 3: PROPUESTAS DE SUBSEGMENTOS AUDITABLES */}
        {activeSubView === 'subsegmentos' && (
          <div className="space-y-4">
            {!curatorResult ? (
              <p className="text-stone-500 italic text-xs py-8 text-center">
                Ejecuta primero la curaduría para calcular los subsegmentos de emparejamiento homólogo.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Filtros de subsegmentos */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-[#0b0e12] p-3 rounded-2xl border border-stone-800">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-400">Filtrar por Capítulo:</span>
                    <select
                      value={chapterFilter}
                      onChange={(e) => setChapterFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                      className="bg-[#12161d] border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="ALL">Todos los Capítulos ({curatorResult.subsegmentProposals.length} pares)</option>
                      {curatorResult.cleanChapters.map(c => (
                        <option key={c.chapterIndex} value={c.chapterIndex}>
                          Cap. #{c.chapterIndex}: {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-stone-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar en párrafos emparejados..."
                      className="flex-1 bg-[#12161d] border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Lista de Propuestas de Subsegmentos Lado a Lado */}
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {filteredProposals.length === 0 ? (
                    <p className="text-stone-500 italic text-xs py-6 text-center">
                      No se encontraron subsegmentos con los filtros actuales.
                    </p>
                  ) : (
                    filteredProposals.map((item) => (
                      <div 
                        key={item.id}
                        className="bg-[#090c10] border border-stone-800 hover:border-stone-700 p-3.5 rounded-2xl text-xs space-y-2.5 transition"
                      >
                        <div className="flex items-center justify-between pb-1 border-b border-stone-850 text-[10px] font-mono text-stone-400">
                          <span className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded bg-stone-800 text-stone-200 font-bold flex items-center justify-center">
                              {item.order}
                            </span>
                            <span>Capítulo #{item.chapterIndex}</span>
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold">
                              Tipo: {item.type}
                            </span>
                          </span>

                          <span className="flex items-center gap-2">
                            <span className={`font-bold ${item.concordanceScore >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              Concordancia: {item.concordanceScore}%
                            </span>
                            <span className="px-2 py-0.5 rounded bg-stone-800 text-stone-300 text-[9px] font-bold">
                              Propuesta Reversible
                            </span>
                          </span>
                        </div>

                        {/* Comparación enfrentada de párrafos A vs B */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-serif text-xs leading-relaxed">
                          <div className="p-2.5 rounded-xl bg-[#10141a] border border-stone-800/80 space-y-1">
                            <span className="text-[10px] font-sans font-bold text-amber-400/90 block">Libro A:</span>
                            <p className="text-stone-200 select-text whitespace-pre-wrap">{item.textA || <em className="text-stone-600 font-sans">Sin párrafo</em>}</p>
                          </div>
                          <div className="p-2.5 rounded-xl bg-[#10141a] border border-stone-800/80 space-y-1">
                            <span className="text-[10px] font-sans font-bold text-sky-400/90 block">Libro B:</span>
                            <p className="text-stone-200 select-text whitespace-pre-wrap">{item.textB || <em className="text-stone-600 font-sans">Sin párrafo</em>}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO DE PESTAÑA 4: EBOOKS LIMPIOS (TEXTO PURO) */}
        {activeSubView === 'ebooks' && (
          <div className="space-y-4">
            {!curatorResult ? (
              <p className="text-stone-500 italic text-xs py-8 text-center">
                Ejecuta primero la curaduría para visualizar los ebooks limpios.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#090c10] border border-stone-800 p-4 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                    <span className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-amber-400" />
                      <span>Ebook A Limpio ({curatorResult.globalStats.totalParasA} párrafos)</span>
                    </span>
                  </div>
                  <div className="max-h-80 overflow-y-auto font-serif text-xs text-stone-200 whitespace-pre-wrap select-text leading-relaxed p-2 bg-[#05070a] rounded-xl border border-stone-900">
                    {curatorResult.cleanEbookA}
                  </div>
                </div>

                <div className="bg-[#090c10] border border-stone-800 p-4 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                    <span className="font-bold text-sky-300 text-xs flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-sky-400" />
                      <span>Ebook B Limpio ({curatorResult.globalStats.totalParasB} párrafos)</span>
                    </span>
                  </div>
                  <div className="max-h-80 overflow-y-auto font-serif text-xs text-stone-200 whitespace-pre-wrap select-text leading-relaxed p-2 bg-[#05070a] rounded-xl border border-stone-900">
                    {curatorResult.cleanEbookB}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL PARA PEGAR ÍNDICE DE CONTENIDOS (TOC) EN FASE 2 */}
      {showPasteTocModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12161d] border border-stone-700 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-amber-400" />
                <span>Pegar Índice de Contenidos (TOC) para la Obra</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPasteTocModal(false)}
                className="text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Pega aquí el índice de capítulos de tu novela. El sistema detectará los títulos, números y páginas para re-segmentar la obra de inmediato sin alterar el texto.
            </p>

            <textarea
              value={manualTocText}
              onChange={(e) => setManualTocText(e.target.value)}
              placeholder={`Ejemplo:\nCapítulo 1 - La Llegada al Valle ... 12\nCapítulo 2 - El Encuentro ... 34\nCapítulo 3 - La Despedida ... 58`}
              rows={8}
              className="w-full p-3 bg-[#0a0d11] border border-stone-700 rounded-xl text-stone-100 placeholder-stone-600 font-mono text-xs focus:outline-none focus:border-amber-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPasteTocModal(false)}
                className="px-4 py-2 rounded-xl text-stone-400 hover:text-white text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyManualTocInPhase2}
                disabled={!manualTocText.trim() || isProcessing}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-stone-950 font-bold text-xs cursor-pointer shadow-md disabled:opacity-50 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Aplicar Índice y Re-segmentar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTOR Y EDITOR MANUAL DE CAPÍTULOS */}
      {showChapterConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12161d] border border-stone-700 rounded-3xl max-w-3xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800 shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-sky-400" />
                <h3 className="font-bold text-white text-sm">
                  Configuración y Editor de Capítulos Canónicos ({editableChapters.length} partes)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowChapterConfigModal(false)}
                className="text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-300 shrink-0">
              Edita el título o ajusta las frases de inicio de cada capítulo para Libro A y B. Al guardar, ambas obras se re-segmentan exactamente bajo estos cortes y se despachan a Fase 3.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {editableChapters.map((ch, idx) => (
                <div key={idx} className="bg-[#0b0e12] border border-stone-800 p-3 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="w-6 h-6 rounded-md bg-stone-800 text-amber-400 font-bold text-xs flex items-center justify-center shrink-0">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={ch.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditableChapters(prev => prev.map((c, i) => i === idx ? { ...c, title: val } : c));
                        }}
                        placeholder={`Título del Capítulo ${idx + 1}`}
                        className="flex-1 px-3 py-1.5 bg-[#141820] border border-stone-700 rounded-xl text-stone-100 font-semibold focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditableChapters(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-stone-500 hover:text-rose-400 transition cursor-pointer"
                      title="Eliminar este capítulo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <label className="text-stone-400 block mb-0.5">Frase de inicio Libro A (opcional):</label>
                      <input
                        type="text"
                        value={ch.startPhrase || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditableChapters(prev => prev.map((c, i) => i === idx ? { ...c, startPhrase: val } : c));
                        }}
                        placeholder="Ej. En un lugar de la mancha..."
                        className="w-full px-2.5 py-1 bg-[#141820] border border-stone-700/80 rounded-lg text-stone-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-stone-400 block mb-0.5">Frase de inicio Libro B (opcional):</label>
                      <input
                        type="text"
                        value={ch.startPhraseB || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditableChapters(prev => prev.map((c, i) => i === idx ? { ...c, startPhraseB: val } : c));
                        }}
                        placeholder="Ej. In a village of La Mancha..."
                        className="w-full px-2.5 py-1 bg-[#141820] border border-stone-700/80 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-stone-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setEditableChapters(prev => [
                    ...prev,
                    { number: prev.length + 1, title: `Capítulo ${prev.length + 1}` }
                  ]);
                }}
                className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-700 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>+ Agregar Capítulo</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowChapterConfigModal(false)}
                  className="px-4 py-2 rounded-xl text-stone-400 hover:text-white text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndApplyEditedChapters}
                  disabled={editableChapters.length === 0 || isProcessing}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-stone-950 font-bold text-xs cursor-pointer shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Guardar y Re-segmentar Ebooks</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL PARA SUBIR / PEGAR TRADUCCIÓN EXTERNA */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12161d] border border-stone-700 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-400" />
                <span>Importar Traducción Externa para Libro {showUploadModal}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(null)}
                className="text-stone-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Si tradujiste el archivo completo de Libro {showUploadModal} mediante Google Translate Docs (translate.google.com/?op=docs) o cualquier otra herramienta offline, pega aquí el texto completo para integrarlo al Cuarteto Paralelo con 0 tokens.
            </p>

            <textarea
              value={uploadText}
              onChange={(e) => setUploadText(e.target.value)}
              placeholder="Pega aquí el texto completo traducido..."
              rows={8}
              className="w-full p-3 bg-[#0a0d11] border border-stone-700 rounded-xl text-stone-100 placeholder-stone-500 font-mono text-xs focus:outline-none focus:border-amber-500"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUploadModal(null)}
                className="px-4 py-2 rounded-xl text-stone-400 hover:text-white text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyImportedTranslation}
                disabled={!uploadText.trim()}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs cursor-pointer shadow-md disabled:opacity-50"
              >
                Aplicar Traducción al Cuarteto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. DESPACHO INFERIOR A FASE 3 */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/80 via-[#10141a] to-emerald-950/80 border border-emerald-600/50 shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="space-y-1 text-xs">
          <h4 className="text-emerald-400 font-extrabold text-sm">
            {curatorResult ? '¿Curaduría y propuestas de emparejamiento listas?' : '¿Textos delimitados en Fase 1 listos?'}
          </h4>
          <p className="text-stone-300">
            {curatorResult
              ? `Se transferirán a Fase 3 los ${curatorResult.cleanChapters.length} capítulos canónicos limpios y el Cuarteto Paralelo con ${curatorResult.subsegmentProposals.length} subsegmentos auditables.`
              : 'Puedes ejecutar la curaduría unificada arriba antes de pasar a la alineación fina de Fase 3.'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleProceedToPhase3}
          disabled={!rawTextA && !rawTextB}
          className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-stone-950 font-black text-xs shadow-xl transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shrink-0"
        >
          <span>Continuar a Fase 3: Alineación Bilingüe Fina</span>
          <ArrowRight className="w-4 h-4 text-stone-950" />
        </button>
      </div>
    </div>
  );
};
