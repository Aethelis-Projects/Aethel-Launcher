import React, { useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { ParticleBackground } from './animations/ParticleBackground';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LicenseScreen } from './components/LicenseScreen';
import { PathSelectionScreen } from './components/PathSelectionScreen';
import { ComponentsScreen } from './components/ComponentsScreen';
import { ProgressScreen } from './components/ProgressScreen';
import { CompletionScreen } from './components/CompletionScreen';
import { useInstallerStore } from './store/installerStore';

export const App: React.FC = () => {
  const { currentScreen, setUpdateAvailable, setFreeSpaceBytes, setInstallPath } = useInstallerStore();

  useEffect(() => {
    // Check for newer installer release and default install path on start
    const initBackend = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const defaultPath = await invoke<string>('get_default_install_path');
        if (defaultPath) {
          setInstallPath(defaultPath);
          const spaceInfo = await invoke<{ freeBytes: number }>('check_disk_space', {
            path: defaultPath,
          });
          if (spaceInfo && spaceInfo.freeBytes) {
            setFreeSpaceBytes(spaceInfo.freeBytes);
          }
        }

        const latestVer = await invoke<string | null>('check_installer_version');
        if (latestVer) {
          setUpdateAvailable(latestVer);
        }
      } catch {
        // Fallback in web / test mode
      }
    };

    initBackend();
  }, [setFreeSpaceBytes, setInstallPath, setUpdateAvailable]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'welcome':
        return <WelcomeScreen />;
      case 'license':
        return <LicenseScreen />;
      case 'path':
        return <PathSelectionScreen />;
      case 'components':
        return <ComponentsScreen />;
      case 'progress':
        return <ProgressScreen />;
      case 'completion':
        return <CompletionScreen />;
      default:
        return <WelcomeScreen />;
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] text-slate-100 overflow-hidden font-sans border border-slate-800/80 rounded-lg shadow-2xl relative select-none">
      {/* Frameless window titlebar */}
      <TitleBar />

      {/* Particle Canvas Background */}
      <ParticleBackground />

      {/* Ambient background mesh gradient glow */}
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #00F5D4 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-15 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #7B2CBF 0%, transparent 70%)' }}
      />

      {/* Active Screen View */}
      <div className="flex-1 min-h-0 overflow-hidden relative z-10 flex flex-col">
        {renderScreen()}
      </div>
    </div>
  );
};
