import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
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
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { commands, type Instance, type ModpackSearchResult } from '../bindings';
import { useInstanceStore } from '../store/instanceStore';
import { SafeHtml } from './SafeHtml';
import { VersionSelector } from './VersionSelector';

export interface ModpackBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallSuccess?: (instance: Instance) => void;
}

interface ModpackVersionItem {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  date_published?: string;
  changelog?: string;
}

export const ModpackBrowserModal: React.FC<ModpackBrowserModalProps> = ({
  isOpen,
  onClose,
  onInstallSuccess,
}) => {
  const { t } = useTranslation();
  const { fetchInstances } = useInstanceStore();

  const [provider, setProvider] = useState<'modrinth' | 'curseforge'>('modrinth');
  const [query, setQuery] = useState('');
  const [selectedGameVersion, setSelectedGameVersion] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [results, setResults] = useState<ModpackSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail view state
  const [selectedPack, setSelectedPack] = useState<ModpackSearchResult | null>(null);
  const [packDescription, setPackDescription] = useState<string | null>(null);
  const [packScreenshots, setPackScreenshots] = useState<string[]>([]);
  const [packVersions, setPackVersions] = useState<ModpackVersionItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Install state
  const [customInstanceName, setCustomInstanceName] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState<Instance | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(
    async (searchQuery: string, currentProvider: string, gameVer: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await commands.searchModpacks(
          searchQuery,
          currentProvider,
          null,
          gameVer === 'all' ? null : gameVer,
          30
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
    if (!isOpen) {
      setSelectedPack(null);
      setInstallSuccess(null);
      setError(null);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSearch(query, provider, selectedGameVersion);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, provider, selectedGameVersion, isOpen, performSearch]);

  // Extract dynamic categories from current search results
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    results.forEach((p) => {
      if (p.categories) {
        p.categories.forEach((c) => {
          if (c && c.trim()) cats.add(c.trim());
        });
      }
    });
    return Array.from(cats).slice(0, 15);
  }, [results]);

  // Filtered results based on selected dynamic category chip
  const filteredResults = useMemo(() => {
    if (!selectedCategory) return results;
    return results.filter((p) => p.categories && p.categories.includes(selectedCategory));
  }, [results, selectedCategory]);

  const handleSelectPack = async (pack: ModpackSearchResult) => {
    setSelectedPack(pack);
    setCustomInstanceName(pack.title);
    setPackDescription(null);
    setPackScreenshots([]);
    setPackVersions([]);
    setSelectedVersionId(pack.latest_version);
    setIsLoadingDetails(true);

    try {
      const detailsRes = await commands.getModpackDetails(pack.provider, pack.project_id);
      if (detailsRes.status === 'ok') {
        const d = detailsRes.data;
        if (d.body_markdown) {
          setPackDescription(d.body_markdown);
        } else if (d.description_html) {
          setPackDescription(d.description_html);
        } else {
          setPackDescription(pack.summary);
        }
        if (d.screenshots && d.screenshots.length > 0) {
          setPackScreenshots(d.screenshots);
        }
      } else {
        setPackDescription(pack.summary);
      }

      if (pack.provider === 'modrinth') {
        // Fetch versions list
        const verResp = await fetch(`https://api.modrinth.com/v2/project/${pack.project_id}/version`);
        if (verResp.ok) {
          const verData = await verResp.json();
          if (Array.isArray(verData)) {
            const items: ModpackVersionItem[] = verData.map((v: any) => ({
              id: v.id,
              name: v.name || v.version_number,
              version_number: v.version_number,
              game_versions: v.game_versions || [],
              loaders: v.loaders || [],
              date_published: v.date_published,
              changelog: v.changelog,
            }));
            setPackVersions(items);
            if (items.length > 0 && !selectedVersionId) {
              setSelectedVersionId(items[0].id);
            }
          }
        }
      }
    } catch {
      setPackDescription(pack.summary);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleInstall = async () => {
    if (!selectedPack) return;
    setIsInstalling(true);
    setError(null);
    try {
      const res = await commands.installOnlineModpack(
        selectedPack.provider,
        selectedPack.project_id,
        selectedVersionId,
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
        data-testid="modpack-browser-modal"
        className="w-full max-w-5xl h-[88vh] rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-600 to-indigo-600 text-white shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">{t('modpack.install', 'Modpack Browser')}</h3>
              <p className="text-xs text-zinc-400">Discover, inspect and install modpacks from Modrinth & CurseForge</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search, Provider Tabs & Version Filters */}
        <div className="px-6 py-3 border-b border-zinc-800/80 bg-zinc-900/30 shrink-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Provider Tabs */}
            <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              <button
                onClick={() => {
                  setProvider('modrinth');
                  setSelectedPack(null);
                  setSelectedCategory(null);
                }}
                className={`px-3.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  provider === 'modrinth'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Modrinth
              </button>
              <button
                onClick={() => {
                  setProvider('curseforge');
                  setSelectedPack(null);
                  setSelectedCategory(null);
                }}
                className={`px-3.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  provider === 'curseforge'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                CurseForge
              </button>
            </div>

            {/* Game Version Filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Version:</span>
              </label>
              <VersionSelector
                value={selectedGameVersion}
                onChange={setSelectedGameVersion}
                provider={provider}
              />
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('modpack.searchPlaceholder', 'Search modpacks by name, theme, or author...')}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 placeholder-zinc-500"
            />
          </div>

          {/* Dynamic Categories Chips */}
          {availableCategories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-2.5 py-0.5 rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === null
                    ? 'bg-cyan-600 text-white font-medium'
                    : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                All
              </button>
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                  className={`px-2.5 py-0.5 rounded-full whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-cyan-600 text-white font-medium'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
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
            /* Selected Modpack Full Detail View */
            <div className="space-y-6">
              <button
                onClick={() => setSelectedPack(null)}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 group"
              >
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span>Back to modpack browser</span>
              </button>

              {/* Banner & Summary Header */}
              <div className="p-5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl flex flex-col md:flex-row items-start gap-5">
                <div className="w-[120px] h-[68px] rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                  {selectedPack.icon_url ? (
                    <img src={selectedPack.icon_url} alt={selectedPack.title} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-8 h-8 text-cyan-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-base font-bold text-zinc-100">{selectedPack.title}</h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase">
                      {selectedPack.provider}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{selectedPack.summary}</p>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      <span>{selectedPack.author}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Download className="w-3.5 h-3.5" />
                      <span>{selectedPack.downloads.toLocaleString()} downloads</span>
                    </span>
                    {selectedPack.categories && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {selectedPack.categories.map((c) => (
                          <span key={c} className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Screenshots Gallery */}
              {packScreenshots.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-cyan-400" />
                    <span>Screenshots</span>
                  </h4>
                  <div className="flex items-center gap-3 overflow-x-auto pb-2">
                    {packScreenshots.map((img, i) => (
                      <a
                        key={i}
                        href={img}
                        target="_blank"
                        rel="noreferrer"
                        className="w-48 h-28 rounded-xl overflow-hidden border border-zinc-800 hover:border-cyan-500 transition-colors shrink-0 bg-zinc-900"
                      >
                        <img src={img} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Modpack Description (WS-28) */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  About Modpack
                </h4>
                {isLoadingDetails ? (
                  <div className="flex items-center justify-center py-6 text-zinc-500 gap-2 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>Loading details...</span>
                  </div>
                ) : packDescription ? (
                  selectedPack.provider === 'curseforge' || packDescription.includes('<p>') || packDescription.includes('<div') ? (
                    <SafeHtml html={packDescription} />
                  ) : (
                    <div className="prose prose-invert max-w-none text-xs text-zinc-300 leading-relaxed">
                      <ReactMarkdown>{packDescription}</ReactMarkdown>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-zinc-400 leading-relaxed">{selectedPack.summary}</p>
                )}
              </div>

              {/* Install Configuration & Version Selector */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                  Installation Settings
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">Instance Name</label>
                    <input
                      type="text"
                      value={customInstanceName}
                      onChange={(e) => setCustomInstanceName(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {packVersions.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400">Select Version</label>
                      <select
                        value={selectedVersionId || ''}
                        onChange={(e) => setSelectedVersionId(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500"
                      >
                        {packVersions.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.version_number}) [{v.game_versions.slice(0, 2).join(', ')}]
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-800/80">
                  <span className="text-xs text-zinc-400">
                    Modpack will be downloaded and an independent instance created.
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

              {/* Description View */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Description
                </h4>
                {isLoadingDetails ? (
                  <div className="py-12 flex items-center justify-center text-zinc-500 text-xs gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                    <span>Loading modpack description...</span>
                  </div>
                ) : packDescription ? (
                  <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 text-xs text-zinc-300 leading-relaxed max-w-none overflow-x-auto prose prose-invert">
                    {selectedPack.provider === 'curseforge' ? (
                      <SafeHtml html={packDescription} />
                    ) : (
                      <ReactMarkdown>{packDescription}</ReactMarkdown>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">No description provided for this modpack.</p>
                )}
              </div>
            </div>
          ) : isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center text-zinc-500 text-xs gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
              <span>Searching modpacks...</span>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="py-24 text-center text-zinc-500 text-xs bg-zinc-900/20 rounded-2xl border border-zinc-800/40">
              <Package className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
              <span>No modpacks found. Try searching for "Cobblemon", "Optimization", or "Origins".</span>
            </div>
          ) : (
            /* Results Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredResults.map((pack) => (
                <div
                  key={`${pack.provider}-${pack.project_id}`}
                  onClick={() => handleSelectPack(pack)}
                  className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:border-cyan-500/50 hover:bg-zinc-900/80 transition-all cursor-pointer flex items-start gap-3.5 group"
                >
                  <div className="w-[120px] h-[68px] rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-cyan-500/50 transition-colors shadow-sm">
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
