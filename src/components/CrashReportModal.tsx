import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  X,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Lightbulb,
  Upload,
} from 'lucide-react';
import { commands, type CrashReport } from '../bindings';
import { useLogStore } from '../store/logStore';

interface CrashReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: CrashReport | null;
  instanceName?: string;
  instanceId?: string;
}

export const CrashReportModal: React.FC<CrashReportModalProps> = ({
  isOpen,
  onClose,
  report,
  instanceName,
  instanceId,
}) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const [showFullLog, setShowFullLog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [logCopied, setLogCopied] = useState(false);

  if (!isOpen || !report) return null;

  const handleUpload = async () => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const res = await commands.uploadCrashToMclogs(instanceId ?? null, report.full_log);
      if (res.status === 'ok') {
        setUploadUrl(res.data);
        if (instanceId) {
          useLogStore.getState().setMclogsUrl(instanceId, res.data);
        }
      } else {
        setUploadError(res.error);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopyLink = () => {
    if (uploadUrl) {
      navigator.clipboard.writeText(uploadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLog = () => {
    navigator.clipboard.writeText(report.full_log);
    setLogCopied(true);
    setTimeout(() => setLogCopied(false), 2000);
  };

  const getPatternLabel = () => {
    if (typeof report.pattern === 'string') {
      return report.pattern;
    }
    const key = Object.keys(report.pattern)[0];
    return key || 'Unknown';
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        data-motion-element
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40"
      >
        {/* Header — error banner */}
        <div className="flex items-center justify-between border-b border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger)]/15 p-2 text-[var(--danger)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {t('crash.title', 'Game Crashed')}
              </h3>
              {instanceName && (
                <p className="truncate text-xs tabular-nums text-[var(--text-secondary)]">
                  {instanceName} {report.exit_code !== null && `(Exit code: ${report.exit_code})`}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6 text-xs">
          {/* Diagnosis Card */}
          <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--danger)]">
                {t('crash.diagnosis', 'Diagnosis')}
              </span>
              <span className="rounded-[var(--radius-sm)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-2 py-0.5 font-mono text-[10px] tabular-nums text-[var(--danger)]">
                {getPatternLabel()}
              </span>
            </div>
            <p className="font-medium leading-relaxed text-[var(--text-primary)] text-pretty">
              {report.diagnosis}
            </p>
          </div>

          {/* Suggestion Card */}
          <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--warning)]">
              <Lightbulb className="h-3.5 w-3.5" />
              <span>{t('crash.suggestion', 'Recommendation')}</span>
            </div>
            <p className="leading-relaxed text-[var(--text-secondary)] text-pretty">
              {report.suggestion}
            </p>
          </div>

          {/* Privacy Notice Banner (User Refinement 3) */}
          <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-3 text-[var(--text-secondary)]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
            <div className="space-y-1">
              <span className="block text-xs font-semibold text-[var(--text-primary)]">
                {t('crash.privacyTitle', 'Privacy Notice')}
              </span>
              <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] text-pretty">
                {t(
                  'crash.privacyNotice',
                  'Logs may contain local file paths, system usernames, and hardware details. Only upload to mclo.gs if you consent to sharing this log.'
                )}
              </p>
            </div>
          </div>

          {/* Mclo.gs Upload Status / Link */}
          {uploadUrl ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--success)]/40 bg-[var(--success-soft)] p-3">
              <div className="min-w-0 space-y-0.5">
                <span className="block text-[11px] font-semibold text-[var(--success)]">
                  {t('crash.uploadedSuccessfully', 'Uploaded to mclo.gs')}
                </span>
                <a
                  href={uploadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-[var(--accent)] hover:underline"
                >
                  <span className="truncate">{uploadUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
              <button
                onClick={handleCopyLink}
                className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--success)]/40 bg-[var(--success)]/10 px-3 py-1.5 font-medium text-[var(--success)] transition-colors hover:bg-[var(--success)]/20"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? t('crash.copied', 'Copied!') : t('crash.copyLink', 'Copy Link')}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-4 py-2 font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-50"
              >
                <Upload className="h-4 w-4 text-[var(--accent-from)]" />
                <span>
                  {isUploading
                    ? t('crash.uploading', 'Uploading...')
                    : t('crash.uploadMclogs', 'Upload log to mclo.gs')}
                </span>
              </button>
              {uploadError && (
                <span className="text-xs text-[var(--danger)]">{uploadError}</span>
              )}
            </div>
          )}

          {/* Full Log Accordion */}
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line-subtle)]">
            <button
              onClick={() => setShowFullLog(!showFullLog)}
              className="flex w-full items-center justify-between bg-[var(--surface-1)] px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            >
              <span>{t('crash.viewFullLog', 'View Full Log')}</span>
              <div className="flex items-center gap-2">
                {showFullLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>
            {showFullLog && (
              <div className="relative border-t border-[var(--line-subtle)] p-3">
                <button
                  onClick={handleCopyLog}
                  className="absolute right-6 top-6 z-10 flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  title={t('crash.copyLog', 'Copy log')}
                >
                  {logCopied ? <Check className="h-3 w-3 text-[var(--success)]" /> : <Copy className="h-3 w-3" />}
                  <span>{logCopied ? t('crash.copied', 'Copied') : t('crash.copy', 'Copy')}</span>
                </button>
                <pre className="max-h-60 select-text overflow-y-auto overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--surface-1)] p-3 pr-16 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {report.full_log || t('crash.noLogs', 'No logs recorded.')}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-4">
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
          >
            {t('crash.close', 'Close')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
