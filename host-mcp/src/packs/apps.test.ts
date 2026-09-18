import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultConfig } from '../config.ts';
import type { HttpPoster } from '../types.ts';
import { createAppsPack } from './apps.ts';

test('lists hooks and refuses unknown ids', async () => {
  const pack = createAppsPack(defaultConfig({ apps: { hooks: [], timeoutMs: 1000, maxResponseBytes: 100 } }), async () => {
    throw new Error('should not post');
  });
  const empty = await pack.tools[0].handler({});
  assert.match(empty.content[0].type === 'text' ? empty.content[0].text : '', /No app hooks/);

  const missing = await pack.tools[1].handler({ id: 'n8n' });
  assert.equal(missing.isError, true);
});

test('posts only to a configured hook', async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const post: HttpPoster = async (url, options) => {
    calls.push({ url, body: options.body });
    return { status: 200, body: '{"ok":true}' };
  };
  const pack = createAppsPack(
    defaultConfig({
      apps: {
        hooks: [{ id: 'n8n', name: 'Local n8n', url: 'http://127.0.0.1:5678/webhook/demo' }],
        timeoutMs: 1000,
        maxResponseBytes: 100,
      },
    }),
    post,
  );

  const listed = await pack.tools[0].handler({});
  assert.match(listed.content[0].type === 'text' ? listed.content[0].text : '', /n8n: Local n8n/);

  const badJson = await pack.tools[1].handler({ id: 'n8n', payload: 'not-json' });
  assert.equal(badJson.isError, true);
  assert.equal(calls.length, 0);

  const ok = await pack.tools[1].handler({ id: 'n8n', payload: '{"hello":true}' });
  assert.equal(ok.isError, undefined);
  assert.equal(calls[0]?.url, 'http://127.0.0.1:5678/webhook/demo');
  assert.equal(calls[0]?.body, '{"hello":true}');
});
