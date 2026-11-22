# Decision Log

### Keep shared prototype setup under Systems ownership

**Date:** 2026-10-22
**Status:** Accepted
**Files:** `AGENTS.md`, `scripts/branch-guard.sh`, `.github/CODEOWNERS`, `pnpm-workspace.yaml`, `ui-ux-pro-max/`

In the context of moving the pre-governance Team Fire prototype into the department branch flow, facing unowned package-manager policy and a skill package used by multiple agents, we decided to assign `pnpm-workspace.yaml` and `ui-ux-pro-max/**` to Systems and keep prototype-only code out of Backend-owned `src/lib/**`, to preserve an enforceable ownership boundary, accepting that the Systems changes must reach `frontend` before its task branch can pass the guard.
