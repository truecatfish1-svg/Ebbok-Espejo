import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Play, 
  RotateCw, 
  ShieldCheck, 
  Cpu, 
  FileCheck, 
  BookOpen, 
  Table as TableIcon, 
  Sparkles,
  Download,
  Clock,
  Layers,
  HelpCircle
} from 'lucide-react';
import { runInternalTestSuite, TestSuiteReport, TestResult } from '../utils/internalTestSuite';
import { useSape } from '../context/SapeContext';

export const InternalTestingPanel: React.FC = () => {
  const { setActiveTab } = useSape();
  const [report, setReport] = useState<TestSuiteReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTestName, setCurrentTestName] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const executeTests = async () => {
    setIsRunning(true);
    setProgressPercent(0);
    setCurrentTestName('Iniciando suite de verificación...');

    try {
      const res = await runInternalTestSuite((completed, total, name) => {
        setProgressPercent(Math.round((completed / total) * 100));
        setCurrentTestName(name);
      });
      setReport(res);
    } catch (err) {
      console.error('Error al ejecutar suite de pruebas:', err);
    } finally {
      setIsRunning(false);
      setProgressPercent(100);
      setCurrentTestName('');
    }
  };


  const filteredResults = report
    ? filterCategory === 'all'
      ? report.results
      : report.results.filter(r => r.category === filterCategory)
    : [];

  const handleDownloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `te-editorial-test-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Encabezado Superior con Identidad Profesional */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Aseguramiento de Calidad & Verificación de Algoritmos</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-100 font-sans">
            Pruebas de Funcionabilidad Interna
          </h1>
          <p className="text-xs text-stone-400 mt-1 max-w-2xl">
            Verifica el funcionamiento autónomo del motor de procesamiento editorial: detección de niveles jerárquicos (H1-H4), formato de tablas no genéricas, rayas de diálogo, versos poéticos, sincronización bilingüe y compilación binaria de Word (.docx).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-run-all-tests"
            onClick={executeTests}
            disabled={isRunning}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-stone-950 rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin text-stone-950" />
                <span>Verificando ({progressPercent}%)...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Ejecutar Todas las Pruebas</span>
              </>
            )}
          </button>

          {report && (
            <button
              id="btn-download-test-report"
              onClick={handleDownloadReport}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-[#181b1f] hover:bg-stone-800 text-stone-300 rounded-lg text-xs font-medium border border-stone-700 transition"
              title="Descargar Informe de Pruebas en JSON"
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Descargar Log</span>
            </button>
          )}
        </div>
      </div>

      {/* Barra de Progreso Activa */}
      {isRunning && (
        <div className="bg-[#181b1f] border border-amber-500/30 rounded-xl p-4 space-y-2 animate-pulse">
          <div className="flex justify-between text-xs text-amber-400 font-medium">
            <span>Ejecutando: {currentTestName}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-amber-500 transition-all duration-200" 
              style={{ width: `${progressPercent}%` }} 
            />
          </div>
        </div>
      )}

      {/* Resumen de Resultados & Métricas */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-stone-800 bg-[#121417] shadow-xs">
            <span className="text-xs font-medium text-stone-400 block mb-1">
              Resultado Global
            </span>
            <div className="flex items-center gap-2">
              {report.allPassed ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span className="font-bold text-lg text-emerald-300">
                    100% Correcto
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  <span className="font-bold text-lg text-rose-400">
                    {report.failedTests} Fallos
                  </span>
                </>
              )}
            </div>
            <span className="text-[11px] text-stone-400 mt-1 block">
              {report.passedTests} de {report.totalTests} pruebas superadas
            </span>
          </div>

          <div className="p-4 rounded-xl border border-stone-800 bg-[#121417] shadow-xs">
            <span className="text-xs font-medium text-stone-400 block mb-1">
              Tiempo de Ejecución
            </span>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-stone-400 shrink-0" />
              <span className="font-bold text-lg text-stone-200 font-mono">
                {report.durationTotalMs} ms
              </span>
            </div>
            <span className="text-[11px] text-stone-400 mt-1 block">
              Cálculo en cliente a 60 fps
            </span>
          </div>

          <div className="p-4 rounded-xl border border-stone-800 bg-[#121417] shadow-xs">
            <span className="text-xs font-medium text-stone-400 block mb-1">
              Consumo de Tokens
            </span>
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="font-bold text-lg text-stone-200 font-mono">
                0 Tokens
              </span>
            </div>
            <span className="text-[11px] text-stone-400 mt-1 block">
              Motor determinista autónomo
            </span>
          </div>

          <div className="p-4 rounded-xl border border-stone-800 bg-[#121417] shadow-xs">
            <span className="text-xs font-medium text-stone-400 block mb-1">
              Hora de Auditoría
            </span>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="font-bold text-sm text-stone-200 truncate">
                {report.timestamp}
              </span>
            </div>
            <span className="text-[11px] text-stone-400 mt-1 block">
              Inspección en caliente
            </span>
          </div>
        </div>
      )}

      {/* Filtros de Categoría */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-stone-800 text-xs font-medium">
        <span className="text-stone-400 mr-2">Filtrar:</span>
        {[
          { id: 'all', label: 'Todas las pruebas' },
          { id: 'hierarchy', label: 'Jerarquías H1-H4' },
          { id: 'tables', label: 'Tablas No Genéricas' },
          { id: 'literature', label: 'Novela & Poesía' },
          { id: 'parallel', label: 'Libro Paralelo' },
          { id: 'math', label: 'Fórmulas LaTeX' },
          { id: 'docx', label: 'Generación Word DOCX' },
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => setFilterCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
              filterCategory === cat.id
                ? 'bg-amber-500 text-stone-950 font-bold shadow-xs'
                : 'bg-[#181b1f] text-stone-300 hover:bg-stone-800 border border-stone-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Lista de Casos de Prueba */}
      <div className="space-y-3">
        {filteredResults.map((t, idx) => (
          <div
            key={`${t.id || 'test'}_${idx}`}
            className="p-4 rounded-xl border border-stone-800 bg-[#121417] shadow-xs hover:border-amber-500/50 transition"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {t.status === 'passed' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-xs px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Aprobado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-xs px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800">
                      <XCircle className="w-3.5 h-3.5 text-rose-400" /> Fallo
                    </span>
                  )}
                  <h3 className="text-sm font-bold text-stone-200">
                    {t.name}
                  </h3>
                  <span className="text-[10px] text-stone-400 uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#181b1f] border border-stone-800">
                    {t.category}
                  </span>
                </div>

                <p className="text-xs text-stone-300 font-medium">
                  {t.message}
                </p>

                {t.details && (
                  <p className="text-[11px] text-stone-400 font-mono bg-[#0b0c0e] p-2 rounded border border-stone-800 mt-2">
                    {t.details}
                  </p>
                )}
              </div>

              <div className="text-right shrink-0">
                <span className="text-xs font-mono text-stone-400 block">
                  {t.durationMs} ms
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Enlace Directo a Taller de Producción */}
      <div className="p-4 bg-[#181b1f] border border-stone-800 text-stone-200 rounded-xl flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-stone-100">Todos los subsistemas se encuentran listos</h4>
            <p className="text-xs text-stone-400">
              Puedes regresar al Taller de Procesamiento para cargar un libro o exportar directamente a Word y Google Docs.
            </p>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('ingesta')}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg text-xs font-bold transition shrink-0"
        >
          Ir al Taller Editorial
        </button>
      </div>
    </div>
  );
};
