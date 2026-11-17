# API Conventions

## Overview

The [architecture](../../architecture.md) and [requirements](../../requirements.md) govern API behavior. Keep new endpoints consistent with the API surface actually present on the branch being edited.

## Boundaries

- Next.js handlers validate requests and authenticate the user.
- Backend contracts define typed request and response shapes; coordinate breaking changes with the frontend owner.
- PostgreSQL RPCs enforce project membership, role, status, and transaction rules for writes.
- Return explicit validation, authorization, and conflict errors without disclosing another project's data.

## Versioning and review

Prefer additive contract changes. For a breaking change, follow the contract issue and changelog process in [AGENTS.md](../../AGENTS.md). Do not invent a pagination or response envelope convention where the existing implementation has none.
