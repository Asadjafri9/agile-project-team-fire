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

  // The owner keeps full authority whatever Scrum role they pick (mirrors tf_require_role).
  for (const p of projects) if (p.owner_id === user.id) roles[p.id] = 'Product Owner';

  const sprintIds = sprints.map(s => s.id);
  const pickSprints = (query) => (sprintIds.length ? query : Promise.resolve(empty));
  const [commitments, scope, invitations, comments, attachments, activity, evidence, notifications, inbox, joinCodes] = await Promise.all([
    must(pickSprints(supabase.from('sprint_commitments').select('sprint_id, work_item_id, frozen_estimate').in('sprint_id', sprintIds))),
    must(pickSprints(supabase.from('sprint_scope_events').select('id, sprint_id, work_item_id, action, estimate_at_event, actor_id, created_at, seq').in('sprint_id', sprintIds).order('seq'))),
    // RLS returns rows only for projects where the user is a manager (or the invitee).
    must(pick(supabase.from('project_invitations').select('id, project_id, invitee_id, role, invited_by, status, created_at, expires_at, invitee:profiles!invitee_id(username, display_name)').in('project_id', projectIds).order('created_at', { ascending: false }))),
    must(pick(supabase.from('work_item_comments').select('id, project_id, work_item_id, author_id, body, mentions, created_at, edited_at, deleted_at').in('project_id', projectIds).order('created_at'))),
    must(pick(supabase.from('work_item_attachments').select('id, project_id, work_item_id, file_name, size_bytes, mime_type, uploaded_by, created_at').in('project_id', projectIds).is('removed_at', null).order('created_at'))),
    must(pick(supabase.from('work_item_activity').select('id, project_id, work_item_id, actor_id, kind, detail, created_at').in('project_id', projectIds).order('created_at', { ascending: false }).limit(500))),
    must(pick(supabase.from('project_evidence').select('id, project_id, title, version, kind, evidence_date, note, file_name, size_bytes, mime_type').in('project_id', projectIds).is('removed_at', null).order('evidence_date', { ascending: false }))),
    must(supabase.from('notifications').select('id, kind, project_id, work_item_id, comment_id, text, created_at, read_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)),
    must(supabase.rpc('rpc_my_invitations')),
    // RLS: only managers see their projects' codes.
    must(pick(supabase.from('project_join_codes').select('id, project_id, code, role, created_by, created_at, expires_at, max_uses, uses, revoked_at').in('project_id', projectIds).order('created_at', { ascending: false }))),
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
    role: roles[memberships[0]?.project_id] ?? memberships[0]?.role ?? 'Viewer',
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
        ownerId: p.owner_id,
        storage: {
          used: attachments.filter(a => a.project_id === p.id).reduce((sum, a) => sum + Number(a.size_bytes), 0)
            + evidence.filter(e => e.project_id === p.id).reduce((sum, e) => sum + Number(e.size_bytes ?? 0), 0),
          budget: Number(p.storage_budget_bytes ?? 104857600),
        },
        invitations: invitations.filter(i => i.project_id === p.id).map(i => ({
          id: i.id,
          projectId: i.project_id,
          projectName: p.name,
          username: i.invitee?.username ?? '',
          name: i.invitee?.display_name ?? i.invitee?.username ?? '',
          role: i.role,
          invitedBy: i.invited_by,
          status: i.status === 'PENDING' && new Date(i.expires_at) <= new Date() ? 'expired' : String(i.status).toLowerCase(),
          expiresAt: toIso(i.expires_at),
          at: toIso(i.created_at),
        })),
        joinCodes: joinCodes.filter(c => c.project_id === p.id).map(c => ({
          id: c.id, code: c.code, role: c.role, createdBy: c.created_by, at: toIso(c.created_at), expiresAt: toIso(c.expires_at),
          maxUses: c.max_uses, uses: c.uses,
          active: !c.revoked_at && new Date(c.expires_at) > new Date() && (c.max_uses == null || c.uses < c.max_uses),
        })),
        activity: activity.filter(a => a.project_id === p.id).map(a => ({
          id: a.id, itemId: a.work_item_id, kind: a.kind, actor: a.actor_id, at: toIso(a.created_at), detail: a.detail,
        })),
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
          attachments: attachments.filter(a => a.work_item_id === i.id).map(a => ({
            id: a.id, name: a.file_name, size: Number(a.size_bytes), mime: a.mime_type, uploadedBy: a.uploaded_by, at: toIso(a.created_at),
          })),
          comments: comments.filter(c => c.work_item_id === i.id).map(c => (c.deleted_at
            ? { id: c.id, authorId: c.author_id, body: '', mentions: [], at: toIso(c.created_at), deleted: true }
            : { id: c.id, authorId: c.author_id, body: c.body, mentions: c.mentions ?? [], at: toIso(c.created_at), ...(c.edited_at ? { editedAt: toIso(c.edited_at) } : {}) })),
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
        evidence: evidence.filter(e => e.project_id === p.id).map(e => ({
          id: e.id, title: e.title, version: e.version, kind: e.kind, date: e.evidence_date, note: e.note,
          ...(e.file_name ? { file: { name: e.file_name, size: Number(e.size_bytes), mime: e.mime_type } } : {}),
        })),
      };
    }),
  };

  return {
    user: {
      id: user.id,
      username: profile?.username ?? '',
      name: profile?.display_name ?? profile?.username ?? '',
      initials: initials(profile?.display_name ?? profile?.username),
      email: user.email && !user.email.endsWith('@accounts.team-fire.invalid') ? user.email : null,
    },
    roles,
    // `_inbox` lets the client notice new invitations/notifications while polling.
    revisions: {
      ...Object.fromEntries(projectIds.map(id => [id, revisions.find(r => r.project_id === id)?.board_revision ?? 1])),
      _inbox: (inbox ?? []).length * 1000 + notifications.filter(n => !n.read_at).length,
    },
    state,
    inbox: (inbox ?? []).map(i => ({
      id: i.id, projectId: i.project_id, projectName: i.project_name, username: profile?.username ?? '', name: profile?.display_name ?? '',
      role: i.role, invitedBy: i.invited_by_name, status: 'pending', expiresAt: toIso(i.expires_at), at: toIso(i.created_at),
    })),
    notifications: notifications.map(n => ({
      id: n.id, kind: n.kind, projectId: n.project_id, itemId: n.work_item_id, commentId: n.comment_id ?? null, text: n.text, at: toIso(n.created_at), read: Boolean(n.read_at),
    })),
  };
}

const str = v => (typeof v === 'string' ? v : undefined);

/** Translate one UI action into an RPC call. Returns { fn, args } or throws a 422-style error. */
export function actionToRpc(action) {
  const bad = message => Object.assign(new Error(message), { code: '22023' });
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw bad('Missing action');

  switch (action.type) {
    case 'create-project':
      return { fn: 'rpc_create_project', args: { p_name: str(action.name) ?? '', p_key: null, p_description: str(action.description) ?? null, p_timezone: str(action.timezone) || 'Asia/Karachi' } };
    case 'create-sprint': {
      const num = v => (Number.isInteger(v) && v >= 0 ? v : undefined);
      return { fn: 'rpc_create_sprint', args: {
        p_project_id: action.projectId, p_name: str(action.name) ?? '',
        ...(str(action.goal) !== undefined ? { p_goal: action.goal } : {}),
        ...(str(action.start) ? { p_start: action.start } : {}),
        ...(str(action.end) ? { p_end: action.end } : {}),
        ...(num(action.pointCapacity) !== undefined ? { p_point_capacity: action.pointCapacity } : {}),
        ...(num(action.hourCapacity) !== undefined ? { p_hour_capacity: action.hourCapacity } : {}),
      } };
    }
    case 'create-item': {
      const type = TYPE_TO_DB[action.typeName];
      const priority = PRIORITY_TO_DB[action.priority];
      if (!type || !priority) throw bad('Unknown type or priority');
      return { fn: 'rpc_create_work_item', args: { p_project_id: action.projectId, p_title: str(action.title) ?? '', p_type: type, p_priority: priority, p_estimate: action.points ?? null } };
    }
    case 'update-item': {
      const patch = {};
      const allowed = ['title', 'description', 'points', 'hours', 'assigneeId', 'priority', 'epic', 'labels'];
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
    case 'invite':
      return { fn: 'rpc_invite_member', args: { p_project_id: action.projectId, p_username: str(action.username) ?? '', p_role: action.role } };
    case 'respond-invite':
      return { fn: 'rpc_respond_invitation', args: { p_invitation_id: action.invitationId, p_accept: action.accept === true } };
    case 'revoke-invite':
      return { fn: 'rpc_revoke_invitation', args: { p_invitation_id: action.invitationId } };
    case 'set-role':
      return { fn: 'rpc_set_member_role', args: { p_project_id: action.projectId, p_user_id: action.userId, p_role: action.role } };
    case 'remove-member':
      return { fn: 'rpc_remove_member', args: { p_project_id: action.projectId, p_user_id: action.userId } };
    case 'leave':
      return { fn: 'rpc_leave_project', args: { p_project_id: action.projectId } };
    case 'transfer-owner':
      return { fn: 'rpc_transfer_ownership', args: { p_project_id: action.projectId, p_user_id: action.userId } };
    case 'archive-project':
      return { fn: 'rpc_archive_project', args: { p_project_id: action.projectId } };
    case 'archive-item':
      return { fn: 'rpc_archive_work_item', args: { p_item_id: action.itemId, p_reason: str(action.reason) ?? '' } };
    case 'set-wip':
      return { fn: 'rpc_set_wip_limits', args: { p_project_id: action.projectId, p_limits: action.limits ?? {} } };
    case 'set-checklist':
      if (!Array.isArray(action.checklist)) throw bad('Checklist must be a list');
      return { fn: 'rpc_set_checklist', args: { p_item_id: action.itemId, p_checklist: action.checklist.map(c => ({ text: String(c?.text ?? ''), done: Boolean(c?.done) })) } };
    case 'add-evidence': {
      const e = action.evidence ?? {};
      const base = { p_project_id: action.projectId, p_title: str(e.title) ?? '', p_version: str(e.version) ?? '', p_kind: str(e.kind) ?? 'Other', p_date: str(e.date) || null, p_note: str(e.note) ?? '' };
      const f = action.file;
      if (f && typeof f === 'object') {
        return { fn: 'rpc_add_evidence_file', args: { ...base, p_path: str(f.path) ?? '', p_name: str(f.name) ?? '', p_size: Number(f.size), p_mime: str(f.mime) ?? '' } };
      }
      return { fn: 'rpc_add_evidence', args: base };
    }
    case 'remove-evidence':
      return { fn: 'rpc_remove_evidence', args: { p_evidence_id: action.evidenceId } };
    case 'comment':
      return { fn: 'rpc_add_comment', args: { p_item_id: action.itemId, p_body: str(action.body) ?? '', p_mentions: Array.isArray(action.mentions) ? action.mentions : [] } };
    case 'edit-comment':
      return { fn: 'rpc_edit_comment', args: { p_comment_id: action.commentId, p_body: str(action.body) ?? '', p_mentions: Array.isArray(action.mentions) ? action.mentions : [] } };
    case 'delete-comment':
      return { fn: 'rpc_delete_comment', args: { p_comment_id: action.commentId } };
    case 'add-attachment':
      return { fn: 'rpc_add_attachment', args: { p_item_id: action.itemId, p_path: str(action.path) ?? '', p_name: str(action.name) ?? '', p_size: Number(action.size), p_mime: str(action.mime) ?? '' } };
    case 'remove-attachment':
      return { fn: 'rpc_remove_attachment', args: { p_attachment_id: action.attachmentId } };
    case 'create-join-code':
      return { fn: 'rpc_create_join_code', args: { p_project_id: action.projectId, p_role: action.role, p_days: Number(action.days ?? 7), p_max_uses: Number.isInteger(action.maxUses) ? action.maxUses : null } };
    case 'revoke-join-code':
      return { fn: 'rpc_revoke_join_code', args: { p_code_id: action.codeId } };
    case 'join-with-code':
      return { fn: 'rpc_join_with_code', args: { p_code: str(action.code) ?? '' } };
    case 'read-notifications':
      return { fn: 'rpc_mark_notifications_read', args: { p_ids: Array.isArray(action.ids) ? action.ids : null } };
    default:
      throw bad(`Unsupported action: ${action.type}`);
  }
}
