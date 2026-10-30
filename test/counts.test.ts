import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nightCounts } from '../src/digest/counts.js';

describe('nightCounts', () => {
  it('counts lines per status and skips bad lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'counts-'));
    const line = (status: string) =>
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'a/b', status, owner: null });
    writeFileSync(join(dir, '2026-10-28.jsonl'), [line('ok'), line('ok'), line('retry'), line('fail'), '{"at":"2026-10-2'].join('\n'));
    expect(nightCounts(dir, '2026-10-28')).toEqual({ ok: 2, retry: 1, fail: 1 });
    expect(nightCounts(dir, '2026-10-29')).toBeNull();
  });
});
