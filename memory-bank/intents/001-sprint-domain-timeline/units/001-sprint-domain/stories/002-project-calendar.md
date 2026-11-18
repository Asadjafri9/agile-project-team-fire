---
id: 002-project-calendar
unit: 001-sprint-domain
intent: 001-sprint-domain-timeline
status: draft
priority: must
created: '2026-11-18T15:52:35Z'
assigned_bolt: 001-sprint-domain
implemented: false
---

# Story: project-local calendar

As a planner, I want sprint dates interpreted in the sprint timezone, so day counts and cutoffs are stable across midnight and daylight-saving changes.

## Acceptance criteria

- [ ] Date-only planned start/end values are validated, and end follows start.
- [ ] The calendar maps UTC instants to local dates and enumerates inclusive local calendar days.
- [ ] Karachi midnight and New York daylight-saving cases have deterministic tests.
- [ ] Recent issue 13 validation for invalid ranges and non-negative capacities remains intact.
- [ ] No production timeline function relies on the sample-data anchor date.
