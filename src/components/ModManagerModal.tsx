import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  X,
  Package,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  ArrowUpCircle,
} from 'lucide-react';
import { commands, type InstalledMod, type ModUpdate } from '../bindings';
import { ModBrowserModal } from './ModBrowserModal';
import { ModloaderSelector } from './ModloaderSelector';

interface ModManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  instanceName: string;
  gameVersion: string;
  loader: string | null;
  loaderVersion: string | null;
}

export const ModManagerModal: React.FC<ModManagerModalProps> = ({
  isOpen,
  onClose,
  instanceId,
  instanceName,
  gameVersion,
  loader,
  loaderVersion,
}) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();

  const [mods, setMods] = useState<InstalledMod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updates, setUpdates] = useState<ModUpdate[]>([]);
  const [updatesChecked, setUpdatesChecked] = useState(false);

  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);

  const fetchMods = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await commands.listInstalledMods(instanceId);
      if (res.status === 'ok') {
        setMods(res.data);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (isOpen) {
      fetchMods();
      setUpdates([]);
      setUpdatesChecked(false);
    }
  }, [isOpen, fetchMods]);

  const handleToggleMod = async (fileName: string, currentEnabled: boolean) => {
    try {
      const res = await commands.toggleMod(instanceId, fileName, !currentEnabled);
      if (res.status === 'ok') {
        fetchMods();
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteMod = async (fileName: string) => {
    try {
      const res = await commands.deleteMod(instanceId, fileName);
      if (res.status === 'ok') {
        setDeletingFileName(null);
        fetchMods();
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    setError(null);
    try {
      const res = await commands.checkModUpdates(instanceId);
      if (res.status === 'ok') {
        setUpdates(res.data);
        setUpdatesChecked(true);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--surface-0)]/80 p-4 backdrop-blur-md"
      >
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/80 px-6 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-from)]">
                <Package className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {t('mods.title')} — {instanceName}
                </h2>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span>Minecraft {gameVersion}</span>
                  <span>•</span>
                  <span className="font-medium text-[var(--accent)]">
                    {loader ? `${loader} ${loaderVersion || ''}` : 'Vanilla'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                data-testid="browse-mods-btn"
                onClick={() => setIsBrowserOpen(true)}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-3 py-1.5 text-xs font-medium text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t('mods.browseMods')}</span>
              </button>

              <button
                data-testid="check-updates-btn"
                onClick={handleCheckUpdates}
                disabled={isCheckingUpdates || mods.length === 0}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-[var(--accent-from)]${isCheckingUpdates ? ' animate-spin' : ''}`}
                />
                <span>{isCheckingUpdates ? t('mods.checkingUpdates') : t('mods.checkUpdates')}</span>
              </button>
            </div>

            <div className="text-xs text-[var(--text-muted)]">
              <span className="font-semibold tabular-nums text-[var(--text-primary)]">{mods.length}</span>{' '}
              {t('mods.installedMods').toLowerCase()}
            </div>
          </div>

          {/* Body Content */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
            {/* Modloader Configuration Card */}
            <ModloaderSelector
              instanceId={instanceId}
              gameVersion={gameVersion}
              currentLoader={loader}
              currentLoaderVersion={loaderVersion}
              onLoaderUpdated={() => {
                fetchMods();
              }}
            />

            {/* Updates Banner */}
            {updatesChecked && (
              <div
                className={`flex items-center justify-between rounded-[var(--radius-md)] border p-3 text-xs ${
                  updates.length > 0
                    ? 'border-[var(--warning)]/40 bg-[var(--warning-soft)] text-[var(--warning)]'
                    : 'border-[var(--success)]/40 bg-[var(--success-soft)] text-[var(--success)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {updates.length > 0 ? (
                    <>
                      <ArrowUpCircle className="h-4 w-4 shrink-0 text-[var(--warning)]" />
                      <span>
                        {updates.length} {t('mods.updateAvailable')}:{' '}
                        {updates.map((u) => `${u.project_id} -> ${u.latest_version}`).join(', ')}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" />
                      <span>{t('mods.upToDate')}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
                <AlertCircle className="h-4 w-4 shrink-0 text-[var(--danger)]" />
                <span>{error}</span>
              </div>
            )}

            {/* Installed Mods List */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                <Package className="h-4 w-4 text-[var(--accent-from)]" />
                <span>{t('mods.installedMods')}</span>
              </div>

              {isLoading ? (
                <div className="flex flex-col items-center justify-center space-y-2 py-12 text-[var(--text-muted)]">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-from)]" />
                  <span className="text-xs">Loading installed mods...</span>
                </div>
              ) : mods.length === 0 ? (
                <div className="flex flex-col items-center justify-center space-y-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] p-8">
                  <Package className="h-8 w-8 text-[var(--text-muted)]" />
                  <div className="text-center">
                    <p className="text-xs font-medium text-[var(--text-primary)]">{t('mods.noModsInstalled')}</p>
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                      Download mods directly from Modrinth to enhance your gameplay.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsBrowserOpen(true)}
                    className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[var(--accent-from)]" />
                    <span>{t('mods.browseMods')}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {mods.map((mod, index) => {
                    const hasUpdate = updates.find((u) => u.project_id === mod.id);

                    return (
                      <motion.div
                        key={mod.file_name}
                        data-motion-element
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.16,
                          ease: 'easeOut',
                          delay: Math.min(index * 0.03, 0.18),
                        }}
                        className={`flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--line-subtle)] p-3.5 transition-colors ${
                          mod.enabled
                            ? 'bg-[var(--surface-1)]/80 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
                            : 'bg-[var(--surface-0)]/40 opacity-60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4
                              className="min-w-0 truncate text-xs font-semibold text-[var(--text-primary)]"
                              title={mod.name}
                            >
                              {mod.name}
                            </h4>
                            <span className="shrink-0 rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                              v{mod.version}
                            </span>
                            {hasUpdate && (
                              <span className="shrink-0 rounded border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] text-[var(--warning)]">
                                {t('mods.updateTo', { version: hasUpdate.latest_version })}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                            <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">
                              {mod.file_name}
                            </span>
                            {mod.authors.length > 0 && (
                              <span className="truncate">• {mod.authors.join(', ')}</span>
                            )}
                          </div>
                          {mod.description && (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--text-secondary)]">
                              {mod.description}
                            </p>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex shrink-0 items-center gap-3">
                          {/* Enable/Disable Toggle */}
                          <button
                            data-testid={`toggle-mod-${mod.file_name}`}
                            onClick={() => handleToggleMod(mod.file_name, mod.enabled)}
                            className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                            title={mod.enabled ? t('mods.enabled') : t('mods.disabled')}
                          >
                            {mod.enabled ? (
                              <ToggleRight className="h-6 w-6 text-[var(--accent)]" />
                            ) : (
                              <ToggleLeft className="h-6 w-6 text-[var(--text-muted)]" />
                            )}
                          </button>

                          {/* Delete Button */}
                          {deletingFileName === mod.file_name ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleDeleteMod(mod.file_name)}
                                className="rounded-[var(--radius-sm)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-2 py-1 text-[11px] font-medium text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/25"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeletingFileName(null)}
                                className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              data-testid={`delete-mod-${mod.file_name}`}
                              onClick={() => setDeletingFileName(mod.file_name)}
                              className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                              title={t('mods.delete')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Embedded Mod Browser Modal */}
      <ModBrowserModal
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        instanceId={instanceId}
        gameVersion={gameVersion}
        loader={loader}
        onModInstalled={() => {
          fetchMods();
        }}
      />
    </>
  );
};
