import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  X,
  Coffee,
  Palette,
  Radio,
  Sparkles,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import {
  useSettingsStore,
  type PreferredJavaProvider,
  type Theme,
} from '../store/settingsStore';
import { useUpdateStore } from '../store/updateStore';
import { commands } from '../bindings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenJavaManager?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onOpenJavaManager }) => {
  const { t, i18n } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const {
    preferredProvider,
    updateChannel,
    theme,
    discordRpcEnabled,
    setPreferredProvider,
    setUpdateChannel,
    setTheme,
    setDiscordRpcEnabled,
  } = useSettingsStore();

  const { checkForUpdates } = useUpdateStore();

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      const info = await checkForUpdates(updateChannel, true);
      if (info) {
        setUpdateStatus(`${t('update.available')}: ${info.version}`);
      } else {
        setUpdateStatus(t('update.upToDate'));
      }
    } catch {
      setUpdateStatus(t('update.upToDate'));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
          <h3 className="text-base font-bold text-[var(--text-primary)]">{t('settings.title')}</h3>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Java & Runtime Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              <Coffee className="h-4 w-4 text-[var(--accent-from)]" />
              <span>{t('settings.java', 'Java & Runtime')}</span>
            </div>

            {/* Preferred Java Vendor */}
            <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">
                  {t('settings.javaProvider', 'Preferred Java Vendor')}
                </label>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  Distributor used for auto-downloading JRE runtimes
                </p>
              </div>
              <select
                value={preferredProvider}
                onChange={(e) => setPreferredProvider(e.target.value as PreferredJavaProvider)}
                className="cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
              >
                <option value="Adoptium">Eclipse Adoptium (Temurin)</option>
                <option value="Zulu">Azul Zulu</option>
              </select>
            </div>

            {/* Quick Link to Dedicated Java Manager */}
            <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-3.5">
              <div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  {t('settings.javaManagerTitle', 'Java Runtime Manager')}
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                  {t(
                    'settings.javaManagerDesc',
                    'Scan system runtimes, verify compatibility matrix, and test JVM binaries.'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenJavaManager?.();
                }}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]"
              >
                <Coffee className="h-3.5 w-3.5 text-[var(--accent-from)]" />
                <span>{t('settings.openJavaManager', 'Manage Runtimes')}</span>
              </button>
            </div>
          </div>

          {/* Appearance & Integrations Section */}
          <div className="space-y-4 border-t border-[var(--line-subtle)] pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              <Palette className="h-4 w-4 text-[var(--accent-from)]" />
              <span>{t('settings.appearance', 'Appearance & Integrations')}</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Theme */}
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">{t('settings.theme', 'Interface Theme')}</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as Theme)}
                  className="w-full cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
                >
                  <option value="system">{t('settings.themeSystem', 'System Default')}</option>
                  <option value="dark">{t('settings.themeDark', 'Dark')}</option>
                  <option value="light">{t('settings.themeLight', 'Light')}</option>
                </select>
              </div>

              {/* Language */}
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">{t('settings.language', 'Language')}</label>
                <select
                  value={i18n.language}
                  onChange={(e) => {
                    const newLang = e.target.value;
                    i18n.changeLanguage(newLang);
                    if (discordRpcEnabled) {
                      commands.setDiscordRpcActivity(newLang).catch(() => {});
                    }
                  }}
                  className="w-full cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            {/* Discord Rich Presence Card */}
            <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-[var(--radius-sm)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-2 text-[var(--accent-from)]">
                  <Radio className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-[var(--text-primary)]">
                    {t('settings.discordRpc', 'Discord Rich Presence')}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {t('settings.discordRpcDesc', 'Display launcher and playing status in your Discord profile')}
                  </div>
                </div>
              </div>
              <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  data-testid="discord-rpc-toggle"
                  checked={discordRpcEnabled}
                  onChange={(e) => setDiscordRpcEnabled(e.target.checked, i18n.language)}
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-3)] peer-focus:outline-none peer-checked:border-transparent peer-checked:bg-[var(--accent-to)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-[var(--line-strong)] after:bg-white after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
              </label>
            </div>
          </div>

          {/* Application Updates Section */}
          <div className="space-y-4 border-t border-[var(--line-subtle)] pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              <Sparkles className="h-4 w-4 text-[var(--accent-from)]" />
              <span>{t('update.title')}</span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">{t('update.channel')}</label>
                <select
                  value={updateChannel}
                  onChange={(e) => setUpdateChannel(e.target.value as 'stable' | 'beta')}
                  className="w-full cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
                >
                  <option value="stable">{t('update.stable')}</option>
                  <option value="beta">{t('update.beta')}</option>
                </select>
              </div>

              <div className="flex flex-col justify-end space-y-1.5">
                <button
                  type="button"
                  data-testid="manual-update-check-btn"
                  onClick={handleCheckForUpdates}
                  disabled={isCheckingUpdate}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] disabled:pointer-events-none disabled:opacity-50"
                >
                  {isCheckingUpdate ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-from)]" />
                      <span>{t('update.checking')}</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 text-[var(--accent-from)]" />
                      <span>{t('update.checkForUpdates')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {updateStatus && (
              <div
                data-testid="update-status-msg"
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-2.5 text-xs text-[var(--text-secondary)]"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent-from)]" />
                <span>{updateStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]"
          >
            {t('settings.close')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
