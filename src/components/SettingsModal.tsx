import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Cpu, HardDrive, RefreshCw, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { useSettingsStore, type GcPreset } from '../store/settingsStore';
import { commands, type JavaInfo } from '../bindings';

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
    updateChannel,
    setMinRamMb,
    setMaxRamMb,
    setGcPreset,
    setJavaPath,
    setUpdateChannel,
  } = useSettingsStore();

  const [detectedJavas, setDetectedJavas] = useState<JavaInfo[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      const res = await commands.checkForUpdates(updateChannel);
      if (res.status === 'ok' && res.data) {
        setUpdateStatus(`${t('update.available')}: ${res.data.version}`);
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col">
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
        <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
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
                <span className="font-mono text-cyan-400 font-semibold">{minRamMb} {t('settings.mb')}</span>
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
                <span className="font-mono text-indigo-400 font-semibold">{maxRamMb} {t('settings.mb')}</span>
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
              <button
                onClick={handleDetectJava}
                disabled={isDetecting}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-cyan-400 transition-colors disabled:opacity-50"
                title={t('settings.autoDetectJava', 'Auto-detect system Java runtimes')}
              >
                <RefreshCw className={`w-3 h-3 ${isDetecting ? 'animate-spin' : ''}`} />
                <span>{t('settings.autoDetect', 'Detect Java')}</span>
              </button>
            </div>

            {/* Detected Java Selector */}
            {detectedJavas.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">
                  {t('settings.detectedJava', 'Installed Java Runtimes')}
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

            {detectError && (
              <p className="text-xs text-red-400">{detectError}</p>
            )}

            {/* Java Path */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">{t('settings.javaPath')}</label>
              <input
                type="text"
                value={javaPath}
                onChange={(e) => setJavaPath(e.target.value)}
                placeholder={t('settings.javaPathPlaceholder')}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* GC Preset */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">{t('settings.gcPreset')}</label>
              <select
                value={gcPreset}
                onChange={(e) => setGcPreset(e.target.value as GcPreset)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="G1GC">{t('settings.gcG1GC', 'G1GC (Recommended, Stable)')}</option>
                <option value="ZGC">{t('settings.gcZGC', 'ZGC (Ultra Low Pause, Java 15+)')}</option>
                <option value="GenerationalZGC">{t('settings.gcGenerationalZGC', 'Generational ZGC (High Throughput, Java 21+)')}</option>
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
