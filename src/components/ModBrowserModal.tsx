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
  const [searchError, setSearchError] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

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
    setSearchError(null);
    try {
      const res = await commands.searchMods(searchQuery, gameVersion, loader);
      if (res.status === 'ok') {
        setResults(res.data);
      } else {
        setSearchError(res.error);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
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
      setSearchError(null);
      setInstallError(null);
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
    setInstallError(null);

    try {
      const res = await commands.getModVersions(mod.project_id, gameVersion, loader);
      if (res.status === 'ok') {
        setVersions(res.data);
      } else {
        setInstallError(res.error);
      }
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const handleInstallVersion = async (versionId: string) => {
    setInstallingVersionId(versionId);
    setResolutionResult(null);
    setInstallError(null);

    try {
      const res = await commands.installMod(instanceId, versionId);
      if (res.status === 'ok') {
        setResolutionResult(res.data);
        if (res.data.conflicts.length === 0) {
          setInstalledVersionIds((prev) => new Set(prev).add(versionId));
          onModInstalled?.();
        }
      } else {
        setInstallError(res.error);
      }
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingVersionId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-[var(--radius-lg)] border border-[var(--line-subtle)] bg-[var(--surface-2)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line-subtle)] px-6 py-4 bg-[var(--surface-1)]/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--accent)]">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('mods.browseMods')}</h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Modrinth API v2 • {gameVersion} • {loader || 'Vanilla'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/20">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder={t('mods.searchPlaceholder')}
              className="w-full pl-10 pr-10 py-2 rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--line-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-line)] transition-colors"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  performSearch('');
                }}
                className="absolute right-3 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Resolution Conflicts / Suggestions Notification */}
        {resolutionResult && resolutionResult.conflicts.length > 0 && (
          <div className="m-4 p-3 rounded-[var(--radius-md)] bg-[var(--danger-soft)] border border-[var(--danger)]/40 text-[var(--danger)] text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-[var(--danger)]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('mods.conflictsTitle')}</span>
            </div>
            <p className="text-[11px] text-[var(--danger)]">{t('mods.conflictsNotice')}</p>
            <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
              {resolutionResult.conflicts.map((c, i) => (
                <li key={i}>{c.reason}</li>
              ))}
            </ul>
          </div>
        )}

        {resolutionResult && resolutionResult.optional_suggestions.length > 0 && (
          <div className="mx-4 mb-2 p-3 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--accent)] text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-[var(--accent)]">
              <Layers className="w-4 h-4 shrink-0" />
              <span>{t('mods.optionalSuggestions')}</span>
            </div>
            <div className="space-y-1">
              {resolutionResult.optional_suggestions.map((opt) => (
                <div key={opt.version_id} className="flex items-center justify-between text-[11px]">
                  <span>{opt.name || opt.version_number}</span>
                  <button
                    onClick={() => handleInstallVersion(opt.version_id)}
                    className="px-2 py-0.5 rounded bg-[var(--accent-soft)] hover:bg-[var(--accent-from)]/80 text-[var(--text-on-accent)] text-[10px]"
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
          <div className="flex-1 overflow-y-auto p-4 space-y-2 border-r border-[var(--line-subtle)]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-2 text-[var(--text-muted)]">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                <span className="text-xs">Searching Modrinth...</span>
              </div>
            ) : searchError ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-3 text-[var(--danger)] p-4 text-center">
                <AlertTriangle className="w-6 h-6" />
                <span className="text-xs font-semibold">{t('mods.errorLoading')}</span>
                <p className="text-[11px] text-[var(--text-secondary)] max-w-sm">{searchError}</p>
                <button
                  onClick={() => performSearch(query)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-3)] text-[var(--text-primary)] text-xs hover:bg-[var(--surface-2)]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('mods.retry')}</span>
                </button>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-2 text-[var(--text-muted)]">
                <SearchX className="w-8 h-8 text-[var(--text-muted)]" />
                <span className="text-xs">{t('mods.noModsFound')}</span>
              </div>
            ) : (
              results.map((mod) => {
                const isSelected = selectedMod?.project_id === mod.project_id;
                return (
                  <div
                    key={mod.project_id}
                    onClick={() => handleSelectMod(mod)}
                    className={`p-3.5 rounded-[var(--radius-md)] border transition-all cursor-pointer flex gap-3 ${
                      isSelected
                        ? 'bg-[var(--surface-1)] border-[var(--accent-line)] shadow-md shadow-black/30'
                        : 'bg-[var(--surface-1)]/40 border-[var(--line-subtle)] hover:bg-[var(--surface-2)]/80 hover:border-[var(--line-strong)]'
                    }`}
                  >
                    {mod.icon_url ? (
                      <img
                        src={mod.icon_url}
                        alt={mod.title}
                        className="w-11 h-11 rounded-[var(--radius-sm)] object-cover bg-[var(--surface-3)] shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-[var(--radius-sm)] bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                        <Package className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {mod.title}
                        </h3>
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0 font-mono">
                          {mod.downloads.toLocaleString()} {t('mods.downloads')}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                        {mod.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2 overflow-hidden">
                        <span className="text-[10px] text-[var(--text-muted)] truncate">
                          {t('mods.author', { author: mod.author })}
                        </span>
                        {mod.categories.slice(0, 3).map((cat) => (
                          <span
                            key={cat}
                            className="px-1.5 py-0.2 rounded bg-[var(--surface-3)] text-[10px] text-[var(--text-secondary)]"
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
          <div className="w-80 flex flex-col bg-[var(--surface-2)]/80 overflow-y-auto p-4 border-l border-[var(--line-subtle)]">
            {selectedMod ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">{selectedMod.title}</h3>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {t('mods.author', { author: selectedMod.author })}
                  </span>
                </div>

                {installError && (
                  <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--danger-soft)] border border-[var(--danger)]/40 text-[var(--danger)] text-xs flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--danger)] mt-0.5" />
                      <span className="text-[11px] leading-relaxed break-words">{installError}</span>
                    </div>
                    <button
                      onClick={() => setInstallError(null)}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="border-t border-[var(--line-subtle)] pt-3">
                  <h4 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                    {t('mods.versions')}
                  </h4>

                  {isLoadingVersions ? (
                    <div className="flex items-center justify-center py-6 text-[var(--text-muted)]">
                      <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
                    </div>
                  ) : versions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-[var(--text-muted)]">
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
                            className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-1)]/60 border border-[var(--line-subtle)] text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-[var(--text-primary)] font-mono text-[11px]">
                                {ver.version_number}
                              </span>
                              <span className="text-[10px] text-[var(--text-muted)]">
                                {ver.date_published.slice(0, 10)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] text-[var(--text-secondary)]">
                                {ver.loaders.join(', ')}
                              </span>
                              <button
                                onClick={() => handleInstallVersion(ver.version_id)}
                                disabled={isInstalling || isInstalled}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                                  isInstalled
                                    ? 'bg-[var(--success-soft)] border border-[var(--success)]/40 text-[var(--success)] cursor-default'
                                    : isInstalling
                                    ? 'bg-[var(--surface-3)] text-[var(--text-secondary)] cursor-not-allowed'
                                    : 'bg-[var(--accent-from)] hover:bg-[var(--accent)]/90 text-[var(--text-on-accent)] shadow-sm'
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
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] text-xs space-y-2 text-center p-4">
                <Package className="w-8 h-8 text-[var(--text-muted)]" />
                <span>Select a mod from the list to view compatible versions and dependencies.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
