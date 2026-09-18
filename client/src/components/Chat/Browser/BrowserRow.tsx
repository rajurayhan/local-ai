import { useAtomValue, useSetAtom } from 'jotai';
import { Globe } from 'lucide-react';
import { Button } from '@librechat/client';
import { useOptionalChatSurface } from '~/components/Chat/Subagents/surface';
import { ROW_GLYPH_SLOT, TOOL_ROW_CLASSES } from '~/components/Chat/Messages/Content/rows';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { activeBrowserConversationId, browserViewportByConversation } from './state';
import { useBrowserHost } from './host';
import type { BrowserViewport } from './viewport';

export default function BrowserRow({
  frame,
}: {
  frame: Omit<BrowserViewport, 'conversationId'>;
}) {
  const localize = useLocalize();
  const host = useBrowserHost();
  const conversationId = host?.conversationId ?? '';
  const setViewport = useSetAtom(browserViewportByConversation(conversationId));
  const setActive = useSetAtom(activeBrowserConversationId);
  const activeId = useAtomValue(activeBrowserConversationId);
  const claimForeground = useOptionalChatSurface()?.claimForeground;
  const isSelected = activeId === conversationId && conversationId !== '';
  const title = frame.url || localize('com_ui_browser_page');

  const onOpen = () => {
    if (conversationId === '') {
      return;
    }
    if (isSelected) {
      setActive(null);
      return;
    }
    setViewport({ ...frame, conversationId });
    claimForeground?.();
    setActive(conversationId);
  };

  return (
    <div className={cn(TOOL_ROW_CLASSES, 'text-sm text-text-secondary')}>
      <Button
        type="button"
        variant="ghost"
        aria-controls="browser-viewer"
        aria-expanded={isSelected}
        onClick={onOpen}
        className={cn(
          'inline-flex h-auto min-w-0 flex-1 items-center justify-start gap-2.5 rounded-none p-0',
          'hover:bg-transparent hover:text-text-primary focus-visible:ring-text-primary focus-visible:ring-offset-0',
          isSelected && 'text-text-primary',
        )}
      >
        <span className={cn(ROW_GLYPH_SLOT, 'text-status-info')} aria-hidden="true">
          <Globe className="size-4 shrink-0" />
        </span>
        <span className="min-w-0 truncate font-medium" title={title}>
          {title}
        </span>
        <span className="shrink-0 rounded px-1.5 text-[10px] font-medium uppercase leading-5 tracking-wide text-text-tertiary ring-1 ring-inset ring-border-light">
          {localize('com_ui_browser')}
        </span>
        <span className="sr-only">
          {isSelected ? localize('com_ui_browser_close') : localize('com_ui_browser_open')}
        </span>
      </Button>
    </div>
  );
}
