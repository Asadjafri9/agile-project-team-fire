# Integration log

One entry per merge into `agentic-integration` and per promotion to `testing` or `main`. Newest first. The Integration agent writes merge entries; the Systems Architect writes promotion entries. Pull-request history itself stays in GitHub; this log records outcomes.

## Entry template

```markdown
### YYYY-MM-DD — <source> → <target>
- Merge commit: <sha> · PR: #<n>
- Requested by: <human>
- Performed by: <tool>/<role>
- Checks: lint ✅/❌ · typecheck ✅/❌ · unit ✅/❌ · db ✅/❌ · e2e ✅/❌
- Conflicts resolved: <files, or "none">
- Issues raised: #<n>, …
- Issues verified closed: #<n>, …
- Promotion-ready: yes / no — <reason>
```

## Entries

### 2026-11-15 — Final integration: live backend, hosted deploy
- Branch: `claude/awesome-archimedes-4kwt6b` (department branches do not exist on the remote; integration ran on one task branch at the Systems Architect's request).
- Requested by: Systems Architect · Performed by: claude-code/integration, with opencode-deepseek subagents for the frontend live mode and unit tests (reviewed before commit).
- **Governance override (recorded):** the Systems Architect directed the integrator to fix department logic directly and to apply migrations to the hosted Supabase project, both normally reserved (AGENTS.md §3, §4, §5.4). Done for the 2026-11-15 submission deadline.
- Checks: typecheck ✅ · unit ✅ (34) · db ✅ (24 RPC permission checks, local Postgres 16) · e2e ✅ (35 auth/RBAC checks against a real Supabase Auth v2.170 + PostgREST v12 stack) · production build ✅ · browser smoke on production ✅.
- Defects found and fixed:
  - Four tables (status history, commitments, scope events, revisions) had RLS disabled: readable and writable with the public key. Now RLS-enabled, read by members only.
  - `SECURITY DEFINER` functions had no `search_path`, membership or role checks; `rpc_create_project` trusted a caller-supplied owner. Replaced with role-checked RPCs (`tf_require_role`).
  - `rpc_start_sprint` inserted commitment rows with `sprint_id` and `work_item_id` swapped.
  - API routes wrote directly to tables whose writes were revoked, or called RPCs that did not exist (`rpc_complete_sprint`, `rpc_accept_invitation`).
  - Server Supabase client overwrote its own `Set-Cookie` headers, dropping chunked sessions.
  - Login returned raw access/refresh tokens in the JSON body.
  - `/api/health` read an RLS-locked table as anon and could never report healthy.
- Not delivered (routes answer `501`): invitations (PROJ-02), member role changes/removal (PROJ-03), project and item archiving (PROJ-05, ITEM-01 archive), attachments (REL-02), PDF export (REL-01; CSV export exists), evidence index persistence.
- Known limitation: mid-sprint scope changes made from the planning view record the reason "Changed during sprint planning"; the UI does not yet prompt for a reason (SPR-05).
- Deployment: Vercel project `team-fire-agile` (team `net-naut`) → https://team-fire-agile.vercel.app.

### 2026-10-21 — Governance bootstrap
- Created `systems`, `agentic-integration`, `testing`, `backend` from the governance bootstrap commit.
- Joined the existing `frontend` branch (unrelated history, `dashboard-mockup/` only) to the shared history with a non-destructive merge; no frontend commits were rewritten.
- `main` is unchanged until the Systems Architect merges the bootstrap PR from `testing`.
