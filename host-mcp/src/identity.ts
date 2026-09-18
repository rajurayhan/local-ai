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
  files: 'Read files under the allowed folder on this Mac.',
  shell: 'Run one allowlisted program in the allowed folder.',
  browser: 'Open and read web pages in an isolated browser.',
  desktop: 'Open Mac apps, click menus, press shortcuts, type, and capture the screen.',
  apps: 'Trigger configured app webhooks and send Slack messages.',
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
