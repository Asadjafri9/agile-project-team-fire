'use client';
import { type FormEvent, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarDays, CheckCircle2, CircleHelp, Plus } from 'lucide-react';
import { allowed, useDemo } from '@/features/demo/store';
import { Project, Role, WorkItem } from '@/features/demo/model';
import { localDate } from '@/features/demo/metrics';
import { Modal, Pill } from './ui';

type ReasonRequest = { item: WorkItem; sprintId: string | null; targetName: string };

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function Planning({ project, role, onItem }: { project: Project; role: Role; onItem: (id: string) => void }) {
  const { dispatch, mode } = useDemo();
  const [selected, setSelected] = useState(project.sprints.find(s => s.state === 'planned')?.id ?? project.sprints.find(s => s.state === 'active')?.id ?? project.sprints[0]?.id ?? '');
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [newPointCapacity, setNewPointCapacity] = useState(20);
  const [newHourCapacity, setNewHourCapacity] = useState(70);
  const [newError, setNewError] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [carryTarget, setCarryTarget] = useState('');
  const [reasonRequest, setReasonRequest] = useState<ReasonRequest | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const sprint = project.sprints.find(s => s.id === selected) ?? project.sprints.at(-1);
  const activeSprint = project.sprints.find(s => s.state === 'active');
  const inSprint = project.items.filter(i => i.sprintId === sprint?.id);
  const candidate = project.items.filter(i => !i.sprintId && i.status !== 'Done').sort((a, b) => a.order - b.order);
  const points = inSprint.reduce((n, i) => n + (i.points ?? 0), 0);
  const hours = inSprint.reduce((n, i) => n + (i.hours ?? 0), 0);
  const canPlan = allowed(role, 'plan');
  const unresolved = inSprint.filter(i => i.status !== 'Done');
  const plannedSprints = project.sprints.filter(s => s.state === 'planned' && s.id !== sprint?.id);

  const startIssues: string[] = [];
  if (sprint?.state === 'planned') {
    if (!sprint.goal.trim()) startIssues.push('Add a sprint goal.');
    if (!sprint.start || !sprint.end || Date.parse(sprint.end) <= Date.parse(sprint.start)) startIssues.push('Set an end date after the start date.');
    if (!inSprint.length) startIssues.push('Allocate at least one work item.');
    const unestimated = inSprint.filter(i => i.points == null);
    if (unestimated.length) startIssues.push(`Estimate ${unestimated.map(i => i.key).join(', ')} before starting.`);
    if (activeSprint) startIssues.push(`Complete ${activeSprint.name} before starting another sprint.`);
  }
  const allEstimated = inSprint.length > 0 && inSprint.every(i => i.points != null);
  const unestimatedKeys = inSprint.filter(i => i.points == null).map(i => i.key);

  function requestAllocate(item: WorkItem, sprintId: string | null) {
    const target = project.sprints.find(s => s.id === sprintId);
    const current = project.sprints.find(s => s.id === item.sprintId);
    if (current?.state !== 'active' && target?.state !== 'active') {
      dispatch({ type: 'allocate', projectId: project.id, itemId: item.id, sprintId });
      return;
    }
    setReason('');
    setReasonError('');
    setReasonRequest({ item, sprintId, targetName: target?.name ?? 'the backlog' });
  }

  const reasonTarget = reasonRequest ? project.sprints.find(s => s.id === reasonRequest.sprintId) : null;
  const reasonBlocked = Boolean(reasonRequest && reasonTarget?.state === 'active' && reasonRequest.item.points == null);

  function submitReason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reasonRequest || reasonBlocked) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setReasonError('Enter a reason of at least 5 characters.');
      return;
    }
    dispatch({ type: 'allocate', projectId: project.id, itemId: reasonRequest.item.id, sprintId: reasonRequest.sprintId, reason: trimmed });
    setReasonRequest(null);
    setReason('');
    setReasonError('');
  }

  function openComplete() {
    setCarryTarget('');
    setCompleteOpen(true);
  }

  const newDateError = Boolean(newStart && newEnd && Date.parse(newEnd) <= Date.parse(newStart));

  function openNewSprint() {
    const today = localDate(new Date().toISOString(), project.timezone);
    const latestEnd = project.sprints.map(s => s.end).filter(Boolean).sort().at(-1);
    const start = latestEnd ? addDays(latestEnd, 1) : today;
    setNewName('');
    setNewGoal('');
    setNewStart(start);
    setNewEnd(addDays(start, 13));
    setNewPointCapacity(20);
    setNewHourCapacity(70);
    setNewError('');
    setNewOpen(true);
  }

  function submitNewSprint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newName.trim()) { setNewError('Sprint name is required.'); return; }
    if (!newStart || !newEnd || newDateError) { setNewError('End date must be after the start date.'); return; }
    dispatch({
      type: 'create-sprint',
      projectId: project.id,
      name: newName.trim(),
      goal: newGoal.trim(),
      start: newStart,
      end: newEnd,
      pointCapacity: Math.max(0, Number(newPointCapacity) || 0),
      hourCapacity: Math.max(0, Number(newHourCapacity) || 0),
    });
    setNewOpen(false);
  }

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">SPRINT PLANNING</div>
        <h1>Plan the next sprint</h1>
        <p>Keep available hours distinct from story-point commitment.</p>
      </div>
      {canPlan && <button className="button secondary" onClick={openNewSprint}><Plus size={17}/> New sprint</button>}
    </div>
    <div className="sprint-tabs" role="tablist" aria-label="Select sprint">
      {project.sprints.map(s => <button key={s.id} role="tab" aria-selected={s.id === sprint?.id} className={s.id === sprint?.id ? 'selected' : ''} onClick={() => setSelected(s.id)}>{s.name}<span className={`state-dot ${s.state}`}/></button>)}
    </div>
    {sprint ? <>
      <div className="planning-grid">
        <section className="panel planning-details">
          <div className="panel-head">
            <div><strong>{sprint.name}</strong><span>{sprint.state === 'active' ? 'In progress' : sprint.state === 'completed' ? 'Closed snapshot' : 'Ready to plan'}</span></div>
            <Pill tone={sprint.state === 'active' ? 'green' : 'neutral'}>{sprint.state}</Pill>
          </div>
          <div className="planning-fields">
            <label>Sprint goal<input value={sprint.goal} disabled={!canPlan || sprint.state !== 'planned'} onChange={e => dispatch({ type: 'sprint', projectId: project.id, sprintId: sprint.id, patch: { goal: e.target.value } })}/></label>
            <div className="form-grid">
              <label>Start date<input type="date" value={sprint.start} disabled={!canPlan || sprint.state !== 'planned'} onChange={e => dispatch({ type: 'sprint', projectId: project.id, sprintId: sprint.id, patch: { start: e.target.value } })}/></label>
              <label>End date<input type="date" value={sprint.end} disabled={!canPlan || sprint.state !== 'planned'} onChange={e => dispatch({ type: 'sprint', projectId: project.id, sprintId: sprint.id, patch: { end: e.target.value } })}/></label>
            </div>
            <div className="form-grid">
              <label>Story-point capacity<input type="number" min="0" value={sprint.pointCapacity} disabled={!canPlan || sprint.state !== 'planned'} onChange={e => dispatch({ type: 'sprint', projectId: project.id, sprintId: sprint.id, patch: { pointCapacity: Number(e.target.value) } })}/></label>
              <label>Available hours<input type="number" min="0" value={sprint.hourCapacity} disabled={!canPlan || sprint.state !== 'planned'} onChange={e => dispatch({ type: 'sprint', projectId: project.id, sprintId: sprint.id, patch: { hourCapacity: Number(e.target.value) } })}/></label>
            </div>
          </div>
        </section>
        <section className="panel capacity-panel">
          <div className="panel-head"><strong>Commitment check</strong></div>
          <div className="capacity-row">
            <div><span>Story points</span><strong>{points} / {sprint.pointCapacity}</strong></div>
            <div className="capacity-track"><span style={{ width: `${Math.min(100, sprint.pointCapacity ? points / sprint.pointCapacity * 100 : 0)}%` }}/></div>
            <small>{points > sprint.pointCapacity ? 'Above point capacity — review the scope.' : `${Math.max(0, sprint.pointCapacity - points)} points available`}</small>
          </div>
          <div className="capacity-row">
            <div><span>Planned hours</span><strong>{hours} / {sprint.hourCapacity}</strong></div>
            <div className="capacity-track"><span style={{ width: `${Math.min(100, sprint.hourCapacity ? hours / sprint.hourCapacity * 100 : 0)}%` }}/></div>
            <small>{hours > sprint.hourCapacity ? 'Above available hours — review estimates.' : `${Math.max(0, sprint.hourCapacity - hours)} hours available`}</small>
          </div>
          <div className="capacity-note"><CircleHelp size={16}/> Point capacity is a delivery forecast. Hours represent team availability; they are not converted into points.</div>
        </section>
      </div>

      {sprint.state === 'planned' && <section className="panel start-checks" aria-labelledby="start-checks-heading">
        <div className="panel-head">
          <div><strong id="start-checks-heading">Before you start</strong><span>Start is disabled until every check passes.</span></div>
          <Pill tone={startIssues.length ? 'amber' : 'green'}>{startIssues.length ? `${startIssues.length} to resolve` : 'Ready to start'}</Pill>
        </div>
        <ul>
          <li className={sprint.goal.trim() ? 'ok' : 'issue'}>{sprint.goal.trim() ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}<span>{sprint.goal.trim() ? 'Sprint goal is set' : 'Add a sprint goal.'}</span></li>
          <li className={sprint.start && sprint.end && Date.parse(sprint.end) > Date.parse(sprint.start) ? 'ok' : 'issue'}>{sprint.start && sprint.end && Date.parse(sprint.end) > Date.parse(sprint.start) ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}<span>{sprint.start && sprint.end && Date.parse(sprint.end) > Date.parse(sprint.start) ? 'End date follows the start date' : 'Set an end date after the start date.'}</span></li>
          <li className={inSprint.length ? 'ok' : 'issue'}>{inSprint.length ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}<span>{inSprint.length ? `${inSprint.length} item${inSprint.length === 1 ? '' : 's'} allocated` : 'Allocate at least one work item.'}</span></li>
          <li className={allEstimated ? 'ok' : 'issue'}>{allEstimated ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}<span>{allEstimated ? 'Every item is estimated' : unestimatedKeys.length ? `Estimate ${unestimatedKeys.join(', ')} before starting.` : 'Add items before checking estimates.'}</span></li>
          <li className={activeSprint ? 'issue' : 'ok'}>{activeSprint ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>}<span>{activeSprint ? `Complete ${activeSprint.name} before starting another sprint.` : 'No other sprint is active'}</span></li>
        </ul>
      </section>}

      <div className="planning-list-grid">
        <section className="panel">
          <div className="panel-head"><strong>In {sprint.name}</strong><span>{inSprint.length} items</span></div>
          <div className="planning-items">
            {inSprint.map(i => <div key={i.id} className="planning-item">
              <button className="planning-item-name" onClick={() => onItem(i.id)}><span className="item-key">{i.key}</span><strong>{i.title}</strong></button>
              <span>{i.points ?? '—'} pts</span>
              <label className="hours-field"><span className="sr-only">Planned hours for {i.key}</span><input type="number" min="0" value={i.hours ?? ''} placeholder="hrs" disabled={!canPlan || sprint.state !== 'planned'} onChange={e => dispatch({ type: 'update-item', projectId: project.id, itemId: i.id, patch: { hours: e.target.value === '' ? null : Number(e.target.value) } })}/></label>
              {canPlan && sprint.state !== 'completed' && <button className="text-link" onClick={() => requestAllocate(i, null)}>Remove</button>}
            </div>)}
            {!inSprint.length && <div className="empty">No items allocated yet.</div>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><strong>Available backlog</strong><span>{candidate.length} items</span></div>
          <div className="planning-items">
            {candidate.map(i => <div key={i.id} className="planning-item">
              <button className="planning-item-name" onClick={() => onItem(i.id)}><span className="item-key">{i.key}</span><strong>{i.title}</strong></button>
              <span>{i.points ?? '—'} pts</span>
              {canPlan && sprint.state !== 'completed' && <button className="button tertiary" onClick={() => requestAllocate(i, sprint.id)}>Add <ArrowRight size={14}/></button>}
            </div>)}
            {!candidate.length && <div className="empty">All ready items are allocated.</div>}
          </div>
        </section>
      </div>

      <div className="planning-footer">
        <span><CalendarDays size={16}/> Dates use {project.timezone}</span>
        {canPlan && sprint.state === 'planned' && <button className="button primary" disabled={startIssues.length > 0} aria-describedby="start-checks-heading" title={startIssues.length ? startIssues.join(' ') : undefined} onClick={() => dispatch({ type: 'start', projectId: project.id, sprintId: sprint.id })}>Start sprint <ArrowRight size={17}/></button>}
        {canPlan && sprint.state === 'active' && <button className="button primary" onClick={openComplete}>Complete sprint <ArrowRight size={17}/></button>}
      </div>
      {sprint.state === 'planned' && activeSprint && <div className="inline-note"><AlertCircle size={16}/> Complete {activeSprint.name} before starting another.</div>}
    </> : <div className="empty panel">No sprint exists. Create one to begin planning.</div>}

    <Modal open={newOpen} onOpenChange={setNewOpen} title="New sprint" description={mode === 'live' ? 'Creates a planned sprint in the team database.' : 'Creates a planned sprint in local demo data.'}>
      <form className="form-stack" onSubmit={submitNewSprint}>
        <label>Sprint name<input required value={newName} onChange={e => { setNewName(e.target.value); setNewError(''); }} placeholder={`Sprint ${String(project.sprints.length + 1).padStart(2, '0')}`}/></label>
        <label>Sprint goal<input value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="What should this sprint achieve?"/></label>
        <div className="form-grid">
          <label>Start date<input type="date" required value={newStart} onChange={e => { setNewStart(e.target.value); setNewError(''); }}/></label>
          <label>End date<input type="date" required value={newEnd} aria-invalid={newDateError || undefined} aria-describedby={newDateError ? 'new-sprint-date-error' : undefined} onChange={e => { setNewEnd(e.target.value); setNewError(''); }}/></label>
        </div>
        {newDateError && <p id="new-sprint-date-error" role="alert" className="form-error">End date must be after the start date.</p>}
        <div className="form-grid">
          <label>Story-point capacity<input type="number" min="0" value={newPointCapacity} onChange={e => setNewPointCapacity(Number(e.target.value))}/></label>
          <label>Available hours<input type="number" min="0" value={newHourCapacity} onChange={e => setNewHourCapacity(Number(e.target.value))}/></label>
        </div>
        {newError && <p role="alert" className="form-error">{newError}</p>}
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setNewOpen(false)}>Cancel</button><button className="button primary" type="submit">Create sprint</button></div>
      </form>
    </Modal>

    <Modal open={reasonRequest !== null} onOpenChange={v => { if (!v) { setReasonRequest(null); setReasonError(''); } }} title="Why is the active sprint changing?" description={reasonRequest ? `${reasonRequest.item.key} will move to ${reasonRequest.targetName}. Scope changes on the active sprint need a recorded reason.` : undefined}>
      <form className="form-stack" onSubmit={submitReason}>
        <label htmlFor="scope-reason">Reason (required, at least 5 characters)<textarea id="scope-reason" rows={3} value={reason} onChange={e => { setReason(e.target.value); setReasonError(''); }} aria-invalid={reasonError ? true : undefined} aria-describedby={reasonError ? 'scope-reason-error' : undefined} autoFocus/></label>
        {reasonError && <p id="scope-reason-error" role="alert" className="form-error">{reasonError}</p>}
        {reasonBlocked && <p className="form-error" role="alert">{reasonRequest?.item.key} has no estimate. Add story points before moving it into the active sprint.</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={() => setReasonRequest(null)}>Cancel</button>
          <button type="submit" className="button primary" disabled={reasonBlocked}>Move item</button>
        </div>
      </form>
    </Modal>

    <Modal open={completeOpen} onOpenChange={setCompleteOpen} title={`Complete ${sprint?.name ?? 'sprint'}?`} description="Results freeze at completion. Choose where any unfinished work should go.">
      <div className="dialog-body">
        <p><strong>{unresolved.length}</strong> unresolved item{unresolved.length === 1 ? '' : 's'}{unresolved.length ? `: ${unresolved.map(i => i.key).join(', ')}` : ''}.</p>
        {unresolved.length > 0 && <label>Move unresolved items to
          <select value={carryTarget} onChange={e => setCarryTarget(e.target.value)}>
            <option value="">Backlog</option>
            {plannedSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>}
      </div>
      <div className="dialog-actions">
        <button className="button secondary" onClick={() => setCompleteOpen(false)}>Cancel</button>
        <button className="button primary" onClick={() => { if (sprint) dispatch({ type: 'complete', projectId: project.id, sprintId: sprint.id, targetSprintId: carryTarget || null }); setCompleteOpen(false); }}>Complete sprint</button>
      </div>
    </Modal>
  </>;
}
