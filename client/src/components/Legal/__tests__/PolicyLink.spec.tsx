import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PolicyLink from '../PolicyLink';

describe('PolicyLink', () => {
  it('uses a router link for in-app hrefs', () => {
    render(
      <MemoryRouter>
        <PolicyLink href="/privacy">Privacy policy</PolicyLink>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Privacy policy' })).not.toHaveAttribute('target');
  });

  it('uses a plain anchor for external hrefs', () => {
    render(
      <MemoryRouter>
        <PolicyLink href="https://example.com/privacy">Privacy policy</PolicyLink>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Privacy policy' });
    expect(link).toHaveAttribute('href', 'https://example.com/privacy');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});
