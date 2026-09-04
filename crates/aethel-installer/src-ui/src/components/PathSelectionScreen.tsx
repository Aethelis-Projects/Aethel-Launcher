import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Folder, HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';
import { useInstallerStore } from '../store/installerStore';

export const PathSelectionScreen: React.FC = () => {
  const { t } = useTranslation();
  const {
    setScreen,
    installPath,
    setInstallPath,
    autoCreateFolder,
    setAutoCreateFolder,
    freeSpaceBytes,
    getTotalDownloadSizeBytes,
  } = useInstallerStore();

  const [pathError, setPathError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!installPath) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke<string>('get_default_install_path').then((p) => {
          if (p) setInstallPath(p);
        }).catch(() => {});
      }).catch(() => {});
    }
  }, [installPath, setInstallPath]);

  const requiredBytes = Math.max(500 * 1024 * 1024, getTotalDownloadSizeBytes() * 2); // 500MB min or 2x download for extraction
  const freeGB = (freeSpaceBytes / (1024 * 1024 * 1024)).toFixed(1);
  const requiredMB = (requiredBytes / (1024 * 1024)).toFixed(0);
  const hasEnoughSpace = freeSpaceBytes >= requiredBytes;

  const handleBrowse = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const selected = await invoke<string | null>('select_install_folder');
      if (selected) {
        setInstallPath(selected);
        setPathError(null);
      }
    } catch {
      // Fallback for dev mode
    }
  };

  const handleNext = () => {
    if (!installPath.trim()) {
      setPathError('Укажите путь для установки');
      return;
    }
    setScreen('components');
  };

  return (
    <div className="flex flex-col justify-between h-full p-8 relative z-10 select-none">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Folder className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-bold text-slate-100">{t('path.title')}</h2>
        </div>
        <p className="text-xs text-slate-400">{t('path.subtitle')}</p>
      </div>

      {/* Main Path Selection Card */}
      <div className="space-y-5 my-auto">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Каталог назначения</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={installPath}
              onChange={(e) => {
                setInstallPath(e.target.value);
                setPathError(null);
              }}
              className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 focus:border-cyan-500 text-xs font-mono text-slate-200 outline-none transition-colors"
            />
            <button
              onClick={handleBrowse}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            >
              {t('common.browse')}
            </button>
          </div>
          {pathError && (
            <p className="text-[11px] text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span>{pathError}</span>
            </p>
          )}
        </div>

        {/* Disk Space Overview */}
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span>{t('path.freeSpace')}:</span>
              <span className="font-semibold text-slate-100">{freeGB} GB</span>
            </div>
            <div className="flex items-center gap-1">
              {hasEnoughSpace ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Места достаточно</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Мало места на диске</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>{t('path.requiredSpace')}:</span>
            <span className="font-mono text-slate-200">~{requiredMB} MB</span>
          </div>
        </div>

        {/* Auto create folder */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCreateFolder}
            onChange={(e) => setAutoCreateFolder(e.target.checked)}
            className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 accent-cyan-500"
          />
          <span className="text-xs text-slate-300">{t('path.createFolder')}</span>
        </label>
      </div>

      {/* Footer Navigation */}
      <div className="w-full flex justify-between items-center pt-2 border-t border-slate-800/60">
        <button
          onClick={() => setScreen('license')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('common.back')}</span>
        </button>

        <button
          onClick={handleNext}
          disabled={!hasEnoughSpace}
          className={`flex items-center gap-1.5 px-6 py-2 rounded-xl font-bold text-xs transition-all ${
            hasEnoughSpace
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-[0_0_15px_rgba(0,245,212,0.4)] cursor-pointer'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/40'
          }`}
        >
          <span>{t('common.next')}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
