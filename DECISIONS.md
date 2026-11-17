# Decision Log

### Keep shared prototype setup under Systems ownership

**Date:** 2026-10-22
**Status:** Accepted
**Files:** `AGENTS.md`, `scripts/branch-guard.sh`, `.github/CODEOWNERS`, `pnpm-workspace.yaml`, `ui-ux-pro-max/`

In the context of moving the pre-governance Team Fire prototype into the department branch flow, facing unowned package-manager policy and a skill package used by multiple agents, we decided to assign `pnpm-workspace.yaml` and `ui-ux-pro-max/**` to Systems and keep prototype-only code out of Backend-owned `src/lib/**`, to preserve an enforceable ownership boundary, accepting that the Systems changes must reach `frontend` before its task branch can pass the guard.

### Install specs.md AI-DLC as a project workflow

**Date:** 2026-11-17
**Status:** Accepted
**Files:** `.specsmd/`, `.codex/`, `.claude/`, `.github/`, `memory-bank/`, `AGENTS.md`, `scripts/branch-guard.sh`

In the context of adding AI-DLC traceability for Team Fire's process portfolio (PROC-03), facing an existing multi-branch ownership model, we decided to install specs.md 0.1.74 for Codex, Claude Code, and GitHub Copilot and initialize standards from accepted project documents, to make the flow usable across the team, accepting generated files and ongoing refresh checks, because the user requested specs.md and the workflow must coexist with ADR-011.

### Share AI-DLC work records while Systems owns standards

**Date:** 2026-11-17
**Status:** Accepted
**Files:** `AGENTS.md`, `scripts/branch-guard.sh`, `.github/CODEOWNERS`, `memory-bank/`

In the context of AI-DLC intents and bolts being created by several departments, facing a branch guard that rejects unowned paths, we decided to let every role edit process artifacts while Systems owns the installer, project configuration, and standards, to support cross-team workflow records, accepting that process artifacts need careful review, because application path ownership and release gates remain enforced separately.
