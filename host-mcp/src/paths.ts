import fs from 'node:fs';
import path from 'node:path';

export function expandHome(value: string): string {
  if (value === '~') {
    return osHome();
  }
  if (value.startsWith('~/')) {
    return path.join(osHome(), value.slice(2));
  }
  return value;
}

export function osHome(): string {
  const home = process.env.HOME;
  if (!home) {
    throw new Error('HOME is not set');
  }
  return home;
}

export function resolveUserPath(userPath: string, fallbackRoot?: string): string {
  const requested = requestedPath(userPath, fallbackRoot);
  return existingRealpath(requested) ?? requested;
}

export function resolveInsideRoot(root: string, userPath: string): string {
  const rootReal = fs.realpathSync(expandHome(root));
  const requested = requestedPath(userPath, rootReal);
  const existing = existingRealpath(requested);
  const resolved = existing ?? requested;

  if (!isInsideRoot(rootReal, resolved)) {
    throw new Error('Path is outside the allowed folder');
  }

  if (existing == null) {
    const parentReal = fs.realpathSync(path.dirname(requested));
    if (!isInsideRoot(rootReal, parentReal)) {
      throw new Error('Path is outside the allowed folder');
    }
    return path.join(parentReal, path.basename(requested));
  }

  return existing;
}

function requestedPath(userPath: string, fallbackRoot?: string): string {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new Error('Path is required');
  }
  if (userPath.includes('\0')) {
    throw new Error('Path is not allowed');
  }

  const expanded = expandHome(userPath);
  if (path.isAbsolute(expanded)) {
    return path.resolve(expanded);
  }

  return path.resolve(expandHome(fallbackRoot ?? osHome()), expanded);
}

export function isInsideRoot(rootReal: string, candidate: string): boolean {
  const root = stripTrailingSep(rootReal);
  const value = stripTrailingSep(candidate);
  return value === root || value.startsWith(`${root}${path.sep}`);
}

function existingRealpath(target: string): string | null {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

function stripTrailingSep(value: string): string {
  if (value.length > 1 && value.endsWith(path.sep)) {
    return value.slice(0, -1);
  }
  return value;
}
