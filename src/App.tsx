import React, { useState } from 'react';
import { SapeProvider, useSape } from './context/SapeContext';
import { NavigationHeader } from './components/NavigationHeader';
import { IngestPanel } from './components/IngestPanel';
import { CuratedEbookPanel } from './components/CuratedEbookPanel';
import { StyleEnginePanel } from './components/StyleEnginePanel';
import { ExportPanel } from './components/ExportPanel';
import { ParallelPanel } from './components/ParallelPanel';
import { InternalTestingPanel } from './components/InternalTestingPanel';
import { LiveCodeAuditPanel } from './components/LiveCodeAuditPanel';
import { TelemetryModal } from './components/TelemetryModal';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { ModelTesterModal } from './components/ModelTesterModal';
import { ProcessingOverlay } from './components/ProcessingOverlay';
import { ErrorBoundary } from './components/ErrorBoundary';

function AppContent() {
  const { activeTab } = useSape();
  const [telemetryModalOpen, setTelemetryModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [modelTesterModalOpen, setModelTesterModalOpen] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([activeTab]));

  // Registrar pestañas visitadas para montarlas solo cuando el usuario las solicite (evita congelamiento inicial)
  React.useEffect(() => {
    setVisitedTabs(prev => {
      const next = new Set(prev);
      next.add(activeTab);
      if (activeTab === 'pruebas') next.add('auditoria');
      if (activeTab === 'estilos' || activeTab === 'purificacion') next.add('curaduria');
      return next;
    });
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[#090b0e] text-zinc-100 flex flex-col font-sans selection:bg-amber-500/25 selection:text-amber-200">
      {/* Barra Superior con Navegación y Resiliencia */}
      <NavigationHeader
        onOpenTelemetry={() => setTelemetryModalOpen(true)}
        onOpenProjects={() => setProjectModalOpen(true)}
        onOpenModelTester={() => setModelTesterModalOpen(true)}
      />

      {/* Contenedor Principal: Activación diferida para 0 bloqueo de hilo y persistencia tras apertura */}
      <main className="flex-1 pb-16">
        {(visitedTabs.has('auditoria') || visitedTabs.has('pruebas')) && (
          <div className={activeTab === 'auditoria' || activeTab === 'pruebas' ? 'block' : 'hidden'}>
            <LiveCodeAuditPanel />
          </div>
        )}
        {visitedTabs.has('ingesta') && (
          <div className={activeTab === 'ingesta' ? 'block' : 'hidden'}>
            <IngestPanel />
          </div>
        )}
        {(visitedTabs.has('curaduria') || visitedTabs.has('estilos') || visitedTabs.has('purificacion')) && (
          <div className={activeTab === 'curaduria' || activeTab === 'estilos' || activeTab === 'purificacion' ? 'block' : 'hidden'}>
            <CuratedEbookPanel />
          </div>
        )}
        {visitedTabs.has('paralelo') && (
          <div className={activeTab === 'paralelo' ? 'block' : 'hidden'}>
            <ParallelPanel />
          </div>
        )}
        {visitedTabs.has('generacion') && (
          <div className={activeTab === 'generacion' ? 'block' : 'hidden'}>
            <ExportPanel />
          </div>
        )}
      </main>

      {/* Animación Interactiva de Procesamiento */}
      <ProcessingOverlay />

      {/* Modales de Soporte */}
      <TelemetryModal
        isOpen={telemetryModalOpen}
        onClose={() => setTelemetryModalOpen(false)}
      />

      <ProjectManagerModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
      />

      <ModelTesterModal
        isOpen={modelTesterModalOpen}
        onClose={() => setModelTesterModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SapeProvider>
        <AppContent />
      </SapeProvider>
    </ErrorBoundary>
  );
}
