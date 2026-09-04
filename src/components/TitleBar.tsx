import React from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Globe, User, Download } from 'lucide-react';
import { useAccountStore } from '../store/accountStore';
import { useDownloadStore } from '../store/downloadStore';

export const TitleBar: React.FC = () => {
  const { i18n } = useTranslation();
  const { activeAccount } = useAccountStore();
  const { tasks, setIsOpen, isOpen } = useDownloadStore();

  const activeDownloadCount = Object.values(tasks).filter(
    (t) => t.status === 'downloading' || t.status === 'verifying'
  ).length;

  const toggleLanguage = () => {
    const next = i18n.language.startsWith('ru') ? 'en' : 'ru';
    i18n.changeLanguage(next);
    localStorage.setItem('aethel_lng', next);
  };

  const handleMinimize = () => {
    try {
      getCurrentWindow().minimize();
    } catch {}
  };

  const handleMaximize = () => {
    try {
      getCurrentWindow().toggleMaximize();
    } catch {}
  };

  const handleClose = () => {
    try {
      getCurrentWindow().close();
    } catch {}
  };

  return (
    <header
      data-tauri-drag-region
      className="h-10 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between px-3 select-none z-50 text-xs text-zinc-400 font-medium"
    >
      {/* Brand & Left Controls */}
      <div className="flex items-center gap-3 pointer-events-none" data-tauri-drag-region>
        <div className="w-5 h-5 rounded bg-gradient-to-tr from-cyan-600 to-indigo-500 flex items-center justify-center font-bold text-white text-[10px] shadow-sm shadow-cyan-950">
          Æ
        </div>
        <span className="font-semibold text-zinc-200 tracking-wide text-xs">
          Aethel Launcher
        </span>
      </div>

      {/* Center / Right controls */}
      <div className="flex items-center gap-2">
        {/* Active downloads toggle */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`px-2 py-1 rounded flex items-center gap-1.5 transition-colors text-[11px] ${
            activeDownloadCount > 0
              ? 'bg-cyan-950 text-cyan-400 border border-cyan-800 animate-pulse'
              : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          {activeDownloadCount > 0 && <span>{activeDownloadCount}</span>}
        </button>

        {/* Language switcher */}
        <button
          onClick={toggleLanguage}
          className="px-2 py-1 rounded hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors text-[11px]"
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="uppercase font-semibold text-[10px]">
            {i18n.language.startsWith('ru') ? 'RU' : 'EN'}
          </span>
        </button>

        {/* Profile badge */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px]">
          <User className="w-3 h-3 text-cyan-400" />
          <span>{activeAccount.name}</span>
        </div>

        {/* Window controls */}
        <div className="flex items-center ml-2 border-l border-zinc-800 pl-2">
          <button
            onClick={handleMinimize}
            className="w-7 h-7 flex items-center justify-center hover:bg-zinc-800 hover:text-zinc-200 rounded text-zinc-400 transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-7 h-7 flex items-center justify-center hover:bg-zinc-800 hover:text-zinc-200 rounded text-zinc-400 transition-colors"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center hover:bg-red-600 hover:text-white rounded text-zinc-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </header>
  );
};
