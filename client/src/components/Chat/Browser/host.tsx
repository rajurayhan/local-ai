import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

type BrowserHost = {
  conversationId: string;
};

const BrowserHostContext = createContext<BrowserHost | null>(null);

export function BrowserHostProvider({
  conversationId,
  children,
}: {
  conversationId?: string | null;
  children: ReactNode;
}) {
  const value = useMemo<BrowserHost>(
    () => ({ conversationId: conversationId ?? '' }),
    [conversationId],
  );
  return <BrowserHostContext.Provider value={value}>{children}</BrowserHostContext.Provider>;
}

export function useBrowserHost(): BrowserHost | null {
  return useContext(BrowserHostContext);
}
