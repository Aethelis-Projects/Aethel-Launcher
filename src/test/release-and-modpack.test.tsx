import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModpackImportModal } from '../components/ModpackImportModal';
import { ModpackExportModal } from '../components/ModpackExportModal';
import { UpdateChecker } from '../components/UpdateChecker';
import { SettingsModal } from '../components/SettingsModal';
import { commands, type Instance } from '../bindings';

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
    created_at: '2026-09-04T12:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  describe('SettingsModal Update Section', () => {
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
  });
});
