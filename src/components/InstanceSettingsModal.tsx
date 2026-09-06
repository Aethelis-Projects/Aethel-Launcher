import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  X,
  Cpu,
  HardDrive,
  RefreshCw,
  Sliders,
  RotateCcw,
  Check,
  Terminal,
  Layers,
} from 'lucide-react';
import { useSettingsStore, type GcPreset } from '../store/settingsStore';
import { useInstanceStore } from '../store/instanceStore';
import { commands, type InstanceSettings, type JavaInfo } from '../bindings';
import { ConfirmDialog } from './ConfirmDialog';

interface InstanceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  instanceName: string;
  gameVersion: string;
}

export const InstanceSettingsModal: React.FC<InstanceSettingsModalProps> = ({
  isOpen,
  onClose,
  instanceId,
  instanceName,
  gameVersion,
}) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const global = useSettingsStore();
  const { fetchInstances } = useInstanceStore();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Overrides toggles
  const [overrideMemory, setOverrideMemory] = useState(false);
  const [memoryMinMb, setMemoryMinMb] = useState(1024);
  const [memoryMaxMb, setMemoryMaxMb] = useState(4096);

  const [overrideJava, setOverrideJava] = useState(false);
  const [javaPath, setJavaPath] = useState('');

  const [overrideGc, setOverrideGc] = useState(false);
  const [gcPreset, setGcPreset] = useState<GcPreset>('G1GC');

  const [overrideJvmArgs, setOverrideJvmArgs] = useState(false);
  const [jvmArgs, setJvmArgs] = useState('');

  const [detectedJavas, setDetectedJavas] = useState<JavaInfo[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    try {
      const res = await commands.getInstanceSettings(instanceId);
      if (res.status === 'ok') {
        const s = res.data;
        const hasMem = s.memory_min_mb !== null || s.memory_max_mb !== null;
        setOverrideMemory(hasMem);
        setMemoryMinMb(s.memory_min_mb ?? global.minRamMb);
        setMemoryMaxMb(s.memory_max_mb ?? global.maxRamMb);

        const hasJava = s.java_path !== null;
        setOverrideJava(hasJava);
        setJavaPath(s.java_path ?? global.javaPath);

        const hasGc = s.gc_preset !== null;
        setOverrideGc(hasGc);
        setGcPreset((s.gc_preset as GcPreset) ?? global.gcPreset);

        const hasJvm = s.jvm_args !== null;
        setOverrideJvmArgs(hasJvm);
        setJvmArgs(s.jvm_args ?? global.defaultJvmArgs);
      }
    } catch {
      // Fall back to globals
      setOverrideMemory(false);
      setMemoryMinMb(global.minRamMb);
      setMemoryMaxMb(global.maxRamMb);
      setOverrideJava(false);
      setJavaPath(global.javaPath);
      setOverrideGc(false);
      setGcPreset(global.gcPreset);
      setOverrideJvmArgs(false);
      setJvmArgs(global.defaultJvmArgs);
    } finally {
      setLoading(false);
    }
  }, [instanceId, global.minRamMb, global.maxRamMb, global.javaPath, global.gcPreset, global.defaultJvmArgs]);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen, loadSettings]);

  if (!isOpen) return null;

  const handleDetectJava = async () => {
    setIsDetecting(true);
    try {
      const res = await commands.detectSystemJava();
      if (res.status === 'ok') {
        setDetectedJavas(res.data);
        if (res.data.length > 0 && !javaPath) {
          setJavaPath(res.data[0].path);
        }
      }
    } catch {
    } finally {
      setIsDetecting(false);
    }
  };

  const handleResetToDefaults = () => {
    setShowResetConfirm(true);
  };

  const executeResetToDefaults = async () => {
    setSaving(true);
    try {
      const resetSettings: InstanceSettings = {
        java_path: null,
        memory_min_mb: null,
        memory_max_mb: null,
        gc_preset: null,
        jvm_args: null,
      };
      await commands.updateInstanceSettings(instanceId, resetSettings);
      await fetchInstances();
      setShowResetConfirm(false);
      onClose();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings: InstanceSettings = {
        memory_min_mb: overrideMemory ? memoryMinMb : null,
        memory_max_mb: overrideMemory ? memoryMaxMb : null,
        java_path: overrideJava && javaPath.trim() ? javaPath.trim() : null,
        gc_preset: overrideGc ? gcPreset : null,
        jvm_args: overrideJvmArgs && jvmArgs.trim() ? jvmArgs.trim() : null,
      };
      await commands.updateInstanceSettings(instanceId, settings);
      await fetchInstances();
      onClose();
    } catch {
    } finally {
      setSaving(false);
    }
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
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-[var(--radius-sm)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-2 text-[var(--accent-from)]">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {t('settings.instanceSettings', 'Instance Settings')}: {instanceName}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {gameVersion} • {t('settings.title', 'Settings')} (Prism / MultiMC model)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-[var(--text-primary)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <RefreshCw className="mb-2 h-6 w-6 animate-spin text-[var(--accent-from)]" />
              <p className="text-xs">Loading instance settings...</p>
            </div>
          ) : (
            <>
              {/* RAM Section */}
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    <HardDrive className="h-4 w-4 text-[var(--accent-from)]" />
                    <span>{t('settings.memory')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={overrideMemory ? 'text-xs font-medium text-[var(--accent-from)]' : 'text-xs text-[var(--text-muted)]'}>
                      {t('settings.override', 'Override')}
                    </span>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        data-testid="override-memory-toggle"
                        checked={overrideMemory}
                        onChange={(e) => setOverrideMemory(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="h-5 w-9 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-3)] peer-focus:outline-none peer-checked:border-transparent peer-checked:bg-[var(--accent-to)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-[var(--line-strong)] after:bg-white after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                    </label>
                  </div>
                </div>

                {!overrideMemory ? (
                  <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] p-2.5 text-xs text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      {t('settings.inherited', 'Inherited')}:
                    </span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {global.minRamMb} MB - {global.maxRamMb} MB ({Math.round(global.maxRamMb / 1024)} GB)
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4 pt-1">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">{t('settings.minRam')}</span>
                        <span className="font-mono font-medium text-[var(--accent-from)]">
                          {memoryMinMb} {t('settings.mb')}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="512"
                        max={Math.max(memoryMaxMb, 8192)}
                        step="256"
                        value={memoryMinMb}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setMemoryMinMb(val);
                          if (val > memoryMaxMb) setMemoryMaxMb(val);
                        }}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-[var(--radius-sm)] bg-[var(--surface-3)] accent-[var(--accent-from)]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">{t('settings.maxRam')}</span>
                        <span className="font-mono font-medium text-[var(--accent-from)]">
                          {memoryMaxMb} {t('settings.mb')} ({Math.round(memoryMaxMb / 1024)} {t('settings.gb')})
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1024"
                        max="16384"
                        step="512"
                        value={memoryMaxMb}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setMemoryMaxMb(val);
                          if (val < memoryMinMb) setMemoryMinMb(val);
                        }}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-[var(--radius-sm)] bg-[var(--surface-3)] accent-[var(--accent-from)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Java Path Section */}
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    <Cpu className="h-4 w-4 text-[var(--accent-from)]" />
                    <span>{t('settings.javaPath')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={overrideJava ? 'text-xs font-medium text-[var(--accent-from)]' : 'text-xs text-[var(--text-muted)]'}>
                      {t('settings.override', 'Override')}
                    </span>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        data-testid="override-java-toggle"
                        checked={overrideJava}
                        onChange={(e) => setOverrideJava(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="h-5 w-9 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-3)] peer-focus:outline-none peer-checked:border-transparent peer-checked:bg-[var(--accent-to)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-[var(--line-strong)] after:bg-white after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                    </label>
                  </div>
                </div>

                {!overrideJava ? (
                  <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] p-2.5 text-xs text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      {t('settings.inherited', 'Inherited')}:
                    </span>
                    <span className="max-w-[320px] truncate font-mono text-[var(--text-primary)]">
                      {global.javaMode === 'auto'
                        ? `${t('settings.javaModeAuto', 'Auto')} (${global.preferredProvider})`
                        : global.javaPath || 'javaw.exe'}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--text-secondary)]">{t('settings.javaPathPlaceholder')}</span>
                      <button
                        type="button"
                        onClick={handleDetectJava}
                        disabled={isDetecting}
                        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`h-3 w-3 text-[var(--accent-from)] ${isDetecting ? 'animate-spin' : ''}`} />
                        <span>{t('settings.autoDetect', 'Detect Java')}</span>
                      </button>
                    </div>

                    {detectedJavas.length > 0 && (
                      <select
                        value={javaPath}
                        onChange={(e) => setJavaPath(e.target.value)}
                        className="w-full cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
                      >
                        {detectedJavas.map((j) => (
                          <option key={j.path} value={j.path}>
                            Java {j.major} ({j.version}) - {j.vendor || 'System'}
                          </option>
                        ))}
                      </select>
                    )}

                    <input
                      type="text"
                      data-testid="instance-java-path-input"
                      value={javaPath}
                      onChange={(e) => setJavaPath(e.target.value)}
                      placeholder={t('settings.javaPathPlaceholder')}
                      className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-from)] focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* GC Preset Section */}
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    <Sliders className="h-4 w-4 text-[var(--accent-from)]" />
                    <span>{t('settings.gcPreset')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={overrideGc ? 'text-xs font-medium text-[var(--accent-from)]' : 'text-xs text-[var(--text-muted)]'}>
                      {t('settings.override', 'Override')}
                    </span>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        data-testid="override-gc-toggle"
                        checked={overrideGc}
                        onChange={(e) => setOverrideGc(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="h-5 w-9 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-3)] peer-focus:outline-none peer-checked:border-transparent peer-checked:bg-[var(--accent-to)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-[var(--line-strong)] after:bg-white after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                    </label>
                  </div>
                </div>

                {!overrideGc ? (
                  <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] p-2.5 text-xs text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      {t('settings.inherited', 'Inherited')}:
                    </span>
                    <span className="font-mono text-[var(--text-primary)]">{global.gcPreset}</span>
                  </div>
                ) : (
                  <div className="pt-1">
                    <select
                      value={gcPreset}
                      onChange={(e) => setGcPreset(e.target.value as GcPreset)}
                      className="w-full cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
                    >
                      <option value="G1GC">{t('settings.gcG1GC', 'G1GC (Recommended, Stable)')}</option>
                      <option value="ZGC">{t('settings.gcZGC', 'ZGC (Ultra Low Pause, Java 15+)')}</option>
                      <option value="GenerationalZGC">
                        {t('settings.gcGenerationalZGC', 'Generational ZGC (High Throughput, Java 21+)')}
                      </option>
                      <option value="Parallel">{t('settings.gcParallel', 'Parallel GC (Low Overhead)')}</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Custom JVM Arguments Section */}
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    <Terminal className="h-4 w-4 text-[var(--accent-from)]" />
                    <span>{t('settings.jvmArgs', 'Custom JVM Arguments')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={overrideJvmArgs ? 'text-xs font-medium text-[var(--accent-from)]' : 'text-xs text-[var(--text-muted)]'}>
                      {t('settings.override', 'Override')}
                    </span>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        data-testid="override-jvm-args-toggle"
                        checked={overrideJvmArgs}
                        onChange={(e) => setOverrideJvmArgs(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="h-5 w-9 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-3)] peer-focus:outline-none peer-checked:border-transparent peer-checked:bg-[var(--accent-to)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-[var(--line-strong)] after:bg-white after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                    </label>
                  </div>
                </div>

                {!overrideJvmArgs ? (
                  <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] p-2.5 text-xs text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      {t('settings.inherited', 'Inherited')}:
                    </span>
                    <span className="max-w-[320px] truncate font-mono text-[var(--text-primary)]">
                      {global.defaultJvmArgs || '(None)'}
                    </span>
                  </div>
                ) : (
                  <div className="pt-1">
                    <input
                      type="text"
                      data-testid="instance-jvm-args-input"
                      value={jvmArgs}
                      onChange={(e) => setJvmArgs(e.target.value)}
                      placeholder={t('settings.jvmArgsPlaceholder', 'e.g. -XX:+UseStringDeduplication')}
                      className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-from)] focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--line-subtle)] bg-[var(--surface-1)]/80 p-4">
          <button
            type="button"
            data-testid="reset-instance-settings-btn"
            onClick={handleResetToDefaults}
            disabled={saving || loading}
            className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--danger-soft)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('settings.resetToDefaults', 'Reset to Defaults')}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] cursor-pointer"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              data-testid="save-instance-settings-btn"
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] px-4 py-2 text-xs font-semibold text-[var(--text-on-accent)] shadow-[var(--shadow-glow)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{saving ? 'Saving...' : t('settings.save', 'Save Settings')}</span>
            </button>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        isOpen={showResetConfirm}
        title={t('settings.resetToDefaults', 'Reset to Defaults')}
        message={t('settings.resetConfirm', 'Reset all instance overrides to global defaults?')}
        confirmText={t('settings.reset', 'Reset')}
        variant="warning"
        isLoading={saving}
        onConfirm={executeResetToDefaults}
        onCancel={() => setShowResetConfirm(false)}
      />
    </motion.div>
  );
};
