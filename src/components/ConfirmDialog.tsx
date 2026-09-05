import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger',
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Autofocus cancel button to prevent accidental Enter confirmation
    const timer = setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <AlertTriangle className="w-5 h-5 text-red-400" />,
          iconBg: 'bg-red-950/60 border-red-800/50 text-red-400',
          confirmBtn: 'bg-red-600 hover:bg-red-500 text-white shadow-sm shadow-red-950/50',
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
          iconBg: 'bg-amber-950/60 border-amber-800/50 text-amber-400',
          confirmBtn: 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm shadow-amber-950/50',
        };
      case 'info':
      default:
        return {
          icon: <Info className="w-5 h-5 text-cyan-400" />,
          iconBg: 'bg-cyan-950/60 border-cyan-800/50 text-cyan-400',
          confirmBtn: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm shadow-cyan-950/50',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div className="flex items-start gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${styles.iconBg}`}>
            {styles.icon}
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 id="confirm-dialog-title" className="text-sm font-semibold text-zinc-100">
              {title}
            </h3>
            <p id="confirm-dialog-desc" className="text-xs text-zinc-400 leading-relaxed break-words">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded-xl border border-zinc-700/80 bg-zinc-900 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
          >
            {cancelText || t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50 ${styles.confirmBtn}`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText || t('common.confirm', 'Confirm')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
