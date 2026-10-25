import React, { useState } from 'react';
import { useSape } from '../context/SapeContext';
import { DualParallelIngest } from './DualParallelIngest';
import { 
  Book, 
  Columns, 
  Sparkles, 
  FileText, 
  Layers, 
  Settings2, 
  Table, 
  Type, 
  Check, 
  Bookmark, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export const IngestPanel: React.FC = () => {
  const { 
    metadata, 
    setMetadata, 
    parallelConfig,
    setParallelConfig,
    settings,
    setSettings,
    setActiveTab,
    isProcessing,
    parallelSourceAText,
    parallelSourceBText
  } = useSape();

  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  const handleSaveMetadataAndStyles = () => {
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 3000);
  };

  const hasAnyText = Boolean(parallelSourceAText || parallelSourceBText);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8 font-sans">
      {/* 1. SECCIÓN DE CARGA DUAL SIMÉTRICA (A y B) */}
      <div className="space-y-4">
        <DualParallelIngest />
      </div>

      {/* 2. METADATOS EDITORIALES Y ESTRUCTURA AL FINAL DE LA INGESTA */}
      <div className="bg-[#101318] border border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1 font-mono">
              <Bookmark className="w-4 h-4 text-amber-400" />
              <span>Metadatos Editoriales y Estructura Tipográfica</span>
            </div>
            <h2 className="text-lg font-bold text-zinc-100 tracking-tight">
              Propiedades de la Obra y Normas de Publicación
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Define los datos bibliográficos que acompañarán la obra en Word (.docx) y Google Docs. 
              Los estilos aplican jerarquías nativas (H1–H4), sangrías francesas en citas y metadatos ECMA-376.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              id="btn-save-metadata-styles"
              onClick={handleSaveMetadataAndStyles}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-100 rounded-xl border border-zinc-700 transition cursor-pointer"
            >
              <Check className="w-4 h-4 text-emerald-400" />
              <span>{saveSuccessNotice ? '¡Guardado!' : 'Sincronizar'}</span>
            </button>

            <button
              id="btn-proceed-to-step2"
              onClick={() => setActiveTab('curaduria')}
              disabled={!hasAnyText}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] text-zinc-950 rounded-xl shadow-sm transition cursor-pointer"
              title="Avanzar al Paso 2: Estructura e Índice"
            >
              <span>Continuar al Paso 2: Estructura e Índice</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Formulario Unificado de Metadatos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
          {/* Título de la Obra */}
          <div className="space-y-1.5">
            <label className="block text-zinc-300 font-semibold">Título General de la Obra *</label>
            <input
              type="text"
              value={metadata.title}
              onChange={(e) => {
                const val = e.target.value;
                setMetadata(m => ({ ...m, title: val }));
                setParallelConfig(p => ({ ...p, titleA: val }));
              }}
              className="w-full px-3 py-2 bg-[#0c0e12] border border-zinc-800 rounded-xl text-zinc-100 focus:border-amber-500 focus:outline-none font-medium"
              placeholder="Ej: La metamorfosis / Die Verwandlung"
            />
          </div>

          {/* Autor */}
          <div className="space-y-1.5">
            <label className="block text-zinc-300 font-semibold">Autor de la Obra *</label>
            <input
              type="text"
              value={metadata.author}
              onChange={(e) => {
                const val = e.target.value;
                setMetadata(m => ({ ...m, author: val }));
                setParallelConfig(p => ({ ...p, author: val }));
              }}
              className="w-full px-3 py-2 bg-[#0c0e12] border border-zinc-800 rounded-xl text-zinc-100 focus:border-amber-500 focus:outline-none"
              placeholder="Ej: Franz Kafka"
            />
          </div>

          {/* Materia / Género */}
          <div className="space-y-1.5">
            <label className="block text-zinc-300 font-semibold">Materia / Género Literario</label>
            <input
              type="text"
              value={metadata.subject}
              onChange={(e) => setMetadata(m => ({ ...m, subject: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0c0e12] border border-zinc-800 rounded-xl text-zinc-100 focus:border-amber-500 focus:outline-none"
              placeholder="Ej: Ficción Filosófica / Novela"
            />
          </div>

          {/* Título Versión A */}
          <div className="space-y-1.5">
            <label className="block text-zinc-300 font-semibold">Título Específico Versión A (Pág. Izquierda)</label>
            <input
              type="text"
              value={parallelConfig.titleA || metadata.title}
              onChange={(e) => setParallelConfig(p => ({ ...p, titleA: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0c0e12] border border-zinc-800 rounded-xl text-zinc-100 focus:border-amber-500 focus:outline-none"
              placeholder="Ej: La metamorfosis (Español)"
            />
          </div>

          {/* Título Versión B */}
          <div className="space-y-1.5">
            <label className="block text-zinc-300 font-semibold">Título Específico Versión B (Pág. Derecha)</label>
            <input
              type="text"
              value={parallelConfig.titleB || ''}
              onChange={(e) => setParallelConfig(p => ({ ...p, titleB: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0c0e12] border border-zinc-800 rounded-xl text-zinc-100 focus:border-amber-500 focus:outline-none"
              placeholder="Ej: Die Verwandlung (Original)"
            />
          </div>

          {/* Traductor / Editor */}
          <div className="space-y-1.5">
            <label className="block text-zinc-300 font-semibold">Traductor / Colaborador</label>
            <input
              type="text"
              value={metadata.translator || ''}
              onChange={(e) => setMetadata(m => ({ ...m, translator: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0c0e12] border border-zinc-800 rounded-xl text-zinc-100 focus:border-amber-500 focus:outline-none"
              placeholder="Ej: Traducción directa y notas"
            />
          </div>
        </div>

        {/* Normas Tipográficas ECMA-376 y Exportación */}
        <div className="pt-4 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 bg-[#0a0c10] border border-zinc-800/80 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-zinc-200 font-bold">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Jerarquías H1–H4</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Capítulos en Heading 1 con salto de página automático y secciones en Heading 2 (OpenXML).
            </p>
          </div>

          <div className="p-3.5 bg-[#0a0c10] border border-zinc-800/80 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-zinc-200 font-bold">
              <Table className="w-4 h-4 text-emerald-400" />
              <span>Pliegos Enfrentados</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Columnas simétricas en Word/Docs con anclaje 1:1 y compensación de saltos.
            </p>
          </div>

          <div className="p-3.5 bg-[#0a0c10] border border-zinc-800/80 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-zinc-200 font-bold">
              <Type className="w-4 h-4 text-sky-400" />
              <span>Diálogos y Raya</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Conversión automática a raya de diálogo larga em-dash (—) con sangría francesa en citas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
