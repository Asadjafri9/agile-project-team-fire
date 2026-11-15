import { createClient } from '../../../lib/supabase/server';
import { httpError } from '../../../lib/workspace/server';

// REL-02 step 1: the database authorizes (role, type, size, project budget) and
// chooses the object path; Storage then issues a one-time signed upload URL,
// re-checking its own INSERT policy for this user.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'private, no-store');
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  const { target, projectId, itemId, name, size, mime } = req.body ?? {};
  try {
    const { data: path, error } = target === 'evidence'
      ? await supabase.rpc('rpc_authorize_evidence_upload', { p_project_id: projectId, p_name: String(name ?? ''), p_size: Number(size), p_mime: String(mime ?? '') })
      : await supabase.rpc('rpc_authorize_upload', { p_item_id: itemId, p_name: String(name ?? ''), p_size: Number(size), p_mime: String(mime ?? '') });
    if (error) throw error;
    const { data, error: signError } = await supabase.storage.from('project-attachments').createSignedUploadUrl(path);
    if (signError) return res.status(403).json({ error: 'Upload not permitted' });
    return res.status(200).json({ path, signedUrl: data.signedUrl });
  } catch (error) {
    const { status, body } = httpError(error);
    return res.status(status).json(body);
  }
}
