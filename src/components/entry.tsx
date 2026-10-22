'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, ClipboardList, Columns3, Flame, LockKeyhole } from 'lucide-react';
import { useDemo } from '@/features/demo/store';
import { Button } from '@/components/ui/button';

export function Entry() {
  const { dispatch } = useDemo(); const router = useRouter();
  return <main className="entry-shell">
    <header className="entry-top"><span className="brand-mark"><Flame size={19} strokeWidth={1.9}/></span><span className="brand-name">Team Fire</span><span className="entry-top-note">Sample-data prototype</span></header>
    <div className="entry-content"><div className="entry-kicker">A clear place to move work forward</div><h1>From backlog to delivery,<br/>with the work in view.</h1><p>Plan a sprint, follow the board, and inspect the numbers behind every decision. Explore a realistic Scrum workspace using local sample data.</p>
      <Button className="entry-cta" onClick={() => { dispatch({ type: 'enter' }); router.push('/projects'); }}>Explore demo <ArrowRight size={18}/></Button>
      <div className="entry-assurance"><LockKeyhole size={15}/> No account or password needed. Changes stay in this browser.</div>
    </div>
    <div className="entry-journey" aria-label="Product journey"><div><ClipboardList size={19}/><span>01</span><strong>Shape the backlog</strong><small>Prioritize clear, estimated work.</small></div><div><Columns3 size={19}/><span>02</span><strong>Run the sprint</strong><small>Plan capacity and move work.</small></div><div><BarChart3 size={19}/><span>03</span><strong>Review delivery</strong><small>Trace trends to actual events.</small></div></div>
    <footer className="entry-footer">Team Fire · Course project prototype <Link href="/projects">View projects</Link></footer>
  </main>;
}
