import React, { useState } from 'react';
import { useSape } from '../context/SapeContext';
import { 
  GLOBAL_MODELS_LIST, 
  testSingleGeminiModel, 
  testAllGeminiModels, 
  ModelTestResult 
} from '../services/gemini';
import { 
  Cpu, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Zap, 
  ShieldCheck, 
  X,
  Play
} from 'lucide-react';

interface ModelTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModelTesterModal: React.FC<ModelTesterModalProps> = ({ isOpen, onClose }) => {
  const { selectedModel, setSelectedModel } = useSape();
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ModelTestResult>>({});

  if (!isOpen) return null;

  const handleTestSingle = async (modelId: string) => {
    setTestingModelId(modelId);
    setResults(prev => ({
      ...prev,
      [modelId]: { modelId, name: modelId, status: 'testing', message: 'Enviando ping de prueba a la API...' }
    }));
    try {
      const res = await testSingleGeminiModel(modelId);
      setResults(prev => ({ ...prev, [modelId]: res }));
    } catch (err: any) {
      setResults(prev => ({
        ...prev,
        [modelId]: { modelId, name: modelId, status: 'error', message: err?.message || 'Error inesperado' }
      }));
    } finally {
      setTestingModelId(null);
    }
  };

  const handleTestAll = async () => {
    setIsTestingAll(true);
    const initial: Record<string, ModelTestResult> = {};
    for (const m of GLOBAL_MODELS_LIST) {
      if (m.id !== 'auto-cascade') {
        initial[m.id] = { modelId: m.id, name: m.name, status: 'testing', message: 'En cola...' };
      }
    }
    setResults(initial);

    for (const m of GLOBAL_MODELS_LIST) {
      if (m.id === 'auto-cascade') continue;
      setTestingModelId(m.id);
      setResults(prev => ({
        ...prev,
        [m.id]: { modelId: m.id, name: m.name, status: 'testing', message: 'Verificando conectividad...' }
      }));
      const res = await testSingleGeminiModel(m.id);
      setResults(prev => ({ ...prev, [m.id]: res }));
    }
    setTestingModelId(null);
    setIsTestingAll(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in font-sans">
      <div className="bg-[#101318] border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-[#141820]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Verificador en Vivo de Modelos Gemini
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                  Diagnóstico Real
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Comprueba qué modelos responden de verdad, su latencia y estado de cuota
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Acciones Rápidas */}
        <div className="px-5 py-3.5 bg-[#0d1014] border-b border-zinc-800/80 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">
            Modelo activo actual: <span className="text-amber-300 font-semibold font-mono">{selectedModel}</span>
          </div>
          <button
            onClick={handleTestAll}
            disabled={isTestingAll}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 text-xs font-bold rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingAll ? 'animate-spin' : ''}`} />
            <span>{isTestingAll ? 'Verificando Flota...' : 'Probar Todos los Modelos Ahora'}</span>
          </button>
        </div>

        {/* Lista de Modelos */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {GLOBAL_MODELS_LIST.map((model) => {
            const isSelected = selectedModel === model.id;
            const res = results[model.id];
            const isTestingThis = testingModelId === model.id;

            return (
              <div
                key={model.id}
                className={`p-4 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-amber-500/5 border-amber-500/40 shadow-xs'
                    : 'bg-[#141820] border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-zinc-100">{model.name}</span>
                      {isSelected && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                          Activo
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-zinc-500">
                        {model.rpm} RPM • {model.tpm / 1000}k TPM
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      ID: <span className="text-zinc-300">{model.id}</span>
                    </div>

                    {/* Resultado de la prueba */}
                    {res && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs">
                        <div className="flex items-center gap-2">
                          {res.status === 'testing' && (
                            <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                          )}
                          {res.status === 'ok' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          {res.status === 'rate_limited' && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                          {(res.status === 'error' || res.status === 'not_found') && (
                            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          )}
                          <span className={`font-medium ${
                            res.status === 'ok' ? 'text-emerald-300' :
                            res.status === 'rate_limited' ? 'text-amber-300' :
                            res.status === 'testing' ? 'text-amber-200' : 'text-rose-300'
                          }`}>
                            {res.message}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {model.id !== 'auto-cascade' && (
                      <button
                        onClick={() => handleTestSingle(model.id)}
                        disabled={isTestingThis || isTestingAll}
                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg transition disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                        title="Enviar ping de prueba a este modelo"
                      >
                        <Play className="w-3 h-3 text-amber-400" />
                        <span>Probar</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedModel(model.id);
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-zinc-950 font-bold'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {isSelected ? 'Seleccionado' : 'Usar este'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pie */}
        <div className="p-4 bg-[#0d1014] border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Rotación automática activa en caso de agotamiento de cuota</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-lg transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
