'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, BarChart3, ClipboardList, Columns3, Flame, LockKeyhole } from 'lucide-react';
import { useDemo } from '@/features/demo/store';
import { Button } from '@/components/ui/button';

export function Entry() {
  const { dispatch, login, enterDemo, mode } = useDemo(); const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setAuthError(null);
    try {
      await login(username, password);
      router.push('/projects');
    } catch (error) {
      setAuthError(error instanceof Error && error.message ? error.message : 'Unable to sign in');
    } finally {
      setPending(false);
    }
  };

  return <main className="entry-shell">
    <header className="entry-top"><span className="brand-mark"><Flame size={19} strokeWidth={1.9}/></span><span className="brand-name">Team Fire</span><span className="entry-top-note">{mode === 'live' ? 'Live workspace' : 'Sample-data prototype'}</span></header>
    <div className="entry-content"><div className="entry-kicker">A clear place to move work forward</div><h1>From backlog to delivery,<br/>with the work in view.</h1><p>Plan a sprint, follow the board, and inspect the numbers behind every decision. Explore a realistic Scrum workspace using local sample data.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24, marginBottom: 6 }}>
        <form className="panel form-stack" onSubmit={signIn} style={{ width: 340, maxWidth: '100%', padding: 18, gap: 13 }} aria-labelledby="sign-in-title">
          <h2 id="sign-in-title" style={{ margin: 0, fontSize: 16 }}>Sign in</h2>
          <label htmlFor="sign-in-username">Username<input id="sign-in-username" name="username" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)}/></label>
          <label htmlFor="sign-in-password">Password<input id="sign-in-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/></label>
          {authError && <div role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>{authError}</div>}
          <button className="button primary" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <Button className="entry-cta" onClick={() => { enterDemo(); dispatch({ type: 'enter' }); router.push('/projects'); }}>Explore demo <ArrowRight size={18}/></Button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>No account needed.</span>
        </div>
      </div>
      <div className="entry-assurance"><LockKeyhole size={15}/> Demo changes stay in this browser; signed-in changes are saved to the team database.</div>
    </div>
    <div className="entry-journey" aria-label="Product journey"><div><ClipboardList size={19}/><span>01</span><strong>Shape the backlog</strong><small>Prioritize clear, estimated work.</small></div><div><Columns3 size={19}/><span>02</span><strong>Run the sprint</strong><small>Plan capacity and move work.</small></div><div><BarChart3 size={19}/><span>03</span><strong>Review delivery</strong><small>Trace trends to actual events.</small></div></div>
    <footer className="entry-footer">Team Fire · Course project prototype <Link href="/projects">View projects</Link></footer>
  </main>;
}
