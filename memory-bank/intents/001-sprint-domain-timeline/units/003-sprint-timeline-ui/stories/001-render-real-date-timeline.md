---
id: 001-render-real-date-timeline
unit: 003-sprint-timeline-ui
intent: 001-sprint-domain-timeline
status: draft
priority: must
created: '2026-11-18T15:52:35Z'
assigned_bolt: 003-sprint-timeline-ui
implemented: false
---

# Story: render a real-date sprint timeline

As a team member, I want planned and actual sprint dates distinguished on the analytics view, so I can interpret a late start or overrun correctly.

## Acceptance criteria

- [ ] The ideal line begins at original commitment on actual start and reaches zero at planned end.
- [ ] Active actual samples stop at now, mark today partial, and continue through overrun days.
- [ ] Completed actual samples stop at the frozen completion cutoff; planned sprints show no invented actual metrics.
- [ ] The planning view and chart labels show the project-local timezone and date range.
- [ ] Existing status and scope event replay remains authoritative for metric values.
