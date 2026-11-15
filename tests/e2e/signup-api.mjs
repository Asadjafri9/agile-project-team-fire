// Self-service signup checks (ADR-014).
//   BASE_URL=… SUPABASE_URL=… SUPABASE_KEY=<publishable key> node tests/e2e/signup-api.mjs [--full]
// Creates accounts named e2e-<timestamp>[-x]; --full also creates a project as the new user
// (use locally — the account then owns a project and cannot be deleted by the cleanup query).
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const FULL = process.argv.includes('--full');
let failures = 0;
const check = (ok, label, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); };

function session() {
  const jar = new Map();
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(BASE + path, {
      method, redirect: 'manual',
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';'); const i = pair.indexOf('=');
      const name = pair.slice(0, i), value = pair.slice(i + 1);
      if (value === '' || /Max-Age=0/i.test(c)) jar.delete(name); else jar.set(name, value);
    }
    let json = null; try { json = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, json };
  };
}

const stamp = Date.now().toString(36);
const username = `e2e-${stamp}`;
const password = `Signup-${stamp}-Ok!`;
const anon = session();
const signup = (body) => anon('/api/auth/signup', { method: 'POST', body });

// Validation
check((await signup({ username: 'A', displayName: 'X', password })).status === 422, 'username too short refused (422)');
check((await signup({ username: 'bad name!', displayName: 'X', password })).status === 422, 'username with spaces/symbols refused (422)');
check((await signup({ username: 'admin', displayName: 'X', password })).status === 422, 'reserved username refused (422)');
check((await signup({ username, displayName: '', password })).status === 422, 'display name required (422)');
check((await signup({ username, displayName: 'E2E', password: 'short' })).status === 422, 'password under 10 characters refused (422)');
check((await signup({ username, displayName: 'E2E', password: `${username}-123456` })).status === 422, 'password containing the username refused (422)');
check((await signup({ username: 'ayesha', displayName: 'Impostor', password })).status === 409, 'existing username refused (409)');

// Happy path
const me = session();
const created = await me('/api/auth/signup', { method: 'POST', body: { username: `  ${username.toUpperCase()} `, displayName: 'E2E Signup', password } });
check(created.status === 201 && created.json?.user?.username === username, 'new account created with normalised username', `HTTP ${created.status}`);
check(!JSON.stringify(created.json ?? {}).includes('access_token'), 'no tokens in the signup response');
const ws = await me('/api/workspace');
check(ws.status === 200, 'new account is signed in immediately');
check(ws.json?.user?.name === 'E2E Signup', 'display name stored', ws.json?.user?.name);
check(Array.isArray(ws.json?.state?.projects) && ws.json.state.projects.length === 0, 'new account sees no projects (RLS isolation)');
check((await me('/api/actions', { method: 'POST', body: { action: { type: 'move', projectId: 'x', itemId: '00000000-0000-4000-8000-000000000000', status: 'Done' } } })).status === 404, 'new account cannot touch existing items');
check((await signup({ username, displayName: 'Again', password })).status === 409, 'same username cannot sign up twice (409)');

await me('/api/auth/logout', { method: 'POST' });
const again = session();
check((await again('/api/auth/login', { method: 'POST', body: { username, password } })).status === 200, 'new account can sign in again with its password');

if (FULL) {
  const proj = await again('/api/actions', { method: 'POST', body: { action: { type: 'create-project', name: `E2E ${stamp}`, description: 'signup test', timezone: 'Asia/Karachi' } } });
  check(proj.status === 200, 'new account creates a project');
  const ws2 = await again('/api/workspace');
  check(Object.values(ws2.json?.roles ?? {}).includes('Product Owner'), 'creator becomes Product Owner of the new project');
}

// Bypass attempts straight at Supabase Auth with the public key
if (SUPABASE_URL && SUPABASE_KEY) {
  const direct = (email, data = {}) => fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Direct-Attempt-123', data }),
  }).then(r => r.status);
  const outsider = await direct(`attacker-${stamp}@gmail.com`);
  check(outsider >= 400, 'direct Auth signup with an outside email is refused', `HTTP ${outsider}`);
  const badName = await direct(`Bad Name ${stamp}@accounts.team-fire.invalid`);
  check(badName >= 400, 'direct Auth signup with an invalid username is refused', `HTTP ${badName}`);
}

console.log(`\nCREATED ACCOUNT: ${username}`);
console.log(failures ? `${failures} FAILED` : 'ALL SIGNUP CHECKS PASSED');
process.exit(failures ? 1 : 0);
