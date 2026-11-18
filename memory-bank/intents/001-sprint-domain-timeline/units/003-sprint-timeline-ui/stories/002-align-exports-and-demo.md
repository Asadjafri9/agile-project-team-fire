---
id: 002-align-exports-and-demo
unit: 003-sprint-timeline-ui
intent: 001-sprint-domain-timeline
status: draft
priority: must
created: '2026-11-18T15:52:35Z'
assigned_bolt: 003-sprint-timeline-ui
implemented: false
---

# Story: align exports and demo fixtures

As an assessor, I want the chart, accessible table, CSV, and PDF to agree, so a sprint report is reproducible.

## Acceptance criteria

- [ ] All outputs use the same timeline samples, timezone, scope, and cutoff.
- [ ] Completed-sprint exports remain unchanged after later edits to item rows.
- [ ] Demo fixture rebasing receives an injected clock and keeps actual start/completion instants aligned with planned dates.
- [ ] Tests cover late start, early completion, overrun, Karachi midnight, New York daylight-saving change, and a missing legacy start.
