import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Download, X, FileArchive, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { commands, type Instance } from '../bindings';

interface ModpackExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: Instance;
}

export const ModpackExportModal: React.FC<ModpackExportModalProps> = ({
  isOpen,
  onClose,
  instance,
}) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();

  const [format, setFormat] = useState<'mrpack' | 'zip'>('mrpack');
  const [name, setName] = useState(instance.name);
  const [version, setVersion] = useState('1.0.0');
  const [summary, setSummary] = useState('');
  const [outputPath, setOutputPath] = useState(
    `C:/exports/${instance.name.toLowerCase().replace(/\s+/g, '-')}.${format}`
  );
  const [includeSaves, setIncludeSaves] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleFormatChange = (newFormat: 'mrpack' | 'zip') => {
    setFormat(newFormat);
    setOutputPath(
      `C:/exports/${instance.name.toLowerCase().replace(/\s+/g, '-')}.${newFormat}`
    );
  };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outputPath.trim()) return;

    setIsExporting(true);
    setError(null);
    setSuccess(false);

    try {
      if (format === 'mrpack') {
        const res = await commands.exportModpack(
          instance.id,
          outputPath.trim(),
          name.trim() || instance.name,
          version.trim() || '1.0.0',
          summary.trim() ? summary.trim() : null
        );
        if (res.status === 'ok') {
          setSuccess(true);
        } else {
          setError(res.error);
        }
      } else {
        const res = await commands.exportInstanceBackup(
          instance.id,
          outputPath.trim(),
          includeSaves
        );
        if (res.status === 'ok') {
          setSuccess(true);
        } else {
          setError(res.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
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
        data-testid="modpack-export-modal"
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
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{t('modpack.export')}</h3>
              <p className="text-xs tabular-nums text-[var(--text-secondary)]">{instance.name} ({instance.game_version})</p>
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

          {success ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--success)]/40 bg-[var(--success-soft)] p-4 text-xs text-[var(--text-primary)]">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--success)]" />
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">{t('modpack.successExport')}</div>
                  <div className="mt-0.5 break-all font-mono text-[var(--text-secondary)]">{outputPath}</div>
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
            <form onSubmit={handleExport} className="space-y-4">
              {/* Format Selection */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  {t('modpack.format')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    data-testid="format-mrpack-btn"
                    onClick={() => handleFormatChange('mrpack')}
                    className={`rounded-[var(--radius-md)] border p-3 text-left transition-all ${
                      format === 'mrpack'
                        ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--text-primary)] ring-1 ring-[var(--accent-line)]'
                        : 'border-[var(--line-subtle)] bg-[var(--surface-1)]/80 text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <FileArchive className={`h-3.5 w-3.5 ${format === 'mrpack' ? 'text-[var(--accent-from)]' : 'text-[var(--text-muted)]'}`} />
                      <span>{t('modpack.mrpack')}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">Modrinth format (.mrpack)</div>
                  </button>

                  <button
                    type="button"
                    data-testid="format-zip-btn"
                    onClick={() => handleFormatChange('zip')}
                    className={`rounded-[var(--radius-md)] border p-3 text-left transition-all ${
                      format === 'zip'
                        ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--text-primary)] ring-1 ring-[var(--accent-line)]'
                        : 'border-[var(--line-subtle)] bg-[var(--surface-1)]/80 text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <FileArchive className={`h-3.5 w-3.5 ${format === 'zip' ? 'text-[var(--accent-from)]' : 'text-[var(--text-muted)]'}`} />
                      <span>{t('modpack.zip')}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">Full instance backup (.zip)</div>
                  </button>
                </div>
              </div>

              {/* Metadata Fields */}
              {format === 'mrpack' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                        {t('modpack.name')}
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={isExporting}
                        className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none disabled:opacity-50"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                        {t('modpack.version')}
                      </label>
                      <input
                        type="text"
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        disabled={isExporting}
                        className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 font-mono text-xs tabular-nums text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none disabled:opacity-50"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                      {t('modpack.summary')}
                    </label>
                    <input
                      type="text"
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder="Short description of this modpack"
                      disabled={isExporting}
                      className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-from)] focus:outline-none disabled:opacity-50"
                    />
                  </div>
                </>
              ) : (
                /* Options Row-Card with Accent Checkbox */
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-3 text-xs text-[var(--text-primary)] transition-colors hover:border-[var(--line-strong)]">
                    <input
                      type="checkbox"
                      checked={includeSaves}
                      onChange={(e) => setIncludeSaves(e.target.checked)}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-3)] accent-[var(--accent-to)] checked:border-[var(--accent-to)]"
                    />
                    <span>{t('modpack.includeSaves')}</span>
                  </label>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Excludes platform-specific binaries and cache (libraries/, natives/, logs/).
                  </p>
                </div>
              )}

              {/* Output File Path */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Output File Destination
                </label>
                <input
                  data-testid="export-output-path"
                  type="text"
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  disabled={isExporting}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none disabled:opacity-50"
                  required
                />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-[var(--line-subtle)] pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isExporting}
                  className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-50"
                >
                  {t('mods.close')}
                </button>
                <button
                  type="submit"
                  data-testid="submit-export-btn"
                  disabled={isExporting || !outputPath.trim()}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-4 py-2 text-xs font-semibold text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{t('modpack.exporting')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      <span>{t('modpack.export')}</span>
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
