import { createServerClient } from '@supabase/ssr';
import { supabaseKey, supabaseUrl } from './env';

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  parts.push(`SameSite=${options.sameSite ? String(options.sameSite).replace(/^./, c => c.toUpperCase()) : 'Lax'}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure ?? process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

/**
 * Supabase client for Pages Router API routes, bound to the request's
 * session cookies. Every cookie the client sets is appended, so chunked
 * session cookies are never overwritten by one another.
 */
export function createClient(req, res) {
  return createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return Object.entries(req.cookies ?? {}).map(([name, value]) => ({ name, value: value ?? '' }));
      },
      setAll(cookiesToSet) {
        const existing = res.getHeader('Set-Cookie');
        const current = existing === undefined ? [] : Array.isArray(existing) ? existing : [String(existing)];
        res.setHeader('Set-Cookie', [
          ...current,
          ...cookiesToSet.map(({ name, value, options }) => serializeCookie(name, value, options)),
        ]);
      },
    },
  });
}
