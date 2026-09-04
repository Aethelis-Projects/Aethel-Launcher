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
    case 'get_launch_receipt':
    case 'launch_with_stub_identity':
      return mockLaunchReceipt;
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
