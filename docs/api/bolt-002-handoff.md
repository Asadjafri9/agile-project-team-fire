# Bolt 002 local implementation handoff

Requirement FR-3 in the Sprint domain and real-date timeline intent. Prepared for
Shaheer Khurrum on the local branch `be/spr-02-sprint-time-contract`.

## Baseline and scope

The working copy started clean at `594bc34`, the current public `main` baseline.
Remote refs were fetched before editing. The Backend department ref is an ancestor
of this baseline, so merging it locally was already up to date. Fasih's Bolt 001 was merged through PR #15 into the Frontend department branch.
It adds four files under `src/features/demo/domain/`; none are copied into
this Backend change. Bolt 001 is still absent from main, testing and agentic-integration.
Bolt 002's unit brief explicitly permits independent work.
Bolt 003 requires both bolts.

Backend changes add the recorded start and timezone to workspace JSON, supply an
additive migration, and test the database invariants. Existing migrations and all
Frontend files remain unchanged. No dependency versions change.

## Domain model and technical design

- Planned dates remain local date-only values. Actual start remains an absolute
  persisted instant and is normalized to ISO UTC in JSON.
- Capture the project's IANA timezone when starting, in the same transaction as
  the commitment and actual timestamp. Keep planned snapshots null.
- Freeze snapshots after recording. A database trigger rejects later rewrites.
- Backfill already-started/completed rows from their current project timezone.
  Earlier timezone history is unknown, so this is an approximation, not recovery.
  Never synthesize a missing actual start.
- Reject starting on the planned end date, using the project's local date. Keep
  membership, role, version, nonempty goal/items, estimation and single-active
  sprint checks. The captured actual instant also drives the boundary comparison.
- Keep completed-result cutoffs and completion RPC behavior unchanged.

## Systems decision for review

This is the proposed timezone-history decision for the Systems owner to review
and record in an ADR before promotion. Capture-at-start is chosen because planned
work can follow current settings, while an executing or completed commitment must
retain its reporting timezone. Review this contract together with Bolt 003.
No Systems-owned governance or ADR file is edited by this Backend branch.

## Verification

Run under Node 24 with the committed pnpm lockfile:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

The new mapper cases cover active/completed ISO conversion, a changed project
timezone, and null timing across planned, active and completed legacy rows.
Run the database checks on a disposable local Supabase database after migrations:

```powershell
psql "$env:LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sprint_time_contract.test.sql
```

The SQL suite creates synthetic fixtures inside one rollback transaction and
tests role denials, local date boundaries, rejected starts, version conflicts,
frozen commitment, one-active-sprint behavior, snapshot immutability and completion.
It requires a database administrator connection to create test accounts.
The local verification used PostgreSQL 18 with minimal Auth and Storage scaffolding,
the project's actual migrations, and real authenticated/anonymous database roles.
It exercises real SQL and RLS, but is not a hosted Supabase end-to-end run.

## Local verification results

- Node 24 runtime and pnpm 12.14.0, frozen lockfile installation.
- Recheck: 54 automated tests passed across the Backend working copy's three test files.
- Compatibility check: 61 tests across four files and the TypeScript check passed
  in a separate scratch copy combining merged Bolt 001 with local Bolt 002.
- TypeScript check passed.
- Production build passed, including compilation and page generation.
- 24 SQL assertions passed on disposable PostgreSQL 18.
- A separate pre-migration fixture check passed for legacy backfill, retained
  actual instants, missing start values and null planned snapshots.
- Backend branch/path guard passed against the current main baseline.
  This does not certify a PR against the stale Backend department ref.
- No lint script exists in the project package; no lint gate was disabled.

## Merge and integration notes

The team must synchronize the stale `backend` department branch with the current
application baseline before this main-based task branch is proposed into it.
Otherwise the PR includes unrelated baseline files and the ownership guard can
fail. Bolt 001's Frontend merge does not synchronize Backend automatically.

Bolt 003 should add the additive fields to its Frontend Sprint model, consume
`startedAt` and the frozen `timezone`, and handle null legacy values explicitly.
Charts do not consume these fields until that integration.

No commit, push, pull request, hosted migration or deployment is performed by this
local implementation. The report should be updated after the team records the
actual review, merge and integration results.
