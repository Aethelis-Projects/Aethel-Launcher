import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../__mocks__/tauri';
import { ModloaderSelector } from '../components/ModloaderSelector';
import { ModManagerModal } from '../components/ModManagerModal';
import { ModBrowserModal } from '../components/ModBrowserModal';
import { commands, type InstalledMod, type ModSearchResult, type ModVersion } from '../bindings';

describe('Modding Frontend Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ModloaderSelector', () => {
    it('renders vanilla state correctly', () => {
      render(
        <ModloaderSelector
          instanceId="test-inst"
          gameVersion="1.20.4"
          currentLoader={null}
          currentLoaderVersion={null}
        />
      );

      const select = screen.getByTestId('modloader-type-select') as HTMLSelectElement;
      expect(select.value).toBe('vanilla');
      expect(screen.queryByTestId('modloader-version-select')).toBeNull();
    });

    it('loads and applies a modloader', async () => {
      const versionsSpy = vi.spyOn(commands, 'getModloaderVersions').mockResolvedValue({
        status: 'ok',
        data: [
          { loader: 'Fabric', version: '0.16.10', game_version: '1.20.4', stable: true },
          { loader: 'Fabric', version: '0.15.11', game_version: '1.20.4', stable: true },
        ],
      });

      const installSpy = vi.spyOn(commands, 'installModloader').mockResolvedValue({
        status: 'ok',
        data: 'fabric-loader-0.16.10-1.20.4',
      });

      const onUpdated = vi.fn();

      render(
        <ModloaderSelector
          instanceId="test-inst"
          gameVersion="1.20.4"
          currentLoader={null}
          currentLoaderVersion={null}
          onLoaderUpdated={onUpdated}
        />
      );

      // Select Fabric
      const select = screen.getByTestId('modloader-type-select');
      fireEvent.change(select, { target: { value: 'fabric' } });

      await waitFor(() => {
        expect(versionsSpy).toHaveBeenCalledWith('fabric', '1.20.4');
      });

      // Check version select rendered
      await waitFor(() => {
        const verSelect = screen.getByTestId('modloader-version-select') as HTMLSelectElement;
        expect(verSelect.value).toBe('0.16.10');
      });

      // Click Apply
      const applyBtn = screen.getByTestId('modloader-apply-btn');
      fireEvent.click(applyBtn);

      await waitFor(() => {
        expect(installSpy).toHaveBeenCalledWith('test-inst', 'fabric', '0.16.10');
        expect(onUpdated).toHaveBeenCalled();
      });
    });
  });

  describe('ModManagerModal', () => {
    it('renders empty state when no mods installed', async () => {
      vi.spyOn(commands, 'listInstalledMods').mockResolvedValue({
        status: 'ok',
        data: [],
      });

      render(
        <ModManagerModal
          isOpen={true}
          onClose={vi.fn()}
          instanceId="test-inst"
          instanceName="Test Instance"
          gameVersion="1.20.4"
          loader="fabric"
          loaderVersion="0.16.10"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Test Instance/i)).toBeDefined();
        expect(screen.getAllByText(/mods\.browseMods|Поиск модов|Browse Mods/i).length).toBeGreaterThan(0);
      });
    });

    it('lists installed mods and handles toggle/delete', async () => {
      const mockMods: InstalledMod[] = [
        {
          id: 'sodium',
          name: 'Sodium',
          version: '0.5.8',
          file_name: 'sodium-0.5.8.jar',
          enabled: true,
          description: 'Modern rendering engine for Minecraft',
          authors: ['jellysquid3'],
          project_id: 'sodium',
        },
      ];

      vi.spyOn(commands, 'listInstalledMods').mockResolvedValue({
        status: 'ok',
        data: mockMods,
      });

      const toggleSpy = vi.spyOn(commands, 'toggleMod').mockResolvedValue({
        status: 'ok',
        data: null,
      });

      const deleteSpy = vi.spyOn(commands, 'deleteMod').mockResolvedValue({
        status: 'ok',
        data: null,
      });

      render(
        <ModManagerModal
          isOpen={true}
          onClose={vi.fn()}
          instanceId="test-inst"
          instanceName="Test Instance"
          gameVersion="1.20.4"
          loader="fabric"
          loaderVersion="0.16.10"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Sodium')).toBeDefined();
        expect(screen.getByText('v0.5.8')).toBeDefined();
      });

      // Toggle mod
      const toggleBtn = screen.getByTestId('toggle-mod-sodium-0.5.8.jar');
      fireEvent.click(toggleBtn);
      await waitFor(() => {
        expect(toggleSpy).toHaveBeenCalledWith('test-inst', 'sodium-0.5.8.jar', false);
      });

      // Delete mod
      const deleteBtn = screen.getByTestId('delete-mod-sodium-0.5.8.jar');
      fireEvent.click(deleteBtn);

      // Confirm delete button
      await waitFor(() => {
        expect(screen.getByText('Confirm')).toBeDefined();
      });
      const confirmBtn = screen.getByText('Confirm');
      fireEvent.click(confirmBtn);
      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledWith('test-inst', 'sodium-0.5.8.jar');
      });
    });

    it('checks for mod updates', async () => {
      vi.spyOn(commands, 'listInstalledMods').mockResolvedValue({
        status: 'ok',
        data: [
          {
            id: 'sodium',
            name: 'Sodium',
            version: '0.5.8',
            file_name: 'sodium-0.5.8.jar',
            enabled: true,
            description: 'Renderer',
            authors: [],
            project_id: 'sodium',
          },
        ],
      });

      const updatesSpy = vi.spyOn(commands, 'checkModUpdates').mockResolvedValue({
        status: 'ok',
        data: [
          {
            project_id: 'sodium',
            current_version: '0.5.8',
            latest_version: '0.5.11',
            download_url: 'https://example.com/sodium-0.5.11.jar',
          },
        ],
      });

      render(
        <ModManagerModal
          isOpen={true}
          onClose={vi.fn()}
          instanceId="test-inst"
          instanceName="Test Instance"
          gameVersion="1.20.4"
          loader="fabric"
          loaderVersion="0.16.10"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Sodium')).toBeDefined();
      });

      const checkUpdatesBtn = screen.getByTestId('check-updates-btn');
      fireEvent.click(checkUpdatesBtn);

      await waitFor(() => {
        expect(updatesSpy).toHaveBeenCalledWith('test-inst');
        expect(screen.getAllByText(/0\.5\.11/).length).toBeGreaterThan(0);
      });
    });
  });

  describe('ModBrowserModal', () => {
    it('searches mods and installs selected version', async () => {
      const mockSearch: ModSearchResult[] = [
        {
          project_id: 'lithium',
          slug: 'lithium',
          title: 'Lithium',
          description: 'General-purpose optimization mod',
          author: '2ine',
          downloads: 1500000,
          follows: 8000,
          icon_url: null,
          categories: ['optimization'],
          versions: ['1.20.4'],
        },
      ];

      const mockVersions: ModVersion[] = [
        {
          version_id: 'ver-lithium-1',
          project_id: 'lithium',
          version_number: '0.12.1',
          name: 'Lithium 0.12.1',
          game_versions: ['1.20.4'],
          loaders: ['fabric'],
          files: [
            {
              url: 'https://cdn.modrinth.com/lithium.jar',
              filename: 'lithium.jar',
              primary: true,
              size: 500000,
              hashes: { sha1: 'abc', sha512: 'def' },
            },
          ],
          dependencies: [],
          date_published: '2024-01-15T00:00:00Z',
        },
      ];

      const searchSpy = vi.spyOn(commands, 'searchMods').mockResolvedValue({
        status: 'ok',
        data: mockSearch,
      });

      const getVersionsSpy = vi.spyOn(commands, 'getModVersions').mockResolvedValue({
        status: 'ok',
        data: mockVersions,
      });

      const installSpy = vi.spyOn(commands, 'installMod').mockResolvedValue({
        status: 'ok',
        data: {
          to_install: mockVersions,
          optional_suggestions: [],
          conflicts: [],
        },
      });

      const onInstalled = vi.fn();

      render(
        <ModBrowserModal
          isOpen={true}
          onClose={vi.fn()}
          instanceId="test-inst"
          gameVersion="1.20.4"
          loader="fabric"
          onModInstalled={onInstalled}
        />
      );

      await waitFor(() => {
        expect(searchSpy).toHaveBeenCalled();
        expect(screen.getByText('Lithium')).toBeDefined();
      });

      // Click on Lithium card to view versions
      fireEvent.click(screen.getByText('Lithium'));

      await waitFor(() => {
        expect(getVersionsSpy).toHaveBeenCalledWith('lithium', '1.20.4', 'fabric');
        expect(screen.getByText('0.12.1')).toBeDefined();
      });

      // Click Install
      const installBtn = screen.getByRole('button', { name: /install|установить/i });
      fireEvent.click(installBtn);

      await waitFor(() => {
        expect(installSpy).toHaveBeenCalledWith('test-inst', 'ver-lithium-1');
        expect(onInstalled).toHaveBeenCalled();
      });
    });
  });
});
