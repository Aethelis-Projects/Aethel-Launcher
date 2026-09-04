import React from 'react';
import { Minus, X } from 'lucide-react';

export const TitleBar: React.FC = () => {
  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {
      // Ignore in non-tauri environment
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      // Ignore in non-tauri environment
    }
  };

  return (
    <div
      className="h-9 w-full bg-slate-950/60 backdrop-blur-md border-b border-slate-800/60 flex items-center justify-between px-3 select-none z-50 text-xs text-slate-400 shrink-0"
    >
      <div className="flex-1 flex items-center gap-2 h-full cursor-default" data-tauri-drag-region>
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,245,212,0.8)] pointer-events-none" />
        <span className="font-medium tracking-wide text-slate-300 pointer-events-none">Aethel Launcher Setup</span>
      </div>

      <div
        data-tauri-drag-region="false"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="flex items-center gap-1 shrink-0"
      >
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

