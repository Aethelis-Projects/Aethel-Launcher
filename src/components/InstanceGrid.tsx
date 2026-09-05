import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Loader2,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Upload,
  Sliders,
  Sparkles,
  Plus,
} from 'lucide-react';
import { useInstanceStore } from '../store/instanceStore';
import { useAccountStore } from '../store/accountStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLogStore } from '../store/logStore';
import { commands, type Instance } from '../bindings';
import { localizeError } from '../utils/errors';
import { formatLastPlayed, formatPlaytime } from '../utils/formatLastPlayed';
import { ConfirmDialog } from './ConfirmDialog';
import { ModpackImportModal } from './ModpackImportModal';
import { ModpackExportModal } from './ModpackExportModal';
import { ModpackBrowserModal } from './ModpackBrowserModal';
import { InstanceManagerModal } from './InstanceManagerModal';
import { InstanceSettingsModal } from './InstanceSettingsModal';
import { CreateInstanceModal } from './CreateInstanceModal';

export const InstanceGrid: React.FC = () => {
  const { t } = useTranslation();
  const [activeManagerInstance, setActiveManagerInstance] = useState<Instance | null>(null);
  const [activeExportInstance, setActiveExportInstance] = useState<Instance | null>(null);
  const [activeSettingsInstance, setActiveSettingsInstance] = useState<Instance | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Instance | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    instances,
    selectedInstanceId,
    setSelectedInstanceId,
    deleteInstance,
    launchStatus,
    setLaunchStatus,
    setLastError,
    lastError,
  } = useInstanceStore();

  const { activeAccount, setIsAccountModalOpen } = useAccountStore();
  const { maxRamMb, javaPath, javaMode, preferredProvider, gcPreset } = useSettingsStore();
  const { addLog } = useLogStore();

  const handleLaunch = async (instanceId: string, version: string) => {
    if (!activeAccount) {
      addLog(`[Aethel] No active account found. Please select or add an account before playing.`, true);
      setIsAccountModalOpen(true);
      return;
    }

    setLaunchStatus(instanceId, 'launching');
    setLastError(null);

    try {
      const effRes = await commands.getEffectiveInstanceSettings(instanceId);
      const eff = effRes.status === 'ok' ? effRes.data : null;

      let effectiveJavaPath: string | null = null;
      if (eff?.java_path) {
        effectiveJavaPath = eff.java_path;
        addLog(`[Aethel] Using instance Java override: ${effectiveJavaPath}`, false);
      } else if (javaMode === 'manual') {
        effectiveJavaPath = javaPath && javaPath.trim() ? javaPath : null;
      } else {
        addLog(`[Aethel] Resolving Java runtime for Minecraft ${version}...`, false);
        const resolved = await commands.resolveJavaForInstance(version, null, preferredProvider);
        if (resolved.status === 'ok') {
          effectiveJavaPath = resolved.data;
          addLog(`[Aethel] Selected runtime: ${effectiveJavaPath}`, false);
        } else {
          addLog(`[Aethel Warning] Java resolution fallback: ${resolved.error}`, true);
        }
      }

      const targetRam = eff ? eff.memory_max_mb : maxRamMb;
      const targetGc = eff ? eff.gc_preset : gcPreset;

      addLog(`[Aethel] Launching instance "${instanceId}" (${version})...`, false);
      const res = await commands.launchInstance(instanceId, version, targetRam, effectiveJavaPath, targetGc);
      if (res.status === 'ok') {
        const pid = res.data;
        setLaunchStatus(instanceId, 'running');
        addLog(`[Aethel] Game process started (PID: ${pid}) for player ${activeAccount.name}`, false);
      } else {
        setLastError(res.error);
        setLaunchStatus(instanceId, 'idle');
        addLog(`[Aethel Error] Launch failed: ${res.error}`, true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
      setLaunchStatus(instanceId, 'idle');
      addLog(`[Aethel Error] Exception during launch: ${msg}`, true);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Main Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-100">{t('instances.title')}</h2>
          <p className="text-xs text-zinc-400 mt-1">{t('instances.createFirst')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="create-instance-btn"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-all shadow-md shadow-cyan-950/40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('instances.create', '+ Создать инстанс')}</span>
          </button>
          <button
            data-testid="install-modpack-btn"
            onClick={() => setIsInstallModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 transition-all shadow-md shadow-cyan-950"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('modpack.install', 'Install Modpack')}</span>
          </button>
          <button
            data-testid="import-modpack-btn"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-white transition-all shadow-sm"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t('modpack.import')}</span>
          </button>
        </div>
      </div>

      {lastError && (
        <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-lg flex items-start gap-2 text-xs text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">{localizeError(lastError, t).title}: </span>
            <span>{localizeError(lastError, t).message}</span>
          </div>
        </div>
      )}

      {/* Responsive Instance Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {instances.map((instance) => {
          const isSelected = selectedInstanceId === instance.id;
          const status = launchStatus[instance.id] || 'idle';
          const isLaunching = status === 'launching' || status === 'downloading';
          const isRunning = status === 'running';

          return (
            <div
              key={instance.id}
              onClick={() => setSelectedInstanceId(instance.id)}
              onDoubleClick={() => setActiveManagerInstance(instance)}
              className={`group relative rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? 'bg-zinc-900/90 border-cyan-500/50 shadow-lg shadow-cyan-950/30 ring-1 ring-cyan-500/30'
                  : 'bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/80'
              }`}
            >
              {/* Header: Icon, Name & Badges */}
              <div className="p-4 pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-inner overflow-hidden shrink-0">
                      {instance.icon_path ? (
                        <img src={instance.icon_path} alt={instance.name} className="w-full h-full object-cover" />
                      ) : (
                        instance.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-zinc-100 text-sm group-hover:text-white transition-colors truncate">
                        {instance.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-cyan-400 font-mono text-[10px] font-semibold border border-zinc-700/50">
                          {instance.game_version}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-400 text-[10px] border border-zinc-700/40">
                          {instance.loader || 'Vanilla'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Meta information: Playtime and Last Played */}
              <div className="px-4 py-2.5 border-t border-zinc-800/50 bg-zinc-950/30 flex items-center justify-between text-[11px] text-zinc-400">
                <div className="flex items-center gap-1.5 text-zinc-400" title={t('instances.playtime')}>
                  <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="font-mono text-zinc-300">
                    {formatPlaytime(instance.total_playtime_seconds, t)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-400" title={t('instances.lastPlayed')}>
                  <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span>{formatLastPlayed(instance.last_played_at, t)}</span>
                </div>
              </div>

              {/* Action Bar: Large Play Button + Manage Button */}
              <div className="p-3 bg-zinc-950/60 border-t border-zinc-800/60 flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`manage-instance-${instance.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveManagerInstance(instance);
                  }}
                  className="py-2.5 px-3.5 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 transition-colors shadow-sm shrink-0"
                  title={t('instances.manage', 'Manage')}
                >
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('instances.manage', 'Manage')}</span>
                </button>

                <button
                  type="button"
                  disabled={isLaunching}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLaunch(instance.id, instance.game_version);
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                    isRunning
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950'
                      : isLaunching
                      ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-md shadow-cyan-950'
                  }`}
                >
                  {isLaunching ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('instances.launching')}</span>
                    </>
                  ) : isRunning ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('instances.running')}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{t('instances.launch')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Instance Manager Modal (Prism / Freesm Overhaul) */}
      {activeManagerInstance && (
        <InstanceManagerModal
          isOpen={activeManagerInstance !== null}
          onClose={() => setActiveManagerInstance(null)}
          instance={activeManagerInstance}
          onExport={(inst) => setActiveExportInstance(inst)}
          onDelete={() => setDeleteTarget(activeManagerInstance)}
        />
      )}

      {/* Instance Settings Modal */}
      {activeSettingsInstance && (
        <InstanceSettingsModal
          isOpen={activeSettingsInstance !== null}
          onClose={() => setActiveSettingsInstance(null)}
          instanceId={activeSettingsInstance.id}
          instanceName={activeSettingsInstance.name}
          gameVersion={activeSettingsInstance.game_version}
        />
      )}

      {/* Modpack Export Modal */}
      {activeExportInstance && (
        <ModpackExportModal
          isOpen={activeExportInstance !== null}
          onClose={() => setActiveExportInstance(null)}
          instance={activeExportInstance}
        />
      )}

      {/* Modpack Import Modal */}
      <ModpackImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* Modpack Browser Modal */}
      <ModpackBrowserModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      {/* Create Instance Modal */}
      <CreateInstanceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Confirm Dialog for Instance Deletion */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={t('instances.deleteTitle', 'Delete Instance')}
        message={t('instances.confirmDelete', { name: deleteTarget?.name || '' })}
        confirmText={t('common.delete', 'Delete')}
        variant="danger"
        isLoading={isDeleting}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setIsDeleting(true);
          try {
            await deleteInstance(deleteTarget.id);
            setDeleteTarget(null);
            setActiveManagerInstance(null);
          } finally {
            setIsDeleting(false);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
