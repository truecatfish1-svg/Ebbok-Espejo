import React, { useState, useEffect } from 'react';
import { useSape } from '../context/SapeContext';
import { ActiveTab } from '../types';
import { GLOBAL_MODELS_LIST, telemetryStore } from '../services/gemini';
import { 
  BookOpen, 
  FileText, 
  Sparkles, 
  Layers, 
  Download, 
  Activity, 
  FolderArchive, 
  Save, 
  CheckCircle2, 
  AlertTriangle,
  RotateCw,
  Plus,
  Trash2,
  ShieldCheck,
  Columns
} from 'lucide-react';

interface NavigationHeaderProps {
  onOpenTelemetry: () => void;
  onOpenProjects: () => void;
  onOpenModelTester?: () => void;
}

export const NavigationHeader: React.FC<NavigationHeaderProps> = ({ 
  onOpenTelemetry, 
  onOpenProjects,
  onOpenModelTester 
}) => {
  const { 
    activeTab, 
    setActiveTab, 
    metadata, 
    chunks, 
    selectedModel, 
    setSelectedModel,
    saveProject,
    newProject,
    purgeAllMemoryAndStorage,
    isProcessing,
    processingProgress
  } = useSape();

  const [modelStatus, setModelStatus] = useState<'Online' | 'Approaching Limits' | 'Depleted/Rate Limited' | 'Offline'>('Online');
  const [saveToast, setSaveToast] = useState(false);
  const [recentFallback, setRecentFallback] = useState<string | null>(null);
  const [headerPurgeConfirm, setHeaderPurgeConfirm] = useState(false);

  useEffect(() => {
    const update = () => {
      setModelStatus(telemetryStore.getStatus(selectedModel));
    };
    update();
    const interval = setInterval(update, 5000);
    window.addEventListener('sape-telemetry-updated', update);
    window.addEventListener('te-telemetry-updated', update);

    const onModelSwitched = (e: any) => {
      const detail = e.detail;
      if (detail?.to) {
        setSelectedModel(detail.to);
        setRecentFallback(`Rotación automática: cambio a ${detail.to} para asegurar respuesta continua.`);
        setTimeout(() => setRecentFallback(null), 6000);
      }
    };
    window.addEventListener('sape-model-switched', onModelSwitched);
    window.addEventListener('te-model-switched', onModelSwitched);

    return () => {
      clearInterval(interval);
      window.removeEventListener('sape-telemetry-updated', update);
      window.removeEventListener('te-telemetry-updated', update);
      window.removeEventListener('sape-model-switched', onModelSwitched);
      window.removeEventListener('te-model-switched', onModelSwitched);
    };
  }, [selectedModel]);

  const handleQuickSave = () => {
    saveProject();
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  // Contadores para badges
  const totalChunks = chunks.length;
  const cleanedChunks = chunks.filter(c => c.status === 'cleaned' || c.status === 'styled').length;
  const styledChunks = chunks.filter(c => c.status === 'styled' && c.blocks && c.blocks.length > 0).length;
  const totalBlocks = chunks.reduce((acc, c) => acc + (c.blocks?.length || 0), 0);

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string | number; desc: string }[] = [
    { 
      id: 'auditoria', 
      label: '0. Auditoría & Código en Vivo', 
      icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />, 
      badge: 'Supervisión',
      desc: 'Inspección de código, supervisión de 4 invariantes y suite de pruebas'
    },
    { 
      id: 'ingesta', 
      label: '1. Ingesta y Limpieza', 
      icon: <BookOpen className="w-4 h-4" />, 
      badge: totalChunks > 0 ? `${totalChunks} págs` : undefined,
      desc: 'Carga de obras (A y B), disolución de cabeceras, unión de guiones y párrafos continuos'
    },
    { 
      id: 'curaduria', 
      label: '2. Estructura e Índice', 
      icon: <Sparkles className="w-4 h-4" />, 
      badge: 'Auto TOC',
      desc: 'Detección automática de índice/TOC, demarcación de capítulos y diálogos con raya'
    },
    { 
      id: 'paralelo', 
      label: '3. Edición Espejo & Exportación', 
      icon: <Columns className="w-4 h-4" />, 
      badge: 'Facing Pages',
      desc: 'Cotejo bilingüe sincronizado 1:1, pliegos enfrentados y exportación a DOCX / Word'
    },
  ];

  return (
    <header className="bg-[#0e1217] border-b border-stone-800 text-stone-100 sticky top-0 z-40 shadow-sm font-sans">
      {/* Barra superior de control y metadatos */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Título */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shadow-sm">
            <BookOpen className="w-5 h-5 text-stone-950 font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white">TE • Transcrito Editorial</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-stone-900 text-amber-300 font-mono border border-stone-800">
                0 Tokens Nativos
              </span>
            </div>
            <p className="text-xs text-stone-400 truncate max-w-xs sm:max-w-sm font-normal">
              {metadata.title || 'Proyecto Editorial'} {metadata.subject ? `• ${metadata.subject}` : ''}
            </p>
          </div>
        </div>

        {/* Acciones de Proyecto, Modelo de IA y Telemetría */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Selector de Modelo con Resiliencia */}
          <div className="flex items-center gap-1.5 bg-[#14171a] border border-stone-800 rounded-xl px-2.5 py-1.5">
            <span className="text-stone-400 font-medium hidden md:inline">Modelo IA:</span>
            <select
              id="model-selector-header"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent text-stone-200 text-xs font-semibold focus:outline-none cursor-pointer max-w-[140px] sm:max-w-[210px] truncate"
            >
              {GLOBAL_MODELS_LIST.map(m => (
                <option key={m.id} value={m.id} className="bg-stone-900 text-stone-200">
                  {m.name}
                </option>
              ))}
            </select>
            <span 
              title={`Estado: ${modelStatus}`}
              className={`w-2 h-2 rounded-full inline-block shrink-0 ${
                modelStatus === 'Online' ? 'bg-emerald-400 animate-pulse' :
                modelStatus === 'Approaching Limits' ? 'bg-amber-400' :
                modelStatus === 'Depleted/Rate Limited' ? 'bg-rose-500' : 'bg-stone-500'
              }`} 
            />
            {onOpenModelTester && (
              <button
                type="button"
                id="btn-open-model-tester"
                onClick={onOpenModelTester}
                className="ml-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 transition"
                title="Comprobar en tiempo real cuáles modelos responden y su latencia"
              >
                Probar
              </button>
            )}
          </div>

          {/* Botón de Telemetría */}
          <button
            id="btn-open-telemetry"
            onClick={onOpenTelemetry}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#13171d] hover:bg-stone-800 text-stone-300 hover:text-white rounded-xl border border-stone-800 transition cursor-pointer"
            title="Ver Telemetría de tokens, cuotas y log de fallbacks"
          >
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline font-medium">Telemetría</span>
          </button>

          {/* Gestor de Proyectos */}
          <button
            id="btn-open-projects"
            onClick={onOpenProjects}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#13171d] hover:bg-stone-800 text-stone-300 hover:text-white rounded-xl border border-stone-800 transition cursor-pointer"
            title="Guardar o cargar proyectos anteriores"
          >
            <FolderArchive className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline font-medium">Proyectos</span>
          </button>

          {/* Guardado Rápido */}
          <button
            id="btn-quick-save"
            onClick={handleQuickSave}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl shadow-xs transition cursor-pointer"
            title="Guardar progreso actual"
          >
            <Save className="w-3.5 h-3.5 text-stone-950" />
            <span>{saveToast ? '¡Guardado!' : 'Guardar'}</span>
          </button>

          {/* Nuevo Proyecto */}
          <button
            id="btn-new-project-quick"
            onClick={() => newProject()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#13171d] hover:bg-stone-800 text-stone-300 hover:text-white rounded-xl border border-stone-800 transition cursor-pointer"
            title="Iniciar Nuevo Proyecto en Blanco"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline font-medium">Nuevo</span>
          </button>

          {/* Botón Purgar Todo */}
          {headerPurgeConfirm ? (
            <div className="flex items-center gap-1 bg-rose-950/80 p-1 rounded-lg border border-rose-800">
              <span className="text-[11px] text-rose-200 px-1 font-bold">¿Reset?</span>
              <button
                id="btn-confirm-purge-header"
                onClick={async () => {
                  await purgeAllMemoryAndStorage();
                  setHeaderPurgeConfirm(false);
                }}
                className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-bold"
              >
                Sí
              </button>
              <button
                onClick={() => setHeaderPurgeConfirm(false)}
                className="px-1.5 py-0.5 bg-stone-800 text-stone-300 rounded text-[11px]"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              id="btn-header-purge-trigger"
              onClick={() => setHeaderPurgeConfirm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-lg border border-rose-800/60 transition text-xs font-semibold"
              title="Purgar completamente la memoria y reiniciar desde cero"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden lg:inline">Purgar</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner de procesamiento o aviso de fallback activo */}
      {isProcessing && (
        <div className="bg-[#121417] border-t border-amber-500/30 px-4 py-1.5 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span className="font-medium">{processingProgress.message || 'Procesando con IA resiliente...'}</span>
          </div>
          <span className="text-stone-400">
            {processingProgress.current} de {processingProgress.total} completados
          </span>
        </div>
      )}

      {recentFallback && isProcessing && processingProgress.activeEngine === 'ai' && (
        <div className="bg-amber-950/60 border-t border-amber-800/40 px-4 py-1 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Resiliencia IA: {recentFallback}</span>
          </div>
          <button 
            onClick={() => setRecentFallback(null)}
            className="text-amber-400 hover:text-amber-200 text-xs ml-2 font-bold cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Pestañas Principales del Flujo Editorial (3 Procesos + 0 Auditoría) */}
      <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto no-scrollbar border-t border-stone-800/80 bg-[#0c0f13]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.desc}
              className={`flex items-center gap-2.5 px-5 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 cursor-pointer group ${
                isActive
                  ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                  : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
              }`}
            >
              <span className={isActive ? 'text-amber-400' : 'text-stone-400 group-hover:text-stone-300'}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono transition ${
                  isActive 
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' 
                    : 'bg-stone-900 text-stone-400 border border-stone-800'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
