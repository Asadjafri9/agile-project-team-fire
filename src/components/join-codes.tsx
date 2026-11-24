'use client';
import { useState } from 'react';
import { Copy, Link2, KeyRound } from 'lucide-react';
import type { Project, Role } from '@/features/demo/model';
import { useDemo } from '@/features/demo/store';
import { joinWithCode } from '@/features/demo/live';

const joinUrl = (code: string) => (typeof window === 'undefined' ? `/join/${code}` : `${window.location.origin}/join/${code}`);

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Team page: managers create, share and revoke project join codes / links. */
export function InviteLinks({ project }: { project: Project }) {
  const { dispatch, syncing } = useDemo();
  const [role, setRole] = useState<Role>('Developer');
  const [days, setDays] = useState(7);
  const [maxUses, setMaxUses] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const codes = (project.joinCodes ?? []).filter(c => c.active);
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const limit = maxUses.trim() ? Number(maxUses) : null;
    dispatch({ type: 'create-join-code', projectId: project.id, role, days, maxUses: limit && Number.isInteger(limit) && limit > 0 ? limit : null });
  };
  const doCopy = async (key: string, text: string) => { if (await copy(text)) { setCopied(key); setTimeout(() => setCopied(null), 1800); } };

  return <section className="panel">
    <div className="panel-head"><div><strong>Invite link or code</strong><span>Anyone signed in with the link or code joins with the role you choose. Links never grant Product Owner.</span></div></div>
    <form className="sub-form" onSubmit={create}>
      <div className="form-grid">
        <label>Role<select value={role} onChange={e => setRole(e.target.value as Role)} disabled={syncing}><option>Developer</option><option>QA Tester</option><option>Viewer</option><option>Scrum Master</option></select></label>
        <label>Expires after<select value={days} onChange={e => setDays(Number(e.target.value))} disabled={syncing}><option value={1}>1 day</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label>
        <label>Use limit (optional)<input type="number" min={1} max={500} inputMode="numeric" placeholder="Unlimited" value={maxUses} onChange={e => setMaxUses(e.target.value)} disabled={syncing}/></label>
      </div>
      <div className="form-actions"><button className="button primary" type="submit" disabled={syncing}><Link2 size={16}/> Create invite link</button></div>
    </form>
    {codes.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Code</th><th>Role</th><th>Uses</th><th>Expires</th><th>Share</th><th>Actions</th></tr></thead><tbody>
      {codes.map(c => <tr key={c.id}>
        <td><strong style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.06em' }}>{c.code}</strong></td>
        <td>{c.role}</td>
        <td>{c.uses}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
        <td>{new Date(c.expiresAt).toLocaleDateString()}</td>
        <td style={{ whiteSpace: 'nowrap' }}>
          <button type="button" className="button secondary small-button" onClick={() => doCopy(`l-${c.id}`, joinUrl(c.code))} aria-label={`Copy invite link for code ${c.code}`}><Copy size={14}/> {copied === `l-${c.id}` ? 'Copied!' : 'Link'}</button>{' '}
          <button type="button" className="button secondary small-button" onClick={() => doCopy(`c-${c.id}`, c.code)} aria-label={`Copy code ${c.code}`}><Copy size={14}/> {copied === `c-${c.id}` ? 'Copied!' : 'Code'}</button>
        </td>
        <td><button type="button" className="button danger small-button" disabled={syncing} onClick={() => dispatch({ type: 'revoke-join-code', projectId: project.id, codeId: c.id })} aria-label={`Revoke code ${c.code}`}>Revoke</button></td>
      </tr>)}
    </tbody></table></div> : <div className="empty"><p>No active invite links. Create one above and share the link or the code.</p></div>}
    <p aria-live="polite" className="sr-only">{copied ? 'Copied to clipboard' : ''}</p>
  </section>;
}

/** Projects page: paste a code (or a full link) to join a project. */
export function JoinWithCode() {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = code.trim(); if (!raw) return;
    const fromLink = raw.match(/\/join\/([^/?#\s]+)/);
    setPending(true); setError(null);
    try {
      const { data } = await joinWithCode(fromLink ? decodeURIComponent(fromLink[1]) : raw);
      window.location.assign(`/projects/${data.project_id}/overview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
      setPending(false);
    }
  };
  return <form className="panel join-code-form" onSubmit={submit} aria-labelledby="join-code-title" style={{ padding: 16, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
    <div style={{ flex: '1 1 260px' }}>
      <strong id="join-code-title" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><KeyRound size={16}/> Join a project</strong>
      <label htmlFor="join-code-input" style={{ display: 'block', marginTop: 6 }}>Paste an invite code or link<input id="join-code-input" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. 7KQ2-9XMA" autoComplete="off" spellCheck={false}/></label>
      {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
    <button className="button primary" type="submit" disabled={pending || !code.trim()}>{pending ? 'Joining…' : 'Join project'}</button>
  </form>;
}
