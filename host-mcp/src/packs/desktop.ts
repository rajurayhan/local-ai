import fs from 'node:fs';
import path from 'node:path';

import { fail, objectSchema, ok } from '../result.ts';
import type { CommandRunner, DeviceConfig, Pack, ToolResult } from '../types.ts';

export function createDesktopPack(config: DeviceConfig, run: CommandRunner): Pack {
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin',
  };
  const runOpts = {
    cwd: config.files.root,
    env,
    timeoutMs: 20_000,
    maxOutputBytes: 64 * 1024,
  };

  return {
    name: 'desktop',
    tools: [
      {
        name: 'open_application',
        description: 'Open a macOS application by name, for example Calendar or Safari.',
        inputSchema: objectSchema(
          {
            name: { type: 'string', description: 'Application name' },
          },
          ['name'],
        ),
        handler: async (args) => {
          const name = String(args.name ?? '').trim();
          if (!name || /[\n\r]/.test(name)) {
            return fail('Application name is required');
          }
          try {
            const result = await run('open', ['-a', name], runOpts);
            if (result.code !== 0) {
              return fail(result.stderr || `Could not open ${name}`);
            }
            return ok(`Opened ${name}`);
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not open application');
          }
        },
      },
      {
        name: 'list_open_applications',
        description: 'List visible (non-background) macOS applications.',
        inputSchema: objectSchema({}),
        handler: async () => {
          try {
            const result = await run(
              'osascript',
              [
                '-e',
                'tell application "System Events" to get name of every process whose background only is false',
              ],
              runOpts,
            );
            if (result.code !== 0) {
              return fail(result.stderr || 'Could not list applications');
            }
            return ok(result.stdout.trim() || '(none)');
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not list applications');
          }
        },
      },
      {
        name: 'type_text',
        description: 'Type text into the frontmost application. Requires Accessibility permission.',
        inputSchema: objectSchema(
          {
            text: { type: 'string', description: 'Text to type' },
          },
          ['text'],
        ),
        handler: async (args) => {
          const text = String(args.text ?? '');
          if (text.length === 0) {
            return fail('text is required');
          }
          if (text.length > 2000) {
            return fail('text is too long');
          }
          try {
            const result = await run(
              'osascript',
              [
                '-l',
                'JavaScript',
                '-e',
                'ObjC.import("stdlib"); Application("System Events").keystroke($.getenv("RAKAAI_TYPE_TEXT"))',
              ],
              {
                ...runOpts,
                env: { ...env, RAKAAI_TYPE_TEXT: text },
              },
            );
            if (result.code !== 0) {
              return fail(
                result.stderr ||
                  'Could not type text. Grant Accessibility access to Node or Terminal in System Settings.',
              );
            }
            return ok('Typed text into the frontmost application');
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not type text');
          }
        },
      },
      {
        name: 'capture_screen',
        description: 'Capture the main display to the screenshots folder under the allowed files root.',
        inputSchema: objectSchema({}),
        handler: async (): Promise<ToolResult> => {
          try {
            fs.mkdirSync(config.desktop.screenshotDir, { recursive: true });
            const filename = `screen-${Date.now()}.png`;
            const dest = path.join(config.desktop.screenshotDir, filename);
            const result = await run('screencapture', ['-x', '-t', 'png', dest], runOpts);
            if (result.code !== 0) {
              return fail(
                result.stderr ||
                  'Could not capture the screen. Grant Screen Recording access in System Settings.',
              );
            }
            const png = fs.readFileSync(dest);
            return {
              content: [
                { type: 'text', text: `Saved ${filename}` },
                { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
              ],
            };
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not capture the screen');
          }
        },
      },
    ],
  };
}
