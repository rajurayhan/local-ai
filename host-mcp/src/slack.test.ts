import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HttpPoster } from './types.ts';
import type { SlackApi } from './slack.ts';
import { classifySlackTo, createSlackApi, sendSlackMessage } from './slack.ts';

test('classifies Slack destinations', () => {
  assert.deepEqual(classifySlackTo('#general'), { kind: 'channel', value: 'general' });
  assert.deepEqual(classifySlackTo('U012ABC'), { kind: 'user', value: 'U012ABC' });
  assert.deepEqual(classifySlackTo('ada@example.com'), { kind: 'email', value: 'ada@example.com' });
  assert.throws(() => classifySlackTo('Ada Lovelace'), /#channel/);
});

test('sends to a channel without opening a DM', async () => {
  const calls: string[] = [];
  const slack: SlackApi = {
    lookupByEmail: async () => {
      throw new Error('should not lookup');
    },
    openIm: async () => {
      throw new Error('should not open');
    },
    postMessage: async (channel, text) => {
      calls.push(`${channel}:${text}`);
      return `Sent to ${channel}`;
    },
  };

  const result = await sendSlackMessage(slack, '#alerts', 'hello');
  assert.equal(result, 'Sent to alerts');
  assert.deepEqual(calls, ['alerts:hello']);
});

test('looks up email then opens a DM', async () => {
  const slack: SlackApi = {
    lookupByEmail: async (email) => ({ id: 'U9', name: email }),
    openIm: async (userId) => `D-${userId}`,
    postMessage: async (channel, text) => `${channel}:${text}`,
  };

  const result = await sendSlackMessage(slack, 'ada@example.com', 'ping');
  assert.equal(result, 'D-U9:ping');
});

test('createSlackApi looks up email then posts through HTTP', async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const post: HttpPoster = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body });
    if (url.includes('users.lookupByEmail')) {
      return { status: 200, body: JSON.stringify({ ok: true, user: { id: 'U2', name: 'ada' } }) };
    }
    if (url.includes('conversations.open')) {
      return { status: 200, body: JSON.stringify({ ok: true, channel: { id: 'D2' } }) };
    }
    return { status: 200, body: JSON.stringify({ ok: true, ts: '1.2' }) };
  };

  const slack = createSlackApi('xoxb-test', post, 1000, 1000);
  const result = await sendSlackMessage(slack, 'ada@example.com', 'hello');
  assert.equal(result, 'Sent to D2 (1.2)');
  assert.equal(calls[0]?.method, 'GET');
  assert.match(calls[0]?.url ?? '', /users\.lookupByEmail\?email=ada%40example.com/);
  assert.equal(calls[1]?.method, 'POST');
  assert.match(calls[1]?.url ?? '', /conversations\.open$/);
  assert.equal(calls[2]?.method, 'POST');
  assert.match(calls[2]?.url ?? '', /chat\.postMessage$/);
});
