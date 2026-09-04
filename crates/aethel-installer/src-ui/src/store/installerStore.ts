import { create } from 'zustand';

export type ScreenId = 'welcome' | 'license' | 'path' | 'components' | 'progress' | 'completion';

export interface SelectedComponents {
  launcher: boolean;
  java21: boolean;
  java17: boolean;
  java8: boolean;
  desktopShortcut: boolean;
  startMenuShortcut: boolean;
  fileAssociations: boolean;
}

export interface InstallProgressState {
  stage: string;
  percent: number;
  speed: string;
  eta: string;
  logs: string[];
  isComplete: boolean;
  error: string | null;
}

interface InstallerState {
  currentScreen: ScreenId;
  installPath: string;
  autoCreateFolder: boolean;
  freeSpaceBytes: number;
  licenseAccepted: boolean;
  language: 'ru' | 'en';
  components: SelectedComponents;
  progress: InstallProgressState;
  launchOnFinish: boolean;
  updateAvailable: string | null;

  // Actions
  setScreen: (screen: ScreenId) => void;
  setInstallPath: (path: string) => void;
  setAutoCreateFolder: (create: boolean) => void;
  setFreeSpaceBytes: (bytes: number) => void;
  setLicenseAccepted: (accepted: boolean) => void;
  setLanguage: (lang: 'ru' | 'en') => void;
  toggleComponent: (key: keyof SelectedComponents) => void;
  setProgress: (update: Partial<InstallProgressState>) => void;
  addLog: (log: string) => void;
  setLaunchOnFinish: (launch: boolean) => void;
  setUpdateAvailable: (version: string | null) => void;
  getTotalDownloadSizeBytes: () => number;
}

export const COMPONENT_SIZES: Record<keyof SelectedComponents, number> = {
  launcher: 120 * 1024 * 1024,
  java21: 190 * 1024 * 1024,
  java17: 175 * 1024 * 1024,
  java8: 105 * 1024 * 1024,
  desktopShortcut: 0,
  startMenuShortcut: 0,
  fileAssociations: 0,
};

export const useInstallerStore = create<InstallerState>((set, get) => ({
  currentScreen: 'welcome',
  installPath: '',
  autoCreateFolder: true,
  freeSpaceBytes: 100 * 1024 * 1024 * 1024,
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
  progress: {
    stage: 'Инициализация...',
    percent: 0,
    speed: '0 MB/s',
    eta: '--',
    logs: ['[00:00:00] [INFO] Installer initialized'],
    isComplete: false,
    error: null,
  },
  launchOnFinish: true,
  updateAvailable: null,

  setScreen: (screen) => set({ currentScreen: screen }),
  setInstallPath: (path) => set({ installPath: path }),
  setAutoCreateFolder: (autoCreateFolder) => set({ autoCreateFolder }),
  setFreeSpaceBytes: (freeSpaceBytes) => set({ freeSpaceBytes }),
  setLicenseAccepted: (licenseAccepted) => set({ licenseAccepted }),
  setLanguage: (language) => set({ language }),
  toggleComponent: (key) =>
    set((state) => {
      if (key === 'launcher') return state;
      return {
        components: {
          ...state.components,
          [key]: !state.components[key],
        },
      };
    }),
  setProgress: (update) =>
    set((state) => ({
      progress: {
        ...state.progress,
        ...update,
      },
    })),
  addLog: (log) =>
    set((state) => ({
      progress: {
        ...state.progress,
        logs: [...state.progress.logs, log],
      },
    })),
  setLaunchOnFinish: (launchOnFinish) => set({ launchOnFinish }),
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),

  getTotalDownloadSizeBytes: () => {
    const { components } = get();
    let total = 0;
    (Object.keys(components) as (keyof SelectedComponents)[]).forEach((k) => {
      if (components[k]) {
        total += COMPONENT_SIZES[k] || 0;
      }
    });
    return total;
  },
}));
