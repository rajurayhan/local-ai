import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { resolveInsideRoot, resolveUserPath } from './paths.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rakaai-files-'));
const nested = path.join(root, 'notes');

before(() => {
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, 'hello.txt'), 'hi');
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('resolves a relative path inside the root', () => {
  assert.equal(
    resolveInsideRoot(root, 'notes/hello.txt'),
    fs.realpathSync(path.join(nested, 'hello.txt')),
  );
});

test('rejects parent traversal', () => {
  assert.throws(() => resolveInsideRoot(root, '../secret'), /outside/);
});

test('resolves an absolute path outside the fallback root', () => {
  const outside = path.join(os.tmpdir(), `rakaai-anywhere-${Date.now()}.txt`);
  fs.writeFileSync(outside, 'anywhere');
  try {
    assert.equal(resolveUserPath(outside, root), fs.realpathSync(outside));
  } finally {
    fs.rmSync(outside, { force: true });
  }
});

test('expands a home-relative path', () => {
  const missing = '~/does-not-need-to-exist-rakaai';
  assert.equal(
    resolveUserPath(missing, root),
    path.resolve(os.homedir(), 'does-not-need-to-exist-rakaai'),
  );
});

test('rejects a symlink that escapes the root', () => {
  const escape = path.join(os.tmpdir(), `rakaai-escape-${Date.now()}`);
  fs.writeFileSync(escape, 'nope');
  const link = path.join(root, 'escape');
  fs.symlinkSync(escape, link);
  try {
    assert.throws(() => resolveInsideRoot(root, 'escape'), /outside/);
  } finally {
    fs.rmSync(escape, { force: true });
  }
});
