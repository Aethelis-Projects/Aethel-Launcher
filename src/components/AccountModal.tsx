import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { X, User, Shield, Trash2, Check, ExternalLink, Plus, Server, AlertCircle, Loader2 } from 'lucide-react';
import { useAccountStore } from '../store/accountStore';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const {
    accounts,
    activeAccount,
    isLoading,
    error,
    fetchAccounts,
    loginMicrosoft,
    loginOffline,
    loginAuthlib,
    setActiveAccount,
    logout,
  } = useAccountStore();

  const [activeTab, setActiveTab] = useState<'accounts' | 'microsoft' | 'offline' | 'authlib'>('accounts');
  const [offlineUsername, setOfflineUsername] = useState('');
  const [authlibServer, setAuthlibServer] = useState('https://authlib-injector.yggdrasil.ely.by');
  const [authlibUsername, setAuthlibUsername] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
      setLocalError(null);
    }
  }, [isOpen, fetchAccounts]);

  if (!isOpen) return null;

  const handleMicrosoftLogin = async () => {
    setLocalError(null);
    try {
      await loginMicrosoft();
      setActiveTab('accounts');
    } catch (e: any) {
      setLocalError(e?.message || 'Microsoft login failed');
    }
  };

  const handleOfflineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offlineUsername.trim()) return;
    setLocalError(null);
    try {
      await loginOffline(offlineUsername.trim());
      setOfflineUsername('');
      setActiveTab('accounts');
    } catch (e: any) {
      setLocalError(e?.message || 'Offline login failed');
    }
  };

  const handleAuthlibLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authlibServer.trim() || !authlibUsername.trim()) return;
    setLocalError(null);
    try {
      await loginAuthlib(authlibServer.trim(), authlibUsername.trim());
      setAuthlibUsername('');
      setActiveTab('accounts');
    } catch (e: any) {
      setLocalError(e?.message || 'Authlib login failed');
    }
  };

  const tabButtonClass = (active: boolean) =>
    `border-b-2 px-2.5 pb-2 font-medium transition-colors ${
      active
        ? 'border-[var(--accent-from)] text-[var(--accent)]'
        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
    }`;

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
        transition={{ duration: 0.16, ease: 'easeOut' }}
        data-motion-element
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <User className="h-4 w-4 text-[var(--accent-from)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('auth.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/40 px-5 pt-2 text-xs">
          <button onClick={() => setActiveTab('accounts')} className={tabButtonClass(activeTab === 'accounts')}>
            <span className="tabular-nums">{t('auth.accounts')} ({accounts.length})</span>
          </button>
          <button onClick={() => setActiveTab('microsoft')} className={tabButtonClass(activeTab === 'microsoft')}>
            Microsoft
          </button>
          <button onClick={() => setActiveTab('offline')} className={tabButtonClass(activeTab === 'offline')}>
            Offline
          </button>
          <button onClick={() => setActiveTab('authlib')} className={tabButtonClass(activeTab === 'authlib')}>
            Ely.by / Custom
          </button>
        </div>

        {/* Modal Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {(error || localError) && (
            <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-3 text-[var(--text-primary)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
              <span>{localError || error}</span>
            </div>
          )}

          {/* Accounts List View */}
          {activeTab === 'accounts' && (
            <div className="space-y-3">
              {accounts.length === 0 ? (
                <div className="space-y-2 py-8 text-center text-[var(--text-secondary)]">
                  <User className="mx-auto h-8 w-8 stroke-[1.5] text-[var(--text-muted)]" />
                  <p className="font-medium">{t('auth.noAccounts')}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">Add a Microsoft, Offline, or Ely.by account above.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {accounts.map((acc, index) => {
                    const isActive = acc.uuid === activeAccount.uuid;
                    return (
                      <motion.div
                        key={acc.uuid}
                        data-motion-element
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.16, ease: 'easeOut', delay: Math.min(index * 0.03, 0.18) }}
                        className={`flex items-center justify-between gap-3 rounded-[var(--radius-md)] border p-3 transition-colors ${
                          isActive
                            ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent-line)]'
                            : 'border-[var(--line-subtle)] bg-[var(--surface-1)]/80 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-xs font-bold text-[var(--text-on-accent)]">
                            {acc.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-semibold text-[var(--text-primary)]" title={acc.username}>
                                {acc.username}
                              </span>
                              <span className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                                {acc.account_type}
                              </span>
                              {isActive && (
                                <span className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                                  <Check className="h-2.5 w-2.5" /> {t('auth.active')}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-muted)]">
                              {acc.uuid}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {!isActive && (
                            <button
                              onClick={() => setActiveAccount(acc.uuid)}
                              className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                            >
                              {t('auth.switch')}
                            </button>
                          )}
                          <button
                            onClick={() => logout(acc.uuid)}
                            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                            title={t('auth.remove')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Microsoft Login View */}
          {activeTab === 'microsoft' && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                  <Shield className="h-4 w-4 text-[var(--accent-from)]" />
                  <span>{t('auth.microsoft.title')}</span>
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)] text-pretty">
                  {t('auth.microsoft.description')}
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleMicrosoftLogin}
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-4 py-2.5 font-medium text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t('auth.microsoft.signingIn')}</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4" />
                        <span>{t('auth.microsoft.button')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Offline Login View */}
          {activeTab === 'offline' && (
            <form onSubmit={handleOfflineLogin} className="space-y-4">
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                  <User className="h-4 w-4 text-[var(--accent-from)]" />
                  <span>{t('auth.offline.title')}</span>
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)] text-pretty">
                  {t('auth.offline.description')}
                </p>
                <div className="space-y-1.5 pt-1">
                  <input
                    type="text"
                    value={offlineUsername}
                    onChange={(e) => setOfflineUsername(e.target.value)}
                    placeholder={t('auth.offline.placeholder')}
                    maxLength={16}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-from)] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !offlineUsername.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-4 py-2 font-medium text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t('auth.offline.button')}</span>
                </button>
              </div>
            </form>
          )}

          {/* Authlib-Injector / Ely.by Login View */}
          {activeTab === 'authlib' && (
            <form onSubmit={handleAuthlibLogin} className="space-y-4">
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                  <Server className="h-4 w-4 text-[var(--accent-from)]" />
                  <span>{t('auth.authlib.title')}</span>
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)] text-pretty">
                  {t('auth.authlib.description')}
                </p>
                <div className="space-y-2 pt-1">
                  <input
                    type="text"
                    value={authlibServer}
                    onChange={(e) => setAuthlibServer(e.target.value)}
                    placeholder={t('auth.authlib.serverPlaceholder')}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-from)] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={authlibUsername}
                    onChange={(e) => setAuthlibUsername(e.target.value)}
                    placeholder={t('auth.authlib.usernamePlaceholder')}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-from)] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !authlibServer.trim() || !authlibUsername.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-4 py-2 font-medium text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t('auth.authlib.button')}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end border-t border-[var(--line-subtle)] bg-[var(--surface-1)]/60 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
          >
            {t('auth.close')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
