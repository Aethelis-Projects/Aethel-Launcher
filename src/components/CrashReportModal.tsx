import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-red-900/50 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 bg-red-950/30 border-b border-red-900/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-100 text-base">
                {t('crash.title', 'Game Crashed')}
              </h3>
              {instanceName && (
                <p className="text-xs text-zinc-400">
                  {instanceName} {report.exit_code !== null && `(Exit code: ${report.exit_code})`}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Diagnosis Card */}
          <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                {t('crash.diagnosis', 'Diagnosis')}
              </span>
              <span className="px-2 py-0.5 bg-red-900/40 text-red-300 rounded font-mono text-[10px]">
                {getPatternLabel()}
              </span>
            </div>
            <p className="text-zinc-200 leading-relaxed font-medium">
              {report.diagnosis}
            </p>
          </div>

          {/* Suggestion Card */}
          <div className="p-4 bg-amber-950/20 border border-amber-900/30 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <Lightbulb className="w-4 h-4" />
              <span>{t('crash.suggestion', 'Recommendation')}</span>
            </div>
            <p className="text-zinc-300 leading-relaxed">
              {report.suggestion}
            </p>
          </div>

          {/* Privacy Notice Banner (User Refinement 3) */}
          <div className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-xl flex items-start gap-2.5 text-zinc-400">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-zinc-300 block">
                {t('crash.privacyTitle', 'Privacy Notice')}
              </span>
              <p className="text-[11px] leading-relaxed text-zinc-400">
                {t(
                  'crash.privacyNotice',
                  'Logs may contain local file paths, system usernames, and hardware details. Only upload to mclo.gs if you consent to sharing this log.'
                )}
              </p>
            </div>
          </div>

          {/* Mclo.gs Upload Status / Link */}
          {uploadUrl ? (
            <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[11px] font-semibold text-emerald-400 block">
                  {t('crash.uploadedSuccessfully', 'Uploaded to mclo.gs')}
                </span>
                <a
                  href={uploadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:underline font-mono inline-flex items-center gap-1"
                >
                  {uploadUrl}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-800/50 hover:bg-emerald-700/50 text-emerald-200 rounded-lg transition-colors font-medium"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? t('crash.copied', 'Copied!') : t('crash.copyLink', 'Copy Link')}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 rounded-lg font-medium transition-colors border border-zinc-700/60"
              >
                <Upload className="w-4 h-4 text-cyan-400" />
                <span>
                  {isUploading
                    ? t('crash.uploading', 'Uploading...')
                    : t('crash.uploadMclogs', 'Upload log to mclo.gs')}
                </span>
              </button>
              {uploadError && (
                <span className="text-red-400 text-xs">{uploadError}</span>
              )}
            </div>
          )}

          {/* Full Log Accordion */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowFullLog(!showFullLog)}
              className="w-full px-4 py-2.5 bg-zinc-900/90 hover:bg-zinc-900 text-zinc-300 flex items-center justify-between text-xs font-semibold transition-colors"
            >
              <span>{t('crash.viewFullLog', 'View Full Log')}</span>
              <div className="flex items-center gap-2">
                {showFullLog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
            {showFullLog && (
              <div className="p-3 bg-zinc-950 border-t border-zinc-800 relative">
                <button
                  onClick={handleCopyLog}
                  className="absolute top-4 right-4 p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 flex items-center gap-1 text-[11px]"
                  title={t('crash.copyLog', 'Copy log')}
                >
                  {logCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{logCopied ? t('crash.copied', 'Copied') : t('crash.copy', 'Copy')}</span>
                </button>
                <pre className="text-[11px] font-mono text-zinc-400 overflow-x-auto max-h-60 p-2 whitespace-pre-wrap leading-relaxed select-text">
                  {report.full_log || t('crash.noLogs', 'No logs recorded.')}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/80 flex justify-end bg-zinc-950/80">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-xs font-medium transition-colors"
          >
            {t('crash.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};
