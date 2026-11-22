import { Event, Project, Sprint, SprintState, STATUSES, Status } from './model';

export type MetricPoint = { date: string; original: number; current: number; ideal: number; scopeChange: number; counts: Record<Status, number> };
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
};

const zeroCounts = (): Record<Status, number> => Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<Status, number>;
const atOrBefore = (value: string, cutoff: string) => Date.parse(value) <= Date.parse(cutoff);
const dateSerial = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();
function zonedFormatter(timeZone: string) {
  let formatter = zonedFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    zonedFormatters.set(timeZone, formatter);
  }
  return formatter;
}
function zonedParts(instant: number, timeZone: string) {
  const parts = zonedFormatter(timeZone).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}
function offsetMs(instant: number, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const wholeSecond = Math.floor(instant / 1000) * 1000;
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - wholeSecond;
}
function zonedWallTime(date: string, hour: number, minute: number, second: number, millisecond: number, timeZone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let instant = wall - offsetMs(wall, timeZone);
  instant = wall - offsetMs(instant, timeZone);
  return instant;
}
/** ISO instant of 23:59:59.999 on the given local date in the project timezone. */
export function zonedDayEnd(date: string, timeZone = 'Asia/Karachi'): string {
  return new Date(zonedWallTime(date, 23, 59, 59, 999, timeZone)).toISOString();
}
/** Calendar date (YYYY-MM-DD) of an ISO instant in the project timezone. */
export function localDate(iso: string, timeZone = 'Asia/Karachi'): string {
  const parts = zonedParts(Date.parse(iso), timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
export function snapshot(sprint: Sprint, events: Event[], cutoff: string) {
  const scope = new Map<string, number>();
  const status = new Map<string, Status>();
  let scopeChange = 0;
  for (const event of events.filter(e => e.sprintId === sprint.id && atOrBefore(e.at, cutoff)).sort((a, b) => a.sequence - b.sequence)) {
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
export function idealRemaining(sprint: Sprint, cutoff: string, timeZone = 'Asia/Karachi') {
  const commitment = Object.values(sprint.frozenPoints).reduce((a, b) => a + b, 0);
  const start = zonedWallTime(sprint.start, 0, 0, 0, 0, timeZone);
  const end = zonedWallTime(sprint.end, 0, 0, 0, 0, timeZone);
  const duration = end - start;
  if (duration <= 0) return 0;
  const elapsed = Date.parse(cutoff) - start;
  return Math.round(commitment * Math.max(0, 1 - elapsed / duration) * 10) / 10;
}
export function series(sprint: Sprint, events: Event[], today: string, timeZone = 'Asia/Karachi'): MetricPoint[] {
  if (sprint.state === 'planned') return [];
  const final = sprint.state === 'completed' ? localDate(sprint.completedAt ?? zonedDayEnd(sprint.end, timeZone), timeZone) : today;
  const start = dateSerial(sprint.start);
  const end = Math.max(start, dateSerial(final));
  const points: MetricPoint[] = [];
  for (let time = start; time <= end; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const cutoff = date === today && sprint.state === 'active' ? new Date().toISOString() : zonedDayEnd(date, timeZone);
    const snap = snapshot(sprint, events, cutoff);
    points.push({ date, original: snap.original, current: snap.current, ideal: idealRemaining(sprint, cutoff, timeZone), scopeChange: snap.scopeChange, counts: snap.counts });
  }
  return points;
}
export function velocity(project: Project) {
  return project.sprints.filter(s => s.state === 'completed').sort((a, b) => a.start.localeCompare(b.start)).map(s => ({ name: s.name, committed: s.result?.commitment ?? 0, delivered: s.result?.delivered ?? 0, added: project.events.filter(e => e.sprintId === s.id && e.kind === 'scope-add' && !s.originalItemIds.includes(e.itemId)).reduce((sum, e) => sum + (e.points ?? 0), 0) }));
}

/** The exact dataset used by the dashboard charts and by the CSV/PDF exports. */
export function sprintSummary(project: Project, sprint: Sprint, cutoffOverride?: string): SprintSummary {
  const cutoff = sprint.state === 'completed'
    ? (sprint.result?.cutoff ?? sprint.completedAt ?? zonedDayEnd(sprint.end, project.timezone))
    : (cutoffOverride ?? new Date().toISOString());
  const snap = snapshot(sprint, project.events, cutoff);
  const events = project.events
    .filter(e => e.sprintId === sprint.id && atOrBefore(e.at, cutoff))
    .sort((a, b) => a.sequence - b.sequence);
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
    timezone: project.timezone,
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
  };
}

export function completionLabel(summary: Pick<SprintSummary, 'completionPercent'>): string {
  return summary.completionPercent == null ? 'N/A' : `${summary.completionPercent}%`;
}

/** Escape a CSV cell and neutralise spreadsheet formula injection. */
export function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function sprintSummaryCsv(summary: SprintSummary): string {
  const rows: Array<Array<string | number | null>> = [
    ['Project', summary.projectName],
    ['Sprint', summary.sprintName],
    ['State', summary.state],
    ['Goal', summary.goal],
    ['Dates', `${summary.start} to ${summary.end} (${summary.timezone})`],
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
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
