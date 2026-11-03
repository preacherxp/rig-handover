import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const REAL_RUNS = join(import.meta.dirname, '..', 'runs');
const MARKER = 'TEST-MARKER';

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.LANE_MARKER = MARKER;
  runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  // runs/ is read-only: copy the real night, never write into it.
  copyFileSync(join(REAL_RUNS, '2026-10-28.jsonl'), join(runsDir, '2026-10-28.jsonl'));
  writeFileSync(join(runsDir, '2026-11-01.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-11-02.jsonl'),
    [
      '{"at":"2026-11-02T01:00:00+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"lock held"}',
      '{"at":"2026-11-02T01:00:30+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
      '{"at":',
      '',
    ].join('\n'),
  );
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

type Row = { job: string; runs: number; retries: number; lastStatus: string };
type NightJson = { night: string; rows: Row[]; badLines: number };

const EXPECTED_JOBS = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

// Splits the page into table rows; the header row is the first one.
function bodyRows(html: string): string[] {
  return html.split('<tr').slice(2);
}

describe('GET /digest/:night', () => {
  it('renders the night with one row per job and the lane banner', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest · 2026-10-28');
    expect(html).toContain(MARKER);
    expect(bodyRows(html)).toHaveLength(5);
    expect(html.split('<tr').length - 1).toBe(6);
  });

  it('marks retries >= 3 and a fail last status as warn', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    const rows = bodyRows(html);
    const rowFor = (job: string) => rows.find((r) => r.includes(job)) ?? '';
    expect(rowFor('fixtures/refresh')).toContain('class="warn"');
    expect(rowFor('notes/backup')).toContain('class="warn"');
    expect(rowFor('lane/sync')).not.toContain('class="warn"');
    expect(rowFor('rig/rotate-logs')).not.toContain('class="warn"');
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request('/digest/2026-11-01');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no such night'); // our 404, not Hono's unknown-route one
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the night as JSON with rows sorted by job', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightJson;
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(5);
    expect(body.rows.map((r) => r.job)).toEqual(EXPECTED_JOBS);
  });

  it('lists the jobs in the same order as the page', async () => {
    const json = (await (await app.request('/api/digest/2026-10-28')).json()) as NightJson;
    const html = await (await app.request('/digest/2026-10-28')).text();
    const positions = json.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('answers 404 with an error for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('returns no rows and no bad lines for an empty night', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightJson;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts the bad line and keeps the good lines of the job', async () => {
    const res = await app.request('/api/digest/2026-11-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightJson;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.job).toBe('lane/sync');
    expect(body.rows[0]?.runs).toBe(2);
  });
});

describe('GET /digest/:night with a bad line', () => {
  it('renders the one job from the good lines', async () => {
    const res = await app.request('/digest/2026-11-02');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(bodyRows(html)).toHaveLength(1);
    expect(html).toContain('lane/sync');
  });
});
