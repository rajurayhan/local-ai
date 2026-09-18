import fs from 'node:fs';
import path from 'node:path';

import { assertHttpUrl } from '../hosts.ts';
import { resolveUserPath } from '../paths.ts';
import { fail, objectSchema, ok } from '../result.ts';
import { assertAppName, parseKey, parseMenuPath, parseModifiers } from '../ui.ts';
import type { CommandRunner, DeviceConfig, PackDraft, ToolResult } from '../types.ts';

const CLICK_MENU_JXA = [
  'ObjC.import("stdlib");',
  'const app = $.getenv("RAKAAI_APP");',
  'const menus = $.getenv("RAKAAI_MENUS").split("\\u001f");',
  'const se = Application("System Events");',
  'const procs = se.processes.whose({ name: app });',
  'if (procs.length === 0) { throw new Error("Application is not running"); }',
  'const proc = procs[0];',
  'proc.frontmost = true;',
  'delay(0.35);',
  'let node = proc.menuBars[0].menuBarItems.byName(menus[0]);',
  'for (let i = 1; i < menus.length; i++) { node = node.menus[0].menuItems.byName(menus[i]); }',
  'node.click();',
].join('');

const PRESS_KEYS_JXA = [
  'ObjC.import("stdlib");',
  'const se = Application("System Events");',
  'const app = $.getenv("RAKAAI_APP");',
  'if (app) { const procs = se.processes.whose({ name: app }); if (procs.length) { procs[0].frontmost = true; delay(0.3); } }',
  'const using = [];',
  'if ($.getenv("RAKAAI_MOD_COMMAND") === "1") using.push("command down");',
  'if ($.getenv("RAKAAI_MOD_OPTION") === "1") using.push("option down");',
  'if ($.getenv("RAKAAI_MOD_SHIFT") === "1") using.push("shift down");',
  'if ($.getenv("RAKAAI_MOD_CONTROL") === "1") using.push("control down");',
  'if ($.getenv("RAKAAI_KEY_KIND") === "code") { se.keyCode(Number($.getenv("RAKAAI_KEY")), { using }); }',
  'else { se.keystroke($.getenv("RAKAAI_KEY"), { using }); }',
].join('');

export function createDesktopPack(config: DeviceConfig, run: CommandRunner): PackDraft {
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
        name: 'click_menu',
        description:
          'Click a menu path in a Mac app, for example File > New. Requires Accessibility permission.',
        inputSchema: objectSchema(
          {
            application: { type: 'string', description: 'Application name, for example Calendar' },
            menu: { type: 'string', description: 'Menu path with >, for example File > New' },
          },
          ['application', 'menu'],
        ),
        handler: async (args) => {
          try {
            const application = assertAppName(String(args.application ?? ''));
            const menus = parseMenuPath(String(args.menu ?? ''));
            const opened = await run('open', ['-a', application], runOpts);
            if (opened.code !== 0) {
              return fail(opened.stderr || `Could not open ${application}`);
            }
            const result = await run('osascript', ['-l', 'JavaScript', '-e', CLICK_MENU_JXA], {
              ...runOpts,
              env: {
                ...env,
                RAKAAI_APP: application,
                RAKAAI_MENUS: menus.join('\u001f'),
              },
            });
            if (result.code !== 0) {
              return fail(
                result.stderr ||
                  `Could not click ${menus.join(' > ')}. Grant Accessibility access in System Settings.`,
              );
            }
            return ok(`Clicked ${menus.join(' > ')} in ${application}`);
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not click the menu');
          }
        },
      },
      {
        name: 'press_keys',
        description:
          'Press a key or shortcut in a Mac app, for example command+n. Requires Accessibility permission.',
        inputSchema: objectSchema(
          {
            application: {
              type: 'string',
              description: 'Application name. Omit to use the frontmost app.',
            },
            key: {
              type: 'string',
              description: 'One letter, one digit, or return, tab, escape, space, up, down',
            },
            modifiers: {
              type: 'string',
              description: 'Optional modifiers such as command or command+shift',
            },
          },
          ['key'],
        ),
        handler: async (args) => {
          try {
            const key = parseKey(String(args.key ?? ''));
            const modifiers = parseModifiers(String(args.modifiers ?? ''));
            const application =
              args.application != null && String(args.application).trim().length > 0
                ? assertAppName(String(args.application))
                : '';
            if (application) {
              const opened = await run('open', ['-a', application], runOpts);
              if (opened.code !== 0) {
                return fail(opened.stderr || `Could not open ${application}`);
              }
            }
            const result = await run('osascript', ['-l', 'JavaScript', '-e', PRESS_KEYS_JXA], {
              ...runOpts,
              env: {
                ...env,
                RAKAAI_APP: application,
                RAKAAI_KEY_KIND: key.kind,
                RAKAAI_KEY: String(key.value),
                RAKAAI_MOD_COMMAND: modifiers.includes('command') ? '1' : '0',
                RAKAAI_MOD_OPTION: modifiers.includes('option') ? '1' : '0',
                RAKAAI_MOD_SHIFT: modifiers.includes('shift') ? '1' : '0',
                RAKAAI_MOD_CONTROL: modifiers.includes('control') ? '1' : '0',
              },
            });
            if (result.code !== 0) {
              return fail(
                result.stderr ||
                  'Could not press keys. Grant Accessibility access in System Settings.',
              );
            }
            const combo = [...modifiers, String(args.key)].join('+');
            return ok(application ? `Pressed ${combo} in ${application}` : `Pressed ${combo}`);
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not press keys');
          }
        },
      },
      {
        name: 'clipboard_read',
        description: 'Read the current macOS clipboard text.',
        inputSchema: objectSchema({}),
        handler: async () => {
          try {
            const result = await run('pbpaste', [], runOpts);
            if (result.code !== 0) {
              return fail(result.stderr || 'Could not read the clipboard');
            }
            const text = result.stdout;
            return ok(text.length > 0 ? text : '(empty)');
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not read the clipboard');
          }
        },
      },
      {
        name: 'clipboard_write',
        description: 'Replace the macOS clipboard with the given text.',
        inputSchema: objectSchema(
          {
            text: { type: 'string', description: 'Text to put on the clipboard' },
          },
          ['text'],
        ),
        handler: async (args) => {
          const text = String(args.text ?? '');
          if (text.length === 0) {
            return fail('text is required');
          }
          if (text.length > 20_000) {
            return fail('text is too long');
          }
          try {
            const result = await run(
              'osascript',
              [
                '-l',
                'JavaScript',
                '-e',
                'ObjC.import("stdlib"); Application.currentApplication().includeStandardAdditions = true; Application.currentApplication().setTheClipboardTo($.getenv("RAKAAI_CLIP"))',
              ],
              {
                ...runOpts,
                env: { ...env, RAKAAI_CLIP: text },
              },
            );
            if (result.code !== 0) {
              return fail(result.stderr || 'Could not write the clipboard');
            }
            return ok('Copied text to the clipboard');
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not write the clipboard');
          }
        },
      },
      {
        name: 'open_item',
        description:
          'Open a URL in the default browser, or a file or folder in Finder. Target is an http(s) URL or a path.',
        inputSchema: objectSchema(
          {
            target: {
              type: 'string',
              description: 'http(s) URL, absolute path, ~/..., or a path under the default folder',
            },
          },
          ['target'],
        ),
        handler: async (args) => {
          const target = String(args.target ?? '').trim();
          if (target.length === 0) {
            return fail('target is required');
          }
          try {
            const value = target.includes('://')
              ? assertHttpUrl(target, []).toString()
              : resolveUserPath(target, config.files.root);
            if (!target.includes('://') && !fs.existsSync(value)) {
              return fail('Path does not exist');
            }
            const result = await run('open', [value], runOpts);
            if (result.code !== 0) {
              return fail(result.stderr || `Could not open ${target}`);
            }
            return ok(`Opened ${target}`);
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not open that item');
          }
        },
      },
      {
        name: 'capture_screen',
        description:
          'Capture the main display to the screenshots folder under the allowed files root.',
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
