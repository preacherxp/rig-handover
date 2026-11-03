import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';
import type { RunStatus } from './types.js';

export type Counts = { ok: number; retry: number; fail: number };

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

// Counts the parsed lines of runs/<night>.jsonl by status. Bad lines are not counted.
// null when the night has no file.
export function countNight(runsDir: string, night: string): Counts | null {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: Counts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const l = parseLine(raw);
    if (!l) continue;
    counts[l.status as RunStatus]++;
  }
  return counts;
}
