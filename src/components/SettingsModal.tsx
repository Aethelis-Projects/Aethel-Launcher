import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Cpu,
  HardDrive,
  RefreshCw,
  Sparkles,
  Loader2,
  CheckCircle2,
  Download,
  Trash2,
  Settings2,
} from 'lucide-react';
import {
  useSettingsStore,
  type GcPreset,
  type JavaMode,
  type PreferredJavaProvider,
} from '../store/settingsStore';
import { useUpdateStore } from '../store/updateStore';
import { commands, type JavaInfo, type InstalledRuntime } from '../bindings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const {
    minRamMb,
    maxRamMb,
    gcPreset,
    javaPath,
    javaMode,
    preferredProvider,
    updateChannel,
    setMinRamMb,
    setMaxRamMb,
    setGcPreset,
    setJavaPath,
    setJavaMode,
    setPreferredProvider,
    setUpdateChannel,
  } = useSettingsStore();

  const { checkForUpdates } = useUpdateStore();

  const [detectedJavas, setDetectedJavas] = useState<JavaInfo[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  const [installedRuntimes, setInstalledRuntimes] = useState<InstalledRuntime[]>([]);
  const [downloadingMajor, setDownloadingMajor] = useState<number | null>(null);
  const [deletingMajor, setDeletingMajor] = useState<number | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const refreshInstalledRuntimes = useCallback(async () => {
    try {
      const res = await commands.getInstalledRuntimes();
      if (res.status === 'ok') {
        setInstalledRuntimes(res.data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshInstalledRuntimes();
    }
  }, [isOpen, refreshInstalledRuntimes]);

  if (!isOpen) return null;

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      const info = await checkForUpdates(updateChannel, true);
      if (info) {
        setUpdateStatus(`${t('update.available')}: ${info.version}`);
      } else {
        setUpdateStatus(t('update.upToDate'));
      }
    } catch {
      setUpdateStatus(t('update.upToDate'));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleDetectJava = async () => {
    setIsDetecting(true);
    setDetectError(null);
    try {
      const res = await commands.detectSystemJava();
      if (res.status === 'ok') {
        setDetectedJavas(res.data);
        if (res.data.length > 0 && (!javaPath || javaPath === 'javaw.exe')) {
          setJavaPath(res.data[0].path);
        }
      } else {
        setDetectError(res.error);
      }
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDetecting(false);
    }
  };

  const handleDownloadRuntime = async (major: number) => {
    setDownloadingMajor(major);
    setRuntimeError(null);
    try {
      const res = await commands.downloadRuntime(major, preferredProvider);
      if (res.status === 'ok') {
        await refreshInstalledRuntimes();
      } else {
        setRuntimeError(res.error);
      }
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingMajor(null);
    }
  };

  const handleDeleteRuntime = async (major: number) => {
    setDeletingMajor(major);
    setRuntimeError(null);
    try {
      const res = await commands.deleteRuntime(major);
      if (res.status === 'ok') {
        await refreshInstalledRuntimes();
      } else {
        setRuntimeError(res.error);
      }
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingMajor(null);
    }
  };

  const RUNTIME_SPECS = [
    {
      major: 21,
      title: 'Java 21 (LTS)',
      desc: t('settings.java21Desc', 'For Minecraft 1.20.5+, 1.21+, 26.x and snapshots'),
    },
    {
      major: 17,
      title: 'Java 17 (LTS)',
      desc: t('settings.java17Desc', 'For Minecraft 1.18 — 1.20.4'),
    },
    {
      major: 8,
      title: 'Java 8 (Legacy)',
      desc: t('settings.java8Desc', 'For Minecraft 1.7.10 — 1.16.5 (Legacy)'),
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <h3 className="font-bold text-zinc-100 text-base">{t('settings.title')}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Memory Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span>{t('settings.memory')}</span>
            </div>

            {/* Min RAM Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">{t('settings.minRam')}</span>
                <span className="font-mono text-cyan-400 font-semibold">
                  {minRamMb} {t('settings.mb')}
                </span>
              </div>
              <input
                type="range"
                min="512"
                max="8192"
                step="256"
                value={minRamMb}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setMinRamMb(val);
                  if (val > maxRamMb) setMaxRamMb(val);
                }}
                className="w-full accent-cyan-500 bg-zinc-800 rounded-lg cursor-pointer h-1.5"
              />
            </div>

            {/* Max RAM Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">{t('settings.maxRam')}</span>
                <span className="font-mono text-indigo-400 font-semibold">
                  {maxRamMb} {t('settings.mb')}
                </span>
              </div>
              <input
                type="range"
                min="1024"
                max="16384"
                step="512"
                value={maxRamMb}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setMaxRamMb(val);
                  if (val < minRamMb) setMinRamMb(val);
                }}
                className="w-full accent-indigo-500 bg-zinc-800 rounded-lg cursor-pointer h-1.5"
              />
            </div>
          </div>

          {/* Java & Runtime Section */}
          <div className="space-y-4 pt-4 border-t border-zinc-800/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span>{t('settings.java')}</span>
              </div>

              {/* Mode Toggle Buttons */}
              <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800 text-xs">
                <button
                  type="button"
                  onClick={() => setJavaMode('auto')}
                  className={`px-3 py-1 rounded-md transition-all font-medium ${
                    javaMode === 'auto'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t('settings.javaModeAuto', 'Auto (Recommended)')}
                </button>
                <button
                  type="button"
                  onClick={() => setJavaMode('manual')}
                  className={`px-3 py-1 rounded-md transition-all font-medium ${
                    javaMode === 'manual'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t('settings.javaModeManual', 'Manual Path')}
                </button>
              </div>
            </div>

            {runtimeError && (
              <p className="text-xs text-red-400 bg-red-950/40 p-2.5 rounded-lg border border-red-800/60">
                {runtimeError}
              </p>
            )}

            {/* Mode A: Automatic Smart Provisioning */}
            {javaMode === 'auto' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/60">
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block">
                      {t('settings.javaProvider', 'Preferred Java Vendor')}
                    </label>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Distributor used for auto-downloading JRE runtimes
                    </p>
                  </div>
                  <select
                    value={preferredProvider}
                    onChange={(e) => setPreferredProvider(e.target.value as PreferredJavaProvider)}
                    className="px-3 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Adoptium">Eclipse Adoptium (Temurin)</option>
                    <option value="Zulu">Azul Zulu</option>
                  </select>
                </div>

                {/* Java Runtimes Manager Cards */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                    <span>{t('settings.runtimesTitle', 'Managed Java Runtimes')}</span>
                    <button
                      onClick={refreshInstalledRuntimes}
                      className="hover:text-cyan-400 transition-colors flex items-center gap-1 text-[11px]"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>{t('settings.autoDetect', 'Refresh')}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {RUNTIME_SPECS.map((spec) => {
                      const installed = installedRuntimes.find((r) => r.major === spec.major);
                      const isDownloading = downloadingMajor === spec.major;
                      const isDeleting = deletingMajor === spec.major;

                      return (
                        <div
                          key={spec.major}
                          className="p-3 bg-zinc-900/80 border border-zinc-800/80 rounded-xl flex items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-zinc-200">
                                {spec.title}
                              </span>
                              {installed ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>
                                    {t('settings.runtimeInstalled', 'Installed')} ({installed.provider})
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                                  {t('settings.runtimeNotInstalled', 'Not Installed')}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-400 truncate">{spec.desc}</p>
                            {installed && (
                              <p className="text-[10px] font-mono text-zinc-500 truncate" title={installed.path}>
                                {installed.path}
                              </p>
                            )}
                          </div>

                          <div className="shrink-0">
                            {installed ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteRuntime(spec.major)}
                                disabled={isDeleting}
                                className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/40 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                              >
                                {isDeleting ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                                <span>{t('settings.deleteRuntime', 'Delete')}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDownloadRuntime(spec.major)}
                                disabled={isDownloading}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {isDownloading ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>{t('settings.downloadingRuntime', 'Downloading...')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3 h-3" />
                                    <span>{t('settings.downloadRuntime', 'Download')}</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* Mode B: Manual Java Path Configuration */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-400">{t('settings.javaPath')}</label>
                  <button
                    onClick={handleDetectJava}
                    disabled={isDetecting}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-cyan-400 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isDetecting ? 'animate-spin' : ''}`} />
                    <span>{t('settings.autoDetect', 'Detect Java')}</span>
                  </button>
                </div>

                {detectedJavas.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">
                      {t('settings.detectedJava', 'System Detected Runtimes')}
                    </label>
                    <select
                      value={javaPath}
                      onChange={(e) => setJavaPath(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                    >
                      {detectedJavas.map((j) => (
                        <option key={j.path} value={j.path}>
                          Java {j.major} ({j.version}) - {j.vendor || 'System'} [{j.arch}]
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {detectError && <p className="text-xs text-red-400">{detectError}</p>}

                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={javaPath}
                    onChange={(e) => setJavaPath(e.target.value)}
                    placeholder={t('settings.javaPathPlaceholder')}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}

            {/* GC Preset */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs text-zinc-400">{t('settings.gcPreset')}</label>
              <select
                value={gcPreset}
                onChange={(e) => setGcPreset(e.target.value as GcPreset)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="G1GC">{t('settings.gcG1GC', 'G1GC (Recommended, Stable)')}</option>
                <option value="ZGC">{t('settings.gcZGC', 'ZGC (Ultra Low Pause, Java 15+)')}</option>
                <option value="GenerationalZGC">
                  {t('settings.gcGenerationalZGC', 'Generational ZGC (High Throughput, Java 21+)')}
                </option>
                <option value="Parallel">{t('settings.gcParallel', 'Parallel GC (Low Overhead)')}</option>
              </select>
            </div>
          </div>

          {/* Application Updates Section */}
          <div className="space-y-4 pt-4 border-t border-zinc-800/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>{t('update.title')}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">{t('update.channel')}</label>
                <select
                  value={updateChannel}
                  onChange={(e) => setUpdateChannel(e.target.value as 'stable' | 'beta')}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="stable">{t('update.stable')}</option>
                  <option value="beta">{t('update.beta')}</option>
                </select>
              </div>

              <div className="space-y-1.5 flex flex-col justify-end">
                <button
                  type="button"
                  data-testid="manual-update-check-btn"
                  onClick={handleCheckForUpdates}
                  disabled={isCheckingUpdate}
                  className="w-full py-2 px-3 rounded-lg text-xs font-medium text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isCheckingUpdate ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      <span>{t('update.checking')}</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{t('update.checkForUpdates')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {updateStatus && (
              <div
                data-testid="update-status-msg"
                className="p-2.5 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs flex items-center gap-2 text-zinc-300"
              >
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{updateStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/80 flex justify-end bg-zinc-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-xs font-medium transition-colors"
          >
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
