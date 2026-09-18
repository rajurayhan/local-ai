import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertAppName, parseKey, parseMenuPath, parseModifiers } from './ui.ts';

test('accepts a normal app name and rejects injection', () => {
  assert.equal(assertAppName('Calendar'), 'Calendar');
  assert.throws(() => assertAppName('Calendar"; do shell script "whoami"'), /not allowed/);
});

test('parses a File > New menu path', () => {
  assert.deepEqual(parseMenuPath('File > New'), ['File', 'New']);
  assert.throws(() => parseMenuPath('File'), /File > New/);
});

test('parses modifiers and named keys', () => {
  assert.deepEqual(parseModifiers('command+shift'), ['command', 'shift']);
  assert.deepEqual(parseKey('n'), { kind: 'char', value: 'n' });
  assert.deepEqual(parseKey('return'), { kind: 'code', value: 36 });
  assert.throws(() => parseModifiers('super'), /not allowed/);
});
