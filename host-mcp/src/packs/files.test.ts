import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { defaultConfig } from '../config.ts';
import { createFilesPack, formatEntry, formatSize, looksBinary, parseCount } from './files.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rakaai-pack-'));
fs.writeFileSync(path.join(root, 'readme.txt'), 'hello');

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('formats sizes and rejects binary buffers', () => {
  assert.equal(formatSize(20), '20B');
  assert.equal(formatSize(2048), '2KB');
  assert.equal(looksBinary(Buffer.from('hello')), false);
  assert.equal(looksBinary(Buffer.from([0, 1, 2])), true);
  assert.equal(parseCount('10', 0, 100), 10);
  assert.throws(() => parseCount('nope', 0, 100), /whole number/);
});

test('lists and reads files inside the root', async () => {
  const pack = createFilesPack(
    defaultConfig({ files: { root, writes: false, maxReadBytes: 1024 } }),
  );
  const names = pack.tools.map((tool) => tool.name);
  assert.deepEqual(names, ['list_directory', 'read_file', 'find_files', 'search_text']);

  const list = await pack.tools[0].handler({ path: '.' });
  assert.equal(list.isError, undefined);
  assert.match(list.content[0].type === 'text' ? list.content[0].text : '', /readme.txt/);
  assert.match(list.content[0].type === 'text' ? list.content[0].text : '', /5B/);

  const read = await pack.tools[1].handler({ path: 'readme.txt' });
  assert.equal(read.content[0].type === 'text' ? read.content[0].text : '', 'hello');
});

test('reads a slice of a large file and refuses binaries', async () => {
  const pack = createFilesPack(defaultConfig({ files: { root, writes: false, maxReadBytes: 8 } }));
  const big = path.join(root, 'big.txt');
  fs.writeFileSync(big, 'abcdefghij');
  const first = await pack.tools[1].handler({ path: 'big.txt' });
  assert.match(first.content[0].type === 'text' ? first.content[0].text : '', /abcdefgh/);
  assert.match(first.content[0].type === 'text' ? first.content[0].text : '', /offset 8/);

  const rest = await pack.tools[1].handler({ path: 'big.txt', offset: '8' });
  assert.equal(rest.content[0].type === 'text' ? rest.content[0].text : '', 'ij');

  const binary = path.join(root, 'blob.bin');
  fs.writeFileSync(binary, Buffer.from([0, 1, 2, 3]));
  const refused = await pack.tools[1].handler({ path: binary });
  assert.equal(refused.isError, true);
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

test('finds files by name and searches text', async () => {
  const notes = path.join(root, 'notes');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(notes, 'invoice.pdf'), 'not-text');
  fs.writeFileSync(path.join(notes, 'memo.txt'), 'Please pay the invoice today.');
  fs.mkdirSync(path.join(notes, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(notes, 'node_modules', 'invoice.pdf'), 'skip');

  const pack = createFilesPack(
    defaultConfig({ files: { root, writes: false, maxReadBytes: 1024 } }),
  );
  const find = pack.tools.find((tool) => tool.name === 'find_files');
  const search = pack.tools.find((tool) => tool.name === 'search_text');
  assert.ok(find && search);

  const found = await find.handler({ query: 'invoice', path: notes });
  assert.match(found.content[0].type === 'text' ? found.content[0].text : '', /invoice\.pdf/);
  assert.doesNotMatch(
    found.content[0].type === 'text' ? found.content[0].text : '',
    /node_modules/,
  );

  const hits = await search.handler({ query: 'invoice', path: notes });
  assert.match(hits.content[0].type === 'text' ? hits.content[0].text : '', /memo\.txt:1:/);
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

test('formatEntry marks directories', () => {
  const dirStat = fs.statSync(root);
  assert.match(formatEntry('notes', dirStat), /notes\/ {2}dir/);
});
