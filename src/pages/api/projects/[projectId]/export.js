import { createClient } from '../../../../lib/supabase/server';

function convertToCSV(items) {
  const headers = ['Key', 'Title', 'Type', 'Priority', 'Status', 'Estimate'];
  const rows = items.map(item => [
    `"${item.key}"`,
    `"${item.title.replace(/"/g, '""')}"`, // CSV formula & quote escaping
    `"${item.type}"`,
    `"${item.priority}"`,
    `"${item.status}"`,
    item.estimate || 0,
  ]);
  return [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
}

export default async function handler(req, res) {
  const { projectId, format, sprintId } = req.query;
  const supabase = createClient(req, res);

  const { data: items, error } = await supabase
    .from('work_items')
    .select('*')
    .eq('project_id', projectId)
    .eq('sprint_id', sprintId);

  if (error) return res.status(400).json({ error: error.message });

  if (format === 'csv') {
    const csvContent = convertToCSV(items || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sprint_summary_${sprintId}.csv"`);
    return res.status(200).send(csvContent);
  }

  return res.status(400).json({ error: 'Unsupported format requested' });
}