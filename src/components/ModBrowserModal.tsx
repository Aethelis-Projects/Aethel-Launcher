import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  X,
  Search,
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
  const prefersReducedMotion = useReducedMotion();

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
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 p-4 backdrop-blur-md"
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
              <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">{t('mods.browseMods')}</h2>
              <p className="truncate text-[11px] text-[var(--text-secondary)]">
                Modrinth API v2 • {gameVersion} • {loader || 'Vanilla'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-4">
          <div className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder={t('mods.searchPlaceholder')}
              className="w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] py-2 pl-9 pr-9 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--accent-from)] focus:outline-none"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  performSearch('');
                }}
                className="absolute right-3 p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Resolution Conflicts / Suggestions Notification */}
        {resolutionResult && resolutionResult.conflicts.length > 0 && (
          <div className="m-4 space-y-1.5 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t('mods.conflictsTitle')}</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">{t('mods.conflictsNotice')}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-[11px]">
              {resolutionResult.conflicts.map((c, i) => (
                <li key={i}>{c.reason}</li>
              ))}
            </ul>
          </div>
        )}

        {resolutionResult && resolutionResult.optional_suggestions.length > 0 && (
          <div className="mx-4 mb-2 space-y-1.5 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3 text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-2 font-semibold text-[var(--accent)]">
              <Layers className="h-4 w-4 shrink-0" />
              <span>{t('mods.optionalSuggestions')}</span>
            </div>
            <div className="space-y-1">
              {resolutionResult.optional_suggestions.map((opt) => (
                <div key={opt.version_id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate">{opt.name || opt.version_number}</span>
                  <button
                    onClick={() => handleInstallVersion(opt.version_id)}
                    className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    {t('mods.installSuggestion')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content Layout */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Results List */}
          <div className="min-w-0 flex-1 overflow-y-auto border-r border-[var(--line-subtle)] p-4">
            {isLoading ? (
              <div className="flex h-48 flex-col items-center justify-center space-y-2 text-[var(--text-muted)]">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-from)]" />
                <span className="text-xs">Searching Modrinth...</span>
              </div>
            ) : searchError ? (
              <div className="flex h-48 flex-col items-center justify-center space-y-3 p-4 text-center">
                <AlertTriangle className="h-6 w-6 text-[var(--danger)]" />
                <span className="text-xs font-semibold text-[var(--danger)]">{t('mods.errorLoading')}</span>
                <p className="max-w-sm text-[11px] text-[var(--text-secondary)]">{searchError}</p>
                <button
                  onClick={() => performSearch(query)}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{t('mods.retry')}</span>
                </button>
              </div>
            ) : results.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center space-y-2 text-[var(--text-muted)]">
                <Search className="h-8 w-8 text-[var(--text-muted)]" />
                <span className="text-xs">{t('mods.noModsFound')}</span>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-3">
                {results.map((mod, index) => {
                  const isSelected = selectedMod?.project_id === mod.project_id;
                  return (
                    <motion.div
                      key={mod.project_id}
                      data-motion-element
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.16,
                        ease: 'easeOut',
                        delay: Math.min(index * 0.03, 0.18),
                      }}
                      onClick={() => handleSelectMod(mod)}
                      className={`flex cursor-pointer gap-3 rounded-[var(--radius-md)] border p-3 transition-colors ${
                        isSelected
                          ? 'border-[var(--accent-line)] bg-[var(--surface-2)] ring-1 ring-[var(--accent-line)]'
                          : 'border-[var(--line-subtle)] bg-[var(--surface-1)]/80 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      {mod.icon_url ? (
                        <img
                          src={mod.icon_url}
                          alt={mod.title}
                          className="h-11 w-11 shrink-0 rounded-[var(--radius-sm)] bg-[var(--surface-3)] object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-3)] text-[var(--text-muted)]">
                          <Package className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3
                            className="min-w-0 truncate text-xs font-semibold text-[var(--text-primary)]"
                            title={mod.title}
                          >
                            {mod.title}
                          </h3>
                          <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                            {mod.downloads.toLocaleString()} {t('mods.downloads')}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--text-secondary)]">
                          {mod.description}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
                          <span className="truncate text-[10px] text-[var(--text-muted)]">
                            {t('mods.author', { author: mod.author })}
                          </span>
                          {mod.categories.slice(0, 3).map((cat) => (
                            <span
                              key={cat}
                              className="shrink-0 rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Version Details Sidebar */}
          <div className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-4">
            {selectedMod ? (
              <div className="min-w-0 space-y-4">
                <div>
                  <h3 className="min-w-0 truncate text-xs font-bold text-[var(--text-primary)]">
                    {selectedMod.title}
                  </h3>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {t('mods.author', { author: selectedMod.author })}
                  </span>
                </div>

                {installError && (
                  <div className="flex items-start justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-2.5 text-xs text-[var(--danger)]">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="break-words text-[11px] leading-relaxed">{installError}</span>
                    </div>
                    <button
                      onClick={() => setInstallError(null)}
                      className="shrink-0 p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <div className="border-t border-[var(--line-subtle)] pt-3">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    {t('mods.versions')}
                  </h4>

                  {isLoadingVersions ? (
                    <div className="flex items-center justify-center py-6 text-[var(--text-muted)]">
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-from)]" />
                    </div>
                  ) : versions.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[var(--text-muted)]">
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
                            className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate font-mono text-[11px] font-semibold tabular-nums text-[var(--text-primary)]">
                                {ver.version_number}
                              </span>
                              <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
                                {ver.date_published.slice(0, 10)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className="min-w-0 truncate text-[10px] text-[var(--text-muted)]">
                                {ver.loaders.join(', ')}
                              </span>
                              <button
                                onClick={() => handleInstallVersion(ver.version_id)}
                                disabled={isInstalling || isInstalled}
                                className={`flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                  isInstalled
                                    ? 'cursor-default border border-[var(--success)]/40 bg-[var(--success-soft)] text-[var(--success)]'
                                    : isInstalling
                                    ? 'cursor-not-allowed border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-muted)]'
                                    : 'border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                {isInstalling ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>{t('mods.installing')}</span>
                                  </>
                                ) : isInstalled ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>{t('mods.installed')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-3 w-3" />
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
              <div className="flex h-full flex-col items-center justify-center space-y-2 p-4 text-center text-xs text-[var(--text-muted)]">
                <Package className="h-8 w-8 text-[var(--text-muted)]" />
                <span>Select a mod from the list to view compatible versions and dependencies.</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
