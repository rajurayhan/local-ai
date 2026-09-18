import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserPanelView } from './BrowserPanel';
import type { BrowserViewport } from './viewport';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_browser: 'Browser',
      com_ui_browser_close: 'Close browser',
      com_ui_browser_empty: 'Waiting for the page to render',
      com_ui_browser_page: 'Page',
    };
    return translations[key] ?? key;
  },
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  apiBaseUrl: () => 'http://localhost:3080',
}));

jest.mock('~/utils', () => ({
  toAbsoluteFilePath: (path: string) => `http://localhost:3080${path}`,
}));

const viewport: BrowserViewport = {
  conversationId: 'c1',
  url: 'https://example.com/docs',
  imageUrl: '/images/page.png',
  fileId: 'file-1',
};

describe('BrowserPanelView', () => {
  it('shows the page URL and screenshot', () => {
    render(<BrowserPanelView viewport={viewport} onClose={jest.fn()} />);

    expect(screen.getByRole('region', { name: 'Browser' })).toBeInTheDocument();
    expect(screen.getByText('https://example.com/docs')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'https://example.com/docs' })).toHaveAttribute(
      'src',
      'http://localhost:3080/images/page.png',
    );
  });

  it('closes from the header button', () => {
    const onClose = jest.fn();
    render(<BrowserPanelView viewport={viewport} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close browser' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
