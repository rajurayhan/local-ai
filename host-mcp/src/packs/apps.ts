import { fail, objectSchema, ok } from '../result.ts';
import { sendSlackMessage, type SlackApi } from '../slack.ts';
import type { DeviceConfig, HttpPoster, PackDraft } from '../types.ts';

export function createAppsPack(config: DeviceConfig, post: HttpPoster, slack?: SlackApi): PackDraft {
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
        name: 'slack_send_message',
        description:
          'Send a Slack message to a #channel, a Slack user id, or an email address. Requires SLACK_BOT_TOKEN.',
        inputSchema: objectSchema(
          {
            to: { type: 'string', description: '#channel, Slack user id, or email' },
            text: { type: 'string', description: 'Message text' },
          },
          ['to', 'text'],
        ),
        handler: async (args) => {
          if (slack == null || config.apps.slackToken.length === 0) {
            return fail(
              'Slack is not configured. Set SLACK_BOT_TOKEN in .env with chat:write, im:write, and users:read.email, then restart the device MCP.',
            );
          }
          try {
            return ok(await sendSlackMessage(slack, String(args.to ?? ''), String(args.text ?? '')));
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Slack send failed');
          }
        },
      },
    ],
  };
}
