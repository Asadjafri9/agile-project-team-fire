# Coding Standards

## Overview

Follow the binding [agent rules](../../AGENTS.md), [requirements](../../requirements.md), and owning department's established code patterns. AI-DLC artifacts add traceability; they do not override the repository's branch or path ownership rules.

## Code and organization

- Keep TypeScript strict and use existing feature modules, API contracts, and file layout.
- Use descriptive names and preserve requirement IDs in implementation and tests.
- Validate untrusted input at API boundaries and enforce authorization again in the database.
- Keep secrets, credentials, real user data, and database dumps out of the repository.

## Quality checks

Run the scripts that exist in the branch being changed. Current branches may differ; inspect `package.json` before selecting commands. For product changes, cover domain calculations with unit tests, database permission and transaction rules with database tests, and key user journeys with browser tests as specified in [deployment.md](../../deployment.md). Do not weaken checks to make a branch green.

## Errors and logging

Return useful conflict and validation responses without exposing credentials or cross-project data. Never log passwords, tokens, or credential-bearing request bodies.

## Collaboration

Use a role matching task branch. Edit only owned application paths and report cross-department findings through the process in [AGENTS.md](../../AGENTS.md). Commit messages reference a requirement or WBS item and include the required agent trailer.
