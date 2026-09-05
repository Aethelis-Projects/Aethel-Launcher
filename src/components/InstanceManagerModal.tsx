import React, { useState, useEffect, useCallback } from 'react';
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

  const handleDeleteMod = async (fileName: string) => {
    if (!window.confirm(`Delete ${fileName}?`)) return;
    try {
      const res = await commands.deleteMod(instance.id, fileName);
      if (res.status === 'ok') {
        await loadMods();
      }
    } catch (e) {
      setModsError(e instanceof Error ? e.message : String(e));
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

  const handleResetSettings = async () => {
    if (!window.confirm(t('settings.resetConfirm', 'Reset all instance overrides to global defaults?'))) {
      return;
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-inner overflow-hidden">
              {instance.icon_path ? (
                <img src={instance.icon_path} alt={instance.name} className="w-full h-full object-cover" />
              ) : (
                instance.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">{instance.name}</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-zinc-800 text-cyan-400 border border-zinc-700/60">
                  {instance.game_version}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-800/80 text-zinc-400 border border-zinc-700/40">
                  {instance.loader || 'Vanilla'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {t('instances.playtime')}: {Math.floor(instance.total_playtime_seconds / 3600)}h {Math.floor((instance.total_playtime_seconds % 3600) / 60)}m
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 border-b border-zinc-800/80 bg-zinc-900/30 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.overview', 'Overview')}</span>
          </button>

          <button
            onClick={() => setActiveTab('mods')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'mods'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.mods', 'Mods')}</span>
            {mods.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                {mods.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('resourcepacks')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'resourcepacks'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.resourcepacks', 'Resource Packs')}</span>
            {resourcePacks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                {resourcePacks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('shaders')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'shaders'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.shaders', 'Shaders')}</span>
            {shaderPacks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                {shaderPacks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('worlds')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'worlds'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.worlds', 'Worlds')}</span>
            {worlds.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                {worlds.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs font-medium transition-colors ${
              activeTab === 'settings'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{t('instanceManager.tabs.settings', 'Settings')}</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 max-w-3xl">
              {/* Instance Name & Rename */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 space-y-4">
                <label className="text-xs font-semibold text-zinc-200 uppercase tracking-wider block">
                  {t('instanceManager.overview.name', 'Instance Name')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    disabled={isSavingName || instanceName === instance.name}
                    onClick={handleSaveName}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                  >
                    {isSavingName ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : nameSavedSuccess ? (
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                    ) : null}
                    <span>{nameSavedSuccess ? t('common.saved', 'Saved!') : t('instanceManager.overview.saveName', 'Save')}</span>
                  </button>
                </div>
              </div>

              {/* Custom Icon */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
                    {instance.icon_path ? (
                      <img src={instance.icon_path} alt="Icon" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-zinc-500" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">{t('instanceManager.overview.changeIcon', 'Instance Icon')}</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Custom PNG/JPG icon for your instance card</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleChangeIcon}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                  >
                    {t('instanceManager.overview.changeIcon', 'Change Icon')}
                  </button>
                  {instance.icon_path && (
                    <button
                      onClick={handleResetIcon}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/60 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 border border-zinc-700/60 transition-colors"
                    >
                      {t('instanceManager.overview.resetIcon', 'Reset')}
                    </button>
                  )}
                </div>
              </div>

              {/* Path & Folder */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">Instance Directory</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Game files, saves, configurations, and logs</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyPath}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                    >
                      {copiedPath ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPath ? t('instanceManager.overview.pathCopied', 'Copied!') : t('instanceManager.overview.copyPath', 'Copy Path')}</span>
                    </button>
                    <button
                      onClick={() => handleOpenFolder(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600/90 hover:bg-cyan-500 text-white transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{t('instanceManager.overview.openFolder', 'Open Folder')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Modloader Configuration */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5">
                <ModloaderSelector
                  instanceId={instance.id}
                  gameVersion={instance.game_version}
                  currentLoader={instance.loader}
                  currentLoaderVersion={instance.loader_version}
                  onLoaderUpdated={fetchInstances}
                />
              </div>

              {/* Actions: Export / Delete */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">Instance Actions</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Export to Modrinth modpack or delete instance</p>
                </div>
                <div className="flex items-center gap-2">
                  {onExport && (
                    <button
                      onClick={() => onExport(instance)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{t('instanceManager.overview.exportModpack', 'Export Modpack')}</span>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(instance.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/50 transition-colors"
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
                    className="w-full px-3.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsBrowserOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('mods.browseMods', 'Add Mod')}</span>
                  </button>
                  <button
                    onClick={handleCheckModUpdates}
                    disabled={isCheckingUpdates}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
                    <span>{t('mods.checkUpdates', 'Check Updates')}</span>
                  </button>
                  <button
                    onClick={() => handleOpenFolder('mods')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open Mods Folder</span>
                  </button>
                </div>
              </div>

              {modsLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-zinc-500 text-xs gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                  <span>Loading mods...</span>
                </div>
              ) : filteredMods.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 text-xs bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                  <Package className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                  <span>{mods.length === 0 ? t('mods.noModsInstalled', 'No mods installed yet') : 'No mods matching search'}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMods.map((mod) => (
                    <div
                      key={mod.file_name}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
                        mod.enabled
                          ? 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700'
                          : 'bg-zinc-950/40 border-zinc-900/80 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                          <Package className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-zinc-200">{mod.name}</h4>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                              v{mod.version}
                            </span>
                            {!mod.enabled && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                                Disabled
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{mod.file_name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleMod(mod.file_name, mod.enabled)}
                          className="p-1 text-zinc-400 hover:text-cyan-400 transition-colors"
                          title={mod.enabled ? 'Disable' : 'Enable'}
                        >
                          {mod.enabled ? (
                            <ToggleRight className="w-6 h-6 text-cyan-400" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-zinc-600" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteMod(mod.file_name)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800/50 transition-colors"
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
                  <h3 className="text-xs font-semibold text-zinc-200">Resource Packs</h3>
                  <p className="text-[11px] text-zinc-400">Custom textures, audio, and language files</p>
                </div>
                <button
                  onClick={() => handleOpenFolder('resourcepacks')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{t('instanceManager.resourcepacks.openFolder', 'Open Folder')}</span>
                </button>
              </div>

              {resourcePacksLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-zinc-500 text-xs gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                  <span>Scanning resource packs...</span>
                </div>
              ) : resourcePacks.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 text-xs bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                  <Layers className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                  <span>{t('instanceManager.resourcepacks.empty', 'No resource packs found in this instance.')}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {resourcePacks.map((pack) => (
                    <div
                      key={pack.file_name}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
                        pack.is_enabled
                          ? 'bg-zinc-900/70 border-cyan-500/40 shadow-sm shadow-cyan-950/20'
                          : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                          {pack.icon_base64 ? (
                            <img src={pack.icon_base64} alt={pack.name} className="w-full h-full object-cover" />
                          ) : (
                            <Layers className="w-5 h-5 text-cyan-400" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-zinc-100">{pack.name}</h4>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {(pack.size_bytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          </div>
                          {pack.description && (
                            <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">{pack.description}</p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleResourcePack(pack.file_name, !pack.is_enabled)}
                        className="p-1 text-zinc-400 hover:text-cyan-400 transition-colors"
                        title={pack.is_enabled ? 'Disable' : 'Enable'}
                      >
                        {pack.is_enabled ? (
                          <ToggleRight className="w-6 h-6 text-cyan-400" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-zinc-600" />
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
                  <h3 className="text-xs font-semibold text-zinc-200">Shaders</h3>
                  <p className="text-[11px] text-zinc-400">OptiFine / Iris / Oculus shader packs</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSetActiveShader(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors"
                  >
                    {t('instanceManager.shaders.disableAll', 'Disable Shaders (OFF)')}
                  </button>
                  <button
                    onClick={() => handleOpenFolder('shaderpacks')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{t('instanceManager.shaders.openFolder', 'Open Folder')}</span>
                  </button>
                </div>
              </div>

              {shadersLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-zinc-500 text-xs gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                  <span>Scanning shader packs...</span>
                </div>
              ) : shaderPacks.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 text-xs bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                  <Sparkles className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                  <span>{t('instanceManager.shaders.empty', 'No shader packs found in this instance.')}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {shaderPacks.map((pack) => (
                    <div
                      key={pack.file_name}
                      onClick={() => handleSetActiveShader(pack.is_active ? null : pack.file_name)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-colors ${
                        pack.is_active
                          ? 'bg-zinc-900/80 border-cyan-500/50 shadow-md shadow-cyan-950/30 ring-1 ring-cyan-500/30'
                          : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                          <Sparkles className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-zinc-100">{pack.name}</h4>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {(pack.size_bytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{pack.file_name}</p>
                        </div>
                      </div>

                      <div>
                        {pack.is_active ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-cyan-950/80 text-cyan-300 border border-cyan-800 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>{t('instanceManager.shaders.active', 'Active')}</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-800/60 text-zinc-400 border border-zinc-700/40">
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
                  <h3 className="text-xs font-semibold text-zinc-200">Worlds & Saves</h3>
                  <p className="text-[11px] text-zinc-400">Singleplayer maps and progress</p>
                </div>
                <button
                  onClick={() => handleOpenFolder('saves')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{t('instanceManager.worlds.openFolder', 'Open Saves Folder')}</span>
                </button>
              </div>

              {worldsLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-zinc-500 text-xs gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                  <span>Reading world saves...</span>
                </div>
              ) : worlds.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 text-xs bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                  <Globe className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
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
                        className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 flex items-start gap-3 transition-colors"
                      >
                        <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                          {world.icon_base64 ? (
                            <img src={world.icon_base64} alt={world.level_name} className="w-full h-full object-cover" />
                          ) : (
                            <Globe className="w-6 h-6 text-cyan-400" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-xs font-bold text-zinc-100 truncate">{world.level_name}</h4>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300">
                              {world.game_mode || 'Survival'}
                            </span>
                          </div>

                          <div className="text-[11px] text-zinc-400 space-y-0.5">
                            <div className="flex items-center justify-between text-zinc-500">
                              <span>Folder:</span>
                              <span className="font-mono text-zinc-400 truncate max-w-[120px]">{world.folder_name}</span>
                            </div>
                            {world.seed !== null && (
                              <div className="flex items-center justify-between text-zinc-500">
                                <span>Seed:</span>
                                <span className="font-mono text-zinc-400">{world.seed}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-zinc-500">
                              <span>Played:</span>
                              <span>{lastPlayedFormatted}</span>
                            </div>
                            <div className="flex items-center justify-between text-zinc-500">
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
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Instance Overrides</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Configure custom RAM, Java path, and JVM arguments specific to this instance
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetSettings}
                  disabled={settingsSaving}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
                >
                  Reset to Defaults
                </button>
              </div>

              {/* Memory Allocation */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-cyan-400" />
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200">Memory Allocation (RAM)</h4>
                      <p className="text-[11px] text-zinc-500">Minimum and maximum heap size</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="override-memory-toggle"
                    onClick={() => setOverrideMemory(!overrideMemory)}
                    className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                  >
                    <span>{overrideMemory ? 'Custom Override' : 'Default (1024 - 4096 MB)'}</span>
                    {overrideMemory ? (
                      <ToggleRight className="w-6 h-6 text-cyan-400" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-zinc-600" />
                    )}
                  </button>
                </div>

                <div className={`space-y-4 ${overrideMemory ? '' : 'opacity-40 pointer-events-none'}`}>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Maximum Memory (Xmx)</span>
                      <span className="font-mono text-cyan-400">{memoryMaxMb} MB</span>
                    </div>
                    <input
                      type="range"
                      min={1024}
                      max={16384}
                      step={512}
                      value={memoryMaxMb}
                      onChange={(e) => setMemoryMaxMb(Number(e.target.value))}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* Java Runtime */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200">Java Runtime</h4>
                      <p className="text-[11px] text-zinc-500">Override Java executable for this instance</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverrideJava(!overrideJava)}
                    className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                  >
                    <span>{overrideJava ? 'Custom Override' : 'Inherited (Auto)'}</span>
                    {overrideJava ? (
                      <ToggleRight className="w-6 h-6 text-cyan-400" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-zinc-600" />
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
                      className="flex-1 px-3.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 font-mono focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={handleDetectJava}
                      disabled={isDetectingJava}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                    >
                      {isDetectingJava ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Auto-Detect'}
                    </button>
                  </div>
                </div>
              </div>

              {/* GC Preset */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200">Garbage Collector</h4>
                      <p className="text-[11px] text-zinc-500">Tune GC flags for optimal frametimes</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverrideGc(!overrideGc)}
                    className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                  >
                    <span>{overrideGc ? 'Custom Override' : `Inherited (${global.gcPreset})`}</span>
                    {overrideGc ? (
                      <ToggleRight className="w-6 h-6 text-cyan-400" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-zinc-600" />
                    )}
                  </button>
                </div>

                <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${overrideGc ? '' : 'opacity-40 pointer-events-none'}`}>
                  {(['G1GC', 'ZGC', 'Shenandoah', 'None'] as GcPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGcPreset(preset)}
                      className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
                        gcPreset === preset
                          ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-300'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom JVM Arguments */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200">JVM Arguments</h4>
                      <p className="text-[11px] text-zinc-500">Additional flags passed to the java binary</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverrideJvmArgs(!overrideJvmArgs)}
                    className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                  >
                    <span>{overrideJvmArgs ? 'Custom Override' : 'Inherited'}</span>
                    {overrideJvmArgs ? (
                      <ToggleRight className="w-6 h-6 text-cyan-400" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-zinc-600" />
                    )}
                  </button>
                </div>

                <div className={`${overrideJvmArgs ? '' : 'opacity-40 pointer-events-none'}`}>
                  <textarea
                    rows={2}
                    placeholder="-XX:+AlwaysPreTouch"
                    value={jvmArgs}
                    onChange={(e) => setJvmArgs(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-500"
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
                  className="px-6 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-950 transition-colors flex items-center gap-2"
                >
                  {settingsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Settings</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
};
