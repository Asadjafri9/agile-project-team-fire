# API contract changelog

Backend-owned. Every breaking change to a route, response shape, Zod schema, error code or generated type gets one line here, in the same PR, linked to its `type:contract` issue. Newest first.

| Date | Change | Breaking? | Issue | Frontend action |
| --- | --- | --- | --- | --- |
| 2026-11-15 | Added `GET /api/workspace` (DemoState snapshot) and `POST /api/actions` (one UI action → one RPC). See `docs/api/workspace.md`. | No (additive) | — | Live mode uses these |
| 2026-11-15 | RPC signatures changed: `rpc_create_project` no longer takes `p_owner_id`; `rpc_create_work_item` drops description/sprint params; `rpc_move_work_item` drops `p_new_position`. Legacy routes updated. | Yes | — | None (UI uses `/api/actions`) |
| 2026-11-15 | `POST /api/auth/login` returns `{ user }` only; tokens travel in cookies. | Yes | — | None |
| 2026-11-15 | Invitations, member edits, archiving and attachments routes return `501` until delivered. | Yes | — | Do not call |
