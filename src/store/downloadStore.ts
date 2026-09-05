import { create } from 'zustand';
import type { DownloadProgressItem } from '../bindings';

export type DownloadKind = 'mod' | 'modpack' | 'runtime' | 'update' | 'assets' | 'general';

export interface ActiveDownloadTask {
  taskId: string;
  id: string; // Alias for taskId
  kind: DownloadKind;
  name: string;
  fileName: string;
  version?: string;
  iconUrl?: string;
  total: number;
  totalBytes: number; // Alias for total
  current: number;
  downloadedBytes: number; // Alias for current
  speedBps: number;
  status: 'queued' | 'downloading' | 'verifying' | 'completed' | 'done' | 'failed' | 'error' | 'cancelled';
  error?: string;
  samples?: [number, number][]; // [timestamp, bytes]
}

interface DownloadState {
  isOpen: boolean;
  tasks: Record<string, ActiveDownloadTask>;
  setIsOpen: (open: boolean) => void;
  updateProgress: (item: DownloadProgressItem) => void;
  updateBatchProgress: (items: DownloadProgressItem[]) => void;
  completeTask: (taskId: string) => void;
  failTask: (taskId: string, error: string) => void;
  cancelTask: (taskId: string) => void;
  retryTask: (taskId: string) => void;
  clearCompleted: () => void;
}

function inferKindAndName(fileName: string, rawKind?: string, rawName?: string): { kind: DownloadKind; name: string } {
  if (rawKind && rawName) {
    return { kind: rawKind as DownloadKind, name: rawName };
  }

  const lower = fileName.toLowerCase();
  let kind: DownloadKind = 'general';
  if (lower.endsWith('.mrpack') || lower.includes('modpack')) {
    kind = 'modpack';
  } else if (lower.includes('jre') || lower.includes('jdk') || lower.includes('adoptium') || lower.includes('zulu')) {
    kind = 'runtime';
  } else if (lower.includes('update') || lower.includes('aethel-launcher-update')) {
    kind = 'update';
  } else if (lower.includes('assets') || lower.includes('objects/') || lower.includes('indexes/')) {
    kind = 'assets';
  } else if (lower.endsWith('.jar')) {
    kind = 'mod';
  }

  const base = fileName.split('/').pop()?.split('\\').pop() || fileName;
  const name = rawName || base.replace(/\.(jar|zip|mrpack|tar\.gz)$/i, '');

  return { kind, name };
}

// Minor 4: Rolling average calculation over the last 5 progress events
function calculateRollingSpeed(
  existingSamples: [number, number][] | undefined,
  now: number,
  currentBytes: number
): { speedBps: number; nextSamples: [number, number][] } {
  const windowSize = 5;
  const samples: [number, number][] = existingSamples ? [...existingSamples, [now, currentBytes]] : [[now, currentBytes]];
  const recent = samples.slice(-windowSize);

  if (recent.length >= 2) {
    const [firstTime, firstBytes] = recent[0];
    const [lastTime, lastBytes] = recent[recent.length - 1];
    const timeSec = (lastTime - firstTime) / 1000;
    if (timeSec > 0 && lastBytes >= firstBytes) {
      return {
        speedBps: Math.round((lastBytes - firstBytes) / timeSec),
        nextSamples: recent,
      };
    }
  }

  return { speedBps: 0, nextSamples: recent };
}

export const useDownloadStore = create<DownloadState>((set) => ({
  isOpen: false,
  tasks: {},

  setIsOpen: (open: boolean) => set({ isOpen: open }),

  updateProgress: (item: DownloadProgressItem) =>
    set((state) => {
      const prev = state.tasks[item.task_id];
      const now = Date.now();
      const { speedBps, nextSamples } = calculateRollingSpeed(prev?.samples, now, item.current);
      const { kind, name } = inferKindAndName(item.file_name, prev?.kind, prev?.name);

      const status =
        item.current >= item.total && item.total > 0
          ? 'verifying'
          : 'downloading';

      return {
        tasks: {
          ...state.tasks,
          [item.task_id]: {
            taskId: item.task_id,
            id: item.task_id,
            kind,
            name,
            fileName: item.file_name,
            version: prev?.version,
            iconUrl: prev?.iconUrl,
            total: item.total,
            totalBytes: item.total,
            current: item.current,
            downloadedBytes: item.current,
            speedBps: speedBps > 0 ? speedBps : item.speed_bps,
            status,
            samples: nextSamples,
          },
        },
      };
    }),

  updateBatchProgress: (items: DownloadProgressItem[]) =>
    set((state) => {
      const nextTasks = { ...state.tasks };
      const now = Date.now();

      for (const item of items) {
        const prev = nextTasks[item.task_id];
        const { speedBps, nextSamples } = calculateRollingSpeed(prev?.samples, now, item.current);
        const { kind, name } = inferKindAndName(item.file_name, prev?.kind, prev?.name);

        const status =
          item.current >= item.total && item.total > 0
            ? 'verifying'
            : 'downloading';

        nextTasks[item.task_id] = {
          taskId: item.task_id,
          id: item.task_id,
          kind,
          name,
          fileName: item.file_name,
          version: prev?.version,
          iconUrl: prev?.iconUrl,
          total: item.total,
          totalBytes: item.total,
          current: item.current,
          downloadedBytes: item.current,
          speedBps: speedBps > 0 ? speedBps : item.speed_bps,
          status,
          samples: nextSamples,
        };
      }
      return { tasks: nextTasks };
    }),

  completeTask: (taskId: string) =>
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            current: task.total,
            downloadedBytes: task.total,
            status: 'completed',
            speedBps: 0,
          },
        },
      };
    }),

  failTask: (taskId: string, error: string) =>
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'failed',
            error,
            speedBps: 0,
          },
        },
      };
    }),

  cancelTask: (taskId: string) =>
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'cancelled',
            speedBps: 0,
          },
        },
      };
    }),

  retryTask: (taskId: string) =>
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'queued',
            error: undefined,
            current: 0,
            downloadedBytes: 0,
            samples: [],
          },
        },
      };
    }),

  clearCompleted: () =>
    set((state) => {
      const nextTasks: Record<string, ActiveDownloadTask> = {};
      for (const [id, task] of Object.entries(state.tasks)) {
        if (task.status !== 'done' && (task.status as string) !== 'completed' && task.status !== 'cancelled') {
          nextTasks[id] = task;
        }
      }
      return { tasks: nextTasks };
    }),
}));
