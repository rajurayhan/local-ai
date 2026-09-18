import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultConfig } from '../config.ts';
import { createBrowserPack } from './browser.ts';

test('rejects non-http URLs and unknown hosts', async () => {
  const pack = createBrowserPack(
    defaultConfig({ browser: { allowedDomains: ['example.com'], userDataDir: '/tmp/unused' } }),
    async () => {
      throw new Error('session should not start');
    },
  );

  const fileUrl = await pack.tools[0].handler({ url: 'file:///etc/passwd' });
  assert.equal(fileUrl.isError, true);

  const blocked = await pack.tools[0].handler({ url: 'https://evil.test' });
  assert.equal(blocked.isError, true);
  assert.match(blocked.content[0].type === 'text' ? blocked.content[0].text : '', /not allowed/);
});

test('opens an allowed URL through the injected session', async () => {
  const pack = createBrowserPack(
    defaultConfig({ browser: { allowedDomains: ['example.com'], userDataDir: '/tmp/unused' } }),
    async () => ({
      open: async (url) => `opened ${url}`,
      text: async () => 'body',
      click: async (selector) => `clicked ${selector}`,
      fill: async (selector, text) => `filled ${selector} ${text}`,
      links: async () => 'Docs https://example.com/docs',
      screenshot: async () => ({ png: Buffer.from('png'), note: 'shot' }),
    }),
  );

  const opened = await pack.tools[0].handler({ url: 'https://example.com/x' });
  assert.equal(opened.isError, undefined);
  assert.match(opened.content[0].type === 'text' ? opened.content[0].text : '', /example.com/);
  assert.equal(opened.content[1]?.type, 'image');
});

test('click also returns a screenshot of the current page', async () => {
  const pack = createBrowserPack(
    defaultConfig({ browser: { allowedDomains: ['example.com'], userDataDir: '/tmp/unused' } }),
    async () => ({
      open: async () => 'opened',
      text: async () => 'body',
      click: async (selector) => `clicked ${selector}`,
      fill: async (selector, text) => `filled ${selector} ${text}`,
      links: async () => 'Docs https://example.com/docs',
      screenshot: async () => ({ png: Buffer.from('png'), note: 'https://example.com/after' }),
    }),
  );

  await pack.tools[0].handler({ url: 'https://example.com/x' });
  const clicked = await pack.tools[2].handler({ selector: 'a.next' });
  assert.equal(clicked.isError, undefined);
  assert.match(
    clicked.content[0].type === 'text' ? clicked.content[0].text : '',
    /example.com\/after/,
  );
  assert.equal(clicked.content[1]?.type, 'image');
});

test('fills a field and lists links on the open page', async () => {
  const pack = createBrowserPack(
    defaultConfig({ browser: { allowedDomains: ['example.com'], userDataDir: '/tmp/unused' } }),
    async () => ({
      open: async () => 'opened',
      text: async () => 'body',
      click: async () => 'clicked',
      fill: async (selector, text) => `filled ${selector} ${text}`,
      links: async () => 'Docs https://example.com/docs',
      screenshot: async () => ({ png: Buffer.from('png'), note: 'https://example.com/form' }),
    }),
  );

  await pack.tools[0].handler({ url: 'https://example.com/x' });
  const fill = pack.tools.find((tool) => tool.name === 'fill');
  const links = pack.tools.find((tool) => tool.name === 'list_links');
  assert.ok(fill && links);
  const filled = await fill.handler({ selector: 'input[name=q]', text: 'rakaai' });
  assert.match(filled.content[0].type === 'text' ? filled.content[0].text : '', /filled input/);
  const listed = await links.handler({});
  assert.match(
    listed.content[0].type === 'text' ? listed.content[0].text : '',
    /Docs https:\/\/example.com\/docs/,
  );
});
