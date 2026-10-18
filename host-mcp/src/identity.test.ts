import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PACK_AUTHOR, PACK_SHARE_NAMES, packIdentity } from './identity.ts';

test('share names use the Sulus-Pack form', () => {
  assert.equal(PACK_SHARE_NAMES.shell, 'Sulus-Shell');
  assert.equal(PACK_SHARE_NAMES.files, 'Sulus-Files');
  assert.equal(PACK_SHARE_NAMES.browser, 'Sulus-Browser');
  assert.equal(PACK_SHARE_NAMES.desktop, 'Sulus-Desktop');
  assert.equal(PACK_SHARE_NAMES.apps, 'Sulus-Apps');
  assert.equal(PACK_SHARE_NAMES.calendar, 'Sulus-Calendar');
});

test('each pack carries Sulus Personal AI authorship', () => {
  const identity = packIdentity('shell');
  assert.equal(identity.shareName, 'Sulus-Shell');
  assert.deepEqual(identity.author, PACK_AUTHOR);
  assert.match(identity.description, /Authored by Sulus Personal AI <raju@sulus.ai>/);
});
