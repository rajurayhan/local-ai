import fs from 'node:fs';
import path from 'node:path';

import { resolveInsideRoot } from '../paths.ts';
import { fail, objectSchema, ok } from '../result.ts';
import type { DeviceConfig, Pack } from '../types.ts';

export function createFilesPack(config: DeviceConfig): Pack {
  const tools: Pack['tools'] = [
    {
      name: 'list_directory',
      description: 'List files and folders under the allowed folder. Path is relative to that folder.',
      inputSchema: objectSchema({
        path: { type: 'string', description: 'Relative folder path. Use . for the root.' },
      }),
      handler: async (args) => {
        try {
          const target = resolveInsideRoot(config.files.root, String(args.path ?? '.'));
          const stat = fs.statSync(target);
          if (!stat.isDirectory()) {
            return fail('Not a directory');
          }
          const names = fs.readdirSync(target).sort();
          if (names.length === 0) {
            return ok('(empty)');
          }
          const lines = names.map((name) => {
            const full = path.join(target, name);
            try {
              return fs.statSync(full).isDirectory() ? `${name}/` : name;
            } catch {
              return name;
            }
          });
          return ok(lines.join('\n'));
        } catch (error) {
          return fail(error instanceof Error ? error.message : 'Could not list directory');
        }
      },
    },
    {
      name: 'read_file',
      description: 'Read a text file under the allowed folder. Path is relative to that folder.',
      inputSchema: objectSchema(
        {
          path: { type: 'string', description: 'Relative file path' },
        },
        ['path'],
      ),
      handler: async (args) => {
        try {
          const target = resolveInsideRoot(config.files.root, String(args.path));
          const stat = fs.statSync(target);
          if (!stat.isFile()) {
            return fail('Not a file');
          }
          if (stat.size > config.files.maxReadBytes) {
            return fail(`File is larger than ${config.files.maxReadBytes} bytes`);
          }
          return ok(fs.readFileSync(target, 'utf8'));
        } catch (error) {
          return fail(error instanceof Error ? error.message : 'Could not read file');
        }
      },
    },
  ];

  if (config.files.writes) {
    tools.push({
      name: 'write_file',
      description: 'Write a text file under the allowed folder. Path is relative to that folder.',
      inputSchema: objectSchema(
        {
          path: { type: 'string', description: 'Relative file path' },
          content: { type: 'string', description: 'Full file contents' },
        },
        ['path', 'content'],
      ),
      handler: async (args) => {
        try {
          const target = resolveInsideRoot(config.files.root, String(args.path));
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, String(args.content ?? ''), 'utf8');
          return ok(`Wrote ${args.path}`);
        } catch (error) {
          return fail(error instanceof Error ? error.message : 'Could not write file');
        }
      },
    });
  }

  return { name: 'files', tools };
}
