import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  CheckCircle2,
  Loader2,
  Trash2,
  RotateCw,
} from 'lucide-react';
import { useDownloadStore, type DownloadKind } from '../store/downloadStore';

function getKindIcon(kind: DownloadKind): string {
  switch (kind) {
    case 'mod':
      return '🧩';
    case 'modpack':
      return '📦';
    case 'runtime':
      return '☕';
    case 'update':
      return '🚀';
    case 'assets':
      return '🎨';
    default:
      return '📥';
  }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSpeed(speedBps: number): string {
  if (speedBps <= 0) return '0 KB/s';
  const mb = speedBps / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB/s`;
  }
  const kb = speedBps / 1024;
  return `${kb.toFixed(0)} KB/s`;
}

function formatETA(current: number, total: number, speedBps: number, lang: string): string {
  if (total <= 0 || current >= total || speedBps <= 0) return '';
  const remainingBytes = total - current;
  const seconds = Math.ceil(remainingBytes / speedBps);

  const isRu = lang.startsWith('ru');
  if (seconds < 60) {
    return isRu ? `осталось ${seconds} с` : `${seconds}s left`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  return isRu ? `осталось ${mins} мин ${remSecs} с` : `${mins}m ${remSecs}s left`;
}

export const DownloadsPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const {
    isOpen,
    setIsOpen,
    tasks,
    clearCompleted,
    cancelTask,
    retryTask,
  } = useDownloadStore();

  if (!isOpen) return null;

  const taskList = Object.values(tasks);
  const activeCount = taskList.filter(
    (t) => t.status === 'downloading' || t.status === 'verifying' || t.status === 'queued'
  ).length;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-zinc-950/95 border-l border-zinc-800 backdrop-blur-md shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Panel Header */}
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-zinc-100 text-sm">{t('downloads.title', 'Downloads')}</h3>
          {activeCount > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 text-[10px] font-mono font-bold animate-pulse">
              {activeCount} active
            </span>
          ) : taskList.length > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-mono">
              {taskList.length} total
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {taskList.some((t) => t.status === 'done' || (t.status as string) === 'completed' || t.status === 'cancelled') && (
            <button
              onClick={clearCompleted}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title={t('logs.clear', 'Clear completed')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {taskList.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
            <span className="text-3xl">📥</span>
            <p className="text-xs font-medium text-zinc-400">{t('downloads.noDownloads', 'No downloads yet')}</p>
            <p className="text-[11px] text-zinc-600">{t('downloads.idle', 'Active downloads will appear here.')}</p>
          </div>
        ) : (
          taskList.map((task) => {
            const isDone = task.status === 'done' || (task.status as string) === 'completed';
            const isError = task.status === 'error' || (task.status as string) === 'failed';
            const isVerifying = task.status === 'verifying';
            const isDownloading = task.status === 'downloading';
            const isCancelled = task.status === 'cancelled';

            const percent =
              task.total > 0
                ? Math.min(100, Math.round((task.current / task.total) * 100))
                : isDone
                ? 100
                : 0;

            const eta = formatETA(task.current, task.total, task.speedBps, i18n.language);

            return (
              <div
                key={task.taskId}
                className="p-3 bg-zinc-900/70 border border-zinc-800/80 hover:border-zinc-700/90 rounded-xl space-y-2 transition-all shadow-sm"
              >
                {/* Task Title Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className="text-base select-none shrink-0" role="img" aria-label={task.kind}>
                      {getKindIcon(task.kind)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-zinc-200 truncate">{task.name}</p>
                        {task.version && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 shrink-0">
                            {task.version}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 truncate font-mono mt-0.5" title={task.fileName}>
                        {task.fileName}
                      </p>
                    </div>
                  </div>

                  {/* Top Right Action / Status */}
                  <div className="shrink-0 flex items-center gap-1">
                    {isDone ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-900/40 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>готово</span>
                      </span>
                    ) : isError ? (
                      <button
                        onClick={() => retryTask(task.taskId)}
                        className="p-1 rounded hover:bg-zinc-800 text-amber-400 hover:text-amber-300 transition-colors"
                        title="Retry"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                    ) : isCancelled ? (
                      <span className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-800">Отменено</span>
                    ) : (
                      <button
                        onClick={() => cancelTask(task.taskId)}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      isDone
                        ? 'bg-emerald-500'
                        : isError
                        ? 'bg-red-500'
                        : isCancelled
                        ? 'bg-zinc-600'
                        : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                {/* Bottom Row: Progress Stats */}
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    {isDone ? (
                      <span>{formatBytes(task.total > 0 ? task.total : task.current)}</span>
                    ) : (
                      <>
                        <span>
                          {formatBytes(task.current)} / {formatBytes(task.total)}
                        </span>
                        <span>({percent}%)</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[10px]">
                    {isDownloading && task.speedBps > 0 && (
                      <span className="font-mono text-cyan-400 font-medium">{formatSpeed(task.speedBps)}</span>
                    )}
                    {isDownloading && eta && <span className="text-zinc-500">· {eta}</span>}
                    {isVerifying && (
                      <span className="flex items-center gap-1 text-cyan-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>проверка...</span>
                      </span>
                    )}
                    {isError && (
                      <span className="text-red-400 truncate max-w-[150px]" title={task.error || 'Ошибка'}>
                        {task.error || 'Ошибка'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
