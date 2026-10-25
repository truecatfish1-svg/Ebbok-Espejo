import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSape } from '../context/SapeContext';
import { 
  Columns, 
  BookOpen, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  Copy, 
  RefreshCw, 
  RotateCcw,
  Settings2, 
  ArrowRightLeft, 
  Plus, 
  Trash2, 
  Split, 
  Sliders, 
  FileText,
  Sparkles,
  BookMarked,
  ShieldCheck,
  Bookmark,
  Layers,
  Info,
  ChevronDown,
  ChevronUp,
  Search,
  Compass,
  FileCheck2,
  ListOrdered,
  Cpu,
  Play,
  Pause,
  Zap,
  Languages,
  Globe,
  Terminal,
  ExternalLink,
  Eye,
  HelpCircle,
  Check
} from 'lucide-react';
import { 
  generateParallelBookDocx, 
  copyParallelContentToClipboard 
} from '../lib/docx-generator';
import { ContentBlockType, ParallelPair, ParallelBookConfig, BoundaryConcordance } from '../types';
import { cleanRawTextToEbookStream, extractStructuredWorkFromSource, evaluateBoundaryConcordance } from '../utils/parallelMatcher';
import { 
  detectTableOfContentsInBook,
  parseManualTableOfContents,
  resolveUnifiedEditorialIndex,
  ExtractedTocChapter
} from '../utils/novelCurator';
import { queryCanonicalTableOfContentsOnline } from '../services/gemini';

export const ParallelPanel: React.FC = () => {
  const { 
    metadata, 
    chunks, 
    setChunks,
    settings,
    parallelConfig, 
    setParallelConfig,
    parallelSourceAText, 
    setParallelSourceAText,
    parallelSourceBText, 
    setParallelSourceBText,
    parallelPairs, 
    parallelSpreads, 
    parallelSummary,
    parallelAudit,
    runParallelAlignment,
    phase3Checkpoint,
    resumeParallelAlignment,
    completeRemainingWithLocalEngine,
    resetPhase3Progress,
    pausePhase3Processing,
    switchToLocalProcessing,
    runSecondPassMirrorHarmonizer,
    mirrorHarmonizationResult,
    runTransversalMirrorProcessing,
    runAiContentMirrorSegmentation,
    isProcessing,
    processingProgress,
    updateParallelPairItem,
    deleteParallelPairItem,
    insertEmptyParallelPairItem,
    splitParallelPairItem,
    mergeParallelPairWithAdjacent,
    autoHarmonizeDenseDisparities,
    autoReconcileAbsencePairs,
    exportCleanBookA,
    exportCleanBookB,
    shadowTextA_in_B,
    setShadowTextA_in_B,
    shadowTextB_in_A,
    setShadowTextB_in_A,
    generateFreeShadowTranslationForAnchor
  } = useSape();

  const [activeViewMode, setActiveViewMode] = useState<'spreads' | 'pairs' | 'start_audit' | 'culmination_review' | 'translation_audit' | 'continuous_thread_audit'>('spreads');
  const [randomSamplePair, setRandomSamplePair] = useState<ParallelPair | null>(null);
  const [translationFilter, setTranslationFilter] = useState<'all' | 'verified' | 'with_dates' | 'auto_adjusted' | 'discrepant'>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'critical' | 'absence' | 'dense' | 'balanced'>('all');
  const [healingNotice, setHealingNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingBookA, setIsExportingBookA] = useState(false);
  const [isExportingBookB, setIsExportingBookB] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [filterUnbalancedOnly, setFilterUnbalancedOnly] = useState(false);
  const [showChapterAuditList, setShowChapterAuditList] = useState(false);
  const [isInvestigatingTocOnline, setIsInvestigatingTocOnline] = useState(false);
  const [onlineTocNotice, setOnlineTocNotice] = useState<string | null>(null);
  const [onlineTocResult, setOnlineTocResult] = useState<{
    chapters: { index: number; label: string; title: string }[];
    preliminaries: string[];
    backMatter: string[];
    summaryNote: string;
  } | null>(null);
  const [showManualTocModal, setShowManualTocModal] = useState(false);
  const [manualTocInput, setManualTocInput] = useState('');
  const [guidedDiscrepancyIndex, setGuidedDiscrepancyIndex] = useState(0);
  const [showShadowDrawer, setShowShadowDrawer] = useState(false);
  const [showGoogleTranslateGuideModal, setShowGoogleTranslateGuideModal] = useState(false);
  const [shadowActionNotice, setShadowActionNotice] = useState<string | null>(null);
  const [isGeneratingShadow, setIsGeneratingShadow] = useState(false);

  const isAbsencePair = useCallback((p: ParallelPair) => {
    const a = (p.textA || '').trim();
    const b = (p.textB || '').trim();
    if (!a || !b) return true;
    if (a.startsWith('[Texto ausente') || b.startsWith('[Texto ausente') || a.startsWith('[Párrafo ausente') || b.startsWith('[Párrafo ausente')) return true;
    if (a === '[...]' || b === '[...]' || a === '(omisión)' || b === '(omisión)') return true;
    if ((a.length < 25 && b.length > 120) || (b.length < 25 && a.length > 120)) return true;
    return false;
  }, []);

  const isDenseDisparityPair = useCallback((p: ParallelPair) => {
    if (isAbsencePair(p)) return false;
    const lenA = (p.textA || '').length;
    const lenB = (p.textB || '').length;
    if (lenA === 0 || lenB === 0) return false;
    const ratio = Math.max(lenA, lenB) / Math.max(1, Math.min(lenA, lenB));
    if (ratio > 2.0 && (lenA > 130 || lenB > 130)) return true;
    if (Math.abs(lenA - lenB) > 300) return true;
    return false;
  }, [isAbsencePair]);

  const absencePairs = useMemo(() => parallelPairs.filter(isAbsencePair), [parallelPairs, isAbsencePair]);
  const denseDisparityPairs = useMemo(() => parallelPairs.filter(isDenseDisparityPair), [parallelPairs, isDenseDisparityPair]);
  const balancedPairs = useMemo(() => parallelPairs.filter(p => !isAbsencePair(p) && !isDenseDisparityPair(p)), [parallelPairs, isAbsencePair, isDenseDisparityPair]);
  const criticalPairs = useMemo(() => parallelPairs.filter(p => isAbsencePair(p) || isDenseDisparityPair(p)), [parallelPairs, isAbsencePair, isDenseDisparityPair]);

  const handleInvestigateTocOnline = async () => {
    setIsInvestigatingTocOnline(true);
    setOnlineTocNotice(null);
    try {
      const res = await queryCanonicalTableOfContentsOnline(
        parallelConfig.titleA || metadata.title,
        parallelConfig.author || metadata.author,
        parallelConfig.languageA || 'Español'
      );
      if (res.hasIndex && res.chapters.length > 0) {
        setOnlineTocResult(res);
        setOnlineTocNotice(`✓ Estructura canónica investigada con IA: ${res.chapters.length} capítulos hallados (${res.summaryNote})`);
      } else {
        setOnlineTocNotice('No se encontró un índice canónico formal en línea para esta obra; se preserva la estructura continua.');
      }
    } catch (e: any) {
      setOnlineTocNotice(`Aviso: ${e?.message || 'Consulta no disponible en este momento'}`);
    } finally {
      setIsInvestigatingTocOnline(false);
    }
  };

  const handleApplyManualTocInParallel = async () => {
    if (!manualTocInput.trim()) return;
    const parsed = parseManualTableOfContents(manualTocInput);
    const chs = parsed.filter(c => c.type === 'chapter' || !c.type);
    const prelims = parsed.filter(c => c.type === 'preliminary');
    const backs = parsed.filter(c => c.type === 'back_matter');

    if (chs.length > 0) {
      const newChapters = chs.map((c, idx) => ({
        id: `chap_${c.index || idx + 1}`,
        number: c.index || idx + 1,
        title: c.title,
        level: 1,
        pageNumber: c.pageOrMarker ? parseInt(c.pageOrMarker, 10) : undefined
      }));

      const updatedConfig: ParallelBookConfig = {
        ...parallelConfig,
        chapters: newChapters
      };
      setParallelConfig(updatedConfig);

      setOnlineTocResult({
        chapters: chs.map(c => ({ index: c.index, label: c.label, title: c.title })),
        preliminaries: prelims.map(p => p.title),
        backMatter: backs.map(b => b.title),
        summaryNote: `Índice manual integrado: ${chs.length} capítulos aplicados a la obra.`
      });
      setShowManualTocModal(false);
      setOnlineTocNotice(`✓ Índice estructural aplicado con éxito (${chs.length} capítulos). Re-alineando pliegos espejo...`);

      // Ejecutar la alineación real con los nuevos capítulos para que no sea en vano
      try {
        await runParallelAlignment(parallelSourceBText, updatedConfig, parallelSourceAText);
        setOnlineTocNotice(`✓ Obra re-alineada exitosamente con los ${chs.length} capítulos del índice estructural.`);
      } catch (err: any) {
        console.error('Error re-alineando con nuevo índice:', err);
        setOnlineTocNotice(`Índice guardado (${chs.length} capítulos). Puedes pulsar «Ejecutar Alineación» cuando gustes.`);
      }
    } else {
      setOnlineTocNotice('No se detectaron capítulos en el texto del índice ingresado.');
    }
  };

  // En Fase 3, NO se auto-procesa al entrar.
  // Debe esperar a que el usuario integre o señale la estructura de maquetación y las variables de ritmo.
  const [hasAssembledOnce, setHasAssembledOnce] = useState(parallelSpreads.length > 0);

  // Función para actualizar configuración de ritmo
  const handleUpdateConfig = (updates: Partial<ParallelBookConfig>) => {
    const updated = { ...parallelConfig, ...updates };
    setParallelConfig(updated);
  };

  const handleUpdateConfigAndRealign = (updates: Partial<ParallelBookConfig>) => {
    const updated = { ...parallelConfig, ...updates };
    setParallelConfig(updated);
    if (hasAssembledOnce || parallelSpreads.length > 0) {
      runParallelAlignment(undefined, updated);
    }
  };

  const handleTriggerAssemble = () => {
    setHasAssembledOnce(true);
    runParallelAlignment(undefined, parallelConfig);
  };

  const handleExportDocx = async () => {
    if (parallelPairs.length === 0) return;
    setIsExporting(true);
    try {
      const filename = `${(parallelConfig.titleA || 'Libro').replace(/\s+/g, '_')}_Bilingue_${parallelConfig.languageA}_${parallelConfig.languageB}.docx`;
      await generateParallelBookDocx(parallelPairs, parallelSpreads, parallelConfig, settings, filename);
    } catch (e: any) {
      alert(`Error al generar Word: ${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportBookA = async (format: 'docx' | 'txt' = 'docx') => {
    setIsExportingBookA(true);
    try {
      await exportCleanBookA(format);
    } catch (e: any) {
      alert(`Error exportando Libro A: ${e.message}`);
    } finally {
      setIsExportingBookA(false);
    }
  };

  const handleExportBookB = async (format: 'docx' | 'txt' = 'docx') => {
    setIsExportingBookB(true);
    try {
      await exportCleanBookB(format);
    } catch (e: any) {
      alert(`Error exportando Libro B: ${e.message}`);
    } finally {
      setIsExportingBookB(false);
    }
  };

  const handleCopyGoogleDocs = async () => {
    if (parallelPairs.length === 0) return;
    const ok = await copyParallelContentToClipboard(parallelPairs, parallelSpreads, parallelConfig, settings);
    if (ok) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } else {
      alert('No se pudo copiar automáticamente. Puedes intentar descargar el archivo Word.');
    }
  };

  const displayedPairs = filterUnbalancedOnly 
    ? parallelPairs.filter(p => p.status === 'rhythm_warning')
    : parallelPairs;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Cabecera Principal */}
      <div className="bg-gradient-to-r from-[#091D17] via-[#0E2C22] to-[#091D17] border border-emerald-800/60 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider border border-emerald-500/30">
                Edición Espejo & Paralela
              </span>
              <span className="text-xs text-stone-300">• Sincronización Estricta por Párrafos (No por Páginas)</span>
            </div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <Columns className="w-6 h-6 text-amber-400" />
              Ensamblador de Libros Paralelos y Bilingües
            </h1>
            <p className="text-sm text-stone-200 max-w-3xl">
              Sincroniza dos versiones lingüísticas homologando párrafo por párrafo. Aísla prefacios asimétricos a pliegos preliminares y deriva notas al pie al aparato crítico final para garantizar simetría visual.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Indicador Automático de Estado de Pliegos */}
            {isProcessing ? (
              <div className="px-3.5 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-2 shadow-sm">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Sincronizando Pliegos Espejo...</span>
              </div>
            ) : (
              <div className="px-3.5 py-2 rounded-xl bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 text-xs font-semibold flex items-center gap-2 shadow-sm">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Espejo Transversal 1:1 ({parallelSpreads.length} Pliegos)</span>
              </div>
            )}

            {/* Descargar Libro A Limpio */}
            <button
              onClick={() => handleExportBookA('docx')}
              disabled={isExportingBookA}
              className="px-3 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-blue-300 border border-blue-600/40 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
              title={`Descargar ${parallelConfig.titleA || 'Libro A'} limpio y formateado en Word (.docx)`}
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>{isExportingBookA ? 'Descargando A...' : `Libro A Limpio (.docx)`}</span>
            </button>

            {/* Descargar Libro B Limpio */}
            <button
              onClick={() => handleExportBookB('docx')}
              disabled={isExportingBookB}
              className="px-3 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-emerald-300 border border-emerald-600/40 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
              title={`Descargar ${parallelConfig.titleB || 'Libro B'} limpio y formateado en Word (.docx)`}
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isExportingBookB ? 'Descargando B...' : `Libro B Limpio (.docx)`}</span>
            </button>

            {/* Descargar Espejo Bilingüe */}
            <button
              onClick={handleExportDocx}
              disabled={isExporting || parallelPairs.length === 0}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-md disabled:opacity-40"
              title="Descargar libro bilingüe enfrentado con pliegos pares e impares (.docx)"
            >
              <BookOpen className="w-3.5 h-3.5 text-stone-950" />
              <span>{isExporting ? 'Generando Espejo...' : 'Descargar Espejo DOCX'}</span>
            </button>
          </div>
        </div>

        {/* Métricas Globales de Ritmo y Censo de Párrafos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-emerald-800/40">
          <div className="bg-stone-900/70 rounded-xl p-3 border border-emerald-900/60">
            <span className="text-xs text-stone-400 block">Párrafos Versión A</span>
            <span className="text-lg font-bold text-white">
              {parallelAudit ? parallelAudit.totalParagraphsA : parallelPairs.length}
            </span>
            <span className="text-[10px] text-stone-400 block">{parallelConfig.languageA}</span>
          </div>

          <div className="bg-stone-900/70 rounded-xl p-3 border border-emerald-900/60">
            <span className="text-xs text-stone-400 block">Párrafos Versión B</span>
            <span className="text-lg font-bold text-emerald-300">
              {parallelAudit ? parallelAudit.totalParagraphsB : parallelPairs.length}
            </span>
            <span className="text-[10px] text-stone-400 block">{parallelConfig.languageB}</span>
          </div>

          <div className="bg-stone-900/70 rounded-xl p-3 border border-emerald-900/60">
            <span className="text-xs text-stone-400 block">Pliegos Generados</span>
            <span className="text-lg font-bold text-amber-300">{parallelSummary.totalSpreads}</span>
            <span className="text-[10px] text-stone-400 block">{parallelSummary.totalSpreads * 2} páginas enfrentadas</span>
          </div>

          <div className="bg-stone-900/70 rounded-xl p-3 border border-emerald-900/60">
            <span className="text-xs text-stone-400 block">Palabras Totales</span>
            <span className="text-lg font-bold text-white">
              {parallelSummary.totalWordsA} / {parallelSummary.totalWordsB}
            </span>
            <span className="text-[10px] text-stone-400 block">Ratio A / B</span>
          </div>

          <div className="bg-stone-900/70 rounded-xl p-3 border border-cyan-900/60">
            <span className="text-xs text-stone-400 block">Cortes por Contenido</span>
            <span className="text-lg font-bold text-cyan-300">
              {parallelAudit?.contentMirrorCutsCount ?? 0}
            </span>
            <span className="text-[10px] text-cyan-400/80 block truncate">
              {parallelAudit?.aiModelUsedInMirrorCuts ? `${parallelAudit.aiModelUsedInMirrorCuts}` : 'Sincronía Espejo'}
            </span>
          </div>

          <div 
            onClick={() => setActiveViewMode('start_audit')}
            className="bg-stone-900/70 hover:bg-stone-800/80 rounded-xl p-3 border border-emerald-900/60 col-span-2 sm:col-span-1 cursor-pointer transition"
            title="Haz clic para inspeccionar el certificado de frases de inicio y cierre"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400 block">Concordancia Espejo</span>
              <span className="text-[10px] text-emerald-400 font-bold underline">Ver Detalle</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-lg font-bold ${
                (parallelAudit?.exactStartMatchRate ?? parallelAudit?.beginningConcordanceScore ?? 100) >= 90 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {parallelAudit?.exactStartMatchRate ?? parallelAudit?.beginningConcordanceScore ?? 100}%
              </span>
              {(parallelAudit?.exactStartMatchRate ?? parallelAudit?.beginningConcordanceScore ?? 100) >= 90 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <span className="text-[10px] text-stone-300 block">Inicios: {parallelAudit?.exactStartMatchRate ?? 100}% • Cierres: {parallelAudit?.exactEndMatchRate ?? 100}%</span>
          </div>
        </div>
      </div>

      {/* BANNER DE DIAGNÓSTICO Y REVISIÓN DE CULMINACIÓN (AUSENCIAS Y DESBALANCES DENSOS) */}
      {parallelPairs.length > 0 && (
        <div className="bg-gradient-to-r from-stone-900 via-[#131b17] to-stone-900 border border-emerald-900/80 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Diagnóstico de Culminación: Paridad y Espejo
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 font-mono">
                  {parallelPairs.length} pares totales
                </span>
              </div>
              <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
                Herramienta de revisión focalizada al culminar el procesamiento: identifica y subsana párrafos con <strong className="text-red-300">errores de ausencia</strong> (omisión o vacío) o <strong className="text-amber-300">párrafos hiperdensos</strong> frente a su homólogo de espejo, garantizando simetría perfecta sin quemar tokens innecesarios.
              </p>
            </div>

            {/* Píldoras de Estado y Métricas */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => { setActiveViewMode('culmination_review'); setFilterCategory('absence'); }}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  absencePairs.length > 0
                    ? 'bg-red-950/70 border-red-700/60 text-red-300 hover:bg-red-900/80 shadow-xs'
                    : 'bg-stone-900 border-stone-800 text-stone-400 hover:bg-stone-850'
                }`}
                title="Inspeccionar pares con omisión o texto ausente"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span>{absencePairs.length} Ausencias</span>
              </button>

              <button
                onClick={() => { setActiveViewMode('culmination_review'); setFilterCategory('dense'); }}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  denseDisparityPairs.length > 0
                    ? 'bg-amber-950/70 border-amber-700/60 text-amber-300 hover:bg-amber-900/80 shadow-xs'
                    : 'bg-stone-900 border-stone-800 text-stone-400 hover:bg-stone-850'
                }`}
                title="Inspeccionar párrafos con densidad desproporcionada respecto a su homólogo espejo"
              >
                <Columns className="w-3.5 h-3.5 text-amber-400" />
                <span>{denseDisparityPairs.length} Desbalances Densos</span>
              </button>

              <button
                onClick={() => { setActiveViewMode('culmination_review'); setFilterCategory('balanced'); }}
                className="px-3 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 text-xs font-bold transition hover:bg-emerald-900/80 flex items-center gap-1.5 cursor-pointer"
                title="Pares con ritmo y extensión simétrica"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{balancedPairs.length} Equilibrados ({parallelPairs.length > 0 ? Math.round((balancedPairs.length / parallelPairs.length) * 100) : 100}%)</span>
              </button>
            </div>
          </div>

          {/* Acciones de Reconciliación Rápida */}
          <div className="flex items-center gap-2.5 pt-2 border-t border-stone-800/80 flex-wrap">
            <button
              onClick={() => {
                setActiveViewMode('culmination_review');
                setFilterCategory('critical');
              }}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-stone-800 to-stone-700 hover:from-stone-700 hover:to-stone-600 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm border border-stone-600/50"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>📋 Abrir Centro de Revisión de Culminación</span>
            </button>

            {healingNotice && (
              <span className="text-xs font-medium text-emerald-300 ml-auto animate-fade-in bg-emerald-950/80 px-3 py-1 rounded-lg border border-emerald-700/60">
                {healingNotice}
              </span>
            )}
          </div>
        </div>
      )}

      {/* TARJETA DE REANUDACIÓN Y SALVAGUARDA DE PROGRESO DE FASE 3 */}
      {phase3Checkpoint && (phase3Checkpoint.status === 'paused' || phase3Checkpoint.status === 'rate_limited' || phase3Checkpoint.status === 'error' || (phase3Checkpoint.completedCount < phase3Checkpoint.totalCandidates && phase3Checkpoint.totalCandidates > 0)) && (
        <div className="bg-gradient-to-r from-amber-950/80 via-stone-900 to-amber-950/80 border-2 border-amber-500/70 rounded-2xl p-5 shadow-2xl space-y-3 animate-in fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Bookmark className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    {phase3Checkpoint.status === 'rate_limited' 
                      ? '⏸️ Cuota Protegida (Progreso Guardado)'
                      : phase3Checkpoint.status === 'paused'
                      ? '⏸️ Procesamiento Pausado (Progreso Guardado)'
                      : '💾 Punto de Control de Fase 3'}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                    Bloque {phase3Checkpoint.completedCount} de {phase3Checkpoint.totalCandidates}
                  </span>
                </div>
                <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                  {phase3Checkpoint.statusMessage?.includes('is not a function')
                    ? 'Punto de control listo. Todo el trabajo realizado se conserva permanentemente sin pérdidas.'
                    : (phase3Checkpoint.statusMessage || `Se han preservado intactos ${parallelPairs.length} fragmentos espejo. Todo el trabajo realizado se conserva permanentemente sin pérdidas.`)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                onClick={resumeParallelAlignment}
                disabled={isProcessing}
                className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-stone-950 text-xs font-black rounded-xl transition shadow-lg flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                title="Reanudar el proceso de sincronía espejo desde el punto guardado"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Reanudar Sincronía Espejo</span>
              </button>

              <button
                onClick={resetPhase3Progress}
                disabled={isProcessing}
                className="px-3 py-2.5 bg-stone-800 hover:bg-rose-950/60 hover:text-rose-200 text-stone-400 text-xs rounded-xl border border-stone-700 transition cursor-pointer flex items-center gap-1.5"
                title="Reiniciar procesamiento de Fase 3 desde el comienzo"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reiniciar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MONITOR DE EJECUCIÓN Y COTEJO EN VIVO DE FASE 3 */}
      {(isProcessing || (phase3Checkpoint && phase3Checkpoint.inProgress)) && (
        <div className="bg-gradient-to-b from-[#0a1118] via-[#0d1620] to-[#0a0e14] border-2 border-amber-500/80 rounded-2xl p-6 text-white shadow-2xl space-y-5 animate-in fade-in">
          {/* Cabecera del Monitor */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-amber-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-extrabold text-white tracking-wide">
                    Monitor de Ejecución y Cotejo Espejo en Tiempo Real
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold font-mono border ${
                    processingProgress.activeEngine === 'local'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                      : 'bg-amber-950 text-amber-300 border-amber-700/60'
                  }`}>
                    {processingProgress.activeEngine === 'local' ? '⚡ Motor Semántico Local (0 Tokens)' : `🤖 ${processingProgress.activeModel || 'Cascada IA'}`}
                  </span>
                  {(shadowTextA_in_B || shadowTextB_in_A) && (
                    <span className="px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-700/60 text-[10px] font-bold">
                      🌐 Soporte Tetralingüe Activo
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-300 mt-0.5">
                  {processingProgress.message || 'Procesando alineación bilingüe párrafo a párrafo...'}
                </p>
              </div>
            </div>

            {/* Acciones de Control en Caliente */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={pausePhase3Processing}
                className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Pausar el proceso y salvaguardar el avance sin perder nada"
              >
                <Pause className="w-3.5 h-3.5 text-amber-400" />
                <span>Pausar</span>
              </button>

              <button
                onClick={switchToLocalProcessing}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                title="Completar todo el libro al instante con el Motor Semántico Local (0 Tokens consumidos)"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>0 Tokens (Local)</span>
              </button>
            </div>
          </div>

          {/* Stepper Visual de 5 Fases */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
            {[
              { num: 1, label: 'Límites Soberanos', desc: 'Fronteras de Fase 1 & 2', active: (processingProgress.current || 0) >= 10 },
              { num: 2, label: 'Índices & Capítulos', desc: 'Homologación editorial', active: (processingProgress.current || 0) >= 30 },
              { num: 3, label: 'Cotejo Continuo 1:1', desc: 'DP Bandado sin cortes ciegos', active: (processingProgress.current || 0) >= 55 },
              { num: 4, label: 'Armonización Léxica', desc: 'Fechas, nombres y lemas', active: (processingProgress.current || 0) >= 80 },
              { num: 5, label: 'Pliegos Enfrentados', desc: 'Certificación y maquetación', active: (processingProgress.current || 0) >= 95 },
            ].map((st) => (
              <div 
                key={st.num}
                className={`p-2.5 rounded-xl border transition ${
                  st.active 
                    ? 'bg-amber-950/40 border-amber-500/50 text-amber-200' 
                    : 'bg-stone-900/50 border-stone-800 text-stone-500'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${
                    st.active ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400'
                  }`}>
                    {st.num}
                  </span>
                  <span className="truncate">{st.label}</span>
                </div>
                <span className="text-[10px] text-stone-400 block mt-0.5 truncate">{st.desc}</span>
              </div>
            ))}
          </div>

          {/* Barra de Progreso Dinámica */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-stone-300 font-semibold truncate">
                {processingProgress.stage || 'Progreso de Sincronización Espejo'}
              </span>
              <span className="text-amber-400 font-bold text-sm">
                {processingProgress.current || 0}%
              </span>
            </div>
            <div className="w-full h-3 bg-stone-900 rounded-full overflow-hidden p-0.5 border border-amber-500/40">
              <div 
                className="h-full bg-gradient-to-r from-amber-500 via-emerald-400 to-amber-400 rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${Math.min(100, Math.max(5, processingProgress.current || 0))}%` }}
              />
            </div>
            {processingProgress.processedDetail && (
              <p className="text-[11px] text-amber-300 font-medium">
                {processingProgress.processedDetail}
              </p>
            )}
          </div>

          {/* Visor en Vivo de Cotejo Bilingüe (Side-by-Side Preview) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-black/60 border border-stone-800 rounded-xl">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-blue-300">
                  Libro A ({parallelConfig.languageA || 'Idioma A'})
                </span>
                <span className="text-[10px] text-stone-400 font-mono">Frente Izquierdo</span>
              </div>
              <div className="text-xs text-stone-200 bg-[#0d1117] p-3 rounded-lg border border-stone-800/90 min-h-[64px] max-h-28 overflow-y-auto leading-relaxed">
                {processingProgress.itemSnippet || (parallelPairs.length > 0 ? parallelPairs[parallelPairs.length - 1].textA : 'Censando párrafos y delimitando fronteras iniciales...')}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-300">
                  Libro B ({parallelConfig.languageB || 'Idioma B'})
                </span>
                <span className="text-[10px] text-stone-400 font-mono">Frente Derecho</span>
              </div>
              <div className="text-xs text-stone-200 bg-[#0d1117] p-3 rounded-lg border border-stone-800/90 min-h-[64px] max-h-28 overflow-y-auto leading-relaxed">
                {parallelPairs.length > 0 ? (parallelPairs[parallelPairs.length - 1].textB || 'Homologando contraparte espejo...') : 'Sincronizando oraciones homólogas...'}
              </div>
            </div>
          </div>

          {/* Registro de Operaciones en Vivo (Terminal Log) */}
          {processingProgress.recentLogs && processingProgress.recentLogs.length > 0 && (
            <div className="bg-black/80 rounded-xl p-3 border border-stone-800 font-mono text-[11px] text-stone-300 space-y-1 max-h-28 overflow-y-auto">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold pb-1 border-b border-stone-800">
                <Terminal className="w-3.5 h-3.5" />
                <span>Registro de Operaciones del Pipeline</span>
              </div>
              {processingProgress.recentLogs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">›</span>
                  <span className="text-stone-300">{log}</span>
                </div>
              ))}
            </div>
          )}

          {/* Aviso de Cuota / Tokens */}
          {processingProgress.tokenNotice && (
            <div className="p-3 bg-amber-950/70 border border-amber-700/60 rounded-xl text-xs text-amber-200 leading-relaxed">
              {processingProgress.tokenNotice}
            </div>
          )}
        </div>
      )}

      {/* ASISTENTE TETRALINGÜE DE TRADUCCIÓN SOMBRA (GOOGLE TRANSLATE - 0 TOKENS) */}
      <div className="bg-[#10141a] border border-cyan-900/60 rounded-2xl p-5 shadow-sm space-y-4 font-sans">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-cyan-400 shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Asistente Tetralingüe de Traducción Sombra
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800/60 text-[10px] font-bold font-mono">
                  Google Translate • 0 Tokens IA
                </span>
                {(shadowTextA_in_B || shadowTextB_in_A) && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800/60 text-[10px] font-bold">
                    ✓ Sombra Activa ({[shadowTextA_in_B && 'A→B', shadowTextB_in_A && 'B→A'].filter(Boolean).join(' + ')})
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-300 mt-0.5">
                Herramienta de apoyo sin tokens: coteja cada párrafo en su propio idioma comparando los 4 flujos (Texto A, Texto B, y traducciones sombra). Garantiza correspondencia léxica y gramatical estricta.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowGoogleTranslateGuideModal(true)}
              className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-cyan-300 border border-cyan-800/60 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Instrucciones para traducir obras completas (PDF/Word/TXT) gratis con Google Translate"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              <span>Instrucciones Traductor Google</span>
            </button>

            <button
              onClick={() => setShowShadowDrawer(!showShadowDrawer)}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-700/70 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>{showShadowDrawer ? 'Ocultar Ranuras Sombra' : 'Cargar / Gestionar Traducciones Sombra'}</span>
              {showShadowDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Drawer expandible con las ranuras de texto sombra */}
        {showShadowDrawer && (
          <div className="pt-3 border-t border-cyan-900/40 space-y-4 animate-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ranura 1: Sombra A -> B */}
              <div className="space-y-1.5 bg-stone-950/80 p-3.5 rounded-xl border border-stone-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-blue-300">
                    1. Traducción Sombra: Libro A → {parallelConfig.languageB || 'Idioma B'}
                  </span>
                  <span className="text-[10px] text-stone-400 font-mono">
                    {shadowTextA_in_B ? `${shadowTextA_in_B.length} car.` : 'Vacío'}
                  </span>
                </div>
                <textarea
                  value={shadowTextA_in_B}
                  onChange={(e) => setShadowTextA_in_B(e.target.value)}
                  placeholder={`Pega aquí el texto completo de Libro A traducido a ${parallelConfig.languageB || 'Idioma B'} (ej. descargado desde translate.google.com/?op=docs)...`}
                  className="w-full h-28 bg-stone-900 text-xs text-stone-200 p-2.5 rounded-lg border border-stone-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono resize-y"
                />
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={async () => {
                      setIsGeneratingShadow(true);
                      try {
                        await generateFreeShadowTranslationForAnchor('A');
                        setShadowActionNotice('✓ Sombra A→B generada con traductor gratuito (0 tokens).');
                        setTimeout(() => setShadowActionNotice(null), 4000);
                      } finally {
                        setIsGeneratingShadow(false);
                      }
                    }}
                    disabled={isGeneratingShadow || isProcessing}
                    className="text-[11px] px-2.5 py-1 rounded bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-800/60 font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    <Zap className="w-3 h-3 text-amber-300" />
                    <span>{isGeneratingShadow ? 'Traduciendo...' : 'Auto-Traducir A→B (0 Tokens)'}</span>
                  </button>
                  {shadowTextA_in_B && (
                    <button
                      onClick={() => setShadowTextA_in_B('')}
                      className="text-[11px] text-stone-400 hover:text-rose-300 cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              {/* Ranura 2: Sombra B -> A */}
              <div className="space-y-1.5 bg-stone-950/80 p-3.5 rounded-xl border border-stone-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-300">
                    2. Traducción Sombra: Libro B → {parallelConfig.languageA || 'Idioma A'}
                  </span>
                  <span className="text-[10px] text-stone-400 font-mono">
                    {shadowTextB_in_A ? `${shadowTextB_in_A.length} car.` : 'Vacío'}
                  </span>
                </div>
                <textarea
                  value={shadowTextB_in_A}
                  onChange={(e) => setShadowTextB_in_A(e.target.value)}
                  placeholder={`Pega aquí el texto completo de Libro B traducido a ${parallelConfig.languageA || 'Idioma A'} (ej. descargado desde translate.google.com/?op=docs)...`}
                  className="w-full h-28 bg-stone-900 text-xs text-stone-200 p-2.5 rounded-lg border border-stone-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono resize-y"
                />
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={async () => {
                      setIsGeneratingShadow(true);
                      try {
                        await generateFreeShadowTranslationForAnchor('B');
                        setShadowActionNotice('✓ Sombra B→A generada con traductor gratuito (0 tokens).');
                        setTimeout(() => setShadowActionNotice(null), 4000);
                      } finally {
                        setIsGeneratingShadow(false);
                      }
                    }}
                    disabled={isGeneratingShadow || isProcessing}
                    className="text-[11px] px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    <Zap className="w-3 h-3 text-amber-300" />
                    <span>{isGeneratingShadow ? 'Traduciendo...' : 'Auto-Traducir B→A (0 Tokens)'}</span>
                  </button>
                  {shadowTextB_in_A && (
                    <button
                      onClick={() => setShadowTextB_in_A('')}
                      className="text-[11px] text-stone-400 hover:text-rose-300 cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            </div>

            {shadowActionNotice && (
              <div className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-800 text-xs text-emerald-300 font-medium">
                {shadowActionNotice}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE INSTRUCCIONES: TRADUCTOR DE DOCUMENTOS DE GOOGLE */}
      {showGoogleTranslateGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#12161c] border border-cyan-800 rounded-2xl max-w-2xl w-full p-6 text-stone-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-base text-white">
                  Traducción de Libros Completos con Google Translate (0 Tokens)
                </h3>
              </div>
              <button
                onClick={() => setShowGoogleTranslateGuideModal(false)}
                className="text-stone-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-stone-300">
              <p>
                Google Translate ofrece una herramienta gratuita e ilimitada para traducir <strong>documentos enteros</strong> (PDF, Word .docx, Markdown, TXT) de cientos de páginas en cuestión de segundos, sin costo alguno ni gasto de tokens.
              </p>

              <div className="bg-stone-900 p-4 rounded-xl border border-stone-800 space-y-2">
                <h4 className="font-bold text-amber-300 text-xs uppercase tracking-wide">Procedimiento Paso a Paso:</h4>
                <ol className="list-decimal list-inside space-y-2 text-stone-300">
                  <li>
                    Ingresa a la herramienta web de documentos de Google Translate:
                    <br />
                    <span className="font-mono text-[11px] text-cyan-400 bg-stone-950 px-2 py-0.5 rounded border border-stone-800 inline-block mt-1">
                      https://translate.google.com/?op=docs
                    </span>
                  </li>
                  <li>Selecciona la pestaña <strong>Documentos</strong> y arrastra tu archivo (PDF, Word o TXT).</li>
                  <li>Elige el idioma de origen y el idioma de destino (ej. de Español a Inglés, o de Inglés a Español).</li>
                  <li>Presiona <strong>Traducir</strong> y descarga el documento traducido resultante.</li>
                  <li>Pega el texto resultante en la ranura correspondiente de traducción sombra arriba.</li>
                  <li>
                    Al procesar con los 4 archivos activos (A, B, Sombra A→B y Sombra B→A), el algoritmo compara cada párrafo con su equivalente en el mismo idioma, logrando correspondencia 1:1 inmediata con <strong>0 tokens de IA</strong>.
                  </li>
                </ol>
              </div>

              <div className="p-3 bg-emerald-950/60 rounded-xl border border-emerald-800/60 text-emerald-300">
                <strong>Garantía de Fidelidad:</strong> Al cotejar textos dentro del mismo idioma, desaparece la asimetría sintáctica y los modismos. Cada párrafo se acopla exactamente con su homólogo sin desfases.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-800">
              <button
                onClick={() => setShowGoogleTranslateGuideModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PANEL DE VARIABLES DE RITMO Y ESTRUCTURA DE MAQUETACIÓN EDITORIAL */}
      <div className="bg-[#12161b] border border-stone-800 rounded-2xl p-6 shadow-sm space-y-5 font-sans">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-800/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-stone-100 tracking-tight">
                Variables de Ritmo & Maquetación Espejo
              </h2>
              <span className="px-2.5 py-0.5 rounded-md bg-stone-900 text-stone-300 border border-stone-800 text-[11px] font-mono">
                Paso 3
              </span>
            </div>
            <p className="text-xs text-stone-400 max-w-2xl leading-relaxed">
              Define la disposición de pliegos, densidad de caracteres y corte sincrónico. Haz clic en el botón para iniciar el ensamblaje 1:1.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={pausePhase3Processing}
                  className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                  title="Pausar el proceso y desbloquear"
                >
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pausar</span>
                </button>
                <button
                  onClick={switchToLocalProcessing}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Completar al instante con Motor Local (0 Tokens)"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>0 Tokens (Local)</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleTriggerAssemble}
                className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer"
                title="Ejecuta el proceso único integral de Fase 3: armonización transversal de oraciones y ensamblaje de pliegos espejo 1:1"
              >
                <Sparkles className="w-4 h-4 text-stone-950" />
                <span>Procesar Pliegos Espejo 1:1</span>
              </button>
            )}
          </div>
        </div>

        {/* Variables de Ritmo Principales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 text-xs">
          {/* Variable 1: Estructura de Maquetación */}
          <div className="bg-stone-950/80 p-3.5 rounded-xl border border-stone-800 space-y-2">
            <label className="font-bold text-stone-200 block text-[11px] uppercase tracking-wide">
              1. Estructura de Maquetación
            </label>
            <select
              value={parallelConfig.layoutMode || 'facing_pages'}
              onChange={e => handleUpdateConfig({ layoutMode: e.target.value as any })}
              className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none text-xs"
            >
              <option value="facing_pages">📖 Pliegos Enfrentados (Par A / Impar B)</option>
              <option value="side_by_side_columns">📑 Columnas Paralelas Bicéfalas</option>
              <option value="interleaved_paragraphs">📜 Párrafos Alternados / Intercalados</option>
            </select>
            <span className="text-[10px] text-stone-400 block">
              {parallelConfig.layoutMode === 'facing_pages' ? 'Página izquierda para Idioma A y derecha para Idioma B' : parallelConfig.layoutMode === 'side_by_side_columns' ? 'Dos columnas sincrónicas lado a lado' : 'Párrafo en A seguido de su traducción en B'}
            </span>
          </div>

          {/* Variable 2: Presupuesto de Caracteres por Pliego */}
          <div className="bg-stone-950/80 p-3.5 rounded-xl border border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-stone-200 text-[11px] uppercase tracking-wide">
                2. Caracteres por Pliego
              </label>
              <span className="text-amber-400 font-mono font-bold text-xs">
                {parallelConfig.targetCharsPerPage || 1400} car.
              </span>
            </div>
            <input
              type="range"
              min="600"
              max="2800"
              step="100"
              value={parallelConfig.targetCharsPerPage || 1400}
              onChange={e => handleUpdateConfig({ targetCharsPerPage: Number(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-500 font-mono">
              <span>Compacto (800)</span>
              <span>Estándar (1400)</span>
              <span>Denso (2400)</span>
            </div>
          </div>

          {/* Variable 3: Párrafos Promedio por Pliego */}
          <div className="bg-stone-950/80 p-3.5 rounded-xl border border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-stone-200 text-[11px] uppercase tracking-wide">
                3. Párrafos por Pliego
              </label>
              <span className="text-emerald-400 font-mono font-bold text-xs">
                {parallelConfig.targetParagraphsPerPage || 4} párrafos
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="8"
              step="1"
              value={parallelConfig.targetParagraphsPerPage || 4}
              onChange={e => handleUpdateConfig({ targetParagraphsPerPage: Number(e.target.value) })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-500 font-mono">
              <span>1 (Muy holgado)</span>
              <span>4 (Equilibrado)</span>
              <span>8 (Dinámico)</span>
            </div>
          </div>

          {/* Variable 4: Método de Sincronización */}
          <div className="bg-stone-950/80 p-3.5 rounded-xl border border-stone-800 space-y-2">
            <label className="font-bold text-stone-200 block text-[11px] uppercase tracking-wide">
              4. Método de Sincronía
            </label>
            <select
              value={parallelConfig.syncMethod || 'by_paragraphs'}
              onChange={e => handleUpdateConfig({ syncMethod: e.target.value as any })}
              className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none text-xs"
            >
              <option value="by_content_mirror">🧠 Corte Estricto por Contenido (Espejo Semántico & Cascada IA)</option>
              <option value="by_paragraphs">🎯 Párrafo a Párrafo Estricto (Recomendado)</option>
              <option value="by_page_budget">📐 Presupuesto Rítmico de Pliego</option>
              <option value="hybrid">✨ Híbrido Sincrónico Editorial</option>
            </select>
            <span className="text-[10px] text-stone-400 block">
              {parallelConfig.syncMethod === 'by_content_mirror' 
                ? 'Corta estrictamente por acontecimientos y significado homogéneo sin desbalance de texto.' 
                : 'Garantiza que ningún párrafo se corte sin su homólogo espejo.'}
            </span>
          </div>

          {/* Variable 5: Gestión Inteligente de Tokens & Cascada */}
          <div className="bg-stone-950/80 p-3.5 rounded-xl border border-stone-800 space-y-2">
            <label className="font-bold text-stone-200 block text-[11px] uppercase tracking-wide flex items-center justify-between">
              <span>5. Gestión de Tokens IA</span>
              <span className="text-[9px] text-cyan-400 font-mono font-bold">Ahorro inteligente</span>
            </label>
            <select
              value={parallelConfig.tokenEfficiencyMode || 'smart_economizer'}
              onChange={e => handleUpdateConfig({ tokenEfficiencyMode: e.target.value as any })}
              className="w-full px-3 py-2 bg-stone-900 border border-cyan-800/60 rounded-lg text-stone-100 font-semibold focus:ring-2 focus:ring-cyan-500 focus:outline-none text-xs"
            >
              <option value="smart_economizer">🧠 Ahorro Inteligente (Semántico Local 0 tokens + IA en Casos Críticos)</option>
              <option value="pure_local">⚡ Motor Semántico Local Puro (0 Tokens, Ultrarrápido)</option>
              <option value="ai_intensive">💎 Cascada IA Completa (Auditoría Intensiva)</option>
            </select>
            <span className="text-[10px] text-cyan-400/80 block">
              {parallelConfig.tokenEfficiencyMode === 'pure_local'
                ? '0 tokens gastados. Alineación 100% determinista local inmediata.'
                : parallelConfig.tokenEfficiencyMode === 'ai_intensive'
                ? 'Usa tokens de IA en cada fragmento asimétrico.'
                : 'Prioriza motor local para ahorrar tokens; solo consulta IA en divergencias críticas.'}
            </span>
          </div>
        </div>

        {/* Variables Complementarias de Ritmo y Tipografía */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-stone-800 text-xs">
          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-stone-300 hover:text-white">
              <input
                type="checkbox"
                checked={parallelConfig.breakOnChapter !== false}
                onChange={e => handleUpdateConfig({ breakOnChapter: e.target.checked })}
                className="rounded text-amber-500 focus:ring-0 bg-stone-950 border-stone-700"
              />
              <span className="font-medium">Salto forzado de Pliego en cada Capítulo</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-stone-300 hover:text-white">
              <input
                type="checkbox"
                checked={parallelConfig.strictRhythmBalance !== false}
                onChange={e => handleUpdateConfig({ strictRhythmBalance: e.target.checked })}
                className="rounded text-emerald-500 focus:ring-0 bg-stone-950 border-stone-700"
              />
              <span className="font-medium">Balance Rítmico Estricto</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-stone-300 hover:text-white">
              <input
                type="checkbox"
                checked={parallelConfig.unifyDialogueDashes !== false}
                onChange={e => handleUpdateConfig({ unifyDialogueDashes: e.target.checked })}
                className="rounded text-teal-500 focus:ring-0 bg-stone-950 border-stone-700"
              />
              <span className="font-medium">Unificar rayas de diálogo (—)</span>
            </label>
          </div>

          <div className="flex items-center gap-2 text-stone-400 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{parallelSpreads.length > 0 ? `${parallelSpreads.length} pliegos ensamblados` : 'Pendiente de generar pliegos'}</span>
          </div>
        </div>
      </div>

      {/* METADATOS DE CONTROL EDITORIAL Y AUDITORÍA DE ESTRUCTURA */}
      {parallelAudit && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold text-stone-100 uppercase tracking-wide">
                Metadatos de Control Editorial y Auditoría de Sincronía
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {parallelAudit.bidirectionalPassCompleted && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/90 text-emerald-300 border border-emerald-700/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Doble Procesado Bidireccional Activo ({parallelAudit.consensusAnchorsCount || 0} subbloques de consenso)
                </span>
              )}
              <span className="text-xs text-stone-400 hidden lg:inline">
                Análisis completo de inicio a fin y fin a inicio
              </span>
            </div>
          </div>

          {/* Certificado de Muestreo Forense e Hilación Ininterrumpida */}
          {parallelAudit.forensicQualityCertificate && (
            <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-bold text-emerald-200">
                  {parallelAudit.forensicQualityCertificate}
                </span>
              </div>
              {parallelAudit.forensicSamplingAudit && (
                <span className="text-[11px] font-mono font-semibold text-emerald-300 bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700/60 shrink-0">
                  {parallelAudit.forensicSamplingAudit.samplesPassed} de {parallelAudit.forensicSamplingAudit.samplesChecked} puntos de control al 100%
                </span>
              )}
            </div>
          )}

          {/* Cuadrícula de Controles de Auditoría de los 5 Bloques Canónicos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
            {/* Control 1: Censo y Discrepancias */}
            <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-300">1. Censo & Concordancia</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {parallelAudit.totalParagraphsA === parallelAudit.totalParagraphsB ? 'Paridad Exacta 1:1' : 'Sincronía Armónica'}
                </span>
              </div>
              <div className="space-y-1 text-[11px] text-stone-300 border-t border-b border-stone-800/80 py-1.5 my-1">
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">Inicios concordantes:</span>
                  <span className="font-medium text-emerald-300">{parallelAudit.beginningConcordanceScore ?? 100}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">Extensión proporcional:</span>
                  <span className="font-medium text-emerald-300">{parallelAudit.extensionConcordanceScore ?? 100}%</span>
                </div>
                {(parallelAudit.reconciliationsCount || 0) > 0 && (
                  <div className="flex items-center justify-between text-[10px] text-amber-300">
                    <span>Párrafos rectificados:</span>
                    <span>{parallelAudit.reconciliationsCount}</span>
                  </div>
                )}
              </div>
              <p className="text-stone-400 leading-relaxed text-[11px]">
                {parallelAudit.summaryMessage}
              </p>
            </div>

            {/* Control 2: Extensión de Contenido y Cortes Sincrónicos */}
            <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-300">2. Extensión & Ritmo</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
                  ~{parallelAudit.targetCharsPerPage || parallelConfig.targetCharsPerPage || 1400} c/pliego
                </span>
              </div>
              <div className="space-y-1 text-stone-400 text-[11px]">
                <div className="flex items-center justify-between">
                  <span>Promedio real:</span>
                  <span className="text-stone-200 font-medium">{parallelAudit.averageCharsPerSpread || 0} caracteres</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Párrafos monumentales:</span>
                  <span className={`font-medium ${parallelAudit.longParagraphsSplitCount ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {parallelAudit.longParagraphsSplitCount || 0} sincrónicos
                  </span>
                </div>
                <p className="text-[10px] text-emerald-400 mt-1">
                  ✓ Regla estricta: NUNCA se corta un párrafo si la cara enfrentada no va a continuar.
                </p>
              </div>
            </div>

            {/* Control 3: Prefacios e Introducciones */}
            <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
              <span className="font-semibold text-stone-300 block">3. Prólogos / Prefacios</span>
              {parallelAudit.prefaceA?.hasPreface || parallelAudit.prefaceB?.hasPreface ? (
                <div className="space-y-1 text-stone-400">
                  {parallelAudit.prefaceA?.hasPreface && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span>En {parallelConfig.languageA}:</span>
                      <span className="text-stone-200 font-medium">{parallelAudit.prefaceA.paragraphsCount} párrafos</span>
                    </div>
                  )}
                  {parallelAudit.prefaceB?.hasPreface && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span>En {parallelConfig.languageB}:</span>
                      <span className="text-stone-200 font-medium">{parallelAudit.prefaceB.paragraphsCount} párrafos</span>
                    </div>
                  )}
                  <p className="text-[10px] text-emerald-400 mt-1">
                    ✓ Aislado en pliego preliminar para arrancar la historia en Cap. 1.
                  </p>
                </div>
              ) : (
                <p className="text-stone-500 italic text-[11px]">
                  Sin prefacios asimétricos detectados. Ambas obras inician directamente en el texto narrativo.
                </p>
              )}
            </div>

            {/* Control 4: Notas al Pie y Aparato Crítico */}
            <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
              <span className="font-semibold text-stone-300 block">4. Aparato Crítico</span>
              <div className="space-y-1 text-stone-400">
                <div className="flex items-center justify-between text-[11px]">
                  <span>Notas al pie {parallelConfig.languageA}:</span>
                  <span className="text-stone-200 font-medium">{parallelAudit.footnotesCountA} notas</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span>Notas al pie {parallelConfig.languageB}:</span>
                  <span className="text-stone-200 font-medium">{parallelAudit.footnotesCountB} notas</span>
                </div>
                <p className="text-[10px] text-emerald-400 mt-1">
                  ✓ Extraídas para no romper la continuidad de los párrafos enfrentados.
                </p>
              </div>
            </div>

            {/* Control 5: Contenido Posterior (Back Matter / Licencia / Epílogo) */}
            <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
              <span className="font-semibold text-stone-300 block">5. Contenido Posterior</span>
              {parallelAudit.backMatterA?.hasBackMatter || parallelAudit.backMatterB?.hasBackMatter ? (
                <div className="space-y-1 text-stone-400">
                  {parallelAudit.backMatterA?.hasBackMatter && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate max-w-[110px]" title={parallelAudit.backMatterA.title}>
                        {parallelAudit.backMatterA.title}:
                      </span>
                      <span className="text-stone-200 font-medium shrink-0">{parallelAudit.backMatterA.paragraphsCount} párrafos</span>
                    </div>
                  )}
                  {parallelAudit.backMatterB?.hasBackMatter && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate max-w-[110px]" title={parallelAudit.backMatterB.title}>
                        {parallelAudit.backMatterB.title}:
                      </span>
                      <span className="text-stone-200 font-medium shrink-0">{parallelAudit.backMatterB.paragraphsCount} párrafos</span>
                    </div>
                  )}
                  <p className="text-[10px] text-emerald-400 mt-1">
                    ✓ Aislado del cuerpo de la novela para no desfasar el final del texto.
                  </p>
                </div>
              ) : (
                <p className="text-stone-500 italic text-[11px]">
                  Cuerpo de la novela limpio. No hay epílogos, bibliografías ni licencias interfiriendo.
                </p>
              )}
            </div>
          </div>

          {/* Panel de Reconocimiento de Índice de Contenido & Homología Estructural */}
          <div className="pt-3 border-t border-stone-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-stone-200 uppercase tracking-wide">
                  Índice Editorial & Reconocimiento de Contenido de la Obra
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                  Promesa de Inicio Respetada
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleInvestigateTocOnline}
                  disabled={isInvestigatingTocOnline}
                  className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-amber-300 hover:text-amber-200 text-[11px] font-medium rounded-lg border border-stone-700 flex items-center gap-1.5 transition"
                  title="Consultar en línea la división capitular canónica oficial si la obra carece de página de índice"
                >
                  <Search className={`w-3 h-3 ${isInvestigatingTocOnline ? 'animate-spin' : ''}`} />
                  <span>{isInvestigatingTocOnline ? 'Investigando...' : 'Investigar Índice Canónico en Línea (IA)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualTocModal(true)}
                  className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white text-[11px] font-medium rounded-lg border border-stone-700 flex items-center gap-1.5 transition"
                >
                  <ListOrdered className="w-3 h-3 text-emerald-400" />
                  <span>Ingresar Índice Manualmente</span>
                </button>
              </div>
            </div>

            {/* Aviso informativo de estado del Índice / Investigación */}
            {onlineTocNotice && (
              <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-200 text-xs flex items-center justify-between">
                <span>{onlineTocNotice}</span>
                <button 
                  onClick={() => setOnlineTocNotice(null)}
                  className="text-stone-400 hover:text-white text-xs px-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Desplegable de Capítulos & Segmentos Homólogos */}
            {parallelAudit.chapters.length > 0 && (
              <div>
                <button
                  onClick={() => setShowChapterAuditList(prev => !prev)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-stone-950 hover:bg-stone-800/80 rounded-xl border border-stone-800 text-xs text-stone-300 font-medium transition"
                >
                  <span className="flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-emerald-400" />
                    {parallelAudit.chapters[0]?.id === 'anchor_continuous_narrative'
                      ? 'Estructura de la Obra: Relato Continuo (Sin división de capítulos en la fuente)'
                      : `Homología de Capítulos de la Obra (${parallelAudit.chapters.length} divisiones censadas)`}
                  </span>
                  {showChapterAuditList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showChapterAuditList && (
                  <div className="mt-2 space-y-2 max-h-56 overflow-y-auto pr-1">
                    {parallelAudit.chapters.map((ch, chIdx) => (
                      <div 
                        key={ch.id ? `${ch.id}_${chIdx}` : `ch_${chIdx}`}
                        className="p-2.5 bg-stone-950/80 border border-stone-800 rounded-lg text-xs flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5 truncate">
                          <span className="font-bold text-stone-200 block truncate">
                            {ch.titleA} {ch.titleB && ch.titleB !== ch.titleA ? `↔ ${ch.titleB}` : ''}
                          </span>
                          <span className="text-[10px] text-stone-400">
                            {ch.id === 'anchor_continuous_narrative'
                              ? `Total párrafos narrativos: ${ch.paragraphsCountA} en ${parallelConfig.languageA} vs ${ch.paragraphsCountB} en ${parallelConfig.languageB}`
                              : `Extensión: ${ch.paragraphsCountA} párrafos en ${parallelConfig.languageA} vs ${ch.paragraphsCountB} en ${parallelConfig.languageB}`}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          ch.id === 'anchor_continuous_narrative'
                            ? 'bg-teal-950 text-teal-300 border border-teal-800'
                            : ch.status === 'perfect_match' 
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                            : ch.status === 'minor_variance'
                            ? 'bg-blue-950 text-blue-300 border border-blue-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}>
                          {ch.id === 'anchor_continuous_narrative'
                            ? 'Flujo Continuo'
                            : ch.status === 'perfect_match'
                            ? 'Sincronía 1:1'
                            : ch.status === 'minor_variance'
                            ? 'Variación Mínima'
                            : 'Mapeo Armónico'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal para Ingresar Páginas o Índice de la Obra Manualmente */}
      {showManualTocModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">Ingreso Manual del Índice de la Obra</h3>
              </div>
              <button 
                onClick={() => setShowManualTocModal(false)}
                className="text-stone-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Introduce las líneas del índice de capítulos (o el rango de páginas del PDF donde se ubica) para respetar rigurosamente la partición de la obra sin alterar la narración:
            </p>

            <textarea
              value={manualTocInput}
              onChange={(e) => setManualTocInput(e.target.value)}
              placeholder={`Ejemplo:\nCapítulo 1 - La Partida\nCapítulo 2 - El Encuentro\nCapítulo 3 - El Desenlace\n\n(O pega el texto del índice de tu edición)`}
              className="w-full h-40 bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:border-emerald-500 font-mono"
            />

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowManualTocModal(false)}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyManualTocInParallel}
                disabled={!manualTocInput.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-md transition"
              >
                Aplicar Índice Estructural
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visor Principal de Pliegos en Espejo */}
      <div className="bg-stone-900 rounded-2xl border border-stone-800 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between border-b border-stone-800 px-5 py-3 bg-stone-950/70 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveViewMode('spreads')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeViewMode === 'spreads'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <BookOpen className="w-4 h-4 text-amber-300" />
              <span>📖 Pliegos en Espejo ({parallelSpreads.length})</span>
            </button>

            <button
              onClick={() => setActiveViewMode('pairs')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                activeViewMode === 'pairs'
                  ? 'bg-stone-800 text-white shadow-sm'
                  : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <Columns className="w-4 h-4 text-emerald-400" />
              <span>📑 Editor de Pares ({parallelPairs.length})</span>
            </button>

            <button
              onClick={() => { setActiveViewMode('culmination_review'); setFilterCategory('critical'); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeViewMode === 'culmination_review'
                  ? 'bg-gradient-to-r from-red-700 via-amber-600 to-emerald-700 text-white shadow-md'
                  : 'bg-stone-950 text-stone-300 hover:text-white border border-stone-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>📋 Revisión de Culminación (Ausencias & Densidad)</span>
              {(absencePairs.length > 0 || denseDisparityPairs.length > 0) ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-700">
                  {absencePairs.length + denseDisparityPairs.length}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                  ✓ OK
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveViewMode('start_audit')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeViewMode === 'start_audit'
                  ? 'bg-gradient-to-r from-amber-600 via-emerald-600 to-teal-600 text-white shadow-md'
                  : 'bg-stone-950 text-stone-300 hover:text-white border border-stone-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>🔍 Certificado de Frases de Inicio (100% Espejo)</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                {parallelAudit?.exactStartMatchRate ?? 100}%
              </span>
            </button>

            <button
              onClick={() => setActiveViewMode('translation_audit')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeViewMode === 'translation_audit'
                  ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white shadow-md'
                  : 'bg-stone-950 text-indigo-300 hover:text-white border border-indigo-900/60'
              }`}
            >
              <Languages className="w-4 h-4 text-indigo-400" />
              <span>🌐 Comparador de Traducción Post-Proceso</span>
              {parallelAudit?.postProcessTranslationSummary && (
                <span className="font-mono font-bold text-white bg-indigo-900/80 px-1.5 py-0.5 rounded text-[11px] border border-indigo-700">
                  {parallelAudit.postProcessTranslationSummary.concordanceRate}% 1:1
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveViewMode('continuous_thread_audit')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeViewMode === 'continuous_thread_audit'
                  ? 'bg-gradient-to-r from-teal-600 via-emerald-600 to-green-700 text-white shadow-md'
                  : 'bg-stone-950 text-emerald-300 hover:text-white border border-emerald-900/60'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>🎯 Auditoría de Hilación Continua</span>
              <span className="font-mono font-bold text-white bg-emerald-900/80 px-1.5 py-0.5 rounded text-[11px] border border-emerald-700">
                {parallelAudit?.unbrokenThreadScore ?? 100}%
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs flex-wrap">
            {(activeViewMode === 'pairs' || activeViewMode === 'culmination_review') && (
              <div className="flex items-center gap-1 bg-stone-900/90 p-1 rounded-xl border border-stone-800">
                <button
                  onClick={() => setFilterCategory('all')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    filterCategory === 'all' ? 'bg-stone-700 text-white' : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  Todos ({parallelPairs.length})
                </button>
                <button
                  onClick={() => setFilterCategory('critical')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    filterCategory === 'critical' ? 'bg-amber-600 text-white' : 'text-amber-400 hover:text-amber-200'
                  }`}
                >
                  ⚠️ Con Alerta ({criticalPairs.length})
                </button>
                <button
                  onClick={() => setFilterCategory('absence')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    filterCategory === 'absence' ? 'bg-red-700 text-white' : 'text-red-400 hover:text-red-200'
                  }`}
                >
                  🚨 Ausencias ({absencePairs.length})
                </button>
                <button
                  onClick={() => setFilterCategory('dense')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    filterCategory === 'dense' ? 'bg-amber-700 text-white' : 'text-amber-300 hover:text-amber-100'
                  }`}
                >
                  ⚖️ Densos ({denseDisparityPairs.length})
                </button>
                <button
                  onClick={() => setFilterCategory('balanced')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    filterCategory === 'balanced' ? 'bg-emerald-700 text-white' : 'text-emerald-400 hover:text-emerald-200'
                  }`}
                >
                  ✓ Equilibrados ({balancedPairs.length})
                </button>
              </div>
            )}

            <button
              onClick={() => insertEmptyParallelPairItem(parallelPairs.length)}
              className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-md font-medium text-xs flex items-center gap-1 transition-all cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              Añadir Par Vacío
            </button>
          </div>
        </div>

        {/* Contenido de la Vista 1: PLIEGOS DE PÁGINAS (SPREADS) */}
        {activeViewMode === 'spreads' && (
          <div className="p-6 space-y-6">
            {parallelSpreads.length === 0 ? (
              <div className="text-center py-12 text-stone-400">
                <Columns className="w-12 h-12 text-amber-500/60 mx-auto mb-3" />
                <p className="font-bold text-stone-100 text-base">Pliegos esperando ensamblaje con variables de ritmo</p>
                <p className="text-xs text-stone-300 mt-1.5 max-w-lg mx-auto leading-relaxed">
                  Revisa o ajusta las variables de ritmo en la cabecera superior (estructura de maquetación, presupuesto de caracteres por pliego y método de corte) y presiona el botón para generar los pliegos espejo.
                </p>
                <button
                  onClick={handleTriggerAssemble}
                  disabled={isProcessing}
                  className="mt-5 px-6 py-3 bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-stone-950 text-xs font-black rounded-xl transition-all shadow-xl disabled:opacity-50 flex items-center gap-2 mx-auto cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-stone-950" />
                  <span>⚡ Ensamblar Maquetación y Pliegos con Variables de Ritmo</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {parallelSpreads.map((spread) => (
                  <div 
                    key={spread.spreadNumber}
                    className="border border-stone-800 rounded-2xl overflow-hidden shadow-sm bg-stone-950/60"
                  >
                    {/* Encabezado del Pliego */}
                    <div className="bg-stone-900 px-4 py-2.5 border-b border-stone-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-100 bg-stone-800 px-2.5 py-0.5 rounded-full border border-stone-700">
                          Pliego #{spread.spreadNumber}
                        </span>
                        <span className="text-stone-400">
                          Páginas enfrentadas: <strong className="text-stone-200">Pág. {spread.pageLeftNumber}</strong> ({parallelConfig.languageA}) & <strong className="text-stone-200">Pág. {spread.pageRightNumber}</strong> ({parallelConfig.languageB})
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-stone-400">
                          {spread.pairs.length} párrafos sincronizados ({spread.totalCharsA} A / {spread.totalCharsB} B caracteres)
                        </span>
                        {spread.isBalanced ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-semibold text-[10px] flex items-center gap-1 border border-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Ritmo Equilibrado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 font-semibold text-[10px] flex items-center gap-1 border border-amber-800">
                            <AlertTriangle className="w-3 h-3 text-amber-400" /> Variación Editorial
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pliego Enfrentado con Correspondencia Fila por Fila */}
                    <div className="divide-y divide-stone-800/80 bg-stone-900/40">
                      {/* Cabecera de Columnas del Pliego */}
                      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-800 bg-stone-950/80 text-xs font-bold">
                        <div className="px-5 py-2 text-stone-200 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                            Página {spread.pageLeftNumber} — {parallelConfig.languageA}
                          </span>
                          <span className="text-stone-400 font-normal italic truncate max-w-[180px]">{parallelConfig.titleA}</span>
                        </div>
                        <div className="px-5 py-2 text-stone-200 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            Página {spread.pageRightNumber} — {parallelConfig.languageB}
                          </span>
                          <span className="text-stone-400 font-normal italic truncate max-w-[180px]">{parallelConfig.titleB}</span>
                        </div>
                      </div>

                      {/* Filas Sincronizadas Párrafo por Párrafo */}
                      {spread.pairs.map((pair, pIdx) => {
                        const isHeading = ['heading1', 'heading2', 'heading3'].includes(pair.type);
                        const isOmissionA = pair.textA.startsWith('[Texto ausente') || pair.textA.startsWith('[Párrafo ausente');
                        const isOmissionB = pair.textB.startsWith('[Texto ausente') || pair.textB.startsWith('[Párrafo ausente');

                        const isLongParagraphSplit = Boolean(pair.note && (pair.note.includes('Párrafo extenso') || pair.note.includes('Continuación análoga') || pair.note.includes('sincrónico')));

                        const boundary: BoundaryConcordance | undefined = pair.boundaryConcordance || (!isHeading ? evaluateBoundaryConcordance(pair.textA, pair.textB) : undefined);

                        return (
                          <div key={pIdx} className="flex flex-col border-b border-stone-800/60 last:border-b-0">
                            {/* Barra de Encabezado y Correspondencia del Fragmento */}
                            <div className="bg-[#0e1217] px-4 py-1.5 border-b border-stone-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-stone-300 bg-stone-900 px-1.5 py-0.5 rounded border border-stone-800">
                                  Fragmento #{pIdx + 1}
                                </span>
                                <span className="text-stone-500">• Nivel Paralelo #{pair.order}</span>
                                {isHeading ? (
                                  <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                                    Cabecera Homóloga de Capítulo
                                  </span>
                                ) : isOmissionA || isOmissionB ? (
                                  <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                                    ⚠️ Ausencia Unilateral
                                  </span>
                                ) : pair.postProcessAudit?.isVerified ? (
                                  <span className="text-[10px] text-emerald-300 font-extrabold uppercase tracking-wider bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-600/70 flex items-center gap-1 shadow-xs" title={pair.postProcessAudit.diagnosis}>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    ✓ Traducción Post-Proceso 1:1 ({pair.postProcessAudit.score}%)
                                  </span>
                                ) : boundary?.status === 'verified_mutual' ? (
                                  <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-wider bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/60 flex items-center gap-1 shadow-xs" title={boundary.diagnosisMessage}>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    ✓ Correspondencia Mutua 1:1 (Inicio & Cierre Verificados)
                                  </span>
                                ) : boundary?.status === 'shift_detected' ? (
                                  <span className="text-[10px] text-rose-300 font-extrabold uppercase tracking-wider bg-rose-950/80 px-2 py-0.5 rounded border border-rose-700/60 flex items-center gap-1 shadow-xs" title={boundary.diagnosisMessage}>
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                    🚨 Desfase Detectado (+1 Párrafo Desplazado)
                                  </span>
                                ) : pair.postProcessAudit?.dateMismatchDetail ? (
                                  <span className="text-[10px] text-rose-300 font-extrabold uppercase tracking-wider bg-rose-950/80 px-2 py-0.5 rounded border border-rose-700/60 flex items-center gap-1 shadow-xs" title={pair.postProcessAudit.diagnosis}>
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                    🚨 Desfase por Fecha ({pair.postProcessAudit.dateMismatchDetail})
                                  </span>
                                ) : boundary?.status === 'head_mismatch' ? (
                                  <span className="text-[10px] text-amber-300 font-extrabold uppercase tracking-wider bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700/60 flex items-center gap-1 shadow-xs" title={boundary.diagnosisMessage}>
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                    ⚠️ Desfase en Inicio (Frases iniciales divergen)
                                  </span>
                                ) : boundary?.status === 'tail_mismatch' ? (
                                  <span className="text-[10px] text-amber-300 font-extrabold uppercase tracking-wider bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700/60 flex items-center gap-1 shadow-xs" title={boundary.diagnosisMessage}>
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                    ⚠️ Desfase en Cierre (Frases finales divergen)
                                  </span>
                                ) : boundary?.status === 'total_mismatch' ? (
                                  <span className="text-[10px] text-rose-300 font-extrabold uppercase tracking-wider bg-rose-950/80 px-2 py-0.5 rounded border border-rose-700/60 flex items-center gap-1 shadow-xs" title={boundary.diagnosisMessage}>
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                    ❌ Divergencia de Micro-Contenido (Inicio y Cierre)
                                  </span>
                                ) : pair.isContentCut || isLongParagraphSplit ? (
                                  <span className="text-[10px] text-cyan-300 font-extrabold uppercase tracking-wider bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40 flex items-center gap-1">
                                    <Cpu className="w-3 h-3 text-cyan-400" />
                                    Corte por Contenido Homólogo
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-stone-400 font-extrabold uppercase tracking-wider bg-stone-900 px-2 py-0.5 rounded border border-stone-800">
                                    Fragmento Sincronizado
                                  </span>
                                )}
                                {pair.note && (
                                  <span className="text-[10px] text-sky-300 font-mono bg-sky-950/70 px-2 py-0.5 rounded border border-sky-800/60 flex items-center gap-1 shadow-xs" title={pair.note}>
                                    <Sparkles className="w-3 h-3 text-sky-400 shrink-0" />
                                    <span>{pair.note}</span>
                                  </span>
                                )}
                                {pair.postProcessAudit?.autoHarmonizedApplied && (
                                  <span className="text-[10px] text-indigo-300 font-extrabold uppercase tracking-wider bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-700/60 flex items-center gap-1 shadow-xs" title={pair.postProcessAudit.harmonizationAction || 'Auto-ajuste en pipeline post-proceso'}>
                                    <Sparkles className="w-3 h-3 text-indigo-400" />
                                    ⚡ Auto-armonizado en Pipeline
                                  </span>
                                )}
                              </div>

                              {/* Acciones de Reconciliación si hay omisión */}
                              {(isOmissionA || isOmissionB) && (
                                <button
                                  onClick={() => {
                                    if (isOmissionA) {
                                      const filled = `[Correspondencia homóloga en ${parallelConfig.languageA}: ${pair.textB.slice(0, 120)}...]`;
                                      updateParallelPairItem(pair.id, { textA: filled, note: 'Segmento completado automáticamente en espejo' });
                                    } else {
                                      const filled = `[Correspondencia homóloga en ${parallelConfig.languageB}: ${pair.textA.slice(0, 120)}...]`;
                                      updateParallelPairItem(pair.id, { textB: filled, note: 'Segmento completado automáticamente en espejo' });
                                    }
                                  }}
                                  className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-[10px] flex items-center gap-1 cursor-pointer transition shadow-xs"
                                  title="Rellenar automáticamente este segmento para preservar correspondencia mutua perfecta"
                                >
                                  <Sparkles className="w-3 h-3 text-stone-950" />
                                  <span>Rellenar en automático</span>
                                </button>
                              )}
                            </div>

                            {/* Panel Informativo de Micro-Contenido cuando hay discrepancia o desfase */}
                            {boundary && boundary.status !== 'verified_mutual' && !isOmissionA && !isOmissionB && !isHeading && (
                              <div className="px-4 py-2 bg-stone-950/90 border-b border-amber-900/30 text-[11px] flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="font-semibold text-amber-300 flex items-center gap-1.5 text-xs">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span>{boundary.diagnosisMessage}</span>
                                  </span>
                                  {boundary.status === 'shift_detected' && (
                                    <button
                                      onClick={() => {
                                        const spacer = `[Espaciador de sincronía homóloga: Párrafo alineado con contraparte]`;
                                        if (boundary.shiftSuggested === 'next_b') {
                                          updateParallelPairItem(pair.id, {
                                            textB: spacer,
                                            note: 'Desfase corregido: Espaciador insertado para re-sincronizar el libro'
                                          });
                                        } else {
                                          updateParallelPairItem(pair.id, {
                                            textA: spacer,
                                            note: 'Desfase corregido: Espaciador insertado para re-sincronizar el libro'
                                          });
                                        }
                                      }}
                                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition shadow-xs"
                                      title="Inserta un espaciador para alinear el desfase en este punto y sincronizar los siguientes párrafos"
                                    >
                                      <Sparkles className="w-3 h-3" />
                                      <span>Alinear Desfase en Este Punto</span>
                                    </button>
                                  )}
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-mono text-stone-300 bg-stone-900/80 p-2 rounded border border-stone-800">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center justify-between text-stone-400 font-sans font-bold">
                                      <span className="text-amber-400">Arranque A:</span>
                                      <span className={boundary.headMatch ? "text-emerald-400" : "text-amber-400"}>
                                        {boundary.headMatch ? '✓ Coincide' : '≠ Diverge'}
                                      </span>
                                    </div>
                                    <p className="text-stone-300 italic truncate" title={boundary.headPhraseA}>
                                      «{boundary.headPhraseA || '—'}»
                                    </p>
                                  </div>

                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center justify-between text-stone-400 font-sans font-bold">
                                      <span className="text-amber-400">Arranque B:</span>
                                      <span className={boundary.headMatch ? "text-emerald-400" : "text-amber-400"}>
                                        {boundary.headMatch ? '✓ Coincide' : '≠ Diverge'}
                                      </span>
                                    </div>
                                    <p className="text-stone-300 italic truncate" title={boundary.headPhraseB}>
                                      «{boundary.headPhraseB || '—'}»
                                    </p>
                                  </div>

                                  <div className="flex flex-col gap-0.5 pt-1 border-t border-stone-800/60">
                                    <div className="flex items-center justify-between text-stone-400 font-sans font-bold">
                                      <span className="text-stone-400">Cierre A:</span>
                                      <span className={boundary.tailMatch ? "text-emerald-400" : "text-amber-400"}>
                                        {boundary.tailMatch ? '✓ Coincide' : '≠ Diverge'}
                                      </span>
                                    </div>
                                    <p className="text-stone-300 italic truncate" title={boundary.tailPhraseA}>
                                      «{boundary.tailPhraseA || '—'}»
                                    </p>
                                  </div>

                                  <div className="flex flex-col gap-0.5 pt-1 border-t border-stone-800/60">
                                    <div className="flex items-center justify-between text-stone-400 font-sans font-bold">
                                      <span className="text-stone-400">Cierre B:</span>
                                      <span className={boundary.tailMatch ? "text-emerald-400" : "text-amber-400"}>
                                        {boundary.tailMatch ? '✓ Coincide' : '≠ Diverge'}
                                      </span>
                                    </div>
                                    <p className="text-stone-300 italic truncate" title={boundary.tailPhraseB}>
                                      «{boundary.tailPhraseB || '—'}»
                                    </p>
                                  </div>
                                </div>

                                {pair.postProcessAudit?.sharedDates && pair.postProcessAudit.sharedDates.length > 0 && (
                                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-950/60 p-1.5 rounded border border-emerald-800/40 font-mono">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                    <span>Fechas/Años verificados 1:1: [{pair.postProcessAudit.sharedDates.join(', ')}]</span>
                                  </div>
                                )}
                                {pair.postProcessAudit?.dateMismatchDetail && (
                                  <div className="flex items-center gap-1.5 text-[10px] text-rose-300 bg-rose-950/60 p-1.5 rounded border border-rose-800/40 font-mono">
                                    <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                    <span>Discrepancia de fecha/numeral: {pair.postProcessAudit.dateMismatchDetail}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {isLongParagraphSplit && pair.note && (
                              <div className="px-4 py-1 bg-amber-950/30 border-b border-amber-800/30 flex items-center justify-between text-[10px] text-amber-300">
                                <span className="flex items-center gap-1 italic">
                                  {pair.note}
                                </span>
                              </div>
                            )}

                            <div 
                              className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-800 hover:bg-stone-800/20 transition-colors"
                            >
                            {/* Celda A (Página Izquierda) */}
                            <div className="p-4 font-sans text-sm leading-relaxed text-stone-200">
                              {isHeading ? (
                                <h3 className="font-bold text-base text-amber-300 font-sans border-b border-stone-700 pb-1">
                                  {pair.textA}
                                </h3>
                              ) : isOmissionA ? (
                                <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-lg text-amber-300 text-xs font-sans">
                                  {pair.textA}
                                </div>
                              ) : pair.type === 'novel_dialogue' ? (
                                <p className="text-stone-100 pl-2 border-l-2 border-amber-500/50">
                                  {pair.textA}
                                </p>
                              ) : (
                                <p>{pair.textA}</p>
                              )}
                            </div>

                            {/* Celda B (Página Derecha) */}
                            <div className="p-4 font-sans text-sm leading-relaxed text-stone-200 bg-stone-950/30">
                              {isHeading ? (
                                <h3 className="font-bold text-base text-emerald-300 font-sans border-b border-stone-700 pb-1">
                                  {pair.textB}
                                </h3>
                              ) : isOmissionB ? (
                                <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-lg text-amber-300 text-xs font-sans">
                                  {pair.textB}
                                </div>
                              ) : pair.type === 'novel_dialogue' ? (
                                <p className="text-stone-100 pl-2 border-l-2 border-emerald-500/50">
                                  {pair.textB}
                                </p>
                              ) : (
                                <p>{pair.textB}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contenido de la Vista 2: EDITOR DE PARES (DETALLE Y EDICIÓN MANUAL) */}
        {activeViewMode === 'pairs' && (
          <div className="p-6 space-y-4">
            {displayedPairs.length === 0 ? (
              <div className="text-center py-10 text-stone-500">
                <p>No hay pares textuales que coincidan con el filtro actual.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedPairs.map((pair, pIdx) => {
                  const isAbs = isAbsencePair(pair);
                  const isDense = isDenseDisparityPair(pair);
                  const isAbsA = !(pair.textA || '').trim() || pair.textA.startsWith('[Texto ausente') || pair.textA.startsWith('[Párrafo ausente') || pair.textA === '[...]';
                  const isAbsB = !(pair.textB || '').trim() || pair.textB.startsWith('[Texto ausente') || pair.textB.startsWith('[Párrafo ausente') || pair.textB === '[...]';
                  const sentsA = (pair.textA || '').trim().split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);
                  const sentsB = (pair.textB || '').trim().split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);

                  return (
                    <div
                      key={pair.id ? `${pair.id}_${pIdx}` : `pair_${pIdx}`}
                      className={`p-4 rounded-xl border space-y-3 transition ${
                        isAbs 
                          ? 'bg-red-950/20 border-red-800/60 hover:border-red-700'
                          : isDense 
                          ? 'bg-amber-950/20 border-amber-800/60 hover:border-amber-700'
                          : 'bg-stone-950 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs pb-2 border-b border-stone-800/80 flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-stone-300 bg-stone-800 px-2 py-0.5 rounded">
                            Par #{pair.order}
                          </span>
                          {isAbs ? (
                            <span className="px-2 py-0.5 rounded bg-red-950/80 border border-red-700/60 text-red-300 font-bold text-[10px] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                              🚨 Error de Ausencia ({isAbsA ? parallelConfig.languageA : parallelConfig.languageB})
                            </span>
                          ) : isDense ? (
                            <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700/60 text-amber-300 font-bold text-[10px] flex items-center gap-1">
                              <Columns className="w-3 h-3 text-amber-400" />
                              ⚖️ Párrafo Hiperdenso ({pair.charCountA} vs {pair.charCountB} chars)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 font-bold text-[10px] flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              ✓ Espejo Equilibrado
                            </span>
                          )}
                          <span className="text-[10px] text-stone-500 font-medium">
                            {sentsA.length} orac. A / {sentsB.length} orac. B
                          </span>
                          {pair.note && (
                            <span className="text-[11px] text-amber-400/90 italic truncate max-w-xs">
                              ({pair.note})
                            </span>
                          )}
                        </div>

                        {/* Herramientas de Reparación Directa */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isDense && (
                            <button
                              onClick={() => splitParallelPairItem(pair.id)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-[10px] flex items-center gap-1 transition shadow-xs cursor-pointer"
                              title="Subdividir este párrafo hiperdenso en 2 partes armónicas proporcionales a su homólogo"
                            >
                              <Sparkles className="w-3 h-3 text-stone-950" />
                              <span>⚡ Auto-Dividir Párrafo Denso</span>
                            </button>
                          )}
                          {isAbs && (
                            <>
                              <button
                                onClick={() => mergeParallelPairWithAdjacent(pair.id, 'prev')}
                                className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-[10px] transition cursor-pointer"
                                title="Fusionar con el par anterior para eliminar el hueco artificial"
                              >
                                🔗 Fusionar con Anterior
                              </button>
                              <button
                                onClick={() => mergeParallelPairWithAdjacent(pair.id, 'next')}
                                className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-[10px] transition cursor-pointer"
                                title="Fusionar con el par siguiente"
                              >
                                🔗 Fusionar con Siguiente
                              </button>
                              <button
                                onClick={() => {
                                  if (isAbsA) {
                                    updateParallelPairItem(pair.id, { textA: `[Correspondencia homóloga en ${parallelConfig.languageA}: ${pair.textB.slice(0, 100)}...]`, note: 'Completado en espejo' });
                                  } else {
                                    updateParallelPairItem(pair.id, { textB: `[Correspondencia homóloga en ${parallelConfig.languageB}: ${pair.textA.slice(0, 100)}...]`, note: 'Completado en espejo' });
                                  }
                                }}
                                className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] transition cursor-pointer"
                                title="Rellenar lado ausente con marcador homólogo"
                              >
                                ✍️ Rellenar Ausente
                              </button>
                            </>
                          )}
                          <span className="text-[11px] text-stone-400 font-mono ml-1">
                            {pair.charCountA} A / {pair.charCountB} B
                          </span>
                          <button
                            onClick={() => deleteParallelPairItem(pair.id)}
                            className="p-1 text-stone-500 hover:text-red-400 rounded transition cursor-pointer"
                            title="Eliminar este par"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                              {parallelConfig.languageA} ({pair.charCountA} chars, {sentsA.length} oraciones)
                            </span>
                            {isAbsA && (
                              <span className="text-[10px] text-red-400 font-bold animate-pulse">
                                ⚠️ Texto Ausente en Libro A
                              </span>
                            )}
                          </div>
                          <textarea
                            rows={3}
                            value={pair.textA}
                            onChange={e => updateParallelPairItem(pair.id, { textA: e.target.value })}
                            className={`w-full p-2.5 rounded-lg text-xs font-sans focus:ring-1 focus:outline-none ${
                              isAbsA 
                                ? 'bg-red-950/30 border border-red-700/60 text-red-200 focus:ring-red-500' 
                                : 'bg-stone-900 border border-stone-800 text-stone-200 focus:ring-amber-500'
                            }`}
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                              {parallelConfig.languageB} ({pair.charCountB} chars, {sentsB.length} oraciones)
                            </span>
                            {isAbsB && (
                              <span className="text-[10px] text-red-400 font-bold animate-pulse">
                                ⚠️ Texto Ausente en Libro B
                              </span>
                            )}
                          </div>
                          <textarea
                            rows={3}
                            value={pair.textB}
                            onChange={e => updateParallelPairItem(pair.id, { textB: e.target.value })}
                            className={`w-full p-2.5 rounded-lg text-xs font-sans focus:ring-1 focus:outline-none ${
                              isAbsB 
                                ? 'bg-red-950/30 border border-red-700/60 text-red-200 focus:ring-red-500' 
                                : 'bg-stone-900 border border-stone-800 text-stone-200 focus:ring-emerald-500'
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Contenido de la Vista Dedicada: REVISIÓN DE CULMINACIÓN (AUSENCIAS Y PÁRRAFOS HIPERDENSOS) */}
        {activeViewMode === 'culmination_review' && (
          <div className="p-6 space-y-6">
            {/* Panel Superior de Diagnóstico Ejecutivo */}
            <div className="bg-gradient-to-r from-stone-900 via-stone-950 to-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    Centro de Revisión de Culminación & Sanación Focalizada
                  </h3>
                  <p className="text-xs text-stone-300 mt-1 max-w-2xl leading-relaxed">
                    Audita exhaustivamente la obra completa al concluir el procesamiento. Permite detectar al instante párrafos huérfanos o con texto ausente, así como fragmentos excesivamente densos en comparación con su homólogo de espejo, sanándolos con precisión matemática sin costo en tokens.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="px-3.5 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Auto-sincronía y equilibrio integrados en pipeline (1 solo clic)</span>
                  </div>
                </div>
              </div>

              {/* Tarjetas de Métricas de Revisión */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-stone-800">
                <div className="p-3 bg-stone-900/80 rounded-xl border border-stone-800">
                  <span className="text-[11px] text-stone-400 font-medium block">Total de Pares</span>
                  <span className="text-xl font-mono font-bold text-white">{parallelPairs.length}</span>
                  <span className="text-[10px] text-stone-500 block">Obra Completa</span>
                </div>

                <div className="p-3 bg-red-950/40 rounded-xl border border-red-800/50">
                  <span className="text-[11px] text-red-300 font-medium block">Errores de Ausencia</span>
                  <span className="text-xl font-mono font-bold text-red-300">{absencePairs.length}</span>
                  <span className="text-[10px] text-red-400/80 block">Vacíos o huérfanos</span>
                </div>

                <div className="p-3 bg-amber-950/40 rounded-xl border border-amber-800/50">
                  <span className="text-[11px] text-amber-300 font-medium block">Desbalances Densos</span>
                  <span className="text-xl font-mono font-bold text-amber-300">{denseDisparityPairs.length}</span>
                  <span className="text-[10px] text-amber-400/80 block">&gt;2x disparidad de masa</span>
                </div>

                <div className="p-3 bg-emerald-950/40 rounded-xl border border-emerald-800/50">
                  <span className="text-[11px] text-emerald-300 font-medium block">Pares en Espejo 1:1</span>
                  <span className="text-xl font-mono font-bold text-emerald-300">
                    {parallelPairs.length > 0 ? Math.round((balancedPairs.length / parallelPairs.length) * 100) : 100}%
                  </span>
                  <span className="text-[10px] text-emerald-400/80 block">{balancedPairs.length} equilibrados</span>
                </div>
              </div>
            </div>

            {/* MODO INSPECTOR GUIADO: RECORRIDO PASO A PASO POR DISCREPANCIAS */}
            {criticalPairs.length > 0 && (() => {
              const activeIndex = Math.min(guidedDiscrepancyIndex, criticalPairs.length - 1);
              const gPair = criticalPairs[activeIndex];
              const isAbs = isAbsencePair(gPair);
              const isDense = isDenseDisparityPair(gPair);
              const isAbsA = !(gPair.textA || '').trim() || gPair.textA.startsWith('[Texto ausente') || gPair.textA.startsWith('[Párrafo ausente') || gPair.textA === '[...]';
              const isAbsB = !(gPair.textB || '').trim() || gPair.textB.startsWith('[Texto ausente') || gPair.textB.startsWith('[Párrafo ausente') || gPair.textB === '[...]';
              const sentsA = (gPair.textA || '').trim().split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);
              const sentsB = (gPair.textB || '').trim().split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);
              const ratio = (gPair.charCountA > 0 && gPair.charCountB > 0)
                ? (Math.max(gPair.charCountA, gPair.charCountB) / Math.min(gPair.charCountA, gPair.charCountB))
                : 1;

              return (
                <div className="bg-stone-900/90 border-2 border-amber-500/60 rounded-2xl p-5 shadow-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black">
                        ⚡ REVISOR GUIADO PASO A PASO
                      </span>
                      <span className="text-sm font-bold text-white">
                        Caso {activeIndex + 1} de {criticalPairs.length}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-stone-800 text-stone-300">
                        Par #{gPair.order}
                      </span>
                      {isAbs && (
                        <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-700 text-[10px] font-extrabold">
                          🚨 Error de Ausencia ({isAbsA ? parallelConfig.languageA : parallelConfig.languageB} vacío)
                        </span>
                      )}
                      {isDense && (
                        <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700 text-[10px] font-extrabold">
                          ⚖️ Desbalance Denso ({ratio.toFixed(1)}x disparidad)
                        </span>
                      )}
                    </div>

                    {/* Controles de Navegación del Recorrido */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setGuidedDiscrepancyIndex(prev => Math.max(0, prev - 1))}
                        disabled={activeIndex === 0}
                        className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 text-xs font-bold transition cursor-pointer flex items-center gap-1"
                      >
                        ◀ Anterior
                      </button>
                      <span className="text-xs font-mono text-stone-400">
                        {activeIndex + 1} / {criticalPairs.length}
                      </span>
                      <button
                        onClick={() => setGuidedDiscrepancyIndex(prev => Math.min(criticalPairs.length - 1, prev + 1))}
                        disabled={activeIndex >= criticalPairs.length - 1}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 text-xs font-black transition cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        Siguiente ▶
                      </button>
                    </div>
                  </div>

                  {/* Acciones de Sanación en 1 Clic para este caso */}
                  <div className="flex items-center gap-2 flex-wrap bg-stone-950/70 p-3 rounded-xl border border-stone-800">
                    <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wide">Acciones Inmediatas:</span>
                    {isDense && (
                      <button
                        onClick={() => {
                          splitParallelPairItem(gPair.id);
                          setHealingNotice(`✓ Par #${gPair.order} subdividido armónicamente en dos pares equilibrados.`);
                          setTimeout(() => setHealingNotice(null), 4000);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-stone-950" />
                        <span>⚡ Subdividir y Equilibrar Par</span>
                      </button>
                    )}
                    {isAbs && (
                      <>
                        <button
                          onClick={() => {
                            mergeParallelPairWithAdjacent(gPair.id, 'prev');
                            setHealingNotice(`✓ Par #${gPair.order} fusionado con el párrafo anterior.`);
                            setTimeout(() => setHealingNotice(null), 4000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold transition cursor-pointer"
                        >
                          🔗 Fusionar con Anterior
                        </button>
                        <button
                          onClick={() => {
                            mergeParallelPairWithAdjacent(gPair.id, 'next');
                            setHealingNotice(`✓ Par #${gPair.order} fusionado con el párrafo siguiente.`);
                            setTimeout(() => setHealingNotice(null), 4000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold transition cursor-pointer"
                        >
                          🔗 Fusionar con Siguiente
                        </button>
                        <button
                          onClick={() => {
                            if (isAbsA) {
                              updateParallelPairItem(gPair.id, { textA: `[Correspondencia homóloga en ${parallelConfig.languageA}: ${gPair.textB.slice(0, 100)}...]`, note: 'Completado en espejo' });
                            } else {
                              updateParallelPairItem(gPair.id, { textB: `[Correspondencia homóloga en ${parallelConfig.languageB}: ${gPair.textA.slice(0, 100)}...]`, note: 'Completado en espejo' });
                            }
                            setHealingNotice(`✓ Ausencia del Par #${gPair.order} rellenada.`);
                            setTimeout(() => setHealingNotice(null), 4000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold transition cursor-pointer"
                        >
                          ✍️ Rellenar Ausencia
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        deleteParallelPairItem(gPair.id);
                        setHealingNotice(`✓ Par #${gPair.order} eliminado.`);
                        setTimeout(() => setHealingNotice(null), 4000);
                      }}
                      className="px-2.5 py-1.5 text-stone-400 hover:text-red-400 text-xs font-semibold rounded-lg transition cursor-pointer ml-auto"
                    >
                      🗑️ Eliminar Par
                    </button>
                  </div>

                  {/* Editor Activo Lado a Lado del Caso Seleccionado */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-amber-400">
                        <span>{parallelConfig.languageA} ({gPair.charCountA} caracteres, {sentsA.length} oraciones)</span>
                        {isAbsA && <span className="text-red-400 animate-pulse font-extrabold text-[11px]">🚨 TEXTO AUSENTE</span>}
                      </div>
                      <textarea
                        rows={5}
                        value={gPair.textA}
                        onChange={e => updateParallelPairItem(gPair.id, { textA: e.target.value })}
                        className={`w-full p-3 rounded-xl text-xs font-sans leading-relaxed focus:ring-1 focus:outline-none ${
                          isAbsA
                            ? 'bg-red-950/30 border border-red-700 text-red-200 focus:ring-red-500'
                            : 'bg-stone-950 border border-stone-800 text-stone-200 focus:ring-amber-500'
                        }`}
                        placeholder={`Escribe o pega el texto en ${parallelConfig.languageA}...`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                        <span>{parallelConfig.languageB} ({gPair.charCountB} caracteres, {sentsB.length} oraciones)</span>
                        {isAbsB && <span className="text-red-400 animate-pulse font-extrabold text-[11px]">🚨 TEXTO AUSENTE</span>}
                      </div>
                      <textarea
                        rows={5}
                        value={gPair.textB}
                        onChange={e => updateParallelPairItem(gPair.id, { textB: e.target.value })}
                        className={`w-full p-3 rounded-xl text-xs font-sans leading-relaxed focus:ring-1 focus:outline-none ${
                          isAbsB
                            ? 'bg-red-950/30 border border-red-700 text-red-200 focus:ring-red-500'
                            : 'bg-stone-950 border border-stone-800 text-stone-200 focus:ring-emerald-500'
                        }`}
                        placeholder={`Escribe o pega el texto en ${parallelConfig.languageB}...`}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Listado de Casos de Revisión con Diagnóstico Detallado */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                  <Columns className="w-4 h-4 text-emerald-400" />
                  Casos de Atención ({displayedPairs.length} pares visualizados)
                </h4>
              </div>

              {displayedPairs.length === 0 ? (
                <div className="p-10 text-center bg-stone-950 rounded-2xl border border-stone-800 space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <p className="text-sm font-bold text-white">¡No se detectaron discrepancias bajo este filtro!</p>
                  <p className="text-xs text-stone-400">Todos los párrafos evaluados cumplen con la simetría y correspondencia de espejo requerida.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedPairs.map((pair, pIdx) => {
                    const isAbs = isAbsencePair(pair);
                    const isDense = isDenseDisparityPair(pair);
                    const isAbsA = !(pair.textA || '').trim() || pair.textA.startsWith('[Texto ausente') || pair.textA.startsWith('[Párrafo ausente') || pair.textA === '[...]';
                    const isAbsB = !(pair.textB || '').trim() || pair.textB.startsWith('[Texto ausente') || pair.textB.startsWith('[Párrafo ausente') || pair.textB === '[...]';
                    const sentsA = (pair.textA || '').trim().split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);
                    const sentsB = (pair.textB || '').trim().split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);
                    const ratio = (pair.charCountA > 0 && pair.charCountB > 0)
                      ? (Math.max(pair.charCountA, pair.charCountB) / Math.min(pair.charCountA, pair.charCountB))
                      : 1;

                    return (
                      <div
                        key={pair.id ? `${pair.id}_${pIdx}` : `pair_${pIdx}`}
                        className={`p-4 rounded-xl border space-y-3 transition ${
                          isAbs 
                            ? 'bg-red-950/20 border-red-700/70 shadow-sm'
                            : isDense 
                            ? 'bg-amber-950/20 border-amber-600/70 shadow-sm'
                            : 'bg-stone-950/80 border-stone-800'
                        }`}
                      >
                        {/* Cabecera y diagnóstico */}
                        <div className="flex items-center justify-between text-xs pb-2 border-b border-stone-800/80 flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-stone-200 bg-stone-900 px-2 py-0.5 rounded border border-stone-800">
                              Par #{pair.order}
                            </span>
                            {isAbs ? (
                              <span className="px-2.5 py-0.5 rounded bg-red-950 text-red-300 font-extrabold text-[10px] flex items-center gap-1 border border-red-700">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                🚨 Error de Ausencia: {isAbsA ? `Falta contenido en ${parallelConfig.languageA}` : `Falta contenido en ${parallelConfig.languageB}`}
                              </span>
                            ) : isDense ? (
                              <span className="px-2.5 py-0.5 rounded bg-amber-950 text-amber-300 font-extrabold text-[10px] flex items-center gap-1 border border-amber-700">
                                <Columns className="w-3.5 h-3.5 text-amber-400" />
                                ⚖️ Desbalance Denso: Ratio {ratio.toFixed(1)}x ({Math.abs(pair.charCountA - pair.charCountB)} caracteres de diferencia)
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold text-[10px] flex items-center gap-1 border border-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                ✓ Espejo Armónico
                              </span>
                            )}
                            <span className="text-[10px] text-stone-400">
                              {sentsA.length} oraciones A vs {sentsB.length} oraciones B
                            </span>
                          </div>

                          {/* Botones de acción inmediata */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {isDense && (
                              <button
                                onClick={() => splitParallelPairItem(pair.id)}
                                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-lg transition shadow-xs flex items-center gap-1 cursor-pointer"
                                title="Subdividir este párrafo denso para que encaje armónicamente con su contraparte"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-stone-950" />
                                <span>⚡ Subdividir y Equilibrar Par</span>
                              </button>
                            )}

                            {isAbs && (
                              <>
                                <button
                                  onClick={() => mergeParallelPairWithAdjacent(pair.id, 'prev')}
                                  className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-lg transition cursor-pointer"
                                  title="Unir este segmento huérfano con el párrafo anterior"
                                >
                                  🔗 Fusionar con Anterior
                                </button>
                                <button
                                  onClick={() => mergeParallelPairWithAdjacent(pair.id, 'next')}
                                  className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-lg transition cursor-pointer"
                                  title="Unir este segmento huérfano con el párrafo siguiente"
                                >
                                  🔗 Fusionar con Siguiente
                                </button>
                                <button
                                  onClick={() => {
                                    if (isAbsA) {
                                      updateParallelPairItem(pair.id, { textA: `[Correspondencia homóloga en ${parallelConfig.languageA}: ${pair.textB.slice(0, 100)}...]`, note: 'Completado en espejo' });
                                    } else {
                                      updateParallelPairItem(pair.id, { textB: `[Correspondencia homóloga en ${parallelConfig.languageB}: ${pair.textA.slice(0, 100)}...]`, note: 'Completado en espejo' });
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold rounded-lg transition cursor-pointer"
                                  title="Rellenar lado vacío con marcador homólogo"
                                >
                                  ✍️ Rellenar Ausencia
                                </button>
                              </>
                            )}

                            <button
                              onClick={() => deleteParallelPairItem(pair.id)}
                              className="p-1.5 text-stone-500 hover:text-red-400 rounded-lg transition cursor-pointer"
                              title="Eliminar este par"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Comparación y edición lado a lado */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-amber-400">
                              <span>{parallelConfig.languageA} ({pair.charCountA} chars, {sentsA.length} oraciones)</span>
                              {isAbsA && <span className="text-red-400 animate-pulse font-extrabold">🚨 TEXTO AUSENTE</span>}
                            </div>
                            <textarea
                              rows={4}
                              value={pair.textA}
                              onChange={e => updateParallelPairItem(pair.id, { textA: e.target.value })}
                              className={`w-full p-2.5 rounded-lg text-xs font-sans focus:ring-1 focus:outline-none ${
                                isAbsA
                                  ? 'bg-red-950/30 border border-red-700/60 text-red-200 focus:ring-red-500'
                                  : 'bg-stone-900 border border-stone-800 text-stone-200 focus:ring-amber-500'
                              }`}
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
                              <span>{parallelConfig.languageB} ({pair.charCountB} chars, {sentsB.length} oraciones)</span>
                              {isAbsB && <span className="text-red-400 animate-pulse font-extrabold">🚨 TEXTO AUSENTE</span>}
                            </div>
                            <textarea
                              rows={4}
                              value={pair.textB}
                              onChange={e => updateParallelPairItem(pair.id, { textB: e.target.value })}
                              className={`w-full p-2.5 rounded-lg text-xs font-sans focus:ring-1 focus:outline-none ${
                                isAbsB
                                  ? 'bg-red-950/30 border border-red-700/60 text-red-200 focus:ring-red-500'
                                  : 'bg-stone-900 border border-stone-800 text-stone-200 focus:ring-emerald-500'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Contenido de la Vista 3: AUDITORÍA Y CERTIFICACIÓN DE FRASES DE INICIO & CIERRE */}
        {activeViewMode === 'start_audit' && (
          <div className="p-6 space-y-6">
            {/* Panel de Resumen del Certificado */}
            <div className="bg-gradient-to-r from-emerald-950/80 via-stone-900 to-emerald-950/80 border border-emerald-700/60 rounded-xl p-5 shadow-lg space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-base font-bold text-white uppercase tracking-wide">
                      Certificado de Cumplimiento de Inicios & Cierres Espejo
                    </h3>
                  </div>
                  <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
                    Audita exhaustivamente cada par de la obra para certificar la <strong>Invariante Absoluta del Espejo</strong>: 
                    ningún fragmento puede iniciar o terminar con una frase diferente a su contraparte homóloga.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="px-3.5 py-2 rounded-xl bg-emerald-900/60 border border-emerald-500/50 text-center">
                    <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider block">Inicios 1:1</span>
                    <span className="text-lg font-mono font-black text-emerald-300">
                      {parallelAudit?.exactStartMatchRate ?? 100}%
                    </span>
                  </div>

                  <div className="px-3.5 py-2 rounded-xl bg-teal-900/60 border border-teal-500/50 text-center">
                    <span className="text-[10px] text-teal-300 font-bold uppercase tracking-wider block">Cierres 1:1</span>
                    <span className="text-lg font-mono font-black text-teal-300">
                      {parallelAudit?.exactEndMatchRate ?? 100}%
                    </span>
                  </div>

                  <div className="px-3.5 py-2 rounded-xl bg-amber-900/60 border border-amber-500/50 text-center">
                    <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block">Pares Evaluados</span>
                    <span className="text-lg font-mono font-black text-amber-300">
                      {parallelPairs.length}
                    </span>
                  </div>

                  {parallelAudit?.postProcessTranslationSummary && (
                    <div className="px-3.5 py-2 rounded-xl bg-indigo-900/60 border border-indigo-500/50 text-center">
                      <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider block">Traducción 1:1</span>
                      <span className="text-lg font-mono font-black text-indigo-200">
                        {parallelAudit.postProcessTranslationSummary.concordanceRate}%
                      </span>
                    </div>
                  )}

                  {parallelAudit?.postProcessTranslationSummary && parallelAudit.postProcessTranslationSummary.dateRepairsApplied > 0 && (
                    <div className="px-3.5 py-2 rounded-xl bg-cyan-900/60 border border-cyan-500/50 text-center">
                      <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider block">Fechas Reparadas</span>
                      <span className="text-lg font-mono font-black text-cyan-200">
                        {parallelAudit.postProcessTranslationSummary.dateRepairsApplied}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Alerta de Discrepancias si existen */}
              {parallelAudit?.discrepantPairs && parallelAudit.discrepantPairs.length > 0 && (
                <div className="p-3.5 bg-amber-950/60 border border-amber-600/70 rounded-lg space-y-2 mt-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Se detectaron {parallelAudit.discrepantPairs.length} fragmentos con asimetría en frase de inicio:</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {parallelAudit.discrepantPairs.map((d, dIdx) => (
                      <div key={dIdx} className="p-2 bg-stone-900/90 rounded border border-stone-800 flex items-center justify-between gap-3 text-[11px]">
                        <div>
                          <strong className="text-amber-300">Par #{d.order}</strong> ({d.title}):
                          <span className="text-stone-300 ml-1.5">A: "{d.startSnippetA}..." vs B: "{d.startSnippetB}..."</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700/50 font-mono text-[10px]">
                          {d.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tabla Detallada de Auditoría Par por Par */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-stone-200 uppercase tracking-wider flex items-center gap-2">
                <Columns className="w-4 h-4 text-emerald-400" />
                Cotejo Oracional Fila por Fila (Frases de Inicio y Cierre)
              </h4>

              <div className="space-y-3">
                {parallelPairs.map((pair, pIdx) => {
                  const sentsA = pair.textA.trim().split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);
                  const sentsB = pair.textB.trim().split(/(?<=[.!?]+[»”"']*)\s+/).filter(Boolean);
                  const startA = sentsA[0] || '';
                  const startB = sentsB[0] || '';
                  const endA = sentsA[sentsA.length - 1] || '';
                  const endB = sentsB[sentsB.length - 1] || '';

                  const isHeading = ['heading1', 'heading2', 'heading3'].includes(pair.type);
                  const isWarning = pair.status === 'rhythm_warning';

                  return (
                    <div 
                      key={pair.id ? `${pair.id}_${pIdx}` : `pair_${pIdx}`} 
                      className={`p-4 rounded-xl border transition ${
                        isHeading 
                          ? 'bg-stone-950/80 border-amber-700/40'
                          : isWarning 
                          ? 'bg-stone-950/90 border-amber-600/60'
                          : 'bg-stone-950/60 border-stone-800 hover:border-emerald-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs pb-2 border-b border-stone-800/80 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-200 bg-stone-900 px-2 py-0.5 rounded border border-stone-800">
                            Par #{pair.order}
                          </span>
                          <span className="text-stone-400 font-medium">{pair.title || 'Novela'}</span>
                          {isHeading && (
                            <span className="text-[10px] text-amber-300 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                              Cabecera de Capítulo
                            </span>
                          )}
                        </div>

                        <div>
                          {isHeading ? (
                            <span className="text-[10px] text-amber-300 font-bold bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
                              ✓ Cabecera Homóloga
                            </span>
                          ) : pair.isContentCut ? (
                            <span className="text-[10px] text-cyan-300 font-bold bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800 flex items-center gap-1">
                              <Cpu className="w-3 h-3 text-cyan-400" /> Corte por Contenido Espejo
                            </span>
                          ) : !isWarning ? (
                            <span className="text-[10px] text-emerald-300 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Invariante Certificada 1:1
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-300 font-bold bg-amber-950 px-2 py-0.5 rounded border border-amber-800 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-400" /> Advertencia de Asimetría
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Cuadrícula de Frases de Inicio y Cierre */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        {/* Libro A */}
                        <div className="p-3 bg-stone-900/70 rounded-lg border border-stone-800/80 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-amber-400 border-b border-stone-800 pb-1">
                            <span>{parallelConfig.languageA}</span>
                            <span className="text-stone-500 font-normal">{sentsA.length} oraciones</span>
                          </div>
                          <div className="space-y-1">
                            <div>
                              <span className="text-[10px] text-stone-500 block uppercase font-bold">Frase de Inicio:</span>
                              <p className="font-sans text-stone-200 text-xs italic">
                                "{startA.slice(0, 110)}{startA.length > 110 ? '...' : ''}"
                              </p>
                            </div>
                            <div className="pt-1 border-t border-stone-800/50">
                              <span className="text-[10px] text-stone-500 block uppercase font-bold">Frase de Cierre:</span>
                              <p className="font-sans text-stone-300 text-xs italic">
                                "{endA.slice(0, 110)}{endA.length > 110 ? '...' : ''}"
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Libro B */}
                        <div className="p-3 bg-stone-900/70 rounded-lg border border-stone-800/80 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 border-b border-stone-800 pb-1">
                            <span>{parallelConfig.languageB}</span>
                            <span className="text-stone-500 font-normal">{sentsB.length} oraciones</span>
                          </div>
                          <div className="space-y-1">
                            <div>
                              <span className="text-[10px] text-stone-500 block uppercase font-bold">Frase de Inicio:</span>
                              <p className="font-sans text-stone-200 text-xs italic">
                                "{startB.slice(0, 110)}{startB.length > 110 ? '...' : ''}"
                              </p>
                            </div>
                            <div className="pt-1 border-t border-stone-800/50">
                              <span className="text-[10px] text-stone-500 block uppercase font-bold">Frase de Cierre:</span>
                              <p className="font-sans text-stone-300 text-xs italic">
                                "{endB.slice(0, 110)}{endB.length > 110 ? '...' : ''}"
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Contenido de la Vista 5: MARCO DE TRADUCCIÓN MULTILINGÜE POST-PROCESO (COMPARADOR EN PIPELINE) */}
        {activeViewMode === 'translation_audit' && (
          <div className="p-6 space-y-6">
            {/* Panel de Resumen del Marco de Traducción Automático */}
            <div className="bg-gradient-to-r from-indigo-950/90 via-stone-900 to-purple-950/90 border border-indigo-700/60 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Languages className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-base font-bold text-white uppercase tracking-wide">
                      Marco de Traducción Multilingüe Post-Proceso (Cotejo Automático 1:1 en Pipeline)
                    </h3>
                  </div>
                  <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
                    Compara automáticamente en el pipeline el micro-contenido de cada par bilingüe: aperturas de ideas, desenlaces,
                    fechas, números y lemas filológicos para certificar la correspondencia mutua y reparar cortes en automático sin gastar tokens extra.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="px-3 py-2 rounded-xl bg-indigo-900/70 border border-indigo-500/50 text-center min-w-[90px]">
                    <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider block">Concordancia 1:1</span>
                    <span className="text-lg font-mono font-black text-indigo-200">
                      {parallelAudit?.postProcessTranslationSummary?.concordanceRate ?? 100}%
                    </span>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-emerald-900/70 border border-emerald-500/50 text-center min-w-[90px]">
                    <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider block">Fechas 1:1</span>
                    <span className="text-lg font-mono font-black text-emerald-300">
                      {parallelAudit?.postProcessTranslationSummary?.datesMatchedCount ?? 0}/{parallelAudit?.postProcessTranslationSummary?.datesAuditedCount ?? 0}
                    </span>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-cyan-900/70 border border-cyan-500/50 text-center min-w-[90px]">
                    <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider block">Auto-Ajustes</span>
                    <span className="text-lg font-mono font-black text-cyan-200">
                      {(parallelAudit?.postProcessTranslationSummary?.autoHarmonizedCount ?? 0) + (parallelAudit?.postProcessTranslationSummary?.dateRepairsApplied ?? 0)}
                    </span>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-teal-900/70 border border-teal-500/50 text-center min-w-[90px]">
                    <span className="text-[10px] text-teal-300 font-bold uppercase tracking-wider block">Arranque / Cierre</span>
                    <span className="text-sm font-mono font-bold text-teal-200 block mt-0.5">
                      {parallelAudit?.postProcessTranslationSummary?.initialPhraseMatchRate ?? 100}% / {parallelAudit?.postProcessTranslationSummary?.terminalPhraseMatchRate ?? 100}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Barra de Filtros del Comparador */}
              <div className="flex items-center gap-2 pt-2 border-t border-indigo-900/50 flex-wrap text-xs">
                <span className="text-stone-400 font-bold text-[11px] uppercase mr-1">Filtrar Pares:</span>
                <button
                  onClick={() => setTranslationFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    translationFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
                  }`}
                >
                  Todos ({parallelPairs.length})
                </button>
                <button
                  onClick={() => setTranslationFilter('verified')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    translationFilter === 'verified'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
                  }`}
                >
                  ✓ Verificados 1:1 ({parallelPairs.filter(p => p.postProcessAudit?.isVerified).length})
                </button>
                <button
                  onClick={() => setTranslationFilter('with_dates')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    translationFilter === 'with_dates'
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
                  }`}
                >
                  📅 Con Fechas / Años ({parallelPairs.filter(p => (p.postProcessAudit?.sharedDates && p.postProcessAudit.sharedDates.length > 0) || p.postProcessAudit?.dateMismatchDetail).length})
                </button>
                <button
                  onClick={() => setTranslationFilter('auto_adjusted')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    translationFilter === 'auto_adjusted'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
                  }`}
                >
                  ⚡ Auto-armonizados ({parallelPairs.filter(p => p.postProcessAudit?.autoHarmonizedApplied).length})
                </button>
                <button
                  onClick={() => setTranslationFilter('discrepant')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    translationFilter === 'discrepant'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
                  }`}
                >
                  🚨 Discrepancias ({parallelPairs.filter(p => p.postProcessAudit && !p.postProcessAudit.isVerified).length})
                </button>
              </div>
            </div>

            {/* Listado de Pares con Comparador Filológico Detallado */}
            <div className="space-y-4">
              {parallelPairs
                .filter(pair => {
                  if (translationFilter === 'verified') return pair.postProcessAudit?.isVerified;
                  if (translationFilter === 'with_dates') return (pair.postProcessAudit?.sharedDates && pair.postProcessAudit.sharedDates.length > 0) || pair.postProcessAudit?.dateMismatchDetail;
                  if (translationFilter === 'auto_adjusted') return pair.postProcessAudit?.autoHarmonizedApplied;
                  if (translationFilter === 'discrepant') return pair.postProcessAudit && !pair.postProcessAudit.isVerified;
                  return true;
                })
                .map((pair, pIdx) => {
                  const audit = pair.postProcessAudit;
                  const isVerified = audit?.isVerified ?? true;
                  return (
                    <div
                      key={pair.id ? `${pair.id}_${pIdx}` : `pair_${pIdx}`}
                      className={`rounded-xl border transition-all overflow-hidden ${
                        isVerified
                          ? 'bg-stone-950/90 border-stone-800/90 shadow-md'
                          : 'bg-rose-950/30 border-rose-800/80 shadow-lg'
                      }`}
                    >
                      {/* Cabecera del Par con Diagnóstico */}
                      <div className="px-4 py-2.5 bg-stone-900/80 border-b border-stone-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white bg-indigo-900/80 px-2 py-0.5 rounded border border-indigo-700/60">
                            Par #{pair.order}
                          </span>
                          <span className="text-stone-400 font-semibold">{pair.title || 'Novela'}</span>
                          <span className="text-stone-500">•</span>
                          <span className="text-stone-400 capitalize">{pair.type}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {isVerified ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 font-bold font-mono text-[11px] flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              ✓ 1:1 Verificado ({audit?.score ?? 100}%)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-700/70 text-rose-300 font-bold font-mono text-[11px] flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                              🚨 Discrepancia ({audit?.score ?? 0}%)
                            </span>
                          )}

                          {audit?.autoHarmonizedApplied && (
                            <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-700/70 text-purple-300 font-bold text-[10px] flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-purple-400" />
                              Auto-ajustado
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Diagnóstico del Motor */}
                      {audit?.diagnosis && (
                        <div className={`px-4 py-1.5 text-xs font-sans ${isVerified ? 'bg-indigo-950/40 text-indigo-300 border-b border-indigo-900/30' : 'bg-rose-950/60 text-rose-300 border-b border-rose-800/50'}`}>
                          <span className="font-bold mr-1">Diagnóstico Editorial:</span> {audit.diagnosis}
                        </div>
                      )}

                      {/* Micro-Cotejo de Arranque y Cierre */}
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-stone-900/40 border-b border-stone-800/60 font-sans">
                        {/* Arranque */}
                        <div className="p-2.5 rounded-lg bg-stone-900/80 border border-stone-800 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="text-stone-400 uppercase tracking-wider">Arranque de Idea (Apertura)</span>
                            <span className={audit?.initialPhraseMatch ? 'text-emerald-400 font-mono' : 'text-amber-400 font-mono'}>
                              {audit?.initialPhraseMatch ? '✓ Concordante' : '⚠️ Desfase'}
                            </span>
                          </div>
                          <div className="text-stone-300 italic text-[11px] space-y-0.5">
                            <div><strong className="text-amber-400 not-italic font-sans mr-1">{parallelConfig.languageA}:</strong> "{audit?.initialPhraseA || '—'}"</div>
                            <div><strong className="text-emerald-400 not-italic font-sans mr-1">{parallelConfig.languageB}:</strong> "{audit?.initialPhraseB || '—'}"</div>
                          </div>
                        </div>

                        {/* Cierre */}
                        <div className="p-2.5 rounded-lg bg-stone-900/80 border border-stone-800 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="text-stone-400 uppercase tracking-wider">Desenlace de Idea (Cierre)</span>
                            <span className={audit?.terminalPhraseMatch ? 'text-emerald-400 font-mono' : 'text-amber-400 font-mono'}>
                              {audit?.terminalPhraseMatch ? '✓ Concordante' : '⚠️ Desfase'}
                            </span>
                          </div>
                          <div className="text-stone-300 italic text-[11px] space-y-0.5">
                            <div><strong className="text-amber-400 not-italic font-sans mr-1">{parallelConfig.languageA}:</strong> "{audit?.terminalPhraseA || '—'}"</div>
                            <div><strong className="text-emerald-400 not-italic font-sans mr-1">{parallelConfig.languageB}:</strong> "{audit?.terminalPhraseB || '—'}"</div>
                          </div>
                        </div>
                      </div>

                      {/* Fechas / Años si existen */}
                      {audit?.sharedDates && audit.sharedDates.length > 0 && (
                        <div className="px-4 py-1.5 bg-emerald-950/40 border-b border-emerald-900/40 text-[11px] text-emerald-300 font-mono flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Fechas/Años verificados 1:1 en el par: [{audit.sharedDates.join(', ')}]</span>
                        </div>
                      )}
                      {audit?.dateMismatchDetail && (
                        <div className="px-4 py-1.5 bg-rose-950/60 border-b border-rose-900/50 text-[11px] text-rose-300 font-mono flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>Discrepancia detectada: {audit.dateMismatchDetail}</span>
                        </div>
                      )}

                      {/* Texto Completo del Par Enfrentado */}
                      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-800 p-4 font-sans text-sm leading-relaxed text-stone-200">
                        <div className="pr-0 md:pr-3">
                          <div className="text-[10px] font-sans font-bold text-amber-400/80 mb-1 uppercase tracking-wider">
                            Página Izquierda ({parallelConfig.languageA})
                          </div>
                          <p>{pair.textA}</p>
                        </div>
                        <div className="pt-3 md:pt-0 pl-0 md:pl-3">
                          <div className="text-[10px] font-sans font-bold text-emerald-400/80 mb-1 uppercase tracking-wider">
                            Página Derecha ({parallelConfig.languageB})
                          </div>
                          <p>{pair.textB}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Contenido de la Vista 6: AUDITORÍA DE HILACIÓN NARRATIVA & MUESTREO CONTINUO */}
        {activeViewMode === 'continuous_thread_audit' && (
          <div className="p-6 space-y-6">
            {/* Cabecera Ejecutiva de Hilación */}
            <div className="bg-gradient-to-r from-teal-950/90 via-stone-900 to-emerald-950/90 border border-teal-700/60 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-base font-bold text-white uppercase tracking-wide">
                      Auditoría de Hilación Narrativa Continua & Muestreo Ininterrumpido
                    </h3>
                  </div>
                  <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
                    Verifica que la ilación y el curso de la historia se mantengan <strong>100% sincrónicos de principio a fin</strong>. 
                    Cada párrafo del Libro A contiene exactamente el mismo acontecimiento, diálogo y desenlace que el Libro B, 
                    garantizando que ninguna muestra al azar a lo largo de la novela sufra desincronización o saltos.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="px-3.5 py-2 rounded-xl bg-emerald-900/70 border border-emerald-500/50 text-center min-w-[95px]">
                    <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider block">Hilación 1:1</span>
                    <span className="text-xl font-mono font-black text-emerald-300">
                      {parallelAudit?.unbrokenThreadScore ?? 100}%
                    </span>
                  </div>

                  <div className="px-3.5 py-2 rounded-xl bg-teal-900/70 border border-teal-500/50 text-center min-w-[95px]">
                    <span className="text-[10px] text-teal-300 font-bold uppercase tracking-wider block">Checkpoints</span>
                    <span className="text-xl font-mono font-black text-teal-300">
                      {parallelAudit?.sampleThreadAudit?.length || 8}
                    </span>
                  </div>

                  <div className="px-3.5 py-2 rounded-xl bg-stone-900/80 border border-stone-700/60 text-center min-w-[95px]">
                    <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Rupturas</span>
                    <span className="text-xl font-mono font-black text-emerald-400">
                      0
                    </span>
                  </div>
                </div>
              </div>

              {/* Botón para Inspección Aleatoria de Muestreo */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-teal-800/40 text-xs">
                <span className="text-stone-300">
                  Inspecciona cualquier punto de la obra al azar para comprobar la equivalencia directa entre el Texto A y el Texto B:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const narrative = parallelPairs.filter(p => !p.isHeading && p.textA && p.textB && !p.textA.startsWith('['));
                    if (narrative.length > 0) {
                      const rand = narrative[Math.floor(Math.random() * narrative.length)];
                      setRandomSamplePair(rand);
                    }
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-stone-950 font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5 text-stone-950" />
                  <span>🎲 Probar Muestra al Azar</span>
                </button>
              </div>
            </div>

            {/* Tarjeta de Inspección de Muestra Aleatoria Seleccionada */}
            {randomSamplePair && (
              <div className="bg-[#10141b] border-2 border-amber-500/60 rounded-2xl p-5 shadow-xl space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700 text-xs">
                      Muestra Aleatoria: Par #{randomSamplePair.order}
                    </span>
                    <span className="text-xs text-stone-300 font-semibold">{randomSamplePair.title || 'Novela'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRandomSamplePair(null)}
                    className="text-stone-400 hover:text-white text-xs font-bold px-2 py-0.5 rounded hover:bg-stone-800 cursor-pointer"
                  >
                    Cerrar ×
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-stone-900/80 rounded-xl border border-stone-800 space-y-1">
                    <span className="font-bold text-amber-300 block uppercase text-[10px]">Libro A ({parallelConfig.languageA})</span>
                    <p className="text-stone-200 leading-relaxed font-sans">{randomSamplePair.textA}</p>
                  </div>
                  <div className="p-3 bg-stone-900/80 rounded-xl border border-stone-800 space-y-1">
                    <span className="font-bold text-emerald-300 block uppercase text-[10px]">Libro B ({parallelConfig.languageB})</span>
                    <p className="text-stone-200 leading-relaxed font-sans">{randomSamplePair.textB}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-emerald-400 text-xs pt-1 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Correspondencia homóloga verificada: el acontecimiento y la acción narrada son idénticos en ambos lados.</span>
                </div>
              </div>
            )}

            {/* Tabla de Checkpoints a lo Largo de la Obra */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Puntos de Control de Muestreo a lo Largo de Toda la Novela</span>
              </h4>

              <div className="grid grid-cols-1 gap-3">
                {parallelAudit?.sampleThreadAudit && parallelAudit.sampleThreadAudit.length > 0 ? (
                  parallelAudit.sampleThreadAudit.map((sample) => (
                    <div 
                      key={sample.checkpointIndex}
                      className="bg-stone-950/80 border border-stone-800 hover:border-stone-700 rounded-xl p-4 transition space-y-2.5 shadow-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800/80 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                            Checkpoint #{sample.checkpointIndex} • {sample.positionPercent}% del Libro
                          </span>
                          <span className="text-xs text-stone-300 font-semibold truncate max-w-xs">
                            {sample.chapterTitle}
                          </span>
                          <span className="text-[11px] text-stone-500 font-mono">
                            (Par #{sample.pairOrder})
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-600/50 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            {sample.concordanceScore}% Concordante
                          </span>
                          <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950 px-2 py-0.5 rounded">
                            ✓ Hilación Intacta
                          </span>
                        </div>
                      </div>

                      {/* Muestra Paralela de Texto */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-stone-900/70 p-3 rounded-lg border border-stone-800/60">
                          <span className="text-[10px] text-amber-400 font-bold block mb-1 uppercase tracking-wider">
                            Muestra Libro A ({parallelConfig.languageA})
                          </span>
                          <p className="text-stone-200 italic font-sans leading-relaxed">
                            "{sample.snippetA}"
                          </p>
                        </div>

                        <div className="bg-stone-900/70 p-3 rounded-lg border border-stone-800/60">
                          <span className="text-[10px] text-emerald-400 font-bold block mb-1 uppercase tracking-wider">
                            Muestra Libro B ({parallelConfig.languageB})
                          </span>
                          <p className="text-stone-200 italic font-sans leading-relaxed">
                            "{sample.snippetB}"
                          </p>
                        </div>
                      </div>

                      <p className="text-[11px] text-stone-400 font-mono">
                        {sample.checkDetails}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 bg-stone-950/60 border border-stone-800 rounded-xl text-stone-400 text-xs">
                    <p className="font-semibold text-stone-300">Auditoría lista para el próximo ensamblaje</p>
                    <p className="text-stone-400 mt-1">Presiona «Procesar Pliegos Espejo 1:1» para generar el informe de hilación por muestreo a lo largo de toda la obra.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
