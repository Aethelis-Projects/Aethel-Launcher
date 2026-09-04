import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Play, MessageSquare } from 'lucide-react';
import { useInstallerStore } from '../store/installerStore';

export const CompletionScreen: React.FC = () => {
  const { t } = useTranslation();
  const { launchOnFinish, setLaunchOnFinish, installPath } = useInstallerStore();

  const handleFinish = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { getCurrentWindow } = await import('@tauri-apps/api/window');

      if (launchOnFinish) {
        await invoke('launch_application', { targetPath: installPath });
      }

      await getCurrentWindow().close();
    } catch {
      // Dev mode fallback
      alert('Installation complete! Launcher would now launch.');
    }
  };

  const handleOpenLink = async (url: string) => {
    try {
      const { open } = await import('@tauri-apps/plugin-opener');
      await open(url);
    } catch {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="flex flex-col items-center justify-between h-full p-8 relative z-10 select-none text-center">
      {/* Celebration Checkmark */}
      <div className="my-auto flex flex-col items-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full blur-xl bg-cyan-400/40 animate-pulse" />
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-[0_0_30px_rgba(0,245,212,0.6)] relative z-10">
            <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
          </div>
        </div>

        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 mb-2">
          {t('completion.title')}
        </h1>

        <p className="text-sm text-slate-400 max-w-sm mb-6">
          {t('completion.subtitle')}
        </p>

        {/* Launch checkbox */}
        <label className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-colors cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={launchOnFinish}
            onChange={(e) => setLaunchOnFinish(e.target.checked)}
            className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-cyan-500 accent-cyan-500 cursor-pointer"
          />
          <span className="text-xs font-semibold text-slate-200">{t('completion.launchApp')}</span>
        </label>

        {/* Community Links */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <button
            onClick={() => handleOpenLink('https://discord.gg/minecraft')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-indigo-500/50 hover:text-indigo-300 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t('completion.discord')}</span>
          </button>
          <button
            onClick={() => handleOpenLink('https://github.com/Aethelis-Projects/Aethel-Launcher')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-slate-600 hover:text-slate-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5 fill-current text-slate-300" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span>{t('completion.github')}</span>
          </button>
        </div>
      </div>

      {/* Finish Button */}
      <div className="w-full flex justify-end pt-2 border-t border-slate-800/60">
        <button
          onClick={handleFinish}
          className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-[0_0_20px_rgba(0,245,212,0.4)] transition-all transform active:scale-95 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-slate-950" />
          <span>{t('common.finish')}</span>
        </button>
      </div>
    </div>
  );
};
