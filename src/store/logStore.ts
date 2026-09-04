import { create } from 'zustand';

export interface LogEntry {
  id: number;
  timestamp: string;
  line: string;
  isStderr: boolean;
  level: 'INFO' | 'WARN' | 'ERROR';
}

interface LogState {
  lines: LogEntry[];
  instanceLogs: Record<string, LogEntry[]>;
  mclogsUrls: Record<string, string>;
  activeInstanceId: string | null;
  searchQuery: string;
  levelFilter: 'ALL' | 'INFO' | 'WARN' | 'ERROR';
  autoScroll: boolean;
  nextId: number;

  setActiveInstance: (instanceId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setLevelFilter: (level: 'ALL' | 'INFO' | 'WARN' | 'ERROR') => void;
  setAutoScroll: (auto: boolean) => void;
  addLog: (line: string, isStderr: boolean, instanceId?: string) => void;
  addLogBatch: (newLines: string[], isStderr: boolean, instanceId?: string) => void;
  clearLogs: (instanceId?: string) => void;
  getLogs: (instanceId?: string) => LogEntry[];
  setMclogsUrl: (instanceId: string, url: string) => void;
  getMclogsUrl: (instanceId: string) => string | undefined;
}

const MAX_LOG_LINES = 5000;

function detectLevel(line: string, isStderr: boolean): 'INFO' | 'WARN' | 'ERROR' {
  if (isStderr) return 'ERROR';
  const upper = line.toUpperCase();
  if (upper.includes('/WARN') || upper.includes('[WARN]')) return 'WARN';
  if (upper.includes('/ERROR') || upper.includes('[ERROR]') || upper.includes('FATAL')) return 'ERROR';
  return 'INFO';
}

export const useLogStore = create<LogState>((set, get) => ({
  lines: [],
  instanceLogs: {},
  mclogsUrls: {},
  activeInstanceId: null,
  searchQuery: '',
  levelFilter: 'ALL',
  autoScroll: true,
  nextId: 1,

  setActiveInstance: (instanceId) =>
    set((state) => {
      const activeLogs = instanceId ? (state.instanceLogs[instanceId] || []) : [];
      return {
        activeInstanceId: instanceId,
        lines: instanceId ? activeLogs : state.lines,
      };
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setLevelFilter: (level) => set({ levelFilter: level }),
  setAutoScroll: (auto) => set({ autoScroll: auto }),

  addLog: (line, isStderr, instanceId) =>
    set((state) => {
      const entry: LogEntry = {
        id: state.nextId,
        timestamp: new Date().toLocaleTimeString(),
        line,
        isStderr,
        level: detectLevel(line, isStderr),
      };

      const targetInstanceId = instanceId ?? state.activeInstanceId;
      let newInstanceLogs = state.instanceLogs;

      if (targetInstanceId) {
        const existing = state.instanceLogs[targetInstanceId] || [];
        const updated = [...existing, entry];
        if (updated.length > MAX_LOG_LINES) {
          updated.splice(0, updated.length - MAX_LOG_LINES);
        }
        newInstanceLogs = { ...state.instanceLogs, [targetInstanceId]: updated };
      }

      let nextLines = state.lines;
      if (!targetInstanceId || targetInstanceId === state.activeInstanceId || state.activeInstanceId === null) {
        nextLines = [...state.lines, entry];
        if (nextLines.length > MAX_LOG_LINES) {
          nextLines.splice(0, nextLines.length - MAX_LOG_LINES);
        }
      }

      return {
        lines: nextLines,
        instanceLogs: newInstanceLogs,
        nextId: state.nextId + 1,
      };
    }),

  addLogBatch: (newLines, isStderr, instanceId) =>
    set((state) => {
      let currentId = state.nextId;
      const timestamp = new Date().toLocaleTimeString();
      const entries: LogEntry[] = newLines.map((line) => ({
        id: currentId++,
        timestamp,
        line,
        isStderr,
        level: detectLevel(line, isStderr),
      }));

      const targetInstanceId = instanceId ?? state.activeInstanceId;
      let newInstanceLogs = state.instanceLogs;

      if (targetInstanceId) {
        const existing = state.instanceLogs[targetInstanceId] || [];
        let updated = [...existing, ...entries];
        if (updated.length > MAX_LOG_LINES) {
          updated = updated.slice(updated.length - MAX_LOG_LINES);
        }
        newInstanceLogs = { ...state.instanceLogs, [targetInstanceId]: updated };
      }

      let nextLines = state.lines;
      if (!targetInstanceId || targetInstanceId === state.activeInstanceId || state.activeInstanceId === null) {
        nextLines = [...state.lines, ...entries];
        if (nextLines.length > MAX_LOG_LINES) {
          nextLines = nextLines.slice(nextLines.length - MAX_LOG_LINES);
        }
      }

      return {
        lines: nextLines,
        instanceLogs: newInstanceLogs,
        nextId: currentId,
      };
    }),

  clearLogs: (instanceId) =>
    set((state) => {
      if (instanceId) {
        const newInstanceLogs = { ...state.instanceLogs };
        delete newInstanceLogs[instanceId];
        return {
          instanceLogs: newInstanceLogs,
          lines: state.activeInstanceId === instanceId ? [] : state.lines,
        };
      }
      return { lines: [], instanceLogs: {} };
    }),

  getLogs: (instanceId) => {
    const state = get();
    if (instanceId) {
      return state.instanceLogs[instanceId] || [];
    }
    return state.lines;
  },

  setMclogsUrl: (instanceId, url) =>
    set((state) => ({
      mclogsUrls: { ...state.mclogsUrls, [instanceId]: url },
    })),

  getMclogsUrl: (instanceId) => {
    return get().mclogsUrls[instanceId];
  },
}));
