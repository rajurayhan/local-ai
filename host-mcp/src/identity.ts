import type { PackAuthor, PackName } from './types.ts';

export const PACK_AUTHOR: PackAuthor = {
  name: 'RakaAI',
  email: 'raju@sulus.ai',
};

export const PACK_SHARE_NAMES = {
  files: 'RakaAI-Files',
  shell: 'RakaAI-Shell',
  browser: 'RakaAI-Browser',
  desktop: 'RakaAI-Desktop',
  apps: 'RakaAI-Apps',
} as const satisfies Record<PackName, string>;

const SUMMARIES: Record<PackName, string> = {
  files: 'Read files anywhere on this Mac.',
  shell: 'Run one allowlisted program in the allowed folder.',
  browser: 'Open JavaScript-rendered pages in an isolated browser and return visible text.',
  desktop: 'Open Mac apps, click menus, press shortcuts, type, and capture the screen.',
  apps: 'Look up Slack people and channels, send Slack messages as you, and trigger configured app webhooks.',
};

export function packIdentity(name: PackName): {
  shareName: string;
  author: PackAuthor;
  description: string;
} {
  const shareName = PACK_SHARE_NAMES[name];
  return {
    shareName,
    author: { ...PACK_AUTHOR },
    description: `${shareName}: ${SUMMARIES[name]} Authored by ${PACK_AUTHOR.name} <${PACK_AUTHOR.email}>.`,
  };
}
