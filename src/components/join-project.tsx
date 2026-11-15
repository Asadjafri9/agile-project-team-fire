'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flame } from 'lucide-react';
import { ApiError, joinWithCode, rememberJoinCode } from '@/features/demo/live';

/** Opens a project from a shared join link: joins when signed in, otherwise asks the visitor to sign in first. */
export function JoinProject({ code }: { code: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('Joining project…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    joinWithCode(code).then(({ data }) => {
      if (cancelled) return;
      try { localStorage.setItem('team-fire-mode', 'live'); } catch { /* storage unavailable */ }
      setMessage(data.already_member ? `You're already in ${data.project_name}. Opening it…` : `Joined ${data.project_name}. Opening it…`);
      window.location.assign(`/projects/${data.project_id}/overview`);
    }).catch(err => {
      if (cancelled) return;
      if (err instanceof ApiError && err.status === 401) {
        rememberJoinCode(code);
        router.replace('/?signup&join=1');
        return;
      }
      setFailed(true);
      setMessage(err instanceof Error ? err.message : 'Could not join the project');
    });
    return () => { cancelled = true; };
  }, [code, router]);

  return <main className="entry-shell"><header className="entry-top"><span className="brand-mark"><Flame size={19} strokeWidth={1.9}/></span><span className="brand-name">Team Fire</span></header>
    <div className="entry-content"><div className="panel" style={{ maxWidth: 460, padding: 24 }} role={failed ? 'alert' : 'status'}>
      <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>{failed ? 'This join link did not work' : 'Joining project'}</h1>
      <p style={{ margin: 0 }}>{message}</p>
      {failed && <p style={{ marginTop: 14 }}><a className="button secondary" href="/projects">Go to your projects</a></p>}
    </div></div></main>;
}
