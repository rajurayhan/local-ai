import React from 'react';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const mockTranslations: Record<string, string> = {
  com_ui_privacy_policy: 'Privacy policy',
  com_ui_privacy_policy_content: 'We collect account and conversation data.\n\nSee the [Terms of Service](/terms).',
  com_ui_terms_of_service: 'Terms of service',
  com_ui_terms_of_service_content: 'You agree to use RakaAI lawfully.\n\nSee the [Privacy Policy](/privacy).',
  com_ui_legal_last_updated: 'Last updated September 18, 2026',
  com_ui_logo: '{{0}} Logo',
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => mockTranslations[key] ?? key,
  useDocumentTitle: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { appTitle: 'RakaAI' } }),
}));

jest.mock('@librechat/client', () => ({
  ThemeSelector: () => <div data-testid="theme-selector" />,
}));

import LegalPage from '../Page';

function renderLegal(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/privacy', element: <LegalPage /> },
      { path: '/terms', element: <LegalPage /> },
    ],
    { initialEntries: [path] },
  );

  return render(<RouterProvider router={router} />);
}

describe('LegalPage', () => {
  it('renders the privacy policy', () => {
    renderLegal('/privacy');

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument();
    expect(screen.getByText('We collect account and conversation data.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  });

  it('renders the terms of service', () => {
    renderLegal('/terms');

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeInTheDocument();
    expect(screen.getByText('You agree to use RakaAI lawfully.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});
