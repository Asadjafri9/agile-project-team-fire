'use client';
import { ProjectCalendar } from '@/features/demo/domain';
import { MetricPoint, SAMPLE_LABELS, SprintTimeline } from '@/features/demo/metrics';
import { Sprint, STATUSES } from '@/features/demo/model';

const orDash = (value: number | null) => value ?? '—';

export function startLabel(timeline: SprintTimeline): string {
  if (timeline.startedAt) return new ProjectCalendar(timeline.timezone).describe(timeline.startedAt);
  return timeline.cutoff ? 'Start not recorded' : 'Not started';
}

export function timezoneLabel(timeline: SprintTimeline): string {
  return timeline.cutoff && !timeline.timezoneRecorded
    ? `${timeline.timezone} (project setting; not recorded at start)`
    : timeline.timezone;
}

export function SprintSchedule({ sprint, timeline }: { sprint: Sprint; timeline: SprintTimeline }) {
  const { cutoff, plannedEnd } = timeline;
  const calendar = new ProjectCalendar(timeline.timezone);
  const running = timeline.samples.some(sample => sample.partial);
  const overrun = Boolean(cutoff && plannedEnd && cutoff > plannedEnd);
  return <dl className="sprint-schedule" aria-label="Sprint timeline">
    <div><dt>Planned dates</dt><dd>{sprint.start || '—'} to {sprint.end || '—'}</dd></div>
    <div><dt>Planned end</dt><dd>{plannedEnd ? calendar.describe(plannedEnd) : '—'}</dd></div>
    <div><dt>Actual start</dt><dd>{startLabel(timeline)}</dd></div>
    <div><dt>Timezone</dt><dd>{timezoneLabel(timeline)}</dd></div>
    {cutoff && <div><dt>{running ? 'Data through now (today partial)' : 'Data cutoff'}</dt><dd>{calendar.describe(cutoff)}</dd></div>}
    {overrun && <div className="schedule-overrun"><dt>Overrun</dt><dd>{running ? 'Running past the planned end' : 'Finished after the planned end'}</dd></div>}
  </dl>;
}

// The screen and the printed report share these tables, so they cannot drift apart.
export function BurndownTable({ rows, className }: { rows: MetricPoint[]; className: string }) {
  return <table className={className}>
    <thead><tr><th>Date</th><th>Local time</th><th>Sample</th><th>Original remaining (pts)</th><th>Current remaining (pts)</th><th>Ideal (pts)</th><th>Net scope changes</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.at}><td>{r.date}</td><td>{r.time}</td><td>{SAMPLE_LABELS[r.kind]}</td><td>{orDash(r.original)}</td><td>{orDash(r.current)}</td><td>{orDash(r.ideal)}</td><td>{orDash(r.scopeChange)}</td></tr>)}</tbody>
  </table>;
}

export function FlowTable({ rows, className }: { rows: MetricPoint[]; className: string }) {
  return <table className={className}>
    <thead><tr><th>Date</th><th>Local time</th>{STATUSES.map(s => <th key={s}>{s} (items)</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r.at}><td>{r.date}</td><td>{r.time}</td>{STATUSES.map(s => <td key={s}>{orDash(r.counts?.[s] ?? null)}</td>)}</tr>)}</tbody>
  </table>;
}
