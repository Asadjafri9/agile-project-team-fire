import { createClient } from '../../../lib/supabase/server';

export default async function handler(req, res) {
  const supabase = createClient(req, res);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('projects')
      .select('*, project_members!inner(*)')
      .is('archived_at', null);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'POST') {
    const { name, key, description, timezone } = req.body;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Call single transactional creation RPC
    const { data, error } = await supabase.rpc('rpc_create_project', {
      p_name: name,
      p_key: key ?? null,
      p_description: description ?? null,
      p_timezone: timezone || 'Asia/Karachi',
    });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}