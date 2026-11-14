import { createClient } from '../../../../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sprintId } = req.query;
  const { expectedVersion } = req.body;
  const supabase = createClient(req, res);

  const { data, error } = await supabase.rpc('rpc_start_sprint', {
    p_sprint_id: sprintId,
    p_expected_version: parseInt(expectedVersion, 10),
  });

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ data });
}