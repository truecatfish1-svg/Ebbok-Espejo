import React, { useState, useRef } from 'react';
import { useSape } from '../context/SapeContext';
import { FolderArchive, Plus, Trash2, Download, Upload, Save, Check, FileText, AlertOctagon } from 'lucide-react';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({ isOpen, onClose }) => {
  const { 
    projects, 
    currentProjectId, 
    loadProject, 
    deleteProject, 
    saveProject, 
    newProject,
    purgeAllMemoryAndStorage,
    exportProjectJson,
    importProjectJson,
    metadata 
  } = useSape();

  const [newProjectName, setNewProjectName] = useState('');
  const [isPurging, setIsPurging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSaveAs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    saveProject(newProjectName.trim());
    setNewProjectName('');
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        importProjectJson(content);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [confirmPurgeStep, setConfirmPurgeStep] = useState(false);
  const [confirmNewStep, setConfirmNewStep] = useState(false);

  const handlePurge = async () => {
    setIsPurging(true);
    await purgeAllMemoryAndStorage();
    setIsPurging(false);
    setConfirmPurgeStep(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl text-slate-100">
        {/* Cabecera */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Gestor de Proyectos Editoriales</h2>
              <p className="text-xs text-slate-400">Guarda tus sesiones de digitalización y exporta copias de seguridad.</p>
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
          {/* Guardar Proyecto Actual */}
          <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700 space-y-3">
            <h3 className="font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <Save className="w-4 h-4 text-blue-400" />
              Guardar Proyecto Actual
            </h3>
            <form onSubmit={handleSaveAs} className="flex gap-2">
              <input
                type="text"
                placeholder={metadata.title || "Nombre para este proyecto"}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition"
              >
                Guardar
              </button>
            </form>
          </div>

          {/* Importar y Exportar */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={exportProjectJson}
              className="p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center gap-2 font-semibold text-slate-200 transition"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Exportar Respaldo JSON</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center gap-2 font-semibold text-slate-200 transition"
            >
              <Upload className="w-4 h-4 text-indigo-400" />
              <span>Importar Respaldo JSON</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileImport}
              className="hidden"
            />
          </div>

          {/* Lista de Proyectos Guardados */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-300 uppercase tracking-wide">
              Proyectos Guardados ({projects.length})
            </h3>

            {projects.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-800/30 rounded-xl border border-slate-800">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No tienes proyectos guardados aún.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {projects.map((proj) => {
                  const isCurrent = currentProjectId === proj.id;
                  return (
                    <div
                      key={proj.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                        isCurrent
                          ? 'bg-blue-950/40 border-blue-600/80 text-white'
                          : 'bg-slate-800/70 border-slate-700/80 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white truncate">{proj.name}</span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500 text-white font-bold">
                              Activo
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {proj.chunks?.length || 0} fragmentos • Actualizado: {new Date(proj.updatedAt).toLocaleDateString()} {new Date(proj.updatedAt).toLocaleTimeString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isCurrent && (
                          <button
                            onClick={() => {
                              loadProject(proj.id);
                              onClose();
                            }}
                            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-semibold"
                          >
                            Cargar
                          </button>
                        )}
                        {projectToDelete === proj.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                deleteProject(proj.id);
                                setProjectToDelete(null);
                              }}
                              className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-bold"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setProjectToDelete(null)}
                              className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded text-[11px]"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setProjectToDelete(proj.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400"
                            title="Eliminar proyecto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Pie */}
        <div className="p-4 border-t border-slate-800 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            {confirmNewStep ? (
              <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700">
                <span className="text-[11px] text-slate-300 px-1">¿Crear nuevo?</span>
                <button
                  onClick={() => {
                    newProject();
                    setConfirmNewStep(false);
                    onClose();
                  }}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded"
                >
                  Sí, reiniciar
                </button>
                <button
                  onClick={() => setConfirmNewStep(false)}
                  className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmNewStep(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
              >
                <Plus className="w-4 h-4 text-blue-400" />
                <span>Nuevo Proyecto</span>
              </button>
            )}

            {confirmPurgeStep ? (
              <div className="flex items-center gap-1.5 bg-rose-950/80 p-1 rounded-lg border border-rose-800">
                <span className="text-[11px] text-rose-200 px-1 font-bold">¿Borrar TODO?</span>
                <button
                  onClick={handlePurge}
                  disabled={isPurging}
                  className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded"
                >
                  {isPurging ? 'Borrando...' : 'Sí, Purgar'}
                </button>
                <button
                  onClick={() => setConfirmPurgeStep(false)}
                  className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmPurgeStep(true)}
                disabled={isPurging}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 text-xs font-semibold rounded-lg transition"
                title="Borrar completamente todo el almacenamiento e iniciar 100% de cero"
              >
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                <span>Purgar Todo (Reset Total)</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
