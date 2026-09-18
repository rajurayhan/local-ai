import { useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { useOptionalChatSurface } from '~/components/Chat/Subagents/surface';
import { activeBrowserConversationId, browserViewportByConversation } from './state';
import { useBrowserHost } from './host';
import type { BrowserViewport } from './viewport';

export function useBrowserViewportSync({
  frame,
  isSubmitting,
}: {
  frame: Omit<BrowserViewport, 'conversationId'> | null;
  isSubmitting: boolean;
}): void {
  const host = useBrowserHost();
  const conversationId = host?.conversationId ?? '';
  const setViewport = useSetAtom(browserViewportByConversation(conversationId));
  const setActive = useSetAtom(activeBrowserConversationId);
  const claimForeground = useOptionalChatSurface()?.claimForeground;
  const lastFileId = useRef<string | undefined>();

  useEffect(() => {
    if (frame == null || conversationId === '') {
      return;
    }
    setViewport({ ...frame, conversationId });
    if (!isSubmitting || frame.fileId === lastFileId.current) {
      return;
    }
    lastFileId.current = frame.fileId;
    claimForeground?.();
    setActive(conversationId);
  }, [
    claimForeground,
    conversationId,
    frame,
    frame?.fileId,
    frame?.imageUrl,
    frame?.url,
    isSubmitting,
    setActive,
    setViewport,
  ]);
}
