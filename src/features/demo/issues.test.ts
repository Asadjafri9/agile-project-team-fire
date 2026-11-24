// Regression tests reproducing the team's GitHub issues exactly as reported.
import { describe, expect, it } from 'vitest';
import { cloneInitialState } from './model';
import { snapshot, sprintSummary } from './metrics';
import { allowed, reduceDemo } from './store';

const today = new Date('2026-11-15T09:00:00Z');
const fresh = () => cloneInitialState(today);

describe('issue #2: analytics compares instants, not strings', () => {
  it('A: allocation at 09:00 Karachi counts before a 05:00Z cutoff (10:00 Karachi)', () => {
    const p = fresh().projects[0];
    const s2 = p.sprints.find(s => s.id === 's2')!;
    const commitAt = p.events.find(e => e.sprintId === 's2' && e.kind === 'scope-add')!.at; // 09:00 +05:00 on start day
    const cutoff = new Date(Date.parse(commitAt) + 60 * 60 * 1000).toISOString(); // one hour later, in UTC form
    expect(snapshot(s2, p.events, cutoff).current).toBe(18);
  });
  it('B: a Done at 20:00Z belongs to the next Karachi day', () => {
    const p = fresh().projects[0];
    const s2 = p.sprints.find(s => s.id === 's2')!;
    const day = p.sprints.find(s => s.id === 's2')!.start;
    const lateUtc = `${day}T20:00:00.000Z`; // 01:00 next day in Karachi
    const events = [...p.events, { id: 'x', sequence: 999, at: lateUtc, sprintId: 's2', itemId: 'i104', kind: 'status' as const, status: 'Done' as const, actor: 't' }];
    expect(snapshot(s2, events, `${day}T23:59:59+05:00`).current).toBe(18);
  });
});

describe('issue #4: sprint start validates dates', () => {
  const ready = () => {
    let state = reduceDemo(fresh(), { type: 'complete', projectId: 'team-fire', sprintId: 's2' });
    state = reduceDemo(state, { type: 'allocate', projectId: 'team-fire', itemId: 'i104', sprintId: 's3' });
    return state;
  };
  it('A: a missing start date blocks the start', () => {
    const state = reduceDemo(ready(), { type: 'sprint', projectId: 'team-fire', sprintId: 's3', patch: { start: '' } });
    const after = reduceDemo(state, { type: 'start', projectId: 'team-fire', sprintId: 's3' });
    expect(after.projects[0].sprints.find(s => s.id === 's3')!.state).toBe('planned');
  });
  it('B: an expired end date blocks the start', () => {
    const state = reduceDemo(ready(), { type: 'sprint', projectId: 'team-fire', sprintId: 's3', patch: { start: '2026-10-01', end: '2026-10-20' } });
    const after = reduceDemo(state, { type: 'start', projectId: 'team-fire', sprintId: 's3' });
    expect(after.projects[0].sprints.find(s => s.id === 's3')!.state).toBe('planned');
  });
  it('control: valid future dates start the sprint', () => {
    const after = reduceDemo(ready(), { type: 'start', projectId: 'team-fire', sprintId: 's3' });
    expect(after.projects[0].sprints.find(s => s.id === 's3')!.state).toBe('active');
  });
});

describe('issue #7: viewer cannot create work items', () => {
  it('reducer refuses and the capability is off', () => {
    const viewer = reduceDemo(fresh(), { type: 'role', role: 'Viewer' });
    expect(allowed('Viewer', 'create')).toBe(false);
    expect(reduceDemo(viewer, { type: 'create-item', projectId: 'team-fire', title: 'x', typeName: 'Task', points: 1, priority: 'Low' })).toBe(viewer);
  });
});

describe('issue #6: viewer cannot configure WIP', () => {
  it('capability is manager-only', () => {
    expect(allowed('Viewer', 'wip')).toBe(false);
    expect(allowed('Developer', 'wip')).toBe(false);
    expect(allowed('Scrum Master', 'wip')).toBe(true);
  });
});

describe('issue #10: planned-sprint allocations do not touch the active sprint', () => {
  it('allocating backlog items to planned Sprint 03 leaves Sprint 02 metrics unchanged', () => {
    let state = fresh();
    const before = state.projects[0];
    const s2 = before.sprints.find(s => s.id === 's2')!;
    const baseline = sprintSummary(before, s2);
    for (const itemId of ['i108', 'i109', 'i110', 'i111']) {
      state = reduceDemo(state, { type: 'allocate', projectId: 'team-fire', itemId, sprintId: 's3' });
    }
    const p = state.projects[0];
    expect(p.items.filter(i => i.sprintId === 's3').length).toBe(4);
    expect(p.events.filter(e => e.sprintId === 's2' && ['i108', 'i109', 'i110', 'i111'].includes(e.itemId))).toHaveLength(0);
    const after = sprintSummary(p, p.sprints.find(s => s.id === 's2')!);
    expect(after.unresolved).toBe(baseline.unresolved);
    expect(after.unresolved).toBe(18);
    expect(after.scopeChangeCount).toBe(0);
  });
});

describe('QA Tester role', () => {
  it('has Developer-level working rights and no management rights', () => {
    for (const cap of ['create', 'move', 'comment', 'attach', 'evidence'] as const) expect(allowed('QA Tester', cap)).toBe(true);
    for (const cap of ['plan', 'complete', 'prioritize', 'team', 'archive', 'wip'] as const) expect(allowed('QA Tester', cap)).toBe(false);
  });
  it('can move a card in demo mode', () => {
    const qa = reduceDemo(fresh(), { type: 'role', role: 'QA Tester' });
    const moved = reduceDemo(qa, { type: 'move', projectId: 'team-fire', itemId: 'i107', status: 'In Progress' });
    expect(moved.projects[0].items.find(i => i.id === 'i107')?.status).toBe('In Progress');
  });
});
