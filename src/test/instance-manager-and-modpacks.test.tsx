import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../__mocks__/tauri';
import { InstanceManagerModal } from '../components/InstanceManagerModal';
import { ModpackImportModal } from '../components/ModpackImportModal';
import { ModpackInstallModal } from '../components/ModpackInstallModal';
import { commands, type Instance } from '../bindings';

const mockInstance: Instance = {
  id: 'test-inst-1',
  name: 'Test Fabric Instance',
  game_version: '1.20.4',
  loader: 'Fabric',
  loader_version: '0.16.10',
  java_path: null,
  memory_min_mb: null,
  memory_max_mb: null,
  jvm_args: null,
  last_played_at: null,
  total_playtime_seconds: 7200,
  icon_path: null,
  banner_path: null,
  created_at: '2026-09-05T12:00:00Z',
  last_mclo_gs_url: null,
  last_mclo_gs_at: null,
  settings_json: null,
};

describe('InstanceManagerModal Suite', () => {
  it('renders overview with instance name, playtime, and path controls', () => {
    render(
      <InstanceManagerModal
        isOpen={true}
        onClose={vi.fn()}
        instance={mockInstance}
        initialTab="overview"
      />
    );

    expect(screen.getAllByText('Test Fabric Instance').length).toBeGreaterThan(0);
    expect(screen.getByText(/2h 0m/i)).toBeInTheDocument();
    expect(screen.getByText(/Copy Path|Копировать путь/i)).toBeInTheDocument();
  });

  it('switches to Resource Packs tab and renders pack items', async () => {
    render(
      <InstanceManagerModal
        isOpen={true}
        onClose={vi.fn()}
        instance={mockInstance}
        initialTab="resourcepacks"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Pack')).toBeInTheDocument();
      expect(screen.getByText('A test pack')).toBeInTheDocument();
    });
  });

  it('switches to Shaders tab and renders shaderpack items', async () => {
    render(
      <InstanceManagerModal
        isOpen={true}
        onClose={vi.fn()}
        instance={mockInstance}
        initialTab="shaders"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Complementary Shaders')).toBeInTheDocument();
    });
  });

  it('switches to Worlds tab and renders level details', async () => {
    render(
      <InstanceManagerModal
        isOpen={true}
        onClose={vi.fn()}
        instance={mockInstance}
        initialTab="worlds"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('New World').length).toBeGreaterThan(0);
    });
  });

  it('switches to Settings tab and updates settings', async () => {
    const updateSpy = vi.spyOn(commands, 'updateInstanceSettings').mockResolvedValue({
      status: 'ok',
      data: null,
    });

    render(
      <InstanceManagerModal
        isOpen={true}
        onClose={vi.fn()}
        instance={mockInstance}
        initialTab="settings"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('override-memory-toggle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('override-memory-toggle'));
    fireEvent.click(screen.getByTestId('save-instance-settings-btn'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
    });
  });
});

describe('ModpackImportModal Suite', () => {
  it('inspects modpack on browse and displays preview card', async () => {
    render(<ModpackImportModal isOpen={true} onClose={vi.fn()} />);

    const browseBtn = screen.getByTestId('browse-modpack-file-btn');
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(screen.getByText('Fabulously Optimized')).toBeInTheDocument();
      expect(screen.getByText(/42 files/i)).toBeInTheDocument();
    });
  });
});

describe('ModpackInstallModal Suite', () => {
  it('searches modpacks and installs in 1 click', async () => {
    const installSpy = vi.spyOn(commands, 'installOnlineModpack').mockResolvedValue({
      status: 'ok',
      data: mockInstance,
    });

    render(<ModpackInstallModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Fabulously Optimized')).toBeInTheDocument();
    });

    // Select pack
    fireEvent.click(screen.getByText('Fabulously Optimized'));

    // Install step
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Install Modpack|Установить модпак/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Install Modpack|Установить модпак/i }));

    await waitFor(() => {
      expect(installSpy).toHaveBeenCalledWith(
        'modrinth',
        'fo-123',
        null,
        'Fabulously Optimized'
      );
    });
  });
});
