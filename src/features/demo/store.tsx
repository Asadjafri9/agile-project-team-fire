'use client';
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { ChecklistEntry, cloneInitialState, DemoState, Evidence, Event, Invitation, ItemType, Notification, Priority, Role, Sprint, Status, WorkItem } from './model';
import { ApiError, getWorkspace, LiveUser, loginRequest, logoutRequest, postAction, signupRequest, WorkspacePayload } from './live';

export type Action =
  | { type: 'hydrate'; value: DemoState } | { type: 'enter' } | { type: 'role'; role: Role } | { type: 'reset' }
  | { type: 'create-project'; name: string; description?: string; timezone?: string }
  | { type: 'create-sprint'; projectId: string; name: string; goal?: string; start?: string; end?: string; pointCapacity?: number; hourCapacity?: number }
  | { type: 'create-item'; projectId: string; title: string; typeName: ItemType; points: number | null; priority: Priority }
  | { type: 'update-item'; projectId: string; itemId: string; patch: Partial<Pick<WorkItem, 'title' | 'description' | 'points' | 'hours' | 'assigneeId' | 'priority' | 'epic' | 'labels'>> }
  | { type: 'prioritize'; projectId: string; itemId: string; direction: -1 | 1 }
  | { type: 'check'; projectId: string; itemId: string; index: number }
  | { type: 'allocate'; projectId: string; itemId: string; sprintId: string | null; reason?: string }
  | { type: 'move'; projectId: string; itemId: string; status: Status }
  | { type: 'sprint'; projectId: string; sprintId: string; patch: Partial<Pick<Sprint, 'goal' | 'start' | 'end' | 'pointCapacity' | 'hourCapacity'>> }
  | { type: 'start'; projectId: string; sprintId: string }
  | { type: 'complete'; projectId: string; sprintId: string; targetSprintId?: string | null }
  // ---- Live-only actions (ignored by the demo reducer) ----
  | { type: 'invite'; projectId: string; username: string; role: Role }
  | { type: 'respond-invite'; invitationId: string; accept: boolean }
  | { type: 'revoke-invite'; projectId: string; invitationId: string }
  | { type: 'set-role'; projectId: string; userId: string; role: Role }
  | { type: 'remove-member'; projectId: string; userId: string }
  | { type: 'leave'; projectId: string }
  | { type: 'transfer-owner'; projectId: string; userId: string }
  | { type: 'archive-project'; projectId: string }
  | { type: 'archive-item'; projectId: string; itemId: string; reason: string }
  | { type: 'set-wip'; projectId: string; limits: Partial<Record<Status, number | null>> }
  | { type: 'set-checklist'; projectId: string; itemId: string; checklist: ChecklistEntry[] }
  | { type: 'add-evidence'; projectId: string; evidence: Omit<Evidence, 'id' | 'file'>; file?: { path: string; name: string; size: number; mime: string } }
  | { type: 'remove-evidence'; projectId: string; evidenceId: string }
  | { type: 'comment'; projectId: string; itemId: string; body: string; mentions: string[] }
  | { type: 'edit-comment'; projectId: string; itemId: string; commentId: string; body: string; mentions: string[] }
  | { type: 'delete-comment'; projectId: string; itemId: string; commentId: string }
  | { type: 'add-attachment'; projectId: string; itemId: string; path: string; name: string; size: number; mime: string }
  | { type: 'remove-attachment'; projectId: string; itemId: string; attachmentId: string }
  | { type: 'read-notifications'; ids?: string[] };

/** Actions that only exist against the live backend. */
export const LIVE_ONLY_ACTIONS = new Set<Action['type']>(['invite', 'respond-invite', 'revoke-invite', 'set-role', 'remove-member', 'leave', 'transfer-owner', 'archive-project', 'archive-item', 'set-wip', 'set-checklist', 'add-evidence', 'remove-evidence', 'comment', 'edit-comment', 'delete-comment', 'add-attachment', 'remove-attachment', 'read-notifications']);

/** Mirrors requirements.md §3. The database enforces the same rules; this only hides controls. */
export type Capability = 'create' | 'prioritize' | 'plan' | 'move' | 'complete' | 'team' | 'archive' | 'wip' | 'evidence' | 'comment' | 'attach';
export function allowed(role: Role, action: Capability): boolean {
  if (role === 'Viewer') return false;
  if (action === 'move' || action === 'create' || action === 'evidence' || action === 'comment' || action === 'attach') return true;
  if (action === 'prioritize') return role === 'Product Owner';
  return role === 'Product Owner' || role === 'Scrum Master'; // team, plan, complete, archive, wip
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
  // Live-only actions have no demo behaviour; the server is the source of truth.
  if (LIVE_ONLY_ACTIONS.has(action.type) || !('projectId' in action)) return previous;
  const p = state.projects.find(p => p.id === action.projectId);
  if (!p) return previous;
  if (action.type === 'create-sprint') {
    if (!allowed(state.role, 'plan') || !action.name.trim()) return previous;
    const n = p.sprints.length + 1;
    const start = action.start ?? new Date().toISOString().slice(0, 10), end = action.end ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    if (end <= start) return previous;
    p.sprints.push({ id: `s${Date.now()}`, name: action.name.trim(), goal: action.goal?.trim() ?? '', state: 'planned', start, end, pointCapacity: action.pointCapacity ?? 20, hourCapacity: action.hourCapacity ?? 70, originalItemIds: [], frozenPoints: {} });
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
    // Issue #4: dates are required and an expired sprint cannot start.
    if (!s || s.state !== 'planned' || !s.start || !s.end || s.start >= s.end || s.end < new Date().toISOString().slice(0, 10)) return previous;
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
    const target = action.targetSprintId ? p.sprints.find(t => t.id === action.targetSprintId && t.state === 'planned') : undefined;
    for (const i of included.filter(i => i.status !== 'Done')) i.sprintId = target?.id ?? null; // SPR-06 carry-over
  }
  return state;
}

type Mode = 'demo' | 'live';
type DemoContextValue = {
  state: DemoState;
  dispatch: React.Dispatch<Action>;
  ready: boolean;
  mode: Mode;
  user: LiveUser | null;
  login: (username: string, password: string) => Promise<void>;
  /** Creates an account (ADR-014) and signs it in. */
  signup: (username: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  enterDemo: () => void;
  error: string | null;
  clearError: () => void;
  roles: Record<string, Role>;
  syncing: boolean;
  /** Live only: the signed-in user's pending invitations and notifications. */
  inbox: Invitation[];
  notifications: Notification[];
  /** Live only: re-fetch the workspace now (e.g. after an attachment upload). */
  refresh: () => Promise<void>;
};

const key = 'team-fire-prototype-v1';
const modeKey = 'team-fire-mode';

function writeMode(mode: Mode) {
  try { localStorage.setItem(modeKey, mode); } catch { /* Storage can be unavailable; the session still works. */ }
}
function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong';
}
function revisionsChanged(next: Record<string, number>, previous: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(next), ...Object.keys(previous)]);
  for (const projectId of keys) if (next[projectId] !== previous[projectId]) return true;
  return false;
}

const Context = createContext<DemoContextValue | null>(null);
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, rawDispatch] = useReducer(reduceDemo, undefined, cloneInitialState);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('demo');
  const [user, setUser] = useState<LiveUser | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [inbox, setInbox] = useState<Invitation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const stateRef = useRef(state);
  const modeRef = useRef<Mode>('demo');
  const rolesRef = useRef<Record<string, Role>>({});
  const revisionsRef = useRef<Record<string, number>>({});
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  const mutationRef = useRef(false);

  useEffect(() => { stateRef.current = state; }, [state]);

  const commit = useCallback((next: DemoState) => {
    stateRef.current = next;
    rawDispatch({ type: 'hydrate', value: next });
  }, []);

  const applyWorkspace = useCallback((payload: WorkspacePayload) => {
    revisionsRef.current = payload.revisions;
    rolesRef.current = payload.roles;
    setRoles(payload.roles);
    setInbox(payload.inbox ?? []);
    setNotifications(payload.notifications ?? []);
    setUser(payload.user);
    commit(payload.state);
    setReady(true);
  }, [commit]);

  const refreshWorkspace = useCallback(async (): Promise<WorkspacePayload | null> => {
    try {
      const payload = await getWorkspace();
      applyWorkspace(payload);
      return payload;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        rolesRef.current = {};
        setRoles({});
      } else {
        setError(messageOf(err));
      }
      return null;
    }
  }, [applyWorkspace]);

  useEffect(() => {
    let stored: Mode = 'demo';
    try { if (localStorage.getItem(modeKey) === 'live') stored = 'live'; } catch { /* Default to demo. */ }
    modeRef.current = stored;
    setMode(stored);
    if (stored === 'demo') {
      try {
        const raw = localStorage.getItem(key);
        if (raw) rawDispatch({ type: 'hydrate', value: JSON.parse(raw) });
      } catch { /* Corrupt demo data falls back to seed. */ }
      setReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      await refreshWorkspace();
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [refreshWorkspace]);

  useEffect(() => {
    if (mode !== 'demo' || modeRef.current !== 'demo' || !ready) return;
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Storage can be unavailable. */ }
  }, [state, mode, ready]);

  useEffect(() => {
    if (mode !== 'live' || !user) return;
    let disposed = false;
    const poll = async (force: boolean) => {
      if (disposed || document.visibilityState !== 'visible' || mutationRef.current) return;
      try {
        const payload = await getWorkspace();
        if (disposed || mutationRef.current) return;
        if (force || revisionsChanged(payload.revisions, revisionsRef.current)) applyWorkspace(payload);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) setUser(null);
      }
    };
    const interval = window.setInterval(() => { void poll(false); }, 4000);
    const onFocus = () => { void poll(true); };
    window.addEventListener('focus', onFocus);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [mode, user, applyWorkspace]);

  const dispatch = useCallback<React.Dispatch<Action>>((action) => {
    if (modeRef.current === 'demo') {
      rawDispatch(action);
      return;
    }
    if (action.type === 'role') {
      commit(reduceDemo(stateRef.current, action));
      return;
    }
    if (action.type === 'reset' || action.type === 'enter' || action.type === 'hydrate') return;

    const projectId = 'projectId' in action ? action.projectId : null;
    const role: Role = action.type === 'create-project'
      ? 'Product Owner'
      : projectId
        ? rolesRef.current[projectId] ?? stateRef.current.role
        : stateRef.current.role;

    const mutationId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined;
    const previous = stateRef.current;
    const base = previous.role === role ? previous : { ...previous, role };
    commit(reduceDemo(base, action));

    pendingRef.current += 1;
    setSyncing(true);
    queueRef.current = queueRef.current
      .then(async () => {
        mutationRef.current = true;
        try {
          // BOARD-03: a mutation id makes a retried card move write history once.
          await postAction(action.type === 'move' ? ({ ...action, mutationId } as Action) : action);
          await refreshWorkspace();
        } catch (err) {
          setError(messageOf(err));
          commit(previous);
          await refreshWorkspace();
        } finally {
          mutationRef.current = false;
          pendingRef.current = Math.max(0, pendingRef.current - 1);
          if (pendingRef.current === 0) setSyncing(false);
        }
      })
      .catch(() => {
        mutationRef.current = false;
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        if (pendingRef.current === 0) setSyncing(false);
      });
  }, [commit, refreshWorkspace]);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    setSyncing(true);
    try {
      await loginRequest(username, password);
      const payload = await getWorkspace();
      modeRef.current = 'live';
      setMode('live');
      writeMode('live');
      applyWorkspace(payload);
    } catch (err) {
      const message = messageOf(err);
      setError(message);
      throw new Error(message);
    } finally {
      setSyncing(false);
    }
  }, [applyWorkspace]);

  const signup = useCallback(async (username: string, displayName: string, password: string) => {
    setError(null);
    setSyncing(true);
    try {
      const created = await signupRequest(username, displayName, password);
      // If the backend did not start a session (e.g. confirmation required), sign in explicitly.
      if (!created.user) await loginRequest(username, password);
      const payload = await getWorkspace();
      modeRef.current = 'live';
      setMode('live');
      writeMode('live');
      applyWorkspace(payload);
    } catch (err) {
      const message = messageOf(err);
      setError(message);
      throw new Error(message);
    } finally {
      setSyncing(false);
    }
  }, [applyWorkspace]);

  const logout = useCallback(async () => {
    try { await logoutRequest(); } catch { /* The session may already be gone. */ }
    revisionsRef.current = {};
    rolesRef.current = {};
    setRoles({});
    setUser(null);
    setError(null);
    commit(cloneInitialState());
    setReady(true);
  }, [commit]);

  const enterDemo = useCallback(() => {
    modeRef.current = 'demo';
    setMode('demo');
    writeMode('demo');
    revisionsRef.current = {};
    rolesRef.current = {};
    setRoles({});
    setUser(null);
    setError(null);
    let next = cloneInitialState();
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState;
        if (parsed?.version === 1) next = parsed;
      }
    } catch { /* Fall back to the seed data. */ }
    commit(next);
    setReady(true);
  }, [commit]);

  const clearError = useCallback(() => setError(null), []);
  const refresh = useCallback(async () => { await refreshWorkspace(); }, [refreshWorkspace]);

  return <Context.Provider value={{ state, dispatch, ready, mode, user, login, signup, logout, enterDemo, error, clearError, roles, syncing, inbox, notifications, refresh }}>{children}</Context.Provider>;
}
export function useDemo() { const value = useContext(Context); if (!value) throw new Error('DemoProvider missing'); return value; }
