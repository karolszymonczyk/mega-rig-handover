import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ownerLabel, readNight } from '../src/digest/read-night.js';

const NIGHT = '2026-01-01';

type Fields = { at?: unknown; job?: unknown; status?: unknown; owner?: unknown; error?: unknown };

function line(fields: Fields = {}): string {
  return JSON.stringify({
    at: '2026-01-01T23:00:00+01:00',
    job: 'a/job',
    status: 'ok',
    owner: 'rook',
    ...fields,
  });
}

function readLog(content: string, night = NIGHT) {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, `${night}.jsonl`), content);
  return readNight(dir, night);
}

describe('readNight on real nights', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line, sorted by job', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('adds up each row of 2026-10-28', () => {
    const rows = readNight('runs', '2026-10-28')?.rows ?? [];
    expect(rows.find((row) => row.job === 'digest/render')).toEqual({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });
    expect(rows.find((row) => row.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    // The bad line is a truncated lane/sync: it must not count as a run or move lastAt.
    expect(rows.find((row) => row.job === 'lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(rows.find((row) => row.job === 'notes/backup')).toMatchObject({
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });

  it('reads 2026-10-27 with no bad lines', () => {
    const night = readNight('runs', '2026-10-27');
    expect(night?.badLines).toBe(0);
    expect(night?.rows).toHaveLength(4);
  });
});

describe('readNight: which nights exist', () => {
  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('returns null when runsDir is missing', () => {
    expect(readNight(join(tmpdir(), 'rig-digest-no-such-dir'), NIGHT)).toBeNull();
  });

  it('reads an empty file as an empty night', () => {
    expect(readLog('')).toEqual({ rows: [], badLines: 0 });
  });

  it.each([
    '../secret',
    '../2026-01-01',
    '2026-01-01/../2026-01-01',
    '2026-01-01.jsonl',
    '2026-1-1',
    '2026-01-01\n',
    '',
  ])('returns null for the night name %j, even when the file exists', (night) => {
    const root = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    const runsDir = join(root, 'runs');
    mkdirSync(runsDir);
    writeFileSync(join(root, 'secret.jsonl'), line());
    writeFileSync(join(root, `${NIGHT}.jsonl`), line());
    writeFileSync(join(runsDir, `${NIGHT}.jsonl`), line());
    expect(readNight(runsDir, night)).toBeNull();
  });
});

describe('readNight: bad lines', () => {
  it.each([
    ['not JSON', '{"at":"2026-01-01T23:00:00+01:00","job":"a/j'],
    ['JSON null', 'null'],
    ['a JSON number', '42'],
    ['a JSON string', '"ok"'],
    ['a JSON array', '[]'],
    ['an empty object', '{}'],
    ['no at', line({ at: undefined })],
    ['a numeric at', line({ at: 1793000000 })],
    ['an at with no offset', line({ at: '2026-01-01T23:00:00' })],
    ['an at that is no time', line({ at: 'last night' })],
    ['no job', line({ job: undefined })],
    ['an empty job', line({ job: '' })],
    ['a numeric job', line({ job: 7 })],
    ['an unknown status', line({ status: 'skipped' })],
    ['no status', line({ status: undefined })],
    ['no owner', line({ owner: undefined })],
    ['a numeric owner', line({ owner: 7 })],
    ['a non-string error', line({ error: { code: 503 } })],
  ])('counts %s as bad and keeps the night', (_name, bad) => {
    const night = readLog(`${line()}\n${bad}\n`);
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((row) => row.runs)).toEqual([1]);
  });

  it('does not count blank lines, or CRLF line ends', () => {
    expect(readLog(`\n${line()}\r\n\r\n   \n${line()}\n\n`)).toMatchObject({
      badLines: 0,
      rows: [{ runs: 2 }],
    });
  });

  it('keeps counting when every line is bad', () => {
    expect(readLog('nope\nnope\n')).toEqual({ rows: [], badLines: 2 });
  });
});

describe('readNight: rows', () => {
  it('sorts rows by job whatever the log order', () => {
    const night = readLog([line({ job: 'b' }), line({ job: 'c' }), line({ job: 'a' })].join('\n'));
    expect(night?.rows.map((row) => row.job)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a row whose owner is null, as null', () => {
    expect(readLog(line({ owner: null }))?.rows[0]?.owner).toBeNull();
  });

  it('keeps the last error after the job recovers, and null when there was none', () => {
    const night = readLog(
      [
        line({ job: 'clean' }),
        line({ at: '2026-01-01T23:00:00+01:00', status: 'retry', error: 'first' }),
        line({ at: '2026-01-01T23:01:00+01:00', status: 'retry', error: 'second' }),
        line({ at: '2026-01-01T23:02:00+01:00', status: 'ok' }),
      ].join('\n'),
    );
    expect(night?.rows.map((row) => [row.job, row.lastStatus, row.lastError, row.retries])).toEqual([
      ['a/job', 'ok', 'second', 2],
      ['clean', 'ok', null, 0],
    ]);
  });

  it('counts retries by status only, not by the presence of an error', () => {
    const night = readLog(line({ status: 'fail', error: 'boom' }));
    expect(night?.rows[0]).toMatchObject({ retries: 0, lastStatus: 'fail', lastError: 'boom' });
  });

  it('keeps the offset text of the log', () => {
    const night = readLog(
      // 04:00Z and 03:00Z: the text sorts the other way round from the instants.
      [line({ at: '2026-01-01T23:00:00-05:00' }), line({ at: '2026-01-02T05:00:00+02:00' })].join('\n'),
    );
    expect(night?.rows[0]).toMatchObject({
      firstAt: '2026-01-02T05:00:00+02:00',
      lastAt: '2026-01-01T23:00:00-05:00',
    });
  });

  it('goes by time, not file position, when lines arrive out of order', () => {
    const night = readLog(
      [
        line({ at: '2026-01-01T23:05:00+01:00', status: 'fail', error: 'newest', owner: 'rook' }),
        line({ at: '2026-01-01T23:00:00+01:00', status: 'retry', error: 'oldest', owner: 'lane-07' }),
      ].join('\n'),
    );
    expect(night?.rows[0]).toMatchObject({
      firstAt: '2026-01-01T23:00:00+01:00',
      lastAt: '2026-01-01T23:05:00+01:00',
      lastStatus: 'fail',
      lastError: 'newest',
      owner: 'rook',
    });
  });

  it('lets the later line win when two lines share a time', () => {
    const night = readLog([line({ status: 'retry' }), line({ status: 'ok' })].join('\n'));
    expect(night?.rows[0]?.lastStatus).toBe('ok');
  });
});

describe('ownerLabel', () => {
  it('shows a dash for null and the name otherwise', () => {
    expect(ownerLabel(null)).toBe('—');
    expect(ownerLabel('rook')).toBe('rook');
  });
});
