import { create } from 'zustand';
import type { DownloadProgressItem } from '../bindings';

export interface ActiveDownloadTask {
  taskId: string;
  current: number;
  total: number;
  speedBps: number;
  fileName: string;
  status: 'downloading' | 'verifying' | 'completed' | 'failed';
  error?: string;
}

interface DownloadState {
  isOpen: boolean;
  tasks: Record<string, ActiveDownloadTask>;
  setIsOpen: (open: boolean) => void;
  updateProgress: (item: DownloadProgressItem) => void;
  updateBatchProgress: (items: DownloadProgressItem[]) => void;
  completeTask: (taskId: string) => void;
  failTask: (taskId: string, error: string) => void;
  clearCompleted: () => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  isOpen: false,
  tasks: {},

  setIsOpen: (open: boolean) => set({ isOpen: open }),

  updateProgress: (item: DownloadProgressItem) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [item.task_id]: {
          taskId: item.task_id,
          current: item.current,
          total: item.total,
          speedBps: item.speed_bps,
          fileName: item.file_name,
          status: item.current >= item.total && item.total > 0 ? 'verifying' : 'downloading',
        },
      },
    })),

  updateBatchProgress: (items: DownloadProgressItem[]) =>
    set((state) => {
      const nextTasks = { ...state.tasks };
      for (const item of items) {
        nextTasks[item.task_id] = {
          taskId: item.task_id,
          current: item.current,
          total: item.total,
          speedBps: item.speed_bps,
          fileName: item.file_name,
          status: item.current >= item.total && item.total > 0 ? 'verifying' : 'downloading',
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
            status: 'completed',
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
          },
        },
      };
    }),

  clearCompleted: () =>
    set((state) => {
      const nextTasks: Record<string, ActiveDownloadTask> = {};
      for (const [id, task] of Object.entries(state.tasks)) {
        if (task.status !== 'completed') {
          nextTasks[id] = task;
        }
      }
      return { tasks: nextTasks };
    }),
}));
