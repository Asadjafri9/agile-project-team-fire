# Workspace API contract

Backend-owned. The React workspace talks to the database only through these routes. All authorization lives in SQL (RLS for reads, role-checked `SECURITY DEFINER` RPCs for writes); the API layer only translates.

## Session

| Route | Body | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/auth/login` | `{ username, password }` | `200 { user: { id, username, name } }` + session cookies | `400` missing fields · `401 Invalid credentials` (same for unknown user, wrong password, disabled account) |
| `POST /api/auth/logout` | — | `200` and cookies cleared | — |
| `POST /api/auth/change-password` | `{ currentPassword, newPassword }` | `200` | `400`, `401` |

Usernames are trimmed and lower-cased and map to `<username>@accounts.team-fire.invalid` in Supabase Auth. Public signup is disabled; accounts are provisioned by operators (AUTH-03).

## Read: `GET /api/workspace`

Returns everything the signed-in user may see, in the `DemoState` shape from `src/features/demo/model.ts`:

```json
{ "user": { "id", "username", "name", "initials" },
  "roles": { "<projectId>": "Product Owner | Scrum Master | Developer | Viewer" },
  "revisions": { "<projectId>": 12 },
  "state": { "version": 1, "entered": true, "role": "...", "projects": [ ... ] } }
```

`events` are replayed from `sprint_scope_events` and `work_item_status_history` (MET-01). The UI polls this every 4 s and replaces state when a `revisions` value changes (BOARD-04).

## Recorded sprint timing (Bolt 002 / FR-3)

Each sprint adds `startedAt: string | null` and `timezone: string | null`.
`startedAt` normalizes persisted `sprints.started_at` to a UTC ISO instant. Missing
values remain null, including legacy active/completed rows. Planned start/end dates
and completed-result cutoffs retain their existing meaning. No start is inferred
from planned dates or work-item history.

`timezone` maps `sprints.timezone_snapshot`. Capture the project IANA timezone when
the start RPC acquires the project/sprint locks and commits the actual start.
Planned rows have no snapshot. Later project timezone changes do not change the
snapshot, and the database rejects attempts to rewrite a recorded snapshot.
Existing started/completed rows are backfilled with their project timezone at
migration time. This is an explicit approximation because earlier timezone history
cannot be recovered. Missing `started_at` values remain missing after backfill.
The mapper tolerates an unapplied migration by returning null for the new field.

The start RPC rejects starts at or after the planned end's local-date boundary,
retaining goal, date range, estimates, membership, role, version and one-active-sprint
checks. SQL remains authoritative. Bolt 003 will consume these additive fields in
the frontend, charts, tables and exports. This bolt does not change the frontend model.

The timezone decision is proposed for Systems review and an architecture decision
record before promotion. The migration is supplied for local review only.
Applying it to any hosted database requires a separately authorized deployment.

## Write: `POST /api/actions`

Body `{ action }`, where `action` is one member of the `Action` union in `src/features/demo/store.tsx`.

| Action | RPC | Allowed roles |
| --- | --- | --- |
| `create-project` | `rpc_create_project` | any signed-in account (becomes Product Owner) |
| `create-sprint`, `sprint`, `start`, `complete`, `allocate` | `rpc_create_sprint`, `rpc_update_sprint`, `rpc_start_sprint`, `rpc_complete_sprint`, `rpc_allocate_item` | Product Owner, Scrum Master |
| `prioritize` | `rpc_reorder_backlog` | Product Owner |
| `create-item`, `update-item`, `check`, `move` | `rpc_create_work_item`, `rpc_update_work_item`, `rpc_toggle_checklist`, `rpc_move_work_item` | Product Owner, Scrum Master, Developer |

Viewers can read but never write. Error mapping:

| SQLSTATE | HTTP | Meaning |
| --- | --- | --- |
| `28000` | 401 | not signed in / account disabled |
| `42501` | 403 | not a member, or role not permitted |
| `P0002` | 404 | item or sprint not found (or not visible) |
| `40001` | 409 | stale version |
| `22023` | 422 | business rule (estimate locked, second active sprint, open checklist, …) |

## Tests

- `supabase/tests/rpc_security.test.sql` — permission and lifecycle checks per role (psql).
- `tests/e2e/rbac-api.mjs` — signs in as every role against a running site: `BASE_URL=… DEMO_PASSWORD=… node tests/e2e/rbac-api.mjs`.
- `src/lib/workspace/server.test.ts` — mapper and error-mapping unit tests (`pnpm test`).
