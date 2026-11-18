---
id: 001-expose-actual-start
unit: 002-sprint-time-contract
intent: 001-sprint-domain-timeline
status: draft
priority: must
created: '2026-11-18T15:52:35Z'
assigned_bolt: 002-sprint-time-contract
implemented: false
---

# Story: expose actual sprint start

As an analytics reader, I want the recorded actual start instant returned with the sprint, so ideal progress begins when the sprint really started.

## Acceptance criteria

- [ ] The workspace mapper returns startedAt from persisted started_at as an ISO UTC instant.
- [ ] Planned or legacy rows without started_at return an explicit null or absent value.
- [ ] API contract tests cover active and completed sprints without changing existing start/end date fields.
- [ ] The implementation does not infer a start instant from planned dates or mutable work-item rows.
