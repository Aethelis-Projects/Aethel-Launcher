import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  X,
  Coffee,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Trash2,
  Check,
  Copy,
  Terminal,
  Server,
  Layers,
  Sparkles,
} from 'lucide-react';
import { commands, type DetectedJava, type JavaTestResult } from '../bindings';
import { useSettingsStore, type PreferredJavaProvider } from '../store/settingsStore';

interface JavaManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CompatibilityRow {
  gameRange: string;
  major: number;
  note: string;
  isLts: boolean;
}

const COMPATIBILITY_ROWS: CompatibilityRow[] = [
  { gameRange: '1.7.10 – 1.16.5', major: 8, note: 'Legacy Forge / Fabric', isLts: true },
  { gameRange: '1.17 – 1.17.1', major: 16, note: 'Caves & Cliffs Part 1', isLts: false },
  { gameRange: '1.18 – 1.20.4', major: 17, note: 'Modern Standard (LTS)', isLts: true },
  { gameRange: '1.20.5 – 1.21.x', major: 21, note: 'Tricky Trials & Latest Stable (LTS)', isLts: true },
  { gameRange: '25w+ / 26.x+', major: 25, note: 'Next-Gen Snapshots & Future (LTS)', isLts: true },
];

const DOWNLOADABLE_MAJORS = [
  { major: 21, title: 'Java 21 (LTS)', subtitle: 'Minecraft 1.20.5 – 1.21.x (Recommended)', default: true },
  { major: 17, title: 'Java 17 (LTS)', subtitle: 'Minecraft 1.18 – 1.20.4', default: false },
  { major: 8, title: 'Java 8 (LTS)', subtitle: 'Minecraft 1.7.10 – 1.16.5', default: false },
  { major: 25, title: 'Java 25 (LTS)', subtitle: 'Minecraft 25w+ / 26.x+ Snapshots', default: false },
];

export const JavaManagerModal: React.FC<JavaManagerModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const { preferredProvider, setPreferredProvider } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'installed' | 'matrix' | 'download'>('installed');
  const [javas, setJavas] = useState<DetectedJava[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [downloadingMajor, setDownloadingMajor] = useState<number | null>(null);
  const [deletingMajor, setDeletingMajor] = useState<number | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Test Dialog State
  const [testState, setTestState] = useState<{
    isOpen: boolean;
    result: JavaTestResult | null;
    testingPath: string;
    isTesting: boolean;
  }>({
    isOpen: false,
    result: null,
    testingPath: '',
    isTesting: false,
  });

  const refreshJavas = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await commands.detectSystemJavas();
      if (res.status === 'ok') {
        setJavas(Array.isArray(res.data) ? res.data : []);
      } else {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to detect Java runtimes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshJavas();
    }
  }, [isOpen, refreshJavas]);

  if (!isOpen) return null;

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
    setCopiedPath(path);
    setTimeout(() => setCopiedPath((prev) => (prev === path ? null : prev)), 2000);
  };

  const handleTestJava = async (path: string) => {
    setTestState({
      isOpen: true,
      result: null,
      testingPath: path,
      isTesting: true,
    });
    try {
      const res = await commands.testJavaPath(path);
      if (res.status === 'ok') {
        setTestState((prev) => ({ ...prev, result: res.data, isTesting: false }));
      } else {
        setTestState((prev) => ({
          ...prev,
          result: {
            valid: false,
            version: null,
            major: null,
            vendor: null,
            arch: null,
            output: '',
            error: res.error,
          },
          isTesting: false,
        }));
      }
    } catch (err: any) {
      setTestState((prev) => ({
        ...prev,
        result: {
          valid: false,
          version: null,
          major: null,
          vendor: null,
          arch: null,
          output: '',
          error: err?.message || 'Execution error',
        },
        isTesting: false,
      }));
    }
  };

  const handleDownload = async (major: number) => {
    setDownloadingMajor(major);
    setError(null);
    try {
      const res = await commands.downloadRuntime(major, preferredProvider);
      if (res.status === 'ok') {
        await refreshJavas();
      } else {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err?.message || `Failed to download Java ${major}`);
    } finally {
      setDownloadingMajor(null);
    }
  };

  const handleDelete = async (major: number) => {
    setDeletingMajor(major);
    setError(null);
    try {
      const res = await commands.deleteRuntime(major);
      if (res.status === 'ok') {
        await refreshJavas();
      } else {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err?.message || `Failed to delete Java ${major}`);
    } finally {
      setDeletingMajor(null);
    }
  };

  const javaList = Array.isArray(javas) ? javas : [];
  const managedCount = javaList.filter((j) => j.source === 'Managed').length;
  const systemCount = javaList.filter((j) => j.source === 'System').length;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-from)]">
              <Coffee className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  {t('javaManager.title', 'Java Runtime Manager')}
                </h2>
                <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                  {javas.length} total ({managedCount} managed, {systemCount} system)
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {t('javaManager.subtitle', 'Configure Java environments, check compatibility, and test runtimes')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshJavas}
              disabled={isLoading}
              className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] p-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
              title={t('common.refresh', 'Refresh')}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-[var(--accent-from)]' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/60 px-4 py-2 text-xs">
          <button
            onClick={() => setActiveTab('installed')}
            className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5 font-medium transition-all cursor-pointer ${
              activeTab === 'installed'
                ? 'bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] font-semibold text-[var(--text-on-accent)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>{t('javaManager.installedTab', 'Installed Runtimes')} ({javas.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5 font-medium transition-all cursor-pointer ${
              activeTab === 'matrix'
                ? 'bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] font-semibold text-[var(--text-on-accent)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>{t('javaManager.matrixTab', 'Compatibility Matrix')}</span>
          </button>
          <button
            onClick={() => setActiveTab('download')}
            className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5 font-medium transition-all cursor-pointer ${
              activeTab === 'download'
                ? 'bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] font-semibold text-[var(--text-on-accent)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t('javaManager.downloadTab', 'Download Java')}</span>
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mx-4 mt-3 flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-2.5 text-xs text-[var(--danger)]">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-[var(--danger)] hover:opacity-80 cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* TAB 1: INSTALLED RUNTIMES */}
          {activeTab === 'installed' && (
            <div className="space-y-3">
              {isLoading && javas.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center text-[var(--text-secondary)]">
                  <Loader2 className="h-7 w-7 animate-spin text-[var(--accent-from)]" />
                  <span className="text-xs">{t('javaManager.scanning', 'Scanning system & launcher runtimes...')}</span>
                </div>
              ) : javas.length === 0 ? (
                <div className="space-y-2 py-12 text-center text-[var(--text-muted)]">
                  <p className="text-xs">{t('javaManager.noneFound', 'No Java runtimes found on this system.')}</p>
                  <button
                    onClick={() => setActiveTab('download')}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-3 py-1.5 text-xs font-semibold text-[var(--text-on-accent)] shadow-sm transition-all hover:brightness-110 active:scale-95 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{t('javaManager.downloadPrompt', 'Download Recommended Java 21')}</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {javas.map((j) => {
                    const isManaged = j.source === 'Managed';
                    const isDeleting = deletingMajor === j.major && isManaged;

                    return (
                      <div
                        key={j.path}
                        className={`flex items-center justify-between gap-3 rounded-[var(--radius-md)] border p-3 transition-colors ${
                          isManaged
                            ? 'border-[var(--accent-line)] bg-[var(--surface-1)]/90 hover:border-[var(--accent-from)]'
                            : 'border-[var(--line-subtle)] bg-[var(--surface-1)]/60 hover:border-[var(--line-strong)]'
                        }`}
                      >
                        {/* Info Left */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                              <span className="h-2 w-2 rounded-full bg-[var(--accent-from)]" />
                              Java {j.major}
                            </span>
                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                              v{j.version}
                            </span>
                            {j.vendor && (
                              <span className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                                {j.vendor}
                              </span>
                            )}
                            <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                              {j.arch}
                            </span>
                            {isManaged ? (
                              <span className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-from)]">
                                Managed
                              </span>
                            ) : (
                              <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                                System
                              </span>
                            )}
                          </div>

                          {/* Path with Copy */}
                          <div className="group flex items-center gap-2">
                            <code
                              className="max-w-lg truncate select-all rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]"
                              title={j.path}
                            >
                              {j.path}
                            </code>
                            <button
                              onClick={() => handleCopyPath(j.path)}
                              className="cursor-pointer p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                              title={t('common.copy', 'Copy path')}
                            >
                              {copiedPath === j.path ? (
                                <Check className="h-3 w-3 text-[var(--success)]" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Actions Right */}
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => handleTestJava(j.path)}
                            className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]"
                          >
                            <Terminal className="h-3 w-3 text-[var(--accent-from)]" />
                            <span>{t('javaManager.test', 'Test')}</span>
                          </button>

                          {isManaged && (
                            <button
                              onClick={() => handleDelete(j.major)}
                              disabled={isDeleting}
                              className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-2 py-1 text-xs text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]/80 disabled:opacity-50"
                              title={t('common.delete', 'Delete managed runtime')}
                              aria-label="Delete managed runtime"
                              data-testid={`delete-runtime-${j.major}`}
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COMPATIBILITY MATRIX */}
          {activeTab === 'matrix' && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-3.5 text-xs text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--accent-from)]" />
                  <span>{t('javaManager.matrixGuideTitle', 'Minecraft Java Version Compatibility')}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t(
                    'javaManager.matrixGuideDesc',
                    'Aethel Launcher automatically provisions and selects the exact Java runtime required by your Minecraft version. You can verify coverage below.'
                  )}
                </p>
              </div>

              <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/40">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[var(--line-subtle)] bg-[var(--surface-3)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    <tr>
                      <th className="p-3">{t('javaManager.colMinecraft', 'Minecraft Version')}</th>
                      <th className="p-3">{t('javaManager.colRequired', 'Required Java')}</th>
                      <th className="p-3">{t('javaManager.colDetected', 'Detected Runtimes')}</th>
                      <th className="p-3 text-right">{t('javaManager.colStatus', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line-subtle)] text-xs text-[var(--text-secondary)]">
                    {COMPATIBILITY_ROWS.map((row) => {
                      const matches = javas.filter((j) => j.major === row.major);
                      const isReady = matches.length > 0;
                      const isDownloading = downloadingMajor === row.major;

                      return (
                        <tr key={row.major} className="transition-colors hover:bg-[var(--surface-3)]/40">
                          <td className="p-3">
                            <div className="font-semibold text-[var(--text-primary)]">{row.gameRange}</div>
                            <div className="text-[10px] text-[var(--text-muted)]">{row.note}</div>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-[var(--accent-from)]">Java {row.major}</span>
                            {row.isLts && (
                              <span className="ml-1 rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">
                                LTS
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {isReady ? (
                              <div className="space-y-0.5">
                                {matches.slice(0, 2).map((m) => (
                                  <div key={m.path} className="flex items-center gap-1.5 text-[11px]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                                    <span className="text-[var(--text-primary)]">
                                      {m.vendor || 'Java'} {m.version}
                                    </span>
                                    <span className="rounded bg-[var(--surface-3)] px-1 text-[9px] text-[var(--text-muted)]">
                                      {m.source}
                                    </span>
                                  </div>
                                ))}
                                {matches.length > 2 && (
                                  <div className="text-[10px] text-[var(--text-muted)]">
                                    +{matches.length - 2} more
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] italic text-[var(--text-muted)]">
                                {t('javaManager.noRuntimeInstalled', 'Not found')}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {isReady ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/40 bg-[var(--success-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--success)]">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>{t('javaManager.ready', 'Ready')}</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleDownload(row.major)}
                                disabled={isDownloading}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-on-accent)] shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
                              >
                                {isDownloading ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>{t('common.downloading', 'Downloading...')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-3 w-3" />
                                    <span>{t('common.download', 'Download')}</span>
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: DOWNLOAD MANAGED JAVA */}
          {activeTab === 'download' && (
            <div className="space-y-4">
              {/* Vendor Selector */}
              <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)]">
                    {t('settings.javaProvider', 'Preferred Java Vendor')}
                  </label>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    Choose vendor for clean JDK builds with verified SHA-256 checksums
                  </p>
                </div>
                <select
                  value={preferredProvider}
                  onChange={(e) => setPreferredProvider(e.target.value as PreferredJavaProvider)}
                  className="cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
                >
                  <option value="Adoptium">Eclipse Adoptium (Temurin)</option>
                  <option value="Zulu">Azul Zulu</option>
                </select>
              </div>

              {/* Download Cards Grid */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {DOWNLOADABLE_MAJORS.map((item) => {
                  const installed = javas.find((j) => j.major === item.major && j.source === 'Managed');
                  const isDownloading = downloadingMajor === item.major;

                  return (
                    <div
                      key={item.major}
                      className="flex flex-col justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4 transition-colors hover:border-[var(--line-strong)]"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[var(--text-primary)]">{item.title}</span>
                          {installed ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/40 bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--success)]">
                              <CheckCircle2 className="h-3 w-3" />
                              Installed
                            </span>
                          ) : (
                            <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                              Not installed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">{item.subtitle}</p>
                      </div>

                      <div className="flex items-center justify-between border-t border-[var(--line-subtle)] pt-2">
                        <span className="font-mono text-[11px] text-[var(--text-muted)]">
                          {preferredProvider}
                        </span>
                        {installed ? (
                          <button
                            onClick={() => handleDelete(item.major)}
                            disabled={deletingMajor === item.major}
                            className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-1 text-xs text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]/80"
                          >
                            {deletingMajor === item.major ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            <span>Reinstall</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDownload(item.major)}
                            disabled={isDownloading}
                            className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text-on-accent)] shadow-[var(--shadow-glow)] transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
                          >
                            {isDownloading ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Downloading...</span>
                              </>
                            ) : (
                              <>
                                <Download className="h-3.5 w-3.5" />
                                <span>Download</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-3 text-xs text-[var(--text-muted)]">
          <span>{javas.length} runtime(s) registered in launcher</span>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-4 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]"
          >
            {t('common.close', 'Close')}
          </button>
        </div>
      </motion.div>

      {/* Test Output Modal Dialog (Prism-Style) */}
      {testState.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 p-4 backdrop-blur-md"
          onClick={() => setTestState((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-[var(--accent-from)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t('javaManager.testDialogTitle', 'Java Verification Output')}
                </h3>
              </div>
              <button
                onClick={() => setTestState((prev) => ({ ...prev, isOpen: false }))}
                className="cursor-pointer rounded-[var(--radius-sm)] p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Tested Binary
                </label>
                <code className="block select-all break-all rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] p-2 font-mono text-xs text-[var(--text-primary)]">
                  {testState.testingPath}
                </code>
              </div>

              {testState.isTesting ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-[var(--text-secondary)]">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-from)]" />
                  <span className="text-xs">Running java -version...</span>
                </div>
              ) : testState.result ? (
                <div className="space-y-3">
                  {/* Status Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    {testState.result.valid ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--success)]/40 bg-[var(--success-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--success)]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Valid Java Binary
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--danger)]">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Invalid / Incompatible
                      </span>
                    )}

                    {testState.result.version && (
                      <span className="rounded bg-[var(--surface-3)] px-2 py-0.5 font-mono text-xs text-[var(--text-secondary)]">
                        Version: {testState.result.version}
                      </span>
                    )}

                    {testState.result.major && (
                      <span className="rounded border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-from)]">
                        Major: Java {testState.result.major}
                      </span>
                    )}

                    {testState.result.vendor && (
                      <span className="rounded bg-[var(--surface-3)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                        {testState.result.vendor}
                      </span>
                    )}
                  </div>

                  {testState.result.error && (
                    <div className="rounded-[var(--radius-sm)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-2.5 text-xs text-[var(--danger)]">
                      {testState.result.error}
                    </div>
                  )}

                  {/* Terminal Raw Output */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Standard Output / Error
                    </label>
                    <pre className="max-h-48 select-all overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-0)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      {testState.result.output || '(No output produced)'}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end border-t border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-3">
              <button
                onClick={() => setTestState((prev) => ({ ...prev, isOpen: false }))}
                className="cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-4 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
