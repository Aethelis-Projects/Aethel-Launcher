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
    const playButtons = screen.getAllByRole('button');
    expect(playButtons.length).toBeGreaterThan(0);

    fireEvent.click(playButtons[0]);

    await waitFor(() => {
      expect(launchSpy).toHaveBeenCalled();
    });
  });
});
