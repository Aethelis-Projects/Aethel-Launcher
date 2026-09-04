import { create } from 'zustand';

export type GcPreset = 'G1GC' | 'ZGC' | 'Parallel';

interface SettingsState {
  minRamMb: number;
  maxRamMb: number;
  gcPreset: GcPreset;
  javaPath: string;
  setMinRamMb: (mb: number) => void;
  setMaxRamMb: (mb: number) => void;
  setGcPreset: (preset: GcPreset) => void;
  setJavaPath: (path: string) => void;
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
}));
