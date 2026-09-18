import fs from 'node:fs';
import path from 'node:path';

import { resolveInsideRoot, resolveUserPath } from '../paths.ts';
import { fail, objectSchema, ok } from '../result.ts';
import type { DeviceConfig, PackDraft } from '../types.ts';

const LIST_CAP = 200;
const FIND_CAP = 40;
const SEARCH_CAP = 30;
const WALK_CAP = 2500;
const WALK_DEPTH = 8;
const SNIPPET = 80;

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.browser-profile',
  '.npm',
  '.cache',
  '.cursor',
  '.Trash',
  'Library',
  'Applications',
  'System',
  'private',
  'Caches',
  '.Spotlight-V100',
  '.fseventsd',
]);

const TEXT_EXT = new Set([
  '.c',
  '.cfg',
  '.conf',
  '.css',
  '.csv',
  '.env',
  '.go',
  '.graphql',
  '.h',
  '.htm',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.log',
  '.md',
  '.mjs',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.svelte',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh',
]);

export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatEntry(name: string, stat: fs.Stats): string {
  if (stat.isDirectory()) {
    return `${name}/  dir  ${formatStamp(stat.mtime)}`;
  }
  return `${name}  ${formatSize(stat.size)}  ${formatStamp(stat.mtime)}`;
}

export function isSkippedDir(name: string): boolean {
  return SKIP_DIRS.has(name);
}

export function looksBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

export function parseCount(raw: unknown, fallback: number, max: number): number {
  if (raw == null || String(raw).trim() === '') {
    return fallback;
  }
  const value = Number(String(raw).trim());
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error('Must be a whole number of bytes');
  }
  return Math.min(value, max);
}

function isProbablyText(filePath: string): boolean {
  return TEXT_EXT.has(path.extname(filePath).toLowerCase());
}

function walkFiles(root: string, visit: (full: string, stat: fs.Stats) => boolean): void {
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  let seen = 0;

  while (stack.length > 0 && seen < WALK_CAP) {
    const current = stack.pop();
    if (current == null) {
      break;
    }

    let names: string[];
    try {
      names = fs.readdirSync(current.dir);
    } catch {
      continue;
    }

    for (const name of names) {
      if (name === '.' || name === '..') {
        continue;
      }
      const full = path.join(current.dir, name);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        continue;
      }
      seen += 1;
      if (seen > WALK_CAP) {
        return;
      }
      if (stat.isDirectory()) {
        if (!isSkippedDir(name) && current.depth < WALK_DEPTH) {
          stack.push({ dir: full, depth: current.depth + 1 });
        }
        continue;
      }
      if (stat.isFile() && !visit(full, stat)) {
        return;
      }
    }
  }
}

export function createFilesPack(config: DeviceConfig): PackDraft {
  const tools: PackDraft['tools'] = [
    {
      name: 'list_directory',
      description:
        'List files and folders on this Mac with size and modified time. Path can be absolute, ~/..., or relative to the default folder. Use . for the default folder.',
      inputSchema: objectSchema({
        path: {
          type: 'string',
          description:
            'Folder path. Absolute, ~/..., or relative to the default folder. Use . for the default folder.',
        },
      }),
      handler: async (args) => {
        try {
          const target = resolveUserPath(String(args.path ?? '.'), config.files.root);
          const stat = fs.statSync(target);
          if (!stat.isDirectory()) {
            return fail('Not a directory');
          }
          const names = fs.readdirSync(target).sort();
          if (names.length === 0) {
            return ok('(empty)');
          }
          const shown = names.slice(0, LIST_CAP);
          const lines = shown.map((name) => {
            const full = path.join(target, name);
            try {
              return formatEntry(name, fs.statSync(full));
            } catch {
              return name;
            }
          });
          if (names.length > LIST_CAP) {
            lines.push(`… and ${names.length - LIST_CAP} more. Use find_files to narrow this.`);
          }
          return ok(lines.join('\n'));
        } catch (error) {
          return fail(error instanceof Error ? error.message : 'Could not list directory');
        }
      },
    },
    {
      name: 'read_file',
      description:
        'Read a text file on this Mac. Path can be absolute, ~/..., or relative to the default folder. Optional offset and limit read a slice of a large file.',
      inputSchema: objectSchema(
        {
          path: {
            type: 'string',
            description: 'File path. Absolute, ~/..., or relative to the default folder.',
          },
          offset: { type: 'string', description: 'Byte offset to start at. Defaults to 0.' },
          limit: {
            type: 'string',
            description: 'Maximum bytes to read. Defaults to the configured max.',
          },
        },
        ['path'],
      ),
      handler: async (args) => {
        try {
          const target = resolveUserPath(String(args.path), config.files.root);
          const stat = fs.statSync(target);
          if (!stat.isFile()) {
            return fail('Not a file');
          }
          if (stat.size === 0) {
            return ok('(empty)');
          }
          const offset = parseCount(args.offset, 0, Number.MAX_SAFE_INTEGER);
          const limit = parseCount(
            args.limit,
            config.files.maxReadBytes,
            config.files.maxReadBytes,
          );
          if (offset >= stat.size) {
            return fail('offset is past the end of the file');
          }
          const length = Math.min(limit, stat.size - offset);
          const buffer = Buffer.alloc(length);
          const fd = fs.openSync(target, 'r');
          try {
            fs.readSync(fd, buffer, 0, length, offset);
          } finally {
            fs.closeSync(fd);
          }
          if (looksBinary(buffer)) {
            return fail('Not a text file');
          }
          const text = buffer.toString('utf8');
          const remaining = stat.size - offset - length;
          if (remaining > 0) {
            return ok(
              `${text}\n… ${remaining} bytes left. Call read_file again with offset ${offset + length}.`,
            );
          }
          return ok(text);
        } catch (error) {
          return fail(error instanceof Error ? error.message : 'Could not read file');
        }
      },
    },
    {
      name: 'find_files',
      description:
        'Find files by name on this Mac. query is a name fragment. path is the folder to search; defaults to the default folder.',
      inputSchema: objectSchema(
        {
          query: { type: 'string', description: 'File name fragment, for example invoice or .pdf' },
          path: {
            type: 'string',
            description: 'Folder to search. Absolute, ~/..., or relative to the default folder.',
          },
        },
        ['query'],
      ),
      handler: async (args) => {
        try {
          const query = String(args.query ?? '')
            .trim()
            .toLowerCase();
          if (query.length < 2) {
            return fail('query is too short');
          }
          const target = resolveUserPath(String(args.path ?? '.'), config.files.root);
          const stat = fs.statSync(target);
          if (!stat.isDirectory()) {
            return fail('Not a directory');
          }
          const hits: string[] = [];
          walkFiles(target, (full, fileStat) => {
            if (path.basename(full).toLowerCase().includes(query)) {
              hits.push(formatEntry(full, fileStat));
            }
            return hits.length < FIND_CAP;
          });
          if (hits.length === 0) {
            return ok('No files matched.');
          }
          if (hits.length >= FIND_CAP) {
            hits.push(`… stopped after ${FIND_CAP} matches. Narrow the path or query.`);
          }
          return ok(hits.join('\n'));
        } catch (error) {
          return fail(error instanceof Error ? error.message : 'Could not find files');
        }
      },
    },
    {
      name: 'search_text',
      description:
        'Search file contents for a phrase under a folder. Skips binaries and large files. path defaults to the default folder.',
      inputSchema: objectSchema(
        {
          query: { type: 'string', description: 'Text to find, case-insensitive' },
          path: {
            type: 'string',
            description: 'Folder to search. Absolute, ~/..., or relative to the default folder.',
          },
        },
        ['query'],
      ),
      handler: async (args) => {
        try {
          const query = String(args.query ?? '').trim();
          if (query.length < 2) {
            return fail('query is too short');
          }
          const needle = query.toLowerCase();
          const target = resolveUserPath(String(args.path ?? '.'), config.files.root);
          const stat = fs.statSync(target);
          if (!stat.isDirectory()) {
            return fail('Not a directory');
          }
          const hits: string[] = [];
          walkFiles(target, (full, fileStat) => {
            if (fileStat.size === 0 || fileStat.size > config.files.maxReadBytes) {
              return true;
            }
            if (!isProbablyText(full)) {
              return true;
            }
            let text: string;
            try {
              const buffer = fs.readFileSync(full);
              if (looksBinary(buffer)) {
                return true;
              }
              text = buffer.toString('utf8');
            } catch {
              return true;
            }
            const lines = text.split(/\r?\n/);
            for (let i = 0; i < lines.length && hits.length < SEARCH_CAP; i += 1) {
              const line = lines[i];
              if (line == null || !line.toLowerCase().includes(needle)) {
                continue;
              }
              const trimmed = line.trim().replace(/\s+/g, ' ');
              const snippet = trimmed.length > SNIPPET ? `${trimmed.slice(0, SNIPPET)}…` : trimmed;
              hits.push(`${full}:${i + 1}: ${snippet}`);
            }
            return hits.length < SEARCH_CAP;
          });
          if (hits.length === 0) {
            return ok('No text matched.');
          }
          if (hits.length >= SEARCH_CAP) {
            hits.push(`… stopped after ${SEARCH_CAP} matches. Narrow the path or query.`);
          }
          return ok(hits.join('\n'));
        } catch (error) {
          return fail(error instanceof Error ? error.message : 'Could not search files');
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
