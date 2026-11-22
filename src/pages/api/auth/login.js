import { createClient } from '../../../lib/supabase/server';

// AUTH-01: sign in with email OR username + password; one generic error for every
// failure; credentials are never logged. The session travels only in cookies.
const INTERNAL = '@accounts.team-fire.invalid';

async function resolveEmail(supabase, identifier) {
  const id = identifier.trim().toLowerCase();
  if (id.includes('@')) return id;
  // Username: ask the database with the server-only key (never exposed to browsers).
  const key = process.env.LOGIN_RESOLVER_KEY;
  if (key) {
    const { data, error } = await supabase.rpc('rpc_resolve_login', { p_identifier: id, p_server_key: key });
    if (!error && typeof data === 'string' && data) return data;
  }
  return `${id}${INTERNAL}`; // legacy username accounts
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'private, no-store');

  const body = req.body ?? {};
  const identifier = typeof body.identifier === 'string' ? body.identifier : body.username;
  const { password } = body;
  if (typeof identifier !== 'string' || typeof password !== 'string' || !identifier.trim() || !password) {
    return res.status(400).json({ error: 'Email or username and password required' });
  }

  const supabase = createClient(req, res);
  const email = await resolveEmail(supabase, identifier);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return res.status(401).json({ error: 'Invalid credentials' });

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, display_name, disabled_at')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profile?.disabled_at) {
    await supabase.auth.signOut();
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.status(200).json({
    user: { id: data.user.id, username: profile?.username ?? '', name: profile?.display_name ?? '' },
  });
}
