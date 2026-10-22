import type { Metadata } from 'next';
import './globals.css';
import { DemoProvider } from '@/features/demo/store';

export const metadata: Metadata = { title: 'Team Fire — Sample-data prototype', description: 'Explore the Team Fire Scrum workflow with local sample data.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><DemoProvider>{children}</DemoProvider></body></html>;
}
