import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PACK_AUTHOR, PACK_SHARE_NAMES, packIdentity } from './identity.ts';

test('share names use the RakaAI-Pack form', () => {
  assert.equal(PACK_SHARE_NAMES.shell, 'RakaAI-Shell');
  assert.equal(PACK_SHARE_NAMES.files, 'RakaAI-Files');
  assert.equal(PACK_SHARE_NAMES.browser, 'RakaAI-Browser');
  assert.equal(PACK_SHARE_NAMES.desktop, 'RakaAI-Desktop');
  assert.equal(PACK_SHARE_NAMES.apps, 'RakaAI-Apps');
  assert.equal(PACK_SHARE_NAMES.calendar, 'RakaAI-Calendar');
});

test('each pack carries RakaAI authorship', () => {
  const identity = packIdentity('shell');
  assert.equal(identity.shareName, 'RakaAI-Shell');
  assert.deepEqual(identity.author, PACK_AUTHOR);
  assert.match(identity.description, /Authored by RakaAI <raju@sulus.ai>/);
});
