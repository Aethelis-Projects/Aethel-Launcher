import { vi } from 'vitest';
import type { LaunchReceipt } from '../bindings';

export const mockLaunchReceipt: LaunchReceipt = {
  java_path: 'javaw.exe',
  working_dir: 'instances/1.20.4',
  command: 'javaw.exe',
  arguments: [
    '-Xms1024M',
    '-Xmx4096M',
    '-XX:+UseG1GC',
    '-cp',
    'libraries/client.jar;libraries/lwjgl.jar',
    'net.minecraft.client.main.Main',
    '--username',
    'Player',
    '--version',
    '1.20.4',
    '--gameDir',
    'instances/1.20.4',
    '--assetsDir',
    'assets',
    '--assetIndex',
    '12',
    '--uuid',
    '00000000-0000-0000-0000-000000000000',
    '--accessToken',
    '0',
    '--userType',
    'legacy',
    '--versionType',
    'release',
  ],
  environment: {},
  classpath_tier: 'Tier1_Direct',
};

export const mockInvoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  switch (cmd) {
    case 'get_launcher_version':
      return '0.1.0';
    case 'get_offline_uuid':
      return '5627dd98-e6be-3c21-b8a8-e92344183641';
    case 'get_instances':
      return [];
    case 'delete_instance':
      return null;
    case 'get_launch_receipt':
    case 'launch_with_stub_identity':
    case 'launch_with_active_identity':
      return mockLaunchReceipt;
    case 'launch_instance':
      return 12345;
    case 'detect_system_java':
      return [
        {
          path: 'C:/java/bin/javaw.exe',
          version: '21.0.2',
          major: 21,
          arch: 'x86_64',
          vendor: 'Eclipse Temurin',
          is_system: true,
        },
      ];
    case 'download_jre':
      return 'runtimes/java-21/bin/javaw.exe';
    case 'upload_crash_to_mclogs':
      return 'https://mclo.gs/mock123';
    case 'analyze_crash_log':
      return {
        pattern: 'OutOfMemory',
        diagnosis: 'The game ran out of allocated memory.',
        suggestion: 'Allocate more RAM in Instance Settings.',
        full_log: 'OutOfMemoryError',
        exit_code: 1,
        upload_url: null,
      };
    case 'get_accounts':
      return [];
    case 'get_active_account':
      return null;
    case 'set_active_account':
    case 'logout':
      return null;
    case 'search_mods':
      return [];
    case 'get_mod_versions':
      return [];
    case 'install_mod':
      return { to_install: [], optional_suggestions: [], conflicts: [] };
    case 'install_modloader':
      return 'fabric-loader-0.16.10-1.20.4';
    case 'uninstall_modloader':
      return null;
    case 'get_modloader_versions':
      return [
        { loader: 'Fabric', version: '0.16.10', game_version: '1.20.4', stable: true },
        { loader: 'Fabric', version: '0.15.11', game_version: '1.20.4', stable: true },
      ];
    case 'list_installed_mods':
      return [];
    case 'toggle_mod':
    case 'delete_mod':
      return null;
    case 'check_mod_updates':
      return [];
    case 'get_installed_runtimes':
      return [
        { major: 21, path: 'runtimes/java-21/bin/javaw.exe', provider: 'Adoptium', version_str: 'Java 21' }
      ];
    case 'download_runtime':
      return {
        major: (args?.major as number) || 21,
        path: `runtimes/java-${args?.major || 21}/bin/javaw.exe`,
        provider: (args?.provider as string) || 'Adoptium',
        version_str: `Java ${args?.major || 21}`
      };
    case 'delete_runtime':
      return null;
    case 'get_recommended_java':
      return 21;
    case 'resolve_java_for_instance':
      return 'runtimes/java-21/bin/javaw.exe';
    case 'check_for_updates':
      return null;
    case 'download_and_install_update':
      return null;
    case 'export_instance_backup':
    case 'export_modpack':
      return null;
    case 'get_global_settings':
      return {
        theme: 'system',
        discord_rpc_enabled: false,
        update_channel: 'stable',
        default_java_path: null,
        default_java_mode: 'auto',
        default_java_provider: 'Adoptium',
        default_memory_min_mb: 1024,
        default_memory_max_mb: 4096,
        default_gc_preset: 'G1GC',
        default_jvm_args: null,
      };
    case 'update_global_settings':
      return null;
    case 'get_instance_settings':
      return {
        java_path: null,
        memory_min_mb: null,
        memory_max_mb: null,
        gc_preset: null,
        jvm_args: null,
      };
    case 'update_instance_settings':
      return null;
    case 'get_effective_instance_settings':
      return {
        java_path: null,
        memory_min_mb: 1024,
        memory_max_mb: 4096,
        gc_preset: 'G1GC',
        jvm_args: null,
        has_overrides: false,
      };
    case 'set_discord_rpc_enabled':
    case 'set_discord_rpc_activity':
      return null;
    default:
      throw new Error(`Unmocked command: ${cmd} with args: ${JSON.stringify(args)}`);
  }
});

// Setup vi mock for @tauri-apps/api/core and @tauri-apps/api/window
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
  Channel: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  once: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));
