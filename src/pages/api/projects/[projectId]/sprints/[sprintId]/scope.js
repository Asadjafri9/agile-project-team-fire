import { createClient } from '../../../../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sprintId } = req.query;
  const { itemId, action, reason } = req.body; // action: 'ADDED' | 'REMOVED'

  if (!['ADDED', 'REMOVED'].includes(action)) {
    return res.status(400).json({ error: 'Action must be ADDED or REMOVED' });
  }
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required for mid-sprint scope modifications' });
  }

  const supabase = createClient(req, res);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Get current estimate of work item
  const { data: item, error: itemError } = await supabase
    .from('work_items')
    .select('estimate, status')
    .eq('id', itemId)
    .single();

  if (itemError || !item) return res.status(404).json({ error: 'Work item not found' });

  if (action === 'REMOVED' && item.status === 'Done') {
    return res.status(422).json({ error: 'Completed items cannot be removed from an active sprint' });
  }

  // Record Scope Event
  const { data: scopeEvent, error: scopeError } = await supabase
    .from('sprint_scope_events')
    .insert({
      sprint_id: sprintId,
      work_item_id: itemId,
      action,
      reason,
      estimate_at_event: item.estimate || 0,
      actor_id: user.id,
    })
    .select()
    .single();

  if (scopeError) return res.status(400).json({ error: scopeError.message });

  // Update item sprint reference
  const newSprintId = action === 'ADDED' ? sprintId : null;
  const { error: updateError } = await supabase
    .from('work_items')
    .update({ sprint_id: newSprintId })
    .eq('id', itemId);

  if (updateError) return res.status(400).json({ error: updateError.message });

  return res.status(200).json({ data: scopeEvent });
}