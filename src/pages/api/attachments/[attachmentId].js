import { createClient } from '../../../lib/supabase/server';

// REL-02 download: RLS hides attachments of projects you are not in, and
// Storage only signs objects its SELECT policy lets you read. Links last 60 s.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'private, no-store');
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  const { data: att } = await supabase
    .from('work_item_attachments')
    .select('storage_path, file_name')
    .eq('id', req.query.attachmentId)
    .is('removed_at', null)
    .maybeSingle();
  if (!att) return res.status(404).json({ error: 'Attachment not found' });

  const { data, error } = await supabase.storage
    .from('project-attachments')
    .createSignedUrl(att.storage_path, 60, { download: att.file_name });
  if (error || !data?.signedUrl) return res.status(404).json({ error: 'Attachment not found' });
  res.setHeader('Location', data.signedUrl);
  return res.status(302).end();
}
