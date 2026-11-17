# Data Stack

## Overview

Supabase PostgreSQL is the source of truth for project data; Supabase Auth owns credentials, and private Storage holds files. Read [architecture.md](../../architecture.md) and [requirements.md](../../requirements.md) before changing data behavior.

## Database

- Use PostgreSQL transactions, constraints, row level security, and project scoped records.
- Use forward-only Supabase CLI migrations. Never edit an already merged migration or change a hosted database without the human gate in [AGENTS.md](../../AGENTS.md).
- Record history and sprint snapshots in the same transaction as the business change that produces them.

## Database client

Use `@supabase/supabase-js` and `@supabase/ssr` with the end user's identity. Domain writes go through role checked SQL RPC functions; reads are protected by row level security and server side membership checks. No ORM migrations or service role key in request handling.

## Decision relationships

Backend contracts and generated database types must stay aligned with migrations. The application cannot replace database permission checks with hidden UI controls.
