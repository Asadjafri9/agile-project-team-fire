// Server-side workspace contract (see docs/api/workspace.md).
// Maps database rows to the DemoState shape the UI renders, and maps UI
// actions to SQL RPCs. All authorization happens in the RPCs and RLS.

const TYPE_TO_UI = { 'User Story': 'Story', 'Technical Task': 'Task', Bug: 'Bug' };
const TYPE_TO_DB = { Story: 'User Story', Task: 'Technical Task', Bug: 'Bug' };
const PRIORITY_TO_UI = { Critical: 'Urgent', High: 'High', Medium: 'Medium', Low: 'Low' };
const PRIORITY_TO_DB = { Urgent: 'Critical', Critical: 'Critical', High: 'High', Medium: 'Medium', Low: 'Low' };
const DEFAULT_WIP = { 'To Do': 99, 'In Progress': 3, 'Code Review': 2, Testing: 2, Done: 99 };

export const initials = name =>
  String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';

const toIso = value => (value ? new Date(value).toISOString() : value);

/** Map Postgres / PostgREST errors to HTTP responses with a useful message. */
export function httpError(error) {
  const code = error?.code;
  const message = error?.message || 'Request failed';
  const status =
    code === '28000' || code === 'PGRST301' ? 401
    : code === '42501' ? 403
    : code === 'P0002' || code === 'PGRST116' ? 404
    : code === '40001' || code === '23505' ? 409
    : code === '22023' || code === '22P02' || code === '23514' || code === '22007' || code === '22008' ? 422
    : 400;
  return { status, body: { error: message, code } };
}

async function must(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data ?? [];
}

/** Build the full workspace snapshot visible to the signed-in user. */
export async function loadWorkspace(supabase, user) {
  const [[profile], memberships] = await Promise.all([
    must(supabase.from('profiles').select('id, username, display_name, disabled_at').eq('id', user.id)),
    must(supabase.from('project_members').select('project_id, role').eq('user_id', user.id).is('removed_at', null)),
  ]);
  if (profile?.disabled_at) {
    const err = new Error('Account disabled');
    err.code = '28000';
    throw err;
  }

  const projectIds = memberships.map(m => m.project_id);
  const roles = Object.fromEntries(memberships.map(m => [m.project_id, m.role]));

  const empty = { data: [], error: null };
  const pick = (query) => (projectIds.length ? query : Promise.resolve(empty));

  const [projects, members, items, sprints, revisions, history] = await Promise.all([
    must(pick(supabase.from('projects').select('*').in('id', projectIds).order('created_at'))),
    must(pick(supabase.from('project_members').select('project_id, user_id, role, profile:profiles(display_name, username, title)').in('project_id', projectIds).is('removed_at', null))),
    must(pick(supabase.from('work_items').select('*').in('project_id', projectIds).is('archived_at', null).order('position'))),
    must(pick(supabase.from('sprints').select('*').in('project_id', projectIds).order('start_date'))),
    must(pick(supabase.from('project_revisions').select('project_id, board_revision').in('project_id', projectIds))),
    must(pick(supabase.from('work_item_status_history').select('id, project_id, work_item_id, new_status, actor_id, sprint_id, created_at, seq').in('project_id', projectIds).order('seq'))),
  ]);

  const sprintIds = sprints.map(s => s.id);
  const pickSprints = (query) => (sprintIds.length ? query : Promise.resolve(empty));
  const [commitments, scope] = await Promise.all([
    must(pickSprints(supabase.from('sprint_commitments').select('sprint_id, work_item_id, frozen_estimate').in('sprint_id', sprintIds))),
    must(pickSprints(supabase.from('sprint_scope_events').select('id, sprint_id, work_item_id, action, estimate_at_event, actor_id, created_at, seq').in('sprint_id', sprintIds).order('seq'))),
  ]);

  const sprintProject = Object.fromEntries(sprints.map(s => [s.id, s.project_id]));

  // Status of an item at a moment, replayed from history (for scope-add events).
  const historyByItem = new Map();
  for (const h of history) {
    if (!historyByItem.has(h.work_item_id)) historyByItem.set(h.work_item_id, []);
    historyByItem.get(h.work_item_id).push(h);
  }
  const statusAt = (itemId, at) => {
    let status = 'To Do';
    for (const h of historyByItem.get(itemId) ?? []) if (new Date(h.created_at) <= new Date(at)) status = h.new_status;
    return status;
  };

  const state = {
    version: 1,
    entered: true,
    role: memberships[0]?.role ?? 'Viewer',
    projects: projects.map(p => {
      const projectSprints = sprints.filter(s => s.project_id === p.id);
      const events = [
        ...scope.filter(e => sprintProject[e.sprint_id] === p.id).map(e => ({
          id: `scope-${e.id}`, seq: e.seq, at: toIso(e.created_at), sprintId: e.sprint_id, itemId: e.work_item_id,
          kind: e.action === 'ADDED' ? 'scope-add' : 'scope-remove', points: e.estimate_at_event,
          ...(e.action === 'ADDED' ? { status: statusAt(e.work_item_id, e.created_at) } : {}), actor: e.actor_id,
        })),
        ...history.filter(h => h.project_id === p.id && h.sprint_id).map(h => ({
          id: `status-${h.id}`, seq: h.seq, at: toIso(h.created_at), sprintId: h.sprint_id, itemId: h.work_item_id,
          kind: 'status', status: h.new_status, actor: h.actor_id,
        })),
      ]
        .sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq)
        .map(({ seq, ...e }, i) => ({ ...e, sequence: i + 1 }));

      return {
        id: p.id,
        name: p.name,
        code: p.key,
        description: p.description ?? '',
        timezone: p.timezone,
        archived: Boolean(p.archived_at),
        wip: { ...DEFAULT_WIP, ...(p.wip_limits ?? {}) },
        members: members.filter(m => m.project_id === p.id).map(m => ({
          id: m.user_id,
          name: m.profile?.display_name ?? m.profile?.username ?? 'Member',
          initials: initials(m.profile?.display_name ?? m.profile?.username),
          role: m.role,
          title: m.profile?.title || m.role,
        })),
        items: items.filter(i => i.project_id === p.id).map(i => ({
          id: i.id,
          key: i.key,
          title: i.title,
          description: typeof i.description?.text === 'string' ? i.description.text : '',
          type: TYPE_TO_UI[i.type] ?? 'Story',
          priority: PRIORITY_TO_UI[i.priority] ?? 'Medium',
          points: i.estimate,
          hours: i.hours,
          status: i.status,
          assigneeId: i.assignee_id,
          epic: i.epic,
          labels: i.labels ?? [],
          wbs: i.wbs,
          sprintId: i.sprint_id,
          checklist: Array.isArray(i.checklist) ? i.checklist.map(c => ({ text: String(c.text ?? ''), done: Boolean(c.done) })) : [],
          order: i.position,
          version: i.version,
        })),
        sprints: projectSprints.map(s => {
          const frozen = commitments.filter(c => c.sprint_id === s.id);
          return {
            id: s.id,
            name: s.name,
            goal: s.goal ?? '',
            state: String(s.status).toLowerCase(),
            start: s.start_date,
            end: s.end_date,
            pointCapacity: s.capacity_points ?? 0,
            hourCapacity: s.hour_capacity ?? 0,
            originalItemIds: frozen.map(c => c.work_item_id),
            frozenPoints: Object.fromEntries(frozen.map(c => [c.work_item_id, c.frozen_estimate])),
            version: s.version,
            ...(s.completed_at ? { completedAt: toIso(s.completed_at) } : {}),
            ...(s.result ? { result: { ...s.result, cutoff: toIso(s.result.cutoff) } } : {}),
          };
        }),
        events,
        evidence: [],
      };
    }),
  };

  return {
    user: {
      id: user.id,
      username: profile?.username ?? '',
      name: profile?.display_name ?? profile?.username ?? '',
      initials: initials(profile?.display_name ?? profile?.username),
    },
    roles,
    revisions: Object.fromEntries(projectIds.map(id => [id, revisions.find(r => r.project_id === id)?.board_revision ?? 1])),
    state,
  };
}

const str = v => (typeof v === 'string' ? v : undefined);

/** Translate one UI action into an RPC call. Returns { fn, args } or throws a 422-style error. */
export function actionToRpc(action) {
  const bad = message => Object.assign(new Error(message), { code: '22023' });
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw bad('Missing action');

  switch (action.type) {
    case 'create-project':
      return { fn: 'rpc_create_project', args: { p_name: str(action.name) ?? '', p_key: null, p_description: null, p_timezone: 'Asia/Karachi' } };
    case 'create-sprint':
      return { fn: 'rpc_create_sprint', args: { p_project_id: action.projectId, p_name: str(action.name) ?? '' } };
    case 'create-item': {
      const type = TYPE_TO_DB[action.typeName];
      const priority = PRIORITY_TO_DB[action.priority];
      if (!type || !priority) throw bad('Unknown type or priority');
      return { fn: 'rpc_create_work_item', args: { p_project_id: action.projectId, p_title: str(action.title) ?? '', p_type: type, p_priority: priority, p_estimate: action.points ?? null } };
    }
    case 'update-item': {
      const patch = {};
      const allowed = ['title', 'description', 'points', 'hours', 'assigneeId', 'priority', 'epic'];
      for (const key of allowed) if (action.patch && key in action.patch) patch[key] = action.patch[key];
      if ('priority' in patch) {
        patch.priority = PRIORITY_TO_DB[patch.priority];
        if (!patch.priority) throw bad('Unknown priority');
      }
      return { fn: 'rpc_update_work_item', args: { p_item_id: action.itemId, p_patch: patch, p_expected_version: action.expectedVersion ?? null } };
    }
    case 'prioritize':
      return { fn: 'rpc_reorder_backlog', args: { p_item_id: action.itemId, p_direction: action.direction === -1 ? -1 : 1 } };
    case 'check':
      return { fn: 'rpc_toggle_checklist', args: { p_item_id: action.itemId, p_index: Number(action.index) } };
    case 'allocate':
      return { fn: 'rpc_allocate_item', args: { p_item_id: action.itemId, p_sprint_id: action.sprintId ?? null, p_reason: str(action.reason) ?? null } };
    case 'move':
      return { fn: 'rpc_move_work_item', args: { p_item_id: action.itemId, p_new_status: action.status, p_expected_version: action.expectedVersion ?? null, p_mutation_id: action.mutationId ?? null } };
    case 'sprint': {
      const patch = {};
      for (const key of ['goal', 'start', 'end', 'pointCapacity', 'hourCapacity']) if (action.patch && key in action.patch) patch[key] = action.patch[key];
      return { fn: 'rpc_update_sprint', args: { p_sprint_id: action.sprintId, p_patch: patch } };
    }
    case 'start':
      return { fn: 'rpc_start_sprint', args: { p_sprint_id: action.sprintId } };
    case 'complete':
      return { fn: 'rpc_complete_sprint', args: { p_sprint_id: action.sprintId, p_target_sprint_id: action.targetSprintId ?? null } };
    default:
      throw bad(`Unsupported action: ${action.type}`);
  }
}
