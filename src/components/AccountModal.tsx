import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, User, Shield, Trash2, Check, ExternalLink, Plus, Server, AlertCircle, Loader2 } from 'lucide-react';
import { useAccountStore } from '../store/accountStore';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-3.5 bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <User className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-zinc-100">{t('auth.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800/80 bg-zinc-900/20 px-5 pt-2 gap-2 text-xs">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`pb-2 px-2.5 font-medium transition-colors border-b-2 ${
              activeTab === 'accounts'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t('auth.accounts')} ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab('microsoft')}
            className={`pb-2 px-2.5 font-medium transition-colors border-b-2 ${
              activeTab === 'microsoft'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Microsoft
          </button>
          <button
            onClick={() => setActiveTab('offline')}
            className={`pb-2 px-2.5 font-medium transition-colors border-b-2 ${
              activeTab === 'offline'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Offline
          </button>
          <button
            onClick={() => setActiveTab('authlib')}
            className={`pb-2 px-2.5 font-medium transition-colors border-b-2 ${
              activeTab === 'authlib'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Ely.by / Custom
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {(error || localError) && (
            <div className="rounded-lg bg-red-950/40 border border-red-800/80 p-3 text-red-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{localError || error}</span>
            </div>
          )}

          {/* Accounts List View */}
          {activeTab === 'accounts' && (
            <div className="space-y-3">
              {accounts.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 space-y-2">
                  <User className="w-8 h-8 mx-auto text-zinc-600 stroke-[1.5]" />
                  <p className="font-medium">{t('auth.noAccounts')}</p>
                  <p className="text-[11px] text-zinc-600">Add a Microsoft, Offline, or Ely.by account above.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {accounts.map((acc) => {
                    const isActive = acc.uuid === activeAccount.uuid;
                    return (
                      <div
                        key={acc.uuid}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                          isActive
                            ? 'bg-cyan-950/20 border-cyan-800/80'
                            : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-zinc-300 text-xs">
                            {acc.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-200 text-xs">{acc.username}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 uppercase tracking-wider">
                                {acc.account_type}
                              </span>
                              {isActive && (
                                <span className="flex items-center gap-1 text-[10px] font-medium text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800">
                                  <Check className="w-2.5 h-2.5" /> {t('auth.active')}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate max-w-xs font-mono mt-0.5">
                              {acc.uuid}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {!isActive && (
                            <button
                              onClick={() => setActiveAccount(acc.uuid)}
                              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-[11px] font-medium"
                            >
                              {t('auth.switch')}
                            </button>
                          )}
                          <button
                            onClick={() => logout(acc.uuid)}
                            className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                            title={t('auth.remove')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Microsoft Login View */}
          {activeTab === 'microsoft' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span>{t('auth.microsoft.title')}</span>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  {t('auth.microsoft.description')}
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleMicrosoftLogin}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-medium shadow-md shadow-cyan-950/50 transition-all disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('auth.microsoft.signingIn')}</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4" />
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
              <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                  <User className="w-4 h-4 text-cyan-400" />
                  <span>{t('auth.offline.title')}</span>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  {t('auth.offline.description')}
                </p>
                <div className="space-y-1.5 pt-1">
                  <input
                    type="text"
                    value={offlineUsername}
                    onChange={(e) => setOfflineUsername(e.target.value)}
                    placeholder={t('auth.offline.placeholder')}
                    maxLength={16}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-hidden focus:border-cyan-500 font-mono text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !offlineUsername.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('auth.offline.button')}</span>
                </button>
              </div>
            </form>
          )}

          {/* Authlib-Injector / Ely.by Login View */}
          {activeTab === 'authlib' && (
            <form onSubmit={handleAuthlibLogin} className="space-y-4">
              <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <span>{t('auth.authlib.title')}</span>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  {t('auth.authlib.description')}
                </p>
                <div className="space-y-2 pt-1">
                  <input
                    type="text"
                    value={authlibServer}
                    onChange={(e) => setAuthlibServer(e.target.value)}
                    placeholder={t('auth.authlib.serverPlaceholder')}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-hidden focus:border-cyan-500 font-mono text-xs"
                  />
                  <input
                    type="text"
                    value={authlibUsername}
                    onChange={(e) => setAuthlibUsername(e.target.value)}
                    placeholder={t('auth.authlib.usernamePlaceholder')}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-hidden focus:border-cyan-500 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !authlibServer.trim() || !authlibUsername.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('auth.authlib.button')}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-zinc-800/80 bg-zinc-900/40 px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors text-xs"
          >
            {t('auth.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
