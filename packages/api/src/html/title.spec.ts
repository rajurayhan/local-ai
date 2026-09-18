import { injectAppTitle, resolveAppTitle, DEFAULT_APP_TITLE } from './title';
import { applyCspNonce } from '~/security/csp';

const SHELL =
  '<!DOCTYPE html><html><head><title>LibreChat</title></head>' +
  '<body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>';

const titleOf = (html: string): string | undefined => {
  const match = /<title>([^<]*)<\/title>/.exec(html);
  return match?.[1];
};

const appTitleOf = (html: string): string | undefined => {
  const match = /"appTitle":"([^"]*)"/.exec(html);
  return match?.[1];
};

describe('injectAppTitle', () => {
  it('defaults the brand when APP_TITLE is unset', () => {
    expect(resolveAppTitle(undefined)).toBe(DEFAULT_APP_TITLE);
    expect(resolveAppTitle('')).toBe(DEFAULT_APP_TITLE);
    expect(resolveAppTitle('   ')).toBe(DEFAULT_APP_TITLE);
  });

  it('replaces a leftover LibreChat title with the deployment brand', () => {
    const html = injectAppTitle(SHELL);

    expect(titleOf(html)).toBe('RakaAI');
    expect(appTitleOf(html)).toBe('RakaAI');
    expect(html).not.toContain('<title>LibreChat</title>');
  });

  it('uses a configured APP_TITLE', () => {
    const html = injectAppTitle(SHELL, 'Acme Chat');

    expect(titleOf(html)).toBe('Acme Chat');
    expect(appTitleOf(html)).toBe('Acme Chat');
  });

  it('escapes markup in a title so it cannot close the tag', () => {
    const html = injectAppTitle(SHELL, 'A <script>alert(1)</script> title');

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(titleOf(html)).toBe('A &lt;script&gt;alert(1)&lt;/script&gt; title');
  });

  it('places the answer ahead of the app that reads it', () => {
    const html = injectAppTitle(SHELL, 'RakaAI');

    expect(html).toContain('window.__LIBRECHAT_CONFIG__');
    expect(html.indexOf('appTitle')).toBeLessThan(html.indexOf('/assets/index.js'));
  });

  it('takes the nonce a strict CSP requires to run it', () => {
    const html = applyCspNonce(injectAppTitle(SHELL, 'RakaAI'), 'abc123');

    expect(html).toContain('<script nonce="abc123" data-librechat-app-title="true">');
  });

  it('does not stack a second copy on a shell that already carries the answer', () => {
    const once = injectAppTitle(SHELL, 'RakaAI');

    expect(injectAppTitle(once, 'RakaAI')).toBe(once);
  });
});
