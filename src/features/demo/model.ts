export const STATUSES = ['To Do', 'In Progress', 'Code Review', 'Testing', 'Done'] as const;
export type Status = typeof STATUSES[number];
export type Role = 'Product Owner' | 'Scrum Master' | 'Developer' | 'QA Tester' | 'Viewer';
export type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';
export type ItemType = 'Story' | 'Task' | 'Bug';
export type SprintState = 'planned' | 'active' | 'completed';
export type ChecklistEntry = { text: string; done: boolean };
export type Attachment = { id: string; name: string; size: number; mime: string; uploadedBy: string; at: string };
export type Comment = { id: string; authorId: string; body: string; mentions: string[]; at: string; editedAt?: string; deleted?: boolean };
export type Activity = { id: string; itemId: string; kind: string; actor: string; at: string; detail: string };
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
export type Invitation = { id: string; projectId: string; projectName: string; username: string; name: string; role: Role; invitedBy: string; status: InvitationStatus; expiresAt: string; at: string };
export type JoinCode = { id: string; code: string; role: Role; createdBy: string; at: string; expiresAt: string; maxUses: number | null; uses: number; active: boolean };
export type Notification = { id: string; kind: 'mention' | 'invitation'; projectId: string | null; itemId: string | null; text: string; at: string; read: boolean };
export type WorkItem = { id: string; key: string; title: string; description: string; type: ItemType; priority: Priority; points: number | null; hours: number | null; status: Status; assigneeId: string | null; epic: string; labels: string[]; wbs: string; sprintId: string | null; checklist: ChecklistEntry[]; order: number;
  /** Live mode only (absent in demo data). */
  version?: number; attachments?: Attachment[]; comments?: Comment[] };
export type Member = { id: string; name: string; initials: string; role: Role; title: string };
export type Sprint = { id: string; name: string; goal: string; state: SprintState; start: string; end: string; pointCapacity: number; hourCapacity: number; originalItemIds: string[]; frozenPoints: Record<string, number>; completedAt?: string; result?: { delivered: number; originalDelivered: number; commitment: number; cutoff: string } };
export type Event = { id: string; sequence: number; at: string; sprintId: string; itemId: string; kind: 'scope-add' | 'scope-remove' | 'status'; status?: Status; points?: number; actor: string };
export type Evidence = { id: string; title: string; version: string; kind: string; date: string; note: string; /** Live only: attached document. */ file?: { name: string; size: number; mime: string } };
export type Project = { id: string; name: string; code: string; description: string; timezone: string; wip: Record<Status, number>; members: Member[]; items: WorkItem[]; sprints: Sprint[]; events: Event[]; evidence: Evidence[];
  /** Live mode only (absent in demo data). invitations are visible to Product Owner / Scrum Master only. */
  ownerId?: string; archived?: boolean; invitations?: Invitation[]; joinCodes?: JoinCode[]; activity?: Activity[]; storage?: { used: number; budget: number } };
export type DemoState = { version: number; entered: boolean; role: Role; projects: Project[] };

const members: Member[] = [
  { id: 'm1', name: 'Ayesha Khan', initials: 'AK', role: 'Product Owner', title: 'Product owner' },
  { id: 'm2', name: 'Hamza Malik', initials: 'HM', role: 'Scrum Master', title: 'Delivery lead' },
  { id: 'm3', name: 'Zara Ahmed', initials: 'ZA', role: 'Developer', title: 'Frontend' },
  { id: 'm4', name: 'Bilal Raza', initials: 'BR', role: 'Developer', title: 'Backend' },
];
const item = (n: number, title: string, status: Status, points: number | null, hours: number | null, assigneeId: string | null, sprintId: string | null, priority: Priority, epic: string, wbs: string, checklist: string[], done = 0, type: ItemType = 'Story'): WorkItem => ({
  id: `i${n}`, key: `FIRE-${String(n).padStart(3, '0')}`, title, description: `${title}. This sample item shows the intended workflow and WBS traceability.`, type, priority, points, hours, status, assigneeId, sprintId, epic, labels: [epic === 'Planning' ? 'Product' : 'Platform'], wbs, checklist: checklist.map((text, i) => ({ text, done: i < done })), order: n,
});

export const initialState: DemoState = {
  version: 1, entered: false, role: 'Product Owner', projects: [{
    id: 'team-fire', name: 'Team Fire', code: 'FIRE', description: 'A focused workspace for planning and delivering the Agile PM platform.', timezone: 'Asia/Karachi',
    wip: { 'To Do': 99, 'In Progress': 3, 'Code Review': 2, Testing: 2, Done: 99 }, members,
    items: [
      item(101, 'Map project and member permissions', 'Done', 5, 14, 'm4', 's1', 'High', 'Foundation', '1.2.2', ['Role matrix agreed', 'Permissions documented'], 2),
      item(102, 'Define work item acceptance criteria', 'Done', 3, 8, 'm1', 's1', 'Medium', 'Planning', '1.3.1', ['Acceptance criteria reviewed'], 1),
      item(103, 'Build the sprint board structure', 'Done', 8, 24, 'm3', 's1', 'High', 'Execution', '2.2.1', ['Columns are accessible', 'Status changes recorded'], 2),
      item(104, 'Prepare sprint planning flow', 'In Progress', 5, 16, 'm3', 's2', 'High', 'Planning', '2.1.2', ['Capacity shown in hours', 'Point commitment shown separately'], 1),
      item(105, 'Review backlog prioritization', 'Code Review', 3, 10, 'm4', 's2', 'Medium', 'Planning', '2.1.1', ['Order persists', 'Filters compose'], 1),
      item(106, 'Add board WIP feedback', 'Testing', 2, 7, 'm3', 's2', 'High', 'Execution', '2.2.3', ['WIP warning is advisory', 'Keyboard move works'], 1),
      item(107, 'Create delivery analytics view', 'To Do', 8, 24, 'm4', 's2', 'High', 'Insights', '3.1.1', ['Burndown uses events', 'Tables mirror charts'], 0),
      item(108, 'Index versioned course evidence', 'To Do', 3, 9, 'm1', null, 'Medium', 'Evidence', '4.1.2', ['Sample artefacts identified'], 0),
      item(109, 'Document deployment boundaries', 'To Do', 2, 5, 'm2', null, 'Low', 'Foundation', '4.2.1', ['Secrets excluded', 'Recovery plan linked'], 0, 'Task'),
      item(110, 'Validate item detail accessibility', 'To Do', 3, 9, 'm3', null, 'Medium', 'Execution', '3.2.2', ['Focus returns to trigger', 'Control labels verified'], 0, 'Bug'),
      item(111, 'Draft release summary', 'To Do', 2, 5, 'm1', null, 'Low', 'Evidence', '4.3.1', ['Sprint metrics included'], 0, 'Task'),
    ],
    sprints: [
      { id: 's1', name: 'Sprint 01', goal: 'Establish the product foundation', state: 'completed', start: '2026-10-05', end: '2026-10-16', pointCapacity: 18, hourCapacity: 54, originalItemIds: ['i101', 'i102', 'i103'], frozenPoints: { i101: 5, i102: 3, i103: 8 }, completedAt: '2026-10-16T12:00:00+05:00', result: { delivered: 16, originalDelivered: 16, commitment: 16, cutoff: '2026-10-16T12:00:00+05:00' } },
      { id: 's2', name: 'Sprint 02', goal: 'Make planning and execution visible', state: 'active', start: '2026-10-19', end: '2026-10-30', pointCapacity: 22, hourCapacity: 72, originalItemIds: ['i104', 'i105', 'i106', 'i107'], frozenPoints: { i104: 5, i105: 3, i106: 2, i107: 8 } },
      { id: 's3', name: 'Sprint 03', goal: 'Polish evidence and release readiness', state: 'planned', start: '2026-11-02', end: '2026-11-13', pointCapacity: 20, hourCapacity: 68, originalItemIds: [], frozenPoints: {} },
    ],
    events: [
      ...[['i101', 5], ['i102', 3], ['i103', 8]].map(([itemId, points], i): Event => ({ id: `e${i + 1}`, sequence: i + 1, at: '2026-10-05T09:00:00+05:00', sprintId: 's1', itemId: String(itemId), kind: 'scope-add', points: Number(points), actor: 'm2' })),
      ...[['i101', '2026-10-09'], ['i102', '2026-10-12'], ['i103', '2026-10-15']].map(([itemId, date], i): Event => ({ id: `e${i + 4}`, sequence: i + 4, at: `${date}T15:00:00+05:00`, sprintId: 's1', itemId, kind: 'status', status: 'Done', actor: 'm3' })),
      ...[['i104', 5], ['i105', 3], ['i106', 2], ['i107', 8]].map(([itemId, points], i): Event => ({ id: `e${i + 7}`, sequence: i + 7, at: '2026-10-19T09:00:00+05:00', sprintId: 's2', itemId: String(itemId), kind: 'scope-add', points: Number(points), actor: 'm2' })),
      { id: 'e11', sequence: 11, at: '2026-10-19T14:00:00+05:00', sprintId: 's2', itemId: 'i104', kind: 'status', status: 'In Progress', actor: 'm3' },
      { id: 'e12', sequence: 12, at: '2026-10-20T14:00:00+05:00', sprintId: 's2', itemId: 'i105', kind: 'status', status: 'Code Review', actor: 'm4' },
      { id: 'e13', sequence: 13, at: '2026-10-21T10:00:00+05:00', sprintId: 's2', itemId: 'i106', kind: 'status', status: 'Testing', actor: 'm3' },
    ],
    evidence: [
      { id: 'ev1', title: 'Project charter', version: 'v1.2', kind: 'Markdown', date: '2026-10-04', note: 'Sample index entry · WBS 1.1' },
      { id: 'ev2', title: 'Sprint 01 planning record', version: 'v1.0', kind: 'PDF', date: '2026-10-05', note: 'Sample index entry · WBS 2.1' },
      { id: 'ev3', title: 'Sprint 01 review notes', version: 'v1.1', kind: 'Markdown', date: '2026-10-16', note: 'Sample index entry · WBS 2.4' },
      { id: 'ev4', title: 'Sprint 01 metrics export', version: 'v1.0', kind: 'CSV', date: '2026-10-16', note: 'Sample index entry · WBS 3.1' },
    ],
  }],
};

const DAY = 86400000;
/**
 * The sample data is authored around Sprint 02 starting 2026-10-19. Rebase every
 * date so Sprint 02 always started five days before `today`: the demo then opens
 * mid-sprint, Sprint 03 is startable, and charts show current days.
 */
export function rebaseDemoDates(state: DemoState, today: Date = new Date()): DemoState {
  const anchor = Date.parse('2026-10-19T00:00:00Z');
  const target = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`) - 5 * DAY;
  const shift = Math.round((target - anchor) / DAY) * DAY;
  if (!shift) return state;
  const date = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + shift).toISOString().slice(0, 10);
  const instant = (t: string) => new Date(Date.parse(t) + shift).toISOString();
  for (const p of state.projects) {
    for (const sp of p.sprints) {
      sp.start = date(sp.start); sp.end = date(sp.end);
      if (sp.completedAt) sp.completedAt = instant(sp.completedAt);
      if (sp.result) sp.result.cutoff = instant(sp.result.cutoff);
    }
    for (const e of p.events) e.at = instant(e.at);
    for (const ev of p.evidence) ev.date = date(ev.date);
  }
  return state;
}

export const cloneInitialState = (today?: Date): DemoState => rebaseDemoDates(JSON.parse(JSON.stringify(initialState)), today);
