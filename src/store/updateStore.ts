import { create } from 'zustand';
import { commands, type UpdateInfo } from '../bindings';

interface UpdateStoreState {
  updateInfo: UpdateInfo | null;
  isModalOpen: boolean;
  isToastOpen: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  isDownloaded: boolean;
  checkStatus: string | null;
  setModalOpen: (open: boolean) => void;
  setToastOpen: (open: boolean) => void;
  checkForUpdates: (channel: string, isManual?: boolean, isStartup?: boolean) => Promise<UpdateInfo | null>;
  installUpdate: (channel: string) => Promise<boolean>;
  reset: () => void;
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  updateInfo: null,
  isModalOpen: false,
  isToastOpen: false,
  isChecking: false,
  isDownloading: false,
  downloadProgress: 0,
  isDownloaded: false,
  checkStatus: null,

  setModalOpen: (open: boolean) => {
    set({ isModalOpen: open });
    if (open) {
      set({ isToastOpen: false });
    }
  },

  setToastOpen: (open: boolean) => {
    set({ isToastOpen: open });
  },

  checkForUpdates: async (channel: string, isManual = false, isStartup = false) => {
    set({ isChecking: true, checkStatus: null });

    try {
      const res = await commands.checkForUpdates(channel);
      if (res.status === 'ok' && res.data) {
        const info = res.data;
        const skippedVersion = typeof localStorage !== 'undefined' ? localStorage.getItem('aethel_skipped_update') : null;

        set({ updateInfo: info, checkStatus: 'available' });

        if (isManual) {
          // Explicit manual check: open the full details modal immediately
          set({ isModalOpen: true, isToastOpen: false });
        } else if (isStartup) {
          // Launcher startup: show recommendation modal unless player explicitly skipped this exact version
          if (skippedVersion !== info.version) {
            set({ isModalOpen: true, isToastOpen: false });
          }
        } else {
          // In-app live background check: show bottom-right toast
          if (!get().isModalOpen) {
            set({ isToastOpen: true });
          }
        }

        return info;
      } else {
        set({
          updateInfo: null,
          isModalOpen: false,
          isToastOpen: false,
          checkStatus: 'upToDate',
        });
        return null;
      }
    } catch {
      set({
        updateInfo: null,
        isModalOpen: false,
        isToastOpen: false,
        checkStatus: 'upToDate',
      });
      return null;
    } finally {
      set({ isChecking: false });
    }
  },

  installUpdate: async (channel: string) => {
    const { updateInfo } = get();
    set({ isDownloading: true, downloadProgress: 20 });

    try {
      const t1 = setTimeout(() => set({ downloadProgress: 55 }), 300);
      const t2 = setTimeout(() => set({ downloadProgress: 85 }), 700);

      const res = await commands.downloadAndInstallUpdate(channel, updateInfo?.download_url ?? null);

      clearTimeout(t1);
      clearTimeout(t2);

      if (res.status === 'ok') {
        set({ downloadProgress: 100, isDownloaded: true, isDownloading: false });
        return true;
      } else {
        set({ isDownloading: false, downloadProgress: 0 });
        return false;
      }
    } catch {
      set({ isDownloading: false, downloadProgress: 0 });
      return false;
    }
  },

  reset: () => {
    set({
      updateInfo: null,
      isModalOpen: false,
      isToastOpen: false,
      isChecking: false,
      isDownloading: false,
      downloadProgress: 0,
      isDownloaded: false,
      checkStatus: null,
    });
  },
}));
