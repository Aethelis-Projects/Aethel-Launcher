import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
        <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4 bg-zinc-900/40">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-800/50 text-cyan-400">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  {t('mods.title')} — {instanceName}
                </h2>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400">
                  <span>Minecraft {gameVersion}</span>
                  <span>•</span>
                  <span className="font-medium text-cyan-400">
                    {loader ? `${loader} ${loaderVersion || ''}` : 'Vanilla'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action Toolbar */}
          <div className="p-4 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                data-testid="browse-mods-btn"
                onClick={() => setIsBrowserOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-medium shadow-md shadow-cyan-950/40 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('mods.browseMods')}</span>
              </button>

              <button
                data-testid="check-updates-btn"
                onClick={handleCheckUpdates}
                disabled={isCheckingUpdates || mods.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
                <span>{isCheckingUpdates ? t('mods.checkingUpdates') : t('mods.checkUpdates')}</span>
              </button>
            </div>

            <div className="text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200">{mods.length}</span> {t('mods.installedMods').toLowerCase()}
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                  updates.length > 0
                    ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                    : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {updates.length > 0 ? (
                    <>
                      <ArrowUpCircle className="w-4 h-4 text-amber-400" />
                      <span>
                        {updates.length} {t('mods.updateAvailable')}:{' '}
                        {updates.map((u) => `${u.project_id} -> ${u.latest_version}`).join(', ')}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{t('mods.upToDate')}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Installed Mods List */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                {t('mods.installedMods')}
              </h3>

              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs">Loading installed mods...</span>
                </div>
              ) : mods.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-8 space-y-3">
                  <Package className="w-10 h-10 text-zinc-700" />
                  <div className="text-center">
                    <p className="text-xs font-medium text-zinc-300">{t('mods.noModsInstalled')}</p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Download mods directly from Modrinth to enhance your gameplay.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsBrowserOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-900/60 border border-cyan-800/80 text-cyan-200 text-xs hover:bg-cyan-900 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('mods.browseMods')}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {mods.map((mod) => {
                    const hasUpdate = updates.find((u) => u.project_id === mod.id);

                    return (
                      <div
                        key={mod.file_name}
                        className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                          mod.enabled
                            ? 'bg-zinc-900/60 border-zinc-800/80'
                            : 'bg-zinc-950/40 border-zinc-900 opacity-60'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-zinc-100 truncate">
                              {mod.name}
                            </h4>
                            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[10px] text-zinc-400 font-mono">
                              v{mod.version}
                            </span>
                            {hasUpdate && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-950 border border-amber-800/60 text-[10px] text-amber-300">
                                {t('mods.updateTo', { version: hasUpdate.latest_version })}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
                            <span className="font-mono text-[10px] text-zinc-400 truncate">
                              {mod.file_name}
                            </span>
                            {mod.authors.length > 0 && (
                              <span>• {mod.authors.join(', ')}</span>
                            )}
                          </div>
                          {mod.description && (
                            <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                              {mod.description}
                            </p>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-3 shrink-0">
                          {/* Enable/Disable Toggle */}
                          <button
                            data-testid={`toggle-mod-${mod.file_name}`}
                            onClick={() => handleToggleMod(mod.file_name, mod.enabled)}
                            className="text-zinc-400 hover:text-zinc-200 transition-colors"
                            title={mod.enabled ? t('mods.enabled') : t('mods.disabled')}
                          >
                            {mod.enabled ? (
                              <ToggleRight className="w-6 h-6 text-cyan-400" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-zinc-600" />
                            )}
                          </button>

                          {/* Delete Button */}
                          {deletingFileName === mod.file_name ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleDeleteMod(mod.file_name)}
                                className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-white text-[11px] font-medium"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeletingFileName(null)}
                                className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-[11px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              data-testid={`delete-mod-${mod.file_name}`}
                              onClick={() => setDeletingFileName(mod.file_name)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                              title={t('mods.delete')}
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
        </div>
      </div>

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
