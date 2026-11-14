import { createClient } from '../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(req, res);
  const { error } = await supabase.auth.signOut();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ message: 'Logged out successfully' });
}