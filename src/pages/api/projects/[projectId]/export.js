import { createClient } from '../../../../lib/supabase/server';

// RFC 4180 quoting plus formula-injection neutralisation for spreadsheet apps.
const cell = value => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

function convertToCSV(items) {
  const headers = ['Key', 'Title', 'Type', 'Priority', 'Status', 'Estimate'];
  const rows = items.map(item => [item.key, item.title, item.type, item.priority, item.status, item.estimate ?? ''].map(cell));
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export default async function handler(req, res) {
  const { projectId, format, sprintId } = req.query;
  const supabase = createClient(req, res);

  const { data: items, error } = await supabase
    .from('work_items')
    .select('*')
    .eq('project_id', projectId)
    .eq('sprint_id', sprintId)
    .is('archived_at', null);

  if (error) return res.status(400).json({ error: error.message });

  if (format === 'csv') {
    const csvContent = convertToCSV(items || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sprint_summary_${sprintId}.csv"`);
    return res.status(200).send(csvContent);
  }

  return res.status(400).json({ error: 'Unsupported format requested' });
}