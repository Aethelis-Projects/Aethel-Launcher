import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { useDownloadStore } from '../store/downloadStore';

export const DownloadDrawer: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, setIsOpen, tasks, clearCompleted } = useDownloadStore();

  if (!isOpen) return null;

  const taskList = Object.values(tasks);
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-zinc-950/95 border-l border-zinc-800 backdrop-blur-md shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-zinc-100 text-sm">{t('downloads.title')}</h3>
          {taskList.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[10px] font-mono">
              {taskList.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {taskList.some((t) => t.status === 'completed') && (
            <button
              onClick={clearCompleted}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title={t('logs.clear')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {taskList.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-500 space-y-2">
            <p className="text-xs">{t('downloads.noDownloads')}</p>
            <p className="text-[11px] text-zinc-600">{t('downloads.idle')}</p>
          </div>
        ) : (
          taskList.map((task) => {
            const percent = task.total > 0 ? Math.min(100, Math.round((task.current / task.total) * 100)) : 0;

            return (
              <div
                key={task.taskId}
                className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-lg space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-200 truncate">{task.fileName}</p>
                    <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      {formatBytes(task.current)} / {formatBytes(task.total)}
                    </p>
                  </div>
                  <div>
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : task.status === 'failed' ? (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      task.status === 'completed'
                        ? 'bg-emerald-500'
                        : task.status === 'failed'
                        ? 'bg-red-500'
                        : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                {/* Status & Speed */}
                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                  <span>
                    {task.status === 'verifying'
                      ? t('downloads.verifying')
                      : task.status === 'completed'
                      ? t('downloads.completed')
                      : task.status === 'failed'
                      ? t('downloads.failed')
                      : `${percent}%`}
                  </span>
                  {task.status === 'downloading' && (
                    <span className="font-mono text-zinc-500">{formatBytes(task.speedBps)}/s</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
