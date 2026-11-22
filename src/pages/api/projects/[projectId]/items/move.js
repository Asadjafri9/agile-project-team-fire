import { createClient } from '../../../../../lib/supabase/server';
import { httpError } from '../../../../../lib/workspace/server';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { itemId, newStatus, expectedVersion, mutationId } = req.body ?? {};
  const supabase = createClient(req, res);
  const { data, error } = await supabase.rpc('rpc_move_work_item', {
    p_item_id: itemId,
    p_new_status: newStatus,
    p_expected_version: Number.isInteger(expectedVersion) ? expectedVersion : null,
    p_mutation_id: mutationId ?? null,
  });
  if (error) {
    const { status, body } = httpError(error);
    return res.status(status).json(body);
  }
  return res.status(200).json({ data });
}
