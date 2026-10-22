import { Event, Project, Sprint, STATUSES, Status } from './model';

export type MetricPoint = { date: string; original: number; current: number; ideal: number; scopeChange: number; counts: Record<Status, number> };
const zeroCounts = (): Record<Status, number> => Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<Status, number>;
export function snapshot(sprint: Sprint, events: Event[], cutoff: string) {
  const scope = new Map<string, number>();
  const status = new Map<string, Status>();
  let scopeChange = 0;
  for (const event of events.filter(e => e.sprintId === sprint.id && e.at <= cutoff).sort((a, b) => a.sequence - b.sequence)) {
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
const day = (date: string) => Date.parse(`${date}T00:00:00Z`);
export function idealRemaining(sprint: Sprint, cutoff: string) {
  const commitment = Object.values(sprint.frozenPoints).reduce((a, b) => a + b, 0);
  const duration = day(sprint.end) - day(sprint.start);
  if (duration <= 0) return 0;
  const elapsed = Date.parse(cutoff) - day(sprint.start);
  return Math.round(commitment * Math.max(0, 1 - elapsed / duration) * 10) / 10;
}
export function series(sprint: Sprint, events: Event[], today: string): MetricPoint[] {
  if (sprint.state === 'planned') return [];
  const final = sprint.state === 'completed' ? (sprint.completedAt?.slice(0, 10) ?? sprint.end) : today;
  const end = Math.max(day(sprint.start), Math.min(day(final), day(sprint.end)));
  const points: MetricPoint[] = [];
  for (let time = day(sprint.start); time <= end; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const cutoff = date === today && sprint.state === 'active' ? new Date().toISOString() : `${date}T23:59:59+05:00`;
    const snap = snapshot(sprint, events, cutoff);
    points.push({ date, original: snap.original, current: snap.current, ideal: idealRemaining(sprint, `${date}T23:59:59Z`), scopeChange: snap.scopeChange, counts: snap.counts });
  }
  return points;
}
export function velocity(project: Project) {
  return project.sprints.filter(s => s.state === 'completed').sort((a, b) => a.start.localeCompare(b.start)).map(s => ({ name: s.name, committed: s.result?.commitment ?? 0, delivered: s.result?.delivered ?? 0, added: project.events.filter(e => e.sprintId === s.id && e.kind === 'scope-add' && !s.originalItemIds.includes(e.itemId)).reduce((sum, e) => sum + (e.points ?? 0), 0) }));
}
