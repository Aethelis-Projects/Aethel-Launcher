import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../__mocks__/tauri';
import { InstanceGrid } from '../components/InstanceGrid';
import { commands } from '../bindings';

describe('InstanceGrid Smoke Component Suite', () => {
  it('renders instance cards and triggers stub launch on Play click', async () => {
    // Spy on launchInstance
    const launchSpy = vi.spyOn(commands, 'launchInstance').mockResolvedValue({
      status: 'ok',
      data: 12345,
    });

    render(<InstanceGrid />);

    // Check title renders
    expect(screen.getAllByText(/1.20.4/i).length).toBeGreaterThan(0);

    // Find and click Play button
    const playButton =
      screen.getAllByRole('button').find((b) =>
        b.textContent?.includes('Play') || b.textContent?.includes('Играть')
      ) || screen.getAllByRole('button')[0];

    fireEvent.click(playButton);

    await waitFor(() => {
      expect(launchSpy).toHaveBeenCalled();
    });
  });

  it('opens InstanceManagerModal, toggles overrides, and saves settings', async () => {
    const updateSpy = vi.spyOn(commands, 'updateInstanceSettings').mockResolvedValue({
      status: 'ok',
      data: null,
    });

    render(<InstanceGrid />);

    // Find manage button for default instance (id: 'inst-1' from mock store)
    const manageBtns = screen.getAllByRole('button').filter((b) =>
      b.getAttribute('data-testid')?.startsWith('manage-instance-')
    );
    expect(manageBtns.length).toBeGreaterThan(0);

    fireEvent.click(manageBtns[0]);

    // Modal should be open; switch to settings tab
    const settingsTab = await screen.findByRole('button', { name: /settings|настройки/i });
    fireEvent.click(settingsTab);

    // Settings tab should have toggle
    await waitFor(() => {
      expect(screen.getByTestId('override-memory-toggle')).toBeInTheDocument();
    });

    // Toggle memory override
    const memToggle = screen.getByTestId('override-memory-toggle');
    fireEvent.click(memToggle);

    // Click save
    const saveBtn = screen.getByTestId('save-instance-settings-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
    });
  });
});
