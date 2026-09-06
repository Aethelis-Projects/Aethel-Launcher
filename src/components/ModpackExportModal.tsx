import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 backdrop-blur-sm p-4">
      <div
        data-testid="modpack-export-modal"
        className="w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--line-subtle)] bg-[var(--surface-2)] p-6 shadow-2xl relative overflow-hidden"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[var(--line-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--accent)]">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{t('modpack.export')}</h3>
              <p className="text-xs text-[var(--text-secondary)]">{instance.name} ({instance.game_version})</p>
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

        {success ? (
          <div className="mt-4 space-y-4">
            <div className="p-4 bg-[var(--success-soft)] border border-[var(--success)]/40 rounded-[var(--radius-md)] flex items-center gap-3 text-xs text-[var(--success)]">
              <CheckCircle2 className="w-5 h-5 text-[var(--success)] shrink-0" />
              <div>
                <div className="font-semibold text-[var(--success)]">{t('modpack.successExport')}</div>
                <div className="text-[var(--success)]/80 mt-0.5 font-mono break-all">{outputPath}</div>
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
          <form onSubmit={handleExport} className="mt-4 space-y-4">
            {/* Format Selection */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t('modpack.format')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  data-testid="format-mrpack-btn"
                  onClick={() => handleFormatChange('mrpack')}
                  className={`p-3 rounded-[var(--radius-md)] border text-left transition-all ${
                    format === 'mrpack'
                      ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent)]'
                      : 'bg-[var(--surface-1)]/60 border-[var(--line-subtle)] text-[var(--text-secondary)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  <div className="text-xs font-semibold">{t('modpack.mrpack')}</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Modrinth format (.mrpack)</div>
                </button>

                <button
                  type="button"
                  data-testid="format-zip-btn"
                  onClick={() => handleFormatChange('zip')}
                  className={`p-3 rounded-[var(--radius-md)] border text-left transition-all ${
                    format === 'zip'
                      ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] text-[var(--accent)]'
                      : 'bg-[var(--surface-1)]/60 border-[var(--line-subtle)] text-[var(--text-secondary)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  <div className="text-xs font-semibold">{t('modpack.zip')}</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Full instance backup (.zip)</div>
                </button>
              </div>
            </div>

            {/* Metadata Fields */}
            {format === 'mrpack' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                      {t('modpack.name')}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isExporting}
                      className="w-full bg-[var(--surface-1)]/90 border border-[var(--line-subtle)] rounded-[var(--radius-sm)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-line)]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                      {t('modpack.version')}
                    </label>
                    <input
                      type="text"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      disabled={isExporting}
                      className="w-full bg-[var(--surface-1)]/90 border border-[var(--line-subtle)] rounded-[var(--radius-sm)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-line)] font-mono"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    {t('modpack.summary')}
                  </label>
                  <input
                    type="text"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Short description of this modpack"
                    disabled={isExporting}
                    className="w-full bg-[var(--surface-1)]/90 border border-[var(--line-subtle)] rounded-[var(--radius-sm)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-line)]"
                  />
                </div>
              </>
            ) : (
              <div className="p-3 bg-[var(--surface-1)]/60 border border-[var(--line-subtle)] rounded-[var(--radius-md)] space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={includeSaves}
                    onChange={(e) => setIncludeSaves(e.target.checked)}
                    className="rounded border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--accent)] focus:ring-0"
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
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Output File Destination
              </label>
              <input
                data-testid="export-output-path"
                type="text"
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                disabled={isExporting}
                className="w-full bg-[var(--surface-1)]/90 border border-[var(--line-subtle)] rounded-[var(--radius-sm)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-line)] font-mono"
                required
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--line-subtle)]">
              <button
                type="button"
                onClick={onClose}
                disabled={isExporting}
                className="px-4 py-2 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t('mods.close')}
              </button>
              <button
                type="submit"
                data-testid="submit-export-btn"
                disabled={isExporting || !outputPath.trim()}
                className="px-4 py-2 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--text-on-accent)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] hover:from-[var(--accent-from)] hover:to-[var(--accent-to)] shadow-md shadow-black/30 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('modpack.exporting')}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('modpack.export')}</span>
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
