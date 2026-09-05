import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                {t('settings.instanceSettings', 'Instance Settings')}: {instanceName}
              </h2>
              <p className="text-[11px] text-zinc-400">
                {gameVersion} • {t('settings.title', 'Settings')} (Prism / MultiMC model)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-zinc-300">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-500">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-500 mb-2" />
              <p className="text-xs">Loading instance settings...</p>
            </div>
          ) : (
            <>
              {/* RAM Section */}
              <div className="space-y-3 p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                      {t('settings.memory')}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      data-testid="override-memory-toggle"
                      checked={overrideMemory}
                      onChange={(e) => setOverrideMemory(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700 text-cyan-500 focus:ring-cyan-500/20"
                    />
                    <span className={overrideMemory ? 'text-cyan-400 font-medium' : 'text-zinc-400'}>
                      {t('settings.override', 'Override')}
                    </span>
                  </label>
                </div>

                {!overrideMemory ? (
                  <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/50 rounded-lg text-xs flex items-center justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-zinc-500" />
                      {t('settings.inherited', 'Inherited')}:
                    </span>
                    <span className="font-mono text-zinc-300">
                      {global.minRamMb} MB - {global.maxRamMb} MB ({Math.round(global.maxRamMb / 1024)} GB)
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4 pt-1">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">{t('settings.minRam')}</span>
                        <span className="font-mono text-cyan-400">
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
                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">{t('settings.maxRam')}</span>
                        <span className="font-mono text-cyan-400">
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
                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Java Path Section */}
              <div className="space-y-3 p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                      {t('settings.javaPath')}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      data-testid="override-java-toggle"
                      checked={overrideJava}
                      onChange={(e) => setOverrideJava(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700 text-cyan-500 focus:ring-cyan-500/20"
                    />
                    <span className={overrideJava ? 'text-cyan-400 font-medium' : 'text-zinc-400'}>
                      {t('settings.override', 'Override')}
                    </span>
                  </label>
                </div>

                {!overrideJava ? (
                  <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/50 rounded-lg text-xs flex items-center justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-zinc-500" />
                      {t('settings.inherited', 'Inherited')}:
                    </span>
                    <span className="font-mono text-zinc-300 truncate max-w-[320px]">
                      {global.javaMode === 'auto'
                        ? `${t('settings.javaModeAuto', 'Auto')} (${global.preferredProvider})`
                        : global.javaPath || 'javaw.exe'}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">{t('settings.javaPathPlaceholder')}</span>
                      <button
                        type="button"
                        onClick={handleDetectJava}
                        disabled={isDetecting}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-cyan-400 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isDetecting ? 'animate-spin' : ''}`} />
                        <span>{t('settings.autoDetect', 'Detect Java')}</span>
                      </button>
                    </div>

                    {detectedJavas.length > 0 && (
                      <select
                        value={javaPath}
                        onChange={(e) => setJavaPath(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
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
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}
              </div>

              {/* GC Preset Section */}
              <div className="space-y-3 p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                      {t('settings.gcPreset')}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      data-testid="override-gc-toggle"
                      checked={overrideGc}
                      onChange={(e) => setOverrideGc(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700 text-cyan-500 focus:ring-cyan-500/20"
                    />
                    <span className={overrideGc ? 'text-cyan-400 font-medium' : 'text-zinc-400'}>
                      {t('settings.override', 'Override')}
                    </span>
                  </label>
                </div>

                {!overrideGc ? (
                  <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/50 rounded-lg text-xs flex items-center justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-zinc-500" />
                      {t('settings.inherited', 'Inherited')}:
                    </span>
                    <span className="font-mono text-zinc-300">{global.gcPreset}</span>
                  </div>
                ) : (
                  <div className="pt-1">
                    <select
                      value={gcPreset}
                      onChange={(e) => setGcPreset(e.target.value as GcPreset)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
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
              <div className="space-y-3 p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                      {t('settings.jvmArgs', 'Custom JVM Arguments')}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      data-testid="override-jvm-args-toggle"
                      checked={overrideJvmArgs}
                      onChange={(e) => setOverrideJvmArgs(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700 text-cyan-500 focus:ring-cyan-500/20"
                    />
                    <span className={overrideJvmArgs ? 'text-cyan-400 font-medium' : 'text-zinc-400'}>
                      {t('settings.override', 'Override')}
                    </span>
                  </label>
                </div>

                {!overrideJvmArgs ? (
                  <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/50 rounded-lg text-xs flex items-center justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-zinc-500" />
                      {t('settings.inherited', 'Inherited')}:
                    </span>
                    <span className="font-mono text-zinc-300 truncate max-w-[320px]">
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
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/80 flex items-center justify-between bg-zinc-950/60">
          <button
            type="button"
            data-testid="reset-instance-settings-btn"
            onClick={handleResetToDefaults}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('settings.resetToDefaults', 'Reset to Defaults')}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              data-testid="save-instance-settings-btn"
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : t('settings.save', 'Save Settings')}</span>
            </button>
          </div>
        </div>
      </div>

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
    </div>
  );
};
