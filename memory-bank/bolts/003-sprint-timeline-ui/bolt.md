---
id: 003-sprint-timeline-ui
unit: 003-sprint-timeline-ui
intent: 001-sprint-domain-timeline
type: simple-construction-bolt
status: planned
stories:
  - 001-render-real-date-timeline
  - 002-align-exports-and-demo
created: '2026-11-18T15:52:35Z'
started: null
completed: null
current_stage: null
stages_completed: []
requires_bolts:
  - 001-sprint-domain
  - 002-sprint-time-contract
enables_bolts: []
requires_units:
  - 001-sprint-domain
  - 002-sprint-time-contract
blocks: true
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 3
---

# Bolt 003: Real-date timeline integration

## Objective

Use the domain classes and recorded timing contract in planning and analytics, then align chart, table, CSV, PDF, and demo fixture dates.

## Planned stages

- [ ] Plan: UI data flow, timeline labels, empty/partial states, and regression cases.
- [ ] Implement: Frontend-owned planning, analytics, metrics, and fixture integration.
- [ ] Test: cross-output equality and late start, early completion, overrun, DST, and legacy-null cases.

## Success criteria

- [ ] Ideal progress follows actual start to planned end.
- [ ] Real progress ends at now or frozen completion, with visible timezone and partial-today label.
- [ ] Chart, table, CSV, and PDF use the same dataset.
- [ ] The demo clock remains injectable and production views use persisted data.

## Push target

The planned bolt record belongs on the Systems planning branch. Future code belongs on an owning Frontend task branch after bolts 001 and 002 complete.
