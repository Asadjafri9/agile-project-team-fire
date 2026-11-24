'use client';
import { type ChangeEvent, type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CircleHelp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { allowed, useDemo } from '@/features/demo/store';
import { ChecklistEntry, ItemType, Member, Priority, Project, Role, WorkItem } from '@/features/demo/model';
import { attachmentUrl, uploadAttachment } from '@/features/demo/live';
import { Modal, Pill } from './ui';
import { assignee, statustone } from './workspace';

const PRIORITIES: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];
const LIVE_NOTE = 'Sign in to comment, attach files and edit checklists';
const ESTIMATE_LOCKED_NOTE = 'Estimates are locked during the active sprint (SPR-05) — return the item to the backlog to re-estimate.';
const COMMENT_MAX = 4000;
const POINT_OPTIONS = [1, 2, 3, 5, 8, 13];

function memberName(project: Project, id: string): string {
  return project.members.find(m => m.id === id)?.name ?? (/^[0-9a-f-]{36}$/i.test(id) ? 'Former member' : id);
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function parseLabels(value: string): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split(',')) {
    const label = part.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length === 10) break;
  }
  return labels;
}

function MentionBody({ body, mentions, members }: { body: string; mentions: string[]; members: Member[] }) {
  const names = members.filter(m => mentions.includes(m.id)).map(m => m.name).filter(Boolean);
  if (!names.length) return <>{body}</>;
  const pattern = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const parts = body.split(new RegExp(`(@(?:${pattern}))`, 'g'));
  return <>{parts.map((part, index) => names.some(name => part === `@${name}`)
    ? <span key={index} className="mention">{part}</span>
    : <span key={index}>{part}</span>)}</>;
}

export function Backlog({ project, role, onItem }: { project: Project; role: Role; onItem: (id: string) => void }) {
  const { dispatch, mode } = useDemo(); const [query, setQuery] = useState(''); const [status, setStatus] = useState('All statuses'); const [priority, setPriority] = useState('All priorities'); const [assigneeId, setAssigneeId] = useState('All assignees'); const [filtersReady, setFiltersReady] = useState(false); const [newOpen, setNewOpen] = useState(false); const [title, setTitle] = useState(''); const [points, setPoints] = useState(''); const [typeName, setTypeName] = useState<ItemType>('Story'); const [newPriority, setNewPriority] = useState<Priority>('Medium');
  const canPrioritize = allowed(role, 'prioritize');
  useEffect(() => { const params = new URL(location.href).searchParams; setQuery(params.get('q') ?? ''); setStatus(params.get('status') ?? 'All statuses'); setPriority(params.get('priority') ?? 'All priorities'); setAssigneeId(params.get('assignee') ?? 'All assignees'); setFiltersReady(true); }, []);
  useEffect(() => { if (!filtersReady) return; const url = new URL(location.href); [['q', query], ['status', status === 'All statuses' ? '' : status], ['priority', priority === 'All priorities' ? '' : priority], ['assignee', assigneeId === 'All assignees' ? '' : assigneeId]].forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key)); history.replaceState(null, '', url.pathname + url.search); }, [query, status, priority, assigneeId, filtersReady]);
  const rows = useMemo(() => project.items.filter(i => (!query || `${i.key} ${i.title}`.toLowerCase().includes(query.toLowerCase())) && (status === 'All statuses' || i.status === status) && (priority === 'All priorities' || i.priority === priority) && (assigneeId === 'All assignees' || i.assigneeId === assigneeId)).sort((a, b) => a.order - b.order), [project.items, query, status, priority, assigneeId]);
  return <><div className="page-heading"><div><div className="eyebrow">PRODUCT BACKLOG</div><h1>Backlog</h1><p>Keep work clear, ordered, and ready for a sprint.</p></div>{allowed(role, 'create') && <button className="button primary" onClick={() => setNewOpen(true)}><Plus size={17}/> New item</button>}</div><div className="filterbar"><label className="search-field"><Search size={17}/><input aria-label="Search by key or title" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search key or title"/></label><select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}><option>All statuses</option>{['To Do', 'In Progress', 'Code Review', 'Testing', 'Done'].map(s => <option key={s}>{s}</option>)}</select><select aria-label="Filter by priority" value={priority} onChange={e => setPriority(e.target.value)}><option>All priorities</option>{['Urgent', 'High', 'Medium', 'Low'].map(s => <option key={s}>{s}</option>)}</select><select aria-label="Filter by assignee" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}><option>All assignees</option>{project.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div><div className="panel"><div className="panel-head"><strong>Work items</strong><span>{rows.length} of {project.items.length} items</span></div><div className="table-scroll"><table className="data-table backlog-table"><thead><tr><th>Priority</th><th>Key</th><th>Title</th><th>Status</th><th>Assignee</th><th>Points</th><th>Sprint</th><th><span className="sr-only">Order</span></th></tr></thead><tbody>{rows.map(i => <tr key={i.id}><td><span className={`priority-indicator ${i.priority.toLowerCase()}`}>{i.priority}</span></td><td><button className="link-button item-key" onClick={() => onItem(i.id)}>{i.key}</button></td><td><button className="link-button item-title" onClick={() => onItem(i.id)}>{i.title}</button><div className="cell-sub">{i.type} · {i.epic}</div></td><td><Pill tone={statustone(i.status)}>{i.status}</Pill></td><td>{assignee(project, i)?.name ?? 'Unassigned'}</td><td>{i.points ?? '—'}</td><td>{project.sprints.find(s => s.id === i.sprintId)?.name ?? 'Backlog'}</td><td>{!i.sprintId && allowed(role, 'prioritize') && <div className="order-controls"><button className="icon-button" aria-label={`Move ${i.key} up`} onClick={() => dispatch({ type: 'prioritize', projectId: project.id, itemId: i.id, direction: -1 })}><ArrowUp size={16}/></button><button className="icon-button" aria-label={`Move ${i.key} down`} onClick={() => dispatch({ type: 'prioritize', projectId: project.id, itemId: i.id, direction: 1 })}><ArrowDown size={16}/></button></div>}</td></tr>)}</tbody></table>{!rows.length && <div className="empty">No work items match these filters.</div>}</div></div><div className="inline-note"><CircleHelp size={16}/> Reordering affects unallocated backlog items. Sprint allocation happens in Sprint planning.</div>
  <Modal open={newOpen} onOpenChange={setNewOpen} title="Create work item" description={mode === 'live' ? 'The item is saved to the team database.' : 'This item is saved in local demo data.'}><form className="form-stack" onSubmit={e => { e.preventDefault(); if (!title.trim()) return; dispatch({ type: 'create-item', projectId: project.id, title, typeName, priority: canPrioritize ? newPriority : 'Medium', points: points === '' ? null : Number(points) }); setNewOpen(false); setTitle(''); setPoints(''); }}><label>Title<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be delivered?"/></label><div className="form-grid"><label>Type<select value={typeName} onChange={e => setTypeName(e.target.value as ItemType)}><option>Story</option><option>Task</option><option>Bug</option></select></label>{canPrioritize && <label>Priority<select value={newPriority} onChange={e => setNewPriority(e.target.value as Priority)}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></label>}</div><label>Story points<select value={points} onChange={e => setPoints(e.target.value)}><option value="">Unestimated</option>{POINT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}</select></label><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setNewOpen(false)}>Cancel</button><button type="submit" className="button primary">Create item</button></div></form></Modal></>;
}

export function ItemDetail({ project, item, role, onClose, focusCommentId }: { project: Project; item: WorkItem | null; role: Role; onClose: () => void; focusCommentId?: string | null }) {
  // Opened from a mention notification: scroll the comment into view and highlight it briefly.
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => {
    if (!item || !focusCommentId) return;
    let tries = 0;
    const tick = window.setInterval(() => {
      const el = document.getElementById(`comment-${focusCommentId}`);
      if (el || ++tries > 20) {
        window.clearInterval(tick);
        if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setHighlight(focusCommentId); window.setTimeout(() => setHighlight(null), 4000); }
      }
    }, 100);
    return () => window.clearInterval(tick);
  }, [item, focusCommentId]);
  const { dispatch, mode, user, syncing, refresh } = useDemo();
  const isLive = mode === 'live';
  const isArchived = Boolean(project.archived);
  const [description, setDescription] = useState('');
  const [titleText, setTitleText] = useState('');
  const [epicText, setEpicText] = useState('');
  const [hoursText, setHoursText] = useState('');
  const [labelsText, setLabelsText] = useState('');
  const [newChecklist, setNewChecklist] = useState('');
  const [editingChecklist, setEditingChecklist] = useState<number | null>(null);
  const [checklistText, setChecklistText] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [commentMentions, setCommentMentions] = useState<string[]>([]);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentEditBody, setCommentEditBody] = useState('');
  const [commentEditMentions, setCommentEditMentions] = useState<string[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setDescription(item?.description ?? ''), [item?.id, item?.description]);
  useEffect(() => setTitleText(item?.title ?? ''), [item?.id, item?.title]);
  useEffect(() => setEpicText(item?.epic ?? ''), [item?.id, item?.epic]);
  useEffect(() => setHoursText(item?.hours == null ? '' : String(item.hours)), [item?.id, item?.hours]);
  useEffect(() => setLabelsText((item?.labels ?? []).join(', ')), [item?.id, item?.labels]);
  useEffect(() => {
    setNewChecklist(''); setEditingChecklist(null); setChecklistText('');
    setCommentBody(''); setCommentMentions([]); setEditingComment(null); setCommentEditBody(''); setCommentEditMentions([]);
    setArchiveOpen(false); setArchiveReason(''); setUploading(false); setUploadError(null);
    if (fileInput.current) fileInput.current.value = '';
  }, [item?.id]);

  const comments = useMemo(() => [...(item?.comments ?? [])].sort((a, b) => a.at.localeCompare(b.at)), [item?.comments]);
  const attachments = item?.attachments ?? [];
  const activity = useMemo(() => (project.activity ?? []).filter(a => a.itemId === item?.id).sort((a, b) => a.at.localeCompare(b.at)), [project.activity, item?.id]);

  const checklist = item?.checklist ?? [];
  const doneCount = checklist.filter(c => c.done).length;
  const total = checklist.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const activeSprint = item ? project.sprints.find(s => s.id === item.sprintId) : undefined;
  const estimateLocked = activeSprint?.state === 'active';
  const blockedByActiveDone = Boolean(activeSprint?.state === 'active' && item?.status === 'Done');
  const canEdit = !isArchived && role !== 'Viewer';
  const canPrioritize = canEdit && allowed(role, 'prioritize');
  const canArchive = isLive && !isArchived && Boolean(item) && allowed(role, 'archive');
  const canAttach = isLive && canEdit && allowed(role, 'attach');
  const canComment = isLive && canEdit && allowed(role, 'comment');
  const canModerate = !isArchived && allowed(role, 'team');

  const applyChecklist = (next: ChecklistEntry[]) => {
    if (!item) return;
    dispatch({ type: 'set-checklist', projectId: project.id, itemId: item.id, checklist: next });
  };

  const addChecklistEntry = () => {
    if (!item) return;
    const text = newChecklist.trim();
    if (!text) return;
    applyChecklist([...item.checklist, { text, done: false }]);
    setNewChecklist('');
  };

  const saveChecklistEntry = (index: number) => {
    if (!item) return;
    const text = checklistText.trim();
    if (!text) return;
    applyChecklist(item.checklist.map((entry, i) => i === index ? { ...entry, text } : entry));
    setEditingChecklist(null);
    setChecklistText('');
  };

  const removeChecklistEntry = (index: number) => {
    if (!item) return;
    applyChecklist(item.checklist.filter((_, i) => i !== index));
    if (editingChecklist === index) { setEditingChecklist(null); setChecklistText(''); }
  };

  const moveChecklistEntry = (index: number, direction: -1 | 1) => {
    if (!item) return;
    const target = index + direction;
    if (target < 0 || target >= item.checklist.length) return;
    const next = item.checklist.map(entry => ({ ...entry }));
    [next[index], next[target]] = [next[target], next[index]];
    applyChecklist(next);
  };

  const saveLabels = () => {
    if (!item) return;
    const labels = parseLabels(labelsText);
    dispatch({ type: 'update-item', projectId: project.id, itemId: item.id, patch: { labels } });
    setLabelsText(labels.join(', '));
  };

  const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const commitTitle = () => {
    if (!item) return;
    const title = titleText.trim();
    if (!title) { setTitleText(item.title); return; }
    setTitleText(title);
    if (title !== item.title) dispatch({ type: 'update-item', projectId: project.id, itemId: item.id, patch: { title } });
  };

  const commitDescription = () => {
    if (!item || description === item.description) return;
    dispatch({ type: 'update-item', projectId: project.id, itemId: item.id, patch: { description } });
  };

  const commitEpic = () => {
    if (!item) return;
    const epic = epicText.trim() || 'Unassigned';
    setEpicText(epic);
    if (epic !== item.epic) dispatch({ type: 'update-item', projectId: project.id, itemId: item.id, patch: { epic } });
  };

  const commitHours = () => {
    if (!item) return;
    const raw = hoursText.trim();
    if (raw === '') {
      setHoursText('');
      if (item.hours !== null) dispatch({ type: 'update-item', projectId: project.id, itemId: item.id, patch: { hours: null } });
      return;
    }
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours < 0) { setHoursText(item.hours == null ? '' : String(item.hours)); return; }
    setHoursText(String(hours));
    if (hours !== item.hours) dispatch({ type: 'update-item', projectId: project.id, itemId: item.id, patch: { hours } });
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!item) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadAttachment(project.id, item.id, file);
      await refresh();
    } catch (error) {
      setUploadError(error instanceof Error && error.message ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const insertMention = (memberId: string) => {
    const member = project.members.find(m => m.id === memberId);
    if (!member) return;
    setCommentBody(previous => `${previous}${previous && !previous.endsWith(' ') ? ' ' : ''}@${member.name} `);
    setCommentMentions(previous => previous.includes(memberId) ? previous : [...previous, memberId]);
  };

  const postComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item) return;
    const body = commentBody.trim();
    if (!body) return;
    dispatch({ type: 'comment', projectId: project.id, itemId: item.id, body, mentions: commentMentions });
    setCommentBody('');
    setCommentMentions([]);
  };

  const startCommentEdit = (commentId: string, body: string, mentions: string[]) => {
    setEditingComment(commentId);
    setCommentEditBody(body);
    setCommentEditMentions(mentions);
  };

  const saveCommentEdit = () => {
    if (!item || !editingComment) return;
    const body = commentEditBody.trim();
    if (!body) return;
    dispatch({ type: 'edit-comment', projectId: project.id, itemId: item.id, commentId: editingComment, body, mentions: commentEditMentions });
    setEditingComment(null);
    setCommentEditBody('');
    setCommentEditMentions([]);
  };

  const deleteComment = (commentId: string) => {
    if (!item) return;
    dispatch({ type: 'delete-comment', projectId: project.id, itemId: item.id, commentId });
  };

  const archiveItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item) return;
    const reason = archiveReason.trim();
    if (!reason) return;
    dispatch({ type: 'archive-item', projectId: project.id, itemId: item.id, reason });
    setArchiveReason('');
    setArchiveOpen(false);
    onClose();
  };

  return <>
    <Modal open={!!item} onOpenChange={v => !v && onClose()} title={item ? `${item.key} · ${item.title}` : 'Work item'} description={item ? `${item.type} · ${item.epic} · WBS ${item.wbs}` : undefined}>
      {item && <div className="item-detail">
        <div className="detail-field-grid">
          {canEdit
            ? <label>Title<input value={titleText} maxLength={200} required disabled={syncing} onChange={e => setTitleText(e.target.value)} onBlur={commitTitle} onKeyDown={blurOnEnter}/></label>
            : <div className="detail-static"><span>Title</span><strong>{item.title}</strong></div>}
          {canEdit
            ? <label>Epic<input value={epicText} disabled={syncing} onChange={e => setEpicText(e.target.value)} onBlur={commitEpic} onKeyDown={blurOnEnter}/></label>
            : <div className="detail-static"><span>Epic</span><strong>{item.epic}</strong></div>}
        </div>

        <div className="detail-meta">
          <div><span>Status</span><Pill tone={statustone(item.status)}>{item.status}</Pill></div>
          <div><span>Priority</span>{canPrioritize
            ? <select aria-label="Priority" value={item.priority} disabled={syncing} onChange={e => dispatch({ type: 'update-item', projectId: project.id, itemId: item.id, patch: { priority: e.target.value as Priority } })}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select>
            : <strong>{item.priority}</strong>}</div>
          <div><span>Story points</span>{canEdit && !estimateLocked
            ? <select aria-label="Story points" value={item.points === null ? '' : String(item.points)} disabled={syncing} onChange={e => dispatch({ type: 'update-item', projectId: project.id, itemId: item.id, patch: { points: e.target.value === '' ? null : Number(e.target.value) } })}><option value="">Unestimated</option>{POINT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}</select>
            : <strong>{item.points ?? 'Unestimated'}</strong>}</div>
          <div><span>Assignee</span>{canEdit
            ? <select aria-label="Assignee" value={item.assigneeId ?? ''} disabled={syncing} onChange={e => dispatch({ type: 'update-item', projectId: project.id, itemId: item.id, patch: { assigneeId: e.target.value || null } })}><option value="">Unassigned</option>{project.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            : <strong>{assignee(project, item)?.name ?? 'Unassigned'}</strong>}</div>
          <div><span>Planned hours</span>{canEdit && !estimateLocked
            ? <input type="number" min="0" step="0.5" aria-label="Planned hours" value={hoursText} disabled={syncing} onChange={e => setHoursText(e.target.value)} onBlur={commitHours} onKeyDown={blurOnEnter}/>
            : <strong>{item.hours ?? '—'}</strong>}</div>
          <div><span>Sprint</span><strong>{project.sprints.find(s => s.id === item.sprintId)?.name ?? 'Backlog'}</strong></div>
        </div>

        {estimateLocked && <p className="inline-note" role="note">{ESTIMATE_LOCKED_NOTE}</p>}
        {isArchived && <p className="inline-note" role="status">Archived project — read-only</p>}
        {!isLive && <p className="inline-note">{LIVE_NOTE}</p>}

        {canEdit
          ? <label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} onBlur={commitDescription} rows={3}/></label>
          : <div className="detail-readonly"><span>Description</span><p className="detail-description">{item.description || 'No description'}</p></div>}

        <div className="detail-section">
          <div className="detail-section-head"><strong>Definition of Done checklist</strong><span aria-live="polite">{total ? `${doneCount}/${total} (${pct}%)` : 'No subtasks · 0%'}</span></div>
          {total ? <div className="checklist-list">{checklist.map((entry, index) => <div key={`${item.id}-${index}`} className="check-row">
            {canEdit
              ? <input type="checkbox" checked={entry.done} disabled={syncing} aria-label={`Mark ${entry.text} complete`} onChange={() => dispatch({ type: 'check', projectId: project.id, itemId: item.id, index })}/>
              : <span className={`check-state ${entry.done ? 'done' : ''}`}>{entry.done ? 'Done' : 'Not done'}</span>}
            {editingChecklist === index && isLive && canEdit
              ? <input className="checklist-edit-input" aria-label={`Edit subtask ${index + 1}`} value={checklistText} disabled={syncing} onChange={e => setChecklistText(e.target.value)}/>
              : <span className="check-text">{entry.text}</span>}
            {isLive && canEdit && <div className="row-actions">
              {editingChecklist === index
                ? <>
                  <button type="button" className="button tertiary" disabled={syncing || !checklistText.trim()} onClick={() => saveChecklistEntry(index)}>Save</button>
                  <button type="button" className="button secondary" disabled={syncing} onClick={() => { setEditingChecklist(null); setChecklistText(''); }}>Cancel</button>
                </>
                : <>
                  <button type="button" className="icon-button" aria-label={`Move subtask ${index + 1} up`} disabled={syncing || index === 0} onClick={() => moveChecklistEntry(index, -1)}><ArrowUp size={15}/></button>
                  <button type="button" className="icon-button" aria-label={`Move subtask ${index + 1} down`} disabled={syncing || index === total - 1} onClick={() => moveChecklistEntry(index, 1)}><ArrowDown size={15}/></button>
                  <button type="button" className="icon-button" aria-label={`Edit subtask ${index + 1}`} disabled={syncing} onClick={() => { setEditingChecklist(index); setChecklistText(entry.text); }}><Pencil size={14}/></button>
                  <button type="button" className="icon-button" aria-label={`Remove subtask ${index + 1}`} disabled={syncing} onClick={() => removeChecklistEntry(index)}><Trash2 size={14}/></button>
                </>}
            </div>}
          </div>)}</div> : <p className="muted">No subtasks</p>}
          {isLive && canEdit && <form className="checklist-add" onSubmit={e => { e.preventDefault(); addChecklistEntry(); }}>
            <label htmlFor={`new-subtask-${item.id}`}>New subtask<input id={`new-subtask-${item.id}`} value={newChecklist} disabled={syncing} onChange={e => setNewChecklist(e.target.value)} placeholder="Add a checkable subtask"/></label>
            <button type="submit" className="button secondary" disabled={syncing || !newChecklist.trim()}>Add subtask</button>
          </form>}
        </div>

        <div className="detail-section">
          <div className="detail-section-head"><strong>Labels</strong><span>{item.labels.length} of 10</span></div>
          {canEdit
            ? <div className="inline-edit-row">
              <label htmlFor={`labels-${item.id}`}>Labels (comma-separated, up to 10)<input id={`labels-${item.id}`} value={labelsText} disabled={syncing} onChange={e => setLabelsText(e.target.value)} placeholder="e.g. Platform, Accessibility"/></label>
              <button type="button" className="button secondary" disabled={syncing} onClick={saveLabels}>Save labels</button>
            </div>
            : <p className="detail-labels">{item.labels.length ? item.labels.join(', ') : 'No labels'}</p>}
        </div>

        <div className="detail-section">
          <div className="detail-section-head"><strong>Attachments</strong><span>{attachments.length}</span></div>
          {!isLive ? <p className="muted">{LIVE_NOTE}</p> : <>
            {attachments.length
              ? <ul className="attachment-list">{attachments.map(attachment => <li key={attachment.id} className="attachment-row">
                <a href={attachmentUrl(attachment.id)} target="_blank" rel="noopener noreferrer">{attachment.name}</a>
                <span className="attachment-meta">{formatSize(attachment.size)} · {memberName(project, attachment.uploadedBy)} · {formatDate(attachment.at)}</span>
                {!isArchived && (attachment.uploadedBy === user?.id || canModerate) && <button type="button" className="button tertiary" aria-label={`Remove attachment ${attachment.name}`} disabled={syncing} onClick={() => dispatch({ type: 'remove-attachment', projectId: project.id, itemId: item.id, attachmentId: attachment.id })}>Remove</button>}
              </li>)}</ul>
              : <p className="muted">No attachments</p>}
            {canAttach && <div className="attachment-upload">
              <label htmlFor={`attachment-${item.id}`}>Upload attachment (PDF, PNG, JPEG, TXT; max 10 MB)<input ref={fileInput} id={`attachment-${item.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" disabled={uploading || syncing} onChange={uploadFile}/></label>
              {uploading && <p className="muted" role="status">Uploading…</p>}
              {uploadError && <p className="inline-error" role="alert">{uploadError}</p>}
            </div>}
          </>}
        </div>

        <div className="detail-section">
          <div className="detail-section-head"><strong>Comments</strong><span>{comments.filter(c => !c.deleted).length}</span></div>
          {!isLive ? <p className="muted">{LIVE_NOTE}</p> : <>
            {comments.length
              ? <ul className="comment-list">{comments.map(comment => {
                if (comment.deleted) return <li key={comment.id} id={`comment-${comment.id}`} className="comment deleted"><p className="comment-deleted">Comment deleted</p></li>;
                const isAuthor = Boolean(user && comment.authorId === user.id);
                const canEditOwn = !isArchived && isAuthor;
                const canDeleteComment = !isArchived && (isAuthor || canModerate);
                return <li key={comment.id} id={`comment-${comment.id}`} className={`comment${highlight === comment.id ? ' comment-focus' : ''}`} aria-current={highlight === comment.id ? 'true' : undefined}>
                  {editingComment === comment.id
                    ? <div className="comment-edit">
                      <label htmlFor={`edit-comment-${comment.id}`}>Edit comment<textarea id={`edit-comment-${comment.id}`} value={commentEditBody} maxLength={COMMENT_MAX} rows={3} disabled={syncing} onChange={e => setCommentEditBody(e.target.value)}/></label>
                      <div className="comment-actions">
                        <button type="button" className="button primary" disabled={syncing || !commentEditBody.trim()} onClick={saveCommentEdit}>Save</button>
                        <button type="button" className="button secondary" disabled={syncing} onClick={() => { setEditingComment(null); setCommentEditBody(''); setCommentEditMentions([]); }}>Cancel</button>
                      </div>
                    </div>
                    : <>
                      <div className="comment-head"><strong>{memberName(project, comment.authorId)}</strong><span>{formatDate(comment.at)}</span>{comment.editedAt && <span>(edited {formatDate(comment.editedAt)})</span>}</div>
                      <p className="comment-body"><MentionBody body={comment.body} mentions={comment.mentions} members={project.members}/></p>
                      {(canEditOwn || canDeleteComment) && <div className="comment-actions">
                        {canEditOwn && <button type="button" className="button tertiary" disabled={syncing} onClick={() => startCommentEdit(comment.id, comment.body, comment.mentions)}>Edit</button>}
                        {canDeleteComment && <button type="button" className="button tertiary" disabled={syncing} onClick={() => deleteComment(comment.id)}>{isAuthor ? 'Delete' : 'Remove (moderate)'}</button>}
                      </div>}
                    </>}
                </li>;
              })}</ul>
              : <p className="muted">No comments yet</p>}
            {canComment && <form className="comment-composer" onSubmit={postComment}>
              <label htmlFor={`comment-${item.id}`}>Comment<textarea id={`comment-${item.id}`} value={commentBody} maxLength={COMMENT_MAX} rows={3} disabled={syncing} onChange={e => setCommentBody(e.target.value)} placeholder="Add a comment. Use Mention to notify a teammate."/></label>
              <div className="comment-controls">
                <label>Mention<select value="" disabled={syncing} onChange={e => insertMention(e.target.value)}><option value="">Choose a member…</option>{project.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                <span className="muted">{commentBody.length}/{COMMENT_MAX}</span>
                <button type="submit" className="button primary" disabled={syncing || !commentBody.trim()}>Post comment</button>
              </div>
              {commentMentions.length > 0 && <p className="muted">Mentions: {commentMentions.map(id => memberName(project, id)).join(', ')}</p>}
            </form>}
          </>}
        </div>

        <div className="detail-section">
          <div className="detail-section-head"><strong>Activity</strong><span>{activity.length}</span></div>
          {!isLive ? <p className="muted">{LIVE_NOTE}</p> : activity.length
            ? <ol className="activity-list">{activity.map(entry => <li key={entry.id} className="activity-row"><strong>{memberName(project, entry.actor)}</strong><span>{entry.detail}</span><span className="activity-meta">{formatDate(entry.at)}</span></li>)}</ol>
            : <p className="muted">No activity yet</p>}
        </div>

        {canArchive && <div className="detail-section archive-section">
          <div><strong>Archive item</strong><p className="muted">Archiving removes this item from active lists but keeps its comments and history for reports.</p></div>
          <button type="button" className="button danger" disabled={syncing} onClick={() => setArchiveOpen(true)}>Archive item</button>
        </div>}

        {!isLive && <div className="detail-footer">WBS reference {item.wbs} · Synthetic sample item</div>}
      </div>}
    </Modal>

    {item && <Modal open={archiveOpen} onOpenChange={setArchiveOpen} title={`Archive ${item.key}`} description="Archiving keeps the item's history but removes it from active lists.">
      <form className="form-stack" onSubmit={archiveItem}>
        <p className="muted">Archiving an item in the active sprint records a scope removal. Done items in an active sprint cannot be archived.</p>
        {blockedByActiveDone && <p className="inline-error" role="alert">This item is Done in the active sprint. Wait for the sprint to complete before archiving it.</p>}
        <label>Reason<textarea required value={archiveReason} maxLength={1000} rows={3} disabled={syncing} onChange={e => setArchiveReason(e.target.value)} placeholder="Why is this item being archived?"/></label>
        <div className="dialog-actions">
          <button type="button" className="button secondary" disabled={syncing} onClick={() => setArchiveOpen(false)}>Cancel</button>
          <button type="submit" className="button danger" disabled={syncing || !archiveReason.trim() || blockedByActiveDone}>Archive item</button>
        </div>
      </form>
    </Modal>}
  </>;
}
