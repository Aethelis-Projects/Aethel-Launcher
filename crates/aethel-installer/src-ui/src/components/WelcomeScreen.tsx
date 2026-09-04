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
    <div className="flex flex-col items-center justify-between h-full p-8 relative z-10 select-none">
      {/* Top bar with language switcher */}
      <div className="w-full flex justify-end items-center">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 text-xs text-slate-300 transition-colors cursor-pointer"
          title="Switch Language"
        >
          <Globe className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold uppercase tracking-wider">{language}</span>
        </button>
      </div>

      {/* Center hero */}
      <div className="flex flex-col items-center text-center max-w-lg mt-2">
        <LogoAnimation size={104} className="mb-6" />

        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400">
            {t('welcome.title')}
          </h1>
        </div>

        <p className="text-sm text-slate-400 leading-relaxed max-w-md mb-4">
          {t('welcome.subtitle')}
        </p>

        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-cyan-950/40 border border-cyan-500/20 text-cyan-300 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>v1.0.0-rc.2 • Production Ready</span>
        </div>

        {/* Update alert banner if newer installer version found */}
        {updateAvailable && (
          <div className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs text-left">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="font-semibold">{t('welcome.updateAvailable', { version: updateAvailable })}</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="w-full flex justify-end">
        <button
          onClick={() => setScreen('license')}
          className="group flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-[0_0_20px_rgba(0,245,212,0.4)] hover:shadow-[0_0_25px_rgba(0,245,212,0.6)] transition-all transform active:scale-95 cursor-pointer"
        >
          <span>{t('welcome.start')}</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};
