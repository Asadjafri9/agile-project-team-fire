import { createClient } from '../../../lib/supabase/server';

// AUTH-01: username + password; generic error; never log credentials.
// The session travels only in HttpOnly-capable cookies, never in the body.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const supabase = createClient(req, res);
  const email = `${username.trim().toLowerCase()}@accounts.team-fire.invalid`;
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
    user: { id: data.user.id, username: profile?.username ?? username.trim().toLowerCase(), name: profile?.display_name ?? '' },
  });
}
