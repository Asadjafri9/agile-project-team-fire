/*
 * LOCAL INTEGRATION LAYER (not production code, not committed).
 *
 * Loads the real project/sprint/work items from the Next.js API and feeds them
 * into the dashboard-mockup render functions. Status changes are persisted via
 * POST /api/projects/:id/items/move, which calls the rpc_move_work_item SQL RPC.
 */
(() => {
  const API = '';
  const state = {
    user: null,
    project: null,
    sprint: null,
    sprints: [],
    items: [],
    sprintItems: [],
    backlogItems: [],
    members: [],
  };

  const COLORS = ['#f6c2a9', '#e2d9fb', '#f6dba9', '#c5e7dc', '#cce0fa', '#f5d0db', '#d4def4'];
  const initials = (name) =>
    String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');

  const flash = (message) => (typeof showToast === 'function' ? showToast(message) : console.log(message));

  async function api(path, options = {}) {
    const res = await fetch(API + path, {
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(payload.error || `${res.status} ${res.statusText}`);
      error.status = res.status;
      throw error;
    }
    return payload;
  }

  /* ---------- styles ---------- */
  const style = document.createElement('style');
  style.textContent = `
    .live-overlay{position:fixed;inset:0;background:rgba(16,27,50,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px;z-index:9999}
    .live-card{background:#fff;border-radius:18px;padding:28px;width:100%;max-width:380px;box-shadow:0 24px 60px rgba(16,27,50,.35)}
    .live-card h2{margin:0 0 6px;font-size:1.35rem;color:#101b32}
    .live-card p{margin:0 0 18px;color:#75829a;font-size:.9rem;line-height:1.5}
    .live-card label{display:block;font-size:.75rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#75829a;margin:12px 0 6px}
    .live-card input,.live-card select{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d9dfea;border-radius:10px;font:inherit;color:#101b32;background:#fff}
    .live-card button{margin-top:18px;width:100%;padding:11px;border:0;border-radius:10px;background:#5b54d6;color:#fff;font:inherit;font-weight:600;cursor:pointer}
    .live-card button:disabled{opacity:.6;cursor:progress}
    .live-error{margin-top:12px;color:#c0392b;font-size:.85rem;min-height:1em}
    .live-badge{display:inline-flex;align-items:center;gap:6px}
    .live-badge i{width:7px;height:7px;border-radius:50%;background:#2ecc71;box-shadow:0 0 0 3px rgba(46,204,113,.18)}
    .live-fab{position:fixed;right:22px;bottom:22px;z-index:50;padding:12px 18px;border:0;border-radius:999px;background:#101b32;color:#fff;font:inherit;font-weight:600;cursor:pointer;box-shadow:0 12px 30px rgba(16,27,50,.3)}
    .live-fab:hover{background:#1d2c4d}
    .live-form-row{display:flex;gap:10px}
    .live-form-row>*{flex:1}
  `;
  document.head.append(style);

  /* ---------- login ---------- */
  function showLogin(message = 'Sign in to load the live workspace.') {
    const overlay = document.createElement('div');
    overlay.className = 'live-overlay';
    overlay.innerHTML = `
      <form class="live-card" id="live-login">
        <h2>Connect to local backend</h2>
        <p>${message}<br>API: <strong>${location.origin}/api</strong> · Database: local Supabase</p>
        <label for="live-user">Username</label>
        <input id="live-user" value="admin" autocomplete="username" required />
        <label for="live-pass">Password</label>
        <input id="live-pass" type="password" value="Password123!" autocomplete="current-password" required />
        <button type="submit">Sign in</button>
        <div class="live-error" id="live-error"></div>
      </form>`;
    document.body.append(overlay);
    const form = overlay.querySelector('form');
    const errorBox = overlay.querySelector('#live-error');
    const button = overlay.querySelector('button');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      button.disabled = true;
      errorBox.textContent = '';
      try {
        const { user } = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username: form.querySelector('#live-user').value,
            password: form.querySelector('#live-pass').value,
          }),
        });
        state.user = user;
        overlay.remove();
        await loadWorkspace();
      } catch (error) {
        errorBox.textContent = error.message;
        button.disabled = false;
      }
    });
  }

  /* ---------- data ---------- */
  function mapItem(item, inSprint) {
    const owner = item.assignee?.display_name || 'Unassigned';
    return {
      id: item.key,
      dbId: item.id,
      version: item.version,
      position: item.position,
      title: item.title,
      points: item.estimate ?? 0,
      priority: item.priority,
      owner,
      initials: initials(owner),
      status: item.status,
      description: item.description?.text || '',
      inSprint,
      sprintId: item.sprint_id,
    };
  }

  async function loadWorkspace() {
    try {
      const projects = (await api('/api/projects')).data;
      if (!projects.length) return showLogin('No projects visible for this account.');
      const projectId = projects[0].id;
      const [project, members, sprints, items] = await Promise.all([
        api(`/api/projects/${projectId}`),
        api(`/api/projects/${projectId}/members`),
        api(`/api/projects/${projectId}/sprints`),
        api(`/api/projects/${projectId}/items`),
      ]);
      state.project = project.data;
      state.members = members.data;
      state.sprints = sprints.data;
      state.items = items.data;
      state.sprint = sprints.data.find((sprint) => sprint.status === 'ACTIVE') || sprints.data[0] || null;
      state.sprintItems = items.data.filter((item) => item.sprint_id && item.sprint_id === state.sprint?.id).map((item) => mapItem(item, true));
      state.backlogItems = items.data.filter((item) => !item.sprint_id).map((item) => mapItem(item, false));
      applyToMockup();
      paintChrome();
    } catch (error) {
      if (error.status === 401) return showLogin('Session expired — sign in again.');
      flash(`Load failed: ${error.message}`);
      console.error(error);
    }
  }

  function applyToMockup() {
    const mapped = [...state.sprintItems, ...state.backlogItems];
    sprintTasks.length = 0;
    sprintTasks.push(...state.sprintItems);
    allTasks.length = 0;
    allTasks.push(...mapped);
    members.length = 0;
    state.members.forEach((member, index) => {
      const name = member.profile?.display_name || member.profile?.username || 'Unknown user';
      members.push({ name, role: member.role, initials: initials(name), color: COLORS[index % COLORS.length] });
    });
    render();
  }

  function paintChrome() {
    const pill = document.querySelector('.demo-pill');
    if (pill) pill.innerHTML = '<i></i> Live · local database';
    pill?.classList.add('live-badge');
    const workspaceName = document.querySelector('.workspace-copy strong');
    if (workspaceName) workspaceName.textContent = state.project?.name || 'Workspace';
    const workspaceMeta = document.querySelector('.workspace-copy small');
    if (workspaceMeta) workspaceMeta.textContent = `${state.project?.key || ''} · ${state.members.length} members`;
    const workspaceAvatar = document.querySelector('.workspace-avatar');
    if (workspaceAvatar && state.project) workspaceAvatar.textContent = initials(state.project.name);
    const me = state.members.find((member) => member.profile?.username === 'admin') || state.members[0];
    const displayName = me?.profile?.display_name || 'System Admin';
    const sidebar = document.querySelector('.sidebar-profile');
    if (sidebar) {
      sidebar.querySelector('strong').textContent = displayName;
      sidebar.querySelector('small').textContent = me?.role || 'Member';
      const avatar = sidebar.querySelector('.avatar');
      if (avatar) avatar.textContent = initials(displayName);
    }
    const topAvatar = document.querySelector('.avatar-top');
    if (topAvatar) topAvatar.textContent = initials(displayName);
  }

  /* ---------- live labels ---------- */
  const setLabel = (element, text) => {
    if (!element) return;
    const svg = element.querySelector('svg');
    element.textContent = '';
    if (svg) element.append(svg);
    element.append(document.createTextNode(' ' + text));
  };

  function sprintClock(sprint) {
    const [sy, sm, sd] = sprint.start_date.split('-').map(Number);
    const [ey, em, ed] = sprint.end_date.split('-').map(Number);
    const DAY = 86400000;
    const start = Date.UTC(sy, sm - 1, sd);
    const end = Date.UTC(ey, em - 1, ed);
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const total = Math.round((end - start) / DAY) + 1;
    const day = Math.min(Math.max(Math.round((today - start) / DAY) + 1, 0), total);
    const remaining = Math.max(Math.round((end - today) / DAY), 0);
    return { total, day, remaining };
  }

  function decorate() {
    if (!state.project) return;
    const sprint = state.sprint;
    const clock = sprint ? sprintClock(sprint) : null;
    const shortName = sprint ? sprint.name.split(':')[0] : 'Sprint';

    const me = state.members.find((member) => member.profile?.username === 'admin') || state.members[0];
    const displayName = me?.profile?.display_name || 'there';
    const firstName = displayName.split(' ')[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    const title = document.querySelector('.page-heading .page-title');
    if (title && /^Good (morning|afternoon|evening),/.test(title.textContent)) {
      title.innerHTML = `${greeting}, ${escapeText(firstName)} <span aria-hidden="true">👋</span>`;
    }

    const eyebrow = document.querySelector('.page-heading .eyebrow');
    if (eyebrow) {
      const text = eyebrow.textContent;
      const weekday = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
      if (/Team Fire|Wednesday/i.test(text)) eyebrow.textContent = `${weekday} · ${state.project.name}`;
      else if (/^Sprint .*Day/i.test(text) && clock) eyebrow.textContent = `${shortName} · Day ${clock.day} of ${clock.total}`;
    }

    const hero = document.querySelector('.hero');
    if (hero && sprint && clock) {
      const name = hero.querySelector('h2');
      if (name) name.textContent = sprint.name;
      const goal = hero.querySelector('.hero-copy > p');
      if (goal && sprint.goal) goal.textContent = sprint.goal;
      const labels = hero.querySelectorAll('.hero-meta span');
      setLabel(labels[0], `Day ${clock.day} of ${clock.total}`);
      setLabel(labels[1], clock.remaining === 1 ? '1 day remaining' : `${clock.remaining} days remaining`);
      const tag = hero.querySelector('.hero-tag');
      if (tag) tag.innerHTML = `<span></span> ${sprint.status === 'ACTIVE' ? 'CURRENT SPRINT · IN PROGRESS' : `${sprint.status} SPRINT`}`;
    }

    const bars = document.querySelector('.velocity-bars');
    if (bars && state.sprints.length) {
      const rows = state.sprints
        .slice()
        .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
        .map((item) => ({
          label: item.name.split(':')[0].replace('Sprint ', 'S'),
          value: state.items
            .filter((workItem) => workItem.sprint_id === item.id && workItem.status === 'Done')
            .reduce((sum, workItem) => sum + (workItem.estimate || 0), 0),
          current: item.id === sprint?.id,
        }));
      const peak = Math.max(...rows.map((row) => row.value), 1);
      bars.innerHTML = rows
        .map((row) => `<div class="velocity-bar-group"><span class="velocity-value">${row.value}</span><div class="velocity-bar ${row.current ? 'current' : ''}" style="height:${Math.max(9, Math.round((row.value / peak) * 100))}%"></div><span class="velocity-label">${escapeText(row.label)}</span></div>`)
        .join('');
      const footer = bars.parentElement.querySelector('.velocity-footer');
      if (footer) {
        footer.textContent =
          sprint?.status === 'ACTIVE'
            ? `${shortName} is in progress; its final velocity is still changing.`
            : 'All sprints are complete.';
      }
    }

    const boardHint = [...document.querySelectorAll('.kanban-hint')].find((element) => element.textContent.includes('preview session'));
    if (boardHint) boardHint.textContent = 'Drag a card between columns, or open it to change status. Every move is saved through the API.';

    const boardSubtitle = [...document.querySelectorAll('.page-subtitle')].find((element) => element.textContent.includes('mock interaction'));
    if (boardSubtitle) boardSubtitle.textContent = 'The workflow from To Do through Done. Drag cards or open one to change status — every move is persisted.';

    const analyticsSubtitle = [...document.querySelectorAll('.page-subtitle')].find((element) => element.textContent.includes('mock reporting view'));
    if (analyticsSubtitle) analyticsSubtitle.textContent = 'Live reporting computed from work items in the local database.';

    const analyticsHint = [...document.querySelectorAll('.kanban-hint')].find((element) => element.textContent.includes('Values here are demo data'));
    if (analyticsHint) analyticsHint.textContent = 'Metrics are computed from live work items; the burndown line is illustrative until status history accumulates.';
  }

  const baseRender = window.render;
  window.render = function renderWithLiveLabels() {
    baseRender();
    decorate();
  };

  /* ---------- persistence ---------- */
  async function persistMove(task, newStatus) {
    const previous = task.status;
    task.status = newStatus;
    render();
    try {
      const { data } = await api(`/api/projects/${state.project.id}/items/move`, {
        method: 'POST',
        body: JSON.stringify({
          itemId: task.dbId,
          newStatus,
          newPosition: task.position,
          expectedVersion: task.version,
          mutationId: crypto.randomUUID(),
        }),
      });
      task.status = data.status;
      task.version = data.version;
      task.position = data.position;
      render();
      flash(`${task.id} saved to database → ${data.status} (v${data.version})`);
    } catch (error) {
      task.status = previous;
      render();
      flash(`Save failed: ${error.message}`);
      if (error.status === 409) await loadWorkspace();
    }
  }

  /* ---------- overrides ---------- */
  window.backlogRows = function backlogRowsLive() {
    const query = (document.getElementById('backlog-search')?.value || '').toLowerCase();
    const filter = document.getElementById('backlog-filter')?.value || 'all';
    const rows = allTasks.filter((task) => (filter === 'all' || task.status === filter) && `${task.id} ${task.title} ${task.owner}`.toLowerCase().includes(query));
    const columnFor = (status) => columns.find((column) => column.name === status);
    document.getElementById('backlog-rows').innerHTML = rows.length
      ? rows
          .map((task) => {
            const column = columnFor(task.status);
            return `<tr><td class="task-title-cell"><button type="button" data-task="${task.id}">${escapeText(task.title)}</button><small>${task.id} · ${task.inSprint ? escapeText((state.sprint?.name || 'Active sprint').split(':')[0]) : 'Backlog'}</small></td><td><span class="priority ${task.priority.toLowerCase()}">${task.priority}</span></td><td><span class="status-pill" style="background:${column?.light || '#f0f2f7'};color:${column?.color || '#75829a'}">${task.status}</span></td><td><span class="person-cell"><span class="mini-avatar">${task.initials}</span>${escapeText(task.owner)}</span></td><td><span class="point-pill">${task.points} pts</span></td></tr>`;
          })
          .join('')
      : '<tr><td colspan="5" class="empty-state">No work items match your search.</td></tr>';
  };

  window.openTask = function openTaskLive(id) {
    const task = allTasks.find((item) => item.id === id);
    if (!task) return;
    const modal = document.getElementById('task-modal');
    document.getElementById('modal-content').innerHTML = `
      <div class="modal-kicker">${task.id} · ${task.inSprint ? escapeText(state.sprint?.name || 'Active sprint') : 'Product backlog'}</div>
      <h2 id="modal-title">${escapeText(task.title)}</h2>
      <p>${escapeText(task.description || 'No description')}</p>
      <div class="modal-details">
        <div class="modal-detail"><label>Owner</label><strong>${escapeText(task.owner)}</strong></div>
        <div class="modal-detail"><label>Estimate</label><strong>${task.points} story points</strong></div>
        <div class="modal-detail"><label>Priority</label><span class="priority ${task.priority.toLowerCase()}">${task.priority}</span></div>
        <div class="modal-detail"><label>DB id</label><strong>${task.dbId.slice(0, 8)}…</strong></div>
      </div>
      <div class="modal-status"><label for="live-status">Status</label>
        <select class="select" id="live-status" data-id="${task.id}" data-version="${task.version}">
          ${columns.map((column) => `<option ${task.status === column.name ? 'selected' : ''}>${column.name}</option>`).join('')}
        </select>
      </div>
      <p class="modal-footer">Saving calls POST /api/projects/${state.project.id}/items/move → rpc_move_work_item (optimistic version check).</p>`;
    modal.hidden = false;
    document.getElementById('live-status').focus();
  };

  /* ---------- events ---------- */
  document.addEventListener('change', (event) => {
    if (event.target.id !== 'live-status') return;
    const task = allTasks.find((item) => item.id === event.target.dataset.id);
    if (!task) return;
    const next = event.target.value;
    closeTask();
    if (next !== task.status) persistMove(task, next);
  });

  document.addEventListener('drop', (event) => {
    const column = event.target.closest('.kanban-col');
    if (!column) return;
    const id = event.dataTransfer?.getData('text/plain');
    const task = sprintTasks.find((item) => item.id === id);
    if (!task) return;
    task.status = column.dataset.column; // mockup already set this; force sync
    persistMove(task, column.dataset.column);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#live-create')) return;
    const modal = document.getElementById('task-modal');
    document.getElementById('modal-content').innerHTML = `
      <div class="modal-kicker">New work item</div>
      <h2 id="modal-title">Add to the product backlog</h2>
      <div class="modal-details" style="grid-template-columns:1fr">
        <div class="modal-detail"><label for="live-title">Title</label><input class="select" id="live-title" placeholder="Short, outcome-focused title" /></div>
        <div class="live-form-row">
          <div class="modal-detail"><label for="live-priority">Priority</label><select class="select" id="live-priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select></div>
          <div class="modal-detail"><label for="live-points">Points</label><select class="select" id="live-points"><option>1</option><option>2</option><option>3</option><option selected>5</option><option>8</option><option>13</option></select></div>
        </div>
      </div>
      <div class="modal-status"><button class="button button-primary" type="button" id="live-save">Create via API</button></div>
      <p class="modal-footer">POST /api/projects/${state.project.id}/items → rpc_create_work_item.</p>`;
    modal.hidden = false;
    document.getElementById('live-title').focus();
  });

  document.addEventListener('click', async (event) => {
    if (!event.target.closest('#live-save')) return;
    const title = document.getElementById('live-title').value.trim();
    if (!title) return flash('A title is required.');
    const button = event.target.closest('#live-save');
    button.disabled = true;
    try {
      await api(`/api/projects/${state.project.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: { text: '' },
          type: 'User Story',
          priority: document.getElementById('live-priority').value,
          estimate: Number(document.getElementById('live-points').value),
          sprintId: null,
        }),
      });
      closeTask();
      await loadWorkspace();
      flash(`Created “${title}” in the database.`);
    } catch (error) {
      button.disabled = false;
      flash(`Create failed: ${error.message}`);
    }
  });

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.id = 'live-create';
  fab.className = 'live-fab';
  fab.textContent = '+ New work item';
  document.body.append(fab);

  /* ---------- boot ---------- */
  const params = new URLSearchParams(location.search);
  if (params.get('screen') === 'login') {
    showLogin('Sign in to load the live workspace.');
  } else {
    fetch(API + '/api/projects', { credentials: 'same-origin' })
      .then((res) => {
        if (res.status === 401) {
          showLogin('Sign in as admin to view the live workspace.');
          return null;
        }
        return res.json();
      })
      .then((payload) => {
        if (!payload) return;
        if (!payload.data?.length) {
          showLogin('No projects visible for this account.');
          return;
        }
        loadWorkspace();
      })
      .catch(() => showLogin('Backend not reachable. Is `npm run dev` running?'));
  }
})();
