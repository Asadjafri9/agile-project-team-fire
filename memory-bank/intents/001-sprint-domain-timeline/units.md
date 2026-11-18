---
intent: 001-sprint-domain-timeline
phase: inception
status: units-decomposed
updated: '2026-11-18T15:52:35Z'
---

# Sprint domain and real-date timeline: units

## 001-sprint-domain

Owner: Frontend. Assigned FR-1 and FR-2. Deliver an abstract Sprint class, PlannedSprint, ActiveSprint, CompletedSprint, a factory, and a ProjectCalendar value object. This unit can be developed against fixture DTOs.

## 002-sprint-time-contract

Owner: Backend. Assigned FR-3. Deliver the actual-start mapping, timezone snapshot decision/migration if approved, and database contract tests. This unit can proceed independently of 001.

## 003-sprint-timeline-ui

Owner: Frontend. Assigned FR-4 and FR-5. Connect the two earlier units to planning, analytics, tables, exports, and demo fixtures.

## Dependency order

- 001 and 002 are independent and may be reviewed separately.
- 003 requires both 001 and 002.
- Each code unit is committed only on its owning department's task branch. This Systems branch carries the shared Inception records.
