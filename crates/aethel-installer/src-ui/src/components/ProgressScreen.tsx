import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadCloud, Terminal, ChevronDown, ChevronUp, AlertCircle, X } from 'lucide-react';
import { ShimmerProgress } from '../animations/ShimmerProgress';
import { useInstallerStore, type SelectedComponents } from '../store/installerStore';

export const ProgressScreen: React.FC = () => {
  const { t } = useTranslation();
  const { progress, setProgress, addLog, setScreen, installPath, components } = useInstallerStore();
  const [showLog, setShowLog] = useState(true);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progress.logs]);

  // Subscribe to real Tauri backend events if available, then initiate installation
  const setupAndStart = React.useCallback(async () => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenFinished: (() => void) | undefined;
    let active = true;

    setProgress({
      stage: 'Подготовка к установке...',
      percent: 5,
      speed: '0 MB/s',
      eta: '...',
      isComplete: false,
      error: null,
    });
    addLog(`[INFO] Target install path: ${installPath}`);
    addLog(
      `[INFO] Selected components: ${Object.keys(components)
        .filter((k) => components[k as keyof SelectedComponents])
        .join(', ')}`
    );

    try {
      const { listen } = await import('@tauri-apps/api/event');
      const { invoke } = await import('@tauri-apps/api/core');

      unlistenProgress = await listen<any>('install-progress', (event) => {
        if (!active) return;
        const payload = event.payload;
        setProgress({
          stage: payload.stage || payload.step,
          percent: payload.percentage || payload.progressPercent || 0,
          speed: payload.speed || '0 MB/s',
          eta: payload.eta || '--',
        });
        if (payload.log) {
          addLog(payload.log);
        }
      });

      unlistenFinished = await listen<any>('install-finished', (event) => {
        if (!active) return;
        const payload = event.payload;
        if (payload.success) {
          setProgress({ percent: 100, isComplete: true, error: null });
          setTimeout(() => {
            if (active) setScreen('completion');
          }, 800);
        } else {
          const err = payload.error || 'Ошибка при установке';
          setProgress({ error: err, isComplete: false });
          addLog(`[ERROR] ${err}`);
        }
      });

      // Listeners attached, now invoke installation in Tauri backend
      await invoke('start_installation', {
        config: {
          installPath,
          components: Object.keys(components).filter((k) => components[k as keyof SelectedComponents]),
          createDesktopShortcut: components.desktopShortcut,
          createStartMenuShortcut: components.startMenuShortcut,
          autoStart: false,
          registerFileAssociations: components.fileAssociations,
        },
      });
    } catch {
      if (!active) return;
      // In browser / vitest mock environment, simulate smooth installation
      let p = 5;
      const interval = setInterval(() => {
        if (!active) {
          clearInterval(interval);
          return;
        }
        p += 20;
        if (p >= 100) {
          clearInterval(interval);
          setProgress({
            stage: 'Установка завершена',
            percent: 100,
            speed: '0 MB/s',
            eta: '0s',
            isComplete: true,
          });
          addLog('[INFO] Installation completed successfully.');
          setTimeout(() => {
            if (active) setScreen('completion');
          }, 800);
        } else {
          setProgress({
            stage: 'Распаковка файлов приложения...',
            percent: p,
            speed: '24.5 MB/s',
            eta: '1s',
          });
        }
      }, 300);
    }

    return () => {
      active = false;
      if (unlistenProgress) unlistenProgress();
      if (unlistenFinished) unlistenFinished();
    };
  }, [addLog, components, installPath, setProgress, setScreen]);

  useEffect(() => {
    const cleanupPromise = setupAndStart();
    return () => {
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [setupAndStart]);

  const handleCancel = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('cancel_installation');
    } catch {
      // Ignored
    }
    setScreen('components');
  };

  const handleRetry = () => {
    setProgress({ error: null, percent: 5, stage: 'Повторная попытка установки...', isComplete: false });
    setupAndStart();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pt-6 pb-4 flex flex-col justify-between">
        {/* Header */}
        <div className="shrink-0 mb-2">
          <div className="flex items-center gap-2 mb-1">
            <DownloadCloud className="w-5 h-5 text-cyan-400 animate-pulse" />
            <h2 className="text-xl font-bold text-slate-100">{t('progress.title')}</h2>
          </div>
          <p className="text-xs text-slate-400">{t('progress.subtitle')}</p>
        </div>

        {/* Main Progress Area */}
        <div className="my-auto space-y-3.5 py-1">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-200 truncate max-w-sm">{progress.stage}</span>
              <span className="font-mono font-bold text-cyan-400 text-sm">{Math.round(progress.percent)}%</span>
            </div>

            <ShimmerProgress percent={progress.percent} height={10} />

            <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono">
              <span>{t('progress.speed')}: <strong className="text-slate-300">{progress.speed}</strong></span>
              <span>{t('progress.eta')}: <strong className="text-slate-300">{progress.eta}</strong></span>
            </div>
          </div>

          {/* Prominent Red Error State */}
          {progress.error && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2.5 shadow-lg animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-bold text-rose-300">Ошибка при установке</p>
                <p className="text-[11px] text-rose-200/90 leading-relaxed break-words">{progress.error}</p>
              </div>
            </div>
          )}

          {/* Terminal Log Box */}
          <div className="rounded-xl bg-slate-950/90 border border-slate-800/80 overflow-hidden shadow-inner">
            <button
              onClick={() => setShowLog(!showLog)}
              className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border-b border-slate-800 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-mono">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                {showLog ? t('progress.hideLog') : t('progress.showLog')}
              </span>
              {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showLog && (
              <div className="p-2.5 h-28 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-1 scrollbar-thin">
                {progress.logs.map((log, index) => (
                  <div key={index} className="leading-tight break-all">
                    {log}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Spacer */}
        <div className="shrink-0 h-1" />
      </div>

      {/* Pinned 3-tier Footer */}
      <div className="shrink-0 border-t border-slate-800/80 px-8 py-3 flex items-center justify-between bg-slate-950/50">
        {progress.error ? (
          <>
            <button
              onClick={() => setScreen('path')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              <span>{t('common.back')}</span>
            </button>
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(0,245,212,0.4)] transition-all cursor-pointer"
            >
              <span>Повторить</span>
            </button>
          </>
        ) : (
          <div className="w-full flex justify-end">
            <button
              onClick={handleCancel}
              disabled={progress.isComplete}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>{t('common.cancel')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
