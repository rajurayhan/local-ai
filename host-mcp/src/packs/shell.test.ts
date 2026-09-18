import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { defaultConfig } from '../config.ts';
import type { CommandRunner } from '../types.ts';
import { createShellPack, isDeniedBinary, parseCommand, resolveCwd } from './shell.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rakaai-shell-'));

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('parses a simple command and rejects metacharacters', () => {
  assert.deepEqual(parseCommand('ls -la'), ['ls', '-la']);
  assert.deepEqual(parseCommand('echo "hello world"'), ['echo', 'hello world']);
  assert.throws(() => parseCommand('ls | wc'), /metacharacters/);
  assert.throws(() => parseCommand('echo hi; rm -rf /'), /metacharacters/);
});

test('denies dangerous binaries', () => {
  assert.equal(isDeniedBinary('sudo', ['sudo', 'dd']), true);
  assert.equal(isDeniedBinary('/usr/bin/sudo', ['sudo']), true);
  assert.equal(isDeniedBinary('ls', ['sudo']), false);
});

test('keeps cwd inside the allow list', () => {
  assert.equal(resolveCwd([root]), fs.realpathSync(root));
  assert.throws(() => resolveCwd([root], os.tmpdir()), /outside/);
});

test('run_command uses the injected runner and blocks sudo', async () => {
  const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
  const run: CommandRunner = async (file, args, options) => {
    calls.push({ file, args, cwd: options.cwd });
    return { code: 0, stdout: 'ok', stderr: '' };
  };
  const pack = createShellPack(
    defaultConfig({ files: { root, writes: false, maxReadBytes: 1024 }, shell: { cwdAllow: [root], denyBinaries: ['sudo'], timeoutMs: 1000, maxOutputBytes: 1024 } }),
    run,
  );

  const denied = await pack.tools[0].handler({ command: 'sudo ls' });
  assert.equal(denied.isError, true);
  assert.equal(calls.length, 0);

  const allowed = await pack.tools[0].handler({ command: 'ls -la' });
  assert.equal(allowed.isError, undefined);
  assert.equal(calls[0]?.file, 'ls');
  assert.deepEqual(calls[0]?.args, ['-la']);
  assert.equal(calls[0]?.cwd, fs.realpathSync(root));
});
