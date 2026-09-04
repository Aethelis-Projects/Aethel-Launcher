import React from 'react';
import { Minus, X } from 'lucide-react';

export const TitleBar: React.FC = () => {
  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {
      // Ignore in non-tauri environment
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      // Ignore in non-tauri environment
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="h-9 w-full bg-slate-950/60 backdrop-blur-md border-b border-slate-800/60 flex items-center justify-between px-3 select-none z-50 text-xs text-slate-400"
    >
      <div className="flex items-center gap-2 pointer-events-none">
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,245,212,0.8)]" />
        <span className="font-medium tracking-wide text-slate-300">Aethel Launcher Setup</span>
      </div>

      <div className="flex items-center">
        <button
          onClick={handleMinimize}
          className="w-8 h-7 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 rounded transition-colors cursor-pointer"
          title="Minimize"
          aria-label="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-7 flex items-center justify-center text-slate-400 hover:text-rose-100 hover:bg-rose-600/80 rounded transition-colors cursor-pointer"
          title="Close"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
