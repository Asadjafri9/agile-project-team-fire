# System Architecture

## Overview

The accepted [architecture](../../architecture.md) defines a single Next.js application backed by Supabase. [ADR-011](../../docs/adr/011-agentic-branch-model.md) defines delivery and ownership. This standard is a navigation aid, not a replacement for either source.

## Runtime boundaries

The browser uses Next.js pages and protected API handlers. The API uses the user's Supabase session. Supabase row level security protects reads and role checked SQL functions perform transactional writes. Private Storage policies protect file access.

## Modules

Identity, projects, backlog, sprints, board, collaboration, analytics, and evidence are separate feature areas. Keep backend contracts and domain invariants stable before connecting UI work.

## Security and delivery

Authorization is enforced server side and in PostgreSQL. `main` and `testing` promotion is human controlled; follow the complete [branching model](../../docs/systems/branching.md) and [deployment plan](../../deployment.md). An AI-DLC bolt does not authorize a deploy, migration, or cross-department edit.
