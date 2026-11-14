# Architecture review register — 2026-10-21

Review of `README.md`, `requirements.md`, `architecture.md`, `deployment.md`, the WBS PDF and the existing branches, against the agentic multi-branch workflow. Each finding has an owner and a resolution.

| # | Finding | Severity | Resolution | Status |
| --- | --- | --- | --- | --- |
| R1 | Frontend and backend live in one Next.js app with no file-level ownership, so long-lived department branches would collide on shared files (`database.types.ts`, Zod schemas, permissions). | High | Path ownership map, AGENTS.md §7, enforced by `branch-guard`. Shared contracts are backend-owned and read-only for frontend. | Resolved |
| R2 | `lib/permissions` is described as a "UI/server policy mirror", which creates two sources of permission truth. | Medium | Single matrix in `src/lib/permissions/matrix.ts`, backend-owned; a test fails if SQL and the matrix disagree (AGENTS.md §5.2). | Resolved (rule) |
| R3 | `deployment.md` assumes one hosted Supabase project, so the `testing` branch had nowhere to run live tests. | High | Second free Supabase project as staging (the Free plan allows two active projects). | Pending setup |
| R4 | Vercel would auto-deploy every branch, and preview environment scoping was not configured. | High | Ignored Build Step: only `main` and `testing` build (branching.md §5). | Pending setup |
| R5 | Branch protection is unavailable for private repositories on GitHub Free, so every rule was advisory. | High | Owner claims GitHub Pro via the Student Developer Pack; until then, `branch-guard` reports violations but cannot block merges. | Pending owner |
| R6 | Docs split from code on a separate branch would break "docs updated" in the Definition of Done. | Medium | Governance is authored on `systems` and propagated to every branch through integration and sync. | Resolved |
| R7 | `AGENTS.md` must exist on every branch or agents will not read it. | High | Bootstrapped onto all six branches on 2026-10-21. | Resolved |
| R8 | The concurrency design (idempotency receipts, list revisions, documented global lock order) is heavy for a one-semester team to build and defend. | Medium | [ADR-012](../adr/012-concurrency-scope-trim.md) defers it to Increment 4. | Proposed |
| R9 | Two WBS deliverables are changed without a recorded decision: 4.1 registration (deferred) and 4.4 delete (replaced by archive). | Medium | [ADR-013](../adr/013-wbs-deviations.md); confirm with the course instructor. | Proposed |
| R10 | Planning documents contain drafting residue ("the user confirmed") and an inconsistency (README treats "ID = username" as settled; requirements §10 lists it as open). | Low | Wording corrected to team voice; §10 row marked decided. | Resolved |
| R11 | No package manager, Node version, `.gitignore`, `.env.example`, CODEOWNERS or PR template. | Medium | pnpm and Node 24 LTS fixed in AGENTS.md §2.5; `.nvmrc`, `.gitignore`, CODEOWNERS, templates added. `.env.example` comes with the Sprint 0 scaffold. | Resolved |
| R12 | The existing `frontend` branch had **no common history** with `main` (one commit containing only `dashboard-mockup/`), so it could never be merged. | High | Joined to the shared history with a non-destructive `--allow-unrelated-histories` merge; the mockup is kept as a design reference (AGENTS.md §5.1). | Resolved |
| R13 | `dashboard-mockup/` is vanilla HTML/JS at the repository root, outside the planned `src/` Next.js layout. | Low | Treated as a design reference only; port into `src/components` during Sprint 0. | Open — frontend |
| R14 | Department leads are not yet named, so CODEOWNERS routes every review to the Systems Architect. | Low | Fill in the roster in `branch-registry.md` and CODEOWNERS. | Open — Systems Architect |
