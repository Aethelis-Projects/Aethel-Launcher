import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../__mocks__/tauri';
import i18n from '../i18n';
import { CrashReportModal } from '../components/CrashReportModal';
import { commands, type CrashReport } from '../bindings';

const mockReport: CrashReport = {
  pattern: 'OutOfMemory',
  diagnosis: 'The game ran out of allocated memory (Java heap space exhaustion).',
  suggestion: 'Allocate more RAM in Instance Settings (e.g. 4096MB or 6144MB).',
  full_log: '[12:00:00] [main/ERROR]: java.lang.OutOfMemoryError: Java heap space\n\tat net.minecraft.client.Main.main(Main.java:100)',
  exit_code: 1,
  upload_url: null,
};

describe('CrashReportModal Component Suite', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  it('renders diagnosis, recommendation, and privacy notice', () => {
    render(
      <CrashReportModal
        isOpen={true}
        onClose={vi.fn()}
        report={mockReport}
        instanceName="Vanilla 1.20.4"
      />
    );

    expect(screen.getByText(/OutOfMemory/i)).toBeDefined();
    expect(screen.getByText(/Java heap space exhaustion/i)).toBeDefined();
    expect(screen.getByText(/Allocate more RAM/i)).toBeDefined();
    // Verify privacy notice requirement
    expect(screen.getByText(/Privacy Notice/i)).toBeDefined();
  });

  it('expands full log when toggle button is clicked', () => {
    render(
      <CrashReportModal
        isOpen={true}
        onClose={vi.fn()}
        report={mockReport}
      />
    );

    const toggleBtn = screen.getByText(/View Full Log/i);
    expect(toggleBtn).toBeDefined();

    fireEvent.click(toggleBtn);
    expect(screen.getByText(/java\.lang\.OutOfMemoryError/i)).toBeDefined();
  });

  it('triggers mclo.gs upload and displays copy link button', async () => {
    const uploadSpy = vi.spyOn(commands, 'uploadCrashToMclogs').mockResolvedValue({
      status: 'ok',
      data: 'https://mclo.gs/test1234',
    });

    render(
      <CrashReportModal
        isOpen={true}
        onClose={vi.fn()}
        report={mockReport}
      />
    );

    const uploadBtn = screen.getByText(/Upload log to mclo\.gs/i);
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith(mockReport.full_log);
      expect(screen.getByText('https://mclo.gs/test1234')).toBeDefined();
      expect(screen.getByText(/Copy Link/i)).toBeDefined();
    });
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CrashReportModal
        isOpen={true}
        onClose={onClose}
        report={mockReport}
      />
    );

    const closeButtons = screen.getAllByText(/Close/i);
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
