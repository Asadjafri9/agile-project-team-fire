'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, CircleHelp, Download, Printer } from 'lucide-react';
import { Project, STATUSES } from '@/features/demo/model';
import { ProjectCalendar } from '@/features/demo/domain';
import { completionLabel, sprintSummary, sprintSummaryCsv, timezoneSource, velocity } from '@/features/demo/metrics';
import { BurndownTable, FlowTable, startLabel, timezoneLabel } from './sprint-timeline';
import { Pill } from './ui';

const colors = { original: '#315A70', current: '#236A51', ideal: '#8B98A1', 'To Do': '#D9E0E5', 'In Progress': '#315A70', 'Code Review': '#668597', Testing: '#B08342', Done: '#236A51' };
const chartMargin = { top: 8, right: 12, left: -18, bottom: 0 };

/** One tick per local date, at its first instant inside the chart. */
function dayTicks(rows: Array<{ t: number; date: string }>, calendar: ProjectCalendar): number[] {
  return [...new Set(rows.map(r => r.date))].map(date => Math.max(rows[0].t, Date.parse(calendar.startOfDay(date))));
}

export function Analytics({ project }: { project: Project }) {
  const [selected, setSelected] = useState(project.sprints.find(s => s.state === 'active')?.id ?? project.sprints.at(-1)?.id ?? '');
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setMounted(true);
    // An active sprint's timeline runs through now, so move it along while the page stays open.
    const timer = window.setInterval(() => setTick(n => n + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // Never trust a stale/foreign selection: fall back to the active, then the latest sprint.
  const sprint = project.sprints.find(s => s.id === selected) ?? project.sprints.find(s => s.state === 'active') ?? project.sprints.at(-1);
  const summary = useMemo(() => sprint ? sprintSummary(project, sprint, new Date().toISOString()) : null, [project, sprint, tick]);
  const timeline = summary?.timeline;
  const rows = timeline?.samples ?? [];
  const actualRows = rows.filter(r => r.counts !== null);
  const started = Boolean(timeline?.cutoff);
  const calendar = new ProjectCalendar(timeline?.timezone ?? project.timezone);
  const v = velocity(project);
  const hasData = Boolean(sprint && rows.length && project.events.some(e => e.sprintId === sprint.id));
  const exportReady = Boolean(summary && hasData);
  const completion = summary ? completionLabel(summary) : 'N/A';
  const scopeEvents = timeline?.scopeEvents ?? [];
  // One marker per local day, so the labels do not overlap.
  const scopeMarkers = scopeEvents.filter((e, i) => scopeEvents.findIndex(other => other.date === e.date) === i);
  const itemKey = (id: string) => summary?.outcomes.find(o => o.itemId === id)?.key ?? id;
  const chartRows = rows.map(r => ({ ...r, t: Date.parse(r.at) }));
  const flowRows = chartRows.filter(r => r.counts !== null);
  const dateTick = (t: number) => calendar.toLocalDate(new Date(t)).slice(5);
  const tooltipTime = (t: unknown) => calendar.describe(new Date(Number(t)));
  const emptyCopy = sprint?.state === 'planned' ? 'This sprint is planned. Metrics appear after it starts.' : 'No sprint events have been recorded yet.';
  const fileBase = summary ? `${summary.projectCode}-${summary.sprintName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'sprint-summary';

  function downloadCsv() {
    if (!summary) return;
    const blob = new Blob([sprintSummaryCsv(summary)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileBase}-summary.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">DELIVERY INSIGHTS</div><h1>Analytics</h1><p>Metrics replay sprint events and frozen commitment data.</p></div>
      {project.sprints.length > 0 ? <label className="sprint-picker">Sprint <select value={sprint?.id ?? ''} onChange={e => setSelected(e.target.value)}>{project.sprints.map(s => <option key={s.id} value={s.id}>{s.name} · {s.state}</option>)}</select></label> : <span className="sprint-picker" role="status">No sprints to show yet</span>}
    </div>
    {sprint ? <>
      <div className="analytics-context">
        <span><strong>Scope</strong> {project.name} / {sprint.name}</span>
        <span><strong>Planned</strong> {sprint.start || '—'} to {sprint.end || '—'}</span>
        {timeline && <span><strong>Actual start</strong> {startLabel(timeline)}</span>}
        {timeline && <span><strong>Timezone</strong> {timezoneLabel(timeline)}</span>}
        <span><strong>Cutoff</strong> {timeline?.cutoff ? calendar.describe(timeline.cutoff) : 'Not started'} {rows.some(r => r.partial) ? '(today partial)' : ''}</span>
        <span><strong>Units</strong> points; CFD in items</span>
      </div>

      {!hasData && <div className="callout" role="status"><CircleHelp size={20}/><div><strong>No delivery data yet</strong><p>{emptyCopy}</p></div></div>}

      <div className="stats-grid analytics-stats">
        <div className="stat"><span>Original commitment</span><strong>{started ? <>{summary?.commitment}<em> pts</em></> : '—'}</strong><small>Frozen at sprint start</small></div>
        <div className="stat"><span>Original remaining</span><strong>{started && summary ? <>{summary.commitment - summary.originalDelivered}<em> pts</em></> : '—'}</strong><small>Undelivered original scope</small></div>
        <div className="stat"><span>Current remaining</span><strong>{started ? <>{summary?.unresolved}<em> pts</em></> : '—'}</strong><small>Included work still open</small></div>
        <div className="stat"><span>Commitment complete</span><strong>{completion}</strong><small>{started ? `${summary?.originalDelivered} original points delivered` : 'Available after the sprint starts'}</small></div>
      </div>

      <section className="panel export-panel" aria-labelledby="export-heading">
        <div className="panel-head"><div><strong id="export-heading">Sprint summary</strong><span>CSV and print-to-PDF use the same dataset as the dashboard.</span></div></div>
        <div className="export-actions">
          <div>
            <button className="button secondary" onClick={downloadCsv} disabled={!exportReady}><Download size={16}/> Download CSV</button>
          </div>
          <div>
            <button className="button secondary" onClick={() => window.print()} disabled={!exportReady} title="Opens the print dialog. Choose Save as PDF."><Printer size={16}/> Download PDF</button>
            <small className="export-hint">Choose “Save as PDF” in the print dialog.</small>
          </div>
          {!exportReady && <p className="export-hint">{sprint?.state === 'planned' ? `${sprint.name} has not started yet. CSV and PDF summaries become available once it starts.` : 'Exports become available once this sprint has recorded activity.'}</p>}
        </div>
      </section>

      <div className="analytics-grid">
        <section className="panel chart-panel">
          <div className="panel-head"><div><strong>Burndown</strong><span>Original commitment, current scope, and ideal · story points · {sprint.start} to {sprint.end} ({calendar.timezone})</span></div><Pill tone="neutral">{sprint.state}</Pill></div>
          {rows.length ? <>
            <div className="chart-wrap" aria-hidden="true"><ResponsiveContainer width="100%" height={280}><LineChart data={chartRows} margin={chartMargin}>
              <CartesianGrid stroke="#E8ECEF" vertical={false}/>
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={dayTicks(chartRows, calendar)} tickFormatter={dateTick} minTickGap={8} tick={{ fill: '#52616D', fontSize: 11 }} tickLine={false} axisLine={false}/>
              <YAxis tick={{ fill: '#52616D', fontSize: 11 }} tickLine={false} axisLine={false}/>
              <Tooltip labelFormatter={tooltipTime}/>
              <Legend/>
              {timeline?.plannedEnd && <ReferenceLine x={Date.parse(timeline.plannedEnd)} stroke="#8B98A1" label={{ value: 'Planned end', position: 'insideTopRight', fontSize: 10, fill: '#52616D' }}/>}
              {scopeMarkers.map(e => <ReferenceLine key={e.date} x={Date.parse(e.at)} stroke="#A17635" strokeDasharray="3 4" label={{ value: 'Scope', position: 'top', fontSize: 10, fill: '#865500' }}/>)}
              <Line isAnimationActive={false} type="linear" dataKey="original" name="Original remaining" stroke={colors.original} strokeWidth={2.5} dot={false}/>
              <Line isAnimationActive={false} type="linear" dataKey="current" name="Current scope remaining" stroke={colors.current} strokeWidth={2} dot={false}/>
              {rows.some(r => r.ideal !== null) && <Line isAnimationActive={false} type="linear" dataKey="ideal" name="Ideal" stroke={colors.ideal} strokeDasharray="5 4" strokeWidth={2} dot={false}/>}
            </LineChart></ResponsiveContainer></div>
            {!timeline?.startedAt && <div className="chart-legend-note">Start not recorded: the ideal line is not estimated, and samples begin on the day of the first recorded scope event.</div>}
            <div className="chart-legend-note">Scope changes: {scopeEvents.map(e => `${e.kind === 'scope-add' ? '+' : '−'} ${itemKey(e.itemId)} (${e.date})`).join(' · ') || 'none'}</div>
            <details className="chart-table"><summary>View burndown data table</summary><div className="table-scroll"><BurndownTable rows={rows} className="data-table timeline-table"/></div></details>
          </> : <div className="empty">{emptyCopy}</div>}
        </section>

        <section className="panel chart-panel">
          <div className="panel-head"><div><strong>Velocity</strong><span>Completed sprints only · story points</span></div></div>
          {v.length ? <>
            <div className="chart-wrap" aria-hidden="true"><ResponsiveContainer width="100%" height={280}><BarChart data={v} margin={chartMargin}>
              <CartesianGrid stroke="#E8ECEF" vertical={false}/>
              <XAxis dataKey="name" tick={{ fill: '#52616D', fontSize: 11 }} tickLine={false} axisLine={false}/>
              <YAxis tick={{ fill: '#52616D', fontSize: 11 }} tickLine={false} axisLine={false}/>
              <Tooltip/>
              <Legend/>
              <Bar isAnimationActive={false} dataKey="committed" name="Original committed" fill="#A9B7C0" radius={[3,3,0,0]}/>
              <Bar isAnimationActive={false} dataKey="delivered" name="Delivered" fill={colors.original} radius={[3,3,0,0]}/>
            </BarChart></ResponsiveContainer></div>
            <details className="chart-table"><summary>View velocity data table</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>Sprint</th><th>Original committed (pts)</th><th>Added scope (pts)</th><th>Delivered (pts)</th></tr></thead><tbody>{v.map(r => <tr key={r.name}><td>{r.name}</td><td>{r.committed}</td><td>{r.added}</td><td>{r.delivered}</td></tr>)}</tbody></table></div></details>
          </> : <div className="empty">Velocity appears when a sprint is completed.</div>}
        </section>
      </div>

      <section className="panel chart-panel cfd-panel">
        <div className="panel-head"><div><strong>Cumulative flow</strong><span>Included work items by latest status at each day end and at the cutoff · item count · {calendar.timezone}</span></div></div>
        {rows.length ? <>
          <div className="chart-wrap" aria-hidden="true"><ResponsiveContainer width="100%" height={290}><AreaChart data={flowRows} margin={chartMargin}>
            <CartesianGrid stroke="#E8ECEF" vertical={false}/>
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={dayTicks(flowRows, calendar)} tickFormatter={dateTick} minTickGap={8} tick={{ fill: '#52616D', fontSize: 11 }} tickLine={false} axisLine={false}/>
            <YAxis allowDecimals={false} tick={{ fill: '#52616D', fontSize: 11 }} tickLine={false} axisLine={false}/>
            <Tooltip labelFormatter={tooltipTime}/>
            <Legend/>
            {STATUSES.map(status => <Area isAnimationActive={false} key={status} type="stepAfter" dataKey={`counts.${status}`} name={status} stackId="count" fill={colors[status]} stroke={colors[status]}/>)}
          </AreaChart></ResponsiveContainer></div>
          <details className="chart-table"><summary>View cumulative flow data table</summary><div className="table-scroll"><FlowTable rows={actualRows} className="data-table timeline-table"/></div></details>
        </> : <div className="empty">{emptyCopy}</div>}
      </section>
      <div className="inline-note"><CircleHelp size={16}/> Completed sprint results are frozen. Metrics replay the recorded status and scope events for the selected sprint.</div>

      {mounted && summary && hasData && createPortal(<section className="print-report" aria-label="Printable sprint summary">
        <header className="print-head">
          <p className="print-eyebrow">Team Fire · Sprint summary</p>
          <h1>{summary.projectName} — {summary.sprintName}</h1>
          <p className="print-sub">{summary.state} · {summary.start} to {summary.end} · {summary.timezone}</p>
        </header>
        <table className="print-meta"><tbody>
          <tr><th>Project</th><td>{summary.projectName}</td><th>Sprint</th><td>{summary.sprintName}</td></tr>
          <tr><th>Goal</th><td colSpan={3}>{summary.goal || '—'}</td></tr>
          <tr><th>Dates</th><td>{summary.start} to {summary.end}</td><th>Timezone</th><td>{summary.timezone}</td></tr>
          <tr><th>Actual start</th><td>{startLabel(summary.timeline)}</td><th>Planned end</th><td>{summary.timeline.plannedEnd ? calendar.describe(summary.timeline.plannedEnd) : '—'}</td></tr>
          <tr><th>Timezone source</th><td colSpan={3}>{timezoneSource(summary.timeline)}</td></tr>
          <tr><th>Data cutoff</th><td colSpan={3}>{calendar.describe(summary.cutoff)}{rows.some(r => r.partial) ? ' · today partial' : ''}</td></tr>
        </tbody></table>
        <h2>Metrics</h2>
        <table className="print-table"><tbody>
          <tr><th>Original commitment</th><td>{summary.commitment} pts</td><th>Original delivered</th><td>{summary.originalDelivered} pts</td></tr>
          <tr><th>Delivered points</th><td>{summary.delivered} pts</td><th>Unresolved points</th><td>{summary.unresolved} pts</td></tr>
          <tr><th>Scope changes</th><td>{summary.scopeChangeCount}</td><th>Points added / removed</th><td>+{summary.pointsAdded} / −{summary.pointsRemoved}</td></tr>
          <tr><th>Completion</th><td colSpan={3}>{completionLabel(summary)}</td></tr>
        </tbody></table>
        <h2>Item outcomes</h2>
        <table className="print-table">
          <thead><tr><th>Key</th><th>Title</th><th>Points</th><th>Final status</th><th>Original commitment</th><th>Added mid-sprint</th></tr></thead>
          <tbody>{summary.outcomes.map(o => <tr key={o.itemId}><td>{o.key}</td><td>{o.title}</td><td>{o.points}</td><td>{o.status}</td><td>{o.original ? 'Yes' : 'No'}</td><td>{o.addedMidSprint ? 'Yes' : 'No'}</td></tr>)}</tbody>
        </table>
        <h2>Burndown timeline</h2>
        <BurndownTable rows={rows} className="print-table print-timeline"/>
        <h2>Cumulative flow</h2>
        <FlowTable rows={actualRows} className="print-table print-timeline"/>
        <p className="print-note">Items removed during the sprint keep their last recorded status. Generated from sprint events at the data cutoff.</p>
      </section>, document.body)}
    </> : <div className="empty panel"><BarChart3 size={22}/><h2>{project.sprints.length ? 'No sprint data yet' : 'No sprints to show'}</h2><p>{project.sprints.length ? 'Start the sprint to begin recording burndown, velocity and flow.' : 'Create a sprint in Sprint planning, allocate work and start it; analytics fill in from there.'}</p><Link className="button secondary" href={`/projects/${project.id}/planning`}>Go to Sprint planning</Link></div>}
  </>;
}
