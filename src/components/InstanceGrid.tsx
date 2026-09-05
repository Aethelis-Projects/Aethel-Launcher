import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2, Clock, Calendar, CheckCircle2, AlertCircle, Package, Upload, FolderArchive, Trash2 } from 'lucide-react';
import { useInstanceStore } from '../store/instanceStore';
import { useAccountStore } from '../store/accountStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLogStore } from '../store/logStore';
import { commands, type Instance } from '../bindings';
import { localizeError } from '../utils/errors';
import { ModManagerModal } from './ModManagerModal';
import { ModpackImportModal } from './ModpackImportModal';
import { ModpackExportModal } from './ModpackExportModal';

export const InstanceGrid: React.FC = () => {
  const { t } = useTranslation();
  const [activeModManagerInstance, setActiveModManagerInstance] = useState<Instance | null>(null);
  const [activeExportInstance, setActiveExportInstance] = useState<Instance | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
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
      let effectiveJavaPath: string | null = null;
      if (javaMode === 'manual') {
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

      addLog(`[Aethel] Launching instance "${instanceId}" (${version})...`, false);
      const res = await commands.launchInstance(instanceId, version, maxRamMb, effectiveJavaPath, gcPreset);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-100">{t('instances.title')}</h2>
          <p className="text-xs text-zinc-400 mt-1">{t('instances.createFirst')}</p>
        </div>
        <button
          data-testid="import-modpack-btn"
          onClick={() => setIsImportModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-white transition-all shadow-sm"
        >
          <Upload className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t('modpack.import')}</span>
        </button>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {instances.map((instance) => {
          const isSelected = selectedInstanceId === instance.id;
          const status = launchStatus[instance.id] || 'idle';
          const isLaunching = status === 'launching' || status === 'downloading';
          const isRunning = status === 'running';

          return (
            <div
              key={instance.id}
              onClick={() => setSelectedInstanceId(instance.id)}
              className={`group relative rounded-xl border transition-all duration-200 overflow-hidden flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? 'bg-zinc-900/90 border-cyan-500/50 shadow-lg shadow-cyan-950/30 ring-1 ring-cyan-500/30'
                  : 'bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/80'
              }`}
            >
              {/* Top Banner & Badges */}
              <div className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-zinc-100 text-sm group-hover:text-white transition-colors">
                      {instance.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-cyan-400 font-mono text-[11px] font-medium border border-zinc-700/50">
                        {instance.game_version}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-400 text-[11px] border border-zinc-700/40">
                        {instance.loader || 'Vanilla'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Meta information */}
              <div className="px-4 py-3 border-t border-zinc-800/50 bg-zinc-950/30 space-y-1.5 text-[11px] text-zinc-400">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-zinc-500">
                    <Clock className="w-3.5 h-3.5" />
                    {t('instances.playtime')}
                  </span>
                  <span className="font-mono text-zinc-300">
                    {Math.floor(instance.total_playtime_seconds / 3600)} {t('instances.hours')}{' '}
                    {Math.floor((instance.total_playtime_seconds % 3600) / 60)} {t('instances.minutes')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-zinc-500">
                    <Calendar className="w-3.5 h-3.5" />
                    {t('instances.lastPlayed')}
                  </span>
                  <span>{instance.last_played_at || t('instances.never')}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-3 bg-zinc-950/60 border-t border-zinc-800/60 flex items-center gap-2">
                <button
                  data-testid={`manage-mods-${instance.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveModManagerInstance(instance);
                  }}
                  className="py-2 px-3 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-300 border border-zinc-700/50 hover:border-zinc-600 transition-colors shadow-sm"
                  title={t('mods.title')}
                >
                  <Package className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('mods.title')}</span>
                </button>

                <button
                  data-testid={`export-instance-${instance.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveExportInstance(instance);
                  }}
                  className="py-2 px-2.5 rounded-lg font-medium text-xs flex items-center justify-center bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-400 hover:text-indigo-400 border border-zinc-700/50 hover:border-indigo-500/50 transition-colors shadow-sm"
                  title={t('modpack.export')}
                >
                  <FolderArchive className="w-3.5 h-3.5" />
                </button>

                <button
                  data-testid={`delete-instance-${instance.id}`}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (window.confirm(t('instances.confirmDelete', { name: instance.name }))) {
                      await deleteInstance(instance.id);
                    }
                  }}
                  className="py-2 px-2.5 rounded-lg font-medium text-xs flex items-center justify-center bg-zinc-800/90 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 border border-zinc-700/50 hover:border-red-800/60 transition-colors shadow-sm"
                  title={t('instances.delete')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <button
                  disabled={isLaunching}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLaunch(instance.id, instance.game_version);
                  }}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-all ${
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

      {activeModManagerInstance && (
        <ModManagerModal
          isOpen={activeModManagerInstance !== null}
          onClose={() => setActiveModManagerInstance(null)}
          instanceId={activeModManagerInstance.id}
          instanceName={activeModManagerInstance.name}
          gameVersion={activeModManagerInstance.game_version}
          loader={activeModManagerInstance.loader}
          loaderVersion={activeModManagerInstance.loader_version}
        />
      )}

      {activeExportInstance && (
        <ModpackExportModal
          isOpen={activeExportInstance !== null}
          onClose={() => setActiveExportInstance(null)}
          instance={activeExportInstance}
        />
      )}

      <ModpackImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
};
