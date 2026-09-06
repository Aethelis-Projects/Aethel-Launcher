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
        className="flex min-w-[130px] items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] focus:border-[var(--accent-from)] focus:outline-none"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 shrink-0 text-[var(--accent-from)]" />
          <span className="truncate">{currentLabel}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-1.5 flex max-h-64 w-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-[var(--shadow-lg)]">
          {/* Search Box */}
          <div className="border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('common.search', 'Search version...')}
                className="w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--accent-from)] focus:outline-none"
              />
            </div>
          </div>

          {/* Version List with Scroll */}
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1">
            {/* All Versions Option */}
            {(!searchQuery || 'all versions'.includes(searchQuery.toLowerCase())) && (
              <button
                type="button"
                onClick={() => {
                  onChange('all');
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-xs transition-colors ${
                  value === 'all'
                    ? 'bg-[var(--accent-soft)] font-semibold text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{t('modpack.allVersions', 'All Versions')}</span>
                {value === 'all' && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
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
                  className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left font-mono text-xs tabular-nums transition-colors ${
                    isSelected
                      ? 'bg-[var(--accent-soft)] font-semibold text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{ver}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
                </button>
              );
            })}

            {filteredVersions.length === 0 && searchQuery && (
              <p className="py-3 text-center text-[11px] text-[var(--text-muted)]">
                {t('common.noResults', 'No versions found')}
              </p>
            )}

            {isLoading && (
              <p className="py-2 text-center text-[11px] text-[var(--text-muted)]">
                {t('common.loading', 'Loading versions...')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
