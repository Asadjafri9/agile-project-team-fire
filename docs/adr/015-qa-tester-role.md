# ADR-015 — QA Tester role

Status: Accepted · Date: 2026-11-24 · Decider: Systems Architect · Amends: requirements §3

## Context
The four Scrum roles (Product Owner, Scrum Master, Developer, Viewer) left testers either over-privileged (Scrum Master) or unable to work (Viewer). The team has dedicated QA members.

## Decision
Add **QA Tester** as a fifth project role with Developer-level working rights:

| Capability | QA Tester |
| --- | --- |
| Read project, board, metrics, comments, attachments; download summaries | Yes |
| Create/edit work items (e.g. bugs), criteria, subtasks, estimates | Yes |
| Move cards, assign members, comment, mention, attach files | Yes |
| Record delivery evidence | Yes |
| Set priority, reorder backlog, plan/start/complete sprints, WIP, team management, archiving | No |

Implementation is central: `tf_require_role` treats QA Tester as Developer when checking allowed roles, so every RPC that admits Developers admits QA Testers and no other rule changes. QA Tester can be assigned, invited and granted by invite links (migration `20261124010000_qa_tester_role.sql`).

## Consequences
- Existing roles' permissions are unchanged.
- If testers later need different rights from developers (e.g. only QA may move cards to Done), the mapping in `tf_require_role` is the single place to change.
