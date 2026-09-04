import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAccountStore } from '../store/accountStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLogStore } from '../store/logStore';
import { commands, type LaunchReceipt } from '../bindings';
import { localizeError } from '../utils/errors';

export const StubLaunchButton: React.FC = () => {
  const { t } = useTranslation();
  const { activeAccount } = useAccountStore();
  const { maxRamMb } = useSettingsStore();
  const { addLog } = useLogStore();

  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<LaunchReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLaunch = async () => {
    setLoading(true);
    setError(null);
    addLog(`[Aethel] Requesting dry-run launch with stub player "${activeAccount.name}"...`, false);

    try {
      const res = await commands.launchWithStubIdentity('1.20.4', maxRamMb);
      if (res.status === 'ok') {
        setReceipt(res.data);
        addLog(`[Aethel] Dry-run launch successful! Tier: ${res.data.classpath_tier}`, false);
        addLog(`[Aethel] Command: ${res.data.command}`, false);
        addLog(`[Aethel] User identity: ${activeAccount.name} (${activeAccount.uuid})`, false);
      } else {
        setError(res.error);
        addLog(`[Aethel Error] Launch error: ${res.error}`, true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog(`[Aethel Error] Exception: ${msg}`, true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-semibold text-zinc-200">{t('stub.title')}</h4>
        </div>
        <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700/50">
          {activeAccount.userType}
        </span>
      </div>

      <p className="text-[11px] text-zinc-400">{t('stub.description')}</p>

      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/50">
        <div>
          <span className="text-zinc-500 block text-[10px]">{t('stub.playerName')}:</span>
          <span className="text-zinc-200">{activeAccount.name}</span>
        </div>
        <div>
          <span className="text-zinc-500 block text-[10px]">{t('stub.uuid')}:</span>
          <span className="text-zinc-200 truncate block">{activeAccount.uuid}</span>
        </div>
      </div>

      {error && (
        <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded-lg flex items-start gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">{localizeError(error, t).title}: </span>
            <span>{localizeError(error, t).message}</span>
          </div>
        </div>
      )}

      {receipt && (
        <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-lg flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{t('stub.dryRunSuccess')}</span>
          </div>
          <span className="font-mono text-[10px] text-emerald-400">{receipt.classpath_tier}</span>
        </div>
      )}

      <button
        disabled={loading}
        onClick={handleLaunch}
        className={`w-full py-2 px-4 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-all ${
          loading
            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-md shadow-cyan-950'
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('instances.launching')}</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-current" />
            <span>{t('instances.launch')} (1.20.4 Stub)</span>
          </>
        )}
      </button>
    </div>
  );
};
