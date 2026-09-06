import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
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
  const prefersReducedMotion = useReducedMotion();
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
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            data-motion-element
            data-testid="update-checker-modal"
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line-subtle)] bg-gradient-to-r from-[var(--accent-soft)] to-[var(--surface-2)] p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-2.5 text-[var(--accent-from)]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                    {t('update.recommendedUpdate', 'Recommended Update')}
                  </div>
                  <h3 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
                    {t('update.title', 'Application Update')}
                    <span className="font-mono text-sm font-semibold text-[var(--accent)]">
                      {updateInfo.version}
                    </span>
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                className="rounded-[var(--radius-sm)] p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                title={t('update.later', 'Later')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
              {/* Meta information row */}
              <div className="grid grid-cols-1 gap-2 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-2.5 text-[var(--text-secondary)] sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-[var(--accent-from)]" />
                  <span>
                    {t('update.releaseDate', 'Release date')}: <strong className="text-[var(--text-primary)]">{updateInfo.date.split('T')[0]}</strong>
                  </span>
                </div>
                {updateInfo.download_size > 0 && (
                  <div className="flex items-center justify-end gap-2">
                    <FileDown className="h-3.5 w-3.5 text-[var(--accent-to)]" />
                    <span className="tabular-nums">
                      {t('update.fileSize', 'Size')}: <strong className="text-[var(--text-primary)]">{(updateInfo.download_size / (1024 * 1024)).toFixed(1)} MB</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Release Notes / Structured Changelog */}
              <div className="pt-2">
                <div className="mb-2.5 flex items-center justify-between px-0.5">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--accent-from)]" />
                    {t('update.whatsNew', "Что изменилось в этой версии")}
                  </span>
                  <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                    Changelog
                  </span>
                </div>

                <div className="max-h-60 space-y-3.5 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {parsedChangelog.sections.map((sec, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center gap-2 border-b border-[var(--line-subtle)] pb-1 text-xs font-semibold text-[var(--text-primary)]">
                        <span>{sec.icon}</span>
                        <span>{sec.title}</span>
                      </div>
                      <ul className="space-y-1 pl-1">
                        {sec.items.map((item, itemIdx) => (
                          <li key={itemIdx} className="flex items-start gap-2 leading-normal text-[var(--text-secondary)] text-pretty">
                            <span className="shrink-0 text-sm font-bold leading-4 text-[var(--accent)]">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {parsedChangelog.compareUrl && (
                    <div className="flex items-center justify-between border-t border-[var(--line-subtle)] pt-2.5">
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {t('update.fullChangelog', 'Полный список изменений')}
                      </span>
                      <a
                        href={parsedChangelog.compareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--accent-line)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]"
                      >
                        <span>GitHub Release</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Download Progress Bar */}
              {isDownloading && (
                <div className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-[var(--accent)]">{t('update.downloading', 'Downloading update...')}</span>
                    <span className="font-mono font-semibold tabular-nums text-[var(--accent)]">{downloadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-4">
              <button
                onClick={handleRemindLater}
                className="rounded-[var(--radius-sm)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
              >
                {t('update.remindLater', 'Remind Later')}
              </button>

              <div className="flex items-center gap-2">
                {isDownloaded ? (
                  <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--success)]/40 bg-[var(--success-soft)] px-4 py-2 text-xs font-medium text-[var(--success)]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{t('update.readyToInstall', 'Ready to install')}</span>
                  </div>
                ) : (
                  <button
                    onClick={handleInstall}
                    disabled={isDownloading}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-4 py-2 text-xs font-medium text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t('update.downloading', 'Downloading...')}</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        <span>{t('update.installNow', 'Install Now')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* 2. Floating Live In-App Notification Toast */}
      {isToastOpen && !isModalOpen && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          data-motion-element
          data-testid="update-notification-toast"
          className="fixed bottom-6 right-6 z-50 w-[min(24rem,calc(100vw-3rem))] rounded-[var(--radius-lg)] border border-[var(--accent-line)] bg-[var(--surface-2)]/95 p-4 shadow-[var(--shadow-lg)] backdrop-blur-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="shrink-0 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-2 text-[var(--accent-from)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  {t('update.newVersionToast', 'New update is available!')}
                </h4>
                <p className="font-mono text-[11px] font-medium text-[var(--accent)]">
                  {updateInfo.version}
                </p>
              </div>
            </div>
            <button
              onClick={() => setToastOpen(false)}
              className="p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              title={t('update.later', 'Later')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            >
              <span>{t('update.details', 'Details')}</span>
              <ArrowRight className="h-3 w-3" />
            </button>

            <button
              onClick={handleInstall}
              disabled={isDownloading}
              className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-3 py-1.5 text-xs font-medium text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{t('update.downloading', 'Downloading...')}</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>{t('update.installNow', 'Install')}</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </>
  );
};
