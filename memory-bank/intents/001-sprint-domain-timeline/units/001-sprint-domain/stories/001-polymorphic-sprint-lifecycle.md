---
id: 001-polymorphic-sprint-lifecycle
unit: 001-sprint-domain
intent: 001-sprint-domain-timeline
status: draft
priority: must
created: '2026-11-18T15:52:35Z'
assigned_bolt: 001-sprint-domain
implemented: false
---

# Story: polymorphic sprint lifecycle

As a team member, I want each sprint state to expose its own valid actions and cutoff behavior through one Sprint interface, so planning and analytics behave consistently.

## Acceptance criteria

- [ ] Given a JSON sprint, the factory returns the matching planned, active, or completed subclass.
- [ ] Given a planned sprint, it has no actual-progress cutoff and only planning actions are available.
- [ ] Given an active sprint, the cutoff is the injected current instant and completion is available to authorized callers.
- [ ] Given a completed sprint, the cutoff is its recorded completion instant and mutating actions are unavailable.
- [ ] React state and API payloads remain plain JSON, with classes created only where domain behavior is needed.

## Constraints

The subclass methods are read-side or demo preflight rules. Database RPCs still enforce actual transitions and permissions.
