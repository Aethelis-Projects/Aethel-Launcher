import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
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
  const prefersReducedMotion = useReducedMotion();
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
          icon: <AlertTriangle className="h-5 w-5" />,
          iconWrap:
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]',
          confirmBtn:
            'border border-[var(--danger)] bg-[var(--danger)] text-[var(--text-on-accent)] hover:shadow-[var(--shadow-md)] active:scale-[0.98]',
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="h-5 w-5" />,
          iconWrap:
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--warning-soft)] text-[var(--warning)]',
          confirmBtn:
            'border border-[var(--warning)]/40 bg-[var(--warning-soft)] text-[var(--warning)] hover:bg-[var(--warning)]/20 active:scale-[0.98]',
        };
      case 'info':
      default:
        return {
          icon: <Info className="h-5 w-5" />,
          iconWrap:
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-from)]',
          confirmBtn:
            'bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] text-[var(--text-on-accent)] hover:shadow-[var(--shadow-glow)] active:scale-[0.98]',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--surface-0)]/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        data-motion-element
        className="w-full max-w-md space-y-4 rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] p-6 shadow-2xl shadow-black/40"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div className="flex items-start gap-4">
          <div className={styles.iconWrap}>{styles.icon}</div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 id="confirm-dialog-title" className="text-sm font-semibold text-[var(--text-primary)]">
              {title}
            </h3>
            <p
              id="confirm-dialog-desc"
              className="break-words text-xs leading-relaxed text-[var(--text-secondary)] text-pretty"
            >
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
            className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-50"
          >
            {cancelText || t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-1.5 text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-50 ${styles.confirmBtn}`}
          >
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{confirmText || t('common.confirm', 'Confirm')}</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
