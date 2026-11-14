import { createClient } from '../../../../../../lib/supabase/server';

export default async function handler(req, res) {
  const { projectId, sprintId } = req.query;
  const supabase = createClient(req, res);

  // Fetch commitments
  const { data: commitments } = await supabase
    .from('sprint_commitments')
    .select('frozen_estimate, work_item_id')
    .eq('sprint_id', sprintId);

  // Fetch status history for items in sprint
  const { data: history } = await supabase
    .from('work_item_status_history')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  const totalCommittedPoints = (commitments || []).reduce((acc, curr) => acc + curr.frozen_estimate, 0);

  // Construct metric response matching metrics requirements (MET-01 - MET-05)
  return res.status(200).json({
    metrics: {
      totalCommittedPoints,
      historyLog: history || [],
    }
  });
}