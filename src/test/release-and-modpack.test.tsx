import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModpackImportModal } from '../components/ModpackImportModal';
import { ModpackExportModal } from '../components/ModpackExportModal';
import { UpdateChecker } from '../components/UpdateChecker';
import { SettingsModal } from '../components/SettingsModal';
import { commands, type Instance } from '../bindings';
import { useUpdateStore } from '../store/updateStore';

vi.mock('../bindings', () => ({
  commands: {
    importModpack: vi.fn(),
    importInstanceBackup: vi.fn(),
    exportModpack: vi.fn(),
    exportInstanceBackup: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadAndInstallUpdate: vi.fn(),
    getInstances: vi.fn().mockResolvedValue({ status: 'ok', data: [] }),
    detectSystemJava: vi.fn().mockResolvedValue({ status: 'ok', data: [] }),
    getInstalledRuntimes: vi.fn().mockResolvedValue({ status: 'ok', data: [] }),
    downloadRuntime: vi.fn().mockResolvedValue({ status: 'ok', data: {} }),
    deleteRuntime: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
  },
  events: {
    backendEvent: {
      listen: vi.fn().mockResolvedValue(() => {}),
    },
  },
}));

describe('Phase M6 UI Components', () => {
  const sampleInstance: Instance = {
    id: 'test-inst-1',
    name: 'Test Modpack Instance',
    game_version: '1.20.4',
    loader: 'fabric',
    loader_version: '0.15.7',
    java_path: null,
    memory_min_mb: 1024,
    memory_max_mb: 4096,
    jvm_args: null,
    last_played_at: null,
    total_playtime_seconds: 0,
    icon_path: null,
    banner_path: null,
    last_mclo_gs_url: null,
    last_mclo_gs_at: null,
    created_at: '2026-09-04T12:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useUpdateStore.getState().reset();
  });

  describe('ModpackImportModal', () => {
    it('renders input fields and submits .mrpack import', async () => {
      vi.mocked(commands.importModpack).mockResolvedValueOnce({
        status: 'ok',
        data: sampleInstance,
      });

      render(
        <ModpackImportModal
          isOpen={true}
          onClose={() => {}}
        />
      );

      expect(screen.getByTestId('modpack-import-modal')).toBeInTheDocument();

      const pathInput = screen.getByTestId('import-file-path');
      fireEvent.change(pathInput, { target: { value: 'C:/packs/cool.mrpack' } });

      const nameInput = screen.getByTestId('import-instance-name');
      fireEvent.change(nameInput, { target: { value: 'Custom Pack Name' } });

      const submitBtn = screen.getByTestId('submit-import-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(commands.importModpack).toHaveBeenCalledWith(
          'C:/packs/cool.mrpack',
          'Custom Pack Name'
        );
      });
    });

    it('submits .zip instance backup import when path ends with .zip', async () => {
      vi.mocked(commands.importInstanceBackup).mockResolvedValueOnce({
        status: 'ok',
        data: sampleInstance,
      });

      render(
        <ModpackImportModal
          isOpen={true}
          onClose={() => {}}
        />
      );

      const pathInput = screen.getByTestId('import-file-path');
      fireEvent.change(pathInput, { target: { value: 'C:/backups/my_instance.zip' } });

      const submitBtn = screen.getByTestId('submit-import-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(commands.importInstanceBackup).toHaveBeenCalledWith(
          'C:/backups/my_instance.zip'
        );
      });
    });
  });

  describe('ModpackExportModal', () => {
    it('renders and exports modpack as .mrpack', async () => {
      vi.mocked(commands.exportModpack).mockResolvedValueOnce({
        status: 'ok',
        data: null,
      });

      render(
        <ModpackExportModal
          isOpen={true}
          onClose={() => {}}
          instance={sampleInstance}
        />
      );

      expect(screen.getByTestId('modpack-export-modal')).toBeInTheDocument();

      const submitBtn = screen.getByTestId('submit-export-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(commands.exportModpack).toHaveBeenCalledWith(
          'test-inst-1',
          expect.stringContaining('test-modpack-instance.mrpack'),
          'Test Modpack Instance',
          '1.0.0',
          null
        );
      });
    });

    it('switches to .zip format and exports instance backup', async () => {
      vi.mocked(commands.exportInstanceBackup).mockResolvedValueOnce({
        status: 'ok',
        data: null,
      });

      render(
        <ModpackExportModal
          isOpen={true}
          onClose={() => {}}
          instance={sampleInstance}
        />
      );

      // Click zip format option via testid
      const zipBtn = screen.getByTestId('format-zip-btn');
      fireEvent.click(zipBtn);

      const submitBtn = screen.getByTestId('submit-export-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(commands.exportInstanceBackup).toHaveBeenCalledWith(
          'test-inst-1',
          expect.stringContaining('.zip'),
          true
        );
      });
    });
  });

  describe('UpdateChecker', () => {
    it('renders update modal when an update is available', async () => {
      vi.mocked(commands.checkForUpdates).mockResolvedValueOnce({
        status: 'ok',
        data: {
          version: 'v0.2.0',
          date: '2026-09-04',
          body: 'Exciting new features in Phase M6!',
          download_size: 15728640,
          download_url: 'https://github.com/downloads/v0.2.0.exe',
        },
      });

      render(<UpdateChecker channel="stable" autoCheck={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('update-checker-modal')).toBeInTheDocument();
        expect(screen.getByText(/Exciting new features in Phase M6!/)).toBeInTheDocument();
      });
    });

    it('does not render when no update is available', async () => {
      vi.mocked(commands.checkForUpdates).mockResolvedValueOnce({
        status: 'ok',
        data: null,
      });

      render(<UpdateChecker channel="stable" autoCheck={true} />);

      await waitFor(() => {
        expect(screen.queryByTestId('update-checker-modal')).not.toBeInTheDocument();
      });
    });

    it('triggers download and install from recommendation modal', async () => {
      vi.mocked(commands.checkForUpdates).mockResolvedValueOnce({
        status: 'ok',
        data: {
          version: 'v0.3.0',
          date: '2026-09-04',
          body: 'Fixed launcher bugs and added Adoptium support',
          download_size: 20971520,
          download_url: 'https://github.com/downloads/setup.exe',
        },
      });
      vi.mocked(commands.downloadAndInstallUpdate).mockResolvedValueOnce({
        status: 'ok',
        data: null,
      });

      render(<UpdateChecker channel="stable" autoCheck={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('update-checker-modal')).toBeInTheDocument();
      });

      const installBtn = screen.getByRole('button', { name: /Установить сейчас|Install Now/i });
      fireEvent.click(installBtn);

      await waitFor(() => {
        expect(commands.downloadAndInstallUpdate).toHaveBeenCalledWith(
          'stable',
          'https://github.com/downloads/setup.exe'
        );
      });
    });

    it('renders in-app toast on background update and opens details modal', async () => {
      // Simulate an update discovered while player is already in-app
      useUpdateStore.setState({
        updateInfo: {
          version: 'v0.4.0',
          date: '2026-09-04',
          body: 'Background release notes',
          download_size: 10485760,
          download_url: 'https://github.com/downloads/update.exe',
        },
        isToastOpen: true,
        isModalOpen: false,
      });

      render(<UpdateChecker channel="stable" autoCheck={false} />);

      expect(screen.getByTestId('update-notification-toast')).toBeInTheDocument();
      expect(screen.getByText('v0.4.0')).toBeInTheDocument();

      const detailsBtn = screen.getByRole('button', { name: /Подробнее|Details/i });
      fireEvent.click(detailsBtn);

      expect(useUpdateStore.getState().isModalOpen).toBe(true);
      expect(useUpdateStore.getState().isToastOpen).toBe(false);
    });

    it('stores skipped update version when user clicks remind later', async () => {
      vi.mocked(commands.checkForUpdates).mockResolvedValueOnce({
        status: 'ok',
        data: {
          version: 'v0.5.0',
          date: '2026-09-04',
          body: 'Skippable release',
          download_size: 10485760,
          download_url: null,
        },
      });

      render(<UpdateChecker channel="stable" autoCheck={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('update-checker-modal')).toBeInTheDocument();
      });

      const laterBtn = screen.getByRole('button', { name: /Напомнить позже|Remind Later/i });
      fireEvent.click(laterBtn);

      expect(useUpdateStore.getState().isModalOpen).toBe(false);
      expect(localStorage.getItem('aethel_skipped_update')).toBe('v0.5.0');
    });
  });

  describe('SettingsModal Update and Java Sections', () => {
    it('triggers manual update check and shows status', async () => {
      vi.mocked(commands.checkForUpdates).mockResolvedValueOnce({
        status: 'ok',
        data: null,
      });

      render(<SettingsModal isOpen={true} onClose={() => {}} />);

      const checkBtn = screen.getByTestId('manual-update-check-btn');
      expect(checkBtn).toBeInTheDocument();

      fireEvent.click(checkBtn);

      await waitFor(() => {
        expect(commands.checkForUpdates).toHaveBeenCalled();
        expect(screen.getByTestId('update-status-msg')).toBeInTheDocument();
      });
    });

    it('renders Java runtime manager cards and allows downloading runtime', async () => {
      vi.mocked(commands.getInstalledRuntimes).mockResolvedValueOnce({
        status: 'ok',
        data: [
          {
            major: 21,
            path: 'C:/runtimes/java-21/bin/javaw.exe',
            provider: 'Adoptium',
            version_str: 'Java 21',
          },
        ],
      });
      vi.mocked(commands.downloadRuntime).mockResolvedValueOnce({
        status: 'ok',
        data: {
          major: 17,
          path: 'C:/runtimes/java-17/bin/javaw.exe',
          provider: 'Adoptium',
          version_str: 'Java 17',
        },
      });

      render(<SettingsModal isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        expect(commands.getInstalledRuntimes).toHaveBeenCalled();
        expect(screen.getByText('Java 21 (LTS)')).toBeInTheDocument();
        expect(screen.getByText('Java 17 (LTS)')).toBeInTheDocument();
        expect(screen.getByText('Java 8 (Legacy)')).toBeInTheDocument();
      });

      // Find download buttons
      const downloadButtons = screen.getAllByRole('button', { name: /Скачать|Download/i });
      expect(downloadButtons.length).toBeGreaterThan(0);

      fireEvent.click(downloadButtons[0]);

      await waitFor(() => {
        expect(commands.downloadRuntime).toHaveBeenCalledWith(17, 'Adoptium');
      });
    });

    it('allows deleting an installed runtime', async () => {
      vi.mocked(commands.getInstalledRuntimes).mockResolvedValue({
        status: 'ok',
        data: [
          {
            major: 21,
            path: 'C:/runtimes/java-21/bin/javaw.exe',
            provider: 'Adoptium',
            version_str: 'Java 21',
          },
        ],
      });
      vi.mocked(commands.deleteRuntime).mockResolvedValueOnce({
        status: 'ok',
        data: null,
      });

      render(<SettingsModal isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText('Java 21 (LTS)')).toBeInTheDocument();
      });

      const deleteBtn = screen.getByRole('button', { name: /Удалить|Delete/i });
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(commands.deleteRuntime).toHaveBeenCalledWith(21);
      });
    });
  });
});
