---
unit: 001-sprint-domain
intent: 001-sprint-domain-timeline
unit_type: frontend
default_bolt_type: ddd-construction-bolt
phase: inception
status: draft
created: '2026-11-18T15:52:35Z'
updated: '2026-11-18T15:52:35Z'
---

# Unit brief: sprint domain

## Purpose

Centralize sprint lifecycle and project-local calendar behavior in testable TypeScript classes. This Frontend-owned domain projection supports both demo and live rendering; SQL remains authoritative for writes.

## Scope

- FR-1: abstract Sprint, PlannedSprint, ActiveSprint, CompletedSprint, and a JSON-to-domain factory.
- FR-2: ProjectCalendar with strict local-date and IANA-timezone handling.
- Keep existing JSON Sprint DTOs serializable and compatible with browser persistence.
- Preserve the date-range validation behavior from issue 13.

## Stories

- 001-polymorphic-sprint-lifecycle
- 002-project-calendar

## Dependencies and target

No code-unit dependency. Intended Frontend task branch based on current frontend source, with an integration path agreed before Construction. Candidate paths: src/features/demo/model.ts and a new src/features/demo/domain directory. Architecture-record changes belong to Systems.

## Success criteria

All three lifecycle subclasses respond through the same interface, date conversion is deterministic under an injected clock, and focused tests pass without a new runtime dependency.
