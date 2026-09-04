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
  searchQuery: string;
  levelFilter: 'ALL' | 'INFO' | 'WARN' | 'ERROR';
  autoScroll: boolean;
  nextId: number;
  setSearchQuery: (query: string) => void;
  setLevelFilter: (level: 'ALL' | 'INFO' | 'WARN' | 'ERROR') => void;
  setAutoScroll: (auto: boolean) => void;
  addLog: (line: string, isStderr: boolean) => void;
  addLogBatch: (newLines: string[], isStderr: boolean) => void;
  clearLogs: () => void;
}

const MAX_LOG_LINES = 5000;

function detectLevel(line: string, isStderr: boolean): 'INFO' | 'WARN' | 'ERROR' {
  if (isStderr) return 'ERROR';
  const upper = line.toUpperCase();
  if (upper.includes('/WARN') || upper.includes('[WARN]')) return 'WARN';
  if (upper.includes('/ERROR') || upper.includes('[ERROR]') || upper.includes('FATAL')) return 'ERROR';
  return 'INFO';
}

export const useLogStore = create<LogState>((set) => ({
  lines: [],
  searchQuery: '',
  levelFilter: 'ALL',
  autoScroll: true,
  nextId: 1,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setLevelFilter: (level) => set({ levelFilter: level }),
  setAutoScroll: (auto) => set({ autoScroll: auto }),

  addLog: (line, isStderr) =>
    set((state) => {
      const entry: LogEntry = {
        id: state.nextId,
        timestamp: new Date().toLocaleTimeString(),
        line,
        isStderr,
        level: detectLevel(line, isStderr),
      };
      const nextLines = [...state.lines, entry];
      if (nextLines.length > MAX_LOG_LINES) {
        nextLines.splice(0, nextLines.length - MAX_LOG_LINES);
      }
      return { lines: nextLines, nextId: state.nextId + 1 };
    }),

  addLogBatch: (newLines, isStderr) =>
    set((state) => {
      let currentId = state.nextId;
      const timestamp = new Date().toLocaleTimeString();
      const entries: LogEntry[] = newLines.map((line) => {
        const entry: LogEntry = {
          id: currentId++,
          timestamp,
          line,
          isStderr,
          level: detectLevel(line, isStderr),
        };
        return entry;
      });

      let nextLines = [...state.lines, ...entries];
      if (nextLines.length > MAX_LOG_LINES) {
        nextLines = nextLines.slice(nextLines.length - MAX_LOG_LINES);
      }
      return { lines: nextLines, nextId: currentId };
    }),

  clearLogs: () => set({ lines: [] }),
}));
