import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Check, Loader2, AlertCircle } from 'lucide-react';
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
    <div className="bg-[var(--surface-2)]/50 border border-[var(--line-subtle)] rounded-[var(--radius-md)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[var(--accent)]" />
          <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
            {t('modloader.title')}
          </h4>
        </div>
        {success && (
          <span className="flex items-center gap-1 text-[11px] text-[var(--success)] font-medium">
            <Check className="w-3.5 h-3.5" />
            {t('modloader.installed')}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] bg-[var(--danger-soft)] border border-[var(--danger)]/40/60 text-[var(--danger)] text-xs">
          <AlertCircle className="w-4 h-4 text-[var(--danger)] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-[var(--text-secondary)] mb-1.5 font-medium">
            {t('modloader.select')}
          </label>
          <select
            data-testid="modloader-type-select"
            value={selectedLoader}
            onChange={(e) => setSelectedLoader(e.target.value)}
            disabled={isApplying}
            className="w-full bg-[var(--surface-1)] border border-[var(--line-subtle)] rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-line)] transition-colors"
          >
            <option value="vanilla">{t('modloader.vanilla')}</option>
            <option value="fabric">{t('modloader.fabric')}</option>
            <option value="neoforge">{t('modloader.neoforge')}</option>
            <option value="quilt">{t('modloader.quilt')}</option>
            <option value="forge">{t('modloader.forge')}</option>
          </select>
        </div>

        {selectedLoader !== 'vanilla' && (
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1.5 font-medium">
              {t('modloader.version')}
            </label>
            <div className="relative">
              {isLoadingVersions ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-1)] border border-[var(--line-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-muted)]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                  <span>Loading versions...</span>
                </div>
              ) : (
                <select
                  data-testid="modloader-version-select"
                  value={selectedVersion}
                  onChange={(e) => setSelectedVersion(e.target.value)}
                  disabled={isApplying || availableVersions.length === 0}
                  className="w-full bg-[var(--surface-1)] border border-[var(--line-subtle)] rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-line)] transition-colors"
                >
                  {availableVersions.map((v) => (
                    <option key={v.version} value={v.version}>
                      {v.version} {v.stable ? '' : '(beta)'}
                    </option>
                  ))}
                </select>
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
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-all ${
            hasChanges && !isApplying
              ? 'bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] hover:from-[var(--accent-from)] hover:to-[var(--accent-to)] text-[var(--text-on-accent)] shadow-md shadow-black/30'
              : 'bg-[var(--surface-3)] text-[var(--text-muted)] cursor-not-allowed'
          }`}
        >
          {isApplying ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
