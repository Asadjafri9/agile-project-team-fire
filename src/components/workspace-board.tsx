'use client';
import { useState } from 'react';
import { AlertTriangle, CircleHelp, GripVertical, ListFilter } from 'lucide-react';
import { allowed, canMoveToDone, useDemo, wipWarning } from '@/features/demo/store';
import { Project, Role, STATUSES, Status, WorkItem } from '@/features/demo/model';
import { Modal, Pill } from './ui';
import { assignee } from './workspace';

export function Board({ project, role, onItem }: { project: Project; role: Role; onItem: (id: string) => void }) {
  const { dispatch } = useDemo();
  const active = project.sprints.find(s => s.state === 'active');
  const items = project.items.filter(i => i.sprintId === active?.id);
  const [pending, setPending] = useState<{ item: WorkItem; status: Status } | null>(null);
  const [blocked, setBlocked] = useState<WorkItem | null>(null);

  function requestMove(item: WorkItem, status: Status) {
    if (item.status === status || !allowed(role, 'move')) return;
    if (status === 'Done' && !canMoveToDone(item)) { setBlocked(item); return; }
    if (wipWarning(items, status, project.wip[status], item.id)) { setPending({ item, status }); return; }
    dispatch({ type: 'move', projectId: project.id, itemId: item.id, status });
  }

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">SPRINT BOARD</div><h1>Board</h1><p>Follow work from To Do through Done. Drag cards or use each card’s status control.</p></div>
      {active && <Pill tone="green">{active.name} · Active</Pill>}
    </div>
    {active ? <>
      <div className="board-summary">
        <span><strong>{active.goal}</strong></span>
        <span>{active.start} — {active.end} · {active.timezone ?? project.timezone}</span>
        <span>{items.filter(i => i.status === 'Done').length}/{items.length} done</span>
      </div>
      <div className="board-scroll"><div className="board-columns">
        {STATUSES.map(status => {
          const count = items.filter(i => i.status === status).length;
          const limit = project.wip[status];
          const limited = limit < 99;
          const over = limited && count > limit;
          return <section key={status} className="board-column" aria-label={`${status} column`} onDragOver={e => { if (allowed(role, 'move')) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); const item = items.find(i => i.id === id); if (item) requestMove(item, status); }}>
            <div className="board-column-head">
              <div>
                <span className={`status-marker ${status.toLowerCase().replaceAll(' ', '-')}`}/>
                <strong>{status}</strong>
                <span className="count-badge" aria-label={`${count} ${limited ? `of ${limit}` : ''} items`}>{count}{limited ? ` / ${limit}` : ''}</span>
              </div>
              {over && <small className="wip-over" role="status"><AlertTriangle size={12} aria-hidden="true"/> Over WIP limit</small>}
            </div>
            <div className="board-card-stack">
              {items.filter(i => i.status === status).map(i => <article key={i.id} className="board-card" draggable={allowed(role, 'move')} onDragStart={e => { e.dataTransfer.setData('text/plain', i.id); e.dataTransfer.effectAllowed = 'move'; }}>
                <div className="board-card-top">
                  <button className="link-button item-key" onClick={() => onItem(i.id)}>{i.key}</button>
                  {allowed(role, 'move') && <GripVertical size={16} aria-hidden="true"/>}
                </div>
                <button className="board-card-title" onClick={() => onItem(i.id)}>{i.title}</button>
                <div className="board-card-tags"><span>{i.type}</span><span>{i.priority}</span></div>
                <div className="board-card-bottom">
                  <span className="avatar small" title={assignee(project, i)?.name ?? 'Unassigned'}>{assignee(project, i)?.initials ?? '—'}</span>
                  <span>{i.points ?? '—'} pts</span>
                </div>
                {allowed(role, 'move') && <label className="board-status"><span className="sr-only">Move {i.key} to status</span><select aria-label={`Move ${i.key} to status`} value={i.status} onChange={e => requestMove(i, e.target.value as Status)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>}
              </article>)}
              {!count && <div className="board-empty">{allowed(role, 'move') ? 'Drop work here' : 'No items'}</div>}
            </div>
          </section>;
        })}
      </div></div>
      <div className="inline-note"><CircleHelp size={16}/> WIP limits warn but allow a move. Done requires every checklist item to be complete.</div>
    </> : <div className="empty panel"><ListFilter size={22}/><h2>No active sprint</h2><p>Allocate work and start a sprint in Sprint planning to populate the board.</p></div>}

    <Modal open={!!pending} onOpenChange={v => !v && setPending(null)} title="WIP limit exceeded" description={pending ? `${pending.status} would contain ${items.filter(i => i.status === pending.status && i.id !== pending.item.id).length + 1} items; the limit is ${project.wip[pending.status]}.` : undefined}>
      <div className="warning-body"><AlertTriangle size={20}/><p>The limit is advisory. Review the bottleneck, then move the card if this is intentional.</p></div>
      <div className="dialog-actions">
        <button className="button secondary" onClick={() => setPending(null)}>Keep current status</button>
        <button className="button primary" onClick={() => { if (pending) dispatch({ type: 'move', projectId: project.id, itemId: pending.item.id, status: pending.status }); setPending(null); }}>Move anyway</button>
      </div>
    </Modal>
    <Modal open={!!blocked} onOpenChange={v => !v && setBlocked(null)} title="Checklist incomplete" description={blocked ? `${blocked.key} cannot move to Done yet.` : undefined}>
      <p className="modal-copy">Complete every item in the Definition of Done checklist before closing this work item.</p>
      <div className="dialog-actions">
        <button className="button secondary" onClick={() => { if (blocked) onItem(blocked.id); setBlocked(null); }}>Open item details</button>
        <button className="button primary" onClick={() => setBlocked(null)}>Got it</button>
      </div>
    </Modal>
  </>;
}
