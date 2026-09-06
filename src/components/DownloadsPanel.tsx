import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  X,
  Download,
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
  const prefersReducedMotion = useReducedMotion();
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
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[85vw] flex-col border-l border-[var(--line-subtle)] bg-[var(--surface-1)]/95 shadow-[var(--shadow-lg)] backdrop-blur-md"
    >
      {/* Panel Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line-subtle)] bg-[var(--surface-2)]/60 p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <Download className="h-4 w-4 shrink-0 text-[var(--accent-from)]" />
            <span className="truncate">{t('downloads.title', 'Downloads')}</span>
          </div>
          {activeCount > 0 ? (
            <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-[var(--accent)]">
              {activeCount} active
            </span>
          ) : taskList.length > 0 ? (
            <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-[var(--text-muted)]">
              {taskList.length} total
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {taskList.some((t) => t.status === 'done' || (t.status as string) === 'completed' || t.status === 'cancelled') && (
            <button
              onClick={clearCompleted}
              className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] p-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
              title={t('logs.clear', 'Clear completed')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5">
        {taskList.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-2 p-6 text-center">
            <Download className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-xs font-medium text-[var(--text-muted)]">{t('downloads.noDownloads', 'No downloads yet')}</p>
            <p className="text-[11px] text-[var(--text-muted)]">{t('downloads.idle', 'Active downloads will appear here.')}</p>
          </div>
        ) : (
          taskList.map((task, index) => {
            const isDone = task.status === 'done' || (task.status as string) === 'completed';
            const isError = task.status === 'error' || (task.status as string) === 'failed';
            const isVerifying = task.status === 'verifying';
            const isDownloading = task.status === 'downloading';
            const isCancelled = task.status === 'cancelled';
            const isQueued = task.status === 'queued';

            const percent =
              task.total > 0
                ? Math.min(100, Math.round((task.current / task.total) * 100))
                : isDone
                ? 100
                : 0;

            const eta = formatETA(task.current, task.total, task.speedBps, i18n.language);

            return (
              <motion.div
                key={task.taskId}
                data-motion-element
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut', delay: Math.min(index * 0.03, 0.18) }}
                className="space-y-2 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-3 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
              >
                {/* Task Title Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <span className="shrink-0 select-none text-base" role="img" aria-label={task.kind}>
                      {getKindIcon(task.kind)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="min-w-0 truncate text-xs font-semibold text-[var(--text-primary)]" title={task.name}>
                          {task.name}
                        </p>
                        {task.version && (
                          <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                            {task.version}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-muted)]" title={task.fileName}>
                        {task.fileName}
                      </p>
                    </div>
                  </div>

                  {/* Top Right Action / Status */}
                  <div className="flex shrink-0 items-center gap-1">
                    {isQueued && (
                      <span className="rounded-[var(--radius-sm)] bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--warning)]">
                        в очереди
                      </span>
                    )}
                    {isDone ? (
                      <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--success)]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>готово</span>
                      </span>
                    ) : isError ? (
                      <button
                        onClick={() => retryTask(task.taskId)}
                        className="rounded-[var(--radius-sm)] p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                        title="Retry"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                    ) : isCancelled ? (
                      <span className="rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                        Отменено
                      </span>
                    ) : (
                      <button
                        onClick={() => cancelTask(task.taskId)}
                        className="rounded-[var(--radius-sm)] p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      isDone
                        ? 'bg-[var(--success)]'
                        : isError
                        ? 'bg-[var(--danger)]'
                        : isCancelled
                        ? 'bg-[var(--line-strong)]'
                        : 'bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)]'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                {/* Bottom Row: Progress Stats */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                  <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] tabular-nums">
                    {isDone ? (
                      <span>{formatBytes(task.total > 0 ? task.total : task.current)}</span>
                    ) : (
                      <>
                        <span className="truncate">
                          {formatBytes(task.current)} / {formatBytes(task.total)}
                        </span>
                        <span className="shrink-0">({percent}%)</span>
                      </>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2 text-[10px]">
                    {isDownloading && task.speedBps > 0 && (
                      <span className="font-mono font-medium tabular-nums text-[var(--accent)]">{formatSpeed(task.speedBps)}</span>
                    )}
                    {isDownloading && eta && <span className="tabular-nums text-[var(--text-muted)]">· {eta}</span>}
                    {isVerifying && (
                      <span className="flex items-center gap-1 text-[var(--accent)]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>проверка...</span>
                      </span>
                    )}
                    {isError && (
                      <span
                        className="max-w-[150px] truncate rounded-[var(--radius-sm)] bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--danger)]"
                        title={task.error || 'Ошибка'}
                      >
                        {task.error || 'Ошибка'}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </motion.div>
  );
};
