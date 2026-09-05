import { describe, it, expect, beforeEach } from 'vitest';
import { useAccountStore } from '../store/accountStore';
import { useSettingsStore } from '../store/settingsStore';
import { useDownloadStore } from '../store/downloadStore';
import { useLogStore } from '../store/logStore';
import { useInstanceStore } from '../store/instanceStore';

describe('Zustand Stores Suite', () => {
  beforeEach(() => {
    useLogStore.getState().clearLogs();
  });

  describe('AccountStore', () => {
    it('has default stub account Player with 00000000 UUID', () => {
      const { activeAccount } = useAccountStore.getState();
      expect(activeAccount.name).toBe('Player');
      expect(activeAccount.uuid).toBe('00000000-0000-0000-0000-000000000000');
      expect(activeAccount.token).toBe('0');
      expect(activeAccount.userType).toBe('legacy');
      expect(activeAccount.isStub).toBe(true);
    });

    it('can update player name with custom or default uuid', () => {
      useAccountStore.getState().setPlayerName('Steve', '5627dd98-e6be-3c21-b8a8-e92344183641');
      expect(useAccountStore.getState().activeAccount.name).toBe('Steve');
      expect(useAccountStore.getState().activeAccount.uuid).toBe('5627dd98-e6be-3c21-b8a8-e92344183641');
    });

    it('can toggle account modal visibility', () => {
      const { setIsAccountModalOpen } = useAccountStore.getState();
      expect(useAccountStore.getState().isAccountModalOpen).toBe(false);
      setIsAccountModalOpen(true);
      expect(useAccountStore.getState().isAccountModalOpen).toBe(true);
      setIsAccountModalOpen(false);
      expect(useAccountStore.getState().isAccountModalOpen).toBe(false);
    });
  });

  describe('SettingsStore', () => {
    it('updates min and max RAM', () => {
      const { setMinRamMb, setMaxRamMb } = useSettingsStore.getState();
      setMinRamMb(2048);
      setMaxRamMb(8192);
      expect(useSettingsStore.getState().minRamMb).toBe(2048);
      expect(useSettingsStore.getState().maxRamMb).toBe(8192);
    });

    it('updates GC preset and Java path', () => {
      const { setGcPreset, setJavaPath } = useSettingsStore.getState();
      setGcPreset('ZGC');
      setJavaPath('C:/custom/java.exe');
      expect(useSettingsStore.getState().gcPreset).toBe('ZGC');
      expect(useSettingsStore.getState().javaPath).toBe('C:/custom/java.exe');
    });

    it('updates theme, discord RPC toggle, and custom JVM arguments', async () => {
      const { setTheme, setDiscordRpcEnabled, setDefaultJvmArgs } = useSettingsStore.getState();
      setTheme('dark');
      expect(useSettingsStore.getState().theme).toBe('dark');

      await setDiscordRpcEnabled(true, 'en');
      expect(useSettingsStore.getState().discordRpcEnabled).toBe(true);

      setDefaultJvmArgs('-XX:+UseStringDeduplication');
      expect(useSettingsStore.getState().defaultJvmArgs).toBe('-XX:+UseStringDeduplication');
    });

    it('initializes global settings from backend', async () => {
      const { initGlobalSettings } = useSettingsStore.getState();
      await initGlobalSettings('ru');
      const state = useSettingsStore.getState();
      expect(state.minRamMb).toBe(1024);
      expect(state.maxRamMb).toBe(4096);
      expect(state.gcPreset).toBe('G1GC');
    });
  });

  describe('DownloadStore', () => {
    it('handles batch download progress updates and task completion', () => {
      const { updateBatchProgress, completeTask, failTask, clearCompleted } = useDownloadStore.getState();

      updateBatchProgress([
        { task_id: 't1', current: 50, total: 100, speed_bps: 1024, file_name: 'asset1.png' },
        { task_id: 't2', current: 10, total: 200, speed_bps: 2048, file_name: 'lib1.jar' },
      ]);

      const state1 = useDownloadStore.getState();
      expect(state1.tasks['t1'].status).toBe('downloading');
      expect(state1.tasks['t2'].current).toBe(10);

      completeTask('t1');
      expect(useDownloadStore.getState().tasks['t1'].status).toBe('completed');

      failTask('t2', 'Network failed');
      expect(useDownloadStore.getState().tasks['t2'].status).toBe('failed');
      expect(useDownloadStore.getState().tasks['t2'].error).toBe('Network failed');

      clearCompleted();
      expect(useDownloadStore.getState().tasks['t1']).toBeUndefined();
      expect(useDownloadStore.getState().tasks['t2']).toBeDefined();
    });
  });

  describe('LogStore', () => {
    it('adds logs, detects levels and filters correctly', () => {
      const { addLog, setLevelFilter, setSearchQuery } = useLogStore.getState();

      addLog('Game started smoothly', false);
      addLog('[WARN] Old OpenGL version detected', false);
      addLog('Fatal error during startup', true);

      const lines = useLogStore.getState().lines;
      expect(lines).toHaveLength(3);
      expect(lines[0].level).toBe('INFO');
      expect(lines[1].level).toBe('WARN');
      expect(lines[2].level).toBe('ERROR');

      setLevelFilter('WARN');
      expect(useLogStore.getState().levelFilter).toBe('WARN');

      setSearchQuery('OpenGL');
      expect(useLogStore.getState().searchQuery).toBe('OpenGL');
    });

    it('manages per-instance logs and mclogs URLs', () => {
      const { addLog, addLogBatch, setActiveInstance, getLogs, setMclogsUrl, getMclogsUrl, clearLogs } =
        useLogStore.getState();

      addLog('Instance 1 log 1', false, 'inst-1');
      addLogBatch(['Instance 1 log 2', 'Instance 1 log 3'], false, 'inst-1');
      addLog('Instance 2 log 1', false, 'inst-2');

      expect(getLogs('inst-1')).toHaveLength(3);
      expect(getLogs('inst-2')).toHaveLength(1);

      setActiveInstance('inst-1');
      expect(useLogStore.getState().lines).toHaveLength(3);

      setActiveInstance('inst-2');
      expect(useLogStore.getState().lines).toHaveLength(1);

      setMclogsUrl('inst-1', 'https://mclo.gs/abc1234');
      expect(getMclogsUrl('inst-1')).toBe('https://mclo.gs/abc1234');
      expect(getMclogsUrl('inst-2')).toBeUndefined();

      clearLogs('inst-1');
      expect(getLogs('inst-1')).toHaveLength(0);
      expect(getLogs('inst-2')).toHaveLength(1);
    });
  });

  describe('InstanceStore', () => {
    it('manages instances and launch status', () => {
      const { instances, setLaunchStatus, setSelectedInstanceId } = useInstanceStore.getState();
      expect(instances.length).toBeGreaterThanOrEqual(1);

      setSelectedInstanceId('vanilla-1.20.4');
      expect(useInstanceStore.getState().selectedInstanceId).toBe('vanilla-1.20.4');

      setLaunchStatus('vanilla-1.20.4', 'running');
      expect(useInstanceStore.getState().launchStatus['vanilla-1.20.4']).toBe('running');
    });
  });
});
