import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Search,
  Loader2,
  AlertCircle,
  Box,
  Cpu,
  Layers,
  Check,
  CheckCircle2,
} from 'lucide-react';
import {
  commands,
  type Instance,
  type MinecraftVersionEntry,
  type ModloaderVersion,
} from '../bindings';
import { useInstanceStore } from '../store/instanceStore';

interface CreateInstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (instance: Instance) => void;
}

const LOADERS = [
  { id: 'Vanilla', label: 'Vanilla' },
  { id: 'Fabric', label: 'Fabric' },
  { id: 'NeoForge', label: 'NeoForge' },
  { id: 'Quilt', label: 'Quilt' },
  { id: 'Forge', label: 'Forge' },
] as const;

export const CreateInstanceModal: React.FC<CreateInstanceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { fetchInstances } = useInstanceStore();

  const [name, setName] = useState('Minecraft 1.20.4');
  const [isNameCustom, setIsNameCustom] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('1.20.4');
  const [selectedLoader, setSelectedLoader] = useState<string>('Vanilla');
  const [selectedLoaderVersion, setSelectedLoaderVersion] = useState<string>('');

  const [mcVersions, setMcVersions] = useState<MinecraftVersionEntry[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [versionSearch, setVersionSearch] = useState('');
  const [versionTypeFilter, setVersionTypeFilter] = useState<'all' | 'release' | 'snapshot'>('release');

  const [loaderVersions, setLoaderVersions] = useState<ModloaderVersion[]>([]);
  const [isLoadingLoaders, setIsLoadingLoaders] = useState(false);

  const [ramOverride, setRamOverride] = useState(false);
  const [ramMb, setRamMb] = useState(4096);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Minecraft versions when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingVersions(true);
    setError(null);

    commands
      .getMinecraftVersions()
      .then((res) => {
        if (!isMounted) return;
        if (res.status === 'ok') {
          setMcVersions(res.data);
        } else {
          setError(res.error);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (isMounted) setIsLoadingVersions(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Update loader versions when loader or game version changes
  useEffect(() => {
    if (!isOpen || selectedLoader === 'Vanilla' || !selectedVersion) {
      setLoaderVersions([]);
      setSelectedLoaderVersion('');
      return;
    }

    let isMounted = true;
    setIsLoadingLoaders(true);

    commands
      .getModloaderVersions(selectedLoader, selectedVersion)
      .then((res) => {
        if (!isMounted) return;
        if (res.status === 'ok') {
          setLoaderVersions(res.data);
          const stable = res.data.find((v) => v.stable) || res.data[0];
          setSelectedLoaderVersion(stable ? stable.version : '');
        } else {
          setLoaderVersions([]);
          setSelectedLoaderVersion('');
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoaderVersions([]);
          setSelectedLoaderVersion('');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingLoaders(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedLoader, selectedVersion]);

  const handleVersionSelect = (verId: string) => {
    setSelectedVersion(verId);
    if (!isNameCustom) {
      setName(`Minecraft ${verId}`);
    }
  };

  const filteredVersions = useMemo(() => {
    return mcVersions.filter((v) => {
      if (versionTypeFilter !== 'all' && v.version_type !== versionTypeFilter) {
        return false;
      }
      if (versionSearch.trim()) {
        return v.id.toLowerCase().includes(versionSearch.toLowerCase().trim());
      }
      return true;
    });
  }, [mcVersions, versionTypeFilter, versionSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('instances.nameRequired', 'Instance name is required'));
      return;
    }
    if (!selectedVersion) {
      setError(t('instances.versionRequired', 'Game version is required'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await commands.createInstance(
        name.trim(),
        selectedVersion,
        selectedLoader,
        selectedLoader === 'Vanilla' ? null : (selectedLoaderVersion || null),
        ramOverride ? ramMb : null
      );

      if (res.status === 'ok') {
        await fetchInstances();
        if (onSuccess) {
          onSuccess(res.data);
        }
        onClose();
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 backdrop-blur-md p-4 overflow-y-auto">
      <div
        className="bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-[var(--radius-lg)] w-full max-w-xl overflow-hidden shadow-2xl shadow-black/40 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[var(--line-subtle)] flex items-center justify-between bg-[var(--surface-1)]/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--accent-line)] flex items-center justify-center text-[var(--accent-from)]">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {t('instances.createModalTitle', 'Создание нового инстанса')}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {t('instances.createModalDesc', 'Настройте версию Minecraft, модификации и память')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] rounded-[var(--radius-sm)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 bg-[var(--danger-soft)] border border-[var(--danger)]/50 rounded-[var(--radius-md)] flex items-start gap-2.5 text-xs text-[var(--text-primary)]">
              <AlertCircle className="w-4 h-4 text-[var(--danger)] mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Instance Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">
              {t('instances.instanceNameLabel', 'Название инстанса')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setIsNameCustom(true);
              }}
              placeholder={t('instances.instanceNamePlaceholder', 'Minecraft 1.20.4')}
              className="w-full bg-[var(--surface-1)] border border-[var(--line-subtle)] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-from)] transition-colors"
            />
          </div>

          {/* Minecraft Version Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                {t('instances.gameVersionLabel', 'Версия Minecraft')}
              </label>
              <div className="flex items-center gap-1 bg-[var(--surface-1)] border border-[var(--line-subtle)] p-0.5 rounded-[var(--radius-sm)] text-[11px]">
                <button
                  type="button"
                  onClick={() => setVersionTypeFilter('release')}
                  className={`px-2 py-0.5 rounded ${
                    versionTypeFilter === 'release'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-from)] font-semibold shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t('instances.filterReleases', 'Релизы')}
                </button>
                <button
                  type="button"
                  onClick={() => setVersionTypeFilter('snapshot')}
                  className={`px-2 py-0.5 rounded ${
                    versionTypeFilter === 'snapshot'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-from)] font-semibold shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t('instances.filterSnapshots', 'Снапшоты')}
                </button>
                <button
                  type="button"
                  onClick={() => setVersionTypeFilter('all')}
                  className={`px-2 py-0.5 rounded ${
                    versionTypeFilter === 'all'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-from)] font-semibold shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Все
                </button>
              </div>
            </div>

            {/* Version search input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={versionSearch}
                onChange={(e) => setVersionSearch(e.target.value)}
                placeholder={t('instances.searchVersionPlaceholder', 'Поиск версии...')}
                className="w-full bg-[var(--surface-1)] border border-[var(--line-subtle)] rounded-[var(--radius-md)] pl-9 pr-3.5 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-from)]"
              />
            </div>

            {/* Versions scroll container */}
            <div className="bg-[var(--surface-1)] border border-[var(--line-subtle)] rounded-[var(--radius-md)] max-h-36 overflow-y-auto divide-y divide-[var(--line-subtle)] p-1">
              {isLoadingVersions ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-from)]" />
                  <span>{t('instances.loadingVersions', 'Загрузка версий...')}</span>
                </div>
              ) : filteredVersions.length === 0 ? (
                <div className="py-6 text-center text-[var(--text-muted)] text-xs">
                  Версии не найдены
                </div>
              ) : (
                filteredVersions.map((ver) => {
                  const isSelected = selectedVersion === ver.id;
                  return (
                    <button
                      key={ver.id}
                      type="button"
                      onClick={() => handleVersionSelect(ver.id)}
                      className={`w-full px-3 py-2 text-left rounded-lg flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--text-primary)] font-medium'
                          : 'hover:bg-[var(--surface-3)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono">{ver.id}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded border ${
                            ver.version_type === 'release'
                          ? 'bg-[var(--success-soft)] border-[var(--success)]/40 text-[var(--success)]'
                              : 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent-from)]'
                          }`}
                        >
                          {ver.version_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {ver.release_time ? ver.release_time.split('T')[0] : ''}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[var(--accent-from)]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Modloader Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[var(--accent-from)]" />
              <span>{t('instances.loaderLabel', 'Загрузчик модов')}</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              {LOADERS.map((ldr) => {
                const isSelected = selectedLoader === ldr.id;
                return (
                  <button
                    key={ldr.id}
                    type="button"
                    onClick={() => setSelectedLoader(ldr.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-center transition-all ${
                      isSelected
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--text-primary)] shadow-[var(--shadow-glow)]'
                        : 'bg-[var(--surface-1)] border-[var(--line-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--line-strong)]'
                    }`}
                  >
                    {ldr.label}
                  </button>
                );
              })}
            </div>

            {/* Loader Version dropdown (if not Vanilla) */}
            {selectedLoader !== 'Vanilla' && (
              <div className="pt-2 space-y-1.5">
                <label className="text-[11px] text-[var(--text-secondary)]">
                  {t('instances.loaderVersionLabel', 'Версия загрузчика')}
                </label>
                {isLoadingLoaders ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-from)]" />
                    <span>Загрузка версий {selectedLoader}...</span>
                  </div>
                ) : (
                  <select
                    value={selectedLoaderVersion}
                    onChange={(e) => setSelectedLoaderVersion(e.target.value)}
                    className="w-full bg-[var(--surface-1)] border border-[var(--line-subtle)] rounded-[var(--radius-md)] px-3.5 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-from)]"
                  >
                    {loaderVersions.length === 0 ? (
                      <option value="">Последняя стабильная (авто)</option>
                    ) : (
                      loaderVersions.map((lv) => (
                        <option key={lv.version} value={lv.version}>
                          {lv.version} {lv.stable ? '(stable)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* RAM Override Section */}
          <div className="p-4 bg-[var(--surface-1)]/80 border border-[var(--line-subtle)] rounded-[var(--radius-md)] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer">
                <Cpu className="w-4 h-4 text-[var(--accent-from)]" />
                <span>{t('instances.ramOverrideLabel', 'Переопределить RAM для этого инстанса')}</span>
              </label>
              <input
                type="checkbox"
                checked={ramOverride}
                onChange={(e) => setRamOverride(e.target.checked)}
                className="w-4 h-4 rounded bg-[var(--surface-3)] border-[var(--line-strong)] text-[var(--accent-from)] focus:ring-[var(--accent-from)]"
              />
            </div>

            {ramOverride && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Выделение оперативной памяти:</span>
                  <span className="font-mono text-[var(--accent-from)] font-semibold">
                    {ramMb} МБ ({(ramMb / 1024).toFixed(1)} ГБ)
                  </span>
                </div>
                <input
                  type="range"
                  min={1024}
                  max={16384}
                  step={512}
                  value={ramMb}
                  onChange={(e) => setRamMb(Number(e.target.value))}
                  className="w-full h-1.5 bg-[var(--surface-3)] rounded-[var(--radius-sm)] appearance-none cursor-pointer accent-[var(--accent-from)]"
                />
                <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                  <span>1 ГБ</span>
                  <span>4 ГБ</span>
                  <span>8 ГБ</span>
                  <span>16 ГБ</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[var(--line-subtle)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] rounded-[var(--radius-md)] transition-colors"
            >
              {t('instances.cancel', 'Отмена')}
            </button>
            <button
              type="submit"
              data-testid="submit-create-instance-btn"
              disabled={isSubmitting || !name.trim() || !selectedVersion}
              className="px-5 py-2 text-xs font-semibold text-[var(--text-on-accent)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] disabled:opacity-50 disabled:cursor-not-allowed rounded-[var(--radius-md)] transition-all shadow-[var(--shadow-glow)] flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('instances.creating', 'Создание...')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t('instances.createButton', 'Создать инстанс')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
