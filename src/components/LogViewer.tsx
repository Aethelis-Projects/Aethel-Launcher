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
    <div className="flex-1 flex flex-col h-full bg-zinc-950/60 overflow-hidden">
      {/* Log Controls Toolbar */}
      <div className="p-3 border-b border-zinc-800/80 bg-zinc-950 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 min-w-[200px] flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('logs.search')}
            className="w-full bg-transparent text-zinc-200 placeholder:text-zinc-600 focus:outline-none text-xs"
          />
        </div>

        {/* Level Filters */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
          {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                levelFilter === lvl
                  ? 'bg-zinc-800 text-cyan-400 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
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
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              autoScroll
                ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/80 font-medium'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
            }`}
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>{t('logs.autoScroll')}</span>
          </button>

          {/* Copy All */}
          <button
            onClick={handleCopy}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 flex items-center gap-1.5 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">{t('logs.copied')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{t('logs.copy')}</span>
              </>
            )}
          </button>

          {/* Clear */}
          <button
            onClick={() => clearLogs()}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
            title={t('logs.clear')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Virtualized Log Container */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed select-text"
      >
        {filteredLines.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-xs">
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
                  ? 'text-red-400'
                  : item.level === 'WARN'
                  ? 'text-amber-400'
                  : 'text-zinc-400';

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
                  className="flex items-baseline gap-2 py-0.5 hover:bg-zinc-900/50 rounded px-1 transition-colors"
                >
                  <span className="text-zinc-600 shrink-0 text-[10px]">{item.timestamp}</span>
                  <span
                    className={`font-semibold shrink-0 text-[10px] uppercase w-11 ${levelColor}`}
                  >
                    [{item.level}]
                  </span>
                  <span className="text-zinc-200 whitespace-pre-wrap break-all flex-1">
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
