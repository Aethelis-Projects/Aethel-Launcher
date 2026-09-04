import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadCloud, Terminal, ChevronDown, ChevronUp, AlertCircle, X } from 'lucide-react';
import { ShimmerProgress } from '../animations/ShimmerProgress';
import { useInstallerStore } from '../store/installerStore';

export const ProgressScreen: React.FC = () => {
  const { t } = useTranslation();
  const { progress, setProgress, addLog, setScreen } = useInstallerStore();
  const [showLog, setShowLog] = useState(true);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progress.logs]);

  // Subscribe to real Tauri backend events if available
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenFinished: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlistenProgress = await listen<any>('install-progress', (event) => {
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
          const payload = event.payload;
          if (payload.success) {
            setProgress({ percent: 100, isComplete: true });
            setTimeout(() => setScreen('completion'), 800);
          } else {
            setProgress({ error: payload.error || 'Ошибка при установке' });
          }
        });
      } catch {
        // In browser / test mock mode
      }
    };

    setupListeners();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenFinished) unlistenFinished();
    };
  }, []);

  const handleCancel = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('cancel_installation');
    } catch {
      // Ignored
    }
    setScreen('components');
  };

  return (
    <div className="flex flex-col justify-between h-full p-8 relative z-10 select-none">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <DownloadCloud className="w-5 h-5 text-cyan-400 animate-pulse" />
          <h2 className="text-xl font-bold text-slate-100">{t('progress.title')}</h2>
        </div>
        <p className="text-xs text-slate-400">{t('progress.subtitle')}</p>
      </div>

      {/* Main Progress Area */}
      <div className="my-auto space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-200 truncate max-w-sm">{progress.stage}</span>
            <span className="font-mono font-bold text-cyan-400 text-sm">{Math.round(progress.percent)}%</span>
          </div>

          <ShimmerProgress percent={progress.percent} height={12} />

          <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono">
            <span>{t('progress.speed')}: <strong className="text-slate-300">{progress.speed}</strong></span>
            <span>{t('progress.eta')}: <strong className="text-slate-300">{progress.eta}</strong></span>
          </div>
        </div>

        {/* Error Alert */}
        {progress.error && (
          <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{progress.error}</span>
          </div>
        )}

        {/* Terminal Log Box */}
        <div className="rounded-xl bg-slate-950/90 border border-slate-800/80 overflow-hidden shadow-inner">
          <button
            onClick={() => setShowLog(!showLog)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/60 border-b border-slate-800 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <span className="flex items-center gap-1.5 font-mono">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              {showLog ? t('progress.hideLog') : t('progress.showLog')}
            </span>
            {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showLog && (
            <div className="p-3 h-32 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-1 scrollbar-thin">
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

      {/* Footer / Cancel */}
      <div className="w-full flex justify-end items-center pt-2 border-t border-slate-800/60">
        <button
          onClick={handleCancel}
          disabled={progress.isComplete}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>{t('common.cancel')}</span>
        </button>
      </div>
    </div>
  );
};
