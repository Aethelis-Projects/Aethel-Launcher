import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
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
  const prefersReducedMotion = useReducedMotion();
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
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 p-4 backdrop-blur-md"
    >
      <motion.div
        data-testid="modpack-import-modal"
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/80 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-2 text-[var(--accent-from)]">
              <FileArchive className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{t('modpack.import')}</h3>
              <p className="text-xs text-[var(--text-secondary)]">{t('modpack.selectFile')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-3 text-xs text-[var(--text-primary)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
              <span>{error}</span>
            </div>
          )}

          {successInstance ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--success)]/40 bg-[var(--success-soft)] p-4 text-xs text-[var(--text-primary)]">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--success)]" />
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">{t('modpack.successImport')}</div>
                  <div className="mt-0.5 font-mono text-[var(--text-secondary)]">
                    {successInstance.name} ({successInstance.game_version} - {successInstance.loader || 'Vanilla'})
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                >
                  {t('mods.close')}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleImport} className="space-y-4">
              {/* File Dropzone */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  {t('modpack.selectFile')}
                </label>
                <div className="rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--line-strong)] p-3 transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]/50">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 shrink-0 text-[var(--accent-from)]" />
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
                      className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-from)] focus:outline-none disabled:opacity-50"
                      required
                    />
                    <button
                      type="button"
                      data-testid="browse-modpack-file-btn"
                      onClick={handleBrowseFile}
                      disabled={isImporting}
                      className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-50"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>{t('modpack.browse', 'Browse')}</span>
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                    Supports Modrinth modpacks (.mrpack) and Aethel instance backups (.zip)
                  </p>
                </div>

                {/* Selected File Row-Card */}
                {filePath.trim() !== '' && (
                  <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 px-3 py-2">
                    <FileArchive className="h-3.5 w-3.5 shrink-0 text-[var(--accent-from)]" />
                    <span className="truncate font-mono text-[11px] tabular-nums text-[var(--text-secondary)]" title={filePath}>
                      {filePath}
                    </span>
                  </div>
                )}
              </div>

              {/* Inspecting Indicator */}
              {isInspecting && (
                <div className="flex items-center gap-2 py-1 text-xs text-[var(--text-secondary)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-from)]" />
                  <span>Inspecting modpack metadata...</span>
                </div>
              )}

              {/* Preview Card */}
              {inspectResult && (
                <div className="rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--surface-1)]/80 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)]">
                      {inspectResult.icon_base64 ? (
                        <img src={inspectResult.icon_base64} alt={inspectResult.name} className="h-full w-full object-cover ring-1 ring-white/10" />
                      ) : (
                        <Layers className="h-6 w-6 text-[var(--accent-from)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-xs font-bold text-[var(--text-primary)]">{inspectResult.name}</h4>
                        <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--accent-from)]">
                          {inspectResult.version}
                        </span>
                      </div>
                      {inspectResult.summary && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-pretty text-[var(--text-secondary)]">{inspectResult.summary}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-secondary)]">
                        <span className="flex items-center gap-1">
                          <Package className="h-3 w-3 text-[var(--text-muted)]" />
                          <span>{inspectResult.game_version} ({inspectResult.loader})</span>
                        </span>
                        <span className="flex items-center gap-1 tabular-nums">
                          <Layers className="h-3 w-3 text-[var(--text-muted)]" />
                          <span>{inspectResult.file_count} files</span>
                        </span>
                        {inspectResult.author && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3 text-[var(--text-muted)]" />
                            <span>{inspectResult.author}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Instance Name */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  {t('modpack.name')} (optional)
                </label>
                <input
                  data-testid="import-instance-name"
                  type="text"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Leave blank to use name from package"
                  disabled={isImporting}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-from)] focus:outline-none disabled:opacity-50"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-[var(--line-subtle)] pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isImporting}
                  className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-50"
                >
                  {t('mods.close')}
                </button>
                <button
                  type="submit"
                  data-testid="submit-import-btn"
                  disabled={isImporting || !filePath.trim()}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-4 py-2 text-xs font-semibold text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{t('modpack.importing')}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      <span>{t('modpack.import')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
