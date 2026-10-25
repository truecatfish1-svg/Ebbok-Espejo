import React, { useState } from 'react';
import { useSape } from '../context/SapeContext';
import { ContentBlock, ContentBlockType, OptionItem } from '../types';
import { MathRenderer } from './MathRenderer';
import { 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Edit3, 
  ArrowRight, 
  HelpCircle, 
  Table as TableIcon, 
  Check, 
  FileText, 
  MessageSquare,
  Hash,
  ListOrdered,
  List,
  ShieldCheck
} from 'lucide-react';

const BLOCK_TYPES_CONFIG: { type: ContentBlockType; label: string; badgeColor: string; icon: string }[] = [
  { type: 'heading1', label: 'H1: Unidad / Capítulo', badgeColor: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200', icon: 'H1' },
  { type: 'heading2', label: 'H2: Tema Principal', badgeColor: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/50 dark:text-teal-200', icon: 'H2' },
  { type: 'heading3', label: 'H3: Subtema', badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/50 dark:text-indigo-200', icon: 'H3' },
  { type: 'heading4', label: 'H4: Apartado', badgeColor: 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200', icon: 'H4' },
  { type: 'paragraph', label: 'Párrafo Normal', badgeColor: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300', icon: '¶' },
  { type: 'novel_dialogue', label: 'Diálogo Novelístico (—)', badgeColor: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200', icon: '💬' },
  { type: 'poem_verse', label: 'Poema / Verso / Estrofa', badgeColor: 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/50 dark:text-purple-200', icon: '🪶' },
  { type: 'epigraph', label: 'Epígrafe / Dedicatoria', badgeColor: 'bg-stone-100 text-stone-900 border-stone-300 dark:bg-stone-800 dark:text-stone-200', icon: '📜' },
  { type: 'epistolary_letter', label: 'Carta / Telegrama (Novela)', badgeColor: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300', icon: '✉️' },
  { type: 'blockquote', label: 'Cita Textual en Bloque', badgeColor: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200', icon: '❝' },
  { type: 'ornamental_break', label: 'Descanso de Escena (* * *)', badgeColor: 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300', icon: '❦' },
  { type: 'author_footnote', label: 'Nota al Pie del Autor', badgeColor: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300', icon: '🏷️' },
  { type: 'theory_box', label: 'Caja de Teoría', badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200', icon: '📖' },
  { type: 'important_note', label: 'Nota Clave / Advertencia', badgeColor: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-200', icon: '⚠️' },
  { type: 'definition', label: 'Definición Formal', badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/50 dark:text-cyan-200', icon: '💡' },
  { type: 'curiosity', label: 'Dato Curioso / Contexto', badgeColor: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/50 dark:text-purple-200', icon: '✨' },
  { type: 'exercise', label: 'Reactivo / Ejercicio (Examen)', badgeColor: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/50 dark:text-rose-200', icon: '📝' },
  { type: 'table', label: 'Tabla Estructurada', badgeColor: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/50 dark:text-sky-200', icon: '📊' },
  { type: 'latex_math', label: 'Fórmula LaTeX en Bloque', badgeColor: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/50 dark:text-violet-200', icon: '∑' },
  { type: 'figure_desc', label: 'Descripción de Figura', badgeColor: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-200', icon: '🖼️' },
  { type: 'bullet_list', label: 'Lista con Viñetas', badgeColor: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300', icon: '•' },
  { type: 'numbered_list', label: 'Lista Numerada', badgeColor: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300', icon: '1.' },
  { type: 'glossary_item', label: 'Término de Glosario', badgeColor: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 dark:bg-fuchsia-900/50 dark:text-fuchsia-200', icon: '📚' },
];

export const StyleEnginePanel: React.FC = () => {
  const { 
    chunks, 
    styleSingleChunk, 
    styleAllCleanedChunks, 
    detectEditorialTaxonomy,
    purifyAndStyleSingleChunk,
    purifyAndStyleAllPending,
    transformEntireBookWithGlobalContext,
    styleGuide,
    setStyleGuide,
    updateBlock, 
    removeBlock, 
    addBlockToChunk, 
    approveAllBlocks, 
    isProcessing, 
    currentProcessingChunkId,
    setActiveTab,
    curateAllContinuityAndHyphenation,
    settings,
    transversalReport,
    runTransversalAudit,
    applyTransversalFixes 
  } = useSape();

  const [activeChunkId, setActiveChunkId] = useState<string>(chunks[0]?.id || '');
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [showTaxonomyDetails, setShowTaxonomyDetails] = useState<boolean>(false);
  const [auditFeedback, setAuditFeedback] = useState<string | null>(null);

  const currentChunk = chunks.find(c => c.id === activeChunkId) || chunks[0];
  const cleanedChunks = chunks.filter(c => (c.status === 'cleaned' || c.status === 'styled') && c.cleanContent);
  const styledCount = chunks.filter(c => c.status === 'styled' && c.blocks && c.blocks.length > 0).length;

  const handleAddNewBlock = () => {
    if (!currentChunk) return;
    addBlockToChunk(currentChunk.id, {
      type: 'paragraph',
      content: 'Nuevo párrafo de contenido editorial...',
      isApproved: true
    });
  };

  const totalChunks = chunks.length;
  const pendingToStyleCount = chunks.filter(c => !c.blocks || c.blocks.length === 0).length;
  const isFullyStyled = totalChunks > 0 && pendingToStyleCount === 0;

  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Encabezado y Acción Principal Unificada */}
      <div className="bg-[#121417] border border-stone-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <Layers className="w-4 h-4" />
              <span>Estructura Jerárquica & Tipografía Editorial</span>
            </div>
            <h1 className="text-xl font-bold text-stone-100 font-sans">
              Tipificación de Niveles, Tablas y Literatura
            </h1>
            <p className="text-xs text-stone-400 mt-1 max-w-2xl">
              Asigna y valida niveles H1–H4, tablas con formato no genérico (cantSplit, anchos proporcionales), diálogos con rayas largas (—), versos métricos y reactivos.
            </p>
          </div>

          {/* Botones de Acción: Botón Principal Claro + Opciones */}
          <div className="flex flex-wrap items-center gap-2">
            {!isFullyStyled ? (
              <button
                id="btn-transform-entire-book-style"
                onClick={transformEntireBookWithGlobalContext}
                disabled={isProcessing || chunks.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 text-stone-950 rounded-lg shadow-sm transition"
                title="Transforma todo el libro secuencialmente aplicando jerarquías y reactivos"
              >
                <Sparkles className="w-4 h-4" />
                <span>Tipificar Todo con IA ({chunks.length} frag.)</span>
              </button>
            ) : (
              <button
                id="btn-proceed-to-audit"
                onClick={() => setActiveTab('generacion')}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-lg shadow-sm transition"
              >
                <span>Exportar a Word DOCX</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* Menú de Opciones Secundarias */}
            <button
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="px-3 py-2 text-xs font-semibold bg-[#181b1f] hover:bg-stone-800 text-stone-300 rounded-lg border border-stone-700 transition"
            >
              {showAdvancedOptions ? 'Ocultar Opciones' : 'Herramientas'}
            </button>
          </div>
        </div>

        {/* Panel de Opciones Avanzadas Plegable */}
        {showAdvancedOptions && (
          <div className="p-4 bg-[#16181b] border border-stone-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-stone-400">Herramientas complementarias de tipificación:</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                id="btn-detect-taxonomy"
                onClick={detectEditorialTaxonomy}
                disabled={isProcessing || chunks.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition border border-stone-700"
                title="Detecta la jerarquía de títulos y patrones de reactivos"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{styleGuide ? 'Re-analizar Taxonomía' : 'Detectar Taxonomía'}</span>
              </button>

              <button
                id="btn-curate-continuity-style"
                onClick={() => curateAllContinuityAndHyphenation()}
                disabled={isProcessing || chunks.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-950/60 hover:bg-teal-900/80 text-teal-200 border border-teal-700 rounded-lg transition font-medium"
                title="Une palabras cortadas por guion ('espá-  ragos') y cura saltos entre páginas"
              >
                <span>Curar Guionado y Continuidad</span>
              </button>

              <button
                id="btn-run-audit-header"
                onClick={() => {
                  runTransversalAudit();
                }}
                disabled={isProcessing || chunks.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition border border-stone-700 font-medium"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auditar Documento</span>
              </button>
            </div>
          </div>
        )}

        {/* Barra de Uniformidad Transversal y Calidad Editorial */}
        <div className="p-3.5 rounded-xl bg-[#16181b] border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-stone-200 block">
                Uniformidad Transversal del Documento
              </span>
              <p className="text-[11px] text-stone-400">
                {transversalReport 
                  ? `Salud estructural: ${transversalReport.healthScore}% • ${transversalReport.totalBlocks} bloques analizados en ${chunks.length} fragmentos.`
                  : 'Garantiza consistencia absoluta de H1–H4, diálogos y versos en toda la obra.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-run-audit-inline"
              onClick={() => {
                const report = runTransversalAudit();
                setAuditFeedback(`Auditoría completada: Salud del libro al ${report.healthScore}%. Detectadas ${report.anomalies.length} observaciones.`);
                setTimeout(() => setAuditFeedback(null), 5000);
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-[#181b1f] hover:bg-stone-800 text-stone-200 rounded-lg border border-stone-700 transition"
            >
              Analizar Uniformidad
            </button>

            <button
              id="btn-unify-transversal-inline"
              onClick={() => {
                const fixed = applyTransversalFixes({ autoFixHeadings: true, unifyDialogues: true, detectLiteraryBlocks: true });
                setAuditFeedback(`¡Uniformidad aplicada! Se corrigieron y estandarizaron ${fixed} elementos.`);
                setTimeout(() => setAuditFeedback(null), 6000);
              }}
              className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Unificar Estructura Transversal</span>
            </button>
          </div>
        </div>

        {/* Notificación de feedback de auditoría */}
        {auditFeedback && (
          <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2 animate-fadeIn">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{auditFeedback}</span>
          </div>
        )}

        {/* Resumen de Taxonomía Descubierta */}
        {styleGuide && (
          <div className="p-3.5 rounded-lg bg-[#16181b] border border-stone-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                Guía de Taxonomía Editorial Activa: <strong className="text-amber-400">{styleGuide.taxonomyName}</strong>
              </span>
              <button
                onClick={() => setShowTaxonomyDetails(!showTaxonomyDetails)}
                className="text-[11px] text-amber-400 font-semibold hover:underline"
              >
                {showTaxonomyDetails ? 'Ocultar detalles' : 'Ver patrones y jerarquías'}
              </button>
            </div>

            {showTaxonomyDetails && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-stone-800">
                <div className="bg-[#121417] p-2.5 rounded-lg border border-stone-800">
                  <span className="font-semibold text-stone-300 block mb-1">Niveles de Encabezado</span>
                  <p className="text-stone-400 text-[11px]">H1: {styleGuide.hierarchy?.heading1 || 'CAPÍTULO / UNIDAD'}</p>
                  <p className="text-stone-400 text-[11px]">H2: {styleGuide.hierarchy?.heading2 || '1.1 TEMA'}</p>
                  <p className="text-stone-400 text-[11px]">H3: {styleGuide.hierarchy?.heading3 || 'Subtema'}</p>
                </div>
                <div className="bg-[#121417] p-2.5 rounded-lg border border-stone-800">
                  <span className="font-semibold text-stone-300 block mb-1">Patrón de Reactivos</span>
                  <p className="text-stone-400 text-[11px]">{styleGuide.hierarchy?.exercises || 'Ejercicios con alternativas A) B) C) D)'}</p>
                </div>
                <div className="bg-[#121417] p-2.5 rounded-lg border border-stone-800">
                  <span className="font-semibold text-stone-300 block mb-1">Cajas & Tablas</span>
                  <p className="text-stone-400 text-[11px]">Cajas: {styleGuide.hierarchy?.boxes || 'Teoría y notas destacadas'}</p>
                  <p className="text-stone-400 text-[11px]">Tablas: {styleGuide.hierarchy?.tables || 'Cabeceras y datos estructurados'}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {chunks.length === 0 ? (
        <div className="bg-[#121417] border border-stone-800 rounded-xl p-12 text-center">
          <Layers className="w-10 h-10 text-stone-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-stone-200">No hay fragmentos cargados</h2>
          <p className="text-xs text-stone-400 mt-1 mb-4">Primero ingresa tus documentos en la pestaña de Ingesta.</p>
          <button
            onClick={() => setActiveTab('ingesta')}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-lg shadow-sm"
          >
            Ir a Ingesta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Selector Lateral de Fragmentos */}
          <div className="bg-[#121417] border border-stone-800 rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="text-xs font-bold text-stone-300 uppercase tracking-wider">
              Fragmentos ({chunks.length})
            </h2>

            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
              {chunks.map((chunk, idx) => {
                const isActive = currentChunk?.id === chunk.id;
                const blockCount = chunk.blocks?.length || 0;

                return (
                  <button
                    key={chunk.id ? `${chunk.id}_${idx}` : `chunk_${idx}`}
                    onClick={() => setActiveChunkId(chunk.id)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition border flex items-center justify-between gap-2 ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 font-semibold'
                        : 'bg-[#181b1f] border-stone-800 text-stone-300 hover:bg-stone-800 hover:border-stone-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded bg-stone-800 text-stone-200 text-[10px] font-bold flex items-center justify-center shrink-0 border border-stone-700">
                        {idx + 1}
                      </span>
                      <span className="truncate">{chunk.title}</span>
                    </div>

                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 shrink-0 font-medium border border-stone-700">
                      {blockCount > 0 ? `${blockCount} blq` : (chunk.status === 'cleaned' ? 'Limpio' : 'Pend.')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Área Principal de Bloques del Fragmento */}
          {currentChunk && (
            <div className="lg:col-span-3 space-y-4">
              {/* Barra de Control del Fragmento */}
              <div className="bg-[#121417] border border-stone-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-stone-100 font-sans">
                    {currentChunk.title}
                  </h2>
                  <span className="text-xs text-stone-400">
                    {currentChunk.blocks?.length || 0} bloques tipificados en este fragmento
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id={`btn-style-single-${currentChunk.id}`}
                    onClick={() => styleSingleChunk(currentChunk.id)}
                    disabled={isProcessing || !currentChunk.cleanContent}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg text-xs font-bold transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{currentChunk.blocks && currentChunk.blocks.length > 0 ? 'Re-analizar con IA' : 'Tipificar con IA'}</span>
                  </button>

                  <button
                    onClick={handleAddNewBlock}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181b1f] hover:bg-stone-800 text-stone-200 border border-stone-700 rounded-lg text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Añadir Bloque</span>
                  </button>

                  <button
                    onClick={() => approveAllBlocks(currentChunk.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Aprobar Todos</span>
                  </button>
                </div>
              </div>

              {/* Lista de Bloques */}
              {(!currentChunk.blocks || currentChunk.blocks.length === 0) ? (
                <div className="bg-[#121417] border border-stone-800 rounded-xl p-10 text-center space-y-3">
                  <Layers className="w-8 h-8 text-amber-400 mx-auto" />
                  <h3 className="font-bold text-sm text-stone-200">Este fragmento aún no ha sido tipificado</h3>
                  <p className="text-xs text-stone-400 max-w-md mx-auto">
                    Ejecuta "Tipificar con IA" para que el motor identifique automáticamente títulos, teoría, reactivos y tablas, o añade bloques manualmente.
                  </p>
                  <button
                    onClick={() => styleSingleChunk(currentChunk.id)}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-lg shadow-sm"
                  >
                    Tipificar ahora con IA
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentChunk.blocks.map((block, bIdx) => {
                    const blockConfig = BLOCK_TYPES_CONFIG.find(t => t.type === block.type) || BLOCK_TYPES_CONFIG[4];

                    return (
                      <div
                        key={block.id ? `${block.id}_${bIdx}` : `block_${bIdx}`}
                        className={`bg-[#121417] border rounded-xl p-4 shadow-sm transition space-y-3 ${
                          block.isApproved 
                            ? 'border-stone-800' 
                            : 'border-amber-500/40 bg-amber-950/10'
                        }`}
                      >
                        {/* Cabecera del Bloque: Tipo, Título opcional y Acciones */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-800">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-stone-400">#{bIdx + 1}</span>

                            {/* Selector de Tipo de Bloque */}
                            <select
                              value={block.type}
                              onChange={(e) => updateBlock(currentChunk.id, block.id, { type: e.target.value as ContentBlockType })}
                              className={`text-xs font-bold px-2.5 py-1 rounded-md border focus:outline-none cursor-pointer ${blockConfig.badgeColor}`}
                            >
                              {BLOCK_TYPES_CONFIG.map(cfg => (
                                <option key={cfg.type} value={cfg.type}>
                                  {cfg.icon} {cfg.label}
                                </option>
                              ))}
                            </select>

                            {/* Título opcional del bloque (ej: "Propiedades", "Pregunta 1") */}
                            <input
                              type="text"
                              value={block.title || ''}
                              placeholder="Título opcional del bloque / pregunta"
                              onChange={(e) => updateBlock(currentChunk.id, block.id, { title: e.target.value })}
                              className="text-xs px-2 py-0.5 bg-[#181b1f] border border-stone-700 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateBlock(currentChunk.id, block.id, { isApproved: !block.isApproved })}
                              className={`p-1.5 rounded text-xs font-medium flex items-center gap-1 transition ${
                                block.isApproved
                                  ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800'
                                  : 'text-stone-400 hover:text-emerald-400 bg-stone-800'
                              }`}
                              title={block.isApproved ? 'Aprobado' : 'Marcar como aprobado'}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="text-[11px] hidden sm:inline">{block.isApproved ? 'Aprobado' : 'Revisar'}</span>
                            </button>

                            <button
                              onClick={() => removeBlock(currentChunk.id, block.id)}
                              className="p-1.5 text-stone-400 hover:text-rose-400 rounded hover:bg-stone-800 transition"
                              title="Eliminar bloque"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Editor de Contenido según Tipo */}
                        <div className="space-y-3">
                          {/* Contenido Principal (Texto / Enunciado) */}
                          <div>
                            <label className="block text-[11px] font-semibold text-stone-400 mb-1">
                              {block.type === 'exercise' ? 'Enunciado del Reactivo / Pregunta' : 'Contenido del Bloque (soporta fórmulas LaTeX $...$)'}
                            </label>
                            <textarea
                              rows={block.type.startsWith('heading') ? 1 : 3}
                              value={block.content}
                              onChange={(e) => updateBlock(currentChunk.id, block.id, { content: e.target.value })}
                              className="w-full p-2.5 text-xs bg-[#16181b] border border-stone-800 rounded-lg text-stone-200 font-sans focus:outline-none focus:border-amber-500/60"
                            />
                          </div>

                          {/* Renderizado en Vivo del Bloque */}
                          <div className="p-3 bg-[#181b1f] rounded-lg border border-stone-800">
                            <span className="text-[10px] uppercase font-bold text-stone-400 block mb-1.5">
                              Vista Previa Editorial
                            </span>
                            
                            {block.type === 'heading1' && (
                              <h1 className="text-lg font-bold text-stone-100 font-sans border-b border-stone-700 pb-1">
                                <MathRenderer content={block.content} />
                              </h1>
                            )}
                            {block.type === 'heading2' && (
                              <h2 className="text-base font-bold text-amber-400 font-sans">
                                <MathRenderer content={block.content} />
                              </h2>
                            )}
                            {block.type === 'heading3' && (
                              <h3 className="text-sm font-bold text-stone-200 font-sans">
                                <MathRenderer content={block.content} />
                              </h3>
                            )}
                            {block.type === 'heading4' && (
                              <h4 className="text-xs font-bold italic text-stone-300">
                                <MathRenderer content={block.content} />
                              </h4>
                            )}
                            {block.type === 'paragraph' && (
                              <div className="text-xs text-stone-300 leading-relaxed whitespace-pre-wrap font-sans">
                                <MathRenderer content={block.content} />
                              </div>
                            )}
                            {block.type === 'exercise' && (
                              <div className="space-y-2">
                                <div className="text-xs font-semibold text-stone-100">
                                  {block.title && <span className="font-bold text-amber-400 mr-1">{block.title}</span>}
                                  <MathRenderer content={block.content} />
                                </div>
                                {block.options && block.options.length > 0 && (
                                  <div className="pl-4 space-y-1 text-xs">
                                    {block.options.map((opt, oIdx) => (
                                      <div key={oIdx} className="flex items-start gap-2">
                                        <span className="font-bold text-stone-400">{opt.letter})</span>
                                        <span className={opt.isCorrect ? 'font-semibold text-emerald-400' : 'text-stone-300'}>
                                          <MathRenderer content={opt.text} />
                                          {opt.isCorrect && <span className="ml-1 text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1 py-0.5 rounded">Correcta ✓</span>}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {(block.solution || block.explanation) && (
                                  <div className="mt-2 text-[11px] text-teal-300 italic pl-4 border-l-2 border-teal-500">
                                    <span className="font-semibold">Explicación / Solucionario: </span>
                                    {block.solution && <span className="font-bold mr-1">[Clave: {block.solution}]</span>}
                                    <span>{block.explanation}</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {(block.type === 'theory_box' || block.type === 'definition') && (
                              <div className="p-3 bg-emerald-950/40 border-l-4 border-emerald-500 rounded-r-lg text-xs text-emerald-200">
                                {block.title && <span className="font-bold block mb-1 text-emerald-300">{block.title}</span>}
                                <MathRenderer content={block.content} />
                              </div>
                            )}
                            {(block.type === 'important_note' || block.type === 'curiosity') && (
                              <div className="p-3 bg-amber-950/40 border-l-4 border-amber-500 rounded-r-lg text-xs text-amber-200">
                                {block.title && <span className="font-bold block mb-1 text-amber-300">⚠️ {block.title}</span>}
                                <MathRenderer content={block.content} />
                              </div>
                            )}
                            {block.type === 'latex_math' && (
                              <div className="p-2 bg-[#121417] rounded text-center border border-stone-800">
                                <MathRenderer content={`$$${block.latex || block.content}$$`} />
                              </div>
                            )}
                          </div>

                          {/* Sub-Editor Especial para Reactivos (Opciones A, B, C, D y Solucionario) */}
                          {block.type === 'exercise' && (
                            <div className="p-3 bg-[#16181b] rounded-lg border border-stone-800 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-stone-300 uppercase">
                                  Alternativas de Respuesta
                                </span>
                                <button
                                  onClick={() => {
                                    const currentOpts = block.options || [];
                                    const nextLetter = String.fromCharCode(65 + currentOpts.length);
                                    updateBlock(currentChunk.id, block.id, {
                                      options: [...currentOpts, { letter: nextLetter, text: '' }]
                                    });
                                  }}
                                  className="text-[11px] font-semibold text-amber-400 hover:underline flex items-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Añadir Alternativa</span>
                                </button>
                              </div>

                              <div className="space-y-2">
                                {(block.options || []).map((opt, oIdx) => (
                                  <div key={oIdx} className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded bg-stone-800 text-stone-200 font-bold text-xs flex items-center justify-center shrink-0 border border-stone-700">
                                      {opt.letter})
                                    </span>
                                    <input
                                      type="text"
                                      value={opt.text}
                                      placeholder={`Texto de la opción ${opt.letter}`}
                                      onChange={(e) => {
                                        const newOpts = [...(block.options || [])];
                                        newOpts[oIdx] = { ...opt, text: e.target.value };
                                        updateBlock(currentChunk.id, block.id, { options: newOpts });
                                      }}
                                      className="flex-1 px-2.5 py-1 text-xs bg-[#121417] border border-stone-700 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                                    />
                                    <button
                                      onClick={() => {
                                        const newOpts = (block.options || []).map((o, i) => ({
                                          ...o,
                                          isCorrect: i === oIdx ? !o.isCorrect : false
                                        }));
                                        updateBlock(currentChunk.id, block.id, { options: newOpts });
                                      }}
                                      className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                                        opt.isCorrect
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-emerald-400'
                                      }`}
                                      title="Marcar como alternativa correcta"
                                    >
                                      {opt.isCorrect ? 'Correcta ✓' : 'Marcar'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        const newOpts = (block.options || []).filter((_, i) => i !== oIdx);
                                        updateBlock(currentChunk.id, block.id, { options: newOpts });
                                      }}
                                      className="p-1 text-stone-400 hover:text-rose-400 transition"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>

                              {/* Solución / Justificación */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-stone-800">
                                <div>
                                  <label className="block text-[10px] font-semibold text-stone-400 mb-1">Clave Correcta</label>
                                  <input
                                    type="text"
                                    value={block.solution || ''}
                                    placeholder="Ej: A"
                                    onChange={(e) => updateBlock(currentChunk.id, block.id, { solution: e.target.value })}
                                    className="w-full px-2 py-1 text-xs bg-[#121417] border border-stone-700 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-stone-400 mb-1">Explicación / Solucionario</label>
                                  <input
                                    type="text"
                                    value={block.explanation || ''}
                                    placeholder="Justificación de la respuesta..."
                                    onChange={(e) => updateBlock(currentChunk.id, block.id, { explanation: e.target.value })}
                                    className="w-full px-2 py-1 text-xs bg-[#121417] border border-stone-700 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Sub-Editor Especial para Tablas */}
                          {block.type === 'table' && block.tableData && (
                            <div className="p-3 bg-[#16181b] rounded-lg border border-stone-800 space-y-3 overflow-x-auto">
                              <span className="text-xs font-bold text-stone-300 uppercase block">
                                Editor de Tabla
                              </span>
                              <table className="w-full text-xs border-collapse border border-stone-700">
                                <thead>
                                  <tr className="bg-stone-800 text-stone-100">
                                    {block.tableData.headers.map((h, hIdx) => (
                                      <th key={hIdx} className="p-1.5 border border-stone-700">
                                        <input
                                          type="text"
                                          value={h}
                                          onChange={(e) => {
                                            const newHeaders = [...block.tableData!.headers];
                                            newHeaders[hIdx] = e.target.value;
                                            updateBlock(currentChunk.id, block.id, {
                                              tableData: { ...block.tableData!, headers: newHeaders }
                                            });
                                          }}
                                          className="w-full bg-transparent text-stone-100 font-bold text-center focus:outline-none"
                                        />
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {block.tableData.rows.map((row, rIdx) => (
                                    <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-[#181b1f]' : 'bg-[#121417]'}>
                                      {row.map((cell, cIdx) => (
                                        <td key={cIdx} className="p-1.5 border border-stone-700">
                                          <input
                                            type="text"
                                            value={cell}
                                            onChange={(e) => {
                                              const newRows = [...block.tableData!.rows];
                                              newRows[rIdx] = [...newRows[rIdx]];
                                              newRows[rIdx][cIdx] = e.target.value;
                                              updateBlock(currentChunk.id, block.id, {
                                                tableData: { ...block.tableData!, rows: newRows }
                                              });
                                            }}
                                            className="w-full bg-transparent text-stone-200 focus:outline-none"
                                          />
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Comentario Editorial del Bloque */}
                          <div className="flex items-center gap-2 pt-1">
                            <MessageSquare className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                            <input
                              type="text"
                              value={block.editorialComment || ''}
                              placeholder="Añadir comentario o nota de revisión editorial (opcional)..."
                              onChange={(e) => updateBlock(currentChunk.id, block.id, { editorialComment: e.target.value })}
                              className="w-full text-[11px] px-2 py-0.5 bg-transparent border-b border-dashed border-stone-700 text-stone-400 focus:outline-none focus:border-amber-500 italic"
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
        </div>
      )}
    </div>
  );
};
