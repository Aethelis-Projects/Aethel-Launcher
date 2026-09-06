import React, { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  X,
  Sliders,
  Package,
  Layers,
  Sparkles,
  Globe,
  Settings,
  FolderOpen,
  Copy,
  Check,
  Upload,
  Trash2,
  RefreshCw,
  Plus,
  ToggleLeft,
  ToggleRight,
  Loader2,
  HardDrive,
  Cpu,
  Terminal,
  ImageIcon,
} from 'lucide-react';
import {
  commands,
  type Instance,
  type InstalledMod,
  type ModUpdate,
  type ResourcePackEntry,
  type ShaderPackEntry,
  type WorldEntry,
  type InstanceSettings,
  type JavaInfo,
} from '../bindings';
import { useSettingsStore, type GcPreset } from '../store/settingsStore';
import { useInstanceStore } from '../store/instanceStore';
import { ModBrowserModal } from './ModBrowserModal';
import { ModloaderSelector } from './ModloaderSelector';
import { ConfirmDialog } from './ConfirmDialog';

export type InstanceTab = 'overview' | 'mods' | 'resourcepacks' | 'shaders' | 'worlds' | 'settings';

interface InstanceManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: Instance;
  initialTab?: InstanceTab;
  onExport?: (instance: Instance) => void;
  onDelete?: (instanceId: string) => void;
}

export const InstanceManagerModal: React.FC<InstanceManagerModalProps> = ({
  isOpen,
  onClose,
  instance,
  initialTab = 'overview',
  onExport,
  onDelete,
}) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const global = useSettingsStore();
  const { fetchInstances } = useInstanceStore();

  const [activeTab, setActiveTab] = useState<InstanceTab>(initialTab);

  // Overview states
  const [instanceName, setInstanceName] = useState(instance.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSavedSuccess, setNameSavedSuccess] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  // Mods states
  const [mods, setMods] = useState<InstalledMod[]>([]);
  const [modsLoading, setModsLoading] = useState(false);
  const [modSearch, setModSearch] = useState('');
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [, setModUpdates] = useState<ModUpdate[]>([]);
  const [, setModsError] = useState<string | null>(null);
  const [modIcons, setModIcons] = useState<Record<string, string | null>>({});

  // Confirm dialog states
  const [modToDelete, setModToDelete] = useState<string | null>(null);
  const [isDeletingMod, setIsDeletingMod] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Resourcepacks states
  const [resourcePacks, setResourcePacks] = useState<ResourcePackEntry[]>([]);
  const [resourcePacksLoading, setResourcePacksLoading] = useState(false);

  // Shaders states
  const [shaderPacks, setShaderPacks] = useState<ShaderPackEntry[]>([]);
  const [shadersLoading, setShadersLoading] = useState(false);

  // Worlds states
  const [worlds, setWorlds] = useState<WorldEntry[]>([]);
  const [worldsLoading, setWorldsLoading] = useState(false);

  // Settings states
  const [, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [overrideMemory, setOverrideMemory] = useState(false);
  const [memoryMinMb, setMemoryMinMb] = useState(1024);
  const [memoryMaxMb, setMemoryMaxMb] = useState(4096);
  const [overrideJava, setOverrideJava] = useState(false);
  const [javaPath, setJavaPath] = useState('');
  const [overrideGc, setOverrideGc] = useState(false);
  const [gcPreset, setGcPreset] = useState<GcPreset>('G1GC');
  const [overrideJvmArgs, setOverrideJvmArgs] = useState(false);
  const [jvmArgs, setJvmArgs] = useState('');
  const [, setDetectedJavas] = useState<JavaInfo[]>([]);
  const [isDetectingJava, setIsDetectingJava] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setInstanceName(instance.name);
    }
  }, [isOpen, initialTab, instance.name]);

  // Load Mods
  const loadMods = useCallback(async () => {
    setModsLoading(true);
    setModsError(null);
    try {
      const res = await commands.listInstalledMods(instance.id);
      if (res.status === 'ok') {
        setMods(res.data);
        res.data.forEach(async (mod) => {
          try {
            const iconRes = await commands.getModIcon(instance.id, mod.file_name);
            if (iconRes.status === 'ok' && iconRes.data) {
              setModIcons((prev) => ({ ...prev, [mod.file_name]: iconRes.data }));
            }
          } catch {}
        });
      } else {
        setModsError(res.error);
      }
    } catch (e) {
      setModsError(e instanceof Error ? e.message : String(e));
    } finally {
      setModsLoading(false);
    }
  }, [instance.id]);

  // Load Resourcepacks
  const loadResourcePacks = useCallback(async () => {
    setResourcePacksLoading(true);
    try {
      const res = await commands.getInstanceResourcepacks(instance.id);
      if (res.status === 'ok') {
        setResourcePacks(res.data);
      }
    } catch {
      // ignore
    } finally {
      setResourcePacksLoading(false);
    }
  }, [instance.id]);

  // Load Shaders
  const loadShaders = useCallback(async () => {
    setShadersLoading(true);
    try {
      const res = await commands.getInstanceShaderpacks(instance.id);
      if (res.status === 'ok') {
        setShaderPacks(res.data);
      }
    } catch {
      // ignore
    } finally {
      setShadersLoading(false);
    }
  }, [instance.id]);

  // Load Worlds
  const loadWorlds = useCallback(async () => {
    setWorldsLoading(true);
    try {
      const res = await commands.getInstanceWorlds(instance.id);
      if (res.status === 'ok') {
        setWorlds(res.data);
      }
    } catch {
      // ignore
    } finally {
      setWorldsLoading(false);
    }
  }, [instance.id]);

  // Load Settings
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await commands.getInstanceSettings(instance.id);
      if (res.status === 'ok') {
        const s = res.data;
        const hasMem = s.memory_min_mb !== null || s.memory_max_mb !== null;
        setOverrideMemory(hasMem);
        setMemoryMinMb(s.memory_min_mb ?? 1024);
        setMemoryMaxMb(s.memory_max_mb ?? 4096);

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
      setOverrideMemory(false);
      setMemoryMinMb(1024);
      setMemoryMaxMb(4096);
      setOverrideJava(false);
      setJavaPath(global.javaPath);
      setOverrideGc(false);
      setGcPreset(global.gcPreset);
      setOverrideJvmArgs(false);
      setJvmArgs(global.defaultJvmArgs);
    } finally {
      setSettingsLoading(false);
    }
  }, [instance.id, global.javaPath, global.gcPreset, global.defaultJvmArgs]);

  // Tab change trigger
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'mods') {
      loadMods();
    } else if (activeTab === 'resourcepacks') {
      loadResourcePacks();
    } else if (activeTab === 'shaders') {
      loadShaders();
    } else if (activeTab === 'worlds') {
      loadWorlds();
    } else if (activeTab === 'settings') {
      loadSettings();
    }
  }, [isOpen, activeTab, loadMods, loadResourcePacks, loadShaders, loadWorlds, loadSettings]);

  if (!isOpen) return null;

  // Handlers for Overview
  const handleSaveName = async () => {
    if (!instanceName.trim() || instanceName === instance.name) return;
    setIsSavingName(true);
    try {
      const res = await commands.updateInstanceName(instance.id, instanceName.trim());
      if (res.status === 'ok') {
        setNameSavedSuccess(true);
        setTimeout(() => setNameSavedSuccess(false), 2000);
        await fetchInstances();
      }
    } finally {
      setIsSavingName(false);
    }
  };

  const handleChangeIcon = async () => {
    try {
      const picked = await commands.pickFileDialog(
        'Select Instance Icon',
        'Image Files',
        ['png', 'jpg', 'jpeg', 'webp', 'ico']
      );
      if (picked.status === 'ok' && picked.data) {
        await commands.updateInstanceIcon(instance.id, picked.data);
        await fetchInstances();
      }
    } catch {
      // ignore
    }
  };

  const handleResetIcon = async () => {
    try {
      await commands.updateInstanceIcon(instance.id, null);
      await fetchInstances();
    } catch {
      // ignore
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(`instances/${instance.id}`);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const handleOpenFolder = async (subfolder: string | null = null) => {
    try {
      await commands.openInstanceFolder(instance.id, subfolder);
    } catch {
      // ignore
    }
  };

  // Handlers for Mods
  const handleToggleMod = async (fileName: string, currentEnabled: boolean) => {
    try {
      const res = await commands.toggleMod(instance.id, fileName, !currentEnabled);
      if (res.status === 'ok') {
        await loadMods();
      }
    } catch (e) {
      setModsError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteMod = (fileName: string) => {
    setModToDelete(fileName);
  };

  const executeDeleteMod = async () => {
    if (!modToDelete) return;
    setIsDeletingMod(true);
    try {
      const res = await commands.deleteMod(instance.id, modToDelete);
      if (res.status === 'ok') {
        await loadMods();
      }
      setModToDelete(null);
    } catch (e) {
      setModsError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsDeletingMod(false);
    }
  };

  const handleCheckModUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      const res = await commands.checkModUpdates(instance.id);
      if (res.status === 'ok') {
        setModUpdates(res.data);
      }
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  // Handlers for Resource Packs
  const handleToggleResourcePack = async (packName: string, enabled: boolean) => {
    try {
      await commands.toggleInstanceResourcepack(instance.id, packName, enabled);
      await loadResourcePacks();
    } catch {
      // ignore
    }
  };

  // Handlers for Shaders
  const handleSetActiveShader = async (shaderName: string | null) => {
    try {
      await commands.setInstanceActiveShaderpack(instance.id, shaderName);
      await loadShaders();
    } catch {
      // ignore
    }
  };

  // Handlers for Settings
  const handleDetectJava = async () => {
    setIsDetectingJava(true);
    try {
      const res = await commands.detectSystemJava();
      if (res.status === 'ok') {
        setDetectedJavas(res.data);
        if (res.data.length > 0 && !javaPath) {
          setJavaPath(res.data[0].path);
        }
      }
    } finally {
      setIsDetectingJava(false);
    }
  };

  const handleResetSettings = () => {
    setShowResetConfirm(true);
  };

  const executeResetSettings = async () => {
    setSettingsSaving(true);
    try {
      const resetSettings: InstanceSettings = {
        java_path: null,
        memory_min_mb: null,
        memory_max_mb: null,
        gc_preset: null,
        jvm_args: null,
      };
      await commands.updateInstanceSettings(instance.id, resetSettings);
      await fetchInstances();
      await loadSettings();
      setShowResetConfirm(false);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      const settings: InstanceSettings = {
        memory_min_mb: overrideMemory ? memoryMinMb : null,
        memory_max_mb: overrideMemory ? memoryMaxMb : null,
        java_path: overrideJava && javaPath.trim() ? javaPath.trim() : null,
        gc_preset: overrideGc ? gcPreset : null,
        jvm_args: overrideJvmArgs && jvmArgs.trim() ? jvmArgs.trim() : null,
      };
      await commands.updateInstanceSettings(instance.id, settings);
      await fetchInstances();
      onClose();
    } finally {
      setSettingsSaving(false);
    }
  };

  const filteredMods = mods.filter(
    (m) =>
      m.name.toLowerCase().includes(modSearch.toLowerCase()) ||
      m.file_name.toLowerCase().includes(modSearch.toLowerCase())
  );

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
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/40"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] font-bold text-lg text-[var(--text-on-accent)] shadow-inner">
              {instance.icon_path ? (
                <img src={instance.icon_path} alt={instance.name} className="w-full h-full object-cover" />
              ) : (
                instance.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--text-primary)]">{instance.name}</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[var(--surface-3)] text-[var(--accent)] border border-[var(--line-subtle)]">
                  {instance.game_version}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-[var(--surface-3)]/80 text-[var(--text-secondary)] border border-[var(--line-subtle)]">
                  {instance.loader || 'Vanilla'}
                </span>
              </div>
              <p className="mt-0.5 text-xs tabular-nums text-[var(--text-muted)]">
                {t('instances.playtime')}: {Math.floor(instance.total_playtime_seconds / 3600)}h {Math.floor((instance.total_playtime_seconds % 3600) / 60)}m
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 border-b border-[var(--line-subtle)] bg-[var(--surface-1)]/30 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-[var(--accent-from)] text-[var(--text-primary)]'
                : 'rounded-t-[var(--radius-sm)] border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.overview', 'Overview')}</span>
          </button>

          <button
            onClick={() => setActiveTab('mods')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'mods'
                ? 'border-[var(--accent-from)] text-[var(--text-primary)]'
                : 'rounded-t-[var(--radius-sm)] border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.mods', 'Mods')}</span>
            {mods.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[var(--surface-3)] text-[var(--text-secondary)] tabular-nums">
                {mods.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('resourcepacks')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'resourcepacks'
                ? 'border-[var(--accent-from)] text-[var(--text-primary)]'
                : 'rounded-t-[var(--radius-sm)] border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.resourcepacks', 'Resource Packs')}</span>
            {resourcePacks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[var(--surface-3)] text-[var(--text-secondary)] tabular-nums">
                {resourcePacks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('shaders')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'shaders'
                ? 'border-[var(--accent-from)] text-[var(--text-primary)]'
                : 'rounded-t-[var(--radius-sm)] border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.shaders', 'Shaders')}</span>
            {shaderPacks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[var(--surface-3)] text-[var(--text-secondary)] tabular-nums">
                {shaderPacks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('worlds')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'worlds'
                ? 'border-[var(--accent-from)] text-[var(--text-primary)]'
                : 'rounded-t-[var(--radius-sm)] border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.worlds', 'Worlds')}</span>
            {worlds.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[var(--surface-3)] text-[var(--text-secondary)] tabular-nums">
                {worlds.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'settings'
                ? 'border-[var(--accent-from)] text-[var(--text-primary)]'
                : 'rounded-t-[var(--radius-sm)] border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.settings', 'Settings')}</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 max-w-3xl">
              {/* Instance Name & Rename */}
              <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-5 space-y-4">
                <label className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider block">
                  {t('instanceManager.overview.name', 'Instance Name')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    className="flex-1 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3.5 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
                  />
                  <button
                    disabled={isSavingName || instanceName === instance.name}
                    onClick={handleSaveName}
                    className="px-4 py-2 rounded-[var(--radius-sm)] text-xs font-medium bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] text-[var(--text-on-accent)] flex items-center gap-1.5 transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isSavingName ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : nameSavedSuccess ? (
                      <Check className="w-3.5 h-3.5 text-[var(--success)]" />
                    ) : null}
                    <span>{nameSavedSuccess ? t('common.saved', 'Saved!') : t('instanceManager.overview.saveName', 'Save')}</span>
                  </button>
                </div>
              </div>

              {/* Custom Icon */}
              <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--surface-3)] border border-[var(--line-subtle)] flex items-center justify-center overflow-hidden">
                    {instance.icon_path ? (
                      <img src={instance.icon_path} alt="Icon" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-[var(--text-muted)]" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--text-primary)]">{t('instanceManager.overview.changeIcon', 'Instance Icon')}</h4>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Custom PNG/JPG icon for your instance card</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleChangeIcon}
                    className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    {t('instanceManager.overview.changeIcon', 'Change Icon')}
                  </button>
                  {instance.icon_path && (
                    <button
                      onClick={handleResetIcon}
                      className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)]/60 text-[var(--text-secondary)] transition-colors hover:border-[var(--danger)]/40 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    >
                      {t('instanceManager.overview.resetIcon', 'Reset')}
                    </button>
                  )}
                </div>
              </div>

              {/* Path & Folder */}
              <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--text-primary)]">Instance Directory</h4>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Game files, saves, configurations, and logs</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyPath}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                    >
                      {copiedPath ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPath ? t('instanceManager.overview.pathCopied', 'Copied!') : t('instanceManager.overview.copyPath', 'Copy Path')}</span>
                    </button>
                    <button
                      onClick={() => handleOpenFolder(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98]"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{t('instanceManager.overview.openFolder', 'Open Folder')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Modloader Configuration */}
              <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-5">
                <ModloaderSelector
                  instanceId={instance.id}
                  gameVersion={instance.game_version}
                  currentLoader={instance.loader}
                  currentLoaderVersion={instance.loader_version}
                  onLoaderUpdated={fetchInstances}
                />
              </div>

              {/* Actions: Export / Delete */}
              <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-primary)]">Instance Actions</h4>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Export to Modrinth modpack or delete instance</p>
                </div>
                <div className="flex items-center gap-2">
                  {onExport && (
                    <button
                      onClick={() => onExport(instance)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                    >
                      <Upload className="w-3.5 h-3.5 text-[var(--accent-to)]" />
                      <span>{t('instanceManager.overview.exportModpack', 'Export Modpack')}</span>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(instance.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/40 transition-colors hover:bg-[var(--danger)]/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('instanceManager.overview.deleteInstance', 'Delete')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MODS */}
          {activeTab === 'mods' && (
            <div className="space-y-4">
              {/* Mods Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Search installed mods..."
                    value={modSearch}
                    onChange={(e) => setModSearch(e.target.value)}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3.5 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-from)] focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsBrowserOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] text-[var(--text-on-accent)] transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('mods.browseMods', 'Add Mod')}</span>
                  </button>
                  <button
                    onClick={handleCheckModUpdates}
                    disabled={isCheckingUpdates}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
                    <span>{t('mods.checkUpdates', 'Check Updates')}</span>
                  </button>
                  <button
                    onClick={() => handleOpenFolder('mods')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open Mods Folder</span>
                  </button>
                </div>
              </div>

              {modsLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-[var(--text-muted)] text-xs gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                  <span>Loading mods...</span>
                </div>
              ) : filteredMods.length === 0 ? (
                <div className="py-16 text-center text-[var(--text-muted)] text-xs rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/30">
                  <Package className="w-8 h-8 mx-auto text-[var(--text-muted)] mb-2" />
                  <span>{mods.length === 0 ? t('mods.noModsInstalled', 'No mods installed yet') : 'No mods matching search'}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMods.map((mod) => (
                    <div
                      key={mod.file_name}
                      className={`flex items-center justify-between p-3.5 rounded-[var(--radius-md)] border transition-colors ${
                        mod.enabled
                          ? 'bg-[var(--surface-1)]/60 border-[var(--line-subtle)] hover:border-[var(--line-strong)]'
                          : 'bg-[var(--surface-1)]/40 border-[var(--line-subtle)] opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--line-subtle)] flex items-center justify-center overflow-hidden shrink-0">
                          {modIcons[mod.file_name] ? (
                            <img
                              src={modIcons[mod.file_name]!}
                              alt={mod.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-4 h-4 text-[var(--accent)]" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-[var(--text-primary)]">{mod.name}</h4>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--text-secondary)]">
                              v{mod.version}
                            </span>
                            {!mod.enabled && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--text-muted)]">
                                Disabled
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">{mod.file_name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleMod(mod.file_name, mod.enabled)}
                          className="p-1 text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
                          title={mod.enabled ? 'Disable' : 'Enable'}
                        >
                          {mod.enabled ? (
                            <ToggleRight className="w-6 h-6 text-[var(--accent)]" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-[var(--text-muted)]" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteMod(mod.file_name)}
                          className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RESOURCE PACKS */}
          {activeTab === 'resourcepacks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Resource Packs</h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">Custom textures, audio, and language files</p>
                </div>
                <button
                  onClick={() => handleOpenFolder('resourcepacks')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{t('instanceManager.resourcepacks.openFolder', 'Open Folder')}</span>
                </button>
              </div>

              {resourcePacksLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-[var(--text-muted)] text-xs gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                  <span>Scanning resource packs...</span>
                </div>
              ) : resourcePacks.length === 0 ? (
                <div className="py-16 text-center text-[var(--text-muted)] text-xs rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/30">
                  <Layers className="w-8 h-8 mx-auto text-[var(--text-muted)] mb-2" />
                  <span>{t('instanceManager.resourcepacks.empty', 'No resource packs found in this instance.')}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {resourcePacks.map((pack) => (
                    <div
                      key={pack.file_name}
                      className={`flex items-center justify-between p-3.5 rounded-[var(--radius-md)] border transition-colors ${
                        pack.is_enabled
                          ? 'bg-[var(--surface-1)]/70 border-[var(--accent-line)] shadow-[var(--shadow-sm)]'
                          : 'bg-[var(--surface-1)]/40 border-[var(--line-subtle)] hover:border-[var(--line-strong)]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--line-subtle)] flex items-center justify-center overflow-hidden shrink-0">
                          {pack.icon_base64 ? (
                            <img src={pack.icon_base64} alt={pack.name} className="w-full h-full object-cover" />
                          ) : (
                            <Layers className="w-5 h-5 text-[var(--accent)]" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-[var(--text-primary)]">{pack.name}</h4>
                            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                              {(pack.size_bytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          </div>
                          {pack.description && (
                            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">{pack.description}</p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleResourcePack(pack.file_name, !pack.is_enabled)}
                        className="p-1 text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
                        title={pack.is_enabled ? 'Disable' : 'Enable'}
                      >
                        {pack.is_enabled ? (
                          <ToggleRight className="w-6 h-6 text-[var(--accent)]" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-[var(--text-muted)]" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SHADERS */}
          {activeTab === 'shaders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Shaders</h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">OptiFine / Iris / Oculus shader packs</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSetActiveShader(null)}
                    className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    {t('instanceManager.shaders.disableAll', 'Disable Shaders (OFF)')}
                  </button>
                  <button
                    onClick={() => handleOpenFolder('shaderpacks')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{t('instanceManager.shaders.openFolder', 'Open Folder')}</span>
                  </button>
                </div>
              </div>

              {shadersLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-[var(--text-muted)] text-xs gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                  <span>Scanning shader packs...</span>
                </div>
              ) : shaderPacks.length === 0 ? (
                <div className="py-16 text-center text-[var(--text-muted)] text-xs rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/30">
                  <Sparkles className="w-8 h-8 mx-auto text-[var(--text-muted)] mb-2" />
                  <span>{t('instanceManager.shaders.empty', 'No shader packs found in this instance.')}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {shaderPacks.map((pack) => (
                    <div
                      key={pack.file_name}
                      onClick={() => handleSetActiveShader(pack.is_active ? null : pack.file_name)}
                      className={`flex items-center justify-between p-3.5 rounded-[var(--radius-md)] border cursor-pointer transition-colors ${
                        pack.is_active
                          ? 'bg-[var(--surface-1)]/80 border-[var(--accent-line)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--accent-line)]'
                          : 'bg-[var(--surface-1)]/40 border-[var(--line-subtle)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-secondary)]">
                          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-[var(--text-primary)]">{pack.name}</h4>
                            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                              {(pack.size_bytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">{pack.file_name}</p>
                        </div>
                      </div>

                      <div>
                        {pack.is_active ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-line)] flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>{t('instanceManager.shaders.active', 'Active')}</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--surface-3)]/60 text-[var(--text-secondary)] border border-[var(--line-subtle)]">
                            Select
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: WORLDS */}
          {activeTab === 'worlds' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Worlds & Saves</h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">Singleplayer maps and progress</p>
                </div>
                <button
                  onClick={() => handleOpenFolder('saves')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{t('instanceManager.worlds.openFolder', 'Open Saves Folder')}</span>
                </button>
              </div>

              {worldsLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-[var(--text-muted)] text-xs gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                  <span>Reading world saves...</span>
                </div>
              ) : worlds.length === 0 ? (
                <div className="py-16 text-center text-[var(--text-muted)] text-xs rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/30">
                  <Globe className="w-8 h-8 mx-auto text-[var(--text-muted)] mb-2" />
                  <span>{t('instanceManager.worlds.empty', 'No worlds found in this instance.')}</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {worlds.map((world) => {
                    const lastPlayedFormatted = world.last_played
                      ? new Date(world.last_played).toLocaleDateString()
                      : 'Unknown';

                    return (
                      <div
                        key={world.folder_name}
                        className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-1)]/60 border border-[var(--line-subtle)] hover:border-[var(--line-strong)] flex items-start gap-3 transition-colors"
                      >
                        <div className="w-12 h-12 rounded-[var(--radius-sm)] bg-[var(--surface-3)] border border-[var(--line-subtle)] flex items-center justify-center overflow-hidden shrink-0">
                          {world.icon_base64 ? (
                            <img src={world.icon_base64} alt={world.level_name} className="w-full h-full object-cover" />
                          ) : (
                            <Globe className="w-6 h-6 text-[var(--accent)]" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">{world.level_name}</h4>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--surface-3)] text-[var(--text-secondary)] tabular-nums">
                              {world.game_mode || 'Survival'}
                            </span>
                          </div>

                          <div className="text-[11px] text-[var(--text-secondary)] space-y-0.5">
                            <div className="flex items-center justify-between text-[var(--text-muted)]">
                              <span>Folder:</span>
                              <span className="font-mono text-[var(--text-secondary)] truncate max-w-[120px]">{world.folder_name}</span>
                            </div>
                            {world.seed !== null && (
                              <div className="flex items-center justify-between text-[var(--text-muted)]">
                                <span>Seed:</span>
                                <span className="font-mono text-[var(--text-secondary)]">{world.seed}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-[var(--text-muted)]">
                              <span>Played:</span>
                              <span>{lastPlayedFormatted}</span>
                            </div>
                            <div className="flex items-center justify-between text-[var(--text-muted)]">
                              <span>Size:</span>
                              <span>{(world.size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-3xl">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--line-subtle)]">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Instance Overrides</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Configure custom RAM, Java path, and JVM arguments specific to this instance
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetSettings}
                  disabled={settingsSaving}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                >
                  Reset to Defaults
                </button>
              </div>

              {/* Memory Allocation */}
              <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-[var(--accent)]" />
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--text-primary)]">Memory Allocation (RAM)</h4>
                      <p className="text-[11px] text-[var(--text-muted)]">Minimum and maximum heap size</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="override-memory-toggle"
                    onClick={() => setOverrideMemory(!overrideMemory)}
                    className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <span>{overrideMemory ? 'Custom Override' : 'Default (1024 - 4096 MB)'}</span>
                    {overrideMemory ? (
                      <ToggleRight className="w-6 h-6 text-[var(--accent)]" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-[var(--text-muted)]" />
                    )}
                  </button>
                </div>

                <div className={`space-y-4 ${overrideMemory ? '' : 'opacity-40 pointer-events-none'}`}>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                      <span>Maximum Memory (Xmx)</span>
                      <span className="font-mono text-[var(--accent)]">{memoryMaxMb} MB</span>
                    </div>
                    <input
                      type="range"
                      min={1024}
                      max={16384}
                      step={512}
                      value={memoryMaxMb}
                      onChange={(e) => setMemoryMaxMb(Number(e.target.value))}
                      className="w-full h-1.5 bg-[var(--surface-3)] rounded-[var(--radius-sm)] appearance-none cursor-pointer accent-[var(--accent-from)]"
                    />
                  </div>
                </div>
              </div>

              {/* Java Runtime */}
              <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-[var(--accent)]" />
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--text-primary)]">Java Runtime</h4>
                      <p className="text-[11px] text-[var(--text-muted)]">Override Java executable for this instance</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverrideJava(!overrideJava)}
                    className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <span>{overrideJava ? 'Custom Override' : 'Inherited (Auto)'}</span>
                    {overrideJava ? (
                      <ToggleRight className="w-6 h-6 text-[var(--accent)]" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-[var(--text-muted)]" />
                    )}
                  </button>
                </div>

                <div className={`space-y-3 ${overrideJava ? '' : 'opacity-40 pointer-events-none'}`}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="C:/Program Files/Java/bin/javaw.exe"
                      value={javaPath}
                      onChange={(e) => setJavaPath(e.target.value)}
                      className="flex-1 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3.5 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleDetectJava}
                      disabled={isDetectingJava}
                      className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border border-[var(--line-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                    >
                      {isDetectingJava ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Auto-Detect'}
                    </button>
                  </div>
                </div>
              </div>

              {/* GC Preset */}
              <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[var(--accent)]" />
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--text-primary)]">Garbage Collector</h4>
                      <p className="text-[11px] text-[var(--text-muted)]">Tune GC flags for optimal frametimes</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverrideGc(!overrideGc)}
                    className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <span>{overrideGc ? 'Custom Override' : `Inherited (${global.gcPreset})`}</span>
                    {overrideGc ? (
                      <ToggleRight className="w-6 h-6 text-[var(--accent)]" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-[var(--text-muted)]" />
                    )}
                  </button>
                </div>

                <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${overrideGc ? '' : 'opacity-40 pointer-events-none'}`}>
                  {(['G1GC', 'ZGC', 'Shenandoah', 'None'] as GcPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGcPreset(preset)}
                      className={`p-2 rounded-[var(--radius-sm)] border text-xs font-medium transition-colors ${
                        gcPreset === preset
                          ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-[var(--line-subtle)] bg-[var(--surface-3)]/50 text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom JVM Arguments */}
              <div className="rounded-[var(--radius-md)] border border-[var(--line-subtle)] bg-[var(--surface-1)]/60 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[var(--accent)]" />
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--text-primary)]">JVM Arguments</h4>
                      <p className="text-[11px] text-[var(--text-muted)]">Additional flags passed to the java binary</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverrideJvmArgs(!overrideJvmArgs)}
                    className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <span>{overrideJvmArgs ? 'Custom Override' : 'Inherited'}</span>
                    {overrideJvmArgs ? (
                      <ToggleRight className="w-6 h-6 text-[var(--accent)]" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-[var(--text-muted)]" />
                    )}
                  </button>
                </div>

                <div className={`${overrideJvmArgs ? '' : 'opacity-40 pointer-events-none'}`}>
                  <textarea
                    rows={2}
                    placeholder="-XX:+AlwaysPreTouch"
                    value={jvmArgs}
                    onChange={(e) => setJvmArgs(e.target.value)}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface-3)] px-3.5 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-from)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  data-testid="save-instance-settings-btn"
                  onClick={handleSaveSettings}
                  disabled={settingsSaving}
                  className="px-6 py-2 rounded-[var(--radius-sm)] text-xs font-semibold bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] text-[var(--text-on-accent)] flex items-center gap-2 transition-all hover:shadow-[var(--shadow-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                >
                  {settingsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Settings</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Submodal for ModBrowser */}
      {isBrowserOpen && (
        <ModBrowserModal
          isOpen={isBrowserOpen}
          onClose={() => setIsBrowserOpen(false)}
          instanceId={instance.id}
          gameVersion={instance.game_version}
          loader={instance.loader}
          onModInstalled={loadMods}
        />
      )}

      {/* Confirm Dialog for Mod Deletion */}
      <ConfirmDialog
        isOpen={modToDelete !== null}
        title={t('common.delete', 'Delete')}
        message={`Delete ${modToDelete}?`}
        confirmText={t('common.delete', 'Delete')}
        variant="danger"
        isLoading={isDeletingMod}
        onConfirm={executeDeleteMod}
        onCancel={() => setModToDelete(null)}
      />

      {/* Confirm Dialog for Reset Settings */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title={t('settings.resetToDefaults', 'Reset to Defaults')}
        message={t('settings.resetConfirm', 'Reset all instance overrides to global defaults?')}
        confirmText={t('settings.reset', 'Reset')}
        variant="warning"
        isLoading={settingsSaving}
        onConfirm={executeResetSettings}
        onCancel={() => setShowResetConfirm(false)}
      />
    </motion.div>
  );
};
