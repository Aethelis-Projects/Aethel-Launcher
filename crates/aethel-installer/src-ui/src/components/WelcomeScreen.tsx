import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Globe, AlertTriangle, Sparkles } from 'lucide-react';
import { LogoAnimation } from '../animations/LogoAnimation';
import { useInstallerStore } from '../store/installerStore';

export const WelcomeScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { setScreen, language, setLanguage, updateAvailable } = useInstallerStore();

  const toggleLanguage = () => {
    const nextLang = language === 'ru' ? 'en' : 'ru';
    setLanguage(nextLang);
    i18n.changeLanguage(nextLang);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pt-6 pb-4 flex flex-col items-center justify-between">
        {/* Top bar with language switcher */}
        <div className="w-full flex justify-end items-center shrink-0">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 text-xs text-slate-300 transition-colors cursor-pointer"
            title="Switch Language"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold uppercase tracking-wider">{language}</span>
          </button>
        </div>

        {/* Center hero with verified >=16px breathing room */}
        <div className="my-auto flex flex-col items-center text-center max-w-lg py-2">
          <LogoAnimation size={96} className="mb-4" />

          <h1 className="text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 mb-1.5">
            {t('welcome.title')}
          </h1>

          <p className="text-xs text-slate-400 leading-relaxed max-w-md mb-3.5">
            {t('welcome.subtitle')}
          </p>

          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/25 text-cyan-300 text-[11px] font-mono shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>v1.0.0-rc.8 • Production Ready</span>
          </div>

          {/* Update alert banner if newer installer version found */}
          {updateAvailable && (
            <div className="mt-3 flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs text-left">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <p className="font-semibold">{t('welcome.updateAvailable', { version: updateAvailable })}</p>
              </div>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="shrink-0 h-1" />
      </div>

      {/* Pinned 3-tier Footer */}
      <div className="shrink-0 border-t border-slate-800/80 px-8 py-3 flex items-center justify-between bg-slate-950/50">
        <span className="text-[11px] font-mono text-slate-500">v1.0.0-rc.5</span>
        <button
          onClick={() => setScreen('license')}
          className="group flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-[0_0_18px_rgba(0,245,212,0.35)] hover:shadow-[0_0_24px_rgba(0,245,212,0.55)] transition-all transform active:scale-95 cursor-pointer"
        >
          <span>{t('welcome.start')}</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};
