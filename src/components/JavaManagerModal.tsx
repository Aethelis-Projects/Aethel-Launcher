import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
        setJavas(res.data);
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

  const managedCount = javas.filter((j) => j.source === 'Managed').length;
  const systemCount = javas.filter((j) => j.source === 'System').length;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-100">
                  {t('javaManager.title', 'Java Runtime Manager')}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-mono">
                  {javas.length} total ({managedCount} managed, {systemCount} system)
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {t('javaManager.subtitle', 'Configure Java environments, check compatibility, and test runtimes')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshJavas}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
              title={t('common.refresh', 'Refresh')}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 px-4 py-2 bg-zinc-900/20 border-b border-zinc-800/60 text-xs">
          <button
            onClick={() => setActiveTab('installed')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'installed'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>{t('javaManager.installedTab', 'Installed Runtimes')} ({javas.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'matrix'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('javaManager.matrixTab', 'Compatibility Matrix')}</span>
          </button>
          <button
            onClick={() => setActiveTab('download')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'download'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('javaManager.downloadTab', 'Download Java')}</span>
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mx-4 mt-3 p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: INSTALLED RUNTIMES */}
          {activeTab === 'installed' && (
            <div className="space-y-3">
              {isLoading && javas.length === 0 ? (
                <div className="py-16 text-center text-zinc-400 flex flex-col items-center gap-3">
                  <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
                  <span className="text-xs">{t('javaManager.scanning', 'Scanning system & launcher runtimes...')}</span>
                </div>
              ) : javas.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 space-y-2">
                  <p className="text-xs">{t('javaManager.noneFound', 'No Java runtimes found on this system.')}</p>
                  <button
                    onClick={() => setActiveTab('download')}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded-lg font-medium transition-colors inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
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
                        className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                          isManaged
                            ? 'bg-zinc-900/70 border-cyan-900/40 hover:border-cyan-700/60'
                            : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                        }`}
                      >
                        {/* Info Left */}
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-zinc-100 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-cyan-400" />
                              Java {j.major}
                            </span>
                            <span className="text-[11px] text-zinc-400 font-mono">
                              v{j.version}
                            </span>
                            {j.vendor && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-medium">
                                {j.vendor}
                              </span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 font-mono">
                              {j.arch}
                            </span>
                            {isManaged ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/70 font-semibold">
                                Managed
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/60">
                                System
                              </span>
                            )}
                          </div>

                          {/* Path with Copy */}
                          <div className="flex items-center gap-2 group">
                            <code
                              className="text-[10px] font-mono text-zinc-400 truncate max-w-lg select-all bg-zinc-950/60 px-1.5 py-0.5 rounded border border-zinc-800/60"
                              title={j.path}
                            >
                              {j.path}
                            </code>
                            <button
                              onClick={() => handleCopyPath(j.path)}
                              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 cursor-pointer"
                              title={t('common.copy', 'Copy path')}
                            >
                              {copiedPath === j.path ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Actions Right */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleTestJava(j.path)}
                            className="px-2.5 py-1 text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-700/80 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Terminal className="w-3 h-3 text-cyan-400" />
                            <span>{t('javaManager.test', 'Test')}</span>
                          </button>

                          {isManaged && (
                            <button
                              onClick={() => handleDelete(j.major)}
                              disabled={isDeleting}
                              className="px-2 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/40 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                              title={t('common.delete', 'Delete managed runtime')}
                              aria-label="Delete managed runtime"
                              data-testid={`delete-runtime-${j.major}`}
                            >
                              {isDeleting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
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
              <div className="p-3 bg-zinc-900/40 border border-zinc-800/80 rounded-xl text-xs text-zinc-300 space-y-1">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('javaManager.matrixGuideTitle', 'Minecraft Java Version Compatibility')}</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  {t(
                    'javaManager.matrixGuideDesc',
                    'Aethel Launcher automatically provisions and selects the exact Java runtime required by your Minecraft version. You can verify coverage below.'
                  )}
                </p>
              </div>

              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="p-3">{t('javaManager.colMinecraft', 'Minecraft Version')}</th>
                      <th className="p-3">{t('javaManager.colRequired', 'Required Java')}</th>
                      <th className="p-3">{t('javaManager.colDetected', 'Detected Runtimes')}</th>
                      <th className="p-3 text-right">{t('javaManager.colStatus', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300 text-xs">
                    {COMPATIBILITY_ROWS.map((row) => {
                      const matches = javas.filter((j) => j.major === row.major);
                      const isReady = matches.length > 0;
                      const isDownloading = downloadingMajor === row.major;

                      return (
                        <tr key={row.major} className="hover:bg-zinc-900/40 transition-colors">
                          <td className="p-3">
                            <div className="font-semibold text-zinc-100">{row.gameRange}</div>
                            <div className="text-[10px] text-zinc-500">{row.note}</div>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-cyan-400">Java {row.major}</span>
                            {row.isLts && (
                              <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                LTS
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {isReady ? (
                              <div className="space-y-0.5">
                                {matches.slice(0, 2).map((m) => (
                                  <div key={m.path} className="text-[11px] flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    <span className="text-zinc-200">
                                      {m.vendor || 'Java'} {m.version}
                                    </span>
                                    <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-400">
                                      {m.source}
                                    </span>
                                  </div>
                                ))}
                                {matches.length > 2 && (
                                  <div className="text-[10px] text-zinc-500">
                                    +{matches.length - 2} more
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-zinc-500 italic">
                                {t('javaManager.noRuntimeInstalled', 'Not found')}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {isReady ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{t('javaManager.ready', 'Ready')}</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleDownload(row.major)}
                                disabled={isDownloading}
                                className="px-2.5 py-1 text-[11px] font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-all inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                              >
                                {isDownloading ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>{t('common.downloading', 'Downloading...')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3 h-3" />
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
              <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-200 block">
                    {t('settings.javaProvider', 'Preferred Java Vendor')}
                  </label>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Choose vendor for clean JDK builds with verified SHA-256 checksums
                  </p>
                </div>
                <select
                  value={preferredProvider}
                  onChange={(e) => setPreferredProvider(e.target.value as PreferredJavaProvider)}
                  className="px-3 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="Adoptium">Eclipse Adoptium (Temurin)</option>
                  <option value="Zulu">Azul Zulu</option>
                </select>
              </div>

              {/* Download Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DOWNLOADABLE_MAJORS.map((item) => {
                  const installed = javas.find((j) => j.major === item.major && j.source === 'Managed');
                  const isDownloading = downloadingMajor === item.major;

                  return (
                    <div
                      key={item.major}
                      className="p-4 bg-zinc-900/50 border border-zinc-800/80 rounded-xl flex flex-col justify-between gap-3 hover:border-zinc-700 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-zinc-100">{item.title}</span>
                          {installed ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/50">
                              <CheckCircle2 className="w-3 h-3" />
                              Installed
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-full">
                              Not installed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">{item.subtitle}</p>
                      </div>

                      <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {preferredProvider}
                        </span>
                        {installed ? (
                          <button
                            onClick={() => handleDelete(item.major)}
                            disabled={deletingMajor === item.major}
                            className="px-3 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/40 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            {deletingMajor === item.major ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                            <span>Reinstall</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDownload(item.major)}
                            disabled={isDownloading}
                            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                          >
                            {isDownloading ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Downloading...</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" />
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
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between text-xs text-zinc-400">
          <span>{javas.length} runtime(s) registered in launcher</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors font-medium cursor-pointer"
          >
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>

      {/* Test Output Modal Dialog (Prism-Style) */}
      {testState.isOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setTestState((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-zinc-100">
                  {t('javaManager.testDialogTitle', 'Java Verification Output')}
                </h3>
              </div>
              <button
                onClick={() => setTestState((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Tested Binary
                </label>
                <code className="text-xs font-mono text-zinc-300 block bg-zinc-900/80 p-2 rounded-lg border border-zinc-800 break-all select-all">
                  {testState.testingPath}
                </code>
              </div>

              {testState.isTesting ? (
                <div className="py-8 text-center text-zinc-400 flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs">Running java -version...</span>
                </div>
              ) : testState.result ? (
                <div className="space-y-3">
                  {/* Status Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {testState.result.valid ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Valid Java Binary
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-700/60">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Invalid / Incompatible
                      </span>
                    )}

                    {testState.result.version && (
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono">
                        Version: {testState.result.version}
                      </span>
                    )}

                    {testState.result.major && (
                      <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800/60">
                        Major: Java {testState.result.major}
                      </span>
                    )}

                    {testState.result.vendor && (
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {testState.result.vendor}
                      </span>
                    )}
                  </div>

                  {testState.result.error && (
                    <div className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300">
                      {testState.result.error}
                    </div>
                  )}

                  {/* Terminal Raw Output */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Standard Output / Error
                    </label>
                    <pre className="p-3 bg-zinc-950 text-zinc-300 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto max-h-48 border border-zinc-800/80 whitespace-pre-wrap select-all">
                      {testState.result.output || '(No output produced)'}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/30 flex justify-end">
              <button
                onClick={() => setTestState((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
