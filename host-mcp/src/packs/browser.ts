import { assertHttpUrl } from '../hosts.ts';
import { fail, objectSchema, ok } from '../result.ts';
import type { DeviceConfig, PackDraft, ToolResult } from '../types.ts';

export type BrowserSession = {
  open: (url: string) => Promise<string>;
  text: () => Promise<string>;
  click: (selector: string) => Promise<string>;
  screenshot: () => Promise<{ png: Buffer; note: string }>;
};

export type BrowserFactory = () => Promise<BrowserSession>;

export function createBrowserPack(config: DeviceConfig, createSession: BrowserFactory): PackDraft {
  let session: BrowserSession | null = null;

  const ensureSession = async (): Promise<BrowserSession> => {
    session ??= await createSession();
    return session;
  };

  return {
    name: 'browser',
    tools: [
      {
        name: 'open_page',
        description:
          'Open an http(s) page in the isolated browser, wait for JavaScript and bot checks, and return visible text.',
        inputSchema: objectSchema(
          {
            url: { type: 'string', description: 'http or https URL' },
          },
          ['url'],
        ),
        handler: async (args) => {
          try {
            const url = assertHttpUrl(String(args.url), config.browser.allowedDomains);
            const browser = await ensureSession();
            const text = await browser.open(url.toString());
            return ok(text);
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not open page');
          }
        },
      },
      {
        name: 'page_text',
        description: 'Read visible text from the page already opened with open_page.',
        inputSchema: objectSchema({}),
        handler: async () => {
          try {
            if (session == null) {
              return fail('No page is open. Call open_page first.');
            }
            return ok(await session.text());
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not read page');
          }
        },
      },
      {
        name: 'click',
        description: 'Click a CSS selector on the open page.',
        inputSchema: objectSchema(
          {
            selector: { type: 'string', description: 'CSS selector' },
          },
          ['selector'],
        ),
        handler: async (args) => {
          try {
            if (session == null) {
              return fail('No page is open. Call open_page first.');
            }
            return ok(await session.click(String(args.selector)));
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Click failed');
          }
        },
      },
      {
        name: 'capture_page',
        description: 'Screenshot the open page.',
        inputSchema: objectSchema({}),
        handler: async (): Promise<ToolResult> => {
          try {
            if (session == null) {
              return fail('No page is open. Call open_page first.');
            }
            const shot = await session.screenshot();
            return {
              content: [
                { type: 'text', text: shot.note },
                { type: 'image', data: shot.png.toString('base64'), mimeType: 'image/png' },
              ],
            };
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Screenshot failed');
          }
        },
      },
    ],
  };
}
