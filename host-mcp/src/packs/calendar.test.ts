import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { defaultConfig } from '../config.ts';
import type { CommandRunner } from '../types.ts';
import { createCalendarPack, dayRange, parseDateTime } from './calendar.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rakaai-cal-'));

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('parses day ranges and event times', () => {
  const now = new Date('2026-09-19T12:00:00');
  const today = dayRange('today', now);
  assert.equal(today.start.getHours(), 0);
  assert.equal(today.end.getDate(), 20);
  const tomorrow = dayRange('tomorrow', now);
  assert.equal(tomorrow.start.getDate(), 20);
  const dated = dayRange('2026-09-21', now);
  assert.equal(dated.start.getDate(), 21);
  assert.throws(() => dayRange('soon'), /YYYY-MM-DD/);
  assert.equal(parseDateTime('2026-09-19 15:00', 'start').getHours(), 15);
  assert.throws(() => parseDateTime('tonight', 'start'), /15:00/);
});

test('calendar tools call JXA and refuse bad input', async () => {
  const calls: Array<{ env?: NodeJS.ProcessEnv; script: string }> = [];
  const run: CommandRunner = async (_file, args, options) => {
    calls.push({ env: options.env, script: args[args.length - 1] ?? '' });
    return {
      code: 0,
      stdout: 'Work | Standup | Sat Sep 19 2026 09:00 | Sat Sep 19 2026 09:30',
      stderr: '',
    };
  };
  const pack = createCalendarPack(
    defaultConfig({ files: { root, writes: false, maxReadBytes: 1024 } }),
    run,
  );
  assert.deepEqual(
    pack.tools.map((tool) => tool.name),
    ['list_events', 'create_event', 'list_reminders', 'add_reminder'],
  );

  const listed = await pack.tools[0].handler({ when: 'today' });
  assert.match(listed.content[0].type === 'text' ? listed.content[0].text : '', /Standup/);
  assert.equal(calls[0]?.env?.RAKAAI_START_MS != null, true);

  const created = await pack.tools[1].handler({
    title: 'Ship review',
    start: '2026-09-19 15:00',
    calendar: 'Work',
  });
  assert.equal(created.isError, undefined);
  assert.equal(calls[1]?.env?.RAKAAI_TITLE, 'Ship review');
  assert.equal(calls[1]?.env?.RAKAAI_CALENDAR, 'Work');

  const bad = await pack.tools[1].handler({ title: 'x', start: 'later' });
  assert.equal(bad.isError, true);

  const reminders = await pack.tools[2].handler({});
  assert.equal(reminders.isError, undefined);

  const added = await pack.tools[3].handler({ title: 'Buy milk', list: 'Personal' });
  assert.equal(added.isError, undefined);
  assert.equal(calls.at(-1)?.env?.RAKAAI_TITLE, 'Buy milk');
});
