import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  X,
  Search,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Package,
  User,
  Sparkles,
  ArrowRight,
  ChevronLeft,
} from 'lucide-react';
import { commands, type Instance, type ModpackSearchResult } from '../bindings';
import { useInstanceStore } from '../store/instanceStore';

interface ModpackInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallSuccess?: (instance: Instance) => void;
}

export const ModpackInstallModal: React.FC<ModpackInstallModalProps> = ({
  isOpen,
  onClose,
  onInstallSuccess,
}) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const { fetchInstances } = useInstanceStore();

  const [provider, setProvider] = useState<'modrinth' | 'curseforge'>('modrinth');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ModpackSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected pack for review & installation
  const [selectedPack, setSelectedPack] = useState<ModpackSearchResult | null>(null);
  const [customInstanceName, setCustomInstanceName] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState<Instance | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(
    async (searchQuery: string, currentProvider: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await commands.searchModpacks(
          searchQuery,
          currentProvider,
          null, // loader
          null, // gameVersion
          20 // limit
        );
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
    },
    []
  );

  useEffect(() => {
    if (!isOpen) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSearch(query, provider);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, provider, isOpen, performSearch]);

  const handleSelectPack = (pack: ModpackSearchResult) => {
    setSelectedPack(pack);
    setCustomInstanceName(pack.title);
  };

  const handleInstall = async () => {
    if (!selectedPack) return;
    setIsInstalling(true);
    setError(null);
    try {
      const res = await commands.installOnlineModpack(
        selectedPack.provider,
        selectedPack.project_id,
        null, // versionId: latest
        customInstanceName.trim() ? customInstanceName.trim() : selectedPack.title
      );
      if (res.status === 'ok') {
        setInstallSuccess(res.data);
        await fetchInstances();
        if (onInstallSuccess) {
          onInstallSuccess(res.data);
        }
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInstalling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 p-4 backdrop-blur-md"
    >
      <motion.div
        data-testid="modpack-install-modal"
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] p-2 text-[var(--text-on-accent)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">{t('modpack.install', 'Install Modpack')}</h3>
              <p className="text-xs text-[var(--text-secondary)]">Discover and install modpacks from Modrinth and CurseForge</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Provider Tabs & Search Bar — flex-wrap toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/40 px-5 py-3">
          <div className="flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-0)]/60 p-1">
            <button
              onClick={() => {
                setProvider('modrinth');
                setSelectedPack(null);
              }}
              className={`rounded-[var(--radius-sm)] px-3.5 py-1 text-xs font-semibold transition-colors ${
                provider === 'modrinth'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-from)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Modrinth
            </button>
            <button
              onClick={() => {
                setProvider('curseforge');
                setSelectedPack(null);
              }}
              className={`rounded-[var(--radius-sm)] px-3.5 py-1 text-xs font-semibold transition-colors ${
                provider === 'curseforge'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-from)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              CurseForge
            </button>
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('modpack.searchPlaceholder', 'Search modpacks on Modrinth and CurseForge...')}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-from)] focus:outline-none"
            />
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-3 text-xs text-[var(--text-primary)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
            <span>{error}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {installSuccess ? (
            <div className="mx-auto max-w-md space-y-4 py-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--success)]/40 bg-[var(--success-soft)] text-[var(--success)]">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">{t('modpack.installSuccess', 'Modpack installed successfully!')}</h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Instance <span className="font-semibold text-[var(--accent)]">{installSuccess.name}</span> is ready to launch.
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-6 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
              >
                {t('mods.close', 'Close')}
              </button>
            </div>
          ) : selectedPack ? (
            /* Selected Modpack Review & Install Screen */
            <div className="space-y-5">
              <button
                onClick={() => setSelectedPack(null)}
                className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
              >
                <ChevronLeft className="h-4 w-4 text-[var(--accent-from)] transition-transform group-hover:-translate-x-0.5" />
                <span>Back to search results</span>
              </button>

              {/* Modpack Header Card */}
              <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-3)]">
                    {selectedPack.icon_url ? (
                      <img src={selectedPack.icon_url} alt={selectedPack.title} className="h-full w-full object-cover ring-1 ring-white/10" />
                    ) : (
                      <Package className="h-8 w-8 text-[var(--accent-from)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">{selectedPack.title}</h3>
                      <span className="rounded bg-[var(--surface-3)] px-2 py-0.5 font-mono text-[11px] uppercase text-[var(--text-secondary)]">
                        {selectedPack.provider}
                      </span>
                    </div>
                    <p className="mt-1 text-pretty text-xs leading-relaxed text-[var(--text-secondary)]">{selectedPack.summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-[var(--text-muted)]">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        <span>{selectedPack.author}</span>
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <Download className="h-3.5 w-3.5" />
                        <span>{selectedPack.downloads.toLocaleString()} downloads</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Install Configuration Form */}
              <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Instance Name
                </label>
                <input
                  type="text"
                  value={customInstanceName}
                  onChange={(e) => setCustomInstanceName(e.target.value)}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
                />

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line-subtle)] pt-4">
                  <span className="text-xs text-[var(--text-secondary)]">
                    Will install latest release version with all included mods
                  </span>
                  <button
                    onClick={handleInstall}
                    disabled={isInstalling || !customInstanceName.trim()}
                    className="flex items-center gap-2 rounded-[var(--radius-md)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-5 py-2 text-xs font-semibold text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isInstalling ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t('modpack.installingModpack', 'Downloading & installing...')}</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        <span>{t('modpack.installButton', 'Install Modpack')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-7 w-7 animate-spin text-[var(--accent-from)]" />
              <span>Searching modpacks...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/40 py-24 text-center text-xs text-[var(--text-muted)]">
              <Search className="mx-auto mb-2 h-8 w-8 text-[var(--text-muted)]" />
              <span>No modpacks found. Try searching for "Cobblemon", "Optimization", or "Origins".</span>
            </div>
          ) : (
            /* Results Grid */
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {results.map((pack, index) => (
                <motion.div
                  key={`${pack.provider}-${pack.project_id}`}
                  data-motion-element
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, delay: Math.min(index * 0.03, 0.18), ease: 'easeOut' }}
                  onClick={() => handleSelectPack(pack)}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 transition-all hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
                >
                  <div className="aspect-video w-full overflow-hidden bg-[var(--surface-3)]">
                    {pack.icon_url ? (
                      <img src={pack.icon_url} alt={pack.title} className="h-full w-full object-cover ring-1 ring-white/10" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-8 w-8 text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent-from)]" />
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate text-xs font-bold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]" title={pack.title}>
                        {pack.title}
                      </h4>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent-from)]" />
                    </div>
                    <p className="line-clamp-2 text-[11px] text-pretty text-[var(--text-secondary)]">{pack.summary}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-[10px]">
                      <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono tabular-nums text-[var(--text-secondary)]">
                        {pack.downloads.toLocaleString()} DL
                      </span>
                      <span className="truncate text-[var(--text-muted)]">{pack.author}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
