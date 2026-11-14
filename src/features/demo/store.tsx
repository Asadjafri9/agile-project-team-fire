'use client';
import { createContext, useContext, useEffect, useReducer, useState } from 'react';
import { cloneInitialState, DemoState, Event, ItemType, Priority, Role, Sprint, Status, WorkItem } from './model';

export type Action =
  | { type: 'hydrate'; value: DemoState } | { type: 'enter' } | { type: 'role'; role: Role } | { type: 'reset' }
  | { type: 'create-project'; name: string }
  | { type: 'create-sprint'; projectId: string; name: string }
  | { type: 'create-item'; projectId: string; title: string; typeName: ItemType; points: number | null; priority: Priority }
  | { type: 'update-item'; projectId: string; itemId: string; patch: Partial<Pick<WorkItem, 'title' | 'description' | 'points' | 'hours' | 'assigneeId' | 'priority' | 'epic'>> }
  | { type: 'prioritize'; projectId: string; itemId: string; direction: -1 | 1 }
  | { type: 'check'; projectId: string; itemId: string; index: number }
  | { type: 'allocate'; projectId: string; itemId: string; sprintId: string | null }
  | { type: 'move'; projectId: string; itemId: string; status: Status }
  | { type: 'sprint'; projectId: string; sprintId: string; patch: Partial<Pick<Sprint, 'goal' | 'start' | 'end' | 'pointCapacity' | 'hourCapacity'>> }
  | { type: 'start'; projectId: string; sprintId: string }
  | { type: 'complete'; projectId: string; sprintId: string };

export function allowed(role: Role, action: 'create' | 'prioritize' | 'plan' | 'move' | 'complete' | 'team'): boolean {
  if (role === 'Viewer') return false;
  if (action === 'move' || action === 'create') return true;
  if (action === 'prioritize') return role === 'Product Owner';
  if (action === 'team') return role === 'Product Owner' || role === 'Scrum Master';
  if (action === 'complete' || action === 'plan') return role === 'Product Owner' || role === 'Scrum Master';
  return false;
}
export const wipWarning = (items: WorkItem[], status: Status, limit: number, movingId: string): boolean => status !== 'Done' && status !== 'To Do' && items.filter(i => i.status === status && i.id !== movingId).length + 1 > limit;
export const canMoveToDone = (item: WorkItem): boolean => item.checklist.every(c => c.done);

function addEvent(state: DemoState, projectId: string, event: Omit<Event, 'id' | 'sequence' | 'at'>) {
  const p = state.projects.find(p => p.id === projectId)!;
  const sequence = Math.max(0, ...p.events.map(e => e.sequence)) + 1;
  p.events.push({ ...event, id: `e${sequence}`, sequence, at: new Date().toISOString() });
}
export function reduceDemo(previous: DemoState, action: Action): DemoState {
  if (action.type === 'hydrate') return action.value?.version === 1 ? action.value : previous;
  if (action.type === 'reset') return cloneInitialState();
  const state: DemoState = JSON.parse(JSON.stringify(previous));
  if (action.type === 'enter') { state.entered = true; return state; }
  if (action.type === 'role') { state.role = action.role; return state; }
  if (action.type === 'create-project') {
    if (!allowed(state.role, 'team') || !action.name.trim()) return previous;
    const p = cloneInitialState().projects[0];
    p.id = `project-${Date.now()}`; p.name = action.name.trim(); p.code = `PRJ`; p.items = []; p.sprints = []; p.events = []; p.evidence = [];
    state.projects.push(p); return state;
  }
  const p = state.projects.find(p => p.id === action.projectId);
  if (!p) return previous;
  if (action.type === 'create-sprint') {
    if (!allowed(state.role, 'plan') || !action.name.trim()) return previous;
    const n = p.sprints.length + 1;
    p.sprints.push({ id: `s${Date.now()}`, name: action.name.trim(), goal: '', state: 'planned', start: new Date().toISOString().slice(0, 10), end: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), pointCapacity: 20, hourCapacity: 70, originalItemIds: [], frozenPoints: {} });
  } else if (action.type === 'create-item') {
    if (!allowed(state.role, 'create') || !action.title.trim()) return previous;
    const n = Math.max(100, ...p.items.map(i => Number(i.key.split('-')[1]) || 0)) + 1;
    p.items.push({ id: `i${n}`, key: `${p.code}-${String(n).padStart(3, '0')}`, title: action.title.trim(), description: '', type: action.typeName, priority: action.priority, points: action.points, hours: null, status: 'To Do', assigneeId: null, epic: 'Unassigned', labels: [], wbs: '—', sprintId: null, checklist: [], order: Math.max(0, ...p.items.map(i => i.order)) + 1 });
  } else if (action.type === 'update-item') {
    if (state.role === 'Viewer') return previous;
    const i = p.items.find(i => i.id === action.itemId); if (!i) return previous;
    if (i.sprintId && p.sprints.find(s => s.id === i.sprintId)?.state === 'active' && ('points' in action.patch || 'hours' in action.patch)) return previous;
    Object.assign(i, action.patch);
  } else if (action.type === 'prioritize') {
    if (!allowed(state.role, 'prioritize')) return previous;
    const rows = p.items.filter(i => !i.sprintId).sort((a, b) => a.order - b.order);
    const index = rows.findIndex(i => i.id === action.itemId), other = rows[index + action.direction];
    if (index < 0 || !other) return previous;
    const order = rows[index].order; rows[index].order = other.order; other.order = order;
  } else if (action.type === 'check') {
    if (state.role === 'Viewer') return previous;
    const i = p.items.find(i => i.id === action.itemId); if (!i?.checklist[action.index]) return previous;
    i.checklist[action.index].done = !i.checklist[action.index].done;
  } else if (action.type === 'allocate') {
    if (!allowed(state.role, 'plan')) return previous;
    const i = p.items.find(i => i.id === action.itemId), s = p.sprints.find(s => s.id === action.sprintId);
    if (!i || i.status === 'Done' || (action.sprintId && (!s || s.state === 'completed'))) return previous;
    const old = p.sprints.find(s => s.id === i.sprintId);
    if (old?.state === 'completed') return previous;
    if (old?.state === 'active') addEvent(state, p.id, { sprintId: old.id, itemId: i.id, kind: 'scope-remove', actor: 'demo' });
    i.sprintId = action.sprintId;
    if (s?.state === 'active') addEvent(state, p.id, { sprintId: s.id, itemId: i.id, kind: 'scope-add', points: i.points ?? 0, status: i.status, actor: 'demo' });
  } else if (action.type === 'move') {
    if (!allowed(state.role, 'move')) return previous;
    const i = p.items.find(i => i.id === action.itemId), s = p.sprints.find(s => s.id === i?.sprintId);
    if (!i || i.status === action.status || (action.status === 'Done' && !canMoveToDone(i)) || s?.state === 'completed') return previous;
    i.status = action.status;
    if (s?.state === 'active') addEvent(state, p.id, { sprintId: s.id, itemId: i.id, kind: 'status', status: action.status, actor: 'demo' });
  } else if (action.type === 'sprint') {
    if (!allowed(state.role, 'plan')) return previous;
    const s = p.sprints.find(s => s.id === action.sprintId); if (!s || s.state !== 'planned') return previous;
    Object.assign(s, action.patch);
  } else if (action.type === 'start') {
    if (!allowed(state.role, 'plan') || p.sprints.some(s => s.state === 'active')) return previous;
    const s = p.sprints.find(s => s.id === action.sprintId);
    if (!s || s.state !== 'planned' || s.start >= s.end) return previous;
    s.state = 'active'; s.originalItemIds = p.items.filter(i => i.sprintId === s.id).map(i => i.id);
    s.frozenPoints = Object.fromEntries(p.items.filter(i => i.sprintId === s.id).map(i => [i.id, i.points ?? 0]));
    for (const i of p.items.filter(i => i.sprintId === s.id)) addEvent(state, p.id, { sprintId: s.id, itemId: i.id, kind: 'scope-add', points: i.points ?? 0, status: i.status, actor: 'demo' });
  } else if (action.type === 'complete') {
    if (!allowed(state.role, 'complete')) return previous;
    const s = p.sprints.find(s => s.id === action.sprintId); if (!s || s.state !== 'active') return previous;
    const included = p.items.filter(i => i.sprintId === s.id);
    const delivered = included.filter(i => i.status === 'Done').reduce((sum, i) => sum + (p.events.filter(e => e.sprintId === s.id && e.itemId === i.id && e.kind === 'scope-add').at(-1)?.points ?? i.points ?? 0), 0);
    const originalDelivered = included.filter(i => i.status === 'Done' && s.originalItemIds.includes(i.id)).reduce((sum, i) => sum + (s.frozenPoints[i.id] ?? 0), 0);
    const commitment = Object.values(s.frozenPoints).reduce((a, b) => a + b, 0);
    s.state = 'completed'; s.completedAt = new Date().toISOString(); s.result = { delivered, originalDelivered, commitment, cutoff: s.completedAt };
    for (const i of included.filter(i => i.status !== 'Done')) i.sprintId = null;
  }
  return state;
}

const key = 'team-fire-prototype-v1';
const Context = createContext<{ state: DemoState; dispatch: React.Dispatch<Action>; ready: boolean } | null>(null);
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reduceDemo, undefined, cloneInitialState);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw) dispatch({ type: 'hydrate', value: JSON.parse(raw) }); } catch { /* Corrupt demo data falls back to seed. */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(key, JSON.stringify(state)); }, [state, ready]);
  return <Context.Provider value={{ state, dispatch, ready }}>{children}</Context.Provider>;
}
export function useDemo() { const value = useContext(Context); if (!value) throw new Error('DemoProvider missing'); return value; }
