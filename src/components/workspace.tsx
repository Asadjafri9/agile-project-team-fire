'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Columns3, FileText, Flame, LayoutDashboard, LogOut, Menu, Plus, RotateCcw, Search, Settings2, Users, X } from 'lucide-react';
import { allowed, useDemo } from '@/features/demo/store';
import { Project, Role, WorkItem } from '@/features/demo/model';
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
export function initials(name: string) { return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase(); }
export function assignee(project: Project, item: WorkItem) { return project.members.find(m => m.id === item.assigneeId); }
export function statustone(status: string): 'neutral' | 'green' | 'amber' | 'red' | 'blue' { return status === 'Done' ? 'green' : status === 'Testing' ? 'amber' : status === 'In Progress' ? 'blue' : status === 'Code Review' ? 'blue' : 'neutral'; }

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return <div role="alert" className="callout" style={{ borderColor: '#ECCDD1', background: '#FBEFF0', color: '#A13B45', alignItems: 'center' }}><span style={{ flex: 1 }}>{message}</span><button className="icon-button" type="button" aria-label="Dismiss error" onClick={onClose}><X size={18}/></button></div>;
}

export function Projects() {
  const { state, dispatch, ready, mode, user, error, clearError } = useDemo(); const [newOpen, setNewOpen] = useState(false); const [name, setName] = useState(''); const router = useRouter();
  useEffect(() => { if (mode === 'live' && ready && !user) router.push('/'); }, [mode, ready, user, router]);
  if (!ready) return <div className="loading">Loading…</div>;
  if (mode === 'live' && !user) return <div className="loading">Loading…</div>;
  const canCreate = mode === 'live' ? Boolean(user) : allowed(state.role, 'team');
  return <main className="projects-page"><div className="projects-top"><Link href="/" className="brand"><span className="brand-mark"><Flame size={18}/></span><span>Team Fire</span></Link><span className="sample-label">{mode === 'live' ? 'LIVE' : 'SAMPLE-DATA PROTOTYPE'}</span></div><div className="projects-content">{error && <ErrorBanner message={error} onClose={clearError}/>}<div className="page-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Projects</h1><p>Choose a project to explore the end-to-end workflow.</p></div>{canCreate && <button className="button secondary" onClick={() => setNewOpen(true)}><Plus size={17}/> {mode === 'live' ? 'New project' : 'New sample project'}</button>}</div><div className="project-grid">{state.projects.map(p => <Link key={p.id} href={`/projects/${p.id}/overview`} className="project-tile"><div className="project-tile-top"><span className="project-monogram">{p.code.slice(0, 2)}</span><ArrowRight size={18}/></div><h2>{p.name}</h2><p>{p.description}</p><div className="project-tile-bottom"><span>{p.items.length} work items</span><span>{p.members.length} members</span></div></Link>)}</div><div className="prototype-note"><CircleHelp size={18}/><div><strong>About this workspace</strong><p>{mode === 'live' ? 'Projects and activity are stored in the team database. Changes are shared with your team.' : 'All projects and activity here are synthetic. Changes save only in your browser. Reset restores the original sample.'}</p></div></div></div>
  <Modal open={newOpen} onOpenChange={setNewOpen} title={mode === 'live' ? 'New project' : 'New sample project'} description={mode === 'live' ? 'Creates a project in the team database.' : 'Creates a local project with no backend connection.'}><form onSubmit={e => { e.preventDefault(); if (!name.trim()) return; dispatch({ type: 'create-project', name }); setNewOpen(false); setName(''); }} className="form-stack"><label>Project name<input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Design system refresh"/></label><button className="button primary" type="submit">{mode === 'live' ? 'Create project' : 'Create sample project'}</button></form></Modal></main>;
}

export function Workspace({ projectId, section }: { projectId: string; section: string }) {
  const { state, dispatch, ready, mode, user, roles, error, clearError, logout } = useDemo(); const router = useRouter(); const p = state.projects.find(p => p.id === projectId); const [sidebarOpen, setSidebarOpen] = useState(false); const [resetOpen, setResetOpen] = useState(false); const [previewOpen, setPreviewOpen] = useState<'invite' | 'settings' | null>(null); const [selected, setSelected] = useState<string | null>(null);
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
  const content = section === 'backlog' ? <Backlog project={p} role={state.role} onItem={setSelected}/> : section === 'planning' ? <Planning project={p} role={state.role} onItem={setSelected}/> : section === 'board' ? <Board project={p} role={state.role} onItem={setSelected}/> : section === 'analytics' ? <Analytics project={p}/> : section === 'team' ? <Team project={p} role={state.role} onInvite={() => setPreviewOpen('invite')}/> : section === 'evidence' ? <EvidenceView project={p}/> : <Overview project={p} onItem={setSelected}/>;
  return <div className="app-shell"><aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}><div className="sidebar-brand"><Link href="/projects" className="brand"><span className="brand-mark"><Flame size={18}/></span><span>Team Fire</span></Link><button className="icon-button mobile-only" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18}/></button></div><div className="sidebar-project"><span className="project-avatar">TF</span><div><strong>{p.name}</strong><small>Project workspace</small></div><ChevronDown size={16}/></div><nav className="side-nav" aria-label="Project navigation"><div className="nav-caption">WORKSPACE</div>{nav.map(({ id, label, Icon }) => <Link key={id} href={`/projects/${p.id}/${id}`} onClick={() => setSidebarOpen(false)} className={`nav-link ${section === id ? 'active' : ''}`} aria-current={section === id ? 'page' : undefined}><Icon size={18} strokeWidth={1.8}/>{label}{id === 'board' && active && <span className="nav-dot"/>}</Link>)}</nav><div className="sidebar-bottom"><button className="nav-link nav-button" onClick={() => setPreviewOpen('settings')}><Settings2 size={18}/> Settings <span className="preview-mini">PREVIEW</span></button>{mode === 'demo' && <button className="nav-link nav-button" onClick={() => setResetOpen(true)}><RotateCcw size={18}/> Reset demo</button>}{mode === 'demo' && <label className="mobile-role-select">View as <select value={state.role} aria-label="Demo role in navigation" onChange={e => dispatch({ type: 'role', role: e.target.value as Role })}><option>Product Owner</option><option>Scrum Master</option><option>Developer</option><option>Viewer</option></select></label>}{mode === 'live' && <button className="nav-link nav-button" onClick={() => { void signOut(); }}><LogOut size={18}/> Sign out</button>}<div className="sidebar-profile">{mode === 'live' ? <><span className="avatar">{user?.initials ?? '—'}</span><div><strong>{user?.name ?? 'Signed out'}</strong><small>{projectRole}</small></div></> : <><span className="avatar">{state.role === 'Product Owner' ? 'AK' : state.role === 'Scrum Master' ? 'HM' : state.role === 'Developer' ? 'ZA' : 'VW'}</span><div><strong>Demo role</strong><small>{state.role}</small></div></>}</div></div></aside>
  {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}/>}
  <div className="app-main"><div className="topbar"><button className="icon-button mobile-only" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19}/></button><div className="breadcrumbs"><Link href="/projects">Projects</Link><ChevronRight size={14}/><span>{p.name}</span><ChevronRight size={14}/><strong>{nav.find(n => n.id === section)?.label ?? 'Overview'}</strong></div><div className="topbar-right"><span className="sample-label">{mode === 'live' ? 'LIVE' : 'SAMPLE DATA'}</span>{mode === 'demo' && <label className="role-select">View as <select value={state.role} aria-label="Demo role" onChange={e => dispatch({ type: 'role', role: e.target.value as Role })}><option>Product Owner</option><option>Scrum Master</option><option>Developer</option><option>Viewer</option></select></label>}</div></div><main className="page-content">{error && <ErrorBanner message={error} onClose={clearError}/>}{content}</main></div>
  <ItemDetail project={p} item={item} role={state.role} onClose={() => setSelected(null)}/>
  <Modal open={resetOpen} onOpenChange={setResetOpen} title="Reset demo data?" description="This restores every sample project, sprint, and work item to its starting state."><div className="dialog-actions"><button className="button secondary" onClick={() => setResetOpen(false)}>Cancel</button><button className="button danger" onClick={() => { dispatch({ type: 'reset' }); setResetOpen(false); router.push('/projects'); }}>Reset demo</button></div></Modal>
  <Modal open={previewOpen !== null} onOpenChange={v => !v && setPreviewOpen(null)} title={previewOpen === 'invite' ? 'Invite a teammate' : 'Project settings'} description="Preview only · no message or backend request is sent."><div className="preview-box">{previewOpen === 'invite' ? <><p>In the connected application, project owners will invite existing accounts and assign a project role.</p><label>Teammate ID<input disabled placeholder="Member ID"/></label><label>Role<select disabled><option>Developer</option></select></label><button className="button secondary" disabled>Send invitation</button></> : <><p>Project defaults and WIP limits will live in the connected application.</p><label>Project timezone<input disabled value={p.timezone} readOnly/></label><label>In Progress WIP limit<input disabled value={p.wip['In Progress']} readOnly/></label><button className="button secondary" disabled>Save settings</button></>}</div></Modal>
  </div>;
}

function Team({ project, role, onInvite }: { project: Project; role: Role; onInvite: () => void }) {
  return <><div className="page-heading"><div><div className="eyebrow">PEOPLE</div><h1>Team</h1><p>The people contributing to this sample project.</p></div>{allowed(role, 'team') && <button className="button secondary" onClick={onInvite}><Plus size={17}/> Invite teammate <span className="preview-mini">PREVIEW</span></button>}</div><div className="panel"><div className="panel-head"><strong>Project members</strong><span>{project.members.length} people</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Member</th><th>Role</th><th>Focus</th><th>Assigned work</th></tr></thead><tbody>{project.members.map(m => <tr key={m.id}><td><div className="person-cell"><span className="avatar">{m.initials}</span><strong>{m.name}</strong></div></td><td>{m.role}</td><td>{m.title}</td><td>{project.items.filter(i => i.assigneeId === m.id && i.status !== 'Done').length} open</td></tr>)}</tbody></table></div></div><div className="inline-note"><CircleHelp size={16}/> Switching the demo role above changes which controls are available.</div></>;
}
function EvidenceView({ project }: { project: Project }) {
  return <><div className="page-heading"><div><div className="eyebrow">COURSE PORTFOLIO</div><h1>Evidence index</h1><p>A versioned sample catalogue showing how real course artefacts could be organized.</p></div><Pill tone="amber">Sample entries only</Pill></div><div className="callout"><FileText size={20}/><div><strong>Separate from actual course evidence</strong><p>These rows are synthetic index examples. Actual planning, standups, reviews, retrospectives, exports, and report files must be collected and versioned outside this prototype.</p></div></div><div className="panel"><div className="panel-head"><strong>Indexed artefacts</strong><span>{project.evidence.length} sample entries</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Artefact</th><th>Version</th><th>Format</th><th>Date</th><th>Traceability</th></tr></thead><tbody>{project.evidence.map(e => <tr key={e.id}><td><strong>{e.title}</strong></td><td>{e.version}</td><td>{e.kind}</td><td>{e.date}</td><td>{e.note}</td></tr>)}</tbody></table></div></div></>;
}
