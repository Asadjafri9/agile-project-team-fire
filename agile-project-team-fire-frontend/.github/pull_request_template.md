## What and why
<!-- One or two sentences. Link the requirement ID(s), e.g. BOARD-03, and the ticket/issue. -->

Refs:

## Author
- Role: <!-- Frontend | Backend | CI/CD | Integration | Systems -->
- Agent: <!-- tool/role, e.g. claude-code/backend — or "human" -->
- Flow: `<head>` → `<base>` <!-- must be an allowed flow, AGENTS.md §1 -->

## Changes
-

## Contract impact
- [ ] None
- [ ] Additive only (new field / endpoint / error code)
- [ ] Breaking — `type:contract` issue: #

## Dependencies changed
<!-- package — old → new — reason. Write "None" if none. -->
None

## Issues raised while working
<!-- Cross-department findings filed under AGENTS.md §3. Write "None" if none. -->
None

## Checks
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` pass locally (once the scripts exist)
- [ ] Only my department's paths are touched (`scripts/branch-guard.sh <head> <base>` passes)
- [ ] No secrets, `.env` files or real user data
- [ ] Backend only: RLS on new tables, `SECURITY DEFINER` checks, pgTAP tests, regenerated types
- [ ] Docs/ADR updated if behaviour or architecture changed
