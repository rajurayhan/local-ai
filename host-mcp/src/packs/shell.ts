import fs from 'node:fs';
import path from 'node:path';

import { expandHome, isInsideRoot, resolveInsideRoot } from '../paths.ts';
import { fail, objectSchema, ok } from '../result.ts';
import type { CommandRunner, DeviceConfig, PackDraft } from '../types.ts';

const META = /[;&|`$<>()\n]/;

export function parseCommand(command: string): string[] {
  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new Error('Command is required');
  }
  if (META.test(command)) {
    throw new Error('Shell metacharacters are not allowed. Pass a single program and its arguments.');
  }

  const out: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (const char of command) {
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        out.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (quote) {
    throw new Error('Unclosed quote');
  }
  if (current) {
    out.push(current);
  }
  if (out.length === 0) {
    throw new Error('Command is required');
  }
  return out;
}

export function isDeniedBinary(file: string, denyBinaries: string[]): boolean {
  const base = path.basename(file).toLowerCase();
  return denyBinaries.some((name) => name.toLowerCase() === base);
}

export function resolveCwd(cwdAllow: string[], requested?: string): string {
  if (cwdAllow.length === 0) {
    throw new Error('No allowed working directory is configured');
  }

  if (requested == null || requested.length === 0) {
    const fallback = fs.realpathSync(expandHome(cwdAllow[0]));
    if (!fs.statSync(fallback).isDirectory()) {
      throw new Error('Working directory does not exist');
    }
    return fallback;
  }

  const expanded = expandHome(requested);
  for (const allowed of cwdAllow) {
    const allowedReal = fs.realpathSync(expandHome(allowed));
    try {
      const resolved = path.isAbsolute(expanded)
        ? resolveAbsoluteCwd(allowedReal, expanded)
        : resolveInsideRoot(allowedReal, expanded);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        throw new Error('Working directory does not exist');
      }
      return fs.realpathSync(resolved);
    } catch (error) {
      if (error instanceof Error && error.message === 'Working directory does not exist') {
        throw error;
      }
    }
  }

  throw new Error('Working directory is outside the allowed folders');
}

function resolveAbsoluteCwd(allowedReal: string, expanded: string): string {
  const real = fs.existsSync(expanded) ? fs.realpathSync(expanded) : expanded;
  if (!isInsideRoot(allowedReal, real)) {
    throw new Error('Working directory is outside the allowed folders');
  }
  return real;
}

export function createShellPack(config: DeviceConfig, run: CommandRunner): PackDraft {
  return {
    name: 'shell',
    tools: [
      {
        name: 'run_command',
        description:
          'Run one program with arguments in an allowed folder. No pipes, redirects, or shell features.',
        inputSchema: objectSchema(
          {
            command: { type: 'string', description: 'Program and arguments, for example: ls -la' },
            cwd: { type: 'string', description: 'Working directory under the allowed folder' },
          },
          ['command'],
        ),
        handler: async (args) => {
          try {
            const argv = parseCommand(String(args.command));
            const file = argv[0];
            if (isDeniedBinary(file, config.shell.denyBinaries)) {
              return fail(`Program not allowed: ${path.basename(file)}`);
            }
            if (file === 'rm' && argv.slice(1).some((flag) => /^-(?:[a-zA-Z]*f[a-zA-Z]*r|[a-zA-Z]*r[a-zA-Z]*f)$/.test(flag))) {
              return fail('rm -rf is not allowed');
            }

            const cwd = resolveCwd(config.shell.cwdAllow, args.cwd != null ? String(args.cwd) : undefined);
            const result = await run(file, argv.slice(1), {
              cwd,
              env: { PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin' },
              timeoutMs: config.shell.timeoutMs,
              maxOutputBytes: config.shell.maxOutputBytes,
            });
            const parts = [
              `exit ${result.code ?? 'timeout'}`,
              result.stdout ? `stdout:\n${result.stdout}` : '',
              result.stderr ? `stderr:\n${result.stderr}` : '',
            ].filter(Boolean);
            return ok(parts.join('\n'));
          } catch (error) {
            return fail(error instanceof Error ? error.message : 'Command failed');
          }
        },
      },
    ],
  };
}
