import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Layers, Cpu, Monitor, DownloadCloud } from 'lucide-react';
import { useInstallerStore, type SelectedComponents } from '../store/installerStore';

export const ComponentsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { setScreen, components, toggleComponent, getTotalDownloadSizeBytes } = useInstallerStore();

  const totalMB = (getTotalDownloadSizeBytes() / (1024 * 1024)).toFixed(0);

  const handleStartInstall = () => {
    setScreen('progress');
  };

  return (
    <div className="flex h-full flex-col">
      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pt-6 pb-4 flex flex-col justify-between">
        {/* Header */}
        <div className="shrink-0 mb-2">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-slate-100">{t('components.title')}</h2>
          </div>
          <p className="text-xs text-slate-400">{t('components.subtitle')}</p>
        </div>

        {/* Components List */}
        <div className="my-auto space-y-2.5 py-1">
          {/* Core Launcher */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">{t('components.launcher')}</p>
                <p className="text-[10px] text-slate-400">{t('components.launcherDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-slate-400">~120 MB</span>
              <span className="text-[10px] uppercase font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/20">
                Обязательно
              </span>
            </div>
          </div>

          {/* Java 21 */}
          <div
            onClick={() => toggleComponent('java21')}
            className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
              components.java21 ? 'bg-slate-900/60 border-cyan-500/30' : 'bg-slate-950/40 border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-cyan-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">{t('components.java21')}</p>
                <p className="text-[10px] text-slate-400">{t('components.java21Desc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-slate-400">~190 MB</span>
              <input
                type="checkbox"
                checked={components.java21}
                onChange={() => {}}
                className="w-4 h-4 rounded text-cyan-500 accent-cyan-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Shortcuts & Associations */}
          <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/70 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Monitor className="w-3.5 h-3.5 text-cyan-400" />
              <span>Интеграция с системой</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pl-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={components.desktopShortcut}
                  onChange={() => toggleComponent('desktopShortcut')}
                  className="w-3.5 h-3.5 rounded text-cyan-500 accent-cyan-500 cursor-pointer"
                />
                <span>{t('components.desktopShortcut')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={components.startMenuShortcut}
                  onChange={() => toggleComponent('startMenuShortcut')}
                  className="w-3.5 h-3.5 rounded text-cyan-500 accent-cyan-500 cursor-pointer"
                />
                <span>{t('components.startMenuShortcut')}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="shrink-0 h-1" />
      </div>

      {/* Pinned 3-tier Footer */}
      <div className="shrink-0 border-t border-slate-800/80 px-8 py-3 flex items-center justify-between bg-slate-950/50">
        <button
          onClick={() => setScreen('path')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('common.back')}</span>
        </button>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">{t('components.totalSize')}</p>
            <p className="text-xs font-mono font-bold text-cyan-400">~{totalMB} MB</p>
          </div>

          <button
            onClick={handleStartInstall}
            className="flex items-center gap-1.5 px-6 py-2 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-[0_0_20px_rgba(0,245,212,0.4)] transition-all transform active:scale-95 cursor-pointer"
          >
            <DownloadCloud className="w-4 h-4" />
            <span>Установить</span>
          </button>
        </div>
      </div>
    </div>
  );
};
