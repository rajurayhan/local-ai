import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { defaultConfig } from '../config.ts';
import type { CommandRunner } from '../types.ts';
import { createDesktopPack } from './desktop.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rakaai-desk-'));
const shots = path.join(root, 'screenshots');

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('open_application calls open -a and capture_screen writes a png', async () => {
  const calls: Array<{ file: string; args: string[] }> = [];
  const run: CommandRunner = async (file, args) => {
    calls.push({ file, args });
    if (file === 'screencapture') {
      const dest = args[args.length - 1];
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, 'fake-png');
    }
    return { code: 0, stdout: 'Calendar', stderr: '' };
  };

  const pack = createDesktopPack(
    defaultConfig({
      files: { root, writes: false, maxReadBytes: 1024 },
      desktop: { screenshotDir: shots },
    }),
    run,
  );

  const opened = await pack.tools.find((tool) => tool.name === 'open_application');
  assert.ok(opened);
  const openResult = await opened.handler({ name: 'Calendar' });
  assert.equal(openResult.isError, undefined);
  assert.deepEqual(calls[0], { file: 'open', args: ['-a', 'Calendar'] });

  const shot = await pack.tools.find((tool) => tool.name === 'capture_screen');
  assert.ok(shot);
  const shotResult = await shot.handler({});
  assert.equal(shotResult.isError, undefined);
  assert.equal(shotResult.content.some((part) => part.type === 'image'), true);
});

test('click_menu and press_keys stay on structured JXA and reject bad names', async () => {
  const calls: Array<{ env?: NodeJS.ProcessEnv; args: string[] }> = [];
  const run: CommandRunner = async (_file, args, options) => {
    calls.push({ args, env: options.env });
    return { code: 0, stdout: '', stderr: '' };
  };
  const pack = createDesktopPack(
    defaultConfig({
      files: { root, writes: false, maxReadBytes: 1024 },
      desktop: { screenshotDir: shots },
    }),
    run,
  );

  const click = pack.tools.find((tool) => tool.name === 'click_menu');
  assert.ok(click);
  const clicked = await click.handler({ application: 'Calendar', menu: 'File > New Event' });
  assert.equal(clicked.isError, undefined);
  assert.equal(calls.some((call) => call.env?.RAKAAI_MENUS?.includes('New Event')), true);

  const denied = await click.handler({
    application: 'Calendar"; beep',
    menu: 'File > New',
  });
  assert.equal(denied.isError, true);

  const keys = pack.tools.find((tool) => tool.name === 'press_keys');
  assert.ok(keys);
  const pressed = await keys.handler({ application: 'Safari', key: 'n', modifiers: 'command' });
  assert.equal(pressed.isError, undefined);
  assert.equal(calls.at(-1)?.env?.RAKAAI_MOD_COMMAND, '1');
});
