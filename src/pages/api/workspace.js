import { createClient } from '../../lib/supabase/server';
import { httpError, loadWorkspace } from '../../lib/workspace/server';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'private, no-store');

  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  try {
    return res.status(200).json(await loadWorkspace(supabase, user));
  } catch (error) {
    const { status, body } = httpError(error);
    return res.status(status).json(body);
  }
}
