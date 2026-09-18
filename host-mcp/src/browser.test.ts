import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CHALLENGE_STUCK,
  EMPTY_AFTER_WAIT,
  FETCH_NEEDS_BROWSER,
  createFetchSession,
  explainUnreadableHtml,
  isChallengeText,
  isMissingPlaywright,
  isThinContent,
  settleVisibleText,
} from './browser.ts';

test('detects Cloudflare and similar challenge copy', () => {
  assert.equal(isChallengeText('Just a moment...'), true);
  assert.equal(isChallengeText('Checking your browser before accessing example.com'), true);
  assert.equal(isChallengeText('Attention Required! | Cloudflare'), true);
  assert.equal(isChallengeText('Verify you are human'), true);
  assert.equal(isChallengeText('Welcome to the product docs'), false);
});

test('treats short or empty bodies as unrendered', () => {
  assert.equal(isThinContent(''), true);
  assert.equal(isThinContent('Loading'), true);
  assert.equal(isThinContent('A full article about how the dashboard hydrates after the app bundle loads.'), false);
});

test('raw HTML from a challenge or empty SPA needs a real browser', () => {
  assert.equal(
    explainUnreadableHtml('<html><title>Just a moment...</title><body>Checking your browser</body></html>'),
    FETCH_NEEDS_BROWSER,
  );
  assert.equal(
    explainUnreadableHtml('<html><body><div id="root"></div><script src="/app.js"></script></body></html>'),
    FETCH_NEEDS_BROWSER,
  );
  assert.equal(
    explainUnreadableHtml('<html><body><p>Hello from a static page with enough text to keep.</p></body></html>'),
    undefined,
  );
});

test('settleVisibleText waits out a Cloudflare interstitial then hydrating copy', async () => {
  let n = 0;
  const page = {
    title: async () => (n < 3 ? 'Just a moment...' : 'Docs'),
    innerText: async () => {
      n += 1;
      if (n < 3) {
        return 'Checking your browser before accessing the site.';
      }
      return 'Welcome to the documentation home page with enough rendered text.';
    },
  };
  let t = 0;
  const text = await settleVisibleText(page, {
    timeoutMs: 5_000,
    intervalMs: 1,
    now: () => t,
    sleep: async () => {
      t += 100;
    },
  });
  assert.match(text, /Welcome to the documentation/);
});

test('settleVisibleText throws when the challenge never clears', async () => {
  const page = {
    title: async () => 'Just a moment...',
    innerText: async () => 'Checking your browser before accessing the site.',
  };
  let t = 0;
  await assert.rejects(
    () =>
      settleVisibleText(page, {
        timeoutMs: 200,
        intervalMs: 1,
        now: () => t,
        sleep: async () => {
          t += 100;
        },
      }),
    (error: unknown) => error instanceof Error && error.message === CHALLENGE_STUCK,
  );
});

test('settleVisibleText throws when JavaScript never paints content', async () => {
  const page = {
    title: async () => 'App',
    innerText: async () => '',
  };
  let t = 0;
  await assert.rejects(
    () =>
      settleVisibleText(page, {
        timeoutMs: 200,
        intervalMs: 1,
        now: () => t,
        sleep: async () => {
          t += 100;
        },
      }),
    (error: unknown) => error instanceof Error && error.message === EMPTY_AFTER_WAIT,
  );
});

test('fetch session refuses challenge HTML and returns static text', async () => {
  const blocked = createFetchSession(async () => new Response('<title>Just a moment...</title>', { status: 403 }));
  await assert.rejects(() => blocked.open('https://example.com'), (error: unknown) => {
    return error instanceof Error && error.message === FETCH_NEEDS_BROWSER;
  });

  const ok = createFetchSession(
    async () => new Response('<html><body><p>Hello from a static page with enough text to keep.</p></body></html>'),
  );
  assert.match(await ok.open('https://example.com'), /Hello from a static page/);
});

test('isMissingPlaywright recognizes a failed dynamic import', () => {
  const missing = Object.assign(new Error("Cannot find package 'playwright'"), { code: 'ERR_MODULE_NOT_FOUND' });
  assert.equal(isMissingPlaywright(missing), true);
  assert.equal(isMissingPlaywright(new Error('Executable does not exist')), false);
});
