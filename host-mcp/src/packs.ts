import { createBrowserSession } from './browser.ts';
import { packIdentity } from './identity.ts';
import { createAppsPack } from './packs/apps.ts';
import { createBrowserPack } from './packs/browser.ts';
import { createDesktopPack } from './packs/desktop.ts';
import { createFilesPack } from './packs/files.ts';
import { createShellPack } from './packs/shell.ts';
import { postJson, runCommand } from './process.ts';
import { createSlackApi } from './slack.ts';
import type { DeviceConfig, Pack, PackDraft, PackName } from './types.ts';

export const PACK_NAMES: PackName[] = ['files', 'shell', 'browser', 'desktop', 'apps'];

function withIdentity(pack: PackDraft): Pack {
  return { ...pack, ...packIdentity(pack.name) };
}

export function createPacks(config: DeviceConfig): Record<PackName, Pack> {
  return {
    files: withIdentity(createFilesPack(config)),
    shell: withIdentity(createShellPack(config, runCommand)),
    browser: withIdentity(createBrowserPack(config, () => createBrowserSession(config.browser.userDataDir))),
    desktop: withIdentity(createDesktopPack(config, runCommand)),
    apps: withIdentity(
      createAppsPack(
        config,
        postJson,
        config.apps.slackToken
          ? createSlackApi(config.apps.slackToken, postJson, config.apps.timeoutMs, config.apps.maxResponseBytes)
          : undefined,
      ),
    ),
  };
}
