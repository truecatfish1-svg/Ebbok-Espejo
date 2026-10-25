import React, { useState, useEffect } from 'react';
import { GLOBAL_MODELS_LIST, telemetryStore } from '../services/gemini';
import { Activity, ShieldAlert, CheckCircle2, RotateCcw, AlertTriangle, Cpu } from 'lucide-react';

interface TelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TelemetryModal: React.FC<TelemetryModalProps> = ({ isOpen, onClose }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const logs = telemetryStore.getLogs();

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl text-slate-100">
        {/* Cabecera */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Monitor de Resiliencia y Modelos de IA</h2>
              <p className="text-xs text-slate-400">Control de cuotas (RPM / TPM / RPD) y transiciones automáticas ante caídas o límites.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white text-lg font-bold"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Tarjetas de Modelos */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Estado de Cuota por Modelo
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {GLOBAL_MODELS_LIST.map((model) => {
                const t = telemetryStore.getTelemetry(model.id);
                const status = telemetryStore.getStatus(model.id);

                return (
                  <div
                    key={model.id}
                    className="p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs">{model.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        status === 'Online' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        status === 'Approaching Limits' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 text-slate-300">
                      <div>
                        <span className="text-slate-500 block text-[10px]">RPM (Minuto)</span>
                        <span className="font-bold">{t.rpmCount}</span> / {model.rpm}
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">TPM (Tokens)</span>
                        <span className="font-bold">{(t.tpmCount / 1000).toFixed(1)}k</span> / {(model.tpm / 1000).toFixed(0)}k
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">RPD (Día)</span>
                        <span className="font-bold">{t.rpdCount}</span> / {model.rpd}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Registro de Fallbacks / Transiciones Automáticas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                Historial de Transiciones de Emergencia (Fallbacks)
              </h3>
              <button
                onClick={() => telemetryStore.clearTelemetry()}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reiniciar Estadísticas</span>
              </button>
            </div>

            {logs.length === 0 ? (
              <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-800 text-center text-slate-500">
                <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-500 opacity-80" />
                <span>No se han registrado caídas de cuota ni fallbacks de emergencia en esta sesión.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto font-mono text-[11px]">
                {logs.map((log, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-800/90 border border-slate-700/60 rounded-lg flex items-start gap-2 text-slate-300"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 text-slate-400 text-[10px]">
                        <span>[{log.timestamp}]</span>
                        <span className="text-rose-400 font-bold">{log.from}</span>
                        <span>➔</span>
                        <span className="text-emerald-400 font-bold">{log.to}</span>
                      </div>
                      <p className="mt-0.5 text-slate-200">{log.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pie */}
        <div className="p-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
          >
            Cerrar Monitor
          </button>
        </div>
      </div>
    </div>
  );
};
