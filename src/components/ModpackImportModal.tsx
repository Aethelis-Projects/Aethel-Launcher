import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload,
  X,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderOpen,
  Layers,
  Package,
  User,
} from 'lucide-react';
import { commands, type Instance, type ModpackInspectResult } from '../bindings';
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
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectResult, setInspectResult] = useState<ModpackInspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successInstance, setSuccessInstance] = useState<Instance | null>(null);

  if (!isOpen) return null;

  const handleInspect = async (path: string) => {
    if (!path.trim()) return;
    setIsInspecting(true);
    try {
      const res = await commands.inspectModpack(path.trim());
      if (res.status === 'ok') {
        setInspectResult(res.data);
        if (!instanceName || instanceName === '') {
          setInstanceName(res.data.name);
        }
      }
    } catch {
      // Non-fatal if inspection fails (e.g. general zip)
    } finally {
      setIsInspecting(false);
    }
  };

  const handleBrowseFile = async () => {
    try {
      const res = await commands.pickFileDialog('Select Modpack', 'Modpacks', ['mrpack', 'zip']);
      if (res.status === 'ok' && res.data) {
        setFilePath(res.data);
        await handleInspect(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePath.trim()) return;

    setIsImporting(true);
    setError(null);
    setSuccessInstance(null);

    try {
      const cleanPath = filePath.trim();
      let res;
      if (cleanPath.toLowerCase().endsWith('.zip') && cleanPath.toLowerCase().includes('backup')) {
        res = await commands.importInstanceBackup(cleanPath);
      } else {
        res = await commands.importModpack(
          cleanPath,
          instanceName.trim() ? instanceName.trim() : null
        );
      }

      if (res && res.status === 'ok') {
        setSuccessInstance(res.data);
        // Refresh instance store
        const instList = await commands.getInstances();
        if (instList && instList.status === 'ok') {
          setInstances(instList.data);
        }
        if (onImportSuccess) {
          onImportSuccess(res.data);
        }
      } else if (res) {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
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
              <div className="flex gap-2">
                <input
                  data-testid="import-file-path"
                  type="text"
                  value={filePath}
                  onChange={(e) => {
                    setFilePath(e.target.value);
                    if (e.target.value.endsWith('.mrpack') || e.target.value.endsWith('.zip')) {
                      handleInspect(e.target.value);
                    }
                  }}
                  placeholder="C:/path/to/modpack.mrpack or backup.zip"
                  disabled={isImporting}
                  className="flex-1 bg-zinc-900/90 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
                <button
                  type="button"
                  data-testid="browse-modpack-file-btn"
                  onClick={handleBrowseFile}
                  disabled={isImporting}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{t('modpack.browse', 'Browse')}</span>
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Supports Modrinth modpacks (.mrpack) and Aethel instance backups (.zip)
              </p>
            </div>

            {/* Inspecting Indicator */}
            {isInspecting && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>Inspecting modpack metadata...</span>
              </div>
            )}

            {/* Preview Card */}
            {inspectResult && (
              <div className="p-4 bg-zinc-900/80 border border-cyan-500/30 rounded-xl space-y-2">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                    {inspectResult.icon_base64 ? (
                      <img src={inspectResult.icon_base64} alt={inspectResult.name} className="w-full h-full object-cover" />
                    ) : (
                      <Layers className="w-6 h-6 text-cyan-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-zinc-100 truncate">{inspectResult.name}</h4>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-cyan-400">
                        {inspectResult.version}
                      </span>
                    </div>
                    {inspectResult.summary && (
                      <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{inspectResult.summary}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3 text-zinc-500" />
                        <span>{inspectResult.game_version} ({inspectResult.loader})</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3 text-zinc-500" />
                        <span>{inspectResult.file_count} files</span>
                      </span>
                      {inspectResult.author && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-zinc-500" />
                          <span>{inspectResult.author}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

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
