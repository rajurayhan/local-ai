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

  const opened = await pack.tools[0].handler({ name: 'Calendar' });
  assert.equal(opened.isError, undefined);
  assert.deepEqual(calls[0], { file: 'open', args: ['-a', 'Calendar'] });

  const shot = await pack.tools[3].handler({});
  assert.equal(shot.isError, undefined);
  assert.equal(shot.content.some((part) => part.type === 'image'), true);
});
