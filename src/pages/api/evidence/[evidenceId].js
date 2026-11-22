import { createClient } from '../../../lib/supabase/server';

// Evidence document download: RLS limits rows to project members and Storage
// only signs objects its SELECT policy allows. Links last 60 seconds.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'private, no-store');
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  const { data: ev } = await supabase
    .from('project_evidence')
    .select('storage_path, file_name')
    .eq('id', req.query.evidenceId)
    .is('removed_at', null)
    .maybeSingle();
  if (!ev?.storage_path) return res.status(404).json({ error: 'Document not found' });

  const { data, error } = await supabase.storage.from('project-attachments')
    .createSignedUrl(ev.storage_path, 60, { download: ev.file_name });
  if (error || !data?.signedUrl) return res.status(404).json({ error: 'Document not found' });
  res.setHeader('Location', data.signedUrl);
  return res.status(302).end();
}
