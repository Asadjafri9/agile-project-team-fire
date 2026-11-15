import { createClient } from '../../lib/supabase/server';
import { actionToRpc, httpError } from '../../lib/workspace/server';

// Single write endpoint for the workspace UI. Every action becomes one SQL RPC,
// which enforces membership, role and business rules (architecture.md §5).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'private, no-store');

  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  try {
    const { fn, args } = actionToRpc(req.body?.action);
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw error;
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    const { status, body } = httpError(error);
    return res.status(status).json(body);
  }
}
