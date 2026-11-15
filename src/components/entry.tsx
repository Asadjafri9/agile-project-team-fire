'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, ClipboardList, Columns3, Flame, LockKeyhole } from 'lucide-react';
import { useDemo } from '@/features/demo/store';
import { Button } from '@/components/ui/button';

export function Entry() {
  const { dispatch, login, signup, enterDemo, mode } = useDemo(); const router = useRouter();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // `/?signup` opens the create-account tab directly (shareable link).
  useEffect(() => { try { if (new URLSearchParams(window.location.search).has('signup')) setTab('signup'); } catch { /* ignore */ } }, []);
  const switchTab = (next: 'signin' | 'signup') => { setTab(next); setAuthError(null); setPassword(''); setConfirm(''); };

  const normalized = username.trim().toLowerCase();
  const usernameOk = /^[a-z0-9][a-z0-9._-]{1,31}$/.test(normalized);
  const passwordOk = password.length >= 10 && password.length <= 72 && !(normalized && password.toLowerCase().includes(normalized));
  const confirmOk = confirm.length > 0 && confirm === password;
  const canSignUp = usernameOk && displayName.trim().length > 0 && passwordOk && confirmOk;

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

  const createAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !canSignUp) return;
    setPending(true);
    setAuthError(null);
    try {
      await signup(normalized, displayName.trim(), password);
      router.push('/projects');
    } catch (error) {
      setAuthError(error instanceof Error && error.message ? error.message : 'Unable to create the account');
    } finally {
      setPending(false);
    }
  };

  const hint = (ok: boolean, text: string) => <small className={`auth-hint ${ok ? 'ok' : ''}`}>{ok ? '✓ ' : '• '}{text}</small>;

  return <main className="entry-shell">
    <header className="entry-top"><span className="brand-mark"><Flame size={19} strokeWidth={1.9}/></span><span className="brand-name">Team Fire</span><span className="entry-top-note">Agile project workspace</span></header>
    <div className="entry-content"><div className="entry-kicker">A clear place to move work forward</div><h1>From backlog to delivery,<br/>with the work in view.</h1><p>Plan a sprint, follow the board, and inspect the numbers behind every decision. Create an account to work with your team, or explore a sample workspace first.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24, marginBottom: 6 }}>
        <div className="panel auth-card" style={{ width: 360, maxWidth: '100%' }}>
          <div className="auth-tabs" role="group" aria-label="Account">
            <button type="button" className={tab === 'signin' ? 'active' : ''} aria-pressed={tab === 'signin'} onClick={() => switchTab('signin')}>Sign in</button>
            <button type="button" className={tab === 'signup' ? 'active' : ''} aria-pressed={tab === 'signup'} onClick={() => switchTab('signup')}>Create account</button>
          </div>
          {tab === 'signin' ? <form className="form-stack" onSubmit={signIn} style={{ padding: 18, gap: 13 }} aria-labelledby="sign-in-title">
            <h2 id="sign-in-title" style={{ margin: 0, fontSize: 16 }}>Sign in</h2>
            <label htmlFor="sign-in-username">Username<input id="sign-in-username" name="username" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)}/></label>
            <label htmlFor="sign-in-password">Password<input id="sign-in-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/></label>
            {authError && <div role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>{authError}</div>}
            <button className="button primary" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
            <small style={{ color: 'var(--muted)' }}>New here? <button type="button" className="link-button" onClick={() => switchTab('signup')}>Create an account</button></small>
          </form> : <form className="form-stack" onSubmit={createAccount} style={{ padding: 18, gap: 11 }} aria-labelledby="sign-up-title" noValidate>
            <h2 id="sign-up-title" style={{ margin: 0, fontSize: 16 }}>Create your account</h2>
            <label htmlFor="sign-up-username">Username<input id="sign-up-username" name="username" autoComplete="username" required maxLength={32} value={username} onChange={e => setUsername(e.target.value)} aria-describedby="sign-up-username-hint"/></label>
            <span id="sign-up-username-hint">{hint(usernameOk, usernameOk ? `You'll sign in as ${normalized}` : '2–32 characters: letters, digits, dot, dash or underscore')}</span>
            <label htmlFor="sign-up-name">Display name<input id="sign-up-name" name="name" autoComplete="name" required maxLength={60} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Sana Iqbal"/></label>
            <label htmlFor="sign-up-password">Password<input id="sign-up-password" name="new-password" type="password" autoComplete="new-password" required minLength={10} maxLength={72} value={password} onChange={e => setPassword(e.target.value)} aria-describedby="sign-up-password-hint"/></label>
            <span id="sign-up-password-hint">{hint(passwordOk, 'At least 10 characters, not containing your username')}</span>
            <label htmlFor="sign-up-confirm">Confirm password<input id="sign-up-confirm" name="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)}/></label>
            {confirm.length > 0 && !confirmOk && <small className="auth-hint">• Passwords don't match</small>}
            {authError && <div role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>{authError}</div>}
            <button className="button primary" type="submit" disabled={pending || !canSignUp}>{pending ? 'Creating account…' : 'Create account'}</button>
            <small style={{ color: 'var(--muted)' }}>After signing up, create a project or ask a teammate to invite you by your username.</small>
          </form>}
        </div>
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
