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
- Second pass (same day): delivered invitations (PROJ-02), role change/removal/leave/ownership transfer (PROJ-03), project archive (PROJ-05), item archive with scope event (ITEM-01, ITEM-08), checklist editing (ITEM-03), WIP configuration (BOARD-05), comments, mentions, notifications and moderation (COL-03, COL-04), per-item activity (COL-05), attachments in a private bucket (REL-02), evidence, CSV/PDF sprint summaries (REL-01), scope-change reasons (SPR-05), carry-over target (SPR-06), change-password screen and operator account tooling (AUTH-03).
- Fixed in the second pass: priority could be changed by Developers and Scrum Masters (§3 says Product Owner only); analytics compared event times as strings across UTC offsets, putting events on the wrong day; item points/assignee/title could not be edited after creation, so unestimated items made sprints unstartable; project timezone was hard-coded at creation; the orphaned `public/app` dashboard was still deployed with hard-coded `admin` / `Password123!` and wrote through legacy endpoints — removed.
- Collaboration e2e (`tests/e2e/collab-api.mjs`): 69/69 against the local Supabase stack in destructive mode.
- Still not built: rich-text descriptions (ITEM-02, plain text today), URL-reflected filters (COL-01), PO-managed epic/label taxonomy (COL-02; free-text epics and labels today), comment edit history beyond the edit timestamp.
- Deployment: Vercel project `team-fire-agile` (team `net-naut`) → https://team-fire-agile.vercel.app.
- Hosted Supabase (`agile-fire`, ap-northeast-2, Postgres 17): 4 migrations applied via `scripts/apply-hosted.mjs`, demo seed loaded, public signup disabled, 0 public tables without RLS.
- Pre-existing hosted fault fixed: the Data API had no exposed schemas (`db_schema` empty), so PostgREST was unhealthy and every REST call returned `PGRST002`. Restored to `public,graphql_public`.
- Performance: functions pinned to `icn1` (same region as the database) and the middleware no longer re-validates API requests; `GET /api/workspace` went from ~2.7 s to ~0.4–0.8 s.
- Production verification: 35/35 auth + RBAC checks (`tests/e2e/rbac-api.mjs`); direct calls with the publishable key are refused for every table and RPC, and signup returns `signup_disabled`; browser run clean.
- Supabase security advisor: 12 `authenticated_security_definer_function_executable` warnings are by design (RPCs are the only write path and check identity, role and project internally); `auth_leaked_password_protection` needs a paid plan.

### 2026-10-21 — Governance bootstrap
- Created `systems`, `agentic-integration`, `testing`, `backend` from the governance bootstrap commit.
- Joined the existing `frontend` branch (unrelated history, `dashboard-mockup/` only) to the shared history with a non-destructive merge; no frontend commits were rewritten.
- `main` is unchanged until the Systems Architect merges the bootstrap PR from `testing`.
