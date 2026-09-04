import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Download, X, CheckCircle2, Loader2, Calendar, FileDown, ArrowRight, ExternalLink } from 'lucide-react';
import { useUpdateStore } from '../store/updateStore';
import { useSettingsStore } from '../store/settingsStore';
import { parseChangelog } from '../utils/changelogParser';

interface UpdateCheckerProps {
  channel?: string;
  autoCheck?: boolean;
}

export const UpdateChecker: React.FC<UpdateCheckerProps> = ({
  channel = 'stable',
  autoCheck = true,
}) => {
  const { t } = useTranslation();
  const {
    updateInfo,
    isModalOpen,
    isToastOpen,
    isDownloading,
    downloadProgress,
    isDownloaded,
    setModalOpen,
    setToastOpen,
    checkForUpdates,
    installUpdate,
  } = useUpdateStore();

  const { setSkippedUpdateVersion } = useSettingsStore();

  useEffect(() => {
    if (!autoCheck) return;

    // 1. Initial startup check (shows recommendation modal unless skipped)
    checkForUpdates(channel, false, true);

    // 2. Periodic background check every 15 minutes (shows non-intrusive toast if updated)
    const interval = setInterval(() => {
      checkForUpdates(channel, false, false);
    }, 15 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [channel, autoCheck, checkForUpdates]);

  const handleRemindLater = () => {
    if (updateInfo) {
      setSkippedUpdateVersion(updateInfo.version);
    }
    setModalOpen(false);
  };

  const handleInstall = async () => {
    await installUpdate(channel);
  };

  if (!updateInfo) return null;

  const parsedChangelog = parseChangelog(updateInfo.body, updateInfo.version);

  return (
    <>
      {/* 1. Full Recommendation / Details Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            data-testid="update-checker-modal"
            className="bg-zinc-950 border border-cyan-500/50 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-cyan-950/60 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-800/80 bg-gradient-to-r from-cyan-950/40 via-zinc-900 to-indigo-950/30 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 mb-1">
                    {t('update.recommendedUpdate', 'Recommended Update')}
                  </div>
                  <h3 className="font-bold text-zinc-100 text-base flex items-center gap-2">
                    {t('update.title', 'Application Update')}
                    <span className="font-mono text-cyan-400 text-sm font-semibold">
                      {updateInfo.version}
                    </span>
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                title={t('update.later', 'Later')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Meta information row */}
              <div className="grid grid-cols-2 gap-2 p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800/70 text-zinc-400">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {t('update.releaseDate', 'Release date')}: <strong className="text-zinc-200">{updateInfo.date.split('T')[0]}</strong>
                  </span>
                </div>
                {updateInfo.download_size > 0 && (
                  <div className="flex items-center gap-2 justify-end">
                    <FileDown className="w-3.5 h-3.5 text-indigo-400" />
                    <span>
                      {t('update.fileSize', 'Size')}: <strong className="text-zinc-200">{(updateInfo.download_size / (1024 * 1024)).toFixed(1)} MB</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Release Notes / Structured Changelog */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2.5 px-0.5">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    {t('update.whatsNew', "Что изменилось в этой версии")}
                  </span>
                  <span className="text-[10px] font-medium text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800">
                    Changelog
                  </span>
                </div>

                <div className="max-h-60 overflow-y-auto rounded-xl bg-zinc-900/80 p-4 text-zinc-300 font-sans text-xs leading-relaxed border border-zinc-800/80 space-y-3.5 shadow-inner">
                  {parsedChangelog.sections.map((sec, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-zinc-200 font-semibold text-xs border-b border-zinc-800/60 pb-1">
                        <span>{sec.icon}</span>
                        <span>{sec.title}</span>
                      </div>
                      <ul className="space-y-1 pl-1">
                        {sec.items.map((item, itemIdx) => (
                          <li key={itemIdx} className="flex items-start gap-2 text-zinc-300 leading-normal">
                            <span className="text-cyan-400/80 font-bold shrink-0 text-sm leading-4">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {parsedChangelog.compareUrl && (
                    <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-500">
                        {t('update.fullChangelog', 'Полный список изменений')}
                      </span>
                      <a
                        href={parsedChangelog.compareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-cyan-400 hover:text-cyan-300 bg-cyan-950/30 hover:bg-cyan-950/60 border border-cyan-500/30 transition-all"
                      >
                        <span>GitHub Release</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Download Progress Bar */}
              {isDownloading && (
                <div className="space-y-1.5 p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl">
                  <div className="flex justify-between text-xs">
                    <span className="text-cyan-300 font-medium">{t('update.downloading', 'Downloading update...')}</span>
                    <span className="font-mono text-cyan-400 font-semibold">{downloadProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800/80 flex items-center justify-between bg-zinc-950/80">
              <button
                onClick={handleRemindLater}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
              >
                {t('update.remindLater', 'Remind Later')}
              </button>

              <div className="flex items-center gap-2">
                {isDownloaded ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/60">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t('update.readyToInstall', 'Ready to install')}</span>
                  </div>
                ) : (
                  <button
                    onClick={handleInstall}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-lg shadow-cyan-950 transition-all disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('update.downloading', 'Downloading...')}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>{t('update.installNow', 'Install Now')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Floating Live In-App Notification Toast */}
      {isToastOpen && !isModalOpen && (
        <div
          data-testid="update-notification-toast"
          className="fixed bottom-6 right-6 z-50 w-96 rounded-2xl border border-cyan-500/50 bg-zinc-950/95 p-4 shadow-2xl shadow-cyan-950/60 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 shrink-0">
                <Sparkles className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-100">
                  {t('update.newVersionToast', 'New update is available!')}
                </h4>
                <p className="text-[11px] text-cyan-400 font-mono font-medium">
                  {updateInfo.version}
                </p>
              </div>
            </div>
            <button
              onClick={() => setToastOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              title={t('update.later', 'Later')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 border border-zinc-800 transition-colors flex items-center gap-1"
            >
              <span>{t('update.details', 'Details')}</span>
              <ArrowRight className="w-3 h-3" />
            </button>

            <button
              onClick={handleInstall}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-md transition-all disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('update.downloading', 'Downloading...')}</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('update.installNow', 'Install')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
