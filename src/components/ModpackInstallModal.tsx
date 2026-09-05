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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        data-testid="modpack-install-modal"
        className="w-full max-w-4xl h-[85vh] rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-600 to-indigo-600 text-white shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">{t('modpack.install', 'Install Modpack')}</h3>
              <p className="text-xs text-zinc-400">Discover and install modpacks from Modrinth and CurseForge</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Tabs & Search Bar */}
        <div className="px-6 py-3 border-b border-zinc-800/80 bg-zinc-900/30 shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setProvider('modrinth');
                setSelectedPack(null);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                provider === 'modrinth'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              Modrinth
            </button>
            <button
              onClick={() => {
                setProvider('curseforge');
                setSelectedPack(null);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                provider === 'curseforge'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              CurseForge
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('modpack.searchPlaceholder', 'Search modpacks on Modrinth and CurseForge...')}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 placeholder-zinc-500"
            />
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-950/40 border border-red-800/80 rounded-lg flex items-start gap-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {installSuccess ? (
            <div className="max-w-md mx-auto py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-100">{t('modpack.installSuccess', 'Modpack installed successfully!')}</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Instance <span className="text-cyan-400 font-semibold">{installSuccess.name}</span> is ready to launch.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
              >
                {t('mods.close', 'Close')}
              </button>
            </div>
          ) : selectedPack ? (
            /* Selected Modpack Review & Install Screen */
            <div className="max-w-2xl mx-auto space-y-6">
              <button
                onClick={() => setSelectedPack(null)}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                ← Back to search results
              </button>

              <div className="p-5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                  {selectedPack.icon_url ? (
                    <img src={selectedPack.icon_url} alt={selectedPack.title} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-8 h-8 text-cyan-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-zinc-100">{selectedPack.title}</h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {selectedPack.provider}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">{selectedPack.summary}</p>
                  <div className="flex items-center gap-4 mt-3 text-[11px] text-zinc-500">
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
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <label className="text-xs font-semibold text-zinc-200 block uppercase tracking-wider">
                  Instance Name
                </label>
                <input
                  type="text"
                  value={customInstanceName}
                  onChange={(e) => setCustomInstanceName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500"
                />

                <div className="flex items-center justify-between pt-4 border-t border-zinc-800/80">
                  <span className="text-xs text-zinc-400">
                    Will install latest release version with all included mods
                  </span>
                  <button
                    onClick={handleInstall}
                    disabled={isInstalling || !customInstanceName.trim()}
                    className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-lg shadow-cyan-950 disabled:opacity-50 flex items-center gap-2 transition-all"
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
            <div className="py-24 flex flex-col items-center justify-center text-zinc-500 text-xs gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
              <span>Searching modpacks...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="py-24 text-center text-zinc-500 text-xs bg-zinc-900/20 rounded-2xl border border-zinc-800/40">
              <Package className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
              <span>No modpacks found. Try searching for "Cobblemon", "Optimization", or "Origins".</span>
            </div>
          ) : (
            /* Results Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {results.map((pack) => (
                <div
                  key={`${pack.provider}-${pack.project_id}`}
                  onClick={() => handleSelectPack(pack)}
                  className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:border-cyan-500/50 hover:bg-zinc-900/80 transition-all cursor-pointer flex items-start gap-3.5 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-cyan-500/50 transition-colors">
                    {pack.icon_url ? (
                      <img src={pack.icon_url} alt={pack.title} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-6 h-6 text-zinc-500 group-hover:text-cyan-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-zinc-100 truncate group-hover:text-cyan-300 transition-colors">
                        {pack.title}
                      </h4>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-cyan-400 shrink-0 transition-colors" />
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{pack.summary}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500 font-mono">
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
