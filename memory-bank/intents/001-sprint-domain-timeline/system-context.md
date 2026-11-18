---
intent: 001-sprint-domain-timeline
phase: inception
status: context-defined
updated: '2026-11-18T15:52:35Z'
---

# Sprint domain and real-date timeline: system context

## Actors and flow

- Product Owner and Scrum Master plan and start sprints; team members inspect the board and analytics.
- Next.js sends authorized actions to the existing API and Supabase RPCs.
- PostgreSQL stores planned dates, actual start/completion instants, commitments, and append-only events.
- The workspace mapper returns plain JSON; the frontend hydrates domain classes for display and demo preflight.
- Planning, analytics, tables, and exports consume one derived timeline.

## Boundaries

1. Database RPCs own permissions, transitions, timestamps, and frozen results.
2. The backend workspace contract owns serialization of recorded time and timezone.
3. Frontend domain classes own read-side date projection and state-specific UI behavior.
4. Demo data is synthetic and generated with an injected clock.

## Risks

- Existing sprints may lack a reliable timezone snapshot or start instant.
- The Systems department branch is older than origin/main; code bolts must use current source when their owners execute them.
- Introducing classes into serialized React state would break persistence; instantiate them at the use boundary.
