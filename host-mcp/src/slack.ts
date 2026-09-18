import type { HttpPoster } from './types.ts';

export type SlackTarget =
  | { kind: 'channel'; value: string }
  | { kind: 'user'; value: string }
  | { kind: 'email'; value: string };

export type SlackPerson = {
  id: string;
  name: string;
  realName: string;
  email?: string;
  deleted: boolean;
  bot: boolean;
};

export type SlackChannel = {
  id: string;
  name: string;
  private: boolean;
  member: boolean;
};

export type SlackUserPage = {
  users: SlackPerson[];
  nextCursor?: string;
};

export type SlackChannelPage = {
  channels: SlackChannel[];
  nextCursor?: string;
};

export type SlackApi = {
  lookupByEmail: (email: string) => Promise<SlackPerson>;
  listUsers: (options?: { cursor?: string; limit?: number }) => Promise<SlackUserPage>;
  searchUsers: (query: string) => Promise<SlackPerson[]>;
  listChannels: (options?: { cursor?: string; limit?: number }) => Promise<SlackChannelPage>;
  searchChannels: (query: string) => Promise<SlackChannel[]>;
  openIm: (userId: string) => Promise<string>;
  postMessage: (channel: string, text: string) => Promise<string>;
};

type SlackMember = {
  id?: string;
  name?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: { email?: string; display_name?: string; real_name?: string };
};

type SlackConversation = {
  id?: string;
  name?: string;
  is_private?: boolean;
  is_member?: boolean;
  is_archived?: boolean;
};

type SlackResult = {
  ok: boolean;
  error?: string;
  user?: SlackMember;
  channel?: string | { id?: string };
  ts?: string;
  members?: SlackMember[];
  channels?: SlackConversation[];
  response_metadata?: { next_cursor?: string };
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function classifySlackTo(raw: string): SlackTarget {
  const value = raw.trim();
  if (value.length === 0) {
    throw new Error('to is required');
  }
  if (value.startsWith('#')) {
    return { kind: 'channel', value: value.slice(1) };
  }
  if (/^[CGD][A-Z0-9]+$/i.test(value)) {
    return { kind: 'channel', value };
  }
  if (/^[UW][A-Z0-9]+$/i.test(value)) {
    return { kind: 'user', value };
  }
  if (EMAIL.test(value)) {
    return { kind: 'email', value };
  }
  throw new Error('Send to a #channel, a Slack user id, or an email address');
}

function toPerson(member: SlackMember): SlackPerson | undefined {
  if (!member.id || member.deleted === true || member.is_bot === true) {
    return undefined;
  }
  const realName = member.profile?.real_name || member.real_name || member.profile?.display_name || member.name || member.id;
  const email = member.profile?.email?.trim();
  return {
    id: member.id,
    name: member.name || member.profile?.display_name || member.id,
    realName,
    email: email && email.length > 0 ? email : undefined,
    deleted: false,
    bot: false,
  };
}

function personHaystack(person: SlackPerson): string {
  return [person.id, person.name, person.realName, person.email ?? ''].join(' ').toLowerCase();
}

function formatPeople(users: SlackPerson[]): string {
  if (users.length === 0) {
    return 'No people matched.';
  }
  return users
    .map((person) =>
      [person.id, person.realName, `@${person.name}`, person.email ?? ''].filter((part) => part.length > 0).join(' · '),
    )
    .join('\n');
}

function formatChannels(channels: SlackChannel[]): string {
  if (channels.length === 0) {
    return 'No channels matched.';
  }
  return channels
    .map((channel) => `${channel.private ? 'private' : 'public'} #${channel.name} ${channel.id}`)
    .join('\n');
}

export function formatSlackUsers(users: SlackPerson[], nextCursor?: string): string {
  const body = formatPeople(users);
  return nextCursor ? `${body}\nnext_cursor ${nextCursor}` : body;
}

export function formatSlackChannels(channels: SlackChannel[], nextCursor?: string): string {
  const body = formatChannels(channels);
  return nextCursor ? `${body}\nnext_cursor ${nextCursor}` : body;
}

export async function sendSlackMessage(slack: SlackApi, to: string, text: string): Promise<string> {
  const message = text.trim();
  if (message.length === 0) {
    throw new Error('text is required');
  }
  if (message.length > 4000) {
    throw new Error('text is too long');
  }

  let target: SlackTarget;
  try {
    target = classifySlackTo(to);
  } catch {
    const matches = await slack.searchUsers(to);
    if (matches.length === 1 && matches[0]) {
      target = { kind: 'user', value: matches[0].id };
    } else if (matches.length === 0) {
      throw new Error('No Slack user matched that name. Try slack_search_users or a #channel.');
    } else {
      throw new Error(`Several people match. Be more specific:\n${formatPeople(matches)}`);
    }
  }

  if (target.kind === 'channel') {
    return slack.postMessage(target.value, message);
  }

  const userId = target.kind === 'email' ? (await slack.lookupByEmail(target.value)).id : target.value;
  const channel = await slack.openIm(userId);
  return slack.postMessage(channel, message);
}

export function createSlackApi(
  token: string,
  post: HttpPoster,
  timeoutMs: number,
  maxResponseBytes: number,
): SlackApi {
  const call = async (method: string, httpMethod: 'GET' | 'POST', payload?: Record<string, string>) => {
    const url =
      httpMethod === 'GET' && payload
        ? `https://slack.com/api/${method}?${new URLSearchParams(payload).toString()}`
        : `https://slack.com/api/${method}`;
    const response = await post(url, {
      method: httpMethod,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: httpMethod === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
      timeoutMs,
      maxResponseBytes,
    });
    let parsed: SlackResult;
    try {
      parsed = JSON.parse(response.body) as SlackResult;
    } catch {
      throw new Error(`Slack ${method} returned a non-JSON response`);
    }
    if (!parsed.ok) {
      throw new Error(`Slack ${method} failed: ${parsed.error ?? 'unknown_error'}`);
    }
    return parsed;
  };

  const listUsers: SlackApi['listUsers'] = async (options = {}) => {
    const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
    const payload: Record<string, string> = { limit: String(limit) };
    if (options.cursor) {
      payload.cursor = options.cursor;
    }
    const result = await call('users.list', 'GET', payload);
    const users = (result.members ?? []).flatMap((member) => {
      const person = toPerson(member);
      return person ? [person] : [];
    });
    const nextCursor = result.response_metadata?.next_cursor?.trim();
    return { users, nextCursor: nextCursor && nextCursor.length > 0 ? nextCursor : undefined };
  };

  const lookupByEmail: SlackApi['lookupByEmail'] = async (email) => {
    const result = await call('users.lookupByEmail', 'GET', { email });
    const person = result.user ? toPerson({ ...result.user, deleted: false, is_bot: false }) : undefined;
    if (!person) {
      throw new Error('Slack user id missing');
    }
    return person;
  };

  const listChannels: SlackApi['listChannels'] = async (options = {}) => {
    const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
    const payload: Record<string, string> = {
      limit: String(limit),
      exclude_archived: 'true',
      types: 'public_channel,private_channel',
    };
    if (options.cursor) {
      payload.cursor = options.cursor;
    }
    const result = await call('conversations.list', 'GET', payload);
    const channels = (result.channels ?? []).flatMap((item) => {
      if (!item.id || !item.name || item.is_archived === true) {
        return [];
      }
      return [
        {
          id: item.id,
          name: item.name,
          private: item.is_private === true,
          member: item.is_member === true,
        },
      ];
    });
    const nextCursor = result.response_metadata?.next_cursor?.trim();
    return { channels, nextCursor: nextCursor && nextCursor.length > 0 ? nextCursor : undefined };
  };

  const slack: SlackApi = {
    lookupByEmail,
    listUsers,
    searchUsers: async (query) => {
      const needle = query.trim().toLowerCase();
      if (needle.length < 2) {
        throw new Error('query is too short');
      }
      if (EMAIL.test(needle)) {
        try {
          return [await lookupByEmail(needle)];
        } catch {
          return [];
        }
      }

      const matches: SlackPerson[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5 && matches.length < 20; page += 1) {
        const listed = await listUsers({ cursor, limit: 100 });
        for (const person of listed.users) {
          if (personHaystack(person).includes(needle)) {
            matches.push(person);
          }
          if (matches.length >= 20) {
            break;
          }
        }
        if (!listed.nextCursor) {
          break;
        }
        cursor = listed.nextCursor;
      }
      return matches;
    },
    listChannels,
    searchChannels: async (query) => {
      const needle = query.trim().replace(/^#/, '').toLowerCase();
      if (needle.length < 2) {
        throw new Error('query is too short');
      }
      const matches: SlackChannel[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5 && matches.length < 20; page += 1) {
        const listed = await listChannels({ cursor, limit: 100 });
        for (const channel of listed.channels) {
          if (channel.name.toLowerCase().includes(needle) || channel.id.toLowerCase() === needle) {
            matches.push(channel);
          }
          if (matches.length >= 20) {
            break;
          }
        }
        if (!listed.nextCursor) {
          break;
        }
        cursor = listed.nextCursor;
      }
      return matches;
    },
    openIm: async (userId) => {
      const result = await call('conversations.open', 'POST', { users: userId });
      const channel = typeof result.channel === 'string' ? result.channel : result.channel?.id;
      if (!channel) {
        throw new Error('Slack DM channel missing');
      }
      return channel;
    },
    postMessage: async (channel, text) => {
      const result = await call('chat.postMessage', 'POST', { channel, text });
      return result.ts ? `Sent as you to ${channel} (${result.ts})` : `Sent as you to ${channel}`;
    },
  };

  return slack;
}
