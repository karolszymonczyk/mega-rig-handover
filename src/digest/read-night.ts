import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunLine = {
  at: string;
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// A row plus the instants that decide which line is "latest" as the fold goes on.
type Tally = { row: DigestRow; firstTime: number; lastTime: number; lastErrorTime: number };

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const AT_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isStatus(value: unknown): value is RunStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || !AT_WITH_OFFSET.test(at)) return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (typeof owner !== 'string' && owner !== null) return null;
  if (typeof error !== 'string' && error !== undefined) return null;

  return { at, time, job, status, owner, error };
}

function startTally(line: RunLine): Tally {
  return {
    row: {
      job: line.job,
      owner: line.owner,
      runs: 0,
      retries: 0,
      lastStatus: line.status,
      lastError: null,
      firstAt: line.at,
      lastAt: line.at,
    },
    firstTime: line.time,
    lastTime: line.time,
    lastErrorTime: -Infinity,
  };
}

// "Latest" goes by the instant in `at`, not by file position; on a tie the later line wins.
function addLine(tally: Tally, line: RunLine): void {
  const { row } = tally;
  row.runs += 1;
  if (line.status === 'retry') row.retries += 1;
  if (line.time < tally.firstTime) {
    tally.firstTime = line.time;
    row.firstAt = line.at;
  }
  if (line.time >= tally.lastTime) {
    tally.lastTime = line.time;
    row.lastAt = line.at;
    row.lastStatus = line.status;
    row.owner = line.owner;
  }
  if (line.error !== undefined && line.time >= tally.lastErrorTime) {
    tally.lastErrorTime = line.time;
    row.lastError = line.error;
  }
}

function readLog(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  // Checked before touching the disk: a route param can't walk out of runsDir.
  if (!NIGHT.test(night)) return null;
  const log = readLog(join(runsDir, `${night}.jsonl`));
  if (log === null) return null;

  const tallies = new Map<string, Tally>();
  let badLines = 0;
  for (const text of log.split('\n')) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (line === null) {
      badLines += 1;
      continue;
    }
    const tally = tallies.get(line.job) ?? startTally(line);
    tallies.set(line.job, tally);
    addLine(tally, line);
  }

  const rows = [...tallies.values()]
    .map((tally) => tally.row)
    .sort((a, b) => (a.job < b.job ? -1 : 1));
  return { rows, badLines };
};

// What views show for an owner. The JSON keeps null.
export function ownerLabel(owner: string | null): string {
  return owner ?? '—';
}
