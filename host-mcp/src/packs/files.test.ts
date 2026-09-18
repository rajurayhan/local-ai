import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { defaultConfig } from '../config.ts';
import { createFilesPack } from './files.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rakaai-pack-'));
fs.writeFileSync(path.join(root, 'readme.txt'), 'hello');

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('lists and reads files inside the root', async () => {
  const pack = createFilesPack(
    defaultConfig({ files: { root, writes: false, maxReadBytes: 1024 } }),
  );
  const names = pack.tools.map((tool) => tool.name);
  assert.deepEqual(names, ['list_directory', 'read_file']);

  const list = await pack.tools[0].handler({ path: '.' });
  assert.equal(list.isError, undefined);
  assert.match(list.content[0].type === 'text' ? list.content[0].text : '', /readme.txt/);

  const read = await pack.tools[1].handler({ path: 'readme.txt' });
  assert.equal(read.content[0].type === 'text' ? read.content[0].text : '', 'hello');
});

test('reads and lists files outside the default folder', async () => {
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rakaai-anywhere-'));
  const outsideFile = path.join(outsideDir, 'notes.txt');
  fs.writeFileSync(outsideFile, 'outside');
  try {
    const pack = createFilesPack(
      defaultConfig({ files: { root, writes: false, maxReadBytes: 1024 } }),
    );
    const list = await pack.tools[0].handler({ path: outsideDir });
    assert.equal(list.isError, undefined);
    assert.match(list.content[0].type === 'text' ? list.content[0].text : '', /notes.txt/);

    const read = await pack.tools[1].handler({ path: outsideFile });
    assert.equal(read.isError, undefined);
    assert.equal(read.content[0].type === 'text' ? read.content[0].text : '', 'outside');
  } finally {
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test('omits write_file unless writes are enabled', async () => {
  const closed = createFilesPack(
    defaultConfig({ files: { root, writes: false, maxReadBytes: 1024 } }),
  );
  assert.equal(
    closed.tools.some((tool) => tool.name === 'write_file'),
    false,
  );

  const open = createFilesPack(
    defaultConfig({ files: { root, writes: true, maxReadBytes: 1024 } }),
  );
  const write = open.tools.find((tool) => tool.name === 'write_file');
  assert.ok(write);
  const result = await write.handler({ path: 'out.txt', content: 'ok' });
  assert.equal(result.isError, undefined);
  assert.equal(fs.readFileSync(path.join(root, 'out.txt'), 'utf8'), 'ok');

  const blocked = await write.handler({
    path: path.join(os.tmpdir(), 'blocked.txt'),
    content: 'nope',
  });
  assert.equal(blocked.isError, true);
});
