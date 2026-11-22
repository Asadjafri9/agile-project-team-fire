import { describe, expect, it } from 'vitest';
import { allowed, canMoveToDone, reduceDemo, wipWarning } from './store';
import { cloneInitialState, Event, Sprint, WorkItem } from './model';
import { completionLabel, csvCell, localDate, series, snapshot, sprintSummary, sprintSummaryCsv, zonedDayEnd } from './metrics';

const TEST_TODAY = new Date('2026-11-15T12:00:00Z');

describe('requirements metric fixture', () => {
  const sprint: Sprint = { id: 'fixture', name: 'Fixture', goal: '', state: 'completed', start: '2026-01-01', end: '2026-01-14', pointCapacity: 10, hourCapacity: 40, originalItemIds: ['A', 'B'], frozenPoints: { A: 3, B: 5 } };
  const data: Event[] = [
    { id: '1', sequence: 1, at: '2026-01-01T08:00:00Z', sprintId: 'fixture', itemId: 'A', kind: 'scope-add', points: 3, actor: 'test' },
    { id: '2', sequence: 2, at: '2026-01-01T08:01:00Z', sprintId: 'fixture', itemId: 'B', kind: 'scope-add', points: 5, actor: 'test' },
    { id: '3', sequence: 3, at: '2026-01-02T08:00:00Z', sprintId: 'fixture', itemId: 'A', kind: 'status', status: 'Done', actor: 'test' },
    { id: '4', sequence: 4, at: '2026-01-03T08:00:00Z', sprintId: 'fixture', itemId: 'C', kind: 'scope-add', points: 2, actor: 'test' },
    { id: '5', sequence: 5, at: '2026-01-04T08:00:00Z', sprintId: 'fixture', itemId: 'B', kind: 'scope-remove', actor: 'test' },
    { id: '6', sequence: 6, at: '2026-01-05T08:00:00Z', sprintId: 'fixture', itemId: 'C', kind: 'status', status: 'Done', actor: 'test' },
  ];
  it('keeps original commitment apart from changing scope and freezes delivered points', () => {
    expect(snapshot(sprint, data, '2026-01-01T23:00:00Z')).toMatchObject({ commitment: 8, original: 8, current: 8 });
    expect(snapshot(sprint, data, '2026-01-02T23:00:00Z')).toMatchObject({ original: 5, current: 5 });
    expect(snapshot(sprint, data, '2026-01-03T23:00:00Z')).toMatchObject({ original: 5, current: 7 });
    expect(snapshot(sprint, data, '2026-01-04T23:00:00Z')).toMatchObject({ original: 5, current: 2 });
    const final = snapshot(sprint, data, '2026-01-05T23:00:00Z');
    expect(final).toMatchObject({ original: 5, current: 0, delivered: 5, originalDelivered: 3 });
    expect(final.originalDelivered / final.commitment * 100).toBe(37.5);
    expect(final.counts.Done).toBe(2);
    expect(snapshot(sprint, [...data, { id: '7', sequence: 7, at: '2026-01-06T08:00:00Z', sprintId: 'other', itemId: 'B', kind: 'status', status: 'Done', actor: 'test' }], '2026-01-07T00:00:00Z')).toEqual(final);
  });
});

describe('local workflow', () => {
  it('warns on WIP but leaves a move possible, and gates Done on checklists', () => {
    const p = cloneInitialState(TEST_TODAY).projects[0]; const item = p.items.find(i => i.id === 'i107')!;
    expect(wipWarning(p.items, 'In Progress', 1, item.id)).toBe(true);
    expect(canMoveToDone(item)).toBe(false);
    const done = { ...item, checklist: item.checklist.map(c => ({ ...c, done: true })) } as WorkItem;
    expect(canMoveToDone(done)).toBe(true);
    const moved = reduceDemo(cloneInitialState(TEST_TODAY), { type: 'move', projectId: p.id, itemId: item.id, status: 'In Progress' });
    expect(moved.projects[0].items.find(i => i.id === item.id)?.status).toBe('In Progress');
  });
  it('enforces role visibility and mutation boundaries', () => {
    expect(allowed('Viewer', 'move')).toBe(false);
    expect(allowed('Developer', 'move')).toBe(true);
    expect(allowed('Developer', 'create')).toBe(true);
    expect(allowed('Developer', 'plan')).toBe(false);
    expect(allowed('Scrum Master', 'prioritize')).toBe(false);
    expect(allowed('Product Owner', 'prioritize')).toBe(true);
    expect(allowed('Scrum Master', 'complete')).toBe(true);
    const viewer = reduceDemo(cloneInitialState(TEST_TODAY), { type: 'role', role: 'Viewer' });
    expect(reduceDemo(viewer, { type: 'create-item', projectId: 'team-fire', title: 'Hidden', typeName: 'Task', points: 1, priority: 'Low' })).toBe(viewer);
    const owner = cloneInitialState(TEST_TODAY);
    expect(reduceDemo(owner, { type: 'update-item', projectId: 'team-fire', itemId: 'i104', patch: { points: 13 } })).toBe(owner);
  });
  it('completes an active sprint, carries unfinished work, starts a planned sprint, and resets', () => {
    let state = cloneInitialState(TEST_TODAY);
    state = reduceDemo(state, { type: 'complete', projectId: 'team-fire', sprintId: 's2' });
    expect(state.projects[0].sprints.find(s => s.id === 's2')?.state).toBe('completed');
    expect(state.projects[0].items.find(i => i.id === 'i104')?.sprintId).toBeNull();
    state = reduceDemo(state, { type: 'allocate', projectId: 'team-fire', itemId: 'i104', sprintId: 's3' });
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const fortnight = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    state = reduceDemo(state, { type: 'sprint', projectId: 'team-fire', sprintId: 's3', patch: { start: tomorrow, end: fortnight } });
    state = reduceDemo(state, { type: 'start', projectId: 'team-fire', sprintId: 's3' });
    expect(state.projects[0].sprints.find(s => s.id === 's3')?.state).toBe('active');
    expect(state.projects[0].sprints.find(s => s.id === 's3')?.frozenPoints.i104).toBe(5);
    expect(reduceDemo(state, { type: 'reset' })).toEqual(cloneInitialState());
  });
});

describe('metric timezone boundaries', () => {
  const sprint: Sprint = { id: 'tz', name: 'Timezone', goal: '', state: 'completed', start: '2026-11-01', end: '2026-11-14', pointCapacity: 5, hourCapacity: 20, originalItemIds: ['A'], frozenPoints: { A: 5 } };
  const events: Event[] = [
    { id: '1', sequence: 1, at: '2026-11-09T10:00:00.000Z', sprintId: 'tz', itemId: 'A', kind: 'scope-add', points: 5, status: 'In Progress', actor: 'test' },
    { id: '2', sequence: 2, at: '2026-11-10T20:00:00.000Z', sprintId: 'tz', itemId: 'A', kind: 'status', status: 'Done', actor: 'test' },
  ];
  it('compares mixed UTC offsets numerically instead of as strings', () => {
    const dayEnd = snapshot(sprint, events, '2026-11-10T23:59:59+05:00');
    expect(dayEnd.originalDelivered).toBe(0);
    expect(dayEnd.original).toBe(5);
    const nextDay = snapshot(sprint, events, '2026-11-11T23:59:59+05:00');
    expect(nextDay.originalDelivered).toBe(5);
    expect(nextDay.original).toBe(0);
  });
});

describe('sprint summary exports', () => {
  it('uses the same frozen completed-sprint dataset as the dashboard', () => {
    const project = cloneInitialState(TEST_TODAY).projects[0];
    const completed = project.sprints.find(s => s.id === 's1')!;
    const summary = sprintSummary(project, completed);
    expect(summary.commitment).toBe(16);
    expect(summary.originalDelivered).toBe(16);
    expect(summary.delivered).toBe(16);
    expect(summary.unresolved).toBe(0);
    expect(summary.completionPercent).toBe(100);
    expect(summary.outcomes).toHaveLength(3);
    expect(summary.outcomes.every(o => o.original && !o.addedMidSprint)).toBe(true);
    expect(completionLabel(summary)).toBe('100%');
    expect(completionLabel({ completionPercent: null })).toBe('N/A');
  });
  it('escapes CSV cells and neutralises formula injection', () => {
    expect(csvCell('hello, world')).toBe('"hello, world"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    const project = cloneInitialState(TEST_TODAY).projects[0];
    const completed = project.sprints.find(s => s.id === 's1')!;
    const csv = sprintSummaryCsv(sprintSummary(project, completed));
    expect(csv).toContain('"Project","Team Fire"');
    expect(csv).toContain('"Key","Title","Points","Final status","Original commitment","Added mid-sprint"');
    expect(csv).toContain('"FIRE-101"');
  });
});

describe('project-timezone day boundaries', () => {
  it('builds local day-end instants and local dates for a non-+05:00 zone', () => {
    expect(zonedDayEnd('2026-11-10', 'America/New_York')).toBe('2026-11-11T04:59:59.999Z');
    expect(zonedDayEnd('2026-11-10', 'Asia/Karachi')).toBe('2026-11-10T18:59:59.999Z');
    expect(localDate('2026-11-11T03:00:00.000Z', 'America/New_York')).toBe('2026-11-10');
  });
  it('counts a 03:00Z next-day event in the prior New York day', () => {
    const sprint: Sprint = { id: 'ny', name: 'New York', goal: '', state: 'completed', start: '2026-11-01', end: '2026-11-14', pointCapacity: 5, hourCapacity: 20, originalItemIds: ['A'], frozenPoints: { A: 5 } };
    const events: Event[] = [
      { id: '1', sequence: 1, at: '2026-11-09T10:00:00.000Z', sprintId: 'ny', itemId: 'A', kind: 'scope-add', points: 5, status: 'In Progress', actor: 'test' },
      { id: '2', sequence: 2, at: '2026-11-11T03:00:00.000Z', sprintId: 'ny', itemId: 'A', kind: 'status', status: 'Done', actor: 'test' },
    ];
    const dayEnd = zonedDayEnd('2026-11-10', 'America/New_York');
    expect(localDate(events[1].at, 'America/New_York')).toBe('2026-11-10');
    expect(snapshot(sprint, events, dayEnd).originalDelivered).toBe(5);
    expect(snapshot(sprint, events, zonedDayEnd('2026-11-09', 'America/New_York')).originalDelivered).toBe(0);
  });
});

describe('sprint series overrun', () => {
  const timeZone = 'Asia/Karachi';
  it('continues an active sprint through today after its planned end', () => {
    const sprint: Sprint = { id: 'run', name: 'Overrun', goal: '', state: 'active', start: '2026-10-10', end: '2026-10-20', pointCapacity: 10, hourCapacity: 40, originalItemIds: ['A'], frozenPoints: { A: 10 } };
    const events: Event[] = [
      { id: '1', sequence: 1, at: '2026-10-10T09:00:00+05:00', sprintId: 'run', itemId: 'A', kind: 'scope-add', points: 10, status: 'In Progress', actor: 'test' },
    ];
    const rows = series(sprint, events, '2026-10-25', timeZone);
    expect(rows.at(-1)?.date).toBe('2026-10-25');
    expect(rows.map(row => row.date)).toContain('2026-10-21');
    expect(rows.filter(row => row.date > '2026-10-20').every(row => row.ideal === 0)).toBe(true);
    expect(rows.find(row => row.date === '2026-10-25')?.original).toBe(10);
  });
  it('includes extra days when a completed sprint finished after its planned end', () => {
    const sprint: Sprint = {
      id: 'late', name: 'Late finish', goal: '', state: 'completed', start: '2026-11-01', end: '2026-11-10',
      pointCapacity: 5, hourCapacity: 20, originalItemIds: ['A'], frozenPoints: { A: 5 },
      completedAt: '2026-11-12T12:00:00+05:00', result: { delivered: 5, originalDelivered: 5, commitment: 5, cutoff: '2026-11-12T12:00:00+05:00' },
    };
    const events: Event[] = [
      { id: '1', sequence: 1, at: '2026-11-01T09:00:00+05:00', sprintId: 'late', itemId: 'A', kind: 'scope-add', points: 5, status: 'In Progress', actor: 'test' },
      { id: '2', sequence: 2, at: '2026-11-11T12:00:00+05:00', sprintId: 'late', itemId: 'A', kind: 'status', status: 'Done', actor: 'test' },
    ];
    const rows = series(sprint, events, '2026-11-13', timeZone);
    expect(rows.at(-1)?.date).toBe('2026-11-12');
    expect(rows.map(row => row.date)).toContain('2026-11-11');
    expect(rows.map(row => row.date)).toContain('2026-11-12');
    expect(rows.filter(row => row.date > '2026-11-10').every(row => row.ideal === 0)).toBe(true);
    expect(rows.find(row => row.date === '2026-11-12')?.original).toBe(0);
  });
});
