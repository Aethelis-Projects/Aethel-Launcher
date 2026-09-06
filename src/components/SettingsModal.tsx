import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="fixed inset-0 bg-[var(--surface-0)]/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-[var(--radius-lg)] w-full max-w-xl overflow-hidden shadow-2xl shadow-black/40 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--line-subtle)] flex items-center justify-between bg-[var(--surface-1)]/80">
          <h3 className="font-bold text-[var(--text-primary)] text-base">{t('settings.title')}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Java & Runtime Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              <Coffee className="w-4 h-4 text-[var(--accent-from)]" />
              <span>{t('settings.java', 'Java & Runtime')}</span>
            </div>

            {/* Preferred Java Vendor */}
            <div className="flex items-center justify-between gap-4 p-3 bg-[var(--surface-1)]/80 rounded-[var(--radius-md)] border border-[var(--line-subtle)]">
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] block">
                  {t('settings.javaProvider', 'Preferred Java Vendor')}
                </label>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Distributor used for auto-downloading JRE runtimes
                </p>
              </div>
              <select
                value={preferredProvider}
                onChange={(e) => setPreferredProvider(e.target.value as PreferredJavaProvider)}
                className="px-3 py-1.5 bg-[var(--surface-3)] border border-[var(--line-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-from)] cursor-pointer"
              >
                <option value="Adoptium">Eclipse Adoptium (Temurin)</option>
                <option value="Zulu">Azul Zulu</option>
              </select>
            </div>

            {/* Quick Link to Dedicated Java Manager */}
            <div className="flex items-center justify-between p-3.5 bg-[var(--surface-1)]/60 border border-[var(--line-subtle)] rounded-[var(--radius-md)]">
              <div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  {t('settings.javaManagerTitle', 'Java Runtime Manager')}
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
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
                className="px-3 py-1.5 bg-[var(--surface-3)] hover:bg-[var(--accent-soft)] text-[var(--text-primary)] text-xs font-medium rounded-[var(--radius-sm)] border border-[var(--line-subtle)] hover:border-[var(--accent-line)] transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Coffee className="w-3.5 h-3.5 text-[var(--accent-from)]" />
                <span>{t('settings.openJavaManager', 'Manage Runtimes')}</span>
              </button>
            </div>
          </div>

          {/* Appearance & Integrations Section */}
          <div className="space-y-4 pt-4 border-t border-[var(--line-subtle)]">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              <Palette className="w-4 h-4 text-[var(--accent-from)]" />
              <span>{t('settings.appearance', 'Appearance & Integrations')}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Theme */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">{t('settings.theme', 'Interface Theme')}</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as Theme)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="system">{t('settings.themeSystem', 'System Default')}</option>
                  <option value="dark">{t('settings.themeDark', 'Dark')}</option>
                  <option value="light">{t('settings.themeLight', 'Light')}</option>
                </select>
              </div>

              {/* Language */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">{t('settings.language', 'Language')}</label>
                <select
                  value={i18n.language}
                  onChange={(e) => {
                    const newLang = e.target.value;
                    i18n.changeLanguage(newLang);
                    if (discordRpcEnabled) {
                      commands.setDiscordRpcActivity(newLang).catch(() => {});
                    }
                  }}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            {/* Discord Rich Presence Card */}
            <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mt-0.5">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-zinc-200">{t('settings.discordRpc', 'Discord Rich Presence')}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{t('settings.discordRpcDesc', 'Display launcher and playing status in your Discord profile')}</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  data-testid="discord-rpc-toggle"
                  checked={discordRpcEnabled}
                  onChange={(e) => setDiscordRpcEnabled(e.target.checked, i18n.language)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>

          {/* Application Updates Section */}
          <div className="space-y-4 pt-4 border-t border-zinc-800/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>{t('update.title')}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">{t('update.channel')}</label>
                <select
                  value={updateChannel}
                  onChange={(e) => setUpdateChannel(e.target.value as 'stable' | 'beta')}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="stable">{t('update.stable')}</option>
                  <option value="beta">{t('update.beta')}</option>
                </select>
              </div>

              <div className="space-y-1.5 flex flex-col justify-end">
                <button
                  type="button"
                  data-testid="manual-update-check-btn"
                  onClick={handleCheckForUpdates}
                  disabled={isCheckingUpdate}
                  className="w-full py-2 px-3 rounded-lg text-xs font-medium text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isCheckingUpdate ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      <span>{t('update.checking')}</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{t('update.checkForUpdates')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {updateStatus && (
              <div
                data-testid="update-status-msg"
                className="p-2.5 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs flex items-center gap-2 text-zinc-300"
              >
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{updateStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/80 flex justify-end bg-zinc-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-xs font-medium transition-colors"
          >
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
