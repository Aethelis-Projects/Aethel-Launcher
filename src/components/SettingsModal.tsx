import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Cpu, HardDrive } from 'lucide-react';
import { useSettingsStore, type GcPreset } from '../store/settingsStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { minRamMb, maxRamMb, gcPreset, javaPath, setMinRamMb, setMaxRamMb, setGcPreset, setJavaPath } =
    useSettingsStore();

  if (!isOpen) return null;

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
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>{t('settings.java')}</span>
            </div>

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
                <option value="G1GC">{t('settings.gcG1GC')}</option>
                <option value="ZGC">{t('settings.gcZGC')}</option>
                <option value="Parallel">{t('settings.gcParallel')}</option>
              </select>
            </div>
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
