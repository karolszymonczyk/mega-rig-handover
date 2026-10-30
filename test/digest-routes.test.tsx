import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

type DigestJson = { night: string; badLines: number; rows: DigestRow[] };

const line = (at: string, job: string, status: string, owner: string | null = null) =>
  JSON.stringify({ at, job, status, owner });

const FULL = '2026-01-01';
const EMPTY = '2026-01-02';
const BAD = '2026-01-03';
const MISSING = '2026-01-04';

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(
    join(runsDir, `${FULL}.jsonl`),
    [
      line('2026-01-01T01:00:00+01:00', 'zebra', 'ok', 'ana'),
      line('2026-01-01T01:05:00+01:00', 'alpha', 'ok'),
      line('2026-01-01T01:10:00+01:00', 'mid', 'fail', 'bo'),
      ...[1, 2, 3].map((i) => line(`2026-01-01T02:0${i}:00+01:00`, 'flaky', 'retry', 'cy')),
    ].join('\n') + '\n',
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [line('2026-01-03T01:00:00+01:00', 'beta', 'ok'), 'not json', line('2026-01-03T01:05:00+01:00', 'alpha', 'ok')].join('\n') + '\n',
  );
  app = createApp({ adapter: 'shim', installed: '2026-01-01T00:00:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

const json = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as DigestJson };
};

describe('digest page', () => {
  it('lists the jobs sorted, with — for a null owner and warn on trouble', async () => {
    const res = await app.request(`/digest/${FULL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    const at = ['alpha', 'flaky', 'mid', 'zebra'].map((job) => html.indexOf(job));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(html).toContain('—');
    const rows = html.split('<tr').filter((r) => r.includes('class='));
    const warned = rows.filter((r) => /class="[^"]*\bwarn\b/.test(r));
    expect(warned.some((r) => r.includes('flaky'))).toBe(true);
    expect(warned.some((r) => r.includes('mid'))).toBe(true);
    expect(warned.some((r) => r.includes('alpha') || r.includes('zebra'))).toBe(false);
  });

  it('404s for a night with no file or a bad name', async () => {
    expect((await app.request(`/digest/${MISSING}`)).status).toBe(404);
    expect((await app.request('/digest/not-a-night')).status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('keeps the good jobs and reports the bad line', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha');
    expect(html).toContain('beta');
    expect(html).toContain('1 line');
  });
});

describe('digest json', () => {
  it('returns night, badLines and rows, owner null kept', async () => {
    const { res, body } = await json(FULL);
    expect(res.status).toBe(200);
    expect(body.night).toBe(FULL);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'flaky', 'mid', 'zebra']);
    expect(body.rows[0]?.owner).toBeNull();
  });

  it('404s with an error body for a night with no file or a bad name', async () => {
    const { res, body } = await json(MISSING);
    expect(res.status).toBe(404);
    expect(body).toMatchObject({ night: MISSING });
    expect(body).toHaveProperty('error');
    expect((await app.request('/api/digest/not-a-night')).status).toBe(404);
  });

  it('returns no rows for an empty night', async () => {
    const { res, body } = await json(EMPTY);
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts the bad line and keeps the good jobs', async () => {
    const { res, body } = await json(BAD);
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'beta']);
  });
});

describe('page and json agree', () => {
  it('list the same jobs in the same order', async () => {
    const { body } = await json(FULL);
    const html = await (await app.request(`/digest/${FULL}`)).text();
    const jobs = body.rows.map((r) => r.job);
    const byAppearance = [...jobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(byAppearance).toEqual(jobs);
  });
});
