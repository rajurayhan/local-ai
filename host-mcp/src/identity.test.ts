import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PACK_AUTHOR, PACK_SHARE_NAMES, packIdentity } from './identity.ts';

test('share names use the SulusPersonal-Pack form', () => {
  assert.equal(PACK_SHARE_NAMES.shell, 'SulusPersonal-Shell');
  assert.equal(PACK_SHARE_NAMES.files, 'SulusPersonal-Files');
  assert.equal(PACK_SHARE_NAMES.browser, 'SulusPersonal-Browser');
  assert.equal(PACK_SHARE_NAMES.desktop, 'SulusPersonal-Desktop');
  assert.equal(PACK_SHARE_NAMES.apps, 'SulusPersonal-Apps');
  assert.equal(PACK_SHARE_NAMES.calendar, 'SulusPersonal-Calendar');
});

test('each pack carries SulusPersonal authorship', () => {
  const identity = packIdentity('shell');
  assert.equal(identity.shareName, 'SulusPersonal-Shell');
  assert.deepEqual(identity.author, PACK_AUTHOR);
  assert.match(identity.description, /Authored by SulusPersonal <raju@sulus.ai>/);
});
