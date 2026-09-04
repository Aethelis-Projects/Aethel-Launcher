import { create } from 'zustand';
import { commands, type Instance, type LaunchReceipt } from '../bindings';

export type InstanceLaunchStatus = 'idle' | 'preparing' | 'downloading' | 'launching' | 'running';

interface InstanceState {
  instances: Instance[];
  selectedInstanceId: string | null;
  launchStatus: Record<string, InstanceLaunchStatus>;
  lastReceipt: LaunchReceipt | null;
  lastError: string | null;
  setInstances: (instances: Instance[]) => void;
  addInstance: (instance: Instance) => void;
  setSelectedInstanceId: (id: string | null) => void;
  setLaunchStatus: (id: string, status: InstanceLaunchStatus) => void;
  setLastReceipt: (receipt: LaunchReceipt | null) => void;
  setLastError: (error: string | null) => void;
  updateInstanceLoader: (id: string, loader: string | null, loaderVersion: string | null) => void;
  fetchInstances: () => Promise<void>;
  deleteInstance: (id: string) => Promise<void>;
}

const defaultInstances: Instance[] = [
  {
    id: 'vanilla-1.20.4',
    name: 'Minecraft 1.20.4 (Vanilla)',
    game_version: '1.20.4',
    loader: null,
    loader_version: null,
    java_path: null,
    memory_min_mb: 1024,
    memory_max_mb: 4096,
    jvm_args: '-XX:+UseG1GC',
    last_played_at: null,
    total_playtime_seconds: 0,
    icon_path: null,
    banner_path: null,
    last_mclo_gs_url: null,
    last_mclo_gs_at: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'vanilla-1.21.1',
    name: 'Minecraft 1.21.1 (Tricky Trials)',
    game_version: '1.21.1',
    loader: null,
    loader_version: null,
    java_path: null,
    memory_min_mb: 1024,
    memory_max_mb: 4096,
    jvm_args: '-XX:+UseG1GC',
    last_played_at: null,
    total_playtime_seconds: 0,
    icon_path: null,
    banner_path: null,
    last_mclo_gs_url: null,
    last_mclo_gs_at: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'vanilla-1.7.10',
    name: 'Minecraft 1.7.10 (Legacy)',
    game_version: '1.7.10',
    loader: null,
    loader_version: null,
    java_path: null,
    memory_min_mb: 512,
    memory_max_mb: 2048,
    jvm_args: null,
    last_played_at: null,
    total_playtime_seconds: 0,
    icon_path: null,
    banner_path: null,
    last_mclo_gs_url: null,
    last_mclo_gs_at: null,
    created_at: new Date().toISOString(),
  },
];

export const useInstanceStore = create<InstanceState>((set) => ({
  instances: defaultInstances,
  selectedInstanceId: defaultInstances[0].id,
  launchStatus: {},
  lastReceipt: null,
  lastError: null,

  setInstances: (instances) => set({ instances }),
  addInstance: (instance) =>
    set((state) => ({
      instances: [...state.instances, instance],
      selectedInstanceId: instance.id,
    })),
  setSelectedInstanceId: (id) => set({ selectedInstanceId: id }),
  setLaunchStatus: (id, status) =>
    set((state) => ({
      launchStatus: { ...state.launchStatus, [id]: status },
    })),
  setLastReceipt: (receipt) => set({ lastReceipt: receipt, lastError: null }),
  setLastError: (error) => set({ lastError: error }),
  updateInstanceLoader: (id, loader, loaderVersion) =>
    set((state) => ({
      instances: state.instances.map((inst) =>
        inst.id === id ? { ...inst, loader, loader_version: loaderVersion } : inst
      ),
    })),
  fetchInstances: async () => {
    try {
      const res = await commands.getInstances();
      if (res.status === 'ok' && res.data && res.data.length > 0) {
        set((state) => ({
          instances: res.data,
          selectedInstanceId:
            res.data.some((i) => i.id === state.selectedInstanceId)
              ? state.selectedInstanceId
              : res.data[0].id,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch instances:', err);
    }
  },
  deleteInstance: async (id: string) => {
    try {
      const res = await commands.deleteInstance(id);
      if (res.status === 'ok') {
        set((state) => {
          const filtered = state.instances.filter((i) => i.id !== id);
          return {
            instances: filtered,
            selectedInstanceId:
              state.selectedInstanceId === id
                ? (filtered[0]?.id ?? null)
                : state.selectedInstanceId,
          };
        });
      }
    } catch (err) {
      console.error('Failed to delete instance:', err);
    }
  },
}));
