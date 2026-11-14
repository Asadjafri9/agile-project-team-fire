import { createClient } from '../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const supabase = createClient(req, res);
  const normalizedUsername = username.trim().toLowerCase();
  const internalEmail = `${normalizedUsername}@accounts.team-fire.invalid`;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password,
  });

  if (error) return res.status(401).json({ error: 'Invalid credentials' });

  return res.status(200).json({ user: data.user, session: data.session });
}