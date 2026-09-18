import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HttpPoster } from './types.ts';
import type { SlackApi } from './slack.ts';
import { classifySlackTo, createSlackApi, resolveSlackMentions, sendSlackMessage, slackPersonMatches } from './slack.ts';

function fakeSlack(over: Partial<SlackApi> = {}): SlackApi {
  return {
    lookupByEmail: async () => {
      throw new Error('should not lookup');
    },
    listUsers: async () => ({ users: [] }),
    searchUsers: async () => [],
    listChannels: async () => ({ channels: [] }),
    searchChannels: async () => [],
    openIm: async () => {
      throw new Error('should not open');
    },
    postMessage: async (channel, text) => `Sent as you to ${channel}:${text}`,
    ...over,
  };
}

test('classifies Slack destinations', () => {
  assert.deepEqual(classifySlackTo('#general'), { kind: 'channel', value: 'general' });
  assert.deepEqual(classifySlackTo('U012ABC'), { kind: 'user', value: 'U012ABC' });
  assert.deepEqual(classifySlackTo('ada@example.com'), { kind: 'email', value: 'ada@example.com' });
  assert.throws(() => classifySlackTo('Ada Lovelace'), /#channel/);
});

test('sends to a channel without opening a DM', async () => {
  const calls: string[] = [];
  const result = await sendSlackMessage(
    fakeSlack({
      postMessage: async (channel, text) => {
        calls.push(`${channel}:${text}`);
        return `Sent as you to ${channel}`;
      },
    }),
    '#alerts',
    'hello',
  );
  assert.equal(result, 'Sent as you to alerts');
  assert.deepEqual(calls, ['alerts:hello']);
});

test('resolves a unique person name before sending', async () => {
  const result = await sendSlackMessage(
    fakeSlack({
      searchUsers: async () => [
        { id: 'U9', name: 'ada', realName: 'Ada Lovelace', deleted: false, bot: false },
      ],
      openIm: async (userId) => `D-${userId}`,
      postMessage: async (channel, text) => `${channel}:${text}`,
    }),
    'Ada Lovelace',
    'ping',
  );
  assert.equal(result, 'D-U9:ping');
});

test('looks up email then opens a DM', async () => {
  const result = await sendSlackMessage(
    fakeSlack({
      lookupByEmail: async (email) => ({
        id: 'U9',
        name: email,
        realName: email,
        email,
        deleted: false,
        bot: false,
      }),
      openIm: async (userId) => `D-${userId}`,
      postMessage: async (channel, text) => `${channel}:${text}`,
    }),
    'ada@example.com',
    'ping',
  );
  assert.equal(result, 'D-U9:ping');
});

test('matches Slack people on handle, display name, and multi-word names', () => {
  const person = {
    id: 'U2',
    name: 'ada.lovelace',
    realName: 'Ada Lovelace',
    displayName: 'The Countess',
    email: 'ada@example.com',
    deleted: false,
    bot: false,
  };
  assert.equal(slackPersonMatches(person, '@ada.lovelace'), true);
  assert.equal(slackPersonMatches(person, 'Countess'), true);
  assert.equal(slackPersonMatches(person, 'Ada Lovelace'), true);
  assert.equal(slackPersonMatches(person, 'nobody'), false);
});

test('createSlackApi reports a truncated users.list body', async () => {
  const post: HttpPoster = async () => ({
    status: 200,
    body: '{"ok":true,"members":[',
    truncated: true,
  });
  const slack = createSlackApi('xoxp-test', post, 1000, 100);
  await assert.rejects(() => slack.listUsers(), /truncated/);
});

test('createSlackApi lists and searches people through HTTP', async () => {
  const post: HttpPoster = async (url) => {
    if (url.includes('users.list')) {
      return {
        status: 200,
        body: JSON.stringify({
          ok: true,
          members: [
            {
              id: 'U2',
              name: 'ada',
              real_name: 'Ada Lovelace',
              profile: { email: 'ada@example.com', display_name: 'Ada' },
            },
            { id: 'B1', name: 'bot', is_bot: true },
          ],
        }),
      };
    }
    return { status: 200, body: JSON.stringify({ ok: false, error: 'unexpected' }) };
  };

  const slack = createSlackApi('xoxp-test', post, 1000, 4000);
  const listed = await slack.listUsers();
  assert.equal(listed.users.length, 1);
  assert.equal(listed.users[0]?.id, 'U2');
  const found = await slack.searchUsers('@Ada');
  assert.equal(found[0]?.email, 'ada@example.com');
});

test('createSlackApi search walks later user pages', async () => {
  let pages = 0;
  const post: HttpPoster = async (url) => {
    pages += 1;
    if (url.includes('cursor=')) {
      return {
        status: 200,
        body: JSON.stringify({
          ok: true,
          members: [{ id: 'U9', name: 'grace', real_name: 'Grace Hopper', profile: { display_name: 'Amazing Grace' } }],
        }),
      };
    }
    return {
      status: 200,
      body: JSON.stringify({
        ok: true,
        members: [{ id: 'U1', name: 'other', real_name: 'Other Person' }],
        response_metadata: { next_cursor: 'page2' },
      }),
    };
  };

  const slack = createSlackApi('xoxp-test', post, 1000, 4000);
  const found = await slack.searchUsers('Amazing Grace');
  assert.equal(found[0]?.id, 'U9');
  assert.equal(pages, 2);
});

test('rewrites a unique @name mention before sending', async () => {
  const queries: string[] = [];
  const result = await sendSlackMessage(
    fakeSlack({
      searchUsers: async (query) => {
        queries.push(query);
        return [{ id: 'U9', name: 'ada', realName: 'Ada Lovelace', deleted: false, bot: false }];
      },
      postMessage: async (channel, text) => `${channel}:${text}`,
    }),
    '#alerts',
    'Thanks @Ada.',
  );
  assert.equal(result, 'alerts:Thanks <@U9>.');
  assert.deepEqual(queries, ['Ada']);
});

test('resolveSlackMentions leaves plain text and emails alone', async () => {
  const slack = fakeSlack({
    searchUsers: async () => {
      throw new Error('should not search');
    },
  });
  assert.equal(await resolveSlackMentions(slack, 'shipped to ada@example.com'), 'shipped to ada@example.com');
  assert.equal(await resolveSlackMentions(slack, 'already <@U9> mentioned'), 'already <@U9> mentioned');
});

test('resolveSlackMentions converts a Slack user id mention without searching', async () => {
  const slack = fakeSlack({
    searchUsers: async () => {
      throw new Error('should not search');
    },
  });
  assert.equal(await resolveSlackMentions(slack, 'see @U012ABC'), 'see <@U012ABC>');
});

test('resolveSlackMentions searches a dotted handle once when repeated', async () => {
  let searches = 0;
  const slack = fakeSlack({
    searchUsers: async (query) => {
      searches += 1;
      assert.equal(query, 'ada.lovelace');
      return [{ id: 'U2', name: 'ada.lovelace', realName: 'Ada Lovelace', deleted: false, bot: false }];
    },
  });
  assert.equal(
    await resolveSlackMentions(slack, 'cc @ada.lovelace and @Ada.Lovelace'),
    'cc <@U2> and <@U2>',
  );
  assert.equal(searches, 1);
});

test('resolveSlackMentions refuses broadcast mentions', async () => {
  const slack = fakeSlack();
  await assert.rejects(() => resolveSlackMentions(slack, 'heads up @here'), /broadcast mention/);
  await assert.rejects(() => resolveSlackMentions(slack, 'see <!channel>'), /Broadcast mentions/);
  await assert.rejects(() => resolveSlackMentions(slack, 'ping @everyone'), /broadcast mention/);
});

test('resolveSlackMentions refuses missing and ambiguous names', async () => {
  await assert.rejects(
    () =>
      resolveSlackMentions(
        fakeSlack({
          searchUsers: async () => [],
        }),
        'hey @Nobody',
      ),
    /No Slack user matched @Nobody/,
  );
  await assert.rejects(
    () =>
      resolveSlackMentions(
        fakeSlack({
          searchUsers: async () => [
            { id: 'U1', name: 'ada', realName: 'Ada Lovelace', deleted: false, bot: false },
            { id: 'U2', name: 'ada2', realName: 'Ada Byron', deleted: false, bot: false },
          ],
        }),
        'hey @Ada',
      ),
    /Several people match @Ada/,
  );
});

test('does not send when a mention cannot be resolved', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () =>
      sendSlackMessage(
        fakeSlack({
          searchUsers: async () => [],
          postMessage: async (channel, text) => {
            calls.push(`${channel}:${text}`);
            return 'sent';
          },
        }),
        '#alerts',
        'hey @Nobody',
      ),
    /No Slack user matched @Nobody/,
  );
  assert.deepEqual(calls, []);
});

test('createSlackApi looks up email then posts through HTTP', async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const post: HttpPoster = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body });
    if (url.includes('users.lookupByEmail')) {
      return {
        status: 200,
        body: JSON.stringify({ ok: true, user: { id: 'U2', name: 'ada', real_name: 'Ada' } }),
      };
    }
    if (url.includes('conversations.open')) {
      return { status: 200, body: JSON.stringify({ ok: true, channel: { id: 'D2' } }) };
    }
    return { status: 200, body: JSON.stringify({ ok: true, ts: '1.2' }) };
  };

  const slack = createSlackApi('xoxp-test', post, 1000, 1000);
  const result = await sendSlackMessage(slack, 'ada@example.com', 'hello');
  assert.equal(result, 'Sent as you to D2 (1.2)');
  assert.equal(calls[0]?.method, 'GET');
  assert.match(calls[0]?.url ?? '', /users\.lookupByEmail\?email=ada%40example.com/);
  assert.equal(calls[1]?.method, 'POST');
  assert.match(calls[1]?.url ?? '', /conversations\.open$/);
  assert.equal(calls[2]?.method, 'POST');
  assert.match(calls[2]?.url ?? '', /chat\.postMessage$/);
});
