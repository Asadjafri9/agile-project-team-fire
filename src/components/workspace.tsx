'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Activity, Archive, ArrowRight, BarChart3, Bell, ChevronsUpDown, ChevronRight, CircleHelp, ClipboardList, Columns3, FileText, Flame, LayoutDashboard, LogOut, Menu, Plus, RotateCcw, Settings2, Users, X } from 'lucide-react';
import { allowed, useDemo } from '@/features/demo/store';
import { Evidence, Member, Notification, Project, Role, Status, WorkItem } from '@/features/demo/model';
import { changePassword, EVIDENCE_ACCEPT, evidenceUrl, uploadEvidenceFile } from '@/features/demo/live';
import { Modal, Pill } from './ui';
import { Overview } from './workspace-overview';
import { Backlog, ItemDetail } from './workspace-backlog';
import { Planning } from './workspace-planning';
import { Board } from './workspace-board';
import { Analytics } from './workspace-analytics';

const nav = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'backlog', label: 'Backlog', Icon: ClipboardList },
  { id: 'planning', label: 'Sprint planning', Icon: Activity },
  { id: 'board', label: 'Board', Icon: Columns3 },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'team', label: 'Team', Icon: Users },
  { id: 'evidence', label: 'Evidence', Icon: FileText },
];
const ROLES: Role[] = ['Product Owner', 'Scrum Master', 'Developer', 'Viewer'];
const WIP_STATUSES: Status[] = ['To Do', 'In Progress', 'Code Review', 'Testing'];
const EVIDENCE_KINDS = ['Markdown', 'PDF', 'CSV', 'Image', 'Other'];
const NO_LIMIT = 99;
const TIMEZONES = ['Asia/Karachi', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
function defaultTimezone() {
  try { const zone = Intl.DateTimeFormat().resolvedOptions().timeZone; return TIMEZONES.includes(zone) ? zone : 'Asia/Karachi'; } catch { return 'Asia/Karachi'; }
}

export function initials(name: string) { return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase(); }
export function assignee(project: Project, item: WorkItem) { return project.members.find(m => m.id === item.assigneeId); }
export function statustone(status: string): 'neutral' | 'green' | 'amber' | 'red' | 'blue' { return status === 'Done' ? 'green' : status === 'Testing' ? 'amber' : status === 'In Progress' ? 'blue' : status === 'Code Review' ? 'blue' : 'neutral'; }

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return <div role="alert" className="callout" style={{ borderColor: '#ECCDD1', background: '#FBEFF0', color: '#A13B45', alignItems: 'center' }}><span style={{ flex: 1 }}>{message}</span><button className="icon-button" type="button" aria-label="Dismiss error" onClick={onClose}><X size={18}/></button></div>;
}

export function Projects() {
  const { state, dispatch, ready, mode, user, inbox, syncing, error, clearError } = useDemo(); const [newOpen, setNewOpen] = useState(false); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [timezone, setTimezone] = useState(defaultTimezone); const router = useRouter();
  useEffect(() => { if (mode === 'live' && ready && !user) router.push('/'); }, [mode, ready, user, router]);
  if (!ready) return <div className="loading">Loading…</div>;
  if (mode === 'live' && !user) return <div className="loading">Loading…</div>;
  const canCreate = mode === 'live' ? Boolean(user) : allowed(state.role, 'team');
  return <main className="projects-page"><div className="projects-top"><Link href="/" className="brand"><span className="brand-mark"><Flame size={18}/></span><span>Team Fire</span></Link><span className="sample-label">{mode === 'live' ? 'LIVE' : 'SAMPLE-DATA PROTOTYPE'}</span></div><div className="projects-content">{error && <ErrorBanner message={error} onClose={clearError}/>}<div className="page-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Projects</h1><p>Choose a project to explore the end-to-end workflow.</p></div>{canCreate && <button className="button secondary" onClick={() => setNewOpen(true)}><Plus size={17}/> {mode === 'live' ? 'New project' : 'New sample project'}</button>}</div>{mode === 'live' && inbox.length > 0 && <section className="panel inbox-panel" aria-labelledby="invitations-heading"><div className="panel-head"><div><strong id="invitations-heading">Invitations</strong><span>{inbox.length} pending invitation{inbox.length === 1 ? '' : 's'}</span></div></div><ul className="inbox-list">{inbox.map(i => <li key={i.id} className="inbox-item"><div><strong>{i.projectName}</strong><span>Role offered: {i.role}</span><span>Invited by {i.invitedBy}</span><span>Expires {formatDate(i.expiresAt)}</span></div><div className="inbox-actions"><button className="button primary small-button" type="button" disabled={syncing} onClick={() => dispatch({ type: 'respond-invite', invitationId: i.id, accept: true })}>Accept</button><button className="button secondary small-button" type="button" disabled={syncing} onClick={() => dispatch({ type: 'respond-invite', invitationId: i.id, accept: false })}>Decline</button></div></li>)}</ul></section>}{mode === 'live' && user && state.projects.length === 0 && <div className="callout" role="status" style={{ marginBottom: 16 }}><div><strong>Welcome, {user.name.split(' ')[0] || user.username}! You're not in a project yet.</strong><p style={{ margin: '4px 0 0' }}>Create a project and you'll be its Product Owner, or share your username <strong>{user.username}</strong> with a teammate so they can invite you from their Team page.</p></div><button className="button primary" type="button" onClick={() => setNewOpen(true)}>Create a project</button></div>}<div className="project-grid">{state.projects.map(p => <Link key={p.id} href={`/projects/${p.id}/overview`} className="project-tile"><div className="project-tile-top"><span className="project-monogram">{p.code.slice(0, 2)}</span><span className="project-tile-flags">{p.archived && <Pill>Archived</Pill>}<ArrowRight size={18}/></span></div><h2>{p.name}</h2><p>{p.description}</p><div className="project-tile-bottom"><span>{p.items.length} work items</span><span>{p.members.length} members</span></div></Link>)}</div><div className="prototype-note"><CircleHelp size={18}/><div><strong>About this workspace</strong><p>{mode === 'live' ? 'Projects and activity are stored in the team database. Changes are shared with your team.' : 'All projects and activity here are synthetic. Changes save only in your browser. Reset restores the original sample.'}</p></div></div></div>
  <Modal open={newOpen} onOpenChange={setNewOpen} title={mode === 'live' ? 'New project' : 'New sample project'} description={mode === 'live' ? 'Creates a project in the team database.' : 'Creates a local project with no backend connection.'}><form onSubmit={e => { e.preventDefault(); const trimmed = name.trim(); if (!trimmed) return; if (mode === 'live') dispatch({ type: 'create-project', name: trimmed, description: description.trim() || undefined, timezone }); else dispatch({ type: 'create-project', name: trimmed }); setNewOpen(false); setName(''); setDescription(''); }} className="form-stack"><label>Project name<input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Design system refresh"/></label>{mode === 'live' && <><label>Description<textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this project for?" disabled={syncing}/></label><label>Timezone<select value={timezone} onChange={e => setTimezone(e.target.value)} disabled={syncing}>{TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}</select></label></>}<button className="button primary" type="submit" disabled={syncing}>{mode === 'live' ? 'Create project' : 'Create sample project'}</button></form></Modal></main>;
}

function NotificationBell({ notifications, syncing, onRead }: { notifications: Notification[]; syncing: boolean; onRead: () => void }) {
  const [open, setOpen] = useState(false); const wrapRef = useRef<HTMLDivElement>(null); const unread = notifications.filter(n => !n.read).length;
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);
  return <div className="notif-wrap" ref={wrapRef}><button className="icon-button notif-button" type="button" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(v => !v)}><Bell size={19}/>{unread > 0 && <span className="notif-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}</button>{open && <div className="notif-popover" role="region" aria-label="Notifications"><div className="notif-head"><strong>Notifications</strong><button className="text-link" type="button" disabled={!unread || syncing} onClick={onRead}>Mark all read</button></div>{notifications.length === 0 ? <p className="notif-empty">No notifications yet.</p> : <ul className="notif-list">{notifications.map(n => <li key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}>{n.itemId && n.projectId ? <Link href={`/projects/${n.projectId}/board`} onClick={() => setOpen(false)}>{n.text}</Link> : <span>{n.text}</span>}<time dateTime={n.at}>{relativeTime(n.at)}</time></li>)}</ul>}</div>}</div>;
}

export function Workspace({ projectId, section }: { projectId: string; section: string }) {
  const { state, dispatch, ready, mode, user, roles, error, clearError, logout, syncing, notifications } = useDemo(); const router = useRouter(); const p = state.projects.find(p => p.id === projectId); const [sidebarOpen, setSidebarOpen] = useState(false); const [resetOpen, setResetOpen] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false); const [accountOpen, setAccountOpen] = useState(false); const [selected, setSelected] = useState<string | null>(null);
  const projectRole: Role = roles[projectId] ?? 'Viewer';
  useEffect(() => { if (mode === 'live' && ready && !user) router.push('/'); }, [mode, ready, user, router]);
  useEffect(() => {
    if (mode !== 'live' || !ready || !user) return;
    if (state.role !== projectRole) dispatch({ type: 'role', role: projectRole });
  }, [mode, ready, user, projectRole, state.role, dispatch]);
  const signOut = async () => { await logout(); router.push('/'); };
  if (!ready) return <div className="loading">Loading…</div>;
  if (mode === 'live' && !user) return <div className="loading">Loading…</div>;
  if (!p) return <main className="not-found"><h1>Project not found</h1><Link href="/projects" className="button secondary">Return to projects</Link></main>;
  const active = p.sprints.find(s => s.state === 'active'); const item = p.items.find(i => i.id === selected) ?? null;
  const content = section === 'backlog' ? <Backlog project={p} role={state.role} onItem={setSelected}/> : section === 'planning' ? <Planning project={p} role={state.role} onItem={setSelected}/> : section === 'board' ? <Board project={p} role={state.role} onItem={setSelected}/> : section === 'analytics' ? <Analytics key={p.id} project={p}/> : section === 'team' ? <Team project={p} role={state.role}/> : section === 'evidence' ? <EvidenceView project={p} role={state.role}/> : <Overview project={p} onItem={setSelected}/>;
  return <div className="app-shell"><aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}><div className="sidebar-brand"><Link href="/projects" className="brand"><span className="brand-mark"><Flame size={18}/></span><span>Team Fire</span></Link><button className="icon-button mobile-only" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18}/></button></div><Link href="/projects" className="sidebar-project" aria-label="Switch project"><span className="project-avatar">{p.code.slice(0, 2)}</span><div><strong>{p.name}</strong><small>Project workspace</small></div><ChevronsUpDown size={16}/></Link><nav className="side-nav" aria-label="Project navigation"><div className="nav-caption">WORKSPACE</div>{nav.map(({ id, label, Icon }) => <Link key={id} href={`/projects/${p.id}/${id}`} onClick={() => setSidebarOpen(false)} className={`nav-link ${section === id ? 'active' : ''}`} aria-current={section === id ? 'page' : undefined}><Icon size={18} strokeWidth={1.8}/>{label}{id === 'board' && active && <span className="nav-dot"/>}</Link>)}</nav><div className="sidebar-bottom"><button className="nav-link nav-button" onClick={() => setSettingsOpen(true)}><Settings2 size={18}/> Settings {mode === 'demo' && <span className="preview-mini">PREVIEW</span>}</button>{mode === 'demo' && <button className="nav-link nav-button" onClick={() => setResetOpen(true)}><RotateCcw size={18}/> Reset demo</button>}{mode === 'demo' && <label className="mobile-role-select">View as <select value={state.role} aria-label="Demo role in navigation" onChange={e => dispatch({ type: 'role', role: e.target.value as Role })}><option>Product Owner</option><option>Scrum Master</option><option>Developer</option><option>Viewer</option></select></label>}{mode === 'live' && <button className="nav-link nav-button" onClick={() => { void signOut(); }}><LogOut size={18}/> Sign out</button>}{mode === 'live' ? <button className="sidebar-profile profile-button" type="button" onClick={() => setAccountOpen(true)} aria-label={`Open account settings for ${user?.name ?? 'signed in user'}`}><span className="avatar">{user?.initials ?? '—'}</span><div><strong>{user?.name ?? 'Signed out'}</strong><small>{projectRole}</small></div></button> : <div className="sidebar-profile"><span className="avatar">{state.role === 'Product Owner' ? 'AK' : state.role === 'Scrum Master' ? 'HM' : state.role === 'Developer' ? 'ZA' : 'VW'}</span><div><strong>Demo role</strong><small>{state.role}</small></div></div>}</div></aside>
  {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}/>}
  <div className="app-main"><div className="topbar"><button className="icon-button mobile-only" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19}/></button><div className="breadcrumbs"><Link href="/projects">Projects</Link><ChevronRight size={14}/><span>{p.name}</span><ChevronRight size={14}/><strong>{nav.find(n => n.id === section)?.label ?? 'Overview'}</strong></div><div className={`topbar-right ${mode === 'live' ? 'live-topbar' : ''}`}><span className="sample-label">{mode === 'live' ? 'LIVE' : 'SAMPLE DATA'}</span>{mode === 'live' && <NotificationBell notifications={notifications} syncing={syncing} onRead={() => dispatch({ type: 'read-notifications' })}/>}{mode === 'demo' && <label className="role-select">View as <select value={state.role} aria-label="Demo role" onChange={e => dispatch({ type: 'role', role: e.target.value as Role })}><option>Product Owner</option><option>Scrum Master</option><option>Developer</option><option>Viewer</option></select></label>}</div></div><main className="page-content">{error && <ErrorBanner message={error} onClose={clearError}/>}{p.archived && <div role="status" className="callout archive-banner"><Archive size={20}/><div><strong>This project is archived and read-only</strong><p>Work items, planning, and team settings cannot change. The project stays available for reading and export.</p></div></div>}{content}</main></div>
  <ItemDetail project={p} item={item} role={state.role} onClose={() => setSelected(null)}/>
  <Modal open={resetOpen} onOpenChange={setResetOpen} title="Reset demo data?" description="This restores every sample project, sprint, and work item to its starting state."><div className="dialog-actions"><button className="button secondary" onClick={() => setResetOpen(false)}>Cancel</button><button className="button danger" onClick={() => { dispatch({ type: 'reset' }); setResetOpen(false); router.push('/projects'); }}>Reset demo</button></div></Modal>
  <Modal open={settingsOpen} onOpenChange={setSettingsOpen} title="Project settings" description={mode === 'live' ? 'Configure WIP limits and project lifecycle.' : 'Preview only · sign in to edit project settings.'}>{mode === 'live' ? <ProjectSettings project={p} role={projectRole} onClose={() => setSettingsOpen(false)}/> : <div className="preview-box"><p>Project defaults and WIP limits are editable in the connected application.</p><label>Project timezone<input disabled value={p.timezone} readOnly/></label><label>In Progress WIP limit<input disabled value={p.wip['In Progress']} readOnly/></label><button className="button secondary" disabled>Save settings</button></div>}</Modal>
  <Modal open={accountOpen} onOpenChange={setAccountOpen} title="Account" description="Update the password for your signed-in account.">{user ? <AccountSettings user={user}/> : null}</Modal>
  </div>;
}

function Team({ project, role }: { project: Project; role: Role }) {
  const { dispatch, mode, user, syncing } = useDemo(); const router = useRouter();
  const [username, setUsername] = useState(''); const [inviteRole, setInviteRole] = useState<Role>('Developer');
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null); const [leaveOpen, setLeaveOpen] = useState(false);
  const [transferId, setTransferId] = useState(''); const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const live = mode === 'live'; const manager = live && allowed(role, 'team') && !project.archived;
  const isOwner = Boolean(live && user && project.ownerId && user.id === project.ownerId);
  const selfMember = live && user ? project.members.find(m => m.id === user.id) : undefined;
  const pending = (project.invitations ?? []).filter(i => i.status === 'pending');
  const otherMembers = project.members.filter(m => m.id !== project.ownerId && m.id !== user?.id);
  const memberName = (id: string) => project.members.find(m => m.id === id)?.name ?? id;
  return <><div className="page-heading"><div><div className="eyebrow">PEOPLE</div><h1>Team</h1><p>{live ? 'Members of this project and their Scrum roles. Roles take effect immediately.' : 'The people contributing to this sample project.'}</p></div></div><div className="team-stack"><section className="panel"><div className="panel-head"><div><strong>Project members</strong><span>{project.members.length} people</span></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Member</th><th>Title</th><th>Role</th><th>Assigned work</th>{manager && <th>Actions</th>}</tr></thead><tbody>{project.members.map(m => {
    const isMemberOwner = project.ownerId === m.id; const canEdit = manager && (!isMemberOwner || isOwner); const canRemove = manager && !isMemberOwner;
    return <tr key={m.id}><td><div className="person-cell"><span className="avatar">{m.initials}</span><div className="member-name"><strong>{m.name}</strong>{isMemberOwner && <Pill tone="green">Owner</Pill>}</div></div></td><td>{m.title}</td><td>{canEdit ? <select className="role-inline" aria-label={`Role for ${m.name}`} value={m.role} disabled={syncing} onChange={e => dispatch({ type: 'set-role', projectId: project.id, userId: m.id, role: e.target.value as Role })}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select> : <span>{m.role}</span>}</td><td>{project.items.filter(i => i.assigneeId === m.id && i.status !== 'Done').length} open</td>{manager && <td>{canRemove ? <button className="button danger small-button" type="button" disabled={syncing} aria-label={`Remove ${m.name}`} onClick={() => setRemoveTarget(m)}>Remove</button> : <span className="muted">—</span>}</td>}</tr>;
  })}</tbody></table></div></section>
  {manager && <section className="panel"><div className="panel-head"><div><strong>Invite member</strong><span>Invite an existing account by exact username.</span></div></div><form className="sub-form" onSubmit={e => { e.preventDefault(); const value = username.trim(); if (!value) return; dispatch({ type: 'invite', projectId: project.id, username: value, role: inviteRole }); setUsername(''); }}><div className="form-grid"><label>Username<input required value={username} onChange={e => setUsername(e.target.value)} placeholder="username" disabled={syncing}/></label><label>Role<select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)} disabled={syncing}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></label></div><div className="form-actions"><button className="button primary" type="submit" disabled={syncing || !username.trim()}>Send invitation</button></div></form></section>}
  {manager && <section className="panel"><div className="panel-head"><div><strong>Pending invitations</strong><span>{pending.length} awaiting response</span></div></div>{pending.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Username</th><th>Role</th><th>Invited by</th><th>Expires</th><th>Actions</th></tr></thead><tbody>{pending.map(i => <tr key={i.id}><td><strong>{i.username}</strong></td><td>{i.role}</td><td>{memberName(i.invitedBy)}</td><td>{formatDate(i.expiresAt)}</td><td><button className="button secondary small-button" type="button" disabled={syncing} aria-label={`Revoke invitation for ${i.username}`} onClick={() => dispatch({ type: 'revoke-invite', projectId: project.id, invitationId: i.id })}>Revoke</button></td></tr>)}</tbody></table></div> : <div className="empty">No pending invitations.</div>}</section>}
  {live && selfMember && !isOwner && <section className="panel"><div className="panel-head"><div><strong>Leave project</strong><span>You will lose access to this project's records.</span></div><button className="button danger" type="button" disabled={syncing} onClick={() => setLeaveOpen(true)}>Leave project</button></div></section>}
  {isOwner && !project.archived && <section className="panel"><div className="panel-head"><div><strong>Transfer ownership</strong><span>Only the owner can transfer ownership to another active member.</span></div></div>{otherMembers.length ? <div className="sub-form"><label>New owner<select value={transferId} onChange={e => setTransferId(e.target.value)} disabled={syncing}><option value="">Select a member…</option>{otherMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className="form-actions"><button className="button secondary" type="button" disabled={!transferId || syncing} onClick={() => setTransferTarget(otherMembers.find(m => m.id === transferId) ?? null)}>Transfer ownership</button></div></div> : <div className="empty">Add another member before transferring ownership.</div>}</section>}
  {!live && <div className="inline-note"><CircleHelp size={16}/> Sign in to manage the team.</div>}
  {live && !manager && !project.archived && <div className="inline-note"><CircleHelp size={16}/> Only Product Owners and Scrum Masters can manage team membership.</div>}
  </div>
  <Modal open={!!removeTarget} onOpenChange={v => !v && setRemoveTarget(null)} title="Remove member?" description={removeTarget ? `Remove ${removeTarget.name} from ${project.name}.` : undefined}><p className="modal-copy">Removing a member clears their current assignments. Historical activity remains attributed to them.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setRemoveTarget(null)}>Cancel</button><button className="button danger" onClick={() => { if (removeTarget) dispatch({ type: 'remove-member', projectId: project.id, userId: removeTarget.id }); setRemoveTarget(null); }}>Remove member</button></div></Modal>
  <Modal open={leaveOpen} onOpenChange={setLeaveOpen} title="Leave project?" description={project.name}><p className="modal-copy">You will lose access to this project and its records. You can only rejoin if a manager invites you again.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setLeaveOpen(false)}>Cancel</button><button className="button danger" onClick={() => { dispatch({ type: 'leave', projectId: project.id }); setLeaveOpen(false); router.push('/projects'); }}>Leave project</button></div></Modal>
  <Modal open={!!transferTarget} onOpenChange={v => !v && setTransferTarget(null)} title="Transfer ownership?" description={transferTarget ? `${transferTarget.name} becomes the project owner.` : undefined}><p className="modal-copy">Ownership moves immediately. You remain a project member, but only the new owner can transfer ownership or archive the project.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setTransferTarget(null)}>Cancel</button><button className="button danger" onClick={() => { if (transferTarget) dispatch({ type: 'transfer-owner', projectId: project.id, userId: transferTarget.id }); setTransferTarget(null); }}>Transfer ownership</button></div></Modal>
  </>;
}

function ProjectSettings({ project, role, onClose }: { project: Project; role: Role; onClose: () => void }) {
  const { dispatch, syncing, user } = useDemo();
  const [limits, setLimits] = useState<Record<string, string>>(() => Object.fromEntries(WIP_STATUSES.map(s => [s, project.wip[s] >= NO_LIMIT ? '' : String(project.wip[s])])));
  const [error, setError] = useState<string | null>(null); const [archiveOpen, setArchiveOpen] = useState(false);
  const canEdit = allowed(role, 'wip') && !project.archived;
  const isOwner = Boolean(user && project.ownerId && user.id === project.ownerId);
  function save() {
    const next: Partial<Record<Status, number | null>> = {};
    for (const status of WIP_STATUSES) {
      const raw = limits[status]?.trim() ?? '';
      if (!raw) { next[status] = null; continue; }
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1) { setError(`Enter a positive whole number for ${status}, or leave it empty for no limit.`); return; }
      next[status] = value;
    }
    setError(null); dispatch({ type: 'set-wip', projectId: project.id, limits: next }); onClose();
  }
  return <form className="form-stack settings-form" onSubmit={e => { e.preventDefault(); save(); }}>
    <section className="settings-section" aria-labelledby="wip-heading"><div><strong id="wip-heading">WIP limits</strong><p className="settings-note">Set a positive limit per column, or leave a field empty for no limit.</p></div>{canEdit ? <div className="form-grid">{WIP_STATUSES.map(status => <label key={status}>{status} limit<input type="number" min="1" step="1" inputMode="numeric" placeholder="No limit" value={limits[status] ?? ''} disabled={syncing} onChange={e => setLimits(prev => ({ ...prev, [status]: e.target.value }))}/></label>)}</div> : <div className="wip-readonly">{WIP_STATUSES.map(status => <div key={status}><span>{status}</span><strong>{project.wip[status] >= NO_LIMIT ? 'No limit' : project.wip[status]}</strong></div>)}</div>}{!canEdit && <p className="settings-note">{project.archived ? 'This project is archived; settings are read-only.' : 'Only Product Owners and Scrum Masters can change WIP limits.'}</p>}</section>
    {project.storage && <section className="settings-section"><div><strong>Storage usage</strong><p className="settings-note">{project.storage.used} MB of {project.storage.budget} MB used</p></div></section>}
    {isOwner && !project.archived && <section className="settings-section" aria-labelledby="danger-heading"><div><strong id="danger-heading">Danger zone</strong><p className="settings-note">Archiving makes this project read-only. It stays available for reading and export.</p></div>{archiveOpen ? <div className="danger-zone"><strong>Archive {project.name}?</strong><p>This project becomes read-only and stays exportable. This cannot be undone by project managers.</p><div className="form-actions"><button className="button secondary" type="button" onClick={() => setArchiveOpen(false)}>Cancel</button><button className="button danger" type="button" disabled={syncing} onClick={() => { dispatch({ type: 'archive-project', projectId: project.id }); onClose(); }}>Archive project</button></div></div> : <div className="form-actions"><button className="button danger" type="button" onClick={() => setArchiveOpen(true)}>Archive project</button></div>}</section>}
    {error && <p role="alert" className="form-status error">{error}</p>}
    <div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>Close</button>{canEdit && <button className="button primary" type="submit" disabled={syncing}>Save WIP limits</button>}</div>
  </form>;
}

function AccountSettings({ user }: { user: { username: string; name: string } }) {
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  async function submit() {
    if (next.length < 10) { setStatus({ kind: 'error', message: 'New password must be at least 10 characters.' }); return; }
    if (next !== confirmation) { setStatus({ kind: 'error', message: 'The new password and confirmation do not match.' }); return; }
    setBusy(true); setStatus(null);
    try {
      const result = await changePassword(current, next);
      setStatus({ kind: 'success', message: result.message || 'Password changed.' });
      setCurrent(''); setNext(''); setConfirmation('');
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error && err.message ? err.message : 'Could not change the password.' });
    } finally { setBusy(false); }
  }
  return <form className="form-stack" onSubmit={e => { e.preventDefault(); void submit(); }}><p className="settings-note">Signed in as <strong>{user.name}</strong> ({user.username}).</p><label>Current password<input type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} disabled={busy}/></label><label>New password<input type="password" autoComplete="new-password" required value={next} onChange={e => setNext(e.target.value)} disabled={busy}/></label><label>Confirm new password<input type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy}/></label>{status && <p role={status.kind === 'error' ? 'alert' : 'status'} className={`form-status ${status.kind}`}>{status.message}</p>}<button className="button primary" type="submit" disabled={busy || !current || !next || !confirmation}>{busy ? 'Updating…' : 'Change password'}</button></form>;
}

function EvidenceView({ project, role }: { project: Project; role: Role }) {
  const { dispatch, mode, syncing } = useDemo();
  const [title, setTitle] = useState(''); const [version, setVersion] = useState(''); const [kind, setKind] = useState('Markdown'); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [note, setNote] = useState('');
  const canRecord = mode === 'live' && allowed(role, 'evidence') && !project.archived;
  const canRemove = mode === 'live' && allowed(role, 'team') && !project.archived;
  const [file, setFile] = useState<File | null>(null); const [uploading, setUploading] = useState(false); const [fileError, setFileError] = useState<string | null>(null); const [fileKey, setFileKey] = useState(0);
  async function add() {
    const nextTitle = title.trim() || file?.name.replace(/\.[^.]+$/, '') || ''; const nextVersion = version.trim();
    if (!nextTitle || !nextVersion || !date) return;
    const evidence: Omit<Evidence, 'id' | 'file'> = { title: nextTitle, version: nextVersion, kind, date, note: note.trim() };
    setFileError(null);
    try {
      setUploading(true);
      const uploaded = file ? await uploadEvidenceFile(project.id, file) : undefined;
      dispatch({ type: 'add-evidence', projectId: project.id, evidence, ...(uploaded ? { file: uploaded } : {}) });
      setTitle(''); setVersion(''); setNote(''); setFile(null); setFileKey(k => k + 1);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }
  const fmtSize = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  return <><div className="page-heading"><div><div className="eyebrow">COURSE PORTFOLIO</div><h1>Evidence index</h1><p>{mode === 'live' ? 'Versioned delivery evidence recorded by the team.' : 'A versioned sample catalogue showing how real course artefacts could be organized.'}</p></div>{mode === 'live' ? <Pill tone="green">Versioned index</Pill> : <Pill tone="amber">Sample entries only</Pill>}</div>{mode === 'demo' && <div className="callout"><FileText size={20}/><div><strong>Separate from actual course evidence</strong><p>These rows are synthetic index examples. Actual planning, standups, reviews, retrospectives, exports, and report files must be collected and versioned outside this prototype.</p></div></div>}{canRecord && <section className="panel"><div className="panel-head"><div><strong>Add evidence</strong><span>Index a versioned delivery artefact.</span></div></div><form className="sub-form" onSubmit={e => { e.preventDefault(); add(); }}><div className="form-grid"><label>Title<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sprint 03 review notes" disabled={syncing}/></label><label>Version<input required value={version} onChange={e => setVersion(e.target.value)} placeholder="v1.0" disabled={syncing}/></label><label>Format<select value={kind} onChange={e => setKind(e.target.value)} disabled={syncing}>{EVIDENCE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select></label><label>Date<input type="date" required value={date} onChange={e => setDate(e.target.value)} disabled={syncing}/></label></div><label>Note<textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Traceability or scope note" disabled={syncing}/></label><label>Document (optional)<input key={fileKey} type="file" accept={EVIDENCE_ACCEPT} disabled={syncing || uploading} onChange={e => { setFile(e.target.files?.[0] ?? null); setFileError(null); }} aria-describedby="evidence-file-hint"/></label><small id="evidence-file-hint" style={{ color: 'var(--muted)' }}>PDF, Word, Excel, PowerPoint, PNG, JPEG, CSV, Markdown or text · up to 10 MB · visible to project members only{file ? ` · selected: ${file.name} (${fmtSize(file.size)})` : ''}</small>{fileError && <div role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>{fileError}</div>}<div className="form-actions"><button className="button primary" type="submit" disabled={syncing || uploading || !(title.trim() || file) || !version.trim() || !date}>{uploading ? 'Uploading…' : file ? 'Upload and add evidence' : 'Add evidence'}</button></div></form></section>}<div className="panel"><div className="panel-head"><div><strong>Indexed artefacts</strong><span>{project.evidence.length} {mode === 'live' ? 'entries' : 'sample entries'}</span></div>{mode === 'demo' && <Pill tone="amber">Sample entries only</Pill>}</div>{project.evidence.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Artefact</th><th>Version</th><th>Format</th><th>Date</th><th>Traceability</th>{canRemove && <th>Actions</th>}</tr></thead><tbody>{project.evidence.map(e => <tr key={e.id}><td><strong>{e.title}</strong>{e.file && mode === 'live' && <div><a href={evidenceUrl(e.id)} target="_blank" rel="noopener noreferrer">{e.file.name}</a> <small style={{ color: 'var(--muted)' }}>({fmtSize(e.file.size)})</small></div>}</td><td>{e.version}</td><td>{e.kind}</td><td>{e.date}</td><td>{e.note}</td>{canRemove && <td><button className="button danger small-button" type="button" disabled={syncing} aria-label={`Remove ${e.title}`} onClick={() => dispatch({ type: 'remove-evidence', projectId: project.id, evidenceId: e.id })}>Remove</button></td>}</tr>)}</tbody></table></div> : <div className="empty"><h2>No evidence yet</h2><p>Record planning, review, and delivery artefacts to build the evidence index.</p></div>}</div></>;
}
