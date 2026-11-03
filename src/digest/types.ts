// Plan morning-digest § 1. The contract every part of § 2 starts against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times are as written in the log, offset kept (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // views show null as "—"
  runs: number; // lines for this job
  retries: number; // lines with status "retry"
  lastStatus: RunStatus;
  lastError: string | null; // the latest error this night, even if a later run went ok
  first: string;
  last: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; [] for an empty file ("nothing ran")
  badLines: number; // lines that didn't parse: counted, never thrown
};

// null when the night has no file (the routes answer 404).
export type ReadNight = (runsDir: string, night: string) => Night | null;
