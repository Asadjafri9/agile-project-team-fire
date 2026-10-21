# ADR-011 — Agentic multi-branch model with integration gate

Status: Accepted · Date: 2026-10-21 · Decider: Systems Architect

## Context
Several team members each run their own AI coding agents (Claude Code, OpenCode, Antigravity and others) in parallel, each working on a different part of a single Next.js + Supabase application. Without structure, agents overwrite each other's contracts, push unreviewed work to production, and fix problems in code they do not own.

## Decision
- Six permanent branches: `main` (production), `testing` (staging plus live tests), `agentic-integration` (binding and issue verification), `frontend`, `backend`, `systems`.
- Agents commit only to short-lived task branches (`fe/`, `be/`, `sys/`, `ci/`, `int/`) and push elsewhere only when a human names the target branch.
- Promotion `agentic-integration` → `testing` → `main` is human-only (the Systems Architect).
- Every path has exactly one owning department; cross-department problems are reported as issues, never fixed by the finder.
- `AGENTS.md` at the root is the single rule source; `CLAUDE.md` and `GEMINI.md` import it.
- `scripts/branch-guard.sh` checks flow and ownership on every PR; GitHub branch protection makes it blocking once the owner enables GitHub Pro.

## Consequences
- More merge steps than trunk-based development, in exchange for containment: a bad agent run is caught at a department branch or at integration, never in production.
- Department branches must sync from `agentic-integration` daily to keep drift small.
- Until branch protection is enabled, enforcement depends on agents following `AGENTS.md` and on humans reading red `branch-guard` checks.
