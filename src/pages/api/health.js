import { createClient } from '../../lib/supabase/server';

// Liveness: the app can reach Supabase and Postgres answers.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const supabase = createClient(req, res);
  const { data, error } = await supabase.rpc('health');

  if (error || data !== true) {
    return res.status(503).json({ status: 'unhealthy', dbError: error?.message || error?.code || 'no response' });
  }
  return res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
}
