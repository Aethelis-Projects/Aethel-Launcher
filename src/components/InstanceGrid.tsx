import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
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
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[var(--surface-0)]">
      {/* Main Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">{t('instances.title')}</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">{t('instances.createFirst')}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            data-motion-element
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            data-testid="create-instance-btn"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold text-[var(--text-on-accent)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] transition-all shadow-[var(--shadow-glow)]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('instances.create', '+ Создать инстанс')}</span>
          </motion.button>
          <motion.button
            data-motion-element
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            data-testid="install-modpack-btn"
            onClick={() => setIsInstallModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold text-[var(--text-on-accent)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] transition-all shadow-[var(--shadow-glow)]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('modpack.install', 'Install Modpack')}</span>
          </motion.button>
          <button
            data-testid="import-modpack-btn"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--text-secondary)] bg-[var(--surface-2)] border border-[var(--line-subtle)] hover:border-[var(--line-strong)] hover:text-[var(--text-primary)] transition-all"
          >
            <Upload className="w-3.5 h-3.5 text-[var(--accent-from)]" />
            <span>{t('modpack.import')}</span>
          </button>
        </div>
      </div>

      {lastError && (
        <div className="p-3 bg-[var(--danger-soft)] border border-[var(--danger)]/50 rounded-[var(--radius-sm)] flex items-start gap-2 text-xs text-[var(--text-primary)]">
          <AlertCircle className="w-4 h-4 text-[var(--danger)] mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">{localizeError(lastError, t).title}: </span>
            <span>{localizeError(lastError, t).message}</span>
          </div>
        </div>
      )}

      {/* Responsive Instance Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {instances.map((instance, index) => {
          const isSelected = selectedInstanceId === instance.id;
          const status = launchStatus[instance.id] || 'idle';
          const isLaunching = status === 'launching' || status === 'downloading';
          const isRunning = status === 'running';

          return (
            <motion.div
              key={instance.id}
              data-motion-element
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.18), ease: 'easeOut' }}
              onClick={() => setSelectedInstanceId(instance.id)}
              onDoubleClick={() => setActiveManagerInstance(instance)}
              className={`group relative rounded-[var(--radius-lg)] border transition-all duration-200 overflow-hidden flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? 'bg-[var(--surface-2)] border-[var(--accent-line)] shadow-[var(--shadow-glow)] ring-1 ring-[var(--accent-line)]'
                  : 'bg-[var(--surface-2)]/80 border-[var(--line-subtle)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:shadow-[var(--shadow-glow)]'
              }`}
            >
              {/* Header: Icon, Name & Badges */}
              <div className="p-4 pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] flex items-center justify-center text-[var(--text-on-accent)] font-bold text-base shadow-inner overflow-hidden shrink-0">
                      {instance.icon_path ? (
                        <img src={instance.icon_path} alt={instance.name} className="w-full h-full object-cover" />
                      ) : (
                        instance.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-[var(--text-primary)] text-sm transition-colors truncate">
                        {instance.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-3)] text-[var(--accent-from)] font-mono text-[10px] font-semibold border border-[var(--line-subtle)]">
                          {instance.game_version}
                        </span>
                        <span className="px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-3)]/80 text-[var(--text-secondary)] text-[10px] border border-[var(--line-subtle)]">
                          {instance.loader || 'Vanilla'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Meta information: Playtime and Last Played */}
              <div className="px-4 py-2.5 border-t border-[var(--line-subtle)] bg-[var(--surface-1)]/55 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5 text-[var(--text-secondary)]" title={t('instances.playtime')}>
                  <Clock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <span className="font-mono text-[var(--text-primary)]">
                    {formatPlaytime(instance.total_playtime_seconds, t)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[var(--text-secondary)]" title={t('instances.lastPlayed')}>
                  <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <span>{formatLastPlayed(instance.last_played_at, t)}</span>
                </div>
              </div>

              {/* Action Bar: Large Play Button + Manage Button */}
              <div className="p-3 bg-[var(--surface-1)]/80 border-t border-[var(--line-subtle)] flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`manage-instance-${instance.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveManagerInstance(instance);
                  }}
                  className="py-2.5 px-3.5 rounded-[var(--radius-md)] font-medium text-xs flex items-center justify-center gap-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--line-subtle)] hover:border-[var(--line-strong)] transition-colors shrink-0"
                  title={t('instances.manage', 'Manage')}
                >
                  <Sliders className="w-3.5 h-3.5 text-[var(--accent-from)]" />
                  <span>{t('instances.manage', 'Manage')}</span>
                </button>

                <motion.button
                  data-motion-element
                  whileHover={isLaunching ? undefined : { y: -1 }}
                  whileTap={isLaunching ? undefined : { scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  type="button"
                  disabled={isLaunching}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLaunch(instance.id, instance.game_version);
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-[var(--radius-md)] font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                    isRunning
                      ? 'bg-[var(--success)] text-[var(--text-on-accent)] shadow-[var(--shadow-glow)]'
                    : isLaunching
                      ? 'bg-[var(--surface-3)] text-[var(--text-muted)] cursor-not-allowed'
                      : 'bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] text-[var(--text-on-accent)] shadow-[var(--shadow-glow)]'
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
                </motion.button>
              </div>
            </motion.div>
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
