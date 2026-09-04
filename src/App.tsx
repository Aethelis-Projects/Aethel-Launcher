import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Terminal, Settings } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { InstanceGrid } from './components/InstanceGrid';
import { DownloadDrawer } from './components/DownloadDrawer';
import { SettingsModal } from './components/SettingsModal';
import { LogViewer } from './components/LogViewer';
import { StubLaunchButton } from './components/StubLaunchButton';
import { AccountModal } from './components/AccountModal';
import { CrashReportModal } from './components/CrashReportModal';
import { UpdateChecker } from './components/UpdateChecker';
import { useAccountStore } from './store/accountStore';
import { useDownloadStore } from './store/downloadStore';
import { useLogStore } from './store/logStore';
import { useInstanceStore } from './store/instanceStore';
import { useSettingsStore } from './store/settingsStore';
import { events, type CrashReport } from './bindings';

export function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'instances' | 'logs'>('instances');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeCrashReport, setActiveCrashReport] = useState<CrashReport | null>(null);
  const [activeCrashInstanceId, setActiveCrashInstanceId] = useState<string | null>(null);
  const { isAccountModalOpen, setIsAccountModalOpen, fetchAccounts } = useAccountStore();

  const { updateProgress, updateBatchProgress, completeTask, failTask } = useDownloadStore();
  const { addLog, addLogBatch } = useLogStore();
  const { setLaunchStatus, fetchInstances } = useInstanceStore();
  const { updateChannel } = useSettingsStore();

  useEffect(() => {
    fetchAccounts();
    fetchInstances();
  }, [fetchAccounts, fetchInstances]);

  // Listen to backend events from Tauri
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unlisten = await events.backendEvent.listen((event) => {
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
            case 'ProcessStarted':
              setLaunchStatus(e.data.instance_id, 'running');
              break;
            case 'ProcessExited':
              setLaunchStatus(e.data.instance_id, 'idle');
              break;
            case 'ProcessCrashed':
              setActiveCrashReport(e.data.report);
              setActiveCrashInstanceId(e.data.instance_id);
              break;
            default:
              break;
          }
        });
      } catch {}
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [updateProgress, updateBatchProgress, completeTask, failTask, addLog, addLogBatch, setLaunchStatus]);

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100 antialiased font-sans select-none overflow-hidden">
      {/* Frameless TitleBar */}
      <TitleBar />

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-56 border-r border-zinc-800/80 bg-zinc-950/80 p-3 flex flex-col justify-between select-none">
          <div className="space-y-4">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('instances')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'instances'
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-950/40'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <Gamepad2 className="w-4 h-4" />
                <span>{t('nav.instances')}</span>
              </button>

              <button
                onClick={() => setActiveTab('logs')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'logs'
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-950/40'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>{t('nav.logs')}</span>
              </button>
            </nav>

            {/* Stub Identity Quick Card in Sidebar */}
            <div className="pt-2">
              <StubLaunchButton />
            </div>
          </div>

          {/* Bottom Settings Trigger */}
          <div className="pt-2 border-t border-zinc-800/60">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>{t('nav.settings')}</span>
            </button>
          </div>
        </aside>

        {/* Tab Content Area */}
        <main className="flex-1 flex flex-col bg-zinc-900/30 overflow-hidden relative">
          {activeTab === 'instances' ? <InstanceGrid /> : <LogViewer />}

          {/* Slide-out Download Drawer */}
          <DownloadDrawer />
        </main>
      </div>

      {/* Account Management Modal */}
      <AccountModal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} />

      {/* Global Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

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
    </div>
  );
}

export default App;
