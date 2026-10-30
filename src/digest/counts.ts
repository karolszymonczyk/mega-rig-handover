import { join } from 'node:path';
import { parseLine, readLog } from './read-night.js';
import type { RunStatus } from './types.js';

export type NightCounts = Record<RunStatus, number>;

// Log lines per status (not rows). Bad lines are not counted. Null: no such night.
export function nightCounts(runsDir: string, night: string): NightCounts | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  const log = readLog(join(runsDir, `${night}.jsonl`));
  if (log === null) return null;

  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const text of log.split('\n')) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (line !== null) counts[line.status] += 1;
  }
  return counts;
}
