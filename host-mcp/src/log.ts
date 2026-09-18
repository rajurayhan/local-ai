import { createHash } from 'node:crypto';
import fs from 'node:fs';

export function hashArgs(args: unknown): string {
  return createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16);
}

export function writeAudit(
  logPath: string,
  entry: {
    pack: string;
    tool: string;
    argsHash: string;
    ok: boolean;
    ms: number;
    error?: string;
  },
): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  fs.appendFileSync(logPath, `${line}\n`);
}
