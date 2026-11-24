// End-to-end checks for collaboration features: invitations, membership,
// priority rule, checklists, WIP, comments/mentions, evidence, archiving,
// attachments. Every role is probed for what it must NOT be able to do.
//
//   BASE_URL=… DEMO_PASSWORD=… node tests/e2e/collab-api.mjs [--destructive]
//
// Without --destructive the suite restores everything it changes on the demo
// project. --destructive additionally creates a scratch project to test
// ownership transfer and project archiving (use on local/staging only).
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DEMO_PASSWORD;
const DESTRUCTIVE = process.argv.includes('--destructive');
const SKIP_STORAGE = process.argv.includes('--no-storage');
if (!PASSWORD) { console.error('Set DEMO_PASSWORD'); process.exit(2); }

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

function session() {
  const jar = new Map();
  const call = async (path, { method = 'GET', body } = {}) => {
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
    let json = null; try { json = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, json, headers: res.headers };
  };
  return call;
}

async function as(username) {
  const call = session();
  const login = await call('/api/auth/login', { method: 'POST', body: { username, password: PASSWORD } });
  if (login.status !== 200) throw new Error(`${username} cannot sign in: ${login.status}`);
  const ws = async () => (await call('/api/workspace')).json;
  const act = async action => call('/api/actions', { method: 'POST', body: { action } });
  return { call, ws, act };
}

const fire = ws => ws.state.projects.find(p => p.code === 'FIRE');
const S = r => `HTTP ${r.status}${r.json?.error ? ` ${r.json.error}` : ''}`;

const po = await as('ayesha');
const sm = await as('hamza');
const dev = await as('zara');
const viewer = await as('assessor');
const casey = await as('casey');

let p = fire(await po.ws());
const pid = p.id;
// Preconditions: casey is not a member and has no pending invitation (the suite is rerunnable).
{
  const caseyMember = p.members.find(m => m.name.startsWith('Casey'));
  if (caseyMember) await po.act({ type: 'remove-member', projectId: pid, userId: caseyMember.id });
  for (const i of (p.invitations ?? []).filter(i => i.username === 'casey' && i.status === 'pending')) {
    await po.act({ type: 'revoke-invite', projectId: pid, invitationId: i.id });
  }
  p = fire(await po.ws());
}
const hamza = p.members.find(m => m.name.startsWith('Hamza')).id;
const zara = p.members.find(m => m.name.startsWith('Zara')).id;
const backlogItem = p.items.filter(i => !i.sprintId).sort((a, b) => a.order - b.order)[0];
const doneActive = p.items.find(i => i.status === 'Done' && p.sprints.find(s => s.id === i.sprintId)?.state === 'active');

// ---- Invitations & membership (PROJ-02, PROJ-03) -------------------------
check((await dev.act({ type: 'invite', projectId: pid, username: 'casey', role: 'Developer' })).status === 403, 'developer cannot invite (403)');
check((await viewer.act({ type: 'invite', projectId: pid, username: 'casey', role: 'Developer' })).status === 403, 'viewer cannot invite (403)');
check((await po.act({ type: 'invite', projectId: pid, username: 'nobody-here', role: 'Developer' })).status === 404, 'invite unknown username (404)');
check((await po.act({ type: 'invite', projectId: pid, username: 'zara', role: 'Viewer' })).status === 422, 'cannot invite an existing member (422)');
let r = await po.act({ type: 'invite', projectId: pid, username: 'CASEY ', role: 'Developer' });
check(r.status === 200, 'product owner invites casey (username normalised)', S(r));
check((await sm.act({ type: 'invite', projectId: pid, username: 'casey', role: 'Viewer' })).status === 422, 'duplicate pending invitation refused (422)');
let cws = await casey.ws();
check(!fire(cws), 'casey cannot see the project before accepting');
const inv = cws.inbox.find(i => i.projectId === pid);
check(Boolean(inv) && inv.role === 'Developer', 'casey sees the invitation in their inbox');
check(cws.notifications.some(n => n.kind === 'invitation' && !n.read), 'casey gets an invitation notification');
check((await dev.act({ type: 'respond-invite', invitationId: inv.id, accept: true })).status === 404, 'someone else cannot accept casey\'s invitation (404)');
r = await casey.act({ type: 'respond-invite', invitationId: inv.id, accept: true });
check(r.status === 200, 'casey accepts', S(r));
check((await casey.act({ type: 'respond-invite', invitationId: inv.id, accept: true })).status === 422, 'invitation can be accepted only once (422)');
cws = await casey.ws();
check(cws.roles[pid] === 'Developer', 'casey is now a Developer', cws.roles[pid]);
const caseyId = cws.user.id;

check((await dev.act({ type: 'set-role', projectId: pid, userId: caseyId, role: 'Scrum Master' })).status === 403, 'developer cannot change roles (403)');
check((await sm.act({ type: 'set-role', projectId: pid, userId: p.ownerId, role: 'Viewer' })).status === 403, 'scrum master cannot change the owner\'s role (403)');
check((await sm.act({ type: 'remove-member', projectId: pid, userId: p.ownerId })).status === 403, 'nobody can remove the owner (403)');
check((await po.act({ type: 'leave', projectId: pid })).status === 422, 'owner cannot leave without transferring (422)');
r = await sm.act({ type: 'set-role', projectId: pid, userId: caseyId, role: 'Viewer' });
check(r.status === 200, 'scrum master changes casey to Viewer', S(r));
check((await casey.act({ type: 'comment', projectId: pid, itemId: backlogItem.id, body: 'hi', mentions: [] })).status === 403, 'role change applies immediately: casey can no longer comment (403)');
await sm.act({ type: 'set-role', projectId: pid, userId: caseyId, role: 'Developer' });
await po.act({ type: 'update-item', projectId: pid, itemId: backlogItem.id, patch: { assigneeId: caseyId } });
r = await sm.act({ type: 'remove-member', projectId: pid, userId: caseyId });
check(r.status === 200, 'scrum master removes casey', S(r));
p = fire(await po.ws());
check(p.items.find(i => i.id === backlogItem.id).assigneeId === null, 'removal cleared casey\'s assignment');
check(p.activity.some(a => a.itemId === backlogItem.id && /Unassigned Casey/.test(a.detail)), 'removal recorded in item activity');
check(!fire(await casey.ws()), 'removed member loses access immediately');
await po.act({ type: 'update-item', projectId: pid, itemId: backlogItem.id, patch: { assigneeId: backlogItem.assigneeId } });

// Revoke flow
await po.act({ type: 'invite', projectId: pid, username: 'casey', role: 'Viewer' });
const inv2 = (await casey.ws()).inbox.find(i => i.projectId === pid);
check((await dev.act({ type: 'revoke-invite', projectId: pid, invitationId: inv2.id })).status === 403, 'developer cannot revoke (403)');
check((await po.act({ type: 'revoke-invite', projectId: pid, invitationId: inv2.id })).status === 200, 'product owner revokes');
check((await casey.act({ type: 'respond-invite', invitationId: inv2.id, accept: true })).status === 422, 'revoked invitation cannot be accepted (422)');
check(!(await casey.ws()).inbox.some(i => i.id === inv2.id), 'revoked invitation leaves the inbox');
check(p.invitations !== undefined && (await dev.ws()).state.projects.find(x => x.id === pid).invitations.length === 0, 'developers cannot see the invitation list (RLS)');

// ---- Join codes / invite links ------------------------------------------------
{
  check((await dev.act({ type: 'create-join-code', projectId: pid, role: 'Developer', days: 7 })).status === 403, 'developer cannot create invite links (403)');
  check((await sm.act({ type: 'create-join-code', projectId: pid, role: 'Product Owner', days: 7 })).status === 422, 'invite links never grant Product Owner (422)');
  r = await sm.act({ type: 'create-join-code', projectId: pid, role: 'Developer', days: 7, maxUses: 1 });
  check(r.status === 200 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(r.json?.data?.code ?? ''), 'scrum master creates a one-use invite code', r.json?.data?.code);
  const jc = r.json?.data;
  check(!(await dev.ws()).state.projects.find(x => x.id === pid).joinCodes?.length, 'developers cannot see invite codes (RLS)');
  const typed = jc.code.replace('-', '').toLowerCase();
  r = await casey.act({ type: 'join-with-code', code: `  ${typed} ` });
  check(r.status === 200 && r.json?.data?.already_member === false, 'casey joins with the code (case/format tolerant)', S(r));
  check((await casey.ws()).roles[pid] === 'Developer', 'joined with the role the code grants');
  check((await casey.act({ type: 'join-with-code', code: jc.code })).json?.data?.already_member === true, 'joining again is a harmless no-op');
  await sm.act({ type: 'remove-member', projectId: pid, userId: (await casey.ws()).user.id });
  check((await casey.act({ type: 'join-with-code', code: jc.code })).status === 404, 'a used-up code is refused (404)');
  r = await sm.act({ type: 'create-join-code', projectId: pid, role: 'Viewer', days: 1 });
  const jc2 = r.json?.data;
  check((await sm.act({ type: 'revoke-join-code', projectId: pid, codeId: jc2.id })).status === 200, 'scrum master revokes a code');
  check((await casey.act({ type: 'join-with-code', code: jc2.code })).status === 404, 'a revoked code is refused (404)');
  check(!fire(await casey.ws()), 'casey is not a member after the refused joins');
  const anonJoin = await session()('/api/actions', { method: 'POST', body: { action: { type: 'join-with-code', code: jc2.code } } });
  check(anonJoin.status === 401, 'signed-out visitors must sign in before joining (401)');
}

// ---- Owner can never lock themselves out ------------------------------------
{
  const ownerId = p.ownerId;
  r = await po.act({ type: 'set-role', projectId: pid, userId: ownerId, role: 'Developer' });
  check(r.status === 200, 'owner changes their own Scrum role to Developer', S(r));
  const ownerWs = await po.ws();
  check(ownerWs.roles[pid] === 'Product Owner', 'owner keeps full authority after self-demotion', ownerWs.roles[pid]);
  check(fire(ownerWs).members.find(m => m.id === ownerId).role === 'Developer', 'owner\'s displayed Scrum role is Developer');
  check((await po.act({ type: 'set-role', projectId: pid, userId: hamza, role: 'Developer' })).status === 200, 'self-demoted owner can still change others\' roles');
  await po.act({ type: 'set-role', projectId: pid, userId: hamza, role: 'Scrum Master' });
  const b0 = fire(ownerWs).items.filter(i => !i.sprintId).sort((a, b) => a.order - b.order);
  check((await po.act({ type: 'prioritize', projectId: pid, itemId: b0[1].id, direction: -1 })).status === 200, 'self-demoted owner can still reorder the backlog (PO-only)');
  await po.act({ type: 'prioritize', projectId: pid, itemId: b0[1].id, direction: 1 });
  check((await po.act({ type: 'set-role', projectId: pid, userId: ownerId, role: 'Product Owner' })).status === 200, 'owner switches back to Product Owner');
  check((await dev.act({ type: 'set-role', projectId: pid, userId: hamza, role: 'Developer' })).status === 403, 'non-owner developers are still refused (403)');
  check((await sm.act({ type: 'set-role', projectId: pid, userId: ownerId, role: 'Viewer' })).status === 403, 'nobody else can change the owner\'s role (403)');
}

// ---- QA Tester role ----------------------------------------------------------------
{
  r = await sm.act({ type: 'invite', projectId: pid, username: 'casey', role: 'QA Tester' });
  check(r.status === 200, 'scrum master invites casey as QA Tester', S(r));
  const qaInv = (await casey.ws()).inbox.find(i => i.projectId === pid);
  check(qaInv?.role === 'QA Tester', 'invitation offers the QA Tester role');
  await casey.act({ type: 'respond-invite', invitationId: qaInv.id, accept: true });
  const qws = await casey.ws();
  check(qws.roles[pid] === 'QA Tester', 'casey is a QA Tester', qws.roles[pid]);
  const qp = fire(qws);
  const target = qp.items.find(i => i.sprintId && qp.sprints.find(s => s.id === i.sprintId)?.state === 'active' && i.status !== 'Done');
  const back = target.status;
  check((await casey.act({ type: 'move', projectId: pid, itemId: target.id, status: back === 'Testing' ? 'In Progress' : 'Testing' })).status === 200, 'QA Tester moves a card');
  await casey.act({ type: 'move', projectId: pid, itemId: target.id, status: back });
  r = await casey.act({ type: 'create-item', projectId: pid, title: 'E2E QA bug', typeName: 'Bug', points: 1, priority: 'Low' });
  check(r.status === 200, 'QA Tester files a bug');
  const qaBug = r.json?.data?.id;
  check((await casey.act({ type: 'comment', projectId: pid, itemId: target.id, body: 'E2E QA: verified on staging', mentions: [] })).status === 200, 'QA Tester comments');
  check((await casey.act({ type: 'set-role', projectId: pid, userId: hamza, role: 'Developer' })).status === 403, 'QA Tester cannot change roles (403)');
  check((await casey.act({ type: 'start', projectId: pid, sprintId: qp.sprints.find(s => s.state === 'planned').id })).status === 403, 'QA Tester cannot start sprints (403)');
  check((await casey.act({ type: 'prioritize', projectId: pid, itemId: backlogItem.id, direction: 1 })).status === 403, 'QA Tester cannot reorder the backlog (403)');
  check((await casey.act({ type: 'archive-item', projectId: pid, itemId: qaBug, reason: 'x' })).status === 403, 'QA Tester cannot archive (403)');
  check((await casey.act({ type: 'set-wip', projectId: pid, limits: { Testing: 4 } })).status === 403, 'QA Tester cannot configure WIP (403)');
  r = await sm.act({ type: 'create-join-code', projectId: pid, role: 'QA Tester', days: 1, maxUses: 1 });
  check(r.status === 200, 'invite links can grant QA Tester');
  await sm.act({ type: 'revoke-join-code', projectId: pid, codeId: r.json?.data?.id });
  await po.act({ type: 'archive-item', projectId: pid, itemId: qaBug, reason: 'E2E cleanup' });
  check((await sm.act({ type: 'remove-member', projectId: pid, userId: qws.user.id })).status === 200, 'QA Tester removed (cleanup)');
}

// ---- Priority is Product Owner only (§3) ----------------------------------
const prio = backlogItem.priority;
const other = prio === 'High' ? 'Low' : 'High';
check((await dev.act({ type: 'update-item', projectId: pid, itemId: backlogItem.id, patch: { priority: other } })).status === 403, 'developer cannot change priority (403)');
check((await sm.act({ type: 'update-item', projectId: pid, itemId: backlogItem.id, patch: { priority: other } })).status === 403, 'scrum master cannot change priority (403)');
check((await po.act({ type: 'update-item', projectId: pid, itemId: backlogItem.id, patch: { priority: other } })).status === 200, 'product owner changes priority');
await po.act({ type: 'update-item', projectId: pid, itemId: backlogItem.id, patch: { priority: prio } });

// ---- Checklist editing (ITEM-03) ------------------------------------------
const original = backlogItem.checklist;
r = await dev.act({ type: 'set-checklist', projectId: pid, itemId: backlogItem.id, checklist: [...original, { text: 'E2E entry', done: false }] });
check(r.status === 200, 'developer adds a checklist entry', S(r));
check(fire(await sm.ws()).items.find(i => i.id === backlogItem.id).checklist.length === original.length + 1, 'teammate sees the new checklist entry');
check((await dev.act({ type: 'set-checklist', projectId: pid, itemId: backlogItem.id, checklist: [{ text: '', done: false }] })).status === 422, 'empty checklist text refused (422)');
check((await viewer.act({ type: 'set-checklist', projectId: pid, itemId: backlogItem.id, checklist: [] })).status === 403, 'viewer cannot edit checklists (403)');
await dev.act({ type: 'set-checklist', projectId: pid, itemId: backlogItem.id, checklist: original });

// ---- WIP limits (BOARD-05) -------------------------------------------------
const wip = p.wip;
check((await dev.act({ type: 'set-wip', projectId: pid, limits: { 'In Progress': 5 } })).status === 403, 'developer cannot configure WIP (403)');
check((await sm.act({ type: 'set-wip', projectId: pid, limits: { 'In Progress': 0 } })).status === 422, 'WIP limit must be positive (422)');
check((await sm.act({ type: 'set-wip', projectId: pid, limits: { 'In Progress': 5, Testing: null } })).status === 200, 'scrum master sets WIP limits');
const wipNow = fire(await dev.ws()).wip;
check(wipNow['In Progress'] === 5 && wipNow.Testing === 99, 'limits stored (null = no limit)');
await sm.act({ type: 'set-wip', projectId: pid, limits: { 'In Progress': wip['In Progress'], Testing: wip.Testing } });

// ---- Comments, mentions, moderation (COL-03, COL-04) ---------------------
check((await viewer.act({ type: 'comment', projectId: pid, itemId: backlogItem.id, body: 'x', mentions: [] })).status === 403, 'viewer cannot comment (403)');
r = await dev.act({ type: 'comment', projectId: pid, itemId: backlogItem.id, body: 'E2E: @Hamza please review', mentions: [hamza, '00000000-0000-4000-8000-000000000000'] });
check(r.status === 200, 'developer comments with a mention', S(r));
const commentId = r.json?.data?.id;
const hamzaWs = await sm.ws();
check(hamzaWs.notifications.some(n => n.kind === 'mention' && /mentioned you/.test(n.text) && !n.read), 'mentioned member is notified');
check(hamzaWs.notifications.some(n => n.kind === 'mention' && n.commentId === commentId && n.itemId === backlogItem.id), 'mention notification links to the exact comment (deep link)');
const stored = fire(hamzaWs).items.find(i => i.id === backlogItem.id).comments.find(c => c.id === commentId);
check(stored && stored.mentions.length === 1, 'non-member mention ids are dropped');
check((await sm.act({ type: 'edit-comment', projectId: pid, itemId: backlogItem.id, commentId, body: 'hijack', mentions: [] })).status === 403, 'others cannot edit your comment (403)');
check((await dev.act({ type: 'edit-comment', projectId: pid, itemId: backlogItem.id, commentId, body: 'E2E: edited', mentions: [] })).status === 200, 'author edits own comment');
check(Boolean(fire(await po.ws()).items.find(i => i.id === backlogItem.id).comments.find(c => c.id === commentId).editedAt), 'edit timestamp recorded');
check((await sm.act({ type: 'read-notifications' })).status === 200 && !(await sm.ws()).notifications.some(n => !n.read), 'mark all notifications read');
const bilalSession = await as('bilal');
check((await bilalSession.act({ type: 'delete-comment', projectId: pid, itemId: backlogItem.id, commentId })).status === 403, 'another developer cannot delete it (403)');
check((await sm.act({ type: 'delete-comment', projectId: pid, itemId: backlogItem.id, commentId })).status === 200, 'scrum master moderates (deletes) it');
const after = fire(await po.ws());
const stub = after.items.find(i => i.id === backlogItem.id).comments.find(c => c.id === commentId);
check(stub?.deleted === true && stub.body === '', 'deleted comment leaves a history stub without its body');
check(after.activity.some(a => a.kind === 'moderation'), 'moderation is audited in activity');

// ---- Evidence --------------------------------------------------------------
check((await viewer.act({ type: 'add-evidence', projectId: pid, evidence: { title: 'x', version: '1', kind: 'PDF', date: '2026-11-15', note: '' } })).status === 403, 'viewer cannot record evidence (403)');
r = await dev.act({ type: 'add-evidence', projectId: pid, evidence: { title: 'E2E evidence', version: 'v0', kind: 'Markdown', date: '2026-11-15', note: 'temporary' } });
check(r.status === 200, 'developer records evidence', S(r));
const evId = r.json?.data?.id;
check(fire(await viewer.ws()).evidence.some(e => e.id === evId), 'viewer can read evidence');
check((await bilalSession.act({ type: 'remove-evidence', projectId: pid, evidenceId: evId })).status === 403, 'other developer cannot remove it (403)');
check((await dev.act({ type: 'remove-evidence', projectId: pid, evidenceId: evId })).status === 200, 'author removes own evidence');

// ---- Archive a work item (ITEM-01, ITEM-08) -------------------------------
if (doneActive) check((await po.act({ type: 'archive-item', projectId: pid, itemId: doneActive.id, reason: 'x' })).status === 422, 'Done item in active sprint cannot be archived (422)');
r = await po.act({ type: 'create-item', projectId: pid, title: 'E2E archive me', typeName: 'Task', points: 1, priority: 'Low' });
const tmp = r.json?.data?.id;
check((await dev.act({ type: 'archive-item', projectId: pid, itemId: tmp, reason: 'cleanup' })).status === 403, 'developer cannot archive items (403)');
check((await po.act({ type: 'archive-item', projectId: pid, itemId: tmp, reason: '' })).status === 422, 'archiving needs a reason (422)');
check((await po.act({ type: 'archive-item', projectId: pid, itemId: tmp, reason: 'E2E cleanup' })).status === 200, 'product owner archives the item');
check(!fire(await dev.ws()).items.some(i => i.id === tmp), 'archived item disappears from active lists');
const devCreate = await dev.act({ type: 'create-item', projectId: pid, title: 'E2E dev priority', typeName: 'Bug', points: null, priority: 'Urgent' });
const devItem = fire(await po.ws()).items.find(i => i.id === devCreate.json?.data?.id);
check(devItem?.priority === 'Medium', 'developer-created items cannot set priority (forced Medium)', devItem?.priority);
await po.act({ type: 'archive-item', projectId: pid, itemId: devItem.id, reason: 'E2E cleanup' });

// ---- Attachments (REL-02) ----------------------------------------------------
if (!SKIP_STORAGE) {
  const sign = (s, body) => s.call('/api/attachments/sign', { method: 'POST', body: { projectId: pid, itemId: backlogItem.id, ...body } });
  check((await sign(viewer, { name: 'a.txt', size: 5, mime: 'text/plain' })).status === 403, 'viewer cannot upload (403)');
  check((await sign(dev, { name: 'a.exe', size: 5, mime: 'application/x-msdownload' })).status === 422, 'disallowed file type refused (422)');
  check((await sign(dev, { name: 'big.pdf', size: 11 * 1024 * 1024, mime: 'application/pdf' })).status === 422, 'file over 10 MB refused (422)');
  const signed = await sign(dev, { name: 'e2e note.txt', size: 12, mime: 'text/plain' });
  check(signed.status === 200 && signed.json?.path?.startsWith(`${pid}/${backlogItem.id}/`), 'developer gets a signed upload URL', S(signed));
  if (signed.status === 200) {
    const put = await fetch(signed.json.signedUrl, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'hello, e2e!\n' });
    check(put.ok, 'file uploads to private storage', `HTTP ${put.status}`);
    check((await dev.act({ type: 'add-attachment', projectId: pid, itemId: backlogItem.id, path: `${pid}/${backlogItem.id}/forged.txt`, name: 'x', size: 1, mime: 'text/plain' })).status === 404, 'cannot register a file that was never uploaded (404)');
    r = await dev.act({ type: 'add-attachment', projectId: pid, itemId: backlogItem.id, path: signed.json.path, name: 'e2e note.txt', size: 12, mime: 'text/plain' });
    check(r.status === 200, 'attachment recorded', S(r));
    const attId = r.json?.data?.id;
    const dl = await viewer.call(`/api/attachments/${attId}`);
    check(dl.status === 302 && /token=/.test(dl.headers.get('location') ?? ''), 'viewer gets a short-lived signed download link');
    const fetched = dl.status === 302 ? await fetch(dl.headers.get('location')) : null;
    check(fetched?.ok && (await fetched.text()).startsWith('hello, e2e!'), 'download returns the file');
    check((await casey.call(`/api/attachments/${attId}`)).status === 404, 'non-member cannot download (404)');
    check((await viewer.act({ type: 'remove-attachment', projectId: pid, itemId: backlogItem.id, attachmentId: attId })).status === 403, 'viewer cannot remove files (403)');
    check((await dev.act({ type: 'remove-attachment', projectId: pid, itemId: backlogItem.id, attachmentId: attId })).status === 200, 'uploader removes the file');
  }
}

// ---- Evidence documents ------------------------------------------------------
if (!SKIP_STORAGE) {
  const signEv = (s, body) => s.call('/api/attachments/sign', { method: 'POST', body: { target: 'evidence', projectId: pid, ...body } });
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  check((await signEv(viewer, { name: 'r.docx', size: 10, mime: DOCX })).status === 403, 'viewer cannot upload evidence documents (403)');
  check((await signEv(dev, { name: 'x.exe', size: 10, mime: 'application/x-msdownload' })).status === 422, 'evidence rejects executables (422)');
  const ev = await signEv(dev, { name: 'Sprint review.md', size: 20, mime: 'text/markdown' });
  check(ev.status === 200 && ev.json?.path?.startsWith(`${pid}/evidence/`), 'developer gets an evidence upload URL', `HTTP ${ev.status}`);
  if (ev.status === 200) {
    const put = await fetch(ev.json.signedUrl, { method: 'PUT', headers: { 'content-type': 'text/markdown' }, body: '# Sprint review\nok\n' });
    check(put.ok, 'evidence document uploads to private storage', `HTTP ${put.status}`);
    r = await dev.act({ type: 'add-evidence', projectId: pid, evidence: { title: 'E2E review doc', version: 'v1', kind: 'Markdown', date: '2026-11-15', note: 'e2e' }, file: { path: ev.json.path, name: 'Sprint review.md', size: 20, mime: 'text/markdown' } });
    check(r.status === 200, 'evidence recorded with its document', S(r));
    const evRow = fire(await viewer.ws()).evidence.find(e => e.id === r.json?.data?.id);
    check(evRow?.file?.name === 'Sprint review.md', 'evidence lists the document for members');
    const dl = await viewer.call(`/api/evidence/${evRow?.id}`);
    check(dl.status === 302, 'viewer downloads the evidence document via signed link');
    const body = dl.status === 302 ? await (await fetch(dl.headers.get('location'))).text() : '';
    check(body.startsWith('# Sprint review'), 'downloaded document has the uploaded content');
    check((await casey.call(`/api/evidence/${evRow?.id}`)).status === 404, 'non-member cannot download evidence (404)');
    check((await dev.act({ type: 'add-evidence', projectId: pid, evidence: { title: 'forged', version: 'v1', kind: 'PDF', date: '2026-11-15', note: '' }, file: { path: `${pid}/evidence/never-uploaded.pdf`, name: 'x.pdf', size: 5, mime: 'application/pdf' } })).status === 404, 'cannot record a document that was never uploaded (404)');
    await dev.act({ type: 'remove-evidence', projectId: pid, evidenceId: evRow?.id });
  }
}

// ---- Ownership transfer & project archive (PROJ-03, PROJ-05) ---------------
if (DESTRUCTIVE) {
  r = await po.act({ type: 'create-project', name: 'E2E Scratch' });
  const sid = r.json?.data?.id;
  await po.act({ type: 'invite', projectId: sid, username: 'hamza', role: 'Scrum Master' });
  const hInv = (await sm.ws()).inbox.find(i => i.projectId === sid);
  await sm.act({ type: 'respond-invite', invitationId: hInv.id, accept: true });
  check((await sm.act({ type: 'transfer-owner', projectId: sid, userId: hamza })).status === 403, 'non-owner cannot transfer ownership (403)');
  check((await sm.act({ type: 'archive-project', projectId: sid })).status === 403, 'non-owner cannot archive the project (403)');
  check((await po.act({ type: 'transfer-owner', projectId: sid, userId: zara })).status === 422, 'ownership only goes to an active member (422)');
  check((await po.act({ type: 'transfer-owner', projectId: sid, userId: hamza })).status === 200, 'owner transfers ownership');
  check((await po.act({ type: 'leave', projectId: sid })).status === 200, 'former owner can now leave');
  check((await sm.act({ type: 'archive-project', projectId: sid })).status === 200, 'new owner archives the project');
  check((await sm.act({ type: 'create-item', projectId: sid, title: 'x', typeName: 'Bug', points: 1, priority: 'Low' })).status === 422, 'archived project is read-only (422)');
  check((await sm.ws()).state.projects.find(x => x.id === sid)?.archived === true, 'archived project stays readable');
}

// ---- Join code brute-force throttle (locks the assessor's joins for 15 minutes) ----
if (process.argv.includes('--bruteforce')) {
  let last;
  for (let i = 0; i < 11; i++) last = await viewer.act({ type: 'join-with-code', code: `ZZZZ-ZZ${String(i).padStart(2, '2').replace(/[01]/g, '2')}` });
  check(last.status === 422 && /Too many/.test(last.json?.error ?? ''), 'repeated wrong codes are throttled (422)', last.json?.error);
}

console.log(failures ? `\n${failures} FAILED` : '\nALL COLLABORATION CHECKS PASSED');
process.exit(failures ? 1 : 0);
