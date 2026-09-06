import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Copy, Check, Trash2, ArrowDown } from 'lucide-react';
import { useLogStore, type LogEntry } from '../store/logStore';

export const LogViewer: React.FC = () => {
  const { t } = useTranslation();
  const {
    lines,
    searchQuery,
    levelFilter,
    autoScroll,
    setSearchQuery,
    setLevelFilter,
    setAutoScroll,
    clearLogs,
  } = useLogStore();

  const [copied, setCopied] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter lines
  const filteredLines = lines.filter((item: LogEntry) => {
    if (levelFilter !== 'ALL' && item.level !== levelFilter) {
      return false;
    }
    if (searchQuery.trim() !== '') {
      return item.line.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const rowVirtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 15,
  });

  // Handle auto-scroll to bottom on new lines
  useEffect(() => {
    if (autoScroll && filteredLines.length > 0) {
      rowVirtualizer.scrollToIndex(filteredLines.length - 1, { align: 'end' });
    }
  }, [filteredLines.length, autoScroll, rowVirtualizer]);

  const handleCopy = async () => {
    const text = filteredLines.map((l) => `[${l.timestamp}] [${l.level}] ${l.line}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-[var(--surface-0)]/40 p-3">
      {/* Log Controls Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-2)]/60 p-2.5 text-xs">
        {/* Search */}
        <div className="flex min-w-[200px] max-w-sm flex-1 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2.5 py-1.5 transition-colors focus-within:border-[var(--accent-from)]">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('logs.search')}
            className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
        </div>

        {/* Level Filters */}
        <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-1">
          {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                levelFilter === lvl
                  ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] ring-1 ring-[var(--accent-line)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t(`logs.filter${lvl.charAt(0) + lvl.slice(1).toLowerCase() as 'All' | 'Info' | 'Warn' | 'Error'}`)}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              autoScroll
                ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span>{t('logs.autoScroll')}</span>
          </button>

          {/* Copy All */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                <span className="text-[var(--success)]">{t('logs.copied')}</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>{t('logs.copy')}</span>
              </>
            )}
          </button>

          {/* Clear */}
          <button
            onClick={() => clearLogs()}
            className="rounded-[var(--radius-sm)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-1.5 text-[var(--danger)] transition-colors hover:border-[var(--danger)]/70"
            title={t('logs.clear')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Virtualized Log Container */}
      <div
        ref={parentRef}
        className="min-h-0 flex-1 select-text overflow-y-auto rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)] p-3 font-mono text-[11px] leading-relaxed"
      >
        {filteredLines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
            {t('logs.empty')}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = filteredLines[virtualRow.index];
              const levelColor =
                item.level === 'ERROR'
                  ? 'text-[var(--danger)]'
                  : item.level === 'WARN'
                  ? 'text-[var(--warning)]'
                  : 'text-[var(--text-muted)]';
              const lineColor =
                item.level === 'ERROR' ? 'text-[var(--danger)]/90' : 'text-[var(--text-secondary)]';

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-baseline gap-2 rounded px-1 py-0.5 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{item.timestamp}</span>
                  <span
                    className={`w-11 shrink-0 text-[10px] font-semibold uppercase ${levelColor}`}
                  >
                    [{item.level}]
                  </span>
                  <span className={`flex-1 whitespace-pre-wrap break-all ${lineColor}`}>
                    {item.line}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
