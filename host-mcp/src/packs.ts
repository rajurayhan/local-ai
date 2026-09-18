import { createBrowserSession } from './browser.ts';
import { packIdentity } from './identity.ts';
import { createAppsPack } from './packs/apps.ts';
import { createBrowserPack } from './packs/browser.ts';
import { createCalendarPack } from './packs/calendar.ts';
import { createDesktopPack } from './packs/desktop.ts';
import { createFilesPack } from './packs/files.ts';
import { createShellPack } from './packs/shell.ts';
import { postJson, runCommand } from './process.ts';
import { createSlackApi } from './slack.ts';
import type { DeviceConfig, Pack, PackDraft, PackName } from './types.ts';

export const PACK_NAMES: PackName[] = ['files', 'shell', 'browser', 'desktop', 'apps', 'calendar'];

function withIdentity(pack: PackDraft): Pack {
  return { ...pack, ...packIdentity(pack.name) };
}

function slackClients(config: DeviceConfig, post: typeof postJson) {
  const asUser = config.apps.slackUserToken
    ? createSlackApi(config.apps.slackUserToken, post, config.apps.timeoutMs)
    : undefined;
  if (asUser) {
    return { asUser, directory: asUser };
  }
  const directory = config.apps.slackToken
    ? createSlackApi(config.apps.slackToken, post, config.apps.timeoutMs)
    : undefined;
  return { asUser, directory };
}

export function createPacks(config: DeviceConfig): Record<PackName, Pack> {
  return {
    files: withIdentity(createFilesPack(config)),
    shell: withIdentity(createShellPack(config, runCommand)),
    browser: withIdentity(
      createBrowserPack(config, () =>
        createBrowserSession({
          userDataDir: config.browser.userDataDir,
          headless: config.browser.headless,
          timeoutMs: config.browser.timeoutMs,
        }),
      ),
    ),
    desktop: withIdentity(createDesktopPack(config, runCommand)),
    apps: withIdentity(createAppsPack(config, postJson, slackClients(config, postJson))),
    calendar: withIdentity(createCalendarPack(config, runCommand)),
  };
}
