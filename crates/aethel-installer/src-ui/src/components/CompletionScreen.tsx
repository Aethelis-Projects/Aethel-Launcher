import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Play, MessageSquare, FolderCheck, Rocket } from 'lucide-react';
import { useInstallerStore } from '../store/installerStore';

export const CompletionScreen: React.FC = () => {
  const { t } = useTranslation();
  const { launchOnFinish, setLaunchOnFinish, installPath } = useInstallerStore();

  const handleFinish = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');

      if (launchOnFinish) {
        try {
          await invoke('launch_application', { targetPath: installPath });
        } catch (err) {
          console.error('Failed to launch application:', err);
        }
      }

      // Exit installer cleanly without hanging or leaving white screen
      await invoke('exit_installer');
    } catch {
      window.close();
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

  // Truncate path for display if very long
  const displayPath = installPath.length > 38 
    ? installPath.slice(0, 16) + '...' + installPath.slice(-18)
    : installPath;

  return (
    <div className="flex h-full flex-col">
      {/* Centered Celebration & Overview Card */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pt-6 pb-4 flex flex-col items-center justify-center">
        {/* Layered Glowing Hero Badge with verified >= 20px breathing room */}
        <div className="relative mb-3 flex items-center justify-center">
          <div className="absolute w-20 h-20 rounded-full blur-2xl bg-cyan-400/35 animate-pulse" />
          <div className="absolute w-18 h-18 rounded-full border border-cyan-400/40 opacity-70 animate-spin" style={{ animationDuration: '20s' }} />
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-cyan-500 via-sky-400 to-blue-600 flex items-center justify-center text-slate-950 shadow-[0_0_25px_rgba(0,245,212,0.55)] relative z-10">
            <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
          </div>
        </div>

        {/* Heading & Subtitle */}
        <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 tracking-tight text-center mb-1">
          {t('completion.title')}
        </h1>

        <p className="text-xs text-slate-300 font-medium max-w-sm text-center mb-3.5">
          {t('completion.subtitle')}
        </p>

        {/* Glassmorphic Summary & Action Card */}
        <div className="w-full max-w-md bg-slate-900/70 border border-slate-800/90 rounded-xl p-3.5 shadow-xl backdrop-blur-md mb-3.5">
          {/* Status Row */}
          <div className="flex items-center justify-between gap-3 text-xs mb-2.5 pb-2.5 border-b border-slate-800/70">
            <div className="flex items-center gap-2 text-slate-300 min-w-0">
              <FolderCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate font-mono text-[11px] text-slate-300" title={installPath}>
                {displayPath}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Установлено</span>
            </div>
          </div>

          {/* Launch Option Interactive Row */}
          <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-950/90 transition-all cursor-pointer group">
            <div className="flex items-center gap-2.5">
              <Rocket className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                {t('completion.launchApp')}
              </span>
            </div>
            <input
              type="checkbox"
              checked={launchOnFinish}
              onChange={(e) => setLaunchOnFinish(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 accent-cyan-500 cursor-pointer"
            />
          </label>
        </div>

        {/* Community Links */}
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => handleOpenLink('https://discord.gg/minecraft')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500/60 hover:bg-[#5865F2]/10 hover:text-indigo-300 text-slate-400 transition-all active:scale-[0.96] cursor-pointer shadow-sm text-xs"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#5865F2]" />
            <span className="font-medium">{t('completion.discord')}</span>
          </button>
          <button
            onClick={() => handleOpenLink('https://github.com/Aethelis-Projects/Aethel-Launcher')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-600 hover:bg-slate-800/60 hover:text-slate-100 text-slate-400 transition-all active:scale-[0.96] cursor-pointer shadow-sm text-xs"
          >
            <svg className="w-3.5 h-3.5 fill-current text-slate-300" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span className="font-medium">{t('completion.github')}</span>
          </button>
        </div>
      </div>

      {/* Action Footer Bar */}
      <div className="shrink-0 border-t border-slate-800/80 px-8 py-3 flex items-center justify-between bg-slate-950/50">
        <span className="text-[11px] text-slate-500 font-mono">v{env_version()}</span>
        <button
          onClick={handleFinish}
          className="flex items-center gap-2 px-8 py-2 rounded-xl font-extrabold text-xs bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 shadow-[0_0_20px_rgba(0,245,212,0.45)] transition-all transform active:scale-[0.96] cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-slate-950 stroke-[2.5]" />
          <span>{t('common.finish')}</span>
        </button>
      </div>
    </div>
  );
};

function env_version(): string {
  return '1.0.0-rc.4';
}
