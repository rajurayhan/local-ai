import fs from 'node:fs';
import path from 'node:path';

import { expandHome, osHome } from './paths.ts';
import type { DeviceConfig } from './types.ts';

export type ConfigOverrides = Omit<
  Partial<DeviceConfig>,
  'files' | 'shell' | 'browser' | 'desktop' | 'apps'
> & {
  files?: Partial<DeviceConfig['files']>;
  shell?: Partial<DeviceConfig['shell']>;
  browser?: Partial<DeviceConfig['browser']>;
  desktop?: Partial<DeviceConfig['desktop']>;
  apps?: Partial<DeviceConfig['apps']>;
};

const DEFAULT_DENY = [
  'sudo',
  'su',
  'doas',
  'diskutil',
  'mkfs',
  'dd',
  'shutdown',
  'reboot',
  'halt',
  'csrutil',
  'nvram',
  'launchctl',
  'osascript',
  'defaults',
];

export function defaultRoot(): string {
  return path.join(osHome(), 'Documents', 'RakaAI');
}

export function defaultConfig(overrides: ConfigOverrides = {}): DeviceConfig {
  const root = expandHome(overrides.files?.root ?? defaultRoot());
  return {
    host: overrides.host ?? '0.0.0.0',
    port: overrides.port ?? 8765,
    token: overrides.token ?? '',
    logPath: expandHome(overrides.logPath ?? '/tmp/rakaai-device-mcp.log'),
    files: {
      root,
      writes: overrides.files?.writes ?? false,
      maxReadBytes: overrides.files?.maxReadBytes ?? 256 * 1024,
    },
    shell: {
      cwdAllow: (overrides.shell?.cwdAllow ?? [root]).map(expandHome),
      denyBinaries: overrides.shell?.denyBinaries ?? [...DEFAULT_DENY],
      timeoutMs: overrides.shell?.timeoutMs ?? 15_000,
      maxOutputBytes: overrides.shell?.maxOutputBytes ?? 32 * 1024,
    },
    browser: {
      allowedDomains: overrides.browser?.allowedDomains ?? [],
      userDataDir: expandHome(
        overrides.browser?.userDataDir ?? path.join(root, '.browser-profile'),
      ),
      headless: overrides.browser?.headless ?? true,
      timeoutMs: overrides.browser?.timeoutMs ?? 45_000,
    },
    desktop: {
      screenshotDir: expandHome(
        overrides.desktop?.screenshotDir ?? path.join(root, 'screenshots'),
      ),
    },
    apps: {
      hooks: overrides.apps?.hooks ?? [],
      slackToken: process.env.SLACK_BOT_TOKEN || overrides.apps?.slackToken || '',
      slackUserToken: process.env.SLACK_USER_TOKEN || overrides.apps?.slackUserToken || '',
      timeoutMs: overrides.apps?.timeoutMs ?? 15_000,
      maxResponseBytes: overrides.apps?.maxResponseBytes ?? 32 * 1024,
    },
  };
}

export function loadConfig(configPath?: string): DeviceConfig {
  const file = configPath ?? path.join(process.cwd(), 'config.json');
  if (!fs.existsSync(file)) {
    return defaultConfig({
      token: process.env.DEVICE_MCP_TOKEN ?? '',
      port: Number(process.env.DEVICE_MCP_PORT || 8765),
    });
  }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as ConfigOverrides;

  return defaultConfig({
    ...raw,
    token: process.env.DEVICE_MCP_TOKEN || raw.token || '',
    port: Number(process.env.DEVICE_MCP_PORT || raw.port || 8765),
  });
}
