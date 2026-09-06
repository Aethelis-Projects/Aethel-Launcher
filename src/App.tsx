import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionConfig } from 'framer-motion';
import { Gamepad2, Terminal, Settings, Coffee } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { InstanceGrid } from './components/InstanceGrid';
import { DownloadDrawer } from './components/DownloadDrawer';
import { SettingsModal } from './components/SettingsModal';
import { JavaManagerModal } from './components/JavaManagerModal';
import { AccountModal } from './components/AccountModal';
import { CrashReportModal } from './components/CrashReportModal';
import { UpdateChecker } from './components/UpdateChecker';
import { LogViewer } from './components/LogViewer';
import { useAccountStore } from './store/accountStore';
import { useDownloadStore } from './store/downloadStore';
import { useLogStore } from './store/logStore';
import { useInstanceStore } from './store/instanceStore';
import { useSettingsStore } from './store/settingsStore';
import { events, type CrashReport } from './bindings';

export function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'instances' | 'logs'>('instances');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isJavaManagerOpen, setIsJavaManagerOpen] = useState(false);
  const [activeCrashReport, setActiveCrashReport] = useState<CrashReport | null>(null);
  const [activeCrashInstanceId, setActiveCrashInstanceId] = useState<string | null>(null);
  const { isAccountModalOpen, setIsAccountModalOpen, fetchAccounts } = useAccountStore();

  const { updateProgress, updateBatchProgress, completeTask, failTask } = useDownloadStore();
  const { addLog, addLogBatch } = useLogStore();
  const { setLaunchStatus, fetchInstances } = useInstanceStore();
  const { updateChannel, initGlobalSettings } = useSettingsStore();

  const [toast, setToast] = useState<{
    id: string;
    type: 'success' | 'info' | 'error';
    title: string;
    description?: string;
  } | null>(null);
  const launchStartTimes = React.useRef<Map<string, number>>(new Map());

  const showToast = (type: 'success' | 'info' | 'error', title: string, description?: string) => {
    const id = Math.random().toString();
    setToast({ id, type, title, description });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 5000);
  };

  useEffect(() => {
    fetchAccounts();
    fetchInstances();
    initGlobalSettings(i18n.language);
  }, [fetchAccounts, fetchInstances, initGlobalSettings, i18n.language]);

  // Listen to backend events from Tauri (WS-18 singleton pattern)
  useEffect(() => {
    let isCancelled = false;
    let unlistenFn: (() => void) | undefined;

    events.backendEvent
      .listen((event) => {
        const e = event.payload;
        switch (e.type) {
          case 'DownloadProgress':
            updateProgress(e.data);
            break;
          case 'DownloadBatchProgress':
            updateBatchProgress(e.data.items);
            break;
          case 'DownloadCompleted':
            completeTask(e.data.task_id);
            break;
          case 'DownloadFailed':
            failTask(e.data.task_id, e.data.message);
            break;
          case 'ProcessLog':
            addLog(e.data.line, e.data.is_stderr, e.data.instance_id);
            break;
          case 'ProcessLogBatch':
            addLogBatch(e.data.lines, false, e.data.instance_id);
            break;
          case 'ProcessStarted': {
            setLaunchStatus(e.data.instance_id, 'running');
            launchStartTimes.current.set(e.data.instance_id, Date.now());
            const currentInstances = useInstanceStore.getState().instances;
            const currentAccount = useAccountStore.getState().activeAccount;
            const inst = currentInstances.find((i) => i.id === e.data.instance_id);
            const ver = inst?.game_version || '';
            const playerName = currentAccount?.name || 'Player';
            showToast(
              'success',
              `✅ Minecraft ${ver} запущен — ${playerName}`,
              `PID: ${e.data.pid}`
            );
            break;
          }
          case 'ProcessExited': {
            setLaunchStatus(e.data.instance_id, 'idle');
            fetchInstances();
            const start = launchStartTimes.current.get(e.data.instance_id);
            launchStartTimes.current.delete(e.data.instance_id);
            if (start && (e.data.exit_code === 0 || e.data.exit_code === null)) {
              const elapsedSecs = Math.max(1, Math.round((Date.now() - start) / 1000));
              const mins = Math.floor(elapsedSecs / 60);
              const secs = elapsedSecs % 60;
              const timeStr = mins > 0 ? `${mins} мин ${secs} сек` : `${secs} сек`;
              showToast('info', 'Игра закрыта', `Время в игре: ${timeStr}`);
            }
            break;
          }
          case 'ProcessCrashed': {
            setActiveCrashReport(e.data.report);
            setActiveCrashInstanceId(e.data.instance_id);
            const currentInstances = useInstanceStore.getState().instances;
            const inst = currentInstances.find((i) => i.id === e.data.instance_id);
            const ver = inst?.game_version || '';
            showToast(
              'error',
              `❌ Minecraft ${ver} завершился с ошибкой`,
              e.data.report.suggestion || 'Подробности доступны в отчете о краше'
            );
            break;
          }
          default:
            break;
        }
      })
      .then((unlisten) => {
        if (isCancelled) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [
    updateProgress,
    updateBatchProgress,
    completeTask,
    failTask,
    addLog,
    addLogBatch,
    setLaunchStatus,
    fetchInstances,
  ]);

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex h-screen w-screen flex-col bg-[var(--surface-0)] text-[var(--text-primary)] antialiased font-sans select-none overflow-hidden">
      {/* Frameless TitleBar */}
      <TitleBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenJava={() => setIsJavaManagerOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-56 border-r border-[var(--line-subtle)] bg-[var(--surface-1)]/95 p-3 flex flex-col justify-between select-none backdrop-blur-md">
          <div className="space-y-4">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('instances')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-xs font-medium transition-all ${
                  activeTab === 'instances'
                    ? 'bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] text-[var(--text-on-accent)] shadow-[var(--shadow-glow)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Gamepad2 className="w-4 h-4" />
                <span>{t('nav.instances')}</span>
              </button>

              <button
                onClick={() => setActiveTab('logs')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-xs font-medium transition-all ${
                  activeTab === 'logs'
                    ? 'bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] text-[var(--text-on-accent)] shadow-[var(--shadow-glow)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>{t('nav.logs')}</span>
              </button>

              <button
                onClick={() => setIsJavaManagerOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors"
                title={t('javaManager.title', 'Java Runtime Manager')}
              >
                <Coffee className="w-4 h-4 text-[var(--accent-from)]" />
                <span>Java</span>
              </button>
            </nav>
          </div>

          {/* Bottom Settings Trigger */}
          <div className="pt-2 border-t border-[var(--line-subtle)]">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>{t('nav.settings')}</span>
            </button>
          </div>
        </aside>

        {/* Tab Content Area */}
        <main className="flex-1 flex flex-col bg-[var(--surface-0)] overflow-hidden relative">
          {activeTab === 'instances' ? <InstanceGrid /> : <LogViewer />}

          {/* Slide-out Download Drawer */}
          <DownloadDrawer />
        </main>
      </div>

      {/* Account Management Modal */}
      <AccountModal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} />

      {/* Java Manager Modal (Prism-Style) */}
      <JavaManagerModal isOpen={isJavaManagerOpen} onClose={() => setIsJavaManagerOpen(false)} />

      {/* Global Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenJavaManager={() => setIsJavaManagerOpen(true)}
      />

      {/* Crash Report Modal */}
      <CrashReportModal
        isOpen={activeCrashReport !== null}
        onClose={() => {
          setActiveCrashReport(null);
          setActiveCrashInstanceId(null);
        }}
        report={activeCrashReport}
        instanceId={activeCrashInstanceId ?? undefined}
      />

      {/* Auto-Update Notification Banner / Modal */}
      <UpdateChecker channel={updateChannel} />

      {/* Process Event Notification Toast */}
      {toast && (
        <div
          data-testid="process-event-toast"
          className={`fixed bottom-6 right-6 z-50 max-w-sm p-3.5 rounded-[var(--radius-md)] border shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-4 duration-300 ${
            toast.type === 'success'
              ? 'bg-[var(--success-soft)] border-[var(--success)]/40 text-[var(--text-primary)] shadow-[var(--shadow-glow)]'
              : toast.type === 'error'
              ? 'bg-[var(--danger-soft)] border-[var(--danger)]/40 text-[var(--text-primary)] shadow-[var(--shadow-glow)]'
              : 'bg-[var(--surface-2)]/95 border-[var(--line-strong)] text-[var(--text-primary)] shadow-[var(--shadow-glow)]'
          }`}
        >
          <div className="text-xs font-semibold">{toast.title}</div>
          {toast.description && (
            <div className="text-[11px] opacity-80 mt-1">{toast.description}</div>
          )}
        </div>
      )}
    </div>
    </MotionConfig>
  );
}

export default App;
