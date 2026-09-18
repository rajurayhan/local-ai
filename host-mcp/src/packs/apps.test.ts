import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultConfig } from '../config.ts';
import type { SlackApi } from '../slack.ts';
import type { HttpPoster } from '../types.ts';
import { createAppsPack } from './apps.ts';

function fakeSlack(over: Partial<SlackApi> = {}): SlackApi {
  return {
    lookupByEmail: async () => ({
      id: 'U1',
      name: 'ada',
      realName: 'Ada',
      deleted: false,
      bot: false,
    }),
    listUsers: async (options = {}) => ({
      users: [
        {
          id: 'U1',
          name: 'ada',
          realName: 'Ada Lovelace',
          email: 'ada@example.com',
          deleted: false,
          bot: false,
        },
      ],
      nextCursor: options.limit === 200 ? undefined : 'more',
    }),
    searchUsers: async () => [
      {
        id: 'U1',
        name: 'ada',
        realName: 'Ada Lovelace',
        email: 'ada@example.com',
        deleted: false,
        bot: false,
      },
    ],
    listChannels: async () => ({
      channels: [{ id: 'C1', name: 'general', private: false, member: true }],
    }),
    searchChannels: async () => [{ id: 'C1', name: 'general', private: false, member: true }],
    openIm: async () => 'D1',
    history: async () => [{ ts: '1.0', user: 'U1', text: 'shipped' }],
    postMessage: async (channel, text) => `ok ${channel} ${text}`,
    ...over,
  };
}

test('lists hooks and refuses unknown ids', async () => {
  const pack = createAppsPack(
    defaultConfig({ apps: { hooks: [], timeoutMs: 1000, maxResponseBytes: 100 } }),
    async () => {
      throw new Error('should not post');
    },
  );
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

test('slack tools use the injected Slack API and refuse when the user token is missing', async () => {
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

  const slack = fakeSlack();
  const pack = createAppsPack(
    defaultConfig({
      apps: { hooks: [], slackUserToken: 'xoxp-test', timeoutMs: 1000, maxResponseBytes: 100 },
    }),
    async () => {
      throw new Error('should not post');
    },
    { asUser: slack, directory: slack },
  );
  const wired = pack.tools.find((tool) => tool.name === 'slack_send_message');
  const read = pack.tools.find((tool) => tool.name === 'slack_read_messages');
  const users = pack.tools.find((tool) => tool.name === 'slack_list_users');
  const search = pack.tools.find((tool) => tool.name === 'slack_search_users');
  const channels = pack.tools.find((tool) => tool.name === 'slack_list_channels');
  assert.ok(wired && read && users && search && channels);
  const sent = await wired.handler({ to: '#general', text: 'shipped' });
  assert.equal(sent.isError, undefined);
  assert.match(sent.content[0].type === 'text' ? sent.content[0].text : '', /ok general shipped/);
  const mentioned = await wired.handler({ to: '#general', text: 'hey @Ada' });
  assert.equal(mentioned.isError, undefined);
  assert.match(
    mentioned.content[0].type === 'text' ? mentioned.content[0].text : '',
    /ok general hey <@U1>/,
  );
  const listed = await users.handler({ limit: '200' });
  assert.match(listed.content[0].type === 'text' ? listed.content[0].text : '', /Ada Lovelace/);
  assert.doesNotMatch(
    listed.content[0].type === 'text' ? listed.content[0].text : '',
    /next_cursor/,
  );
  const found = await search.handler({ query: 'ada' });
  assert.match(found.content[0].type === 'text' ? found.content[0].text : '', /U1/);
  const channelList = await channels.handler({ query: 'gen' });
  assert.match(
    channelList.content[0].type === 'text' ? channelList.content[0].text : '',
    /#general/,
  );
  const history = await read.handler({ to: '#general' });
  assert.match(history.content[0].type === 'text' ? history.content[0].text : '', /U1 1.0/);
  const reply = await wired.handler({ to: '#general', text: 'ack', thread: '1.0' });
  assert.equal(reply.isError, undefined);
});
