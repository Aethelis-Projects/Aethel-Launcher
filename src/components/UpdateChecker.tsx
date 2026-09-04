import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Download, X, CheckCircle2, Loader2 } from 'lucide-react';
import { commands, type UpdateInfo } from '../bindings';

interface UpdateCheckerProps {
  channel?: string;
  autoCheck?: boolean;
}

export const UpdateChecker: React.FC<UpdateCheckerProps> = ({ channel = 'stable', autoCheck = true }) => {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloaded, setIsDownloaded] = useState(false);

  useEffect(() => {
    if (!autoCheck) return;

    let isMounted = true;
    commands
      .checkForUpdates(channel)
      .then((res) => {
        if (!isMounted) return;
        if (res.status === 'ok' && res.data) {
          setUpdateInfo(res.data);
          setIsOpen(true);
        }
      })
      .catch(() => {
        // Silent fallback in offline mode
      });

    return () => {
      isMounted = false;
    };
  }, [channel, autoCheck]);

  const handleInstall = async () => {
    setIsDownloading(true);
    setDownloadProgress(25);

    try {
      // Simulate download progress steps for smooth UX
      setTimeout(() => setDownloadProgress(60), 300);
      setTimeout(() => setDownloadProgress(90), 600);

      const res = await commands.downloadAndInstallUpdate(channel);
      if (res.status === 'ok') {
        setDownloadProgress(100);
        setIsDownloaded(true);
      }
    } catch {
      // Graceful error handling
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen || !updateInfo) return null;

  return (
    <div
      data-testid="update-checker-modal"
      className="fixed bottom-6 right-6 z-50 w-96 rounded-xl border border-cyan-500/40 bg-zinc-950/95 p-4 shadow-2xl shadow-cyan-950/60 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-100">{t('update.available')}</h4>
            <p className="text-xs text-cyan-400 font-mono">
              {t('update.version', { version: updateInfo.version })}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          title={t('update.later')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Release Notes / Changelog */}
      {updateInfo.body && (
        <div className="mt-3 max-h-32 overflow-y-auto rounded-lg bg-zinc-900/90 p-2.5 text-xs text-zinc-300 whitespace-pre-wrap border border-zinc-800">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
            {t('update.releaseNotes')}
          </div>
          {updateInfo.body}
        </div>
      )}

      {/* Download Size indicator */}
      {updateInfo.download_size > 0 && (
        <div className="mt-2 text-[11px] text-zinc-500">
          {(updateInfo.download_size / (1024 * 1024)).toFixed(1)} MB
        </div>
      )}

      {/* Download Progress Bar */}
      {isDownloading && (
        <div className="mt-3 space-y-1">
          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <p className="text-[11px] text-zinc-400 text-center">
            {t('update.downloading')} ({downloadProgress}%)
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={() => setIsOpen(false)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
        >
          {t('update.later')}
        </button>

        {isDownloaded ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/60">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Ready on Restart</span>
          </div>
        ) : (
          <button
            onClick={handleInstall}
            disabled={isDownloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-md shadow-cyan-950 transition-all disabled:opacity-50"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t('update.downloading')}</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>{t('update.download')}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
