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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        data-testid="modpack-import-modal"
        className="w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--line-subtle)] bg-[var(--surface-2)] p-6 shadow-2xl relative overflow-hidden"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[var(--line-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--accent)]">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{t('modpack.import')}</h3>
              <p className="text-xs text-[var(--text-secondary)]">{t('modpack.selectFile')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-[var(--danger-soft)] border border-[var(--danger)]/40 rounded-[var(--radius-sm)] flex items-start gap-2 text-xs text-[var(--danger)]">
            <AlertCircle className="w-4 h-4 text-[var(--danger)] mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successInstance ? (
          <div className="mt-4 space-y-4">
            <div className="p-4 bg-[var(--success-soft)] border border-[var(--success)]/40 rounded-[var(--radius-md)] flex items-center gap-3 text-xs text-[var(--success)]">
              <CheckCircle2 className="w-5 h-5 text-[var(--success)] shrink-0" />
              <div>
                <div className="font-semibold text-[var(--success)]">{t('modpack.successImport')}</div>
                <div className="text-[var(--success)]/80 mt-0.5 font-mono">
                  {successInstance.name} ({successInstance.game_version} - {successInstance.loader || 'Vanilla'})
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-[var(--radius-sm)] text-xs font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-2)] text-[var(--text-primary)] transition-colors"
              >
                {t('mods.close')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleImport} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
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
                  className="flex-1 bg-[var(--surface-1)]/90 border border-[var(--line-subtle)] rounded-[var(--radius-sm)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-line)] font-mono"
                  required
                />
                <button
                  type="button"
                  data-testid="browse-modpack-file-btn"
                  onClick={handleBrowseFile}
                  disabled={isImporting}
                  className="px-3 py-2 rounded-[var(--radius-sm)] text-xs font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--line-subtle)] transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{t('modpack.browse', 'Browse')}</span>
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Supports Modrinth modpacks (.mrpack) and Aethel instance backups (.zip)
              </p>
            </div>

            {/* Inspecting Indicator */}
            {isInspecting && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                <span>Inspecting modpack metadata...</span>
              </div>
            )}

            {/* Preview Card */}
            {inspectResult && (
              <div className="p-4 bg-[var(--surface-1)]/80 border border-[var(--accent-line)] rounded-[var(--radius-md)] space-y-2">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--line-subtle)] flex items-center justify-center overflow-hidden shrink-0">
                    {inspectResult.icon_base64 ? (
                      <img src={inspectResult.icon_base64} alt={inspectResult.name} className="w-full h-full object-cover" />
                    ) : (
                      <Layers className="w-6 h-6 text-[var(--accent)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">{inspectResult.name}</h4>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--accent)]">
                        {inspectResult.version}
                      </span>
                    </div>
                    {inspectResult.summary && (
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">{inspectResult.summary}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3 text-[var(--text-muted)]" />
                        <span>{inspectResult.game_version} ({inspectResult.loader})</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3 text-[var(--text-muted)]" />
                        <span>{inspectResult.file_count} files</span>
                      </span>
                      {inspectResult.author && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-[var(--text-muted)]" />
                          <span>{inspectResult.author}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t('modpack.name')} (optional)
              </label>
              <input
                data-testid="import-instance-name"
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder="Leave blank to use name from package"
                disabled={isImporting}
                className="w-full bg-[var(--surface-1)]/90 border border-[var(--line-subtle)] rounded-[var(--radius-sm)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-line)]"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--line-subtle)]">
              <button
                type="button"
                onClick={onClose}
                disabled={isImporting}
                className="px-4 py-2 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t('mods.close')}
              </button>
              <button
                type="submit"
                data-testid="submit-import-btn"
                disabled={isImporting || !filePath.trim()}
                className="px-4 py-2 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--text-on-accent)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] hover:from-[var(--accent-from)] hover:to-[var(--accent-to)] shadow-md shadow-black/30 transition-all disabled:opacity-50 flex items-center gap-2"
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
