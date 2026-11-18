import { createClient } from '../../../lib/supabase/server';

// Self-service account creation (ADR-014): email + username + display name + password.
// The email is the Supabase Auth identity; username and display name travel as metadata
// and the database trigger re-validates them, so direct Auth API calls cannot bypass the rules.
const USERNAME = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const RESERVED = new Set(['admin', 'administrator', 'root', 'support', 'system', 'operator', 'team-fire', 'teamfire']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'private, no-store');

  const { email: rawEmail, username, displayName, password } = req.body ?? {};
  const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const display = typeof displayName === 'string' ? displayName.trim() : '';
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return res.status(422).json({ error: 'Enter a valid email address', field: 'email' });
  }
  if (email.endsWith('@accounts.team-fire.invalid')) {
    return res.status(422).json({ error: 'Use your own email address', field: 'email' });
  }

  if (!USERNAME.test(name)) {
    return res.status(422).json({ error: 'Usernames are 2-32 characters: lowercase letters, digits, dot, dash or underscore, starting with a letter or digit.', field: 'username' });
  }
  if (RESERVED.has(name)) return res.status(422).json({ error: 'That username is reserved', field: 'username' });
  if (!display || display.length > 60) return res.status(422).json({ error: 'Enter a display name (up to 60 characters)', field: 'displayName' });
  if (typeof password !== 'string' || password.length < 10 || password.length > 72) {
    return res.status(422).json({ error: 'Passwords need 10 to 72 characters', field: 'password' });
  }
  if (password.toLowerCase().includes(name)) {
    return res.status(422).json({ error: 'Your password must not contain your username', field: 'password' });
  }

  const supabase = createClient(req, res);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username: name, display_name: display } },
  });

  if (error) {
    const msg = String(error.message || '');
    if (/already registered|already exists|email.*(taken|exists)/i.test(msg) || error.code === 'user_already_exists' || error.code === 'email_exists') {
      return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.', field: 'email' });
    }
    if (/invalid.*email|email.*invalid|validate email/i.test(msg)) return res.status(422).json({ error: 'Enter a valid email address', field: 'email' });
    if (/signups? not allowed|disabled/i.test(msg)) return res.status(403).json({ error: 'Sign-up is currently closed' });
    if (/password/i.test(msg)) return res.status(422).json({ error: msg, field: 'password' });
    if (error.status === 429) return res.status(429).json({ error: 'Too many sign-up attempts. Try again in a few minutes.' });
    // The database trigger raises for invalid identities; Auth reports it as a generic save error.
    return res.status(422).json({ error: 'That username is taken or not allowed', field: 'username' });
  }

  // Supabase answers an existing address with a user that has no identities.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.', field: 'email' });
  }
  if (!data.session) {
    return res.status(202).json({ message: 'Account created. Sign in to continue.' });
  }
  return res.status(201).json({ user: { id: data.user.id, username: name, name: display, email } });
}
