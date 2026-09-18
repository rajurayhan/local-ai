import { fail, objectSchema, ok } from '../result.ts';
import {
  formatSlackChannels,
  formatSlackUsers,
  sendSlackMessage,
  type SlackApi,
} from '../slack.ts';
import type { DeviceConfig, HttpPoster, PackDraft } from '../types.ts';

export type SlackClients = {
  asUser?: SlackApi;
  directory?: SlackApi;
};

const SLACK_USER_SETUP =
  'Slack sends as you, not as a bot. Set SLACK_USER_TOKEN in .env to the User OAuth Token (xoxp-...) after installing the app with user scopes, then restart the device MCP.';

function slackDirectory(clients?: SlackClients): SlackApi | undefined {
  return clients?.directory ?? clients?.asUser;
}

export function createAppsPack(config: DeviceConfig, post: HttpPoster, slack?: SlackClients): PackDraft {
  return {
    name: 'apps',
    tools: [
      {
        name: 'list_hooks',
        description: 'List configured app webhooks this agent may trigger (n8n, Slack, and similar).',
        inputSchema: objectSchema({}),
        handler: async () => {
          if (config.apps.hooks.length === 0) {
            return ok(
              'No app hooks are configured. Use slack_send_message for Slack, or add entries under apps.hooks in host-mcp/config.json.',
            );
          }
          const lines = config.apps.hooks.map((hook) => `${hook.id}: ${hook.name}`);
          return ok(lines.join('\n'));
        },
      },
      {
        name: 'trigger_hook',
        description: 'POST JSON to a configured app webhook. The id must already exist in config.',
        inputSchema: objectSchema(
          {
            id: { type: 'string', description: 'Configured hook id' },
            payload: { type: 'string', description: 'JSON object string to send as the body' },
          },
          ['id'],
        ),
        handler: async (args) => {
          const hook = config.apps.hooks.find((item) => item.id === String(args.id));
          if (!hook) {
            return fail('Unknown hook id. Call list_hooks first.');
          }

          let body = '{}';
          if (args.payload != null && String(args.payload).trim().length > 0) {
            try {
              JSON.parse(String(args.payload));
              body = String(args.payload);
            } catch {
              return fail('payload must be JSON');
            }
          }

          try {
            const response = await post(hook.url, {
              method: hook.method ?? 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(hook.headers ?? {}),
              },
              body,
              timeoutMs: config.apps.timeoutMs,
              maxResponseBytes: config.apps.maxResponseBytes,
            });
            return ok(`status ${response.status}\n${response.body}`);
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Hook request failed');
          }
        },
      },
      {
        name: 'slack_list_users',
        description: 'List people in the Slack workspace. Optional cursor continues a previous page. Limit defaults to 100 and maxes at 200.',
        inputSchema: objectSchema({
          cursor: { type: 'string', description: 'next_cursor from a previous list' },
          limit: { type: 'string', description: 'Page size from 1 to 200. Defaults to 100.' },
        }),
        handler: async (args) => {
          const directory = slackDirectory(slack);
          if (directory == null) {
            return fail(SLACK_USER_SETUP);
          }
          try {
            const cursor = String(args.cursor ?? '').trim();
            const rawLimit = String(args.limit ?? '').trim();
            const limit = rawLimit.length > 0 ? Number(rawLimit) : undefined;
            const page = await directory.listUsers({
              cursor: cursor.length > 0 ? cursor : undefined,
              limit: Number.isFinite(limit) ? limit : undefined,
            });
            return ok(formatSlackUsers(page.users, page.nextCursor));
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Slack list users failed');
          }
        },
      },
      {
        name: 'slack_search_users',
        description: 'Search Slack people by name, handle, or email. Use the returned user id to send a message.',
        inputSchema: objectSchema(
          {
            query: { type: 'string', description: 'Name, @handle, or email' },
          },
          ['query'],
        ),
        handler: async (args) => {
          const directory = slackDirectory(slack);
          if (directory == null) {
            return fail(SLACK_USER_SETUP);
          }
          try {
            return ok(formatSlackUsers(await directory.searchUsers(String(args.query ?? ''))));
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Slack search users failed');
          }
        },
      },
      {
        name: 'slack_list_channels',
        description: 'List Slack channels this user can see, or search by name when query is set.',
        inputSchema: objectSchema({
          query: { type: 'string', description: 'Optional channel name fragment' },
          cursor: { type: 'string', description: 'next_cursor from a previous list' },
        }),
        handler: async (args) => {
          const directory = slackDirectory(slack);
          if (directory == null) {
            return fail(SLACK_USER_SETUP);
          }
          try {
            const query = String(args.query ?? '').trim();
            if (query.length > 0) {
              return ok(formatSlackChannels(await directory.searchChannels(query)));
            }
            const cursor = String(args.cursor ?? '').trim();
            const page = await directory.listChannels({ cursor: cursor.length > 0 ? cursor : undefined });
            return ok(formatSlackChannels(page.channels, page.nextCursor));
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Slack list channels failed');
          }
        },
      },
      {
        name: 'slack_send_message',
        description:
          'Send a Slack message as the signed-in user to a #channel, a person name, an email, or a Slack user id. Requires SLACK_USER_TOKEN.',
        inputSchema: objectSchema(
          {
            to: { type: 'string', description: '#channel, person name, Slack user id, or email' },
            text: { type: 'string', description: 'Message text' },
          },
          ['to', 'text'],
        ),
        handler: async (args) => {
          if (slack?.asUser == null || config.apps.slackUserToken.length === 0) {
            return fail(SLACK_USER_SETUP);
          }
          try {
            return ok(await sendSlackMessage(slack.asUser, String(args.to ?? ''), String(args.text ?? '')));
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Slack send failed');
          }
        },
      },
    ],
  };
}
