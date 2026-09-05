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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                {t('instances.createModalTitle', 'Создание нового инстанса')}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t('instances.createModalDesc', 'Настройте версию Minecraft, модификации и память')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-xl flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Instance Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">
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
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Minecraft Version Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300">
                {t('instances.gameVersionLabel', 'Версия Minecraft')}
              </label>
              <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 p-0.5 rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => setVersionTypeFilter('release')}
                  className={`px-2 py-0.5 rounded ${
                    versionTypeFilter === 'release'
                      ? 'bg-zinc-800 text-cyan-400 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t('instances.filterReleases', 'Релизы')}
                </button>
                <button
                  type="button"
                  onClick={() => setVersionTypeFilter('snapshot')}
                  className={`px-2 py-0.5 rounded ${
                    versionTypeFilter === 'snapshot'
                      ? 'bg-zinc-800 text-cyan-400 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t('instances.filterSnapshots', 'Снапшоты')}
                </button>
                <button
                  type="button"
                  onClick={() => setVersionTypeFilter('all')}
                  className={`px-2 py-0.5 rounded ${
                    versionTypeFilter === 'all'
                      ? 'bg-zinc-800 text-cyan-400 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Все
                </button>
              </div>
            </div>

            {/* Version search input */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={versionSearch}
                onChange={(e) => setVersionSearch(e.target.value)}
                placeholder={t('instances.searchVersionPlaceholder', 'Поиск версии...')}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Versions scroll container */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-h-36 overflow-y-auto divide-y divide-zinc-800/60 p-1">
              {isLoadingVersions ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
                  <span>{t('instances.loadingVersions', 'Загрузка версий...')}</span>
                </div>
              ) : filteredVersions.length === 0 ? (
                <div className="py-6 text-center text-zinc-500 text-xs">
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
                          ? 'bg-cyan-950/50 border border-cyan-800/80 text-cyan-200 font-medium'
                          : 'hover:bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono">{ver.id}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded border ${
                            ver.version_type === 'release'
                              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                              : 'bg-amber-950/60 border-amber-800/60 text-amber-400'
                          }`}
                        >
                          {ver.version_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-500">
                          {ver.release_time ? ver.release_time.split('T')[0] : ''}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Modloader Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
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
                        ? 'bg-cyan-950/60 border-cyan-700 text-cyan-300 shadow-sm shadow-cyan-950'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
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
                <label className="text-[11px] text-zinc-400">
                  {t('instances.loaderVersionLabel', 'Версия загрузчика')}
                </label>
                {isLoadingLoaders ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-500" />
                    <span>Загрузка версий {selectedLoader}...</span>
                  </div>
                ) : (
                  <select
                    value={selectedLoaderVersion}
                    onChange={(e) => setSelectedLoaderVersion(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500"
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
          <div className="p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-2 cursor-pointer">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span>{t('instances.ramOverrideLabel', 'Переопределить RAM для этого инстанса')}</span>
              </label>
              <input
                type="checkbox"
                checked={ramOverride}
                onChange={(e) => setRamOverride(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-cyan-600 focus:ring-cyan-500"
              />
            </div>

            {ramOverride && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Выделение оперативной памяти:</span>
                  <span className="font-mono text-cyan-400 font-semibold">
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
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>1 ГБ</span>
                  <span>4 ГБ</span>
                  <span>8 ГБ</span>
                  <span>16 ГБ</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-xl transition-colors"
            >
              {t('instances.cancel', 'Отмена')}
            </button>
            <button
              type="submit"
              data-testid="submit-create-instance-btn"
              disabled={isSubmitting || !name.trim() || !selectedVersion}
              className="px-5 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-cyan-950 flex items-center gap-2"
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
