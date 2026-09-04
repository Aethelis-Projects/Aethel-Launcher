import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Search,
  SearchX,
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  RefreshCw,
} from 'lucide-react';
import {
  commands,
  type ModSearchResult,
  type ModVersion,
  type ResolutionResult,
} from '../bindings';

interface ModBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  gameVersion: string;
  loader: string | null;
  onModInstalled?: () => void;
}

export const ModBrowserModal: React.FC<ModBrowserModalProps> = ({
  isOpen,
  onClose,
  instanceId,
  gameVersion,
  loader,
  onModInstalled,
}) => {
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ModSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected mod for versions view
  const [selectedMod, setSelectedMod] = useState<ModSearchResult | null>(null);
  const [versions, setVersions] = useState<ModVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [installedVersionIds, setInstalledVersionIds] = useState<Set<string>>(new Set());
  const [resolutionResult, setResolutionResult] = useState<ResolutionResult | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await commands.searchMods(searchQuery, gameVersion, loader);
      if (res.status === 'ok') {
        setResults(res.data);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [gameVersion, loader]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setSelectedMod(null);
      setVersions([]);
      setResolutionResult(null);
      return;
    }

    // Initial search on open
    performSearch('');
  }, [isOpen, performSearch]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  const handleSelectMod = async (mod: ModSearchResult) => {
    setSelectedMod(mod);
    setVersions([]);
    setIsLoadingVersions(true);
    setResolutionResult(null);

    try {
      const res = await commands.getModVersions(mod.project_id, gameVersion, loader);
      if (res.status === 'ok') {
        setVersions(res.data);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const handleInstallVersion = async (versionId: string) => {
    setInstallingVersionId(versionId);
    setResolutionResult(null);

    try {
      const res = await commands.installMod(instanceId, versionId);
      if (res.status === 'ok') {
        setResolutionResult(res.data);
        if (res.data.conflicts.length === 0) {
          setInstalledVersionIds((prev) => new Set(prev).add(versionId));
          onModInstalled?.();
        }
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingVersionId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4 bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-800/50 text-cyan-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">{t('mods.browseMods')}</h2>
              <p className="text-[11px] text-zinc-400">
                Modrinth API v2 • {gameVersion} • {loader || 'Vanilla'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-zinc-800/60 bg-zinc-900/20">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder={t('mods.searchPlaceholder')}
              className="w-full pl-10 pr-10 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  performSearch('');
                }}
                className="absolute right-3 p-0.5 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Resolution Conflicts / Suggestions Notification */}
        {resolutionResult && resolutionResult.conflicts.length > 0 && (
          <div className="m-4 p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('mods.conflictsTitle')}</span>
            </div>
            <p className="text-[11px] text-red-300">{t('mods.conflictsNotice')}</p>
            <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
              {resolutionResult.conflicts.map((c, i) => (
                <li key={i}>{c.reason}</li>
              ))}
            </ul>
          </div>
        )}

        {resolutionResult && resolutionResult.optional_suggestions.length > 0 && (
          <div className="mx-4 mb-2 p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-cyan-200 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-cyan-400">
              <Layers className="w-4 h-4 shrink-0" />
              <span>{t('mods.optionalSuggestions')}</span>
            </div>
            <div className="space-y-1">
              {resolutionResult.optional_suggestions.map((opt) => (
                <div key={opt.version_id} className="flex items-center justify-between text-[11px]">
                  <span>{opt.name || opt.version_number}</span>
                  <button
                    onClick={() => handleInstallVersion(opt.version_id)}
                    className="px-2 py-0.5 rounded bg-cyan-800/80 hover:bg-cyan-700 text-white text-[10px]"
                  >
                    {t('mods.installSuggestion')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Results List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 border-r border-zinc-800/60">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-2 text-zinc-500">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                <span className="text-xs">Searching Modrinth...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-3 text-red-400">
                <AlertTriangle className="w-6 h-6" />
                <span className="text-xs">{t('mods.errorLoading')}</span>
                <button
                  onClick={() => performSearch(query)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('mods.retry')}</span>
                </button>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-2 text-zinc-500">
                <SearchX className="w-8 h-8 text-zinc-600" />
                <span className="text-xs">{t('mods.noModsFound')}</span>
              </div>
            ) : (
              results.map((mod) => {
                const isSelected = selectedMod?.project_id === mod.project_id;
                return (
                  <div
                    key={mod.project_id}
                    onClick={() => handleSelectMod(mod)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                      isSelected
                        ? 'bg-zinc-900 border-cyan-500/50 shadow-md shadow-cyan-950/20'
                        : 'bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900/80 hover:border-zinc-700'
                    }`}
                  >
                    {mod.icon_url ? (
                      <img
                        src={mod.icon_url}
                        alt={mod.title}
                        className="w-11 h-11 rounded-lg object-cover bg-zinc-800 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                        <Package className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-zinc-100 truncate">
                          {mod.title}
                        </h3>
                        <span className="text-[10px] text-zinc-500 shrink-0 font-mono">
                          {mod.downloads.toLocaleString()} {t('mods.downloads')}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">
                        {mod.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2 overflow-hidden">
                        <span className="text-[10px] text-zinc-500 truncate">
                          {t('mods.author', { author: mod.author })}
                        </span>
                        {mod.categories.slice(0, 3).map((cat) => (
                          <span
                            key={cat}
                            className="px-1.5 py-0.2 rounded bg-zinc-800 text-[10px] text-zinc-400"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Version Details Sidebar */}
          <div className="w-80 flex flex-col bg-zinc-950/80 overflow-y-auto p-4 border-l border-zinc-800/40">
            {selectedMod ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-zinc-100">{selectedMod.title}</h3>
                  <span className="text-[11px] text-zinc-400">
                    {t('mods.author', { author: selectedMod.author })}
                  </span>
                </div>

                <div className="border-t border-zinc-800/60 pt-3">
                  <h4 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                    {t('mods.versions')}
                  </h4>

                  {isLoadingVersions ? (
                    <div className="flex items-center justify-center py-6 text-zinc-500">
                      <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                    </div>
                  ) : versions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-zinc-500">
                      No compatible versions found for {gameVersion} ({loader || 'Vanilla'}).
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {versions.map((ver) => {
                        const isInstalling = installingVersionId === ver.version_id;
                        const isInstalled = installedVersionIds.has(ver.version_id);

                        return (
                          <div
                            key={ver.version_id}
                            className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-zinc-200 font-mono text-[11px]">
                                {ver.version_number}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                {ver.date_published.slice(0, 10)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] text-zinc-400">
                                {ver.loaders.join(', ')}
                              </span>
                              <button
                                onClick={() => handleInstallVersion(ver.version_id)}
                                disabled={isInstalling || isInstalled}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                                  isInstalled
                                    ? 'bg-emerald-950 border border-emerald-800 text-emerald-300 cursor-default'
                                    : isInstalling
                                    ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm'
                                }`}
                              >
                                {isInstalling ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>{t('mods.installing')}</span>
                                  </>
                                ) : isInstalled ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>{t('mods.installed')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3 h-3" />
                                    <span>{t('mods.install')}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs space-y-2 text-center p-4">
                <Package className="w-8 h-8 text-zinc-700" />
                <span>Select a mod from the list to view compatible versions and dependencies.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
