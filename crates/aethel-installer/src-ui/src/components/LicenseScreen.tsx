import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, ShieldCheck, ExternalLink } from 'lucide-react';
import { useInstallerStore } from '../store/installerStore';

export const LicenseScreen: React.FC = () => {
  const { t } = useTranslation();
  const { setScreen, licenseAccepted, setLicenseAccepted } = useInstallerStore();

  const handleOpenGithub = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-opener');
      await open('https://github.com/Aethelis-Projects/Aethel-Launcher/blob/main/LICENSE');
    } catch {
      window.open('https://github.com/Aethelis-Projects/Aethel-Launcher', '_blank');
    }
  };

  return (
    <div className="flex flex-col justify-between h-full p-8 relative z-10 select-none">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-bold text-slate-100">{t('license.title')}</h2>
        </div>
        <p className="text-xs text-slate-400">{t('license.subtitle')}</p>
      </div>

      {/* License Text Container */}
      <div className="my-4 h-56 overflow-y-auto rounded-xl bg-slate-950/80 border border-slate-800/80 p-4 font-mono text-[11px] leading-relaxed text-slate-300 shadow-inner scrollbar-thin scrollbar-thumb-slate-700">
        <p className="font-bold text-cyan-300 mb-2">Aethel Launcher License Agreement</p>
        <p className="text-slate-400 mb-3">Copyright (c) 2026 Aethelis Projects. All rights reserved.</p>
        <p className="mb-3">
          Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the &quot;Software&quot;), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
        </p>
        <p className="mb-3">
          The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
        </p>
        <p className="mb-3">
          THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
        </p>
        <p className="text-slate-500">
          This software is dual-licensed under Apache-2.0 or MIT at your option.
        </p>
      </div>

      {/* Acceptance Checkbox & Link */}
      <div className="space-y-2 mb-2">
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={licenseAccepted}
            onChange={(e) => setLicenseAccepted(e.target.checked)}
            className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-400 cursor-pointer accent-cyan-500"
          />
          <span className="text-xs text-slate-200 group-hover:text-slate-100 transition-colors">
            {t('license.accept')}
          </span>
        </label>

        <button
          onClick={handleOpenGithub}
          className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <span>{t('license.readFull')}</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Footer Navigation */}
      <div className="w-full flex justify-between items-center pt-2 border-t border-slate-800/60">
        <button
          onClick={() => setScreen('welcome')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('common.back')}</span>
        </button>

        <button
          disabled={!licenseAccepted}
          onClick={() => setScreen('path')}
          className={`flex items-center gap-1.5 px-6 py-2 rounded-xl font-bold text-xs transition-all ${
            licenseAccepted
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-[0_0_15px_rgba(0,245,212,0.4)] cursor-pointer'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/40'
          }`}
        >
          <span>{t('common.next')}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
