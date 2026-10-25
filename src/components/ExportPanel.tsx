import React, { useState } from 'react';
import { useSape } from '../context/SapeContext';
import { 
  generateBookDocx, 
  copyFormattedContentToClipboard, 
  generateGoogleDocsHtml,
  generateParallelBookDocx,
  copyParallelContentToClipboard
} from '../lib/docx-generator';
import { MathRenderer } from './MathRenderer';
import { 
  Download, 
  Copy, 
  FileText, 
  Settings2, 
  CheckCircle2, 
  BookOpen, 
  Sparkles, 
  FileCode, 
  Share2, 
  Eye,
  Sliders,
  Palette,
  ArrowRight
} from 'lucide-react';

export const ExportPanel: React.FC = () => {
  const { 
    metadata, 
    chunks, 
    settings, 
    setSettings, 
    exportProjectJson, 
    setActiveTab,
    parallelConfig,
    parallelSourceAText,
    parallelSourceBText,
    parallelPairs,
    parallelSpreads,
    exportCleanBookA,
    exportCleanBookB
  } = useSape();

  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [isExportingBookA, setIsExportingBookA] = useState(false);
  const [isExportingBookB, setIsExportingBookB] = useState(false);
  const [isExportingMirror, setIsExportingMirror] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState<'visual' | 'html' | 'markdown'>('visual');

  const totalBlocks = chunks.reduce((acc, c) => acc + (c.blocks?.length || 0), 0);

  const cleanTextA = parallelSourceAText || (chunks.length > 0 ? chunks.map(c => c.cleanContent || c.rawContent || '').join('\n\n') : '');
  const cleanTextB = parallelSourceBText || '';

  const handleDownloadDocx = async () => {
    setIsGeneratingDocx(true);
    setGenerationError(null);
    try {
      const filename = `${(metadata.title || 'Libro_Editorial').replace(/[^a-zA-Z0-9_-]/g, '_')}_Final.docx`;
      await generateBookDocx(metadata, chunks, settings, filename);
    } catch (e: any) {
      console.error('Error generando DOCX:', e);
      setGenerationError(`Error al generar archivo Word: ${e.message}`);
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  const handleDownloadCleanA = async (format: 'docx' | 'txt' = 'docx') => {
    setIsExportingBookA(true);
    setGenerationError(null);
    try {
      await exportCleanBookA(format);
      setExportNotice(`¡Libro A (${parallelConfig.languageA || 'Español'}) exportado exitosamente en .${format.toUpperCase()}!`);
      setTimeout(() => setExportNotice(null), 3500);
    } catch (e: any) {
      setGenerationError(`Error al exportar Libro A: ${e.message}`);
    } finally {
      setIsExportingBookA(false);
    }
  };

  const handleDownloadCleanB = async (format: 'docx' | 'txt' = 'docx') => {
    setIsExportingBookB(true);
    setGenerationError(null);
    try {
      await exportCleanBookB(format);
      setExportNotice(`¡Libro B (${parallelConfig.languageB || 'Idioma B'}) exportado exitosamente en .${format.toUpperCase()}!`);
      setTimeout(() => setExportNotice(null), 3500);
    } catch (e: any) {
      setGenerationError(`Error al exportar Libro B: ${e.message}`);
    } finally {
      setIsExportingBookB(false);
    }
  };

  const handleDownloadMirror = async () => {
    if (parallelPairs.length === 0) return;
    setIsExportingMirror(true);
    setGenerationError(null);
    try {
      const filename = `${(parallelConfig.titleA || metadata.title || 'Libro').replace(/\s+/g, '_')}_Bilingue_${parallelConfig.languageA}_${parallelConfig.languageB}.docx`;
      await generateParallelBookDocx(parallelPairs, parallelSpreads, parallelConfig, settings, filename);
      setExportNotice('¡Libro Espejo Bilingüe generado exitosamente en Word (.docx)!');
      setTimeout(() => setExportNotice(null), 3500);
    } catch (e: any) {
      setGenerationError(`Error al generar Espejo: ${e.message}`);
    } finally {
      setIsExportingMirror(false);
    }
  };

  const handleCopyGoogleDocs = async () => {
    const success = await copyFormattedContentToClipboard(metadata, chunks, settings);
    if (success) {
      setCopySuccess(true);
      setCopyError(false);
      setTimeout(() => setCopySuccess(false), 3000);
    } else {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };

  const downloadMarkdown = () => {
    let md = `# ${metadata.title}\n\n`;
    if (metadata.subject) md += `**Disciplina:** ${metadata.subject}\n`;
    if (metadata.author) md += `**Autor:** ${metadata.author}\n`;
    if (metadata.educationLevel) md += `**Nivel:** ${metadata.educationLevel}\n\n---\n\n`;

    for (const chunk of chunks) {
      if (chunk.blocks && chunk.blocks.length > 0) {
        for (const block of chunk.blocks) {
          if (block.type === 'heading1') md += `# ${block.content || block.title}\n\n`;
          else if (block.type === 'heading2') md += `## ${block.content || block.title}\n\n`;
          else if (block.type === 'heading3') md += `### ${block.content || block.title}\n\n`;
          else if (block.type === 'heading4') md += `#### ${block.content || block.title}\n\n`;
          else if (block.type === 'exercise') {
            md += `**• ${block.title || 'Reactivo'}:** ${block.content}\n`;
            if (block.options) {
              block.options.forEach(opt => {
                md += `  - **${opt.letter})** ${opt.text} ${opt.isCorrect ? '*(Correcta ✓)*' : ''}\n`;
              });
            }
            if (block.solution) md += `  *Solución:* ${block.solution}\n`;
            md += '\n';
          } else if (block.type === 'theory_box') {
            md += `> **[ MARCO TEÓRICO ]**\n> ${block.content.replace(/\n/g, '\n> ')}\n\n`;
          } else {
            md += `${block.content}\n\n`;
          }
        }
      } else if (chunk.cleanContent) {
        md += `${chunk.cleanContent}\n\n`;
      }
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(metadata.title || 'Libro_Editorial').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Encabezado Principal y Acciones de Descarga */}
      <div className="bg-[#121417] border border-stone-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <Download className="w-4 h-4" />
              <span>Exportación DOCX & Google Docs</span>
            </div>
            <h1 className="text-xl font-bold text-stone-100 font-sans">
              Motor de Generación Editorial (.DOCX & Google Docs)
            </h1>
            <p className="text-xs text-stone-400 mt-1 max-w-2xl">
              Genera tu libro digitalizado con estilos nativos de Word, tablas profesionales no genéricas, jerarquía de niveles y soporte estricto de LaTeX.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Botón Principal DOCX */}
            <button
              id="btn-download-docx-main"
              onClick={handleDownloadDocx}
              disabled={isGeneratingDocx || chunks.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-bold rounded-lg shadow-sm transition"
            >
              <Download className="w-4 h-4" />
              <span>{isGeneratingDocx ? 'Empaquetando DOCX...' : 'Descargar Word (.DOCX)'}</span>
            </button>

            {/* Botón Copiar para Google Docs */}
            <button
              id="btn-copy-google-docs"
              onClick={handleCopyGoogleDocs}
              disabled={chunks.length === 0}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg border shadow-sm transition ${
                copySuccess
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-[#181b1f] hover:bg-stone-800 border-stone-700 text-stone-200'
              }`}
            >
              {copySuccess ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4 text-amber-400" />}
              <span>{copySuccess ? '¡Copiado para Google Docs!' : 'Copiar para Google Docs'}</span>
            </button>

            {/* Descargar Markdown */}
            <button
              onClick={downloadMarkdown}
              disabled={chunks.length === 0}
              className="p-2.5 bg-[#181b1f] hover:bg-stone-800 text-stone-300 rounded-lg border border-stone-700 transition"
              title="Descargar versión Markdown (.md)"
            >
              <FileCode className="w-4 h-4" />
            </button>

            {/* Respaldo JSON */}
            <button
              onClick={exportProjectJson}
              className="p-2.5 bg-[#181b1f] hover:bg-stone-800 text-stone-300 rounded-lg border border-stone-700 transition"
              title="Exportar Respaldo Completo del Proyecto (.json)"
            >
              <FileText className="w-4 h-4" />
            </button>
          </div>
        </div>

        {copySuccess && (
          <div className="mt-3 p-2.5 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>¡Formato enriquecido copiado al portapapeles!</strong> Abre un documento en blanco en Google Docs o Word Online y presiona <strong>Ctrl + V</strong> (o Cmd + V) para pegar los estilos, niveles y tablas directamente.
            </span>
          </div>
        )}
      </div>

      {/* Sección Dedicada: Exportación de Libros Limpios por Separado (Libro A / Libro B) y Espejo */}
      <div className="bg-[#121417] border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Entregables Finales Monolingües & Espejo</span>
            </div>
            <h2 className="text-lg font-bold text-stone-100 font-sans">
              Exportación de Libros Limpios por Separado (Libro A / Libro B)
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Descarga cada versión purificada individualmente en Word (.docx) o Texto (.txt), o el volumen bilingüe espejo con pliegos enfrentados.
            </p>
          </div>

          {exportNotice && (
            <div className="p-2.5 px-4 bg-emerald-950/80 border border-emerald-600 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{exportNotice}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Tarjeta Libro A Limpio */}
          <div className="bg-[#181b1f] border border-blue-500/30 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-blue-500/50 transition">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[11px] font-bold uppercase tracking-wider border border-blue-500/30">
                  Libro A • {parallelConfig.languageA || 'Español'}
                </span>
                <span className="text-[11px] text-stone-400 font-mono">
                  {cleanTextA ? `${cleanTextA.length.toLocaleString()} caracteres` : 'Sin contenido'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-stone-200 line-clamp-1">
                {parallelConfig.titleA || metadata.title || 'Libro A Limpio'}
              </h3>
              <p className="text-xs text-stone-400 line-clamp-2">
                Texto íntegro purificado sin marcas de digitalización ni cortes erróneos, con sangría de 1ª línea y saltos de página por capítulo.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-stone-800">
              <button
                onClick={() => handleDownloadCleanA('docx')}
                disabled={isExportingBookA || !cleanTextA}
                className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExportingBookA ? 'Descargando...' : 'Word (.DOCX)'}</span>
              </button>
              <button
                onClick={() => handleDownloadCleanA('txt')}
                disabled={isExportingBookA || !cleanTextA}
                className="py-2 px-3 bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-300 text-xs font-semibold rounded-lg transition border border-stone-700"
                title="Descargar en texto plano UTF-8"
              >
                .TXT
              </button>
            </div>
          </div>

          {/* Tarjeta Libro B Limpio */}
          <div className="bg-[#181b1f] border border-emerald-500/30 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-emerald-500/50 transition">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-bold uppercase tracking-wider border border-emerald-500/30">
                  Libro B • {parallelConfig.languageB || 'Idioma B'}
                </span>
                <span className="text-[11px] text-stone-400 font-mono">
                  {cleanTextB ? `${cleanTextB.length.toLocaleString()} caracteres` : 'Sin contenido'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-stone-200 line-clamp-1">
                {parallelConfig.titleB || (metadata.title ? `${metadata.title} (B)` : 'Libro B Limpio')}
              </h3>
              <p className="text-xs text-stone-400 line-clamp-2">
                Versión complementaria u original limpia, estructurada con saltos de capítulo y tipografía cuidada.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-stone-800">
              <button
                onClick={() => handleDownloadCleanB('docx')}
                disabled={isExportingBookB || !cleanTextB}
                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExportingBookB ? 'Descargando...' : 'Word (.DOCX)'}</span>
              </button>
              <button
                onClick={() => handleDownloadCleanB('txt')}
                disabled={isExportingBookB || !cleanTextB}
                className="py-2 px-3 bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-300 text-xs font-semibold rounded-lg transition border border-stone-700"
                title="Descargar en texto plano UTF-8"
              >
                .TXT
              </button>
            </div>
          </div>

          {/* Tarjeta Libro Espejo Bilingüe */}
          <div className="bg-[#181b1f] border border-amber-500/40 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-amber-500/60 transition">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] font-bold uppercase tracking-wider border border-amber-500/30">
                  Volumen Espejo Bilingüe
                </span>
                <span className="text-[11px] text-amber-300/80 font-mono">
                  {parallelPairs.length > 0 ? `${parallelPairs.length} pares` : 'Pendiente cotejo'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-stone-200 line-clamp-1">
                {parallelConfig.titleA || 'Edición Bilingüe'} (Espejo)
              </h3>
              <p className="text-xs text-stone-400 line-clamp-2">
                Páginas pares ({parallelConfig.languageA || 'A'}) e impares ({parallelConfig.languageB || 'B'}) alineadas por párrafo exacto.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-stone-800">
              <button
                onClick={handleDownloadMirror}
                disabled={isExportingMirror || parallelPairs.length === 0}
                className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 text-xs font-extrabold rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>{isExportingMirror ? 'Generando...' : 'Descargar Espejo'}</span>
              </button>
              <button
                onClick={() => setActiveTab('paralelo')}
                className="py-2 px-3 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-lg transition border border-stone-700"
                title="Ir a configurar o revisar pliegos espejo en el Paso 3"
              >
                Ver Pliegos
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Configuración de Estilo Editorial */}
        <div className="space-y-6">
          <div className="bg-[#121417] border border-stone-800 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-stone-300 uppercase tracking-wide flex items-center gap-2">
              <Palette className="w-4 h-4 text-amber-400" />
              Estilos Editoriales para DOCX
            </h2>

            <div className="space-y-3.5 text-xs">
              {/* Tipografía Principal */}
              <div>
                <label className="block text-stone-300 font-semibold mb-1">
                  Tipografía del Documento
                </label>
                <select
                  value={settings.bodyFont}
                  onChange={(e) => setSettings(s => ({ ...s, bodyFont: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-[#181b1f] border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="Calibri">Calibri (Estándar Editorial Moderno)</option>
                  <option value="Arial">Arial (Alta Legibilidad)</option>
                  <option value="Times New Roman">Times New Roman (Académico Clásico)</option>
                  <option value="Georgia">Georgia (Elegante con Serifas)</option>
                  <option value="Aptos">Aptos (Nuevo Estándar Office 365)</option>
                </select>
              </div>

              {/* Color Primario (H1 y Títulos) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">
                    Color Primario (H1)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.primaryColor}
                      onChange={(e) => setSettings(s => ({ ...s, primaryColor: e.target.value }))}
                      className="w-8 h-8 rounded border border-stone-700 cursor-pointer bg-transparent"
                    />
                    <span className="font-mono text-[11px] text-stone-400">{settings.primaryColor}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-stone-300 font-semibold mb-1">
                    Color Secundario (H2)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.secondaryColor}
                      onChange={(e) => setSettings(s => ({ ...s, secondaryColor: e.target.value }))}
                      className="w-8 h-8 rounded border border-stone-700 cursor-pointer bg-transparent"
                    />
                    <span className="font-mono text-[11px] text-stone-400">{settings.secondaryColor}</span>
                  </div>
                </div>
              </div>

              {/* Esquema de Tablas no genéricas */}
              <div className="pt-3 border-t border-stone-800 space-y-2">
                <span className="font-bold text-stone-200 block">
                  Estilo de Tablas No Genéricas
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-stone-400 text-[11px] mb-1">Encabezado Tabla</label>
                    <input
                      type="color"
                      value={settings.tableHeaderBg}
                      onChange={(e) => setSettings(s => ({ ...s, tableHeaderBg: e.target.value }))}
                      className="w-8 h-8 rounded border border-stone-700 cursor-pointer bg-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-400 text-[11px] mb-1">Fila Alterna</label>
                    <input
                      type="color"
                      value={settings.tableAlternateRowBg}
                      onChange={(e) => setSettings(s => ({ ...s, tableAlternateRowBg: e.target.value }))}
                      className="w-8 h-8 rounded border border-stone-700 cursor-pointer bg-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Opciones de Inclusión */}
              <div className="pt-3 border-t border-stone-800 space-y-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.includeCoverPage}
                    onChange={(e) => setSettings(s => ({ ...s, includeCoverPage: e.target.checked }))}
                    className="rounded text-amber-500 bg-stone-800 border-stone-700 focus:ring-amber-500"
                  />
                  <span className="font-semibold text-stone-200">Incluir Portada y Metadatos</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.renderFormulasInWord}
                    onChange={(e) => setSettings(s => ({ ...s, renderFormulasInWord: e.target.checked }))}
                    className="rounded text-amber-500 bg-stone-800 border-stone-700 focus:ring-amber-500"
                  />
                  <span className="font-semibold text-stone-200">Formatear Fórmulas LaTeX (Cambria Math)</span>
                </label>

                {/* Opciones Especiales para Novelas y Literatura */}
                <div className="pt-3 border-t border-stone-800 space-y-2">
                  <span className="font-bold text-stone-200 block text-xs">
                    Maquetación para Novelas y Textos Largos
                  </span>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.novelFirstLineIndent ?? true}
                      onChange={(e) => setSettings(s => ({ ...s, novelFirstLineIndent: e.target.checked }))}
                      className="rounded text-amber-500 bg-stone-800 border-stone-700 focus:ring-amber-500"
                    />
                    <span className="text-stone-300">Sangría de 1ª Línea en Párrafos (1.25 cm)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.poemItalic ?? true}
                      onChange={(e) => setSettings(s => ({ ...s, poemItalic: e.target.checked }))}
                      className="rounded text-amber-500 bg-stone-800 border-stone-700 focus:ring-amber-500"
                    />
                    <span className="text-stone-300">Cursiva & Sangría en Versos Poéticos</span>
                  </label>
                </div>

                {/* Tarjeta de Acceso al Libro Paralelo Bilingüe */}
                <div className="pt-3 border-t border-stone-800">
                  <button
                    onClick={() => setActiveTab('paralelo')}
                    className="w-full p-2.5 bg-[#181b1f] hover:bg-stone-800 border border-stone-700 rounded-xl text-xs text-stone-200 flex items-center justify-between group transition shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="text-left">
                        <span className="font-bold block">Crear Libro Paralelo Bilingüe</span>
                        <span className="text-[10px] text-stone-400">Páginas enfrentadas Español / Idioma Original</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Central y Derecha: Previsualizador del Documento Compilado */}
        <div className="lg:col-span-2 space-y-4">
          {/* Barra de Tabs de Previsualización */}
          <div className="bg-[#121417] border border-stone-800 rounded-xl p-3 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <button
                onClick={() => setActivePreviewTab('visual')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activePreviewTab === 'visual'
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'bg-[#181b1f] text-stone-300 hover:bg-stone-800'
                }`}
              >
                Vista Previa Editorial (Hoja A4)
              </button>
              <button
                onClick={() => setActivePreviewTab('html')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activePreviewTab === 'html'
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'bg-[#181b1f] text-stone-300 hover:bg-stone-800'
                }`}
              >
                Código HTML (Google Docs)
              </button>
            </div>

            <span className="text-xs text-stone-400 font-medium">
              {chunks.length} fragmentos • {totalBlocks} bloques
            </span>
          </div>

          {/* Hoja de Trabajo Editorial */}
          {activePreviewTab === 'visual' ? (
            <div className="bg-[#0b0c0e] p-4 sm:p-8 rounded-xl border border-stone-800 overflow-y-auto max-h-[720px] flex justify-center">
              <div 
                className="bg-white text-slate-900 w-full max-w-2xl p-8 sm:p-12 shadow-2xl rounded-sm min-h-[900px] space-y-6"
                style={{ fontFamily: settings.bodyFont || 'Calibri' }}
              >
                {/* Portada en la hoja */}
                {settings.includeCoverPage && (
                  <div className="text-center pb-8 border-b-2 border-slate-200 space-y-3">
                    <h1 
                      className="text-2xl sm:text-3xl font-extrabold tracking-tight"
                      style={{ color: settings.primaryColor }}
                    >
                      {metadata.title || 'Libro Editorial Digitalizado'}
                    </h1>
                    {metadata.subject && (
                      <h2 
                        className="text-lg font-bold"
                        style={{ color: settings.secondaryColor }}
                      >
                        {metadata.subject}
                      </h2>
                    )}
                    <p className="text-xs text-slate-500 italic">
                      {metadata.author ? `Autor: ${metadata.author}  •  ` : ''}
                      {metadata.educationLevel ? `Nivel: ${metadata.educationLevel}` : ''}
                    </p>
                    {metadata.editorialNotes && (
                      <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 italic text-left">
                        <strong>Notas de Edición:</strong> {metadata.editorialNotes}
                      </div>
                    )}
                  </div>
                )}

                {/* Contenido Compilado de Todos los Chunks */}
                {chunks.map((chunk, cIdx) => (
                  <div key={chunk.id ? `${chunk.id}_${cIdx}` : `chunk_${cIdx}`} className="space-y-4 pt-2">
                    {chunk.blocks && chunk.blocks.length > 0 ? (
                      chunk.blocks.map((block, bIdx) => (
                        <div key={block.id ? `${block.id}_${bIdx}` : `block_${bIdx}`} className="space-y-2">
                          {block.type === 'heading1' && (
                            <h1 
                              className="text-xl font-bold pt-4 pb-1 border-b"
                              style={{ color: settings.primaryColor, borderColor: settings.primaryColor + '40' }}
                            >
                              <MathRenderer content={block.content || block.title || ''} />
                            </h1>
                          )}

                          {block.type === 'heading2' && (
                            <h2 
                              className="text-lg font-bold pt-3 pb-1"
                              style={{ color: settings.secondaryColor }}
                            >
                              <MathRenderer content={block.content || block.title || ''} />
                            </h2>
                          )}

                          {block.type === 'heading3' && (
                            <h3 className="text-base font-bold text-slate-800 pt-2">
                              <MathRenderer content={block.content || block.title || ''} />
                            </h3>
                          )}

                          {block.type === 'heading4' && (
                            <h4 className="text-sm font-bold italic text-slate-700">
                              <MathRenderer content={block.content || block.title || ''} />
                            </h4>
                          )}

                          {block.type === 'paragraph' && (
                            <div 
                              className="text-sm text-slate-800 leading-relaxed text-justify"
                              style={{ textIndent: settings.novelFirstLineIndent ? '1.25rem' : '0' }}
                            >
                              <MathRenderer content={block.content} />
                            </div>
                          )}

                          {block.type === 'novel_dialogue' && (
                            <div className="text-sm text-slate-900 leading-relaxed pl-2">
                              <span className="font-semibold text-slate-700 select-none">
                                {block.content.startsWith('—') || block.content.startsWith('–') ? '' : '— '}
                              </span>
                              <MathRenderer content={block.content} className="inline" />
                            </div>
                          )}

                          {block.type === 'poem_verse' && (
                            <div className="my-1.5 pl-8 sm:pl-12 text-xs sm:text-sm text-slate-800 italic font-sans leading-snug border-l-2 border-purple-200">
                              <MathRenderer content={block.content} />
                            </div>
                          )}

                          {block.type === 'epigraph' && (
                            <div className="my-3 pl-12 pr-4 text-right text-xs italic text-slate-600 font-sans space-y-1">
                              <div>«<MathRenderer content={block.content} className="inline" />»</div>
                              {block.author && <span className="font-sans text-[11px] text-slate-500 font-bold block">— {block.author}</span>}
                            </div>
                          )}

                          {block.type === 'epistolary_letter' && (
                            <div className="my-4 p-4 mx-4 bg-amber-50/50 border border-amber-200/80 rounded font-sans text-xs sm:text-sm text-slate-800 space-y-2 shadow-xs">
                              <div className="text-[10px] uppercase font-bold tracking-widest text-amber-900/60">[ Fragmento Epistolar ]</div>
                              <MathRenderer content={block.content} />
                            </div>
                          )}

                          {block.type === 'blockquote' && (
                            <blockquote className="my-3 pl-4 border-l-4 border-slate-300 text-xs sm:text-sm italic text-slate-700">
                              <MathRenderer content={block.content} />
                            </blockquote>
                          )}

                          {block.type === 'ornamental_break' && (
                            <div className="my-6 text-center text-slate-500 tracking-[0.5em] text-sm select-none">
                              ⁂ ⁂ ⁂
                            </div>
                          )}

                          {(block.type === 'theory_box' || block.type === 'definition') && (
                            <div 
                              className="p-4 bg-emerald-50/70 rounded-r border-l-4 text-xs sm:text-sm text-emerald-950 space-y-1"
                              style={{ borderColor: settings.secondaryColor }}
                            >
                              <span className="font-bold block uppercase text-xs" style={{ color: settings.secondaryColor }}>
                                {block.title ? `[ ${block.title} ]` : '[ MARCO TEÓRICO ]'}
                              </span>
                              <MathRenderer content={block.content} />
                            </div>
                          )}

                          {(block.type === 'important_note' || block.type === 'curiosity') && (
                            <div className="p-4 bg-amber-50 rounded-r border-l-4 border-amber-500 text-xs sm:text-sm text-amber-950 space-y-1">
                              <span className="font-bold block uppercase text-xs text-amber-700">
                                ⚠️ {block.title || 'NOTA CLAVE'}
                              </span>
                              <MathRenderer content={block.content} />
                            </div>
                          )}

                          {block.type === 'exercise' && (
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs sm:text-sm">
                              <div className="font-bold text-slate-900" style={{ color: settings.primaryColor }}>
                                • {block.title ? `${block.title}: ` : 'Reactivo: '}
                                <MathRenderer content={block.content} className="inline" />
                              </div>

                              {block.options && block.options.length > 0 && (
                                <div className="space-y-1 pl-4">
                                  {block.options.map((opt, oIdx) => (
                                    <div key={oIdx} className="flex items-start gap-2">
                                      <span className="font-bold">{opt.letter})</span>
                                      <span><MathRenderer content={opt.text} className="inline" /></span>
                                      {opt.isCorrect && (
                                        <span className="text-emerald-700 font-bold italic text-xs ml-2">[Correcta ✓]</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {(block.solution || block.explanation) && (
                                <div className="pt-2 text-xs italic text-teal-800 border-t border-slate-200 pl-4">
                                  <strong>Solucionario / Justificación:</strong> {block.solution ? `[Clave: ${block.solution}] ` : ''}{block.explanation || ''}
                                </div>
                              )}
                            </div>
                          )}

                          {block.type === 'latex_math' && (
                            <div className="my-3 py-2 bg-slate-50 border border-slate-200 rounded text-center">
                              <MathRenderer content={`$$${block.latex || block.content}$$`} />
                            </div>
                          )}

                          {block.type === 'figure_desc' && (
                            <div className="my-3 p-3 bg-blue-50/60 border border-blue-200 rounded text-xs text-blue-900 italic text-center">
                              🖼️ <strong>[Figura/Gráfico]:</strong> {block.figureCaption || block.content}
                            </div>
                          )}

                          {block.type === 'table' && block.tableData && (
                            <div className="my-4 overflow-x-auto">
                              {block.tableData.caption && (
                                <span className="font-bold text-xs text-slate-700 block mb-1">
                                  Tabla: {block.tableData.caption}
                                </span>
                              )}
                              <table className="w-full text-xs border-collapse border border-slate-300">
                                <thead>
                                  <tr style={{ backgroundColor: settings.tableHeaderBg, color: settings.tableHeaderTextColor }}>
                                    {block.tableData.headers.map((h, idx) => (
                                      <th key={idx} className="p-2 border border-slate-300 font-bold text-left">
                                        <MathRenderer content={h} className="inline" />
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {block.tableData.rows.map((row, rIdx) => (
                                    <tr 
                                      key={rIdx}
                                      style={{ backgroundColor: rIdx % 2 === 1 ? settings.tableAlternateRowBg : '#FFFFFF' }}
                                    >
                                      {row.map((cell, cIdx) => (
                                        <td key={cIdx} className="p-2 border border-slate-300 text-slate-800">
                                          <MathRenderer content={cell} className="inline" />
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-800 leading-relaxed">
                        <MathRenderer content={chunk.cleanContent || chunk.rawContent} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 text-slate-200 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto max-h-[720px]">
              <pre>{generateGoogleDocsHtml(metadata, chunks, settings)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
