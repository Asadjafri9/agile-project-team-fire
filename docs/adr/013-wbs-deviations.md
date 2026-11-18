# ADR-013 — Recorded deviations from the WBS

Status: Proposed — confirm with the course instructor · Date: 2026-10-21 · Decider: Systems Architect

## Context
The assessed WBS (Work Breakdown Structure, 8 September 2026) lists deliverables that the planning documents changed. Assessors grade against the WBS, so every change must be visible and justified.

## Decisions

| WBS item | WBS says | We deliver | Reason |
| --- | --- | --- | --- |
| 4.1 | Registration, login, session handling, logout | **Superseded by [ADR-014](014-public-signup.md): registration is now delivered.** Originally: login, session handling, logout, change password; accounts provisioned by an operator. | ID/password scope with no email service (no SMTP — mail server — dependency on the free plan); a private course audience. Public registration can be added later without schema changes. |
| 4.4 | Work item create, read, update, **delete** | Create, read, update, **archive** (soft delete) | Deleting items would destroy the status history that burndown, velocity and CFD (Cumulative Flow Diagram) depend on, and the assessed sprint evidence (requirements ITEM-08, MET-01). |

## Consequences
- The final report and the defence must name both deviations and their reasons.
- If the instructor requires literal registration or hard delete, registration is added behind an operator-controlled toggle, and delete is offered only for items that never entered a sprint.
