import fs from 'node:fs';

import type { BrowserSession } from './packs/browser.ts';

export type BrowserSessionOptions = {
  userDataDir: string;
  headless?: boolean;
  timeoutMs?: number;
};

export type PageReader = {
  title: () => Promise<string>;
  innerText: (selector: string) => Promise<string>;
};

type PlaywrightPage = PageReader & {
  goto: (
    url: string,
    options: { waitUntil: 'domcontentloaded'; timeout: number },
  ) => Promise<unknown>;
  click: (selector: string, options: { timeout: number }) => Promise<unknown>;
  fill: (selector: string, value: string, options: { timeout: number }) => Promise<unknown>;
  evaluate: (script: string) => Promise<unknown>;
  screenshot: (options: { type: 'png'; fullPage: boolean }) => Promise<Buffer>;
  url: () => string;
  waitForLoadState?: (
    state: 'load' | 'networkidle',
    options: { timeout: number },
  ) => Promise<unknown>;
};

const LIST_LINKS_SCRIPT = `(() => {
  const lines = [];
  const seen = new Set();
  for (const a of Array.from(document.querySelectorAll('a[href]')).slice(0, 40)) {
    const text = (a.innerText || a.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
    const href = a.href;
    const line = (text || '(link)') + ' ' + href;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines.join('\\n') || '(no links)';
})()`;

type PlaywrightLaunchOptions = {
  headless: boolean;
  viewport: { width: number; height: number };
  locale: string;
  timezoneId: string;
  args: string[];
  ignoreDefaultArgs: string[];
  extraHTTPHeaders: Record<string, string>;
  channel?: 'chrome';
};

type PlaywrightContext = {
  pages: () => PlaywrightPage[];
  newPage: () => Promise<PlaywrightPage>;
  addInitScript: (script: string) => Promise<void>;
};

type PlaywrightChromium = {
  launchPersistentContext: (
    userDataDir: string,
    options: PlaywrightLaunchOptions,
  ) => Promise<PlaywrightContext>;
};

const DEFAULT_TIMEOUT_MS = 45_000;
const VIEWPORT = { width: 1280, height: 720 };
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const STEALTH_INIT = `
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
window.chrome = window.chrome || { runtime: {} };
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
`;
const CHALLENGE_RE =
  /just a moment|attention required|checking your browser|enable javascript and cookies|verify you are (a )?human|cf-browser-verification|challenge-running|unusually high (volume|traffic)|needs to review the security|performing security verification/i;

export const CHALLENGE_STUCK =
  'Page stayed on a bot challenge (Cloudflare or similar). Set browser.headless to false in host-mcp/config.json and retry so the window can pass the check.';
export const FETCH_NEEDS_BROWSER =
  'This page is JavaScript-rendered or behind a bot check. Raw HTTP cannot read it. From host-mcp run: npx playwright install chromium';
export const EMPTY_AFTER_WAIT = 'Page stayed empty after waiting for JavaScript to render.';

export function isChallengeText(value: string): boolean {
  return CHALLENGE_RE.test(value);
}

export function isThinContent(value: string): boolean {
  const text = visibleText(value);
  return text.length < 40 || /^(loading|please wait|…|\.{3})$/i.test(text);
}

function readErrorCode(error: Error): string {
  if (!('code' in error) || typeof error.code !== 'string') {
    return '';
  }
  return error.code;
}

export function isMissingPlaywright(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    readErrorCode(error) === 'ERR_MODULE_NOT_FOUND' ||
    /cannot find (package|module) ['"]playwright['"]/i.test(error.message)
  );
}

export function explainUnreadableHtml(html: string): string | undefined {
  const text = stripTags(html);
  if (isChallengeText(`${html}\n${text}`)) {
    return FETCH_NEEDS_BROWSER;
  }
  if (isThinContent(text) && /<script[\s>]/i.test(html)) {
    return FETCH_NEEDS_BROWSER;
  }
  return undefined;
}

export async function settleVisibleText(
  page: PageReader,
  options: {
    timeoutMs: number;
    intervalMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<string> {
  const intervalMs = options.intervalMs ?? 400;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + options.timeoutMs;
  let lastReady = '';
  let stableHits = 0;

  while (now() < deadline) {
    const title = await page.title().catch(() => '');
    const body = await page.innerText('body').catch(() => '');
    const ready = !isChallengeText(`${title}\n${body}`) && !isThinContent(body);
    if (ready) {
      if (body === lastReady) {
        stableHits += 1;
        if (stableHits >= 2) {
          return visibleText(body);
        }
      } else {
        lastReady = body;
        stableHits = 1;
      }
    } else {
      lastReady = '';
      stableHits = 0;
    }
    await sleep(intervalMs);
  }

  const title = await page.title().catch(() => '');
  const body = await page.innerText('body').catch(() => '');
  if (isChallengeText(`${title}\n${body}`)) {
    throw new Error(CHALLENGE_STUCK);
  }
  if (isThinContent(body)) {
    throw new Error(EMPTY_AFTER_WAIT);
  }
  return visibleText(body);
}

export async function createBrowserSession(
  options: BrowserSessionOptions,
): Promise<BrowserSession> {
  try {
    return await createPlaywrightSession(options);
  } catch (error) {
    if (!isMissingPlaywright(error)) {
      throw error;
    }
    return createFetchSession();
  }
}

async function createPlaywrightSession(options: BrowserSessionOptions): Promise<BrowserSession> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headless = options.headless ?? true;
  const load = Function('return import("playwright")') as () => Promise<{
    chromium: PlaywrightChromium;
  }>;
  const { chromium } = await load();
  fs.mkdirSync(options.userDataDir, { recursive: true });
  const context = await launchContext(chromium, options.userDataDir, headless);
  await context.addInitScript(STEALTH_INIT);
  const page = context.pages()[0] ?? (await context.newPage());

  return {
    open: async (url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page
        .waitForLoadState?.('load', { timeout: Math.min(8_000, timeoutMs) })
        .catch(() => undefined);
      return settleVisibleText(page, { timeoutMs });
    },
    text: async () => settleVisibleText(page, { timeoutMs }),
    click: async (selector) => {
      await page.click(selector, { timeout: Math.min(10_000, timeoutMs) });
      await settleVisibleText(page, { timeoutMs }).catch(() => undefined);
      return `Clicked ${selector}`;
    },
    fill: async (selector, text) => {
      await page.fill(selector, text, { timeout: Math.min(10_000, timeoutMs) });
      return `Filled ${selector}`;
    },
    links: async () => {
      const raw = await page.evaluate(LIST_LINKS_SCRIPT);
      return typeof raw === 'string' && raw.length > 0 ? raw : '(no links)';
    },
    screenshot: async () => ({
      png: await page.screenshot({ type: 'png', fullPage: false }),
      note: page.url(),
    }),
  };
}

async function launchContext(
  chromium: PlaywrightChromium,
  userDataDir: string,
  headless: boolean,
): Promise<PlaywrightContext> {
  const shared: PlaywrightLaunchOptions = {
    headless,
    viewport: VIEWPORT,
    locale: 'en-US',
    timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  };

  try {
    return await chromium.launchPersistentContext(userDataDir, { ...shared, channel: 'chrome' });
  } catch {
    return chromium.launchPersistentContext(userDataDir, shared);
  }
}

export function createFetchSession(load: typeof fetch = fetch): BrowserSession {
  let lastText = '';
  let lastHtml = '';
  return {
    open: async (url) => {
      const response = await load(url, {
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': CHROME_UA,
        },
      });
      const html = await response.text();
      const blocked = explainUnreadableHtml(html);
      if (blocked) {
        throw new Error(blocked);
      }
      lastHtml = html;
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
      throw new Error(
        'Click needs Playwright Chromium. From host-mcp run: npx playwright install chromium',
      );
    },
    fill: async () => {
      throw new Error(
        'Fill needs Playwright Chromium. From host-mcp run: npx playwright install chromium',
      );
    },
    links: async () => {
      if (!lastHtml) {
        throw new Error('No page is open');
      }
      return linksFromHtml(lastHtml);
    },
    screenshot: async () => {
      throw new Error(
        'Screenshots need Playwright Chromium. From host-mcp run: npx playwright install chromium',
      );
    },
  };
}

export function linksFromHtml(html: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const href = match[1]?.trim() ?? '';
    const text = visibleText(stripTags(match[2] ?? ''));
    if (!href || href.startsWith('javascript:')) {
      continue;
    }
    const line = `${text || '(link)'} ${href}`;
    if (seen.has(line)) {
      continue;
    }
    seen.add(line);
    lines.push(line);
    if (lines.length >= 40) {
      break;
    }
  }
  return lines.join('\n') || '(no links)';
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
