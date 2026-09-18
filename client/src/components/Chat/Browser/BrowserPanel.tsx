import { useAtomValue, useSetAtom } from 'jotai';
import { Globe, X } from 'lucide-react';
import { Button } from '@librechat/client';
import { apiBaseUrl } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { toAbsoluteFilePath } from '~/utils';
import { activeBrowserConversationId, browserViewportByConversation } from './state';
import type { BrowserViewport } from './viewport';

export function BrowserPanelView({
  viewport,
  onClose,
}: {
  viewport: BrowserViewport;
  onClose: () => void;
}) {
  const localize = useLocalize();
  const src = toAbsoluteFilePath(viewport.imageUrl, apiBaseUrl());
  const address = viewport.url || localize('com_ui_browser_page');

  return (
    <aside
      id="browser-viewer"
      role="region"
      aria-label={localize('com_ui_browser')}
      className="flex h-full w-full flex-col bg-surface-primary text-text-primary"
    >
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border-light bg-surface-primary-alt p-2">
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <p className="min-w-0 truncate text-sm" title={address}>
            {address}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={onClose}
          aria-label={localize('com_ui_browser_close')}
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 bg-surface-secondary">
        {src ? (
          <img
            src={src}
            alt={address}
            className="size-full object-contain object-top"
          />
        ) : (
          <p className="p-4 text-sm text-text-secondary">{localize('com_ui_browser_empty')}</p>
        )}
      </div>
    </aside>
  );
}

export default function BrowserPanel({ conversationId }: { conversationId: string }) {
  const viewport = useAtomValue(browserViewportByConversation(conversationId));
  const setActive = useSetAtom(activeBrowserConversationId);
  if (viewport == null) {
    return null;
  }
  return <BrowserPanelView viewport={viewport} onClose={() => setActive(null)} />;
}
