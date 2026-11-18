---
id: 002-sprint-time-contract
unit: 002-sprint-time-contract
intent: 001-sprint-domain-timeline
type: ddd-construction-bolt
status: planned
stories:
  - 001-expose-actual-start
  - 002-timezone-snapshot-and-guards
created: '2026-11-18T15:52:35Z'
started: null
completed: null
current_stage: null
stages_completed: []
requires_bolts: []
enables_bolts:
  - 003-sprint-timeline-ui
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 2
---

# Bolt 002: Recorded sprint time contract

## Objective

Expose the persisted actual start instant and settle the timezone snapshot contract. Preserve database lifecycle, permission, and date guards, using an additive migration only if the snapshot decision requires it.

## Planned stages

- [ ] Domain Model: sprint schedule, actual instant, timezone ownership, and legacy-row semantics.
- [ ] Technical Design: workspace JSON fields, migration/backfill approach, and database test cases.
- [ ] ADR Analysis: record a consequential timezone-history decision through Systems ownership.
- [ ] Implement: Backend-owned mapper, migration, and RPC changes on a Backend task branch.
- [ ] Test: API mapping, local-midnight guard, legacy rows, role checks, and one-active-sprint invariant.

## Success criteria

- [ ] startedAt is sourced from started_at and is absent or null when not recorded.
- [ ] Historical timezone behavior is explicit and reproducible.
- [ ] SQL remains the final authority for starts and completions.
- [ ] No hosted migration is applied by this bolt without the separate human gate.

## Push target

The planned bolt record belongs on the Systems planning branch. Future code belongs on an owning Backend task branch.
