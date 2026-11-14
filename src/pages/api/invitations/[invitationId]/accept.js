import { createClient } from '../../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { invitationId } = req.query;
  const supabase = createClient(req, res);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Atomic invitation acceptance RPC
  const { data, error } = await supabase.rpc('rpc_accept_invitation', {
    p_invitation_id: invitationId,
    p_user_id: user.id,
  });

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ data });
}