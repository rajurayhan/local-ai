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
  calendar: 'RakaAI-Calendar',
} as const satisfies Record<PackName, string>;

const SUMMARIES: Record<PackName, string> = {
  files: 'Find, search, and read files anywhere on this Mac.',
  shell: 'Run one allowlisted program in the allowed folder.',
  browser:
    'Open JavaScript-rendered pages in an isolated browser, list links, fill fields, and return visible text.',
  desktop:
    'Open Mac apps or files, use the clipboard, click menus, press shortcuts, type, and capture the screen.',
  apps: 'Look up Slack people and channels, read and send Slack as you, and trigger configured app webhooks.',
  calendar: 'List and create Calendar events and Reminders on this Mac.',
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
