import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../__mocks__/tauri';
import { InstanceGrid } from '../components/InstanceGrid';
import { commands } from '../bindings';
import { mockLaunchReceipt } from '../__mocks__/tauri';

describe('InstanceGrid Smoke Component Suite', () => {
  it('renders instance cards and triggers stub launch on Play click', async () => {
    // Spy on launchWithStubIdentity
    const launchSpy = vi.spyOn(commands, 'launchWithStubIdentity').mockResolvedValue({
      status: 'ok',
      data: mockLaunchReceipt,
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
});
