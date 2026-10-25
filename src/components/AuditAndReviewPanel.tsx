import React, { useState, useEffect } from 'react';
import { useSape } from '../context/SapeContext';
import { AuditIssue, ContentBlock, ContentBlockType } from '../types';
import { 
  auditDocumentWithAI, 
  applyGlobalAiCorrection, 
  splitMergedNumberedQuestionsAndDialogues,
  curateAllBlocksQuestionsAndOptionsLocally,
  reanalyzeTargetedQuestionsWithAI
} from '../services/gemini';
import { MathRenderer } from './MathRenderer';
import { 
  ShieldCheck, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Wand2, 
  Layers, 
  RotateCw, 
  ArrowRight,
  ListOrdered,
  Table as TableIcon,
  HelpCircle,
  Scissors,
  Check,
  Edit3,
  RefreshCw,
  Eye,
  CheckSquare,
  BookOpen,
  Zap
} from 'lucide-react';

export const AuditAndReviewPanel: React.FC = () => {
  const {
    chunks,
    setChunks,
    metadata,
    selectedModel,
    isProcessing,
    setActiveTab,
    updateBlock,
    removeBlock,
    curateAllContinuityAndHyphenation,
    transversalReport,
    runTransversalAudit,
    applyTransversalFixes
  } = useSape();

  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<AuditIssue | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isApplyingFix, setIsApplyingFix] = useState(false);
  const [isTargetedCurating, setIsTargetedCurating] = useState(false);
  const [fixSuccessMessage, setFixSuccessMessage] = useState<string | null>(null);
  const [activeViewMode, setActiveViewMode] = useState<'issues' | 'all_blocks'>('issues');
  const [filterType, setFilterType] = useState<string>('all');

  // Recopilar todos los bloques de todos los chunks
  const allBlocks = chunks.flatMap(c => (c.blocks || []).map(b => ({ ...b, chunkId: c.id })));
  const totalBlocksCount = allBlocks.length;
  
  // Distinción fina entre Reactivos con Opciones (A-E) vs Preguntas Abiertas / Balotario
  const multipleChoiceCount = allBlocks.filter(b => b.type === 'exercise' && b.options && b.options.length > 0).length;
  const openQuestionsCount = allBlocks.filter(b => (b.type === 'exercise' && (!b.options || b.options.length === 0)) || (/^\(?\d{1,3}[\.\)]\s+/.test(b.content.trim()) && b.type !== 'heading1' && b.type !== 'heading2')).length;
  const tablesCount = allBlocks.filter(b => b.type === 'table').length;
  const headingsCount = allBlocks.filter(b => ['heading1', 'heading2', 'heading3', 'heading4'].includes(b.type)).length;

  // Métricas Literarias y de Novela / Textos Largos
  const literaryDialoguesCount = allBlocks.filter(b => b.type === 'novel_dialogue' || /^[\u2014\u2013\-\u2015]\s+/.test(b.content.trim())).length;
  const poemVersesCount = allBlocks.filter(b => b.type === 'poem_verse').length;
  const epigraphsCount = allBlocks.filter(b => b.type === 'epigraph' || b.type === 'epistolary_letter').length;
  const breaksCount = allBlocks.filter(b => b.type === 'ornamental_break').length;

  const runAudit = async () => {
    if (allBlocks.length === 0) return;
    setIsAuditing(true);
    setFixSuccessMessage(null);
    try {
      const detected = await auditDocumentWithAI(
        allBlocks,
        { title: metadata.title, subject: metadata.subject, toc: metadata.toc },
        selectedModel
      );
      setIssues(detected);
      if (detected.length > 0) {
        setSelectedIssue(detected[0]);
      }
    } catch (err: any) {
      console.error('Error durante la auditoría:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  // La auditoría se ejecuta exclusivamente mediante el botón explícito de acción, respetando la voluntad del usuario.

  // Normalización Transversal Integral del Libro
  const handleApplyTransversalNormalization = () => {
    const fixed = applyTransversalFixes({ autoFixHeadings: true, unifyDialogues: true, detectLiteraryBlocks: true });
    setFixSuccessMessage(`¡Uniformidad transversal aplicada! Se armonizaron ${fixed} bloques en todo el libro (jerarquías H1-H4 sin saltos ilógicos, rayas de diálogo '—' y formato poético).`);
    setTimeout(() => setFixSuccessMessage(null), 5000);
    runAudit();
  };

  // Curación Determinista Instantánea de Reactivos (0 Tokens)
  const handleCurateQuestionsDeterministic = () => {
    let totalFixed = 0;
    let totalMC = 0;
    let totalOpen = 0;

    const newChunks = chunks.map(chunk => {
      if (!chunk.blocks || chunk.blocks.length === 0) return chunk;
      const res = curateAllBlocksQuestionsAndOptionsLocally(chunk.blocks);
      totalFixed += res.fixedCount;
      totalMC += res.multipleChoiceCount;
      totalOpen += res.openQuestionsCount;
      return {
        ...chunk,
        blocks: res.blocks,
        cleanContent: res.blocks.map(b => b.content).join('\n\n')
      };
    });

    setChunks(newChunks);
    setFixSuccessMessage(`¡Curación instantánea completada! ${totalMC} reactivos con alternativas (A/B/C/D) y ${totalOpen} preguntas abiertas formateadas con precisión.`);
    setTimeout(() => setFixSuccessMessage(null), 5000);
    runAudit();
  };

  // Curación de Guionado OCR, Puntuación Flotante y Continuidad de Hojas/Párrafos
  const handleCurateContinuityAndHyphenation = () => {
    const result = curateAllContinuityAndHyphenation();
    setFixSuccessMessage(`¡Curación de continuidad y guionado finalizada! Se repararon cortes mecánicos en ${result.fixedCount} páginas/bloques.`);
    setTimeout(() => setFixSuccessMessage(null), 5000);
    runAudit();
  };

  // Re-análisis Quirúrgico y Económico por IA (Solo preguntas y reactivos, bajo consumo)
  const handleReanalyzeTargetedQuestionsAI = async () => {
    if (allBlocks.length === 0) return;
    setIsTargetedCurating(true);
    setFixSuccessMessage(null);

    try {
      let totalCurated = 0;
      let totalMC = 0;
      let totalOpen = 0;

      const newChunks = await Promise.all(
        chunks.map(async (chunk) => {
          if (!chunk.blocks || chunk.blocks.length === 0) return chunk;
          const res = await reanalyzeTargetedQuestionsWithAI(
            chunk.blocks,
            { title: metadata.title, subject: metadata.subject },
            selectedModel
          );
          totalCurated += res.curatedCount;
          totalMC += res.multipleChoiceCount;
          totalOpen += res.openQuestionsCount;
          return {
            ...chunk,
            blocks: res.blocks,
            cleanContent: res.blocks.map(b => b.content).join('\n\n')
          };
        })
      );

      setChunks(newChunks);
      setFixSuccessMessage(`¡Re-análisis quirúrgico finalizado! ${totalMC} reactivos de opción múltiple clasificados y ${totalOpen} preguntas abiertas preservadas.`);
      setTimeout(() => setFixSuccessMessage(null), 5000);
      runAudit();
    } catch (err: any) {
      console.error("Error en re-análisis quirúrgico:", err);
      setFixSuccessMessage(`Error en re-análisis: ${err.message}`);
    } finally {
      setIsTargetedCurating(false);
    }
  };

  // Aplicar corrección por IA
  const handleApplyAiInstruction = async (instructionText: string) => {
    if (!instructionText.trim() || allBlocks.length === 0) return;
    setIsApplyingFix(true);
    setFixSuccessMessage(null);

    try {
      const updatedChunks = await Promise.all(
        chunks.map(async (c) => {
          if (!c.blocks || c.blocks.length === 0) return c;
          const fixedBlocks = await applyGlobalAiCorrection(
            c.blocks,
            instructionText,
            { title: metadata.title, subject: metadata.subject, toc: metadata.toc },
            selectedModel
          );
          return {
            ...c,
            blocks: fixedBlocks,
            cleanContent: fixedBlocks.map(b => b.content).join('\n\n')
          };
        })
      );

      setChunks(updatedChunks);
      setFixSuccessMessage(`¡Corrección aplicada con éxito! ("${instructionText.substring(0, 50)}...")`);
      setTimeout(() => setFixSuccessMessage(null), 4000);
      setCustomPrompt('');
      runAudit();
    } catch (err: any) {
      console.error('Error aplicando corrección:', err);
      setFixSuccessMessage(`Error aplicando corrección: ${err.message}`);
    } finally {
      setIsApplyingFix(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Guía de Fases Editoriales */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between text-xs overflow-x-auto gap-4 py-1 px-2">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center font-bold text-[10px]">1</span>
            <span>Ingesta & TOC</span>
          </div>
          <span className="text-slate-600">→</span>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center font-bold text-[10px]">2</span>
            <span>Limpieza & LaTeX</span>
          </div>
          <span className="text-slate-600">→</span>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center font-bold text-[10px]">3</span>
            <span>Tipificación Semántica</span>
          </div>
          <span className="text-slate-600">→</span>
          <div className="flex items-center gap-2 text-indigo-300 font-bold bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-800/80 shadow-sm">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">4</span>
            <span>Auditoría & Calidad (Actual)</span>
          </div>
          <span className="text-slate-600">→</span>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center font-bold text-[10px]">5</span>
            <span>Generación DOCX</span>
          </div>
        </div>
      </div>

      {/* Cabecera Principal */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Fase 4: Auditoría, Curación de Reactivos & Control de Calidad
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Distingue con delicadeza entre <strong>Preguntas Abiertas (sin alternativas)</strong> y <strong>Reactivos con Opciones (A/B/C/D/E)</strong>, valida niveles jerárquicos (H1-H4) y tablas estructuradas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-re-audit"
              onClick={runAudit}
              disabled={isAuditing || allBlocks.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-200 rounded-xl transition"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
              <span>{isAuditing ? 'Auditando...' : 'Re-auditar'}</span>
            </button>

            <button
              id="btn-goto-export"
              onClick={() => setActiveTab('generacion')}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md transition"
            >
              <span>Siguiente Paso: Generar DOCX</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Métricas rápidas de calidad con distinción de reactivos y preguntas abiertas */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 block text-[11px]">Total Bloques</span>
            <span className="text-lg font-bold text-slate-900 dark:text-white">{totalBlocksCount}</span>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 block text-[11px]">Títulos H1-H4</span>
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{headingsCount} niveles</span>
          </div>
          <div className="p-3 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200/60 dark:border-rose-800/60">
            <span className="text-rose-600 dark:text-rose-400 font-semibold block text-[11px]">Reactivos A/B/C/D/E</span>
            <span className="text-lg font-bold text-rose-700 dark:text-rose-300">{multipleChoiceCount} estructurados</span>
          </div>
          <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 dark:border-amber-800/60">
            <span className="text-amber-600 dark:text-amber-400 font-semibold block text-[11px]">Preguntas Abiertas / Balotario</span>
            <span className="text-lg font-bold text-amber-700 dark:text-amber-300">{openQuestionsCount} enunciados</span>
          </div>
          <div className="p-3 bg-sky-50/50 dark:bg-sky-950/20 rounded-xl border border-sky-200/60 dark:border-sky-800/60">
            <span className="text-sky-600 dark:text-sky-400 font-semibold block text-[11px]">Tablas Estructuradas</span>
            <span className="text-lg font-bold text-sky-700 dark:text-sky-300">{tablesCount} tablas</span>
          </div>
        </div>
      </div>

      {fixSuccessMessage && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-3 shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{fixSuccessMessage}</span>
        </div>
      )}

      {/* Panel Principal: Curador Especializado de Reactivos + Hallazgos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Curador Especializado y Asistente */}
        <div className="space-y-6">
          {/* Módulo Especial: Curador de Reactivos y Alternativas */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-xl p-5 shadow-sm space-y-4 border border-indigo-800/60">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wide">
                Curador de Reactivos & Alternativas
              </h2>
            </div>
            <p className="text-xs text-indigo-200/80 leading-relaxed">
              Trata con delicadeza la diferencia entre preguntas abiertas sin opciones vs reactivos con alternativas A/B/C/D/E sin reprocesar todo el libro.
            </p>

            <div className="space-y-2.5 pt-1">
              {/* Botón 1: Curación Instantánea Determinista de Reactivos */}
              <button
                id="btn-curate-questions-instant"
                onClick={handleCurateQuestionsDeterministic}
                disabled={isTargetedCurating || allBlocks.length === 0}
                className="w-full text-left p-3 bg-indigo-800/60 hover:bg-indigo-700/80 border border-indigo-700 rounded-xl text-xs flex items-center justify-between group transition shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-amber-300 shrink-0" />
                  <div>
                    <span className="font-bold block text-white">Curación Reactivos A-E (0 Tokens)</span>
                    <span className="text-[11px] text-indigo-200">Separa enunciados de opciones A-E automáticamente</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-indigo-300 opacity-70 group-hover:translate-x-0.5 transition" />
              </button>

              {/* Botón 2: Curación de Guionado OCR y Continuidad de Párrafos */}
              <button
                id="btn-curate-continuity-instant"
                onClick={handleCurateContinuityAndHyphenation}
                disabled={isTargetedCurating || chunks.length === 0}
                className="w-full text-left p-3 bg-teal-900/60 hover:bg-teal-800/80 border border-teal-700 rounded-xl text-xs flex items-center justify-between group transition shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Scissors className="w-4 h-4 text-teal-300 shrink-0" />
                  <div>
                    <span className="font-bold block text-white">Curar Guionado y Continuidad (0 Tokens)</span>
                    <span className="text-[11px] text-teal-200">Une palabras cortadas ("espá-  ragos") y hojas</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-teal-300 opacity-70 group-hover:translate-x-0.5 transition" />
              </button>

              {/* Botón 3: Re-análisis Quirúrgico con IA Ligera */}
              <button
                id="btn-reanalyze-questions-ai"
                onClick={handleReanalyzeTargetedQuestionsAI}
                disabled={isTargetedCurating || allBlocks.length === 0}
                className="w-full text-left p-3 bg-gradient-to-r from-blue-600/80 to-indigo-600/80 hover:from-blue-500 hover:to-indigo-500 border border-blue-400/40 rounded-xl text-xs flex items-center justify-between group transition shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                  <div>
                    <span className="font-bold block text-white">Re-analizar Solo Reactivos (IA Económica)</span>
                    <span className="text-[11px] text-blue-100">Procesa solo las preguntas dudosas en micro-lotes</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-blue-200 opacity-70 group-hover:translate-x-0.5 transition" />
              </button>
            </div>
          </div>

          {/* Módulo Especial: Uniformidad Transversal y Estructura Literaria */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-5 shadow-sm space-y-4 border border-indigo-700/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h2 className="text-sm font-bold uppercase tracking-wide">
                  Uniformidad Transversal & Novelas
                </h2>
              </div>
              {transversalReport && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  transversalReport.healthScore >= 80 ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700' : 'bg-amber-900/60 text-amber-300 border border-amber-700'
                }`}>
                  Salud: {transversalReport.healthScore}%
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Corrige anomalías de jerarquía en todo el libro, elimina falsos encabezados, y normaliza rayas de diálogo (—), poemas, epígrafes y descansos de escena (* * *).
            </p>

            {/* Desglose de bloques literarios y jerárquicos */}
            <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <div>
                <span className="text-slate-400 block">Diálogos Novela:</span>
                <span className="font-bold text-indigo-300">{literaryDialoguesCount} turnos</span>
              </div>
              <div>
                <span className="text-slate-400 block">Poemas / Versos:</span>
                <span className="font-bold text-indigo-300">{poemVersesCount} versos</span>
              </div>
              <div>
                <span className="text-slate-400 block">Epígrafes / Citas:</span>
                <span className="font-bold text-indigo-300">{epigraphsCount} bloques</span>
              </div>
              <div>
                <span className="text-slate-400 block">Descansos (* * *):</span>
                <span className="font-bold text-indigo-300">{breaksCount} descansos</span>
              </div>
            </div>

            {transversalReport && transversalReport.anomalies.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {transversalReport.anomalies.slice(0, 4).map((anom, aIdx) => (
                  <div key={aIdx} className="text-[11px] bg-amber-950/40 border border-amber-800/60 rounded p-1.5 text-amber-200">
                    <span className="font-bold block">{anom.type}:</span>
                    <span className="text-slate-300">{anom.description}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Botón de 1 Clic para Normalización Transversal */}
            <button
              id="btn-apply-transversal-normalization"
              onClick={handleApplyTransversalNormalization}
              disabled={allBlocks.length === 0}
              className="w-full text-left p-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 rounded-xl text-xs flex items-center justify-between group transition shadow-md font-semibold text-white"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                <div>
                  <span className="block font-bold">Unificar Estructura Transversal</span>
                  <span className="text-[10px] text-indigo-100 font-normal">Corrige falsos títulos, rayas y versos en 1 clic</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-indigo-200 group-hover:translate-x-0.5 transition" />
            </button>
          </div>

          {/* Asistente Editorial Global */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-indigo-600" />
              Otras Correcciones Globales
            </h2>

            {/* Acciones Rápidas */}
            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleApplyAiInstruction('Convierte todos los textos tabulares con barras o datos tabulares en bloques de tipo tabla con tableData estructurado.')}
                disabled={isApplyingFix}
                className="w-full text-left p-2.5 bg-sky-50 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-900/40 border border-sky-200 dark:border-sky-800 rounded-xl text-xs text-sky-900 dark:text-sky-200 flex items-center justify-between group transition"
              >
                <div className="flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-sky-600 shrink-0" />
                  <div>
                    <span className="font-bold block">Estructurar Tablas Markdown</span>
                    <span className="text-[10px] text-sky-700 dark:text-sky-300">Convierte tablas en texto a celdas nativas de Word</span>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition" />
              </button>
            </div>

            {/* Prompt Personalizado */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Instrucción Libre para la IA:
              </label>
              <textarea
                rows={3}
                placeholder="Ej: 'Asegura que las preguntas de balotario no tengan alternativas inventadas y que los títulos de unidad sean H1'"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => handleApplyAiInstruction(customPrompt)}
                disabled={!customPrompt.trim() || isApplyingFix}
                className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isApplyingFix ? 'Aplicando corrección...' : 'Ejecutar Corrección'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Columna Central y Derecha: Hallazgos de Auditoría y Vista de Bloques */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveViewMode('issues')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition ${
                    activeViewMode === 'issues'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Hallazgos de Auditoría ({issues.length})
                </button>
                <button
                  onClick={() => setActiveViewMode('all_blocks')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition ${
                    activeViewMode === 'all_blocks'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Inspeccionar Bloques ({totalBlocksCount})
                </button>
              </div>

              {activeViewMode === 'all_blocks' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Filtrar:</span>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium"
                  >
                    <option value="all">Todos los bloques ({totalBlocksCount})</option>
                    <option value="multiple_choice">🎯 Reactivos con Opciones ({multipleChoiceCount})</option>
                    <option value="open_question">📖 Preguntas Abiertas / Balotario ({openQuestionsCount})</option>
                    <option value="heading">📑 Títulos H1-H4 ({headingsCount})</option>
                    <option value="table">📊 Tablas ({tablesCount})</option>
                    <option value="theory_box">📦 Cajas Teóricas</option>
                    <option value="paragraph">📄 Párrafos</option>
                  </select>
                </div>
              )}
            </div>

            {/* Vista 1: Hallazgos de Auditoría */}
            {activeViewMode === 'issues' && (
              <div className="space-y-3">
                {issues.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">¡Estructura validada correctamente!</h3>
                    <p className="text-xs max-w-md mx-auto">
                      No se detectaron preguntas amalgamadas ni anomalías críticas. Puedes exportar el documento a Word y Google Docs con formatos no genéricos.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {issues.map((issue) => (
                      <div
                        key={issue.id}
                        onClick={() => setSelectedIssue(issue)}
                        className={`p-4 rounded-xl border cursor-pointer transition text-xs space-y-2 ${
                          selectedIssue?.id === issue.id
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20'
                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              issue.severity === 'high' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                              issue.severity === 'medium' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                              'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {issue.severity === 'high' ? 'Crítico' : issue.severity === 'medium' ? 'Mejora' : 'Leve'}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white">{issue.title}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">Tipo: {issue.type}</span>
                        </div>

                        <p className="text-slate-600 dark:text-slate-300">{issue.description}</p>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                          <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                            💡 Sugerencia: {issue.suggestedFix}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApplyAiInstruction(issue.suggestedFix);
                            }}
                            disabled={isApplyingFix}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-sm"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Corregir con IA</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Vista 2: Todos los Bloques Estructurados con Visualización Delicada de Opciones */}
            {activeViewMode === 'all_blocks' && (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {allBlocks
                  .filter(b => {
                    if (filterType === 'all') return true;
                    if (filterType === 'multiple_choice') return b.type === 'exercise' && b.options && b.options.length > 0;
                    if (filterType === 'open_question') return (b.type === 'exercise' && (!b.options || b.options.length === 0)) || (/^\(?\d{1,3}[\.\)]\s+/.test(b.content.trim()) && b.type !== 'heading1');
                    if (filterType === 'heading') return ['heading1', 'heading2', 'heading3', 'heading4'].includes(b.type);
                    return b.type === filterType;
                  })
                  .map((block, idx) => {
                    const isMC = block.type === 'exercise' && block.options && block.options.length > 0;
                    const isOpenQ = (block.type === 'exercise' && (!block.options || block.options.length === 0)) || /^\(?\d{1,3}[\.\)]\s+/.test(block.content.trim());

                    return (
                      <div
                        key={`${block.id || 'block'}_${idx}`}
                        className={`p-3.5 rounded-xl border space-y-2 text-xs transition ${
                          isMC
                            ? 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                            : isOpenQ
                            ? 'bg-amber-50/30 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                              #{idx + 1}
                            </span>
                            
                            {isMC ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">
                                🎯 Reactivo con Alternativas A-E
                              </span>
                            ) : isOpenQ ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                                📖 Pregunta Abierta / Balotario
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                {block.type}
                              </span>
                            )}

                            {block.title && (
                              <span className="font-bold text-slate-900 dark:text-white truncate max-w-xs">
                                {block.title}
                              </span>
                            )}
                          </div>
                          
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" /> Aprobado
                          </span>
                        </div>

                        {/* Enunciado Puro */}
                        <div className="text-slate-800 dark:text-slate-200 leading-relaxed font-sans font-medium">
                          <MathRenderer content={block.content} />
                        </div>

                        {/* Alternativas Estructuradas (Solo para Reactivos de Opción Múltiple) */}
                        {block.options && block.options.length > 0 && (
                          <div className="pl-3 py-2 space-y-1.5 bg-white dark:bg-slate-900/90 rounded-lg border border-slate-200 dark:border-slate-800">
                            {block.options.map((opt, oIdx) => (
                              <div key={oIdx} className="flex items-baseline gap-2 text-slate-700 dark:text-slate-300">
                                <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-[11px]">{opt.letter})</span>
                                <span className="flex-1">{opt.text}</span>
                                {opt.isCorrect && (
                                  <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-200">
                                    [Correcta ✓]
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Clave / Solucionario si existe */}
                        {(block.solution || block.explanation) && (
                          <div className="px-3 py-1.5 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded text-[11px] text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                            <span className="font-bold">Clave/Solución:</span>
                            <span>{block.solution || block.explanation}</span>
                          </div>
                        )}

                        {block.tableData && (
                          <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                            <span className="font-bold text-[11px] block mb-1 text-slate-700 dark:text-slate-300">
                              📊 Tabla estructurada ({block.tableData.headers.length} columnas, {block.tableData.rows.length} filas)
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

