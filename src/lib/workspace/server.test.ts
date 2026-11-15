import { describe, expect, it } from 'vitest';
import { actionToRpc, httpError, loadWorkspace } from './server';

type Row = Record<string, unknown>;
type Fixtures = Record<string, Row[]>;

interface QueryResult {
  data: Row[];
  error: null;
}

interface QueryBuilder {
  select(...args: unknown[]): QueryBuilder;
  eq(...args: unknown[]): QueryBuilder;
  is(...args: unknown[]): QueryBuilder;
  in(...args: unknown[]): QueryBuilder;
  order(...args: unknown[]): QueryBuilder;
  limit(...args: unknown[]): QueryBuilder;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

function makeSupabase(fixtures: Fixtures) {
  return {
    from(table: string): QueryBuilder {
      const builder: QueryBuilder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (onfulfilled, onrejected) =>
          Promise.resolve({ data: fixtures[table] ?? [], error: null }).then(onfulfilled, onrejected),
      };
      return builder;
    },
    rpc(fn: string) {
      return Promise.resolve({ data: fixtures[`rpc:${fn}`] ?? [], error: null });
    },
  };
}

type WorkspaceItem = { id: string; type: string; priority: string };
type WorkspaceSprint = { id: string };
type WorkspaceEvent = { id: string; sequence: number };

function errorCode(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe('httpError', () => {
  const cases: Array<[string, number]> = [
    ['28000', 401],
    ['PGRST301', 401],
    ['42501', 403],
    ['P0002', 404],
    ['PGRST116', 404],
    ['40001', 409],
    ['23505', 409],
    ['22023', 422],
    ['22P02', 422],
    ['SOMETHING_ELSE', 400],
  ];

  it.each(cases)('maps code %s to HTTP %i', (code, status) => {
    const result = httpError({ code, message: `boom ${code}` });
    expect(result).toEqual({ status, body: { error: `boom ${code}`, code } });
  });

  it('keeps the code and falls back to a generic message', () => {
    expect(httpError({ code: 'PGRST301' })).toEqual({
      status: 401,
      body: { error: 'Request failed', code: 'PGRST301' },
    });
  });

  it('returns 400 for a missing error object', () => {
    expect(httpError(undefined)).toEqual({
      status: 400,
      body: { error: 'Request failed', code: undefined },
    });
  });
});

describe('actionToRpc', () => {
  it('maps create-project', () => {
    expect(actionToRpc({ type: 'create-project', name: 'Team Fire' })).toEqual({
      fn: 'rpc_create_project',
      args: { p_name: 'Team Fire', p_key: null, p_description: null, p_timezone: 'Asia/Karachi' },
    });
    expect(actionToRpc({ type: 'create-project' })).toEqual({
      fn: 'rpc_create_project',
      args: { p_name: '', p_key: null, p_description: null, p_timezone: 'Asia/Karachi' },
    });
  });

  it('maps create-sprint', () => {
    expect(actionToRpc({ type: 'create-sprint', projectId: 'P1', name: 'Sprint 1' })).toEqual({
      fn: 'rpc_create_sprint',
      args: { p_project_id: 'P1', p_name: 'Sprint 1' },
    });
  });

  it('maps create-item types and priorities', () => {
    const cases: Array<[string, string, string, string]> = [
      ['Story', 'Low', 'User Story', 'Low'],
      ['Task', 'Medium', 'Technical Task', 'Medium'],
      ['Bug', 'Urgent', 'Bug', 'Critical'],
    ];
    for (const [typeName, priority, expectedType, expectedPriority] of cases) {
      expect(
        actionToRpc({ type: 'create-item', projectId: 'P1', title: 'Hello', typeName, priority, points: 5 }),
      ).toEqual({
        fn: 'rpc_create_work_item',
        args: {
          p_project_id: 'P1',
          p_title: 'Hello',
          p_type: expectedType,
          p_priority: expectedPriority,
          p_estimate: 5,
        },
      });
    }
    expect(actionToRpc({ type: 'create-item', typeName: 'Bug', priority: 'Low' })).toEqual({
      fn: 'rpc_create_work_item',
      args: { p_project_id: undefined, p_title: '', p_type: 'Bug', p_priority: 'Low', p_estimate: null },
    });
  });

  it('rejects create-item with an unknown type', () => {
    expect(
      errorCode(() => actionToRpc({ type: 'create-item', typeName: 'Epic', priority: 'Low' })),
    ).toBe('22023');
  });

  it('rejects create-item with an unknown priority', () => {
    expect(
      errorCode(() => actionToRpc({ type: 'create-item', typeName: 'Story', priority: 'Blocker' })),
    ).toBe('22023');
  });

  it('forwards only whitelisted update-item patch keys and maps priority', () => {
    expect(
      actionToRpc({
        type: 'update-item',
        itemId: 'W1',
        patch: {
          title: 'New',
          description: 'Desc',
          points: 8,
          hours: 4,
          assigneeId: 'u2',
          priority: 'Urgent',
          epic: 'E2',
          status: 'Done',
          sprintId: 'S1',
        },
        expectedVersion: 7,
      }),
    ).toEqual({
      fn: 'rpc_update_work_item',
      args: {
        p_item_id: 'W1',
        p_patch: {
          title: 'New',
          description: 'Desc',
          points: 8,
          hours: 4,
          assigneeId: 'u2',
          priority: 'Critical',
          epic: 'E2',
        },
        p_expected_version: 7,
      },
    });
  });

  it('handles an empty update-item patch and a missing expected version', () => {
    expect(actionToRpc({ type: 'update-item', itemId: 'W1', patch: {} })).toEqual({
      fn: 'rpc_update_work_item',
      args: { p_item_id: 'W1', p_patch: {}, p_expected_version: null },
    });
    expect(actionToRpc({ type: 'update-item', itemId: 'W1' })).toEqual({
      fn: 'rpc_update_work_item',
      args: { p_item_id: 'W1', p_patch: {}, p_expected_version: null },
    });
  });

  it('rejects update-item with an unknown priority', () => {
    expect(
      errorCode(() => actionToRpc({ type: 'update-item', itemId: 'W1', patch: { priority: 'Blocker' } })),
    ).toBe('22023');
  });

  it('maps prioritize directions', () => {
    expect(actionToRpc({ type: 'prioritize', itemId: 'W1', direction: -1 })).toEqual({
      fn: 'rpc_reorder_backlog',
      args: { p_item_id: 'W1', p_direction: -1 },
    });
    for (const direction of [1, 5, 0, undefined, 'up']) {
      expect(actionToRpc({ type: 'prioritize', itemId: 'W1', direction })).toEqual({
        fn: 'rpc_reorder_backlog',
        args: { p_item_id: 'W1', p_direction: 1 },
      });
    }
  });

  it('maps check with a numeric index', () => {
    expect(actionToRpc({ type: 'check', itemId: 'W1', index: '2' })).toEqual({
      fn: 'rpc_toggle_checklist',
      args: { p_item_id: 'W1', p_index: 2 },
    });
  });

  it('maps allocate including null sprint and reasons', () => {
    expect(actionToRpc({ type: 'allocate', itemId: 'W1', sprintId: 'S1', reason: 'pulled in' })).toEqual({
      fn: 'rpc_allocate_item',
      args: { p_item_id: 'W1', p_sprint_id: 'S1', p_reason: 'pulled in' },
    });
    expect(actionToRpc({ type: 'allocate', itemId: 'W1', sprintId: null })).toEqual({
      fn: 'rpc_allocate_item',
      args: { p_item_id: 'W1', p_sprint_id: null, p_reason: null },
    });
    expect(actionToRpc({ type: 'allocate', itemId: 'W1' })).toEqual({
      fn: 'rpc_allocate_item',
      args: { p_item_id: 'W1', p_sprint_id: null, p_reason: null },
    });
  });

  it('maps move with and without concurrency tokens', () => {
    expect(
      actionToRpc({
        type: 'move',
        itemId: 'W1',
        status: 'Done',
        expectedVersion: 3,
        mutationId: 'm-1',
      }),
    ).toEqual({
      fn: 'rpc_move_work_item',
      args: { p_item_id: 'W1', p_new_status: 'Done', p_expected_version: 3, p_mutation_id: 'm-1' },
    });
    expect(actionToRpc({ type: 'move', itemId: 'W1', status: 'Done' })).toEqual({
      fn: 'rpc_move_work_item',
      args: { p_item_id: 'W1', p_new_status: 'Done', p_expected_version: null, p_mutation_id: null },
    });
  });

  it('maps sprint with only whitelisted patch keys', () => {
    expect(
      actionToRpc({
        type: 'sprint',
        sprintId: 'S1',
        patch: {
          goal: 'Ship',
          start: '2026-10-01',
          end: '2026-10-14',
          pointCapacity: 20,
          hourCapacity: 80,
          status: 'ACTIVE',
        },
      }),
    ).toEqual({
      fn: 'rpc_update_sprint',
      args: {
        p_sprint_id: 'S1',
        p_patch: {
          goal: 'Ship',
          start: '2026-10-01',
          end: '2026-10-14',
          pointCapacity: 20,
          hourCapacity: 80,
        },
      },
    });
    expect(actionToRpc({ type: 'sprint', sprintId: 'S1' })).toEqual({
      fn: 'rpc_update_sprint',
      args: { p_sprint_id: 'S1', p_patch: {} },
    });
  });

  it('maps start and complete', () => {
    expect(actionToRpc({ type: 'start', sprintId: 'S1' })).toEqual({
      fn: 'rpc_start_sprint',
      args: { p_sprint_id: 'S1' },
    });
    expect(actionToRpc({ type: 'complete', sprintId: 'S1', targetSprintId: 'S2' })).toEqual({
      fn: 'rpc_complete_sprint',
      args: { p_sprint_id: 'S1', p_target_sprint_id: 'S2' },
    });
    expect(actionToRpc({ type: 'complete', sprintId: 'S1' })).toEqual({
      fn: 'rpc_complete_sprint',
      args: { p_sprint_id: 'S1', p_target_sprint_id: null },
    });
  });

  it('rejects unknown and malformed actions with a 422-style code', () => {
    expect(errorCode(() => actionToRpc({ type: 'explode' }))).toBe('22023');
    expect(errorCode(() => actionToRpc(null))).toBe('22023');
    expect(errorCode(() => actionToRpc(undefined))).toBe('22023');
    expect(errorCode(() => actionToRpc('move'))).toBe('22023');
    expect(errorCode(() => actionToRpc({}))).toBe('22023');
    expect(errorCode(() => actionToRpc({ type: 42 }))).toBe('22023');
  });
});

const baseFixtures = (): Fixtures => ({
  profiles: [
    { id: 'u1', username: 'ada', display_name: 'Ada Lovelace', disabled_at: null },
  ],
  project_members: [
    {
      project_id: 'P1',
      user_id: 'u1',
      role: 'Developer',
      removed_at: null,
      profile: { display_name: 'Ada Lovelace', username: 'ada', title: 'Engineer' },
    },
    {
      project_id: 'P1',
      user_id: 'u2',
      role: 'Developer',
      removed_at: null,
      profile: { display_name: 'Grace Hopper', username: 'grace', title: 'PO' },
    },
  ],
  projects: [
    {
      id: 'P1',
      name: 'Team Fire',
      key: 'FIRE',
      description: 'Project description',
      timezone: 'Asia/Karachi',
      archived_at: null,
      wip_limits: { 'In Progress': 4 },
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
  work_items: [
    {
      id: 'W1',
      project_id: 'P1',
      key: 'FIRE-1',
      title: 'Story one',
      description: { text: 'hello' },
      type: 'User Story',
      priority: 'Critical',
      estimate: 3,
      hours: 5,
      status: 'In Progress',
      assignee_id: 'u1',
      epic: 'E1',
      labels: ['frontend'],
      wbs: '1.1',
      sprint_id: 'S1',
      checklist: [{ text: 'a', done: true }],
      position: 1,
      version: 2,
      archived_at: null,
    },
    {
      id: 'W2',
      project_id: 'P1',
      key: 'FIRE-2',
      title: 'Task one',
      description: { text: 'task' },
      type: 'Technical Task',
      priority: 'Low',
      estimate: 2,
      hours: 3,
      status: 'To Do',
      assignee_id: null,
      epic: null,
      labels: [],
      wbs: '1.2',
      sprint_id: null,
      checklist: [],
      position: 2,
      version: 1,
      archived_at: null,
    },
    {
      id: 'W3',
      project_id: 'P1',
      key: 'FIRE-3',
      title: 'Bug one',
      description: { text: 'bug' },
      type: 'Bug',
      priority: 'Medium',
      estimate: 1,
      hours: 1,
      status: 'Done',
      assignee_id: 'u2',
      epic: 'E2',
      labels: [],
      wbs: '1.3',
      sprint_id: 'S0',
      checklist: [],
      position: 3,
      version: 1,
      archived_at: null,
    },
  ],
  sprints: [
    {
      id: 'S0',
      project_id: 'P1',
      name: 'Sprint 0',
      goal: 'Baseline',
      status: 'COMPLETED',
      start_date: '2026-09-18',
      end_date: '2026-10-01',
      capacity_points: 8,
      hour_capacity: 32,
      version: 2,
      completed_at: '2026-10-16T09:00:00Z',
      result: {
        delivered: 5,
        originalDelivered: 5,
        commitment: 8,
        cutoff: '2026-10-16T07:00:00Z',
      },
    },
    {
      id: 'S1',
      project_id: 'P1',
      name: 'Sprint 1',
      goal: 'Ship it',
      status: 'ACTIVE',
      start_date: '2026-10-02',
      end_date: '2026-10-15',
      capacity_points: 10,
      hour_capacity: 40,
      version: 3,
      completed_at: null,
      result: null,
    },
  ],
  project_revisions: [{ project_id: 'P1', board_revision: 7 }],
  work_item_status_history: [
    {
      id: 'h0',
      project_id: 'P1',
      work_item_id: 'W1',
      new_status: 'To Do',
      actor_id: 'u1',
      sprint_id: null,
      created_at: '2026-10-01T08:00:00Z',
      seq: 1,
    },
    {
      id: 'h1',
      project_id: 'P1',
      work_item_id: 'W1',
      new_status: 'In Progress',
      actor_id: 'u1',
      sprint_id: 'S1',
      created_at: '2026-10-05T08:00:00Z',
      seq: 3,
    },
  ],
  sprint_commitments: [{ sprint_id: 'S1', work_item_id: 'W1', frozen_estimate: 3 }],
  sprint_scope_events: [
    {
      id: 'e1',
      sprint_id: 'S1',
      work_item_id: 'W1',
      action: 'ADDED',
      estimate_at_event: 3,
      actor_id: 'u1',
      created_at: '2026-10-03T08:00:00Z',
      seq: 2,
    },
  ],
});

describe('loadWorkspace', () => {
  it('builds the full workspace snapshot for a member', async () => {
    const workspace = await loadWorkspace(makeSupabase(baseFixtures()), { id: 'u1' });

    expect(workspace.user).toEqual({
      id: 'u1',
      username: 'ada',
      name: 'Ada Lovelace',
      initials: 'AL',
    });
    expect(workspace.roles).toEqual({ P1: 'Developer' });
    expect(workspace.revisions).toEqual({ P1: 7, _inbox: 0 });

    const state = workspace.state;
    expect(state.version).toBe(1);
    expect(state.entered).toBe(true);
    expect(state.role).toBe('Developer');
    expect(state.projects).toHaveLength(1);

    const project = state.projects[0];
    expect(project.id).toBe('P1');
    expect(project.name).toBe('Team Fire');
    expect(project.code).toBe('FIRE');
    expect(project.description).toBe('Project description');
    expect(project.timezone).toBe('Asia/Karachi');
    expect(project.archived).toBe(false);
    expect(project.wip).toEqual({
      'To Do': 99,
      'In Progress': 4,
      'Code Review': 2,
      Testing: 2,
      Done: 99,
    });

    expect(project.members).toEqual([
      { id: 'u1', name: 'Ada Lovelace', initials: 'AL', role: 'Developer', title: 'Engineer' },
      { id: 'u2', name: 'Grace Hopper', initials: 'GH', role: 'Developer', title: 'PO' },
    ]);

    const story = project.items.find((item: WorkspaceItem) => item.id === 'W1')!;
    expect(story).toEqual({
      id: 'W1',
      key: 'FIRE-1',
      title: 'Story one',
      description: 'hello',
      type: 'Story',
      priority: 'Urgent',
      points: 3,
      hours: 5,
      status: 'In Progress',
      assigneeId: 'u1',
      epic: 'E1',
      labels: ['frontend'],
      wbs: '1.1',
      sprintId: 'S1',
      checklist: [{ text: 'a', done: true }],
      order: 1,
      version: 2,
      attachments: [],
      comments: [],
    });

    const task = project.items.find((item: WorkspaceItem) => item.id === 'W2')!;
    expect(task.type).toBe('Task');
    expect(task.priority).toBe('Low');
    const bug = project.items.find((item: WorkspaceItem) => item.id === 'W3')!;
    expect(bug.type).toBe('Bug');
    expect(bug.priority).toBe('Medium');
    expect(project.items.map((item: WorkspaceItem) => item.id)).toEqual(['W1', 'W2', 'W3']);

    const active = project.sprints.find((sprint: WorkspaceSprint) => sprint.id === 'S1')!;
    expect(active).toEqual({
      id: 'S1',
      name: 'Sprint 1',
      goal: 'Ship it',
      state: 'active',
      start: '2026-10-02',
      end: '2026-10-15',
      pointCapacity: 10,
      hourCapacity: 40,
      originalItemIds: ['W1'],
      frozenPoints: { W1: 3 },
      version: 3,
    });

    const completed = project.sprints.find((sprint: WorkspaceSprint) => sprint.id === 'S0')!;
    expect(completed.state).toBe('completed');
    expect(completed.originalItemIds).toEqual([]);
    expect(completed.frozenPoints).toEqual({});
    expect(completed.completedAt).toBe('2026-10-16T09:00:00.000Z');
    expect(completed.result).toEqual({
      delivered: 5,
      originalDelivered: 5,
      commitment: 8,
      cutoff: '2026-10-16T07:00:00.000Z',
    });

    expect(project.events).toEqual([
      {
        id: 'scope-e1',
        at: '2026-10-03T08:00:00.000Z',
        sprintId: 'S1',
        itemId: 'W1',
        kind: 'scope-add',
        points: 3,
        status: 'To Do',
        actor: 'u1',
        sequence: 1,
      },
      {
        id: 'status-h1',
        at: '2026-10-05T08:00:00.000Z',
        sprintId: 'S1',
        itemId: 'W1',
        kind: 'status',
        status: 'In Progress',
        actor: 'u1',
        sequence: 2,
      },
    ]);
    expect(project.events.map((event: WorkspaceEvent) => event.sequence)).toEqual([1, 2]);
    expect(project.events.some((event: WorkspaceEvent) => event.id === 'status-h0')).toBe(false);
    expect(project.evidence).toEqual([]);
  });

  it('rejects a disabled profile with code 28000', async () => {
    const fixtures = baseFixtures();
    fixtures.profiles = [
      { id: 'u1', username: 'ada', display_name: 'Ada Lovelace', disabled_at: '2026-01-01T00:00:00Z' },
    ];
    await expect(loadWorkspace(makeSupabase(fixtures), { id: 'u1' })).rejects.toMatchObject({
      code: '28000',
    });
  });

  it('returns an empty project list for a user with no memberships', async () => {
    const fixtures = baseFixtures();
    fixtures.project_members = [];
    const workspace = await loadWorkspace(makeSupabase(fixtures), { id: 'u1' });

    expect(workspace.roles).toEqual({});
    expect(workspace.revisions).toEqual({ _inbox: 0 });
    expect(workspace.state.role).toBe('Viewer');
    expect(workspace.state.projects).toEqual([]);
    expect(workspace.user.initials).toBe('AL');
  });
});
