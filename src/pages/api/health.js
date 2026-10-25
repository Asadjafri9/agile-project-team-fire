import { createClient } from '../../lib/supabase/server';

export default async function handler(req, res) {
  const supabase = createClient(req, res);
  const { error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });

  if (error) {
    return res.status(503).json({ status: 'unhealthy', dbError: error.message });
  }

  return res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
}