import type { HttpPoster } from './types.ts';

export type SlackTarget =
  | { kind: 'channel'; value: string }
  | { kind: 'user'; value: string }
  | { kind: 'email'; value: string };

export type SlackApi = {
  lookupByEmail: (email: string) => Promise<{ id: string; name: string }>;
  openIm: (userId: string) => Promise<string>;
  postMessage: (channel: string, text: string) => Promise<string>;
};

type SlackResult = {
  ok: boolean;
  error?: string;
  user?: { id?: string; name?: string; real_name?: string };
  channel?: string | { id?: string };
  ts?: string;
};

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
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { kind: 'email', value };
  }
  throw new Error('Send to a #channel, a Slack user id, or an email address');
}

export async function sendSlackMessage(
  slack: SlackApi,
  to: string,
  text: string,
): Promise<string> {
  const message = text.trim();
  if (message.length === 0) {
    throw new Error('text is required');
  }
  if (message.length > 4000) {
    throw new Error('text is too long');
  }

  const target = classifySlackTo(to);
  if (target.kind === 'channel') {
    return slack.postMessage(target.value, message);
  }

  const userId = target.kind === 'email' ? (await slack.lookupByEmail(target.value)).id : target.value;
  const channel = await slack.openIm(userId);
  return slack.postMessage(channel, message);
}

export function createSlackApi(token: string, post: HttpPoster, timeoutMs: number, maxResponseBytes: number): SlackApi {
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

  return {
    lookupByEmail: async (email) => {
      const result = await call('users.lookupByEmail', 'GET', { email });
      const id = result.user?.id;
      if (!id) {
        throw new Error('Slack user id missing');
      }
      return { id, name: result.user?.real_name || result.user?.name || id };
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
      return result.ts ? `Sent to ${channel} (${result.ts})` : `Sent to ${channel}`;
    },
  };
}
