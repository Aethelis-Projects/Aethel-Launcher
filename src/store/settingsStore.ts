import { create } from 'zustand';
import { commands, type GlobalSettings } from '../bindings';

export type GcPreset = 'G1GC' | 'ZGC' | 'GenerationalZGC' | 'Parallel';
export type JavaMode = 'auto' | 'manual';
export type PreferredJavaProvider = 'Adoptium' | 'Zulu';
export type Theme = 'system' | 'dark' | 'light';

export interface SettingsState {
  theme: Theme;
  discordRpcEnabled: boolean;
  minRamMb: number;
  maxRamMb: number;
  gcPreset: GcPreset;
  javaPath: string;
  javaMode: JavaMode;
  preferredProvider: PreferredJavaProvider;
  updateChannel: 'stable' | 'beta';
  defaultJvmArgs: string;
  skippedUpdateVersion: string | null;
  setTheme: (theme: Theme) => void;
  setDiscordRpcEnabled: (enabled: boolean, locale?: string) => Promise<void>;
  setMinRamMb: (mb: number) => void;
  setMaxRamMb: (mb: number) => void;
  setGcPreset: (preset: GcPreset) => void;
  setJavaPath: (path: string) => void;
  setJavaMode: (mode: JavaMode) => void;
  setPreferredProvider: (provider: PreferredJavaProvider) => void;
  setUpdateChannel: (channel: 'stable' | 'beta') => void;
  setDefaultJvmArgs: (args: string) => void;
  setSkippedUpdateVersion: (version: string | null) => void;
  initGlobalSettings: (locale?: string) => Promise<void>;
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

const getStoredBool = (key: string, defaultVal: boolean) => {
  if (typeof localStorage === 'undefined') return defaultVal;
  const val = localStorage.getItem(key);
  return val !== null ? val === 'true' : defaultVal;
};

const applyTheme = (theme: Theme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
    root.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
  }
};

const syncBackend = (state: SettingsState) => {
  const global: GlobalSettings = {
    theme: state.theme,
    discord_rpc_enabled: state.discordRpcEnabled,
    update_channel: state.updateChannel,
    default_java_path: state.javaPath && state.javaPath.trim() ? state.javaPath.trim() : null,
    default_java_mode: state.javaMode,
    default_java_provider: state.preferredProvider,
    default_memory_min_mb: state.minRamMb,
    default_memory_max_mb: state.maxRamMb,
    default_gc_preset: state.gcPreset,
    default_jvm_args: state.defaultJvmArgs && state.defaultJvmArgs.trim() ? state.defaultJvmArgs.trim() : null,
  };
  commands.updateGlobalSettings(global).catch(() => {});
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: (getStoredString('aethel_theme', 'system') as Theme) || 'system',
  discordRpcEnabled: getStoredBool('aethel_discord_rpc', false),
  minRamMb: getStoredInt('aethel_min_ram', 1024),
  maxRamMb: getStoredInt('aethel_max_ram', 4096),
  gcPreset: (getStoredString('aethel_gc_preset', 'G1GC') as GcPreset) || 'G1GC',
  javaPath: getStoredString('aethel_java_path', 'javaw.exe'),
  javaMode: (getStoredString('aethel_java_mode', 'auto') as JavaMode) || 'auto',
  preferredProvider: (getStoredString('aethel_java_provider', 'Adoptium') as PreferredJavaProvider) || 'Adoptium',
  updateChannel: (getStoredString('aethel_update_channel', 'stable') as 'stable' | 'beta') || 'stable',
  defaultJvmArgs: getStoredString('aethel_default_jvm_args', ''),
  skippedUpdateVersion: typeof localStorage !== 'undefined' ? localStorage.getItem('aethel_skipped_update') : null,

  setTheme: (theme: Theme) => {
    localStorage.setItem('aethel_theme', theme);
    applyTheme(theme);
    set({ theme });
    syncBackend(get());
  },

  setDiscordRpcEnabled: async (enabled: boolean, locale?: string) => {
    localStorage.setItem('aethel_discord_rpc', String(enabled));
    set({ discordRpcEnabled: enabled });
    syncBackend(get());
    try {
      await commands.setDiscordRpcEnabled(enabled, locale ?? null);
    } catch {}
  },

  setMinRamMb: (mb: number) => {
    localStorage.setItem('aethel_min_ram', mb.toString());
    set({ minRamMb: mb });
    syncBackend(get());
  },

  setMaxRamMb: (mb: number) => {
    localStorage.setItem('aethel_max_ram', mb.toString());
    set({ maxRamMb: mb });
    syncBackend(get());
  },

  setGcPreset: (preset: GcPreset) => {
    localStorage.setItem('aethel_gc_preset', preset);
    set({ gcPreset: preset });
    syncBackend(get());
  },

  setJavaPath: (path: string) => {
    localStorage.setItem('aethel_java_path', path);
    set({ javaPath: path });
    syncBackend(get());
  },

  setJavaMode: (mode: JavaMode) => {
    localStorage.setItem('aethel_java_mode', mode);
    set({ javaMode: mode });
    syncBackend(get());
  },

  setPreferredProvider: (provider: PreferredJavaProvider) => {
    localStorage.setItem('aethel_java_provider', provider);
    set({ preferredProvider: provider });
    syncBackend(get());
  },

  setUpdateChannel: (channel: 'stable' | 'beta') => {
    localStorage.setItem('aethel_update_channel', channel);
    set({ updateChannel: channel });
    syncBackend(get());
  },

  setDefaultJvmArgs: (args: string) => {
    localStorage.setItem('aethel_default_jvm_args', args);
    set({ defaultJvmArgs: args });
    syncBackend(get());
  },

  setSkippedUpdateVersion: (version: string | null) => {
    if (version) {
      localStorage.setItem('aethel_skipped_update', version);
    } else {
      localStorage.removeItem('aethel_skipped_update');
    }
    set({ skippedUpdateVersion: version });
  },

  initGlobalSettings: async (locale?: string) => {
    try {
      const res = await commands.getGlobalSettings();
      if (res.status === 'ok') {
        const g = res.data;
        const theme = (g.theme as Theme) || 'system';
        const discordRpcEnabled = g.discord_rpc_enabled ?? false;
        const updateChannel = (g.update_channel as 'stable' | 'beta') || 'stable';
        const javaMode = (g.default_java_mode as JavaMode) || 'auto';
        const preferredProvider = (g.default_java_provider as PreferredJavaProvider) || 'Adoptium';
        const minRamMb = g.default_memory_min_mb || 1024;
        const maxRamMb = g.default_memory_max_mb || 4096;
        const gcPreset = (g.default_gc_preset as GcPreset) || 'G1GC';
        const javaPath = g.default_java_path || '';
        const defaultJvmArgs = g.default_jvm_args || '';

        localStorage.setItem('aethel_theme', theme);
        localStorage.setItem('aethel_discord_rpc', String(discordRpcEnabled));
        localStorage.setItem('aethel_update_channel', updateChannel);
        localStorage.setItem('aethel_java_mode', javaMode);
        localStorage.setItem('aethel_java_provider', preferredProvider);
        localStorage.setItem('aethel_min_ram', String(minRamMb));
        localStorage.setItem('aethel_max_ram', String(maxRamMb));
        localStorage.setItem('aethel_gc_preset', gcPreset);
        localStorage.setItem('aethel_java_path', javaPath);
        localStorage.setItem('aethel_default_jvm_args', defaultJvmArgs);

        applyTheme(theme);

        set({
          theme,
          discordRpcEnabled,
          updateChannel,
          javaMode,
          preferredProvider,
          minRamMb,
          maxRamMb,
          gcPreset,
          javaPath,
          defaultJvmArgs,
        });

        if (discordRpcEnabled) {
          commands.setDiscordRpcEnabled(true, locale ?? null).catch(() => {});
        }
      }
    } catch {}
  },
}));
