import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Check, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import { commands, type ModloaderVersion } from '../bindings';
import { useInstanceStore } from '../store/instanceStore';

interface ModloaderSelectorProps {
  instanceId: string;
  gameVersion: string;
  currentLoader: string | null;
  currentLoaderVersion: string | null;
  onLoaderUpdated?: () => void;
}

export const ModloaderSelector: React.FC<ModloaderSelectorProps> = ({
  instanceId,
  gameVersion,
  currentLoader,
  currentLoaderVersion,
  onLoaderUpdated,
}) => {
  const { t } = useTranslation();
  const { updateInstanceLoader } = useInstanceStore();

  const [selectedLoader, setSelectedLoader] = useState<string>(
    currentLoader ? currentLoader.toLowerCase() : 'vanilla'
  );
  const [selectedVersion, setSelectedVersion] = useState<string>(
    currentLoaderVersion || ''
  );
  const [availableVersions, setAvailableVersions] = useState<ModloaderVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSelectedLoader(currentLoader ? currentLoader.toLowerCase() : 'vanilla');
    setSelectedVersion(currentLoaderVersion || '');
  }, [currentLoader, currentLoaderVersion]);

  useEffect(() => {
    if (selectedLoader === 'vanilla') {
      setAvailableVersions([]);
      setSelectedVersion('');
      return;
    }

    let isMounted = true;
    const fetchVersions = async () => {
      setIsLoadingVersions(true);
      setError(null);
      try {
        const res = await commands.getModloaderVersions(selectedLoader, gameVersion);
        if (res.status === 'ok' && isMounted) {
          setAvailableVersions(res.data);
          if (res.data.length > 0) {
            const match = res.data.find((v) => v.version === currentLoaderVersion);
            setSelectedVersion(match ? match.version : res.data[0].version);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isMounted) {
          setIsLoadingVersions(false);
        }
      }
    };

    fetchVersions();
    return () => {
      isMounted = false;
    };
  }, [selectedLoader, gameVersion, currentLoaderVersion]);

  const handleApply = async () => {
    setIsApplying(true);
    setError(null);
    setSuccess(false);

    try {
      if (selectedLoader === 'vanilla') {
        const res = await commands.uninstallModloader(instanceId);
        if (res.status === 'ok') {
          updateInstanceLoader(instanceId, null, null);
          setSuccess(true);
          onLoaderUpdated?.();
        } else {
          setError(res.error);
        }
      } else {
        if (!selectedVersion) {
          setError('Please select a loader version');
          setIsApplying(false);
          return;
        }
        const res = await commands.installModloader(instanceId, selectedLoader, selectedVersion);
        if (res.status === 'ok') {
          updateInstanceLoader(instanceId, selectedLoader, selectedVersion);
          setSuccess(true);
          onLoaderUpdated?.();
        } else {
          setError(res.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  };

  const hasChanges =
    selectedLoader !== (currentLoader ? currentLoader.toLowerCase() : 'vanilla') ||
    (selectedLoader !== 'vanilla' && selectedVersion !== (currentLoaderVersion || ''));

  return (
    <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <Cpu className="h-4 w-4 text-[var(--accent-from)]" />
          <h4>{t('modloader.title')}</h4>
        </div>
        {success && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--success)]">
            <Check className="h-3.5 w-3.5" />
            {t('modloader.installed')}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-2.5 text-xs text-[var(--danger)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
            {t('modloader.select')}
          </label>
          <div className="relative">
            <select
              data-testid="modloader-type-select"
              value={selectedLoader}
              onChange={(e) => setSelectedLoader(e.target.value)}
              disabled={isApplying}
              className="w-full cursor-pointer appearance-none rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 pr-8 text-xs text-[var(--text-primary)] transition-colors focus:border-[var(--accent-from)] focus:outline-none disabled:opacity-50"
            >
              <option value="vanilla">{t('modloader.vanilla')}</option>
              <option value="fabric">{t('modloader.fabric')}</option>
              <option value="neoforge">{t('modloader.neoforge')}</option>
              <option value="quilt">{t('modloader.quilt')}</option>
              <option value="forge">{t('modloader.forge')}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          </div>
        </div>

        {selectedLoader !== 'vanilla' && (
          <div className="min-w-0">
            <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
              {t('modloader.version')}
            </label>
            <div className="relative">
              {isLoadingVersions ? (
                <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-from)]" />
                  <span>Loading versions...</span>
                </div>
              ) : (
                <>
                  <select
                    data-testid="modloader-version-select"
                    value={selectedVersion}
                    onChange={(e) => setSelectedVersion(e.target.value)}
                    disabled={isApplying || availableVersions.length === 0}
                    className="w-full cursor-pointer appearance-none rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 pr-8 font-mono text-xs text-[var(--text-primary)] transition-colors focus:border-[var(--accent-from)] focus:outline-none disabled:opacity-50"
                  >
                    {availableVersions.map((v) => (
                      <option key={v.version} value={v.version}>
                        {v.version} {v.stable ? '' : '(beta)'}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <button
          data-testid="modloader-apply-btn"
          onClick={handleApply}
          disabled={isApplying || !hasChanges}
          className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-3.5 py-1.5 text-xs font-medium transition-all ${
            hasChanges && !isApplying
              ? 'bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] text-[var(--text-on-accent)] hover:shadow-[var(--shadow-glow)] active:scale-[0.98]'
              : 'cursor-not-allowed border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-muted)]'
          }`}
        >
          {isApplying ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t('modloader.applying')}</span>
            </>
          ) : (
            <span>{t('modloader.apply')}</span>
          )}
        </button>
      </div>
    </div>
  );
};
