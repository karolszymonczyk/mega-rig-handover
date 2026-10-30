export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night. `owner` stays null here; views render it through `ownerLabel`.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  // The log's own text, offset included. Never converted to UTC.
  firstAt: string;
  lastAt: string;
};

export type Night = {
  // Sorted by job.
  rows: DigestRow[];
  badLines: number;
};

// Implemented by `readNight` in `./read-night.ts`. Null: no such night (bad name or no file).
export type ReadNight = (runsDir: string, night: string) => Night | null;
