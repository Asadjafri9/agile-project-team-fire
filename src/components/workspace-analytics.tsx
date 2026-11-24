'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, CircleHelp, Download, Printer } from 'lucide-react';
import { Project, STATUSES } from '@/features/demo/model';
import { completionLabel, localDate, series, sprintSummary, sprintSummaryCsv, velocity } from '@/features/demo/metrics';
import { Pill } from './ui';

const colors = { original: '#111111', current: '#F2561D', ideal: '#9E9E9E', 'To Do': '#DEDEDE', 'In Progress': '#F2561D', 'Code Review': '#F8A07D', Testing: '#707070', Done: '#111111' };
const chartMargin = { top: 8, right: 12, left: -18, bottom: 0 };

export function Analytics({ project }: { project: Project }) {
  const [selected, setSelected] = useState(project.sprints.find(s => s.state === 'active')?.id ?? project.sprints.at(-1)?.id ?? '');
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Never trust a stale/foreign selection: fall back to the active, then the latest sprint.
  const sprint = project.sprints.find(s => s.id === selected) ?? project.sprints.find(s => s.state === 'active') ?? project.sprints.at(-1);
  const today = localDate(new Date().toISOString(), project.timezone);
  const rows = useMemo(() => sprint ? series(sprint, project.events, today, project.timezone) : [], [sprint, project.events, today, project.timezone]);
  const summary = useMemo(() => sprint ? sprintSummary(project, sprint) : null, [project, sprint]);
  const v = velocity(project);
  const hasData = Boolean(sprint && sprint.state !== 'planned' && project.events.some(e => e.sprintId === sprint.id));
  const exportReady = Boolean(summary && hasData);
  const completion = summary ? completionLabel(summary) : 'N/A';
  const formatCutoff = (iso: string) => `${new Intl.DateTimeFormat('en-GB', { timeZone: project.timezone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))} (${project.timezone})`;
  const cutoffIso = sprint?.result?.cutoff ?? summary?.cutoff ?? new Date().toISOString();
  const scopeDates = sprint ? [...new Set(project.events.filter(e => e.sprintId === sprint.id && (e.kind === 'scope-remove' || e.kind === 'scope-add' && !sprint.originalItemIds.includes(e.itemId))).map(e => e.at.slice(5, 10)))] : [];
  const chartRows = rows.map(r => ({ ...r, day: r.date.slice(5) }));
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
        <span><strong>Timezone</strong> {project.timezone}</span>
        <span><strong>Cutoff</strong> {formatCutoff(cutoffIso)} {sprint.state === 'active' ? '(today partial)' : ''}</span>
        <span><strong>Units</strong> points; CFD in items</span>
      </div>

      {!hasData && <div className="callout" role="status"><CircleHelp size={20}/><div><strong>No delivery data yet</strong><p>{emptyCopy}</p></div></div>}

      <div className="stats-grid analytics-stats">
        <div className="stat"><span>Original commitment</span><strong>{summary?.commitment ?? 0}<em> pts</em></strong><small>Frozen at sprint start</small></div>
        <div className="stat"><span>Original remaining</span><strong>{summary ? summary.commitment - summary.originalDelivered : 0}<em> pts</em></strong><small>Undelivered original scope</small></div>
        <div className="stat"><span>Current remaining</span><strong>{summary?.unresolved ?? 0}<em> pts</em></strong><small>Included work still open</small></div>
        <div className="stat"><span>Commitment complete</span><strong>{completion}</strong><small>{summary?.originalDelivered ?? 0} original points delivered</small></div>
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
          <div className="panel-head"><div><strong>Burndown</strong><span>Original commitment, current scope, and ideal · story points</span></div><Pill tone="neutral">{sprint.state}</Pill></div>
          {rows.length ? <>
            <div className="chart-wrap" aria-hidden="true"><ResponsiveContainer width="100%" height={280}><LineChart data={chartRows} margin={chartMargin}>
              <CartesianGrid stroke="#EBEBEB" vertical={false}/>
              <XAxis dataKey="day" tick={{ fill: '#5F5F5F', fontSize: 11 }} tickLine={false} axisLine={false}/>
              <YAxis tick={{ fill: '#5F5F5F', fontSize: 11 }} tickLine={false} axisLine={false}/>
              <Tooltip/>
              <Legend/>
              {scopeDates.map(date => <ReferenceLine key={date} x={date} stroke="#F2561D" strokeDasharray="3 4" label={{ value: 'Scope', position: 'top', fontSize: 10, fill: '#865500' }}/>)}
              <Line isAnimationActive={false} type="linear" dataKey="original" name="Original remaining" stroke={colors.original} strokeWidth={2.5} dot={false}/>
              <Line isAnimationActive={false} type="linear" dataKey="current" name="Current scope remaining" stroke={colors.current} strokeWidth={2} dot={false}/>
              <Line isAnimationActive={false} type="linear" dataKey="ideal" name="Ideal" stroke={colors.ideal} strokeDasharray="5 4" strokeWidth={2} dot={false}/>
            </LineChart></ResponsiveContainer></div>
            <div className="chart-legend-note">Scope changes: {project.events.filter(e => e.sprintId === sprint.id && (e.kind === 'scope-add' && !sprint.originalItemIds.includes(e.itemId) || e.kind === 'scope-remove')).map(e => `${e.kind === 'scope-add' ? '+' : '−'} ${e.itemId} (${e.at.slice(0, 10)})`).join(' · ') || 'none'}</div>
            <details className="chart-table"><summary>View burndown data table</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Original remaining (pts)</th><th>Current remaining (pts)</th><th>Ideal (pts)</th><th>Net scope changes</th></tr></thead><tbody>{rows.map(r => <tr key={r.date}><td>{r.date}</td><td>{r.original}</td><td>{r.current}</td><td>{r.ideal}</td><td>{r.scopeChange}</td></tr>)}</tbody></table></div></details>
          </> : <div className="empty">{emptyCopy}</div>}
        </section>

        <section className="panel chart-panel">
          <div className="panel-head"><div><strong>Velocity</strong><span>Completed sprints only · story points</span></div></div>
          {v.length ? <>
            <div className="chart-wrap" aria-hidden="true"><ResponsiveContainer width="100%" height={280}><BarChart data={v} margin={chartMargin}>
              <CartesianGrid stroke="#EBEBEB" vertical={false}/>
              <XAxis dataKey="name" tick={{ fill: '#5F5F5F', fontSize: 11 }} tickLine={false} axisLine={false}/>
              <YAxis tick={{ fill: '#5F5F5F', fontSize: 11 }} tickLine={false} axisLine={false}/>
              <Tooltip/>
              <Legend/>
              <Bar isAnimationActive={false} dataKey="committed" name="Original committed" fill="#BDBDBD" radius={[3,3,0,0]}/>
              <Bar isAnimationActive={false} dataKey="delivered" name="Delivered" fill={colors.original} radius={[3,3,0,0]}/>
            </BarChart></ResponsiveContainer></div>
            <details className="chart-table"><summary>View velocity data table</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>Sprint</th><th>Original committed (pts)</th><th>Added scope (pts)</th><th>Delivered (pts)</th></tr></thead><tbody>{v.map(r => <tr key={r.name}><td>{r.name}</td><td>{r.committed}</td><td>{r.added}</td><td>{r.delivered}</td></tr>)}</tbody></table></div></details>
          </> : <div className="empty">Velocity appears when a sprint is completed.</div>}
        </section>
      </div>

      <section className="panel chart-panel cfd-panel">
        <div className="panel-head"><div><strong>Cumulative flow</strong><span>Included work items by latest status at each day end · item count</span></div></div>
        {rows.length ? <>
          <div className="chart-wrap" aria-hidden="true"><ResponsiveContainer width="100%" height={290}><AreaChart data={chartRows} margin={chartMargin}>
            <CartesianGrid stroke="#EBEBEB" vertical={false}/>
            <XAxis dataKey="day" tick={{ fill: '#5F5F5F', fontSize: 11 }} tickLine={false} axisLine={false}/>
            <YAxis allowDecimals={false} tick={{ fill: '#5F5F5F', fontSize: 11 }} tickLine={false} axisLine={false}/>
            <Tooltip/>
            <Legend/>
            {STATUSES.map(status => <Area isAnimationActive={false} key={status} type="stepAfter" dataKey={`counts.${status}`} name={status} stackId="count" fill={colors[status]} stroke={colors[status]}/>)}
          </AreaChart></ResponsiveContainer></div>
          <details className="chart-table"><summary>View cumulative flow data table</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th>{STATUSES.map(s => <th key={s}>{s} (items)</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.date}><td>{r.date}</td>{STATUSES.map(s => <td key={s}>{r.counts[s]}</td>)}</tr>)}</tbody></table></div></details>
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
          <tr><th>Data cutoff</th><td colSpan={3}>{formatCutoff(summary.cutoff)}</td></tr>
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
        <p className="print-note">Items removed during the sprint keep their last recorded status. Generated from sprint events at the data cutoff.</p>
      </section>, document.body)}
    </> : <div className="empty panel"><BarChart3 size={22}/><h2>{project.sprints.length ? 'No sprint data yet' : 'No sprints to show'}</h2><p>{project.sprints.length ? 'Start the sprint to begin recording burndown, velocity and flow.' : 'Create a sprint in Sprint planning, allocate work and start it; analytics fill in from there.'}</p><Link className="button secondary" href={`/projects/${project.id}/planning`}>Go to Sprint planning</Link></div>}
  </>;
}
