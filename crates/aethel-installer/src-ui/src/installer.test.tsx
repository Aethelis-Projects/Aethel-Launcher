import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useInstallerStore, COMPONENT_SIZES } from './store/installerStore';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LicenseScreen } from './components/LicenseScreen';
import { ComponentsScreen } from './components/ComponentsScreen';
import { ShimmerProgress } from './animations/ShimmerProgress';
import i18n from './i18n';

describe('Aethel Custom Installer UI', () => {
  beforeEach(() => {
    i18n.changeLanguage('ru');
    useInstallerStore.setState({
      currentScreen: 'welcome',
      licenseAccepted: false,
      language: 'ru',
      components: {
        launcher: true,
        java21: true,
        java17: false,
        java8: false,
        desktopShortcut: true,
        startMenuShortcut: true,
        fileAssociations: true,
      },
    });
  });

  it('renders WelcomeScreen with start button and language toggle', () => {
    render(<WelcomeScreen />);
    expect(screen.getByText(/Добро пожаловать в Aethel Launcher/i)).toBeInTheDocument();
    expect(screen.getByText(/Начать установку/i)).toBeInTheDocument();

    // Toggle language
    const langBtn = screen.getByTitle(/Switch Language/i);
    fireEvent.click(langBtn);
    expect(useInstallerStore.getState().language).toBe('en');
  });

  it('gates LicenseScreen navigation until checkbox is accepted', () => {
    render(<LicenseScreen />);
    const nextBtn = screen.getByText(/Далее/i).closest('button');
    expect(nextBtn).toBeDisabled();

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(useInstallerStore.getState().licenseAccepted).toBe(true);
    expect(nextBtn).not.toBeDisabled();

    fireEvent.click(nextBtn!);
    expect(useInstallerStore.getState().currentScreen).toBe('path');
  });

  it('calculates total component sizes accurately', () => {
    const store = useInstallerStore.getState();
    const initialSize = store.getTotalDownloadSizeBytes();
    expect(initialSize).toBe(COMPONENT_SIZES.launcher + COMPONENT_SIZES.java21);

    // Toggle Java 17 on
    store.toggleComponent('java17');
    const newSize = useInstallerStore.getState().getTotalDownloadSizeBytes();
    expect(newSize).toBe(COMPONENT_SIZES.launcher + COMPONENT_SIZES.java21 + COMPONENT_SIZES.java17);

    // Launcher cannot be toggled off
    store.toggleComponent('launcher');
    expect(useInstallerStore.getState().components.launcher).toBe(true);
  });

  it('renders ShimmerProgress bar with clamped percentage', () => {
    const { container } = render(<ShimmerProgress percent={45} />);
    const bar = container.querySelector('[style*="width: 45%"]');
    expect(bar).toBeInTheDocument();
  });
});
