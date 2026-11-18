---
id: 001-sprint-domain
unit: 001-sprint-domain
intent: 001-sprint-domain-timeline
type: ddd-construction-bolt
status: planned
stories:
  - 001-polymorphic-sprint-lifecycle
  - 002-project-calendar
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
  max_dependencies: 1
  testing_scope: 2
---

# Bolt 001: Sprint domain hierarchy

## Objective

Model common sprint behavior through an abstract base class and planned, active, and completed subclasses. Add a timezone-aware ProjectCalendar and a factory that hydrates classes from serializable JSON.

## Planned stages

- [ ] Domain Model: class hierarchy, value objects, state transition vocabulary, and invariants.
- [ ] Technical Design: factory boundary, method contracts, test fixtures, and integration surface.
- [ ] ADR Analysis: decide whether the class boundary requires a Systems-owned ADR before code.
- [ ] Implement: Frontend-owned domain code only, on a Frontend task branch.
- [ ] Test: lifecycle polymorphism, JSON round-trip, date range, midnight, and DST.

## Success criteria

- [ ] All three subclasses answer the same action and timeline queries through the base interface.
- [ ] Browser storage and API payloads remain plain JSON.
- [ ] Existing sprint-date validation from issue 13 still passes.
- [ ] Human checkpoints from the DDD bolt definition are completed before implementation.

## Push target

The planned bolt record belongs on the Systems planning branch. Future code belongs on an owning Frontend task branch; no application code is included in this plan.
