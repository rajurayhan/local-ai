import { fail, objectSchema, ok } from '../result.ts';
import type { CommandRunner, DeviceConfig, PackDraft } from '../types.ts';

const LIST_EVENTS_JXA = [
  'ObjC.import("stdlib");',
  'const start = new Date(Number($.getenv("RAKAAI_START_MS")));',
  'const end = new Date(Number($.getenv("RAKAAI_END_MS")));',
  'const Calendar = Application("Calendar");',
  'const lines = [];',
  'const cals = Calendar.calendars();',
  'for (let i = 0; i < cals.length; i++) {',
  '  const cal = cals[i];',
  '  const evts = cal.events.whose({ _and: [{ startDate: { ">=": start } }, { startDate: { "<": end } }] })();',
  '  for (const ev of evts) {',
  '    lines.push([cal.name(), ev.summary(), ev.startDate(), ev.endDate()].join(" | "));',
  '  }',
  '}',
  'lines.join("\\n") || "(none)";',
].join('');

const CREATE_EVENT_JXA = [
  'ObjC.import("stdlib");',
  'const wanted = $.getenv("RAKAAI_CALENDAR");',
  'const title = $.getenv("RAKAAI_TITLE");',
  'const start = new Date(Number($.getenv("RAKAAI_START_MS")));',
  'const end = new Date(Number($.getenv("RAKAAI_END_MS")));',
  'const Calendar = Application("Calendar");',
  'const cals = wanted ? Calendar.calendars.whose({ name: wanted })() : Calendar.calendars();',
  'if (!cals.length) { throw new Error("Calendar not found"); }',
  'cals[0].events.push(Calendar.Event({ summary: title, startDate: start, endDate: end }));',
  '"ok";',
].join('');

const LIST_REMINDERS_JXA = [
  'const Reminders = Application("Reminders");',
  'const items = Reminders.reminders.whose({ completed: false })();',
  'const lines = [];',
  'for (const item of items) {',
  '  const due = item.dueDate() ? String(item.dueDate()) : "no due date";',
  '  lines.push(item.name() + " | " + due);',
  '}',
  'lines.join("\\n") || "(none)";',
].join('');

const ADD_REMINDER_JXA = [
  'ObjC.import("stdlib");',
  'const title = $.getenv("RAKAAI_TITLE");',
  'const listName = $.getenv("RAKAAI_LIST");',
  'const Reminders = Application("Reminders");',
  'const lists = listName ? Reminders.lists.whose({ name: listName })() : Reminders.lists();',
  'if (!lists.length) { throw new Error("Reminders list not found"); }',
  'lists[0].reminders.push(Reminders.Reminder({ name: title }));',
  '"ok";',
].join('');

export function dayRange(when: string, now: Date = new Date()): { start: Date; end: Date } {
  const value = when.trim().toLowerCase();
  const base = new Date(now);
  if (value.length === 0 || value === 'today') {
    return midnightRange(base);
  }
  if (value === 'tomorrow') {
    base.setDate(base.getDate() + 1);
    return midnightRange(base);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('when must be today, tomorrow, or YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('when must be today, tomorrow, or YYYY-MM-DD');
  }
  return midnightRange(parsed);
}

export function parseDateTime(raw: string, label: string): Date {
  const value = raw.trim();
  if (value.length === 0) {
    throw new Error(`${label} is required`);
  }
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must look like 2026-09-19 15:00`);
  }
  return date;
}

function midnightRange(day: Date): { start: Date; end: Date } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function createCalendarPack(config: DeviceConfig, run: CommandRunner): PackDraft {
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin',
  };
  const runOpts = {
    cwd: config.files.root,
    env,
    timeoutMs: 20_000,
    maxOutputBytes: 64 * 1024,
  };

  const jxa = async (script: string, extra: NodeJS.ProcessEnv = {}) =>
    run('osascript', ['-l', 'JavaScript', '-e', script], {
      ...runOpts,
      env: { ...env, ...extra },
    });

  return {
    name: 'calendar',
    tools: [
      {
        name: 'list_events',
        description:
          'List Calendar events on this Mac. when is today, tomorrow, or a YYYY-MM-DD date. Requires Calendar access.',
        inputSchema: objectSchema({
          when: {
            type: 'string',
            description: 'today, tomorrow, or YYYY-MM-DD. Defaults to today.',
          },
        }),
        handler: async (args) => {
          try {
            const range = dayRange(String(args.when ?? 'today'));
            const result = await jxa(LIST_EVENTS_JXA, {
              RAKAAI_START_MS: String(range.start.getTime()),
              RAKAAI_END_MS: String(range.end.getTime()),
            });
            if (result.code !== 0) {
              return fail(
                result.stderr ||
                  'Could not read Calendar. Grant Calendar access to Node or Terminal in System Settings.',
              );
            }
            return ok(result.stdout.trim() || '(none)');
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not list events');
          }
        },
      },
      {
        name: 'create_event',
        description:
          'Create a Calendar event on this Mac. start and optional end look like 2026-09-19 15:00. Requires Calendar access.',
        inputSchema: objectSchema(
          {
            title: { type: 'string', description: 'Event title' },
            start: { type: 'string', description: 'Start time, for example 2026-09-19 15:00' },
            end: {
              type: 'string',
              description: 'Optional end time. Defaults to one hour after start.',
            },
            calendar: {
              type: 'string',
              description: 'Optional calendar name. Defaults to the first calendar.',
            },
          },
          ['title', 'start'],
        ),
        handler: async (args) => {
          try {
            const title = String(args.title ?? '').trim();
            if (title.length === 0) {
              return fail('title is required');
            }
            const start = parseDateTime(String(args.start ?? ''), 'start');
            const endRaw = String(args.end ?? '').trim();
            const end =
              endRaw.length > 0
                ? parseDateTime(endRaw, 'end')
                : new Date(start.getTime() + 60 * 60 * 1000);
            if (end.getTime() <= start.getTime()) {
              return fail('end must be after start');
            }
            const result = await jxa(CREATE_EVENT_JXA, {
              RAKAAI_TITLE: title,
              RAKAAI_CALENDAR: String(args.calendar ?? '').trim(),
              RAKAAI_START_MS: String(start.getTime()),
              RAKAAI_END_MS: String(end.getTime()),
            });
            if (result.code !== 0) {
              return fail(
                result.stderr ||
                  'Could not create the event. Grant Calendar access in System Settings.',
              );
            }
            return ok(`Created ${title}`);
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not create the event');
          }
        },
      },
      {
        name: 'list_reminders',
        description: 'List incomplete Reminders on this Mac. Requires Reminders access.',
        inputSchema: objectSchema({}),
        handler: async () => {
          try {
            const result = await jxa(LIST_REMINDERS_JXA);
            if (result.code !== 0) {
              return fail(
                result.stderr ||
                  'Could not read Reminders. Grant Reminders access to Node or Terminal in System Settings.',
              );
            }
            return ok(result.stdout.trim() || '(none)');
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not list reminders');
          }
        },
      },
      {
        name: 'add_reminder',
        description: 'Add a Reminder on this Mac. Optional list is the Reminders list name.',
        inputSchema: objectSchema(
          {
            title: { type: 'string', description: 'Reminder text' },
            list: { type: 'string', description: 'Optional Reminders list name' },
          },
          ['title'],
        ),
        handler: async (args) => {
          try {
            const title = String(args.title ?? '').trim();
            if (title.length === 0) {
              return fail('title is required');
            }
            const result = await jxa(ADD_REMINDER_JXA, {
              RAKAAI_TITLE: title,
              RAKAAI_LIST: String(args.list ?? '').trim(),
            });
            if (result.code !== 0) {
              return fail(
                result.stderr ||
                  'Could not add the reminder. Grant Reminders access in System Settings.',
              );
            }
            return ok(`Added reminder ${title}`);
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Could not add the reminder');
          }
        },
      },
    ],
  };
}
