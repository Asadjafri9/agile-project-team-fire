// End-to-end auth + role-based access check against a deployed site.
// Usage: BASE_URL=https://team-fire-agile.vercel.app DEMO_PASSWORD=... node tests/e2e/rbac-api.mjs
// Read-only for the seed's shape: every write it makes is reverted or harmless.
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) { console.error('Set DEMO_PASSWORD'); process.exit(2); }

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

function session() {
  const jar = new Map();
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';'); const i = pair.indexOf('=');
      const name = pair.slice(0, i), value = pair.slice(i + 1);
      if (value === '' || /Max-Age=0/i.test(c)) jar.delete(name); else jar.set(name, value);
    }
    let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, json };
  };
}

async function as(username) {
  const call = session();
  const login = await call('/api/auth/login', { method: 'POST', body: { username, password: PASSWORD } });
  check(login.status === 200, `${username}: signs in`, `HTTP ${login.status}`);
  check(!JSON.stringify(login.json ?? {}).includes('access_token'), `${username}: no tokens in login body`);
  const ws = await call('/api/workspace');
  const project = ws.json?.state?.projects?.find(p => p.code === 'FIRE');
  return { call, ws, project, role: ws.json?.roles?.[project?.id] };
}

const act = (call, action) => call('/api/actions', { method: 'POST', body: { action } });

// --- Authentication -------------------------------------------------------
{
  const anon = session();
  check((await anon('/api/workspace')).status === 401, 'anonymous: workspace refused (401)');
  check((await act(anon, { type: 'create-project', name: 'x' })).status === 401, 'anonymous: writes refused (401)');
  const bad = await anon('/api/auth/login', { method: 'POST', body: { username: 'ayesha', password: 'wrong-password' } });
  check(bad.status === 401 && bad.json?.error === 'Invalid credentials', 'wrong password: generic 401');
  const unknown = await anon('/api/auth/login', { method: 'POST', body: { username: 'no-such-user', password: 'x' } });
  check(unknown.status === 401 && unknown.json?.error === 'Invalid credentials', 'unknown user: same generic 401 (no account enumeration)');
  const upper = await anon('/api/auth/login', { method: 'POST', body: { username: '  AYESHA ', password: PASSWORD } });
  check(upper.status === 200, 'username is case/space normalised (AUTH-01)');
}

// --- Roles -----------------------------------------------------------------
const po = await as('ayesha');
const sm = await as('hamza');
const dev = await as('zara');
const viewer = await as('assessor');

check(po.role === 'Product Owner', 'ayesha is Product Owner', po.role);
check(sm.role === 'Scrum Master', 'hamza is Scrum Master', sm.role);
check(dev.role === 'Developer', 'zara is Developer', dev.role);
check(viewer.role === 'Viewer', 'assessor is Viewer', viewer.role);
check(viewer.project?.items?.length > 0, 'viewer can read the project');

const p = po.project;
const active = p.sprints.find(s => s.state === 'active');
const planned = p.sprints.find(s => s.state === 'planned');
const backlog = p.items.filter(i => !i.sprintId).sort((a, b) => a.order - b.order);
const activeItem = p.items.find(i => i.sprintId === active?.id && i.status !== 'Done');

// Viewer: read-only
check((await act(viewer.call, { type: 'move', projectId: p.id, itemId: activeItem.id, status: 'Testing' })).status === 403, 'viewer cannot move a card (403)');
check((await act(viewer.call, { type: 'create-item', projectId: p.id, title: 'x', typeName: 'Bug', points: 1, priority: 'Low' })).status === 403, 'viewer cannot create items (403)');

// Developer: move yes; plan / reorder / complete no
const original = activeItem.status;
const target = original === 'In Progress' ? 'Code Review' : 'In Progress';
check((await act(dev.call, { type: 'move', projectId: p.id, itemId: activeItem.id, status: target })).status === 200, `developer moves card to ${target}`);
const seen = await sm.call('/api/workspace');
check(seen.json.state.projects.find(x => x.id === p.id).items.find(i => i.id === activeItem.id).status === target, 'teammate sees the move (shared state)');
check((await act(dev.call, { type: 'move', projectId: p.id, itemId: activeItem.id, status: original })).status === 200, 'developer moves card back');
check((await act(dev.call, { type: 'prioritize', projectId: p.id, itemId: backlog[1].id, direction: -1 })).status === 403, 'developer cannot reorder backlog (403)');
check((await act(dev.call, { type: 'allocate', projectId: p.id, itemId: backlog[0].id, sprintId: planned.id })).status === 403, 'developer cannot plan sprints (403)');
check((await act(dev.call, { type: 'complete', projectId: p.id, sprintId: active.id })).status === 403, 'developer cannot complete sprint (403)');

// Scrum Master: plans, but cannot reorder (Product Owner only)
check((await act(sm.call, { type: 'prioritize', projectId: p.id, itemId: backlog[1].id, direction: -1 })).status === 403, 'scrum master cannot reorder backlog (403)');
check((await act(sm.call, { type: 'allocate', projectId: p.id, itemId: backlog[0].id, sprintId: planned.id })).status === 200, 'scrum master allocates to planned sprint');
check((await act(sm.call, { type: 'allocate', projectId: p.id, itemId: backlog[0].id, sprintId: null })).status === 200, 'scrum master returns it to backlog');

// Product Owner: reorders (then restores)
check((await act(po.call, { type: 'prioritize', projectId: p.id, itemId: backlog[1].id, direction: -1 })).status === 200, 'product owner reorders backlog');
check((await act(po.call, { type: 'prioritize', projectId: p.id, itemId: backlog[1].id, direction: 1 })).status === 200, 'product owner restores order');

// Business rules
const locked = await act(po.call, { type: 'update-item', projectId: p.id, itemId: activeItem.id, patch: { points: 13 } });
check(locked.status === 422, 'estimate locked in active sprint (422)', locked.json?.error);
check((await act(po.call, { type: 'start', projectId: p.id, sprintId: planned.id })).status === 422, 'cannot start a second active sprint (422)');

// Cross-project isolation: forged ids are refused
check((await act(dev.call, { type: 'move', projectId: p.id, itemId: '00000000-0000-4000-8000-000000000000', status: 'Done' })).status === 404, 'unknown item id refused (404)');

// Logout really ends the session
await viewer.call('/api/auth/logout', { method: 'POST' });
check((await viewer.call('/api/workspace')).status === 401, 'after logout: workspace refused (401)');

console.log(failures ? `\n${failures} FAILED` : '\nALL AUTH / RBAC CHECKS PASSED');
process.exit(failures ? 1 : 0);
