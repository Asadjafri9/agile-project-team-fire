---
intent: 001-sprint-domain-timeline
phase: inception
status: draft
created: '2026-11-18T15:52:35Z'
updated: '2026-11-18T15:52:35Z'
---

# Requirements: Sprint domain and real-date timeline

## Intent overview

Give sprint lifecycle and timeline behavior explicit domain classes, with meaningful inheritance and polymorphism. Derive progress from recorded dates and events in the sprint timezone. This is a brownfield change planned against origin/main at fd76446, including the recent sprint-date validation fix in issue 13.

## Goals

- Make planned, active, and completed sprint behavior testable through one domain interface.
- Show actual progress from the recorded start instant through the live or completed cutoff.
- Keep planning, charts, data tables, and exports consistent without changing authorization boundaries.

## Functional requirements

### FR-1: Polymorphic sprint lifecycle
An abstract Sprint domain class defines common schedule and commitment behavior. PlannedSprint, ActiveSprint, and CompletedSprint supply state-specific available actions and timeline cutoffs. A factory hydrates these classes from the existing JSON sprint contract. Callers do not need lifecycle-state branching for these behaviors.

### FR-2: Project-local calendar
A ProjectCalendar value object validates date-only planned start and end values, uses an IANA timezone, enumerates local calendar days, and converts UTC instants to local dates. It preserves the date-range behavior from issue 13. Calendar days include weekends.

### FR-3: Recorded time contract
The workspace response exposes the already-persisted actual start instant. A forward-only migration may add a per-sprint timezone snapshot so later project timezone edits do not change historical charts. The database remains authoritative for transition, role, and date guards. Missing legacy start times are identified rather than silently invented.

### FR-4: Timeline and presentation
The ideal line starts at original commitment at the actual start and reaches zero at the planned end. Actual daily samples use event cutoffs at project-local day boundaries. Active sprints extend through now with today marked partial; completed sprints end at their frozen cutoff; overruns remain visible. Planned sprints show their schedule without invented actual progress.

### FR-5: Shared analytics dataset and demo fixtures
Planning, charts, accessible data tables, CSV, and PDF use the same timeline semantics. Demo fixtures can rebase around an injected clock, while production timeline calculations use persisted dates and instants.

## Non-functional requirements

- Keep API and browser-storage values as serializable JSON; hydrate classes at the domain boundary.
- Preserve the existing SQL RPC and row-level-security write boundary.
- Cover Asia/Karachi midnight, America/New_York daylight-saving transitions, late starts, early and late completion, and historical immutability.
- Keep generation of a typical sprint timeline bounded by the date range and event count; do not require a new runtime dependency.

## Constraints and open decision

- Frontend owns sprint domain projections and UI under src/features/demo and src/components. Backend owns src/lib/workspace and supabase migrations. Systems owns architecture records.
- A domain class can supply UI preflight behavior but cannot replace SQL authorization or transactional invariants.
- A timezone snapshot needs an explicit migration and a documented backfill limitation for older sprints.
- Inception artifacts require review before Construction starts. No hosted migration or deployment is authorized by this plan.

## Traceability

Existing project requirements: SPR-01, SPR-04, SPR-06, MET-01, MET-02, MET-04, MET-05, and the metric/time rules in requirements.md section 5.
