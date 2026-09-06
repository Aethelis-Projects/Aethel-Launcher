import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        data-testid="modpack-install-modal"
        className="w-full max-w-4xl h-[85vh] rounded-[var(--radius-lg)] border border-[var(--line-subtle)] bg-[var(--surface-2)] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-[var(--text-on-accent)] shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">{t('modpack.install', 'Install Modpack')}</h3>
              <p className="text-xs text-[var(--text-secondary)]">Discover and install modpacks from Modrinth and CurseForge</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/60 hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Tabs & Search Bar */}
        <div className="px-6 py-3 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/30 shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setProvider('modrinth');
                setSelectedPack(null);
              }}
              className={`px-4 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-colors ${
                provider === 'modrinth'
                  ? 'bg-[var(--success)] text-[var(--text-on-accent)] shadow-sm'
                  : 'bg-[var(--surface-1)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--line-subtle)]'
              }`}
            >
              Modrinth
            </button>
            <button
              onClick={() => {
                setProvider('curseforge');
                setSelectedPack(null);
              }}
              className={`px-4 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-colors ${
                provider === 'curseforge'
                  ? 'bg-[var(--warning)] text-[var(--text-on-accent)] shadow-sm'
                  : 'bg-[var(--surface-1)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--line-subtle)]'
              }`}
            >
              CurseForge
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('modpack.searchPlaceholder', 'Search modpacks on Modrinth and CurseForge...')}
              className="w-full pl-10 pr-4 py-2 bg-[var(--surface-1)] border border-[var(--line-subtle)] rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-line)] placeholder-[var(--text-muted)]"
            />
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-[var(--danger-soft)] border border-[var(--danger)]/40 rounded-[var(--radius-sm)] flex items-start gap-2 text-xs text-[var(--danger)]">
            <AlertCircle className="w-4 h-4 text-[var(--danger)] mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {installSuccess ? (
            <div className="max-w-md mx-auto py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[var(--success-soft)] border border-[var(--success)]/40 flex items-center justify-center text-[var(--success)] mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">{t('modpack.installSuccess', 'Modpack installed successfully!')}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Instance <span className="text-[var(--accent)] font-semibold">{installSuccess.name}</span> is ready to launch.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-[var(--radius-md)] text-xs font-semibold bg-[var(--accent-from)] hover:bg-[var(--accent)]/90 text-[var(--text-on-accent)] transition-colors"
              >
                {t('mods.close', 'Close')}
              </button>
            </div>
          ) : selectedPack ? (
            /* Selected Modpack Review & Install Screen */
            <div className="max-w-2xl mx-auto space-y-6">
              <button
                onClick={() => setSelectedPack(null)}
                className="text-xs text-[var(--accent)] hover:text-[var(--accent)] flex items-center gap-1"
              >
                ← Back to search results
              </button>

              <div className="p-5 bg-[var(--surface-1)]/60 border border-[var(--line-subtle)] rounded-[var(--radius-lg)] flex items-start gap-4">
                <div className="w-16 h-16 rounded-[var(--radius-md)] bg-[var(--surface-3)] border border-[var(--line-subtle)] flex items-center justify-center overflow-hidden shrink-0">
                  {selectedPack.icon_url ? (
                    <img src={selectedPack.icon_url} alt={selectedPack.title} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-8 h-8 text-[var(--accent)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">{selectedPack.title}</h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--surface-3)] text-[var(--text-secondary)]">
                      {selectedPack.provider}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{selectedPack.summary}</p>
                  <div className="flex items-center gap-4 mt-3 text-[11px] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      <span>{selectedPack.author}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Download className="w-3.5 h-3.5" />
                      <span>{selectedPack.downloads.toLocaleString()} downloads</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Install Configuration Form */}
              <div className="bg-[var(--surface-1)]/60 border border-[var(--line-subtle)] rounded-[var(--radius-lg)] p-5 space-y-4">
                <label className="text-xs font-semibold text-[var(--text-primary)] block uppercase tracking-wider">
                  Instance Name
                </label>
                <input
                  type="text"
                  value={customInstanceName}
                  onChange={(e) => setCustomInstanceName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--line-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-line)]"
                />

                <div className="flex items-center justify-between pt-4 border-t border-[var(--line-subtle)]">
                  <span className="text-xs text-[var(--text-secondary)]">
                    Will install latest release version with all included mods
                  </span>
                  <button
                    onClick={handleInstall}
                    disabled={isInstalling || !customInstanceName.trim()}
                    className="px-6 py-2.5 rounded-[var(--radius-md)] text-xs font-semibold bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] hover:from-[var(--accent-from)] hover:to-[var(--accent-to)] text-[var(--text-on-accent)] shadow-lg shadow-black/30 disabled:opacity-50 flex items-center gap-2 transition-all"
                  >
                    {isInstalling ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('modpack.installingModpack', 'Downloading & installing...')}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>{t('modpack.installButton', 'Install Modpack')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center text-[var(--text-muted)] text-xs gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)]" />
              <span>Searching modpacks...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="py-24 text-center text-[var(--text-muted)] text-xs bg-[var(--surface-1)]/20 rounded-[var(--radius-lg)] border border-[var(--line-subtle)]">
              <Package className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-2" />
              <span>No modpacks found. Try searching for "Cobblemon", "Optimization", or "Origins".</span>
            </div>
          ) : (
            /* Results Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {results.map((pack) => (
                <div
                  key={`${pack.provider}-${pack.project_id}`}
                  onClick={() => handleSelectPack(pack)}
                  className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-1)]/50 border border-[var(--line-subtle)] hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)]/80 transition-all cursor-pointer flex items-start gap-3.5 group"
                >
                  <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--surface-3)] border border-[var(--line-subtle)] flex items-center justify-center overflow-hidden shrink-0 group-hover:border-[var(--accent-line)] transition-colors">
                    {pack.icon_url ? (
                      <img src={pack.icon_url} alt={pack.title} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-6 h-6 text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                        {pack.title}
                      </h4>
                      <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] shrink-0 transition-colors" />
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2">{pack.summary}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-muted)] font-mono">
                      <span>{pack.downloads.toLocaleString()} DL</span>
                      <span>•</span>
                      <span>{pack.author}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
