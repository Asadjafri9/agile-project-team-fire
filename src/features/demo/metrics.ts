import { addLocalDays, createSprintDomain, ProjectCalendar } from './domain';
import { Event, Project, Sprint, SprintState, STATUSES, Status } from './model';

export type SampleKind = 'start' | 'day' | 'planned-end' | 'now' | 'completion';
export const SAMPLE_LABELS: Record<SampleKind, string> = {
  start: 'Actual start',
  day: 'Day end',
  'planned-end': 'Planned end',
  now: 'Now (today partial)',
  completion: 'Completion cutoff',
};
/** One timeline sample. Beyond the cutoff only the ideal is known, so every actual value is null. */
export type MetricPoint = {
  at: string;
  date: string;
  time: string;
  kind: SampleKind;
  partial: boolean;
  original: number | null;
  current: number | null;
  ideal: number | null;
  scopeChange: number | null;
  counts: Record<Status, number> | null;
};
export type SprintTimeline = {
  timezone: string;
  /** False when falling back to the project's current setting. */
  timezoneRecorded: boolean;
  startedAt: string | null;
  plannedEnd: string | null;
  cutoff: string | null;
  samples: MetricPoint[];
  scopeEvents: Array<{ at: string; date: string; itemId: string; kind: 'scope-add' | 'scope-remove' }>;
};
export type SprintOutcome = {
  itemId: string;
  key: string;
  title: string;
  points: number;
  status: Status;
  original: boolean;
  addedMidSprint: boolean;
};
export type SprintSummary = {
  projectName: string;
  projectCode: string;
  sprintName: string;
  goal: string;
  state: SprintState;
  start: string;
  end: string;
  timezone: string;
  cutoff: string;
  commitment: number;
  originalDelivered: number;
  delivered: number;
  unresolved: number;
  completionPercent: number | null;
  scopeChangeCount: number;
  pointsAdded: number;
  pointsRemoved: number;
  outcomes: SprintOutcome[];
  timeline: SprintTimeline;
};

const zeroCounts = (): Record<Status, number> => Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<Status, number>;
const atOrBefore = (value: string, cutoff: string) => Date.parse(value) <= Date.parse(cutoff);
/** Projecting the ideal beyond this many days keeps only the planned-end point. */
const MAX_PROJECTED_DAYS = 366;
/** ISO instant of 23:59:59.999 on the given local date in the project timezone. */
export function zonedDayEnd(date: string, timeZone = 'Asia/Karachi'): string {
  return new ProjectCalendar(timeZone).endOfDay(date);
}
/** Calendar date (YYYY-MM-DD) of an ISO instant in the project timezone. */
export function localDate(iso: string, timeZone = 'Asia/Karachi'): string {
  return new ProjectCalendar(timeZone).toLocalDate(iso);
}
/**
 * A sprint's events up to the cutoff, in replay order. The database stamps the
 * commitment a few milliseconds after started_at, so each original item's first
 * addition is read as happening at the start.
 */
function replayEvents(sprint: Sprint, events: Event[], cutoff: string): Event[] {
  const committed = new Set<string>();
  return events
    .filter(e => e.sprintId === sprint.id)
    .sort((a, b) => a.sequence - b.sequence)
    .map(event => {
      if (event.kind !== 'scope-add' || !sprint.originalItemIds.includes(event.itemId) || committed.has(event.itemId)) return event;
      committed.add(event.itemId);
      return sprint.startedAt && !atOrBefore(event.at, sprint.startedAt) ? { ...event, at: sprint.startedAt } : event;
    })
    .filter(e => atOrBefore(e.at, cutoff));
}
export function snapshot(sprint: Sprint, events: Event[], cutoff: string) {
  const scope = new Map<string, number>();
  const status = new Map<string, Status>();
  let scopeChange = 0;
  for (const event of replayEvents(sprint, events, cutoff)) {
    if (event.kind === 'scope-add') { scope.set(event.itemId, event.points ?? 0); status.set(event.itemId, event.status ?? 'To Do'); if (!sprint.originalItemIds.includes(event.itemId)) scopeChange++; }
    if (event.kind === 'scope-remove') { scope.delete(event.itemId); scopeChange--; }
    if (event.kind === 'status' && scope.has(event.itemId) && event.status) status.set(event.itemId, event.status);
  }
  const commitment = Object.values(sprint.frozenPoints).reduce((sum, points) => sum + points, 0);
  const originalDelivered = sprint.originalItemIds.reduce((sum, id) => sum + (scope.has(id) && status.get(id) === 'Done' ? (sprint.frozenPoints[id] ?? 0) : 0), 0);
  const current = [...scope.entries()].reduce((sum, [id, points]) => sum + (status.get(id) === 'Done' ? 0 : points), 0);
  const delivered = [...scope.entries()].reduce((sum, [id, points]) => sum + (status.get(id) === 'Done' ? points : 0), 0);
  const counts = zeroCounts(); for (const id of scope.keys()) counts[status.get(id) ?? 'To Do']++;
  return { commitment, original: commitment - originalDelivered, originalDelivered, current, delivered, scopeChange, counts };
}
export function idealRemaining(sprint: Sprint, cutoff: string, timeZone = 'Asia/Karachi'): number | null {
  return createSprintDomain(sprint, timeZone).idealRemainingAt(cutoff);
}
/** The one dataset behind planning, charts, data tables, CSV and PDF (FR-4, FR-5). */
export function sprintTimeline(sprint: Sprint, events: Event[], now: Date | string = new Date(), timeZone = 'Asia/Karachi'): SprintTimeline {
  const domain = createSprintDomain(sprint, timeZone);
  const { calendar, startedAt } = domain;
  const plannedEnd = domain.plannedEnd();
  const cutoff = domain.timelineCutoff(now);
  const timeline: SprintTimeline = {
    timezone: calendar.timezone, timezoneRecorded: Boolean(sprint.timezone), startedAt, plannedEnd, cutoff, samples: [], scopeEvents: [],
  };
  if (!cutoff) return timeline;

  const recorded = replayEvents(sprint, events, cutoff);
  // Without a recorded start, sample from the first recorded commitment but never present it as the start.
  // Status events cannot be used here: moves made while planning also carry the sprint id.
  const additions = recorded.filter(e => e.kind === 'scope-add').map(e => Date.parse(e.at));
  if (!startedAt && !additions.length) return timeline;
  const from = startedAt ? Date.parse(startedAt) : Math.min(...additions);
  const until = Date.parse(cutoff);
  const end = plannedEnd ? Date.parse(plannedEnd) : null;
  const projects = startedAt !== null && end !== null && end > from;

  const instants = new Map<number, SampleKind>();
  if (startedAt) instants.set(from, 'start');
  const lastDayEnd = projects && end > until && end - until <= MAX_PROJECTED_DAYS * 86400000 ? end : until;
  for (let date = calendar.toLocalDate(new Date(from)); ; date = addLocalDays(date, 1)) {
    const at = Date.parse(calendar.endOfDay(date));
    if (at >= lastDayEnd) break;
    instants.set(at, 'day');
  }
  if (projects) instants.set(end, 'planned-end');
  instants.set(until, domain.isTodayPartial(now) ? 'now' : 'completion');

  timeline.samples = [...instants].sort((a, b) => a[0] - b[0]).map(([instant, kind]) => {
    const at = new Date(instant).toISOString();
    const snap = instant <= until ? snapshot(sprint, recorded, at) : null;
    return {
      at,
      date: calendar.toLocalDate(at),
      time: calendar.toLocalTime(at),
      kind,
      partial: kind === 'now',
      original: snap?.original ?? null,
      current: snap?.current ?? null,
      ideal: domain.idealRemainingAt(at),
      scopeChange: snap?.scopeChange ?? null,
      counts: snap?.counts ?? null,
    };
  });
  timeline.scopeEvents = recorded.flatMap(event =>
    event.kind === 'scope-remove' || (event.kind === 'scope-add' && !sprint.originalItemIds.includes(event.itemId))
      ? [{ at: event.at, date: calendar.toLocalDate(event.at), itemId: event.itemId, kind: event.kind }]
      : []);
  return timeline;
}
export function series(sprint: Sprint, events: Event[], now: Date | string, timeZone = 'Asia/Karachi'): MetricPoint[] {
  return sprintTimeline(sprint, events, now, timeZone).samples;
}
export function velocity(project: Project) {
  return project.sprints.filter(s => s.state === 'completed').sort((a, b) => a.start.localeCompare(b.start)).map(s => ({ name: s.name, committed: s.result?.commitment ?? 0, delivered: s.result?.delivered ?? 0, added: project.events.filter(e => e.sprintId === s.id && e.kind === 'scope-add' && !s.originalItemIds.includes(e.itemId)).reduce((sum, e) => sum + (e.points ?? 0), 0) }));
}

/** The exact dataset used by the dashboard charts and by the CSV/PDF exports. */
export function sprintSummary(project: Project, sprint: Sprint, cutoffOverride?: string): SprintSummary {
  const now = cutoffOverride ?? new Date().toISOString();
  const timeline = sprintTimeline(sprint, project.events, now, project.timezone);
  const cutoff = timeline.cutoff ?? now;
  const snap = snapshot(sprint, project.events, cutoff);
  const events = replayEvents(sprint, project.events, cutoff);
  const points = new Map<string, number>();
  const statuses = new Map<string, Status>();
  const everIncluded = new Set<string>();
  const addedMidSprint = new Set<string>();
  let scopeChangeCount = 0;
  let pointsAdded = 0;
  let pointsRemoved = 0;
  for (const event of events) {
    if (event.kind === 'scope-add') {
      const entryPoints = event.points ?? 0;
      points.set(event.itemId, entryPoints);
      statuses.set(event.itemId, event.status ?? 'To Do');
      everIncluded.add(event.itemId);
      if (!sprint.originalItemIds.includes(event.itemId)) {
        addedMidSprint.add(event.itemId);
        scopeChangeCount += 1;
        pointsAdded += entryPoints;
      }
    } else if (event.kind === 'scope-remove') {
      if (everIncluded.has(event.itemId)) {
        scopeChangeCount += 1;
        pointsRemoved += points.get(event.itemId) ?? 0;
      }
    } else if (event.kind === 'status' && event.status && everIncluded.has(event.itemId)) {
      statuses.set(event.itemId, event.status);
    }
  }
  const outcomes = [...everIncluded]
    .sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0) || a.localeCompare(b))
    .map((itemId): SprintOutcome => {
      const item = project.items.find(i => i.id === itemId);
      const original = sprint.originalItemIds.includes(itemId);
      return {
        itemId,
        key: item?.key ?? itemId,
        title: item?.title ?? itemId,
        points: original ? (sprint.frozenPoints[itemId] ?? points.get(itemId) ?? 0) : (points.get(itemId) ?? 0),
        status: statuses.get(itemId) ?? 'To Do',
        original,
        addedMidSprint: addedMidSprint.has(itemId),
      };
    });
  const commitment = sprint.state === 'completed' && sprint.result ? sprint.result.commitment : snap.commitment;
  const originalDelivered = sprint.state === 'completed' && sprint.result ? sprint.result.originalDelivered : snap.originalDelivered;
  const delivered = sprint.state === 'completed' && sprint.result ? sprint.result.delivered : snap.delivered;
  return {
    projectName: project.name,
    projectCode: project.code,
    sprintName: sprint.name,
    goal: sprint.goal,
    state: sprint.state,
    start: sprint.start,
    end: sprint.end,
    timezone: timeline.timezone,
    cutoff,
    commitment,
    originalDelivered,
    delivered,
    unresolved: snap.current,
    completionPercent: commitment > 0 ? Math.round(originalDelivered / commitment * 1000) / 10 : null,
    scopeChangeCount,
    pointsAdded,
    pointsRemoved,
    outcomes,
    timeline,
  };
}

export function timezoneSource(timeline: SprintTimeline): string {
  return timeline.timezoneRecorded ? 'Recorded at start' : 'Current project setting';
}

export function completionLabel(summary: Pick<SprintSummary, 'completionPercent'>): string {
  return summary.completionPercent == null ? 'N/A' : `${summary.completionPercent}%`;
}

/** Escape a CSV cell and neutralise spreadsheet formula injection. */
export function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function sprintSummaryCsv(summary: SprintSummary): string {
  const { timeline } = summary;
  const rows: Array<Array<string | number | null>> = [
    ['Project', summary.projectName],
    ['Sprint', summary.sprintName],
    ['State', summary.state],
    ['Goal', summary.goal],
    ['Dates', `${summary.start} to ${summary.end} (${summary.timezone})`],
    ['Timezone source', timezoneSource(timeline)],
    ['Actual start', timeline.startedAt ?? (timeline.cutoff ? 'Not recorded' : 'Not started')],
    ['Planned end boundary', timeline.plannedEnd],
    ['Data cutoff', summary.cutoff],
    ['Original commitment', summary.commitment],
    ['Scope changes', summary.scopeChangeCount],
    ['Points added', summary.pointsAdded],
    ['Points removed', summary.pointsRemoved],
    ['Delivered points', summary.delivered],
    ['Unresolved points', summary.unresolved],
    ['Completion', completionLabel(summary)],
    [],
    ['Key', 'Title', 'Points', 'Final status', 'Original commitment', 'Added mid-sprint'],
    ...summary.outcomes.map(outcome => [outcome.key, outcome.title, outcome.points, outcome.status, outcome.original ? 'Yes' : 'No', outcome.addedMidSprint ? 'Yes' : 'No']),
    [],
    ['Date', 'Local time', 'Sample', 'UTC instant', 'Original remaining (pts)', 'Current remaining (pts)', 'Ideal (pts)', 'Net scope changes', ...STATUSES.map(status => `${status} (items)`)],
    ...timeline.samples.map(r => [r.date, r.time, SAMPLE_LABELS[r.kind], r.at, r.original, r.current, r.ideal, r.scopeChange, ...STATUSES.map(status => r.counts?.[status] ?? null)]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
