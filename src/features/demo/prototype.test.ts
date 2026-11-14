import { describe, expect, it } from 'vitest';
import { allowed, canMoveToDone, reduceDemo, wipWarning } from './store';
import { cloneInitialState, Event, Sprint, WorkItem } from './model';
import { snapshot } from './metrics';

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
    const p = cloneInitialState().projects[0]; const item = p.items.find(i => i.id === 'i107')!;
    expect(wipWarning(p.items, 'In Progress', 1, item.id)).toBe(true);
    expect(canMoveToDone(item)).toBe(false);
    const done = { ...item, checklist: item.checklist.map(c => ({ ...c, done: true })) } as WorkItem;
    expect(canMoveToDone(done)).toBe(true);
    const moved = reduceDemo(cloneInitialState(), { type: 'move', projectId: p.id, itemId: item.id, status: 'In Progress' });
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
    const viewer = reduceDemo(cloneInitialState(), { type: 'role', role: 'Viewer' });
    expect(reduceDemo(viewer, { type: 'create-item', projectId: 'team-fire', title: 'Hidden', typeName: 'Task', points: 1, priority: 'Low' })).toBe(viewer);
    const owner = cloneInitialState();
    expect(reduceDemo(owner, { type: 'update-item', projectId: 'team-fire', itemId: 'i104', patch: { points: 13 } })).toBe(owner);
  });
  it('completes an active sprint, carries unfinished work, starts a planned sprint, and resets', () => {
    let state = cloneInitialState();
    state = reduceDemo(state, { type: 'complete', projectId: 'team-fire', sprintId: 's2' });
    expect(state.projects[0].sprints.find(s => s.id === 's2')?.state).toBe('completed');
    expect(state.projects[0].items.find(i => i.id === 'i104')?.sprintId).toBeNull();
    state = reduceDemo(state, { type: 'allocate', projectId: 'team-fire', itemId: 'i104', sprintId: 's3' });
    state = reduceDemo(state, { type: 'start', projectId: 'team-fire', sprintId: 's3' });
    expect(state.projects[0].sprints.find(s => s.id === 's3')?.state).toBe('active');
    expect(state.projects[0].sprints.find(s => s.id === 's3')?.frozenPoints.i104).toBe(5);
    expect(reduceDemo(state, { type: 'reset' })).toEqual(cloneInitialState());
  });
});
