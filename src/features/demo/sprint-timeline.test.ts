// Bolt 003 (SPR-01, FR-4, FR-5): one real-date timeline for charts, tables and exports.
import { describe, expect, it } from 'vitest';
import { createSprintDomain, ProjectCalendar } from './domain';
import { csvCell, idealRemaining, series, snapshot, sprintSummary, sprintSummaryCsv } from './metrics';
import { cloneInitialState, Event, Project, Sprint } from './model';
import { reduceDemo } from './store';

const KHI = 'Asia/Karachi';
const NY = 'America/New_York';
const sprint = (patch: Partial<Sprint> = {}): Sprint => ({
  id: 's', name: 'Sprint', goal: 'Goal', state: 'active', start: '2026-11-17', end: '2026-11-27',
  startedAt: '2026-11-20T04:00:00.000Z', timezone: KHI, pointCapacity: 10, hourCapacity: 10,
  originalItemIds: ['A', 'B'], frozenPoints: { A: 3, B: 5 }, ...patch,
});
const event = (sequence: number, at: string, itemId: string, patch: Partial<Event> = {}): Event =>
  ({ id: `e${sequence}`, sequence, at, sprintId: 's', itemId, kind: 'scope-add', actor: 'test', ...patch });
const commit = (at = '2026-11-20T04:00:00.005Z') => [event(1, at, 'A', { points: 3 }), event(2, at, 'B', { points: 5 })];
const done = (sequence: number, at: string, itemId = 'A') => event(sequence, at, itemId, { kind: 'status', status: 'Done' });
const project = (s: Sprint, events: Event[], timezone = KHI): Project =>
  ({ ...cloneInitialState(new Date('2026-11-22T09:00:00Z')).projects[0], timezone, sprints: [s], events });
const closed = (cutoff: string, patch: Partial<Sprint> = {}) => sprint({
  state: 'completed', completedAt: cutoff, result: { commitment: 8, delivered: 3, originalDelivered: 3, cutoff }, ...patch,
});
const actual = (rows: ReturnType<typeof series>) => rows.filter(r => r.current !== null);

describe('late and early starts', () => {
  const now = '2026-11-22T09:00:00.000Z';
  it('begins at the full commitment on the actual start, with no earlier samples', () => {
    const rows = series(sprint(), commit(), now);
    expect(rows[0]).toMatchObject({ kind: 'start', date: '2026-11-20', at: '2026-11-20T04:00:00.000Z', original: 8, current: 8, ideal: 8 });
    expect(rows[0].counts?.['To Do']).toBe(2);
  });
  it('is linear from the actual start to local midnight on the planned end', () => {
    const start = Date.parse('2026-11-20T04:00:00Z'), end = Date.parse('2026-11-26T19:00:00Z');
    expect(idealRemaining(sprint(), new Date((start + end) / 2).toISOString())).toBe(4);
    expect(idealRemaining(sprint(), new Date(end).toISOString())).toBe(0);
    expect(idealRemaining(sprint(), '2026-11-19T04:00:00Z')).toBeNull();
  });
  it('projects only the ideal beyond now', () => {
    const rows = series(sprint(), commit(), now);
    expect(actual(rows).at(-1)).toMatchObject({ kind: 'now', at: now, partial: true });
    expect(rows.at(-1)).toMatchObject({ kind: 'planned-end', at: '2026-11-26T19:00:00.000Z', ideal: 0, original: null, current: null, counts: null, scopeChange: null });
  });
  it('starts sampling on an early start', () => {
    const s = sprint({ start: '2026-11-25', end: '2026-12-05' });
    expect(series(s, commit(), now)[0]).toMatchObject({ kind: 'start', date: '2026-11-20', ideal: 8 });
  });
  it('counts commitment events written just after the recorded start', () => {
    expect(snapshot(sprint(), commit(), sprint().startedAt!).current).toBe(8);
  });
  it('keeps the commitment on the start day when it straddles midnight', () => {
    const s = sprint({ startedAt: '2026-11-20T18:59:59.998Z' });
    const rows = series(s, commit('2026-11-20T19:00:00.003Z'), now);
    expect(rows.find(r => r.kind === 'day' && r.date === '2026-11-20')?.current).toBe(8);
  });
  it('does not move a later re-addition back to the start', () => {
    const events = [...commit(), event(3, '2026-11-21T04:00:00Z', 'B', { kind: 'scope-remove' }), event(4, '2026-11-22T04:00:00Z', 'B', { points: 5 })];
    expect(snapshot(sprint(), events, '2026-11-21T05:00:00Z').current).toBe(3);
  });
  it('tolerates a browser clock slightly behind the database', () => {
    const summary = sprintSummary(project(sprint(), commit()), sprint(), '2026-11-20T03:59:59.000Z');
    expect(summary).toMatchObject({ cutoff: sprint().startedAt, unresolved: 8 });
    expect(actual(summary.timeline.samples).every(r => r.current === 8)).toBe(true);
  });
});

describe('completion and overrun', () => {
  it('stops actuals at an early completion and continues only the ideal', () => {
    const cutoff = '2026-11-23T07:00:00.000Z';
    const rows = series(closed(cutoff), [...commit(), done(3, '2026-11-22T05:00:00Z')], '2026-12-20T00:00:00Z');
    expect(actual(rows).at(-1)).toMatchObject({ kind: 'completion', at: cutoff, original: 5, current: 5, partial: false });
    expect(rows.at(-1)).toMatchObject({ kind: 'planned-end', ideal: 0, current: null });
  });
  it('ignores events after the frozen cutoff, even on the same day', () => {
    const cutoff = '2026-11-23T07:00:00.000Z', s = closed(cutoff);
    const events = [...commit(), done(3, '2026-11-22T05:00:00Z')];
    const before = sprintSummary(project(s, events), s);
    const reopened = event(4, '2026-11-23T09:00:00Z', 'A', { kind: 'status', status: 'To Do' });
    expect(sprintSummary(project(s, [...events, reopened]), s)).toEqual(before);
    expect(actual(before.timeline.samples).at(-1)?.current).toBe(before.unresolved);
  });
  it('prefers the frozen result cutoff over completedAt', () => {
    const s = { ...closed('2026-11-23T07:00:00.000Z'), completedAt: '2026-11-24T07:00:00.000Z' };
    expect(actual(series(s, commit(), '2026-12-01T00:00:00Z')).at(-1)?.at).toBe('2026-11-23T07:00:00.000Z');
  });
  it('keeps an overrun visible with today partial', () => {
    const now = '2026-11-30T09:00:00.000Z';
    const rows = series(sprint(), commit(), now);
    expect(rows.at(-1)).toMatchObject({ kind: 'now', date: '2026-11-30', partial: true, ideal: 0, current: 8 });
    expect(rows.map(r => r.date)).toContain('2026-11-28');
    expect(createSprintDomain(sprint(), KHI).isTodayPartial(now)).toBe(true);
  });
  it('ends a legacy completion at the local end of its planned day', () => {
    const s = sprint({ state: 'completed', end: '2026-11-14' });
    expect(createSprintDomain(s, KHI).timelineCutoff()).toBe('2026-11-14T18:59:59.999Z');
  });
});

describe('timezones', () => {
  it('puts a Karachi midnight event on the next local day', () => {
    const rows = series(sprint(), [...commit(), done(3, '2026-11-21T19:00:00.000Z')], '2026-11-23T09:00:00Z');
    const on = (date: string) => rows.find(r => r.kind === 'day' && r.date === date)?.current;
    expect([on('2026-11-21'), on('2026-11-22')]).toEqual([8, 5]);
  });
  it.each([
    ['2026-03-06', '2026-03-10', '2026-03-08', 23],
    ['2026-10-30', '2026-11-03', '2026-11-01', 25],
  ])('samples the New York DST change in %s to %s once per day', (start, end, changed, hours) => {
    const calendar = new ProjectCalendar(NY), startedAt = calendar.startOfDay(start);
    expect((Date.parse(calendar.endOfDay(changed)) + 1 - Date.parse(calendar.startOfDay(changed))) / 3_600_000).toBe(hours);
    const s = sprint({ start, end, startedAt, timezone: NY });
    const days = series(s, commit(startedAt), `${end}T20:00:00Z`).filter(r => r.kind === 'day').map(r => r.date);
    expect(days).toEqual(calendar.enumerateDays(start, end).slice(0, -1));
  });
  it.each([
    ['America/Santiago', '2026-09-06', '2026-09-05'], // midnight is skipped
    ['America/Santiago', '2026-04-05', '2026-04-04'], // 23:00-24:00 happens twice
    ['America/Nuuk', '2026-03-29', '2026-03-28'], // 23:00-24:00 is skipped
  ])('separates %s %s from the day before', (zone, day, previous) => {
    const calendar = new ProjectCalendar(zone);
    const first = Date.parse(calendar.startOfDay(day));
    expect(calendar.toLocalDate(new Date(first))).toBe(day);
    expect(calendar.toLocalDate(new Date(first - 1))).toBe(previous);
    expect(Date.parse(calendar.endOfDay(previous))).toBe(first - 1);
  });
  it('accepts the earliest date a date input can produce', () => {
    const s = sprint({ state: 'planned', start: '1000-01-01', end: '1000-01-01', startedAt: null });
    expect(() => sprintSummary(project(s, []), s)).not.toThrow();
  });
  it('is correct east and west of the date line', () => {
    expect(new ProjectCalendar('Pacific/Kiritimati').startOfDay('2026-11-20')).toBe('2026-11-19T10:00:00.000Z');
    expect(new ProjectCalendar('Etc/GMT+12').startOfDay('2026-11-20')).toBe('2026-11-20T12:00:00.000Z');
  });
  it('keeps the recorded timezone after the project setting changes', () => {
    const s = sprint(), now = '2026-11-22T09:00:00.000Z';
    const before = sprintSummary(project(s, commit(), KHI), s, now);
    const after = sprintSummary(project(s, commit(), NY), s, now);
    expect(after.timeline).toEqual(before.timeline);
    expect(after.timezone).toBe(KHI);
  });
});

describe('planned and legacy sprints', () => {
  it('gives a planned sprint no samples', () => {
    const s = sprint({ state: 'planned', startedAt: null, timezone: null });
    expect(sprintSummary(project(s, []), s).timeline).toMatchObject({ samples: [], startedAt: null });
  });
  it('identifies a missing start without inventing an ideal line', () => {
    const s = sprint({ startedAt: null, timezone: null });
    const { timeline } = sprintSummary(project(s, commit()), s, '2026-11-22T09:00:00.000Z');
    expect(timeline).toMatchObject({ startedAt: null, timezone: KHI, timezoneRecorded: false });
    expect(timeline.samples.every(r => r.ideal === null && r.kind !== 'start')).toBe(true);
    expect(timeline.samples[0]).toMatchObject({ date: '2026-11-20', current: 8 });
  });
  it('draws nothing when neither a start nor events were recorded', () => {
    expect(series(sprint({ startedAt: undefined }), [], '2026-11-22T09:00:00Z')).toEqual([]);
  });
  it('does not expand an absurd end date into millions of rows', () => {
    expect(series(sprint({ end: '9999-12-31' }), commit(), '2026-11-22T09:00:00Z').length).toBeLessThan(10);
  });
});

describe('exports', () => {
  it('writes every timeline sample to CSV with the same values', () => {
    const s = closed('2026-11-23T07:00:00.000Z');
    const summary = sprintSummary(project(s, [...commit(), done(3, '2026-11-22T05:00:00Z')]), s);
    const lines = sprintSummaryCsv(summary).split('\r\n');
    const header = lines.findIndex(line => line.startsWith('"Date","Local time"'));
    expect(header).toBeGreaterThan(0);
    const written = lines.slice(header + 1).map(line => line.slice(1, -1).split('","'));
    expect(written.map(c => [c[0], c[3], c[4], c[5], c[6]])).toEqual(
      summary.timeline.samples.map(r => [r.date, r.at, String(r.original ?? ''), String(r.current ?? ''), String(r.ideal ?? '')]));
  });
  it('labels the actual start, or says it was not recorded', () => {
    const csv = (s: Sprint) => sprintSummaryCsv(sprintSummary(project(s, commit()), s, '2026-11-22T09:00:00Z'));
    expect(csv(sprint())).toContain('"Actual start","2026-11-20T04:00:00.000Z"');
    expect(csv(sprint({ startedAt: null }))).toContain('"Actual start","Not recorded"');
  });
  it('leaves negative numbers numeric while still neutralising text formulas', () => {
    expect(csvCell(-1)).toBe('"-1"');
    expect(csvCell('-1+1')).toBe('"\'-1+1"');
  });
});

describe('demo clock', () => {
  it.each(['2026-11-21T18:59:59Z', '2026-11-21T19:00:00Z', '2027-03-01T23:30:00Z'])('rebases on the local day at %s', iso => {
    const p = cloneInitialState(new Date(iso)).projects[0], calendar = new ProjectCalendar(p.timezone);
    const [finished, active] = p.sprints;
    expect(calendar.dayCount(active.start, calendar.toLocalDate(iso))).toBe(6);
    expect(calendar.toLocalDate(active.startedAt!)).toBe(active.start);
    expect(calendar.toLocalDate(finished.completedAt!)).toBe(finished.end);
  });
  it('keeps wall-clock times when rebasing across daylight saving', () => {
    const calendar = new ProjectCalendar(NY);
    expect(calendar.shiftDays('2026-10-31T13:00:00.000Z', 2)).toBe('2026-11-02T14:00:00.000Z');
  });
  it('records start, timezone and completion from the injected clock', () => {
    const now = new Date('2026-11-22T09:00:00.000Z');
    let state = reduceDemo(cloneInitialState(now), { type: 'complete', projectId: 'team-fire', sprintId: 's2' }, now);
    state = reduceDemo(state, { type: 'allocate', projectId: 'team-fire', itemId: 'i108', sprintId: 's3' }, now);
    state = reduceDemo(state, { type: 'start', projectId: 'team-fire', sprintId: 's3' }, now);
    const [, finished, started] = state.projects[0].sprints;
    expect(finished.result?.cutoff).toBe(now.toISOString());
    expect(started).toMatchObject({ startedAt: now.toISOString(), timezone: KHI });
    expect(state.projects[0].events.at(-1)?.at).toBe(now.toISOString());
  });
  it('rejects a start from local midnight on the planned end, like the database', () => {
    const now = new Date('2026-11-22T09:00:00Z');
    let state = reduceDemo(cloneInitialState(now), { type: 'complete', projectId: 'team-fire', sprintId: 's2' }, now);
    state = reduceDemo(state, { type: 'allocate', projectId: 'team-fire', itemId: 'i108', sprintId: 's3' }, now);
    const { end } = state.projects[0].sprints[2];
    const midnight = Date.parse(new ProjectCalendar(KHI).startOfDay(end));
    const start = { type: 'start', projectId: 'team-fire', sprintId: 's3' } as const;
    expect(reduceDemo(state, start, new Date(midnight))).toBe(state);
    expect(reduceDemo(state, start, new Date(midnight - 1)).projects[0].sprints[2].state).toBe('active');
  });
});
