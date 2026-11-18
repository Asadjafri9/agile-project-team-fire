---
unit: 002-sprint-time-contract
intent: 001-sprint-domain-timeline
unit_type: backend
default_bolt_type: ddd-construction-bolt
phase: inception
status: draft
created: '2026-11-18T15:52:35Z'
updated: '2026-11-18T15:52:35Z'
---

# Unit brief: sprint time contract

## Purpose

Supply recorded sprint timing to clients without weakening the database authority for lifecycle or membership.

## Scope

- FR-3: expose persisted started_at as startedAt in the workspace JSON.
- Decide and, if accepted, add a per-sprint IANA timezone snapshot through a forward-only Supabase migration.
- Check start-time guards against the project-local planned end and preserve existing atomic transition checks.
- Test existing rows and missing timing fields explicitly.

## Stories

- 001-expose-actual-start
- 002-timezone-snapshot-and-guards

## Dependencies and target

Independent of the Frontend domain unit. Backend-owned candidate paths: src/lib/workspace/server.js, supabase/migrations, and database tests. Applying any migration to a hosted project remains a human gate.

## Success criteria

The JSON contract carries actual timing with documented null behavior, and database tests retain role, timezone, and date safeguards.
