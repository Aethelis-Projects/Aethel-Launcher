import { create } from 'zustand';

export type GcPreset = 'G1GC' | 'ZGC' | 'GenerationalZGC' | 'Parallel';
export type JavaMode = 'auto' | 'manual';
export type PreferredJavaProvider = 'Adoptium' | 'Zulu';

interface SettingsState {
  minRamMb: number;
  maxRamMb: number;
  gcPreset: GcPreset;
  javaPath: string;
  javaMode: JavaMode;
  preferredProvider: PreferredJavaProvider;
  updateChannel: 'stable' | 'beta';
  skippedUpdateVersion: string | null;
  setMinRamMb: (mb: number) => void;
  setMaxRamMb: (mb: number) => void;
  setGcPreset: (preset: GcPreset) => void;
  setJavaPath: (path: string) => void;
  setJavaMode: (mode: JavaMode) => void;
  setPreferredProvider: (provider: PreferredJavaProvider) => void;
  setUpdateChannel: (channel: 'stable' | 'beta') => void;
  setSkippedUpdateVersion: (version: string | null) => void;
}

const getStoredInt = (key: string, defaultVal: number) => {
  if (typeof localStorage === 'undefined') return defaultVal;
  const val = localStorage.getItem(key);
  return val ? parseInt(val, 10) : defaultVal;
};

const getStoredString = (key: string, defaultVal: string) => {
  if (typeof localStorage === 'undefined') return defaultVal;
  return localStorage.getItem(key) || defaultVal;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  minRamMb: getStoredInt('aethel_min_ram', 1024),
  maxRamMb: getStoredInt('aethel_max_ram', 4096),
  gcPreset: getStoredString('aethel_gc_preset', 'G1GC') as GcPreset,
  javaPath: getStoredString('aethel_java_path', 'javaw.exe'),
  javaMode: (getStoredString('aethel_java_mode', 'auto') as JavaMode) || 'auto',
  preferredProvider: (getStoredString('aethel_java_provider', 'Adoptium') as PreferredJavaProvider) || 'Adoptium',
  updateChannel: (getStoredString('aethel_update_channel', 'stable') as 'stable' | 'beta') || 'stable',
  skippedUpdateVersion: typeof localStorage !== 'undefined' ? localStorage.getItem('aethel_skipped_update') : null,

  setMinRamMb: (mb: number) => {
    localStorage.setItem('aethel_min_ram', mb.toString());
    set({ minRamMb: mb });
  },
  setMaxRamMb: (mb: number) => {
    localStorage.setItem('aethel_max_ram', mb.toString());
    set({ maxRamMb: mb });
  },
  setGcPreset: (preset: GcPreset) => {
    localStorage.setItem('aethel_gc_preset', preset);
    set({ gcPreset: preset });
  },
  setJavaPath: (path: string) => {
    localStorage.setItem('aethel_java_path', path);
    set({ javaPath: path });
  },
  setJavaMode: (mode: JavaMode) => {
    localStorage.setItem('aethel_java_mode', mode);
    set({ javaMode: mode });
  },
  setPreferredProvider: (provider: PreferredJavaProvider) => {
    localStorage.setItem('aethel_java_provider', provider);
    set({ preferredProvider: provider });
  },
  setUpdateChannel: (channel: 'stable' | 'beta') => {
    localStorage.setItem('aethel_update_channel', channel);
    set({ updateChannel: channel });
  },
  setSkippedUpdateVersion: (version: string | null) => {
    if (version) {
      localStorage.setItem('aethel_skipped_update', version);
    } else {
      localStorage.removeItem('aethel_skipped_update');
    }
    set({ skippedUpdateVersion: version });
  },
}));
