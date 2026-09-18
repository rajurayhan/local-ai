import { fail, objectSchema, ok } from '../result.ts';
import type { DeviceConfig, HttpPoster, Pack } from '../types.ts';

export function createAppsPack(config: DeviceConfig, post: HttpPoster): Pack {
  return {
    name: 'apps',
    tools: [
      {
        name: 'list_hooks',
        description: 'List configured app webhooks this agent may trigger (n8n, Slack, and similar).',
        inputSchema: objectSchema({}),
        handler: async () => {
          if (config.apps.hooks.length === 0) {
            return ok('No app hooks are configured. Add entries under apps.hooks in host-mcp/config.json.');
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
    ],
  };
}
