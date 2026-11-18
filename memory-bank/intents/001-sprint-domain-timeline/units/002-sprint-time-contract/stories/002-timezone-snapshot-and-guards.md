---
id: 002-timezone-snapshot-and-guards
unit: 002-sprint-time-contract
intent: 001-sprint-domain-timeline
status: draft
priority: should
created: '2026-11-18T15:52:35Z'
assigned_bolt: 002-sprint-time-contract
implemented: false
---

# Story: timezone snapshot and date guards

As a project owner, I want historical sprint dates to retain their original timezone interpretation, so later project settings cannot redraw frozen results.

## Acceptance criteria

- [ ] A documented decision establishes when a sprint timezone is captured.
- [ ] If required, a forward-only migration stores and exposes that timezone, with a disclosed backfill assumption for legacy rows.
- [ ] Starting at or after the effective planned end is rejected in the database, alongside existing goal, estimate, role, and one-active-sprint checks.
- [ ] Database tests cover a local-midnight boundary and an expired or invalid start.

## Gate

The migration may be committed on a Backend task branch; applying it to hosted staging or production requires the existing human approval.
