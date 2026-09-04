import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, FileArchive, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { commands, type Instance } from '../bindings';
import { useInstanceStore } from '../store/instanceStore';

interface ModpackImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (instance: Instance) => void;
}

export const ModpackImportModal: React.FC<ModpackImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const { t } = useTranslation();
  const { setInstances } = useInstanceStore();

  const [filePath, setFilePath] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInstance, setSuccessInstance] = useState<Instance | null>(null);

  if (!isOpen) return null;

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePath.trim()) return;

    setIsImporting(true);
    setError(null);
    setSuccessInstance(null);

    try {
      const cleanPath = filePath.trim();
      const isZip = cleanPath.toLowerCase().endsWith('.zip');

      let res;
      if (isZip) {
        res = await commands.importInstanceBackup(cleanPath);
      } else {
        res = await commands.importModpack(
          cleanPath,
          instanceName.trim() ? instanceName.trim() : null
        );
      }

      if (res.status === 'ok') {
        setSuccessInstance(res.data);
        // Refresh instance store
        const instList = await commands.getInstances();
        if (instList.status === 'ok') {
          setInstances(instList.data);
        }
        if (onImportSuccess) {
          onImportSuccess(res.data);
        }
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        data-testid="modpack-import-modal"
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl relative overflow-hidden"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-100">{t('modpack.import')}</h3>
              <p className="text-xs text-zinc-400">{t('modpack.selectFile')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-950/40 border border-red-800/80 rounded-lg flex items-start gap-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successInstance ? (
          <div className="mt-4 space-y-4">
            <div className="p-4 bg-emerald-950/40 border border-emerald-800/80 rounded-xl flex items-center gap-3 text-xs text-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="font-semibold text-emerald-100">{t('modpack.successImport')}</div>
                <div className="text-emerald-300/80 mt-0.5 font-mono">
                  {successInstance.name} ({successInstance.game_version} - {successInstance.loader || 'Vanilla'})
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              >
                {t('mods.close')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleImport} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                {t('modpack.selectFile')}
              </label>
              <div className="relative">
                <input
                  data-testid="import-file-path"
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="C:/path/to/modpack.mrpack or backup.zip"
                  disabled={isImporting}
                  className="w-full bg-zinc-900/90 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Supports Modrinth modpacks (.mrpack) and Aethel instance backups (.zip)
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                {t('modpack.name')} (optional)
              </label>
              <input
                data-testid="import-instance-name"
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder="Leave blank to use name from package"
                disabled={isImporting}
                className="w-full bg-zinc-900/90 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={onClose}
                disabled={isImporting}
                className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
              >
                {t('mods.close')}
              </button>
              <button
                type="submit"
                data-testid="submit-import-btn"
                disabled={isImporting || !filePath.trim()}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-md shadow-cyan-950 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('modpack.importing')}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t('modpack.import')}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
