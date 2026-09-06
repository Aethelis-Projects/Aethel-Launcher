import React from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Globe, User, Download, Coffee, Gamepad2, Settings } from 'lucide-react';
import { useAccountStore } from '../store/accountStore';
import { useDownloadStore } from '../store/downloadStore';

interface TitleBarProps {
  activeTab?: 'instances' | 'logs';
  onSelectTab?: (tab: 'instances' | 'logs') => void;
  onOpenJava?: () => void;
  onOpenSettings?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenJava,
  onOpenSettings,
}) => {
  const { t, i18n } = useTranslation();
  const { activeAccount, setIsAccountModalOpen } = useAccountStore();
  const { tasks, setIsOpen, isOpen } = useDownloadStore();

  const taskList = Object.values(tasks);
  const activeDownloadCount = taskList.filter(
    (t) => t.status === 'downloading' || t.status === 'verifying' || t.status === 'queued'
  ).length;
  const hasDownloadErrors = taskList.some((t) => t.status === 'error' || t.status === 'failed');

  const toggleLanguage = () => {
    const next = i18n.language.startsWith('ru') ? 'en' : 'ru';
    i18n.changeLanguage(next);
    localStorage.setItem('aethel_lng', next);
  };

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error('Failed to minimize window:', err);
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (err) {
      console.error('Failed to toggle maximize window:', err);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await getCurrentWindow().close();
    } catch (err) {
      console.error('Failed to close window:', err);
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="h-10 bg-[var(--surface-1)]/95 border-b border-[var(--line-subtle)] flex items-center justify-between px-3 select-none z-50 text-xs text-[var(--text-secondary)] font-medium backdrop-blur-md"
    >
      {/* Brand & Left Controls */}
      <div className="flex items-center gap-3 pointer-events-none" data-tauri-drag-region>
        <div className="w-5 h-5 rounded-[var(--radius-sm)] bg-gradient-to-tr from-[var(--accent-from)] to-[var(--accent-to)] flex items-center justify-center font-bold text-[var(--text-on-accent)] text-[10px] shadow-[var(--shadow-glow)]">
          Æ
        </div>
        <span className="font-semibold text-[var(--text-primary)] tracking-wide text-xs">
          Aethel Launcher
        </span>
      </div>

      {/* Center Navigation Buttons */}
      <div
        data-tauri-drag-region="false"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="flex items-center gap-1"
      >
        <button
          data-tauri-drag-region="false"
          onClick={(e) => {
            e.stopPropagation();
            onSelectTab?.('instances');
          }}
          className={`px-2.5 py-1 rounded-[var(--radius-sm)] text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'instances'
              ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] ring-1 ring-[var(--accent-line)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)]'
          }`}
        >
          <Gamepad2 className="w-3.5 h-3.5" />
          <span>{t('nav.instances', 'Instances')}</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenJava?.();
          }}
          data-tauri-drag-region="false"
          className="px-2.5 py-1 rounded-[var(--radius-sm)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer flex items-center gap-1.5"
          title={t('javaManager.title', 'Java Runtime Manager')}
        >
          <Coffee className="w-3.5 h-3.5 text-[var(--accent-from)]" />
          <span>Java</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettings?.();
          }}
          data-tauri-drag-region="false"
          className="px-2.5 py-1 rounded-[var(--radius-sm)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer flex items-center gap-1.5"
          title={t('nav.settings', 'Settings')}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>{t('nav.settings', 'Settings')}</span>
        </button>
      </div>

      {/* Right controls - Explicitly isolated from drag region */}
      <div
        data-tauri-drag-region="false"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="flex items-center gap-2"
      >
        {/* Active circular downloads button with badge & error indicator */}
        <button
          data-tauri-drag-region="false"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-colors text-[11px] cursor-pointer ${
            activeDownloadCount > 0
              ? 'bg-[var(--accent-soft)] text-[var(--accent-from)] border border-[var(--accent-line)] animate-pulse shadow-[var(--shadow-glow)]'
              : hasDownloadErrors
              ? 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/50 hover:bg-[var(--danger-soft)]'
              : 'hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
          }`}
          title={
            hasDownloadErrors
              ? t('downloads.hasErrors', 'Downloads (Errors)')
              : t('downloads.title', 'Downloads')
          }
        >
          <Download className="w-3.5 h-3.5" />
          {activeDownloadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[var(--accent-from)] text-[var(--surface-0)] text-[9px] font-bold flex items-center justify-center shadow">
              {activeDownloadCount}
            </span>
          )}
          {activeDownloadCount === 0 && hasDownloadErrors && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--danger)] animate-ping" />
          )}
        </button>

        {/* Language switcher */}
        <button
          data-tauri-drag-region="false"
          onClick={(e) => {
            e.stopPropagation();
            toggleLanguage();
          }}
          className="px-2 py-1 rounded-[var(--radius-sm)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors text-[11px] cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="uppercase font-semibold text-[10px]">
            {i18n.language.startsWith('ru') ? 'RU' : 'EN'}
          </span>
        </button>

        {/* Profile badge */}
        <button
          data-tauri-drag-region="false"
          onClick={(e) => {
            e.stopPropagation();
            setIsAccountModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--line-subtle)] hover:border-[var(--line-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] transition-all cursor-pointer"
        >
          <User className="w-3 h-3 text-[var(--accent-from)]" />
          <span>{activeAccount.name}</span>
        </button>

        {/* Window controls */}
        <div className="flex items-center ml-2 border-l border-[var(--line-subtle)] pl-2">
          <button
            data-testid="window-minimize-btn"
            onClick={handleMinimize}
            data-tauri-drag-region="false"
            className="w-7 h-7 flex items-center justify-center hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] transition-colors cursor-pointer"
            title="Minimize"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            data-testid="window-maximize-btn"
            onClick={handleMaximize}
            data-tauri-drag-region="false"
            className="w-7 h-7 flex items-center justify-center hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] transition-colors cursor-pointer"
            title="Maximize"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            data-testid="window-close-btn"
            onClick={handleClose}
            data-tauri-drag-region="false"
            className="w-7 h-7 flex items-center justify-center hover:bg-[var(--danger)] hover:text-[var(--text-on-accent)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </header>
  );
};
