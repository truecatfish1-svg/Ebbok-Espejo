import React, { useState } from 'react';
import { useSape } from '../context/SapeContext';
import { MathRenderer } from './MathRenderer';
import { 
  Sparkles, 
  RotateCw, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Edit3, 
  Save, 
  Trash2, 
  Play, 
  Pause, 
  FileText, 
  Check, 
  Calculator, 
  Image as ImageIcon 
} from 'lucide-react';

export const PurificationPanel: React.FC = () => {
  const { 
    chunks, 
    updateChunk, 
    purifySingleChunk, 
    purifyAllPendingChunks, 
    rePurifyAllChunks,
    cancelProcessing, 
    isProcessing, 
    currentProcessingChunkId,
    setActiveTab 
  } = useSape();

  const [activeChunkId, setActiveChunkId] = useState<string>(chunks[0]?.id || '');
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string>('');

  const currentChunk = chunks.find(c => c.id === activeChunkId) || chunks[0];

  const total = chunks.length;
  const pending = chunks.filter(c => c.status === 'pending').length;
  const cleaned = chunks.filter(c => c.status === 'cleaned' || c.status === 'styled').length;
  const errors = chunks.filter(c => c.status === 'error').length;

  const startManualEdit = (chunk: typeof currentChunk) => {
    if (!chunk) return;
    setEditingChunkId(chunk.id);
    setEditedText(chunk.cleanContent || chunk.rawContent);
  };

  const saveManualEdit = (id: string) => {
    updateChunk(id, {
      cleanContent: editedText,
      status: 'cleaned',
      lastProcessedAt: `${new Date().toLocaleTimeString()} (Editado manual)`
    });
    setEditingChunkId(null);
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
          <div className="flex items-center gap-2 text-indigo-300 font-bold bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-800/80 shadow-sm">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">2</span>
            <span>Limpieza & LaTeX (Actual)</span>
          </div>
          <span className="text-slate-600">→</span>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center font-bold text-[10px]">3</span>
            <span>Tipificación Semántica</span>
          </div>
          <span className="text-slate-600">→</span>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center font-bold text-[10px]">4</span>
            <span>Auditoría & Calidad</span>
          </div>
          <span className="text-slate-600">→</span>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center font-bold text-[10px]">5</span>
            <span>Generación DOCX</span>
          </div>
        </div>
      </div>

      {/* Barra de Encabezado y Resumen */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Fase 2: Motor de Purificación OCR & Álgebra
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Elimina cornisas repetitivas (running headers), números de página y preserva la estructura natural de párrafos, listas y diálogos sin aplanar el contenido.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isProcessing ? (
              <button
                id="btn-cancel-purification"
                onClick={cancelProcessing}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition shadow-md"
              >
                <Pause className="w-4 h-4" />
                <span>Detener Procesamiento</span>
              </button>
            ) : (
              <>
                {pending > 0 ? (
                  <button
                    id="btn-purify-all"
                    onClick={purifyAllPendingChunks}
                    disabled={total === 0 || pending === 0}
                    className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl shadow-md transition"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Purificar {pending} Pendientes</span>
                  </button>
                ) : (
                  <button
                    id="btn-proceed-to-styles"
                    onClick={() => setActiveTab('estilos')}
                    className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md transition"
                  >
                    <span>Siguiente Paso: Tipificar Estilos ({cleaned} listos)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                {total > 0 && pending === 0 && (
                  <button
                    id="btn-repurify-all"
                    onClick={rePurifyAllChunks}
                    disabled={total === 0}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition"
                    title="Re-procesa todos los fragmentos con el nuevo algoritmo de preservación estructural y filtro anti-cornisas"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Re-purificar</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Métricas de Estado */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 font-medium block">Total Fragmentos</span>
            <span className="text-lg font-bold text-slate-800 dark:text-white">{total}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
            <span className="text-amber-700 dark:text-amber-400 font-medium block">Pendientes</span>
            <span className="text-lg font-bold text-amber-800 dark:text-amber-300">{pending}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
            <span className="text-emerald-700 dark:text-emerald-400 font-medium block">Purificados</span>
            <span className="text-lg font-bold text-emerald-800 dark:text-emerald-300">{cleaned}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50">
            <span className="text-rose-700 dark:text-rose-400 font-medium block">Con Errores</span>
            <span className="text-lg font-bold text-rose-800 dark:text-rose-300">{errors}</span>
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
          <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800 dark:text-white">No hay fragmentos cargados</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">Primero ingresa archivos o pega texto en la pestaña de Ingesta.</p>
          <button
            onClick={() => setActiveTab('ingesta')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg"
          >
            Ir a Ingesta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Barra Lateral: Selector de Fragmentos */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Lista de Fragmentos ({chunks.length})
            </h2>
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
              {chunks.map((chunk, idx) => {
                const isActive = (currentChunk?.id === chunk.id);
                const isCurrentProcessing = currentProcessingChunkId === chunk.id;

                return (
                  <button
                    key={chunk.id ? `${chunk.id}_${idx}` : `chunk_${idx}`}
                    onClick={() => setActiveChunkId(chunk.id)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition border flex items-center justify-between gap-2 ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 text-blue-900 dark:text-blue-200 font-semibold'
                        : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="truncate">{chunk.title}</span>
                    </div>

                    <div className="shrink-0">
                      {isCurrentProcessing ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                      ) : chunk.status === 'cleaned' || chunk.status === 'styled' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : chunk.status === 'error' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-amber-400 block" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Área Principal: Vista Dual del Fragmento Activo */}
          {currentChunk && (
            <div className="lg:col-span-3 space-y-4">
              {/* Barra de Herramientas del Fragmento */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{currentChunk.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded uppercase font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {currentChunk.sourceType}
                    </span>
                  </h2>
                  <span className="text-xs text-slate-500">
                    Estado: {currentChunk.status === 'cleaned' || currentChunk.status === 'styled' ? 'Purificado' : currentChunk.status}
                    {currentChunk.lastProcessedAt ? ` • Procesado a las ${currentChunk.lastProcessedAt}` : ''}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id={`btn-purify-single-${currentChunk.id}`}
                    onClick={() => purifySingleChunk(currentChunk.id)}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{currentChunk.cleanContent ? 'Re-procesar con IA' : 'Purificar este Fragmento'}</span>
                  </button>

                  {editingChunkId === currentChunk.id ? (
                    <button
                      onClick={() => saveManualEdit(currentChunk.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Guardar Edición</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => startManualEdit(currentChunk)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar Manualmente</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Ficha de Métricas de Purificación */}
              {currentChunk.cleanMetadata && (
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <div>
                      <span className="text-slate-500 block text-[10px]">Encabezados Removidos</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {currentChunk.cleanMetadata.runningHeadersRemoved?.length || 0}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <div>
                      <span className="text-slate-500 block text-[10px]">Números de Pág. Limpiados</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {currentChunk.cleanMetadata.pageNumbersRemoved?.length || 0}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-indigo-500" />
                    <div>
                      <span className="text-slate-500 block text-[10px]">Fórmulas LaTeX</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {currentChunk.cleanMetadata.latexFormulasFound || 0}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-blue-500" />
                    <div>
                      <span className="text-slate-500 block text-[10px]">Figuras Descritas</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {currentChunk.cleanMetadata.figuresDescribed || 0}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Vista Dual: Original vs Purificado */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Lado Izquierdo: Texto Crudo */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">
                      Texto Original (Escaneado / Crudo)
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {currentChunk.rawContent.length} carac.
                    </span>
                  </div>
                  <div className="h-[480px] overflow-y-auto font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    {currentChunk.rawContent}
                  </div>
                </div>

                {/* Lado Derecho: Texto Purificado */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Texto Purificado & Renderizado LaTeX
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {(currentChunk.cleanContent || '').length} carac.
                    </span>
                  </div>

                  {editingChunkId === currentChunk.id ? (
                    <textarea
                      rows={20}
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      className="w-full h-[480px] p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : currentChunk.cleanContent ? (
                    <div className="h-[480px] overflow-y-auto text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3 leading-relaxed">
                      <MathRenderer content={currentChunk.cleanContent} />
                    </div>
                  ) : (
                    <div className="h-[480px] flex flex-col items-center justify-center text-center p-6 text-slate-400 bg-slate-50 dark:bg-slate-950 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                      <Sparkles className="w-8 h-8 mb-2 opacity-50 text-indigo-400" />
                      <p className="text-xs font-semibold">Fragmento pendiente de purificación</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                        Haz clic en "Purificar este Fragmento" o procesa todos los pendientes para limpiar ruido y reconocer fórmulas.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
