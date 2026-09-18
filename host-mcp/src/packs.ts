import { createBrowserSession } from './browser.ts';
import { createAppsPack } from './packs/apps.ts';
import { createBrowserPack } from './packs/browser.ts';
import { createDesktopPack } from './packs/desktop.ts';
import { createFilesPack } from './packs/files.ts';
import { createShellPack } from './packs/shell.ts';
import { postJson, runCommand } from './process.ts';
import type { DeviceConfig, Pack, PackName } from './types.ts';

export const PACK_NAMES: PackName[] = ['files', 'shell', 'browser', 'desktop', 'apps'];

export function createPacks(config: DeviceConfig): Record<PackName, Pack> {
  return {
    files: createFilesPack(config),
    shell: createShellPack(config, runCommand),
    browser: createBrowserPack(config, () => createBrowserSession(config.browser.userDataDir)),
    desktop: createDesktopPack(config, runCommand),
    apps: createAppsPack(config, postJson),
  };
}
