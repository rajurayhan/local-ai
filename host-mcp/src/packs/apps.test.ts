import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultConfig } from '../config.ts';
import type { HttpPoster } from '../types.ts';
import { createAppsPack } from './apps.ts';

test('lists hooks and refuses unknown ids', async () => {
  const pack = createAppsPack(defaultConfig({ apps: { hooks: [], timeoutMs: 1000, maxResponseBytes: 100 } }), async () => {
    throw new Error('should not post');
  });
  const list = pack.tools.find((tool) => tool.name === 'list_hooks');
  const trigger = pack.tools.find((tool) => tool.name === 'trigger_hook');
  assert.ok(list);
  assert.ok(trigger);
  const empty = await list.handler({});
  assert.match(empty.content[0].type === 'text' ? empty.content[0].text : '', /No app hooks/);

  const missing = await trigger.handler({ id: 'n8n' });
  assert.equal(missing.isError, true);
});

test('posts only to a configured hook', async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const post: HttpPoster = async (url, options) => {
    calls.push({ url, body: options.body ?? '' });
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

  const list = pack.tools.find((tool) => tool.name === 'list_hooks');
  const trigger = pack.tools.find((tool) => tool.name === 'trigger_hook');
  assert.ok(list);
  assert.ok(trigger);

  const listed = await list.handler({});
  assert.match(listed.content[0].type === 'text' ? listed.content[0].text : '', /n8n: Local n8n/);

  const badJson = await trigger.handler({ id: 'n8n', payload: 'not-json' });
  assert.equal(badJson.isError, true);
  assert.equal(calls.length, 0);

  const ok = await trigger.handler({ id: 'n8n', payload: '{"hello":true}' });
  assert.equal(ok.isError, undefined);
  assert.equal(calls[0]?.url, 'http://127.0.0.1:5678/webhook/demo');
  assert.equal(calls[0]?.body, '{"hello":true}');
});

test('slack_send_message uses the injected Slack API and refuses when unconfigured', async () => {
  const missing = createAppsPack(
    defaultConfig({ apps: { hooks: [], timeoutMs: 1000, maxResponseBytes: 100 } }),
    async () => {
      throw new Error('should not post');
    },
  );
  const send = missing.tools.find((tool) => tool.name === 'slack_send_message');
  assert.ok(send);
  const unset = await send.handler({ to: '#general', text: 'hi' });
  assert.equal(unset.isError, true);

  const pack = createAppsPack(
    defaultConfig({ apps: { hooks: [], slackToken: 'xoxb-test', timeoutMs: 1000, maxResponseBytes: 100 } }),
    async () => {
      throw new Error('should not post');
    },
    {
      lookupByEmail: async () => ({ id: 'U1', name: 'Ada' }),
      openIm: async () => 'D1',
      postMessage: async (channel, text) => `ok ${channel} ${text}`,
    },
  );
  const wired = pack.tools.find((tool) => tool.name === 'slack_send_message');
  assert.ok(wired);
  const sent = await wired.handler({ to: '#general', text: 'shipped' });
  assert.equal(sent.isError, undefined);
  assert.match(sent.content[0].type === 'text' ? sent.content[0].text : '', /ok general shipped/);
});
