import React, { useState } from 'react';
import { useSape } from '../context/SapeContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  RotateCw, 
  Sparkles, 
  Zap, 
  Pause, 
  X, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  Cpu, 
  Layers
} from 'lucide-react';
import { hasValidGeminiApiKey } from '../services/gemini';

export const ProcessingOverlay: React.FC = () => {
  const { 
    isProcessing, 
    processingProgress, 
    cancelProcessing, 
    pausePhase3Processing,
    switchToLocalProcessing
  } = useSape();

  const [isExpanded, setIsExpanded] = useState(false);

  if (!isProcessing) return null;

  const total = processingProgress.total || 100;
  const current = processingProgress.current || 0;
  const percent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  const isLocal = processingProgress.activeEngine === 'local';
  const hasAiKey = hasValidGeminiApiKey();

  return (
    <aside
      aria-label="Progreso de procesamiento no bloqueante"
      className="fixed bottom-6 right-6 z-50 max-w-sm sm:max-w-md w-full px-4 sm:px-0 pointer-events-auto"
    >
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        className="bg-[#12161b] border border-stone-800 rounded-2xl shadow-2xl p-4 space-y-3 font-sans text-stone-100 backdrop-blur-md"
      >
        {/* Cabecera del Progreso */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <RotateCw className="w-4 h-4 text-amber-400 animate-spin" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-100 truncate">
                  {processingProgress.stage || 'Procesando Obra'}
                </span>
                <span className="text-[11px] font-mono font-bold text-amber-400 bg-stone-900 px-1.5 py-0.5 rounded border border-stone-800">
                  {percent}%
                </span>
              </div>
              <p className="text-[11px] text-stone-400 truncate">
                {isLocal ? 'Motor Local Determinista (0 Tokens)' : `IA Activa (${processingProgress.activeModel || 'Gemini 3.8 Flash'})`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition cursor-pointer"
              title={isExpanded ? 'Contraer' : 'Ver detalle'}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            <button
              onClick={cancelProcessing}
              className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-stone-800 rounded-lg transition cursor-pointer"
              title="Cancelar proceso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de Progreso Minimalista */}
        <div className="w-full h-1.5 bg-stone-800/80 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-amber-500"
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ ease: 'easeOut', duration: 0.3 }}
          />
        </div>

        {/* Mensaje de Fase Actual y Niveles Jerárquicos */}
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="truncate">{processingProgress.macroStage || processingProgress.stage || 'Procesando Obra'}</span>
          </div>

          {(processingProgress.mesoChapter || processingProgress.microDetail) && (
            <div className="grid grid-cols-1 gap-1 text-[11px] text-stone-300 bg-stone-900/80 p-2 rounded-xl border border-stone-800/80">
              {processingProgress.mesoChapter && (
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-[10px] text-stone-400 uppercase font-bold shrink-0">Meso:</span>
                  <span className="truncate text-stone-200">{processingProgress.mesoChapter}</span>
                </div>
              )}
              {processingProgress.microDetail && (
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-[10px] text-stone-400 uppercase font-bold shrink-0">Micro:</span>
                  <span className="truncate text-amber-200 font-mono">{processingProgress.microDetail}</span>
                </div>
              )}
              {processingProgress.nanoToken && (
                <div className="flex items-center gap-1.5 truncate pt-0.5 border-t border-stone-800">
                  <span className="text-[10px] text-stone-500 uppercase font-bold shrink-0">Nano:</span>
                  <span className="truncate text-emerald-300/90 font-mono">{processingProgress.nanoToken}</span>
                </div>
              )}
            </div>
          )}

          {!processingProgress.mesoChapter && (
            <p className="text-xs text-stone-300 line-clamp-1 leading-snug">
              {processingProgress.processedDetail || processingProgress.message || 'Transformando unidades editoriales...'}
            </p>
          )}
        </div>

        {/* Detalle Expandible */}
        {isExpanded && (
          <div className="pt-2 border-t border-stone-800/80 space-y-2 text-xs text-stone-400 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span>Progreso:</span>
              <span className="font-mono text-stone-200">{current} / {total} ({percent}%)</span>
            </div>
            {processingProgress.recentLogs && processingProgress.recentLogs.length > 0 && (
              <div className="bg-[#0b0d10] p-2 rounded-lg border border-stone-800 font-mono text-[10px] space-y-0.5 max-h-24 overflow-y-auto">
                {processingProgress.recentLogs.slice(-4).map((log, lIdx) => (
                  <div key={lIdx} className="text-stone-400 truncate">{log}</div>
                ))}
              </div>
            )}
            {processingProgress.message && (
              <p className="text-[11px] text-stone-400 bg-[#0b0d10] p-2 rounded-lg border border-stone-800 font-mono">
                {processingProgress.message}
              </p>
            )}
          </div>
        )}

        {/* Botones de Control Rápidos */}
        <div className="flex items-center justify-end gap-2 pt-1">
          {!isLocal && hasAiKey && (
            <button
              onClick={switchToLocalProcessing}
              className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
              title="Pasar a motor local sin tokens"
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>0 Tokens (Local)</span>
            </button>
          )}

          <button
            onClick={pausePhase3Processing}
            className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
            title="Pausar proceso"
          >
            <Pause className="w-3 h-3" />
            <span>Pausar</span>
          </button>
        </div>
      </motion.div>
    </aside>
  );
};
