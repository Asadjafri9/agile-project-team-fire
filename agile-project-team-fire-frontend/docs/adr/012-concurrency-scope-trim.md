# ADR-012 — Trim the concurrency design for the semester build

Status: Proposed · Date: 2026-10-21 · Decider: Systems Architect · Amends: architecture.md §6, requirements CON-02

## Context
`architecture.md` §6 specifies a complete concurrency protocol: idempotency receipts, per-list revision counters, per-view revision counters, and a documented global lock order across project, sprint, membership, receipt, ordering, item, child and counter rows. At the stated load (about 20 users, course demo) most of this exists to handle edge cases the team must still build, test and explain at the defence. It also enlarges the riskiest code surface: privileged `SECURITY DEFINER` database functions.

## Decision
**Keep (Increments 1–3):**
- RLS (Row Level Security) on every exposed table; SQL RPC (Remote Procedure Call) functions as the only write path.
- Integer `version` on editable rows; a stale version returns `409 CONFLICT` (CON-01).
- Append-only status, estimate and scope history written in the same transaction (ITEM-07, MET-01).
- Partial unique index for one active sprint; atomic start and complete with a row lock on the sprint (SPR-04, SPR-06, SPR-07).
- Per-project event sequence for metric replay (requirements §5 rule 9).
- One simple `board_revision` integer per project, bumped on board-affecting writes, for the roughly three-second poll (BOARD-04).

**Simplified:**
- Lock order: lock the project row, then the sprint row if one is involved, then work items sorted by ID. Nothing more granular.
- Backlog reorder: lock the project row and renumber within one short transaction, instead of separate `list_revisions` scopes.

**Deferred to Increment 4 (stretch, only if time allows):**
- `mutation_receipts` and payload-hash idempotency (CON-02). Until then, the UI disables a button while its request is in flight, and lifecycle operations (start/complete sprint) rely on the state check (`PLANNED` → `ACTIVE` only once) for duplicate safety.
- `project_view_versions` and `list_revisions` tables.

## Consequences
- Fewer tables and functions; the remaining design can be explained in a viva.
- A network retry of a non-lifecycle write could, in rare cases, apply twice. This is accepted for the course scope and noted as a known limitation in the final report.
- Increment 4 can add receipts without schema rewrites, because every write already goes through an RPC.
