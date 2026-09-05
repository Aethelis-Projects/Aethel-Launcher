import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, Check, Filter } from 'lucide-react';
import { commands } from '../bindings';

interface VersionSelectorProps {
  value: string;
  onChange: (version: string) => void;
  provider?: 'modrinth' | 'curseforge' | 'all';
  className?: string;
}

interface CachedVersions {
  timestamp: number;
  versions: string[];
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_MODRINTH = 'aethel_mc_versions_modrinth';
const CACHE_KEY_MOJANG = 'aethel_mc_versions_mojang';

const FALLBACK_VERSIONS = [
  '1.21.4',
  '1.21.1',
  '1.20.4',
  '1.20.1',
  '1.19.4',
  '1.19.2',
  '1.18.2',
  '1.16.5',
  '1.12.2',
  '1.7.10',
];

export const VersionSelector: React.FC<VersionSelectorProps> = ({
  value,
  onChange,
  provider = 'all',
  className = '',
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [versions, setVersions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    let isCancelled = false;

    const loadVersions = async () => {
      setIsLoading(true);
      const isModrinth = provider === 'modrinth';
      const cacheKey = isModrinth ? CACHE_KEY_MODRINTH : CACHE_KEY_MOJANG;

      // 1. Try reading from persistent localStorage cache (Refinement 5)
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const cached: CachedVersions = JSON.parse(raw);
          if (Date.now() - cached.timestamp < CACHE_TTL_MS && cached.versions.length > 0) {
            if (!isCancelled) {
              setVersions(cached.versions);
              setIsLoading(false);
            }
            return;
          }
        }
      } catch {}

      // 2. Fetch from remote if cache missed or expired
      let fetchedList: string[] = [];

      if (isModrinth) {
        try {
          const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
          if (res.ok) {
            const data: Array<{ version: string; version_type: string; date: string }> = await res.json();
            fetchedList = data
              .filter((v) => v.version_type === 'release')
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((v) => v.version);
          }
        } catch {}
      } else {
        try {
          const res = await commands.getMinecraftVersions();
          if (res.status === 'ok') {
            fetchedList = res.data
              .filter((v) => v.version_type === 'release')
              .map((v) => v.id);
          }
        } catch {}
      }

      if (fetchedList.length === 0) {
        fetchedList = FALLBACK_VERSIONS;
      }

      // 3. Save to localStorage
      try {
        const cachePayload: CachedVersions = {
          timestamp: Date.now(),
          versions: fetchedList,
        };
        localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
      } catch {}

      if (!isCancelled) {
        setVersions(fetchedList);
        setIsLoading(false);
      }
    };

    loadVersions();

    return () => {
      isCancelled = true;
    };
  }, [provider]);

  const filteredVersions = useMemo(() => {
    if (!searchQuery.trim()) return versions;
    const q = searchQuery.toLowerCase().trim();
    return versions.filter((v) => v.toLowerCase().includes(q));
  }, [versions, searchQuery]);

  const currentLabel = value === 'all' ? t('modpack.allVersions', 'All Versions') : value;

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs font-medium text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all min-w-[130px]"
      >
        <span className="flex items-center gap-1.5 truncate">
          <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">{currentLabel}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-56 max-h-72 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-zinc-800/80 bg-zinc-900/40">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('common.search', 'Search version...')}
                className="w-full pl-8 pr-2.5 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Version List with Scroll */}
          <div className="overflow-y-auto max-h-56 p-1 space-y-0.5">
            {/* All Versions Option */}
            {(!searchQuery || 'all versions'.includes(searchQuery.toLowerCase())) && (
              <button
                type="button"
                onClick={() => {
                  onChange('all');
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg text-left transition-colors ${
                  value === 'all'
                    ? 'bg-cyan-950/60 text-cyan-300 font-semibold'
                    : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span>{t('modpack.allVersions', 'All Versions')}</span>
                {value === 'all' && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
              </button>
            )}

            {filteredVersions.map((ver) => {
              const isSelected = value === ver;
              return (
                <button
                  key={ver}
                  type="button"
                  onClick={() => {
                    onChange(ver);
                    setIsOpen(false);
                    setSearchQuery('');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg text-left transition-colors font-mono ${
                    isSelected
                      ? 'bg-cyan-950/60 text-cyan-300 font-semibold'
                      : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <span>{ver}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                </button>
              );
            })}

            {filteredVersions.length === 0 && searchQuery && (
              <p className="text-[11px] text-zinc-500 text-center py-3">
                {t('common.noResults', 'No versions found')}
              </p>
            )}

            {isLoading && (
              <p className="text-[11px] text-zinc-500 text-center py-2">
                {t('common.loading', 'Loading versions...')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
