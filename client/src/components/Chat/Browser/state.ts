import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { BrowserViewport } from './viewport';

export const browserViewportByConversation = atomFamily((conversationId: string) =>
  atom<BrowserViewport | null>(null),
);

/** Conversation whose browser panel currently holds the side slot. */
export const activeBrowserConversationId = atom<string | null>(null);
