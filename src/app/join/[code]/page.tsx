import { JoinProject } from '@/components/join-project';

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinProject code={decodeURIComponent(code)} />;
}
