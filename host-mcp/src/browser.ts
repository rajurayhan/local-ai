import fs from 'node:fs';

import type { BrowserSession } from './packs/browser.ts';

type PlaywrightPage = {
  goto: (url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }) => Promise<unknown>;
  innerText: (selector: string) => Promise<string>;
  click: (selector: string, options: { timeout: number }) => Promise<unknown>;
  screenshot: (options: { type: 'png'; fullPage: boolean }) => Promise<Buffer>;
  url: () => string;
};

type PlaywrightChromium = {
  launchPersistentContext: (
    userDataDir: string,
    options: { headless: boolean; viewport: { width: number; height: number } },
  ) => Promise<{
    pages: () => PlaywrightPage[];
    newPage: () => Promise<PlaywrightPage>;
  }>;
};

export async function createBrowserSession(userDataDir: string): Promise<BrowserSession> {
  try {
    return await createPlaywrightSession(userDataDir);
  } catch {
    return createFetchSession();
  }
}

async function createPlaywrightSession(userDataDir: string): Promise<BrowserSession> {
  const load = Function('return import("playwright")') as () => Promise<{ chromium: PlaywrightChromium }>;
  const { chromium } = await load();
  fs.mkdirSync(userDataDir, { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  return {
    open: async (url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      return visibleText(await page.innerText('body').catch(() => ''));
    },
    text: async () => visibleText(await page.innerText('body').catch(() => '')),
    click: async (selector) => {
      await page.click(selector, { timeout: 10_000 });
      return `Clicked ${selector}`;
    },
    screenshot: async () => ({
      png: await page.screenshot({ type: 'png', fullPage: false }),
      note: page.url(),
    }),
  };
}

export function createFetchSession(): BrowserSession {
  let lastText = '';
  return {
    open: async (url) => {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();
      lastText = visibleText(stripTags(html));
      return lastText;
    },
    text: async () => {
      if (!lastText) {
        throw new Error('No page is open');
      }
      return lastText;
    },
    click: async () => {
      throw new Error('Click needs Playwright Chromium. From host-mcp run: npx playwright install chromium');
    },
    screenshot: async () => {
      throw new Error(
        'Screenshots need Playwright Chromium. From host-mcp run: npx playwright install chromium',
      );
    },
  };
}

function stripTags(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function visibleText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 8000);
}
