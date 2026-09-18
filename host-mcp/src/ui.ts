const APP_NAME = /^[A-Za-z0-9][A-Za-z0-9 .+\-]{0,80}$/;
const MENU_ITEM = /^[A-Za-z0-9][A-Za-z0-9 .+\-\/()&]{0,80}$/;

const KEY_CODES: Record<string, number> = {
  return: 36,
  enter: 36,
  tab: 48,
  escape: 53,
  esc: 53,
  space: 49,
  delete: 51,
  backspace: 51,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
};

const MODIFIERS = new Set(['command', 'cmd', 'option', 'alt', 'shift', 'control', 'ctrl']);

export function assertAppName(name: string): string {
  const value = name.trim();
  if (!APP_NAME.test(value)) {
    throw new Error('Application name is not allowed');
  }
  return value;
}

export function parseMenuPath(raw: string): string[] {
  const items = raw
    .split('>')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length < 2) {
    throw new Error('Menu path must look like File > New');
  }
  if (items.length > 5) {
    throw new Error('Menu path is too deep');
  }
  for (const item of items) {
    if (!MENU_ITEM.test(item)) {
      throw new Error(`Menu item is not allowed: ${item}`);
    }
  }
  return items;
}

export function parseModifiers(raw: string): Array<'command' | 'option' | 'shift' | 'control'> {
  if (raw.trim().length === 0) {
    return [];
  }
  const seen = new Set<'command' | 'option' | 'shift' | 'control'>();
  for (const part of raw.split(/[+,]/)) {
    const token = part.trim().toLowerCase();
    if (token.length === 0) {
      continue;
    }
    if (!MODIFIERS.has(token)) {
      throw new Error(`Modifier is not allowed: ${part.trim()}`);
    }
    if (token === 'command' || token === 'cmd') {
      seen.add('command');
    } else if (token === 'option' || token === 'alt') {
      seen.add('option');
    } else if (token === 'shift') {
      seen.add('shift');
    } else {
      seen.add('control');
    }
  }
  return [...seen];
}

export function parseKey(raw: string): { kind: 'char'; value: string } | { kind: 'code'; value: number } {
  const value = raw.trim().toLowerCase();
  if (value.length === 0) {
    throw new Error('key is required');
  }
  if (KEY_CODES[value] != null) {
    return { kind: 'code', value: KEY_CODES[value] };
  }
  if (/^[a-z0-9]$/.test(value)) {
    return { kind: 'char', value };
  }
  throw new Error('key must be one letter, one digit, or a named key such as return or tab');
}
