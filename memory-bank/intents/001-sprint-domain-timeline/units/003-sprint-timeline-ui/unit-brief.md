---
unit: 003-sprint-timeline-ui
intent: 001-sprint-domain-timeline
unit_type: frontend
default_bolt_type: simple-construction-bolt
phase: inception
status: draft
created: '2026-11-18T15:52:35Z'
updated: '2026-11-18T15:52:35Z'
---

# Unit brief: sprint timeline UI

## Purpose

Present one real-date sprint timeline across planning, charts, accessible tables, exports, and demo data.

## Scope

- FR-4: connect domain lifecycle and calendar behavior to daily metric samples and visible planned/actual dates.
- FR-5: keep charts, tables, CSV, and PDF aligned and constrain relative-date rebasing to demo fixtures.
- Preserve current empty states, partial-today label, and overrun visibility.

## Stories

- 001-render-real-date-timeline
- 002-align-exports-and-demo

## Dependencies and target

Requires 001-sprint-domain and 002-sprint-time-contract. Frontend-owned candidate paths: src/features/demo/metrics.ts, src/features/demo/model.ts, src/components/workspace-planning.tsx, and src/components/workspace-analytics.tsx.

## Success criteria

One fixture yields the same cutoff, values, and date labels in every display and export. Completed results remain frozen after later item edits.
