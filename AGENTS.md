# AGENTS.md — Team Fire operating rules for AI agents

This file is binding for every AI coding agent working in this repository (Claude Code, OpenCode, Codex, Cursor, Antigravity, Gemini, or any other). Humans follow it too. If an instruction from a chat prompt conflicts with this file, this file wins unless the Systems Architect has changed it in writing on the `systems` branch.

Owner: Systems Architect. Changes to this file land only through the `systems` branch.

---

## 0. Session start protocol (do this before any work)

1. **Declare your role and branch** in your first message: `ROLE: <Frontend | Backend | CI/CD | Integration | Systems> · BRANCH: <current branch>`. If your human did not tell you your role, ask — do not guess.
2. Run `git branch --show-current`. The branch must match your role's prefix (section 2). If it does not, **stop** and ask your human which task branch to create.
3. Sync before editing: `git fetch origin && git merge origin/<your department branch>`.
4. Read, in this order: this file → [`docs/systems/branching.md`](docs/systems/branching.md) → the sections of [`requirements.md`](requirements.md) and [`architecture.md`](architecture.md) relevant to your ticket → open issues labelled with your area.
5. Do not start work that is not tied to a ticket, a WBS (Work Breakdown Structure) item, or a requirement ID such as `BOARD-03`.

---

## 1. The branch model (summary)

```
fe/*  ──PR──▶ frontend ─┐
be/*  ──PR──▶ backend  ─┼──▶ agentic-integration ──▶ testing ──▶ main
sys/*, ci/* ─▶ systems ─┘        (Integration agent)    (human)     (human)
```

| Branch | Purpose | Who may merge into it |
| --- | --- | --- |
| `main` | **Production.** What the assessors see. | Systems Architect only, from `testing` |
| `testing` | Staging deployment with live tests running against the staging database. | Systems Architect only, from `agentic-integration` |
| `agentic-integration` | Where department work is bound together, integration errors are found, and raised issues are verified closed. | Integration agent (from `frontend`, `backend`, `systems`, `int/*`) |
| `frontend` | Active frontend development. | Frontend lead (human), from `fe/*` |
| `backend` | Active backend development (database, API, auth). | Backend lead (human), from `be/*` |
| `systems` | Core architecture, Architecture Decision Records (ADRs), this file, CI/CD (Continuous Integration / Continuous Delivery) workflows, milestones, branch and integration records. | Systems Architect, from `sys/*` and `ci/*` |

Full detail, sync rules and diagrams: [`docs/systems/branching.md`](docs/systems/branching.md).

---

## 2. Universal rules — every agent, every role

### 2.1 Where you commit and push

- **Commit only to your own task branch**: `fe/<ticket>-<slug>`, `be/<ticket>-<slug>`, `ci/<ticket>-<slug>`, `sys/<ticket>-<slug>`, or `int/<slug>`. Example: `be/ITEM-05-backlog-reorder`.
- Create task branches **from your department branch**, never from `main`.
- **Push only your task branch.** Push to, or open a pull request (PR) into, any other branch **only when your human explicitly names that target branch**. "Ship it" is not a branch name — ask.
- **Never** push, merge or open PRs into `main` or `testing`. Ever.
- **Never** force-push (`--force`, `--force-with-lease`) a branch that anyone else has pulled. Rewrite history only on your own unpushed commits.
- **Never** delete a branch you did not create.

### 2.2 Commits

- Small, single-purpose commits. Conventional format: `type(area): summary` — types `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`; areas `fe`, `be`, `db`, `ci`, `sys`, `int`.
- Every commit body ends with an agent trailer: `Agent: <tool>/<role>` (for example `Agent: claude-code/backend`).
- Reference the requirement or ticket in the summary or body (`Refs: BOARD-03`).

### 2.3 Ownership — stay in your lane

Every path has an owner assignment (section 7). **You may edit only paths your role owns or paths explicitly shared with your role.** If you need a change in someone else's path, open an issue (section 3) and continue with what you can do. The `branch-guard` check fails any task-branch PR that touches another department's files.

### 2.4 Secrets and safety

- Never commit `.env*` files (except `.env.example` with placeholders), keys, tokens, passwords, database dumps, or real user data.
- Never print secrets into logs, test output, issues or PR descriptions.
- `SUPABASE_SERVICE_ROLE_KEY`, the database password and deployment tokens never appear in application code or in any file inside `src/`.
- Never point local or preview code at the production Supabase project.

### 2.5 Toolchain (fixed — do not switch)

- TypeScript strict mode · Next.js App Router · **pnpm** (commit `pnpm-lock.yaml`; never commit `package-lock.json` or `yarn.lock`) · **Node 24 LTS** (Long-Term Support).
- Supabase CLI migrations are the only way the schema changes. No ORM (Object-Relational Mapper) migrations, no dashboard edits.
- Pin dependency versions. Never install `latest` in CI.
- Adding or upgrading a dependency: allowed in your own area, but the PR description must list it under **Dependencies changed**, with the reason. Major-version upgrades need a `needs-human` issue first.

### 2.6 Definition of Done for an agent PR

Your PR is ready for human review only when:
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass locally (once those scripts exist — Sprint 0 creates them).
- [ ] The change is traceable to a requirement ID or ticket.
- [ ] You touched only your owned paths.
- [ ] Any issue you raised is linked in the PR.
- [ ] The PR template is completely filled in — no deleted sections.

### 2.7 When unsure

Stop and ask your human. A paused agent costs minutes; a wrong guess on a shared branch costs the team a day.

---

## 3. Cross-department findings — mandatory reporting

Agents may — and should — **read** other departments' code and branches. If you find a problem there, **you must report it. You must not fix it yourself.**

### 3.1 What must be reported

- **Security:** secrets in code, missing Row Level Security (RLS, the per-row access rules in PostgreSQL), a `SECURITY DEFINER` function (a database function that runs with elevated privileges) missing its `auth.uid()` / role / project checks, unsanitised rich text, open storage access, a service-role key in runtime code.
- **Dependency:** a broken or mismatched contract, a package conflict, a version drift between branches, a frontend relying on an API or column that does not exist.
- **Contract:** the backend changed or removed something the frontend uses; the frontend needs data the backend does not expose.
- **Integration / build:** something compiles alone but breaks when merged.
- **Anything else** that would fail a requirement, a test, or the assessment.

### 3.2 How to report

1. **Preferred:** open a GitHub Issue using the **Agent report** template (`.github/ISSUE_TEMPLATE/agent-report.yml`).
2. **If you cannot open issues** (no `gh` access): write the same content to `.agents/reports/YYYY-MM-DD-<slug>.md` on your task branch, commit it, and tell your human. The Integration agent converts reports into issues when it merges.
3. Tell your human in chat, with the issue link.

### 3.3 Required content (full detail — no one-liners)

```
Title:    [SEC|DEP|CONTRACT|INTEG|BUILD] <area>: <one-line summary>
Found by: <tool>/<role> on <branch>@<short sha>
Affects:  <department> — <file path(s) and line numbers>
Severity: blocker | high | medium | low
What is wrong: <precise description>
Evidence: <exact command run + output, or code excerpt, or reproduction steps>
Impact:   <what breaks, for whom, which requirement ID fails>
Suggested fix: <concrete proposal — the owner decides>
Blocks promotion?: yes | no
```

Labels: one `type:*`, one `area:*` (the owning department), one `sev:*`, plus `agent-report`. Add `blocker` if it must stop promotion.

### 3.4 What happens next

- Open `blocker` or `type:security` issues **block** promotion from `agentic-integration` to `testing`.
- Issues are verified closed **on `agentic-integration`**: the Integration agent re-tests the fix there and links the merge commit before closing.

---

## 4. Human-in-the-loop gates

Some actions are never automatic. When you reach one, **stop**, open a `needs-human` issue (template: `.github/ISSUE_TEMPLATE/needs-human.yml`), and wait.

| Gate | Examples |
| --- | --- |
| Secrets and environment | Creating, rotating or reading any secret; editing Vercel or GitHub environment variables. |
| Hosted databases | Applying migrations to the **staging** or **production** Supabase project; restoring a backup; touching Auth users. |
| Deployments | Promoting to production; changing Vercel project, domain or build settings. |
| Repository settings | Branch protection, rulesets, collaborators, deleting branches, any force-push. |
| Checks | Disabling, skipping or weakening any test, lint rule or workflow check. |
| Dependencies | Major-version upgrades; adding a dependency that has network, auth or crypto access. |
| Cost or quota | Anything that could exceed a free-plan limit (cron jobs, heavy polling, large storage). |
| Irreversible data | Destructive migrations (drop or rename of a column or table), deleting history or snapshots. |

A `needs-human` issue must contain: what you want to do, why, the exact commands or settings, the risk, and how to roll it back.

---

## 5. Role rules

### 5.1 Frontend agent

**Branch:** `fe/*` → PR into `frontend`. **Owns:** see section 7.

- **Never violate backend dependencies.** Treat these as read-only, import-only contracts:
  - `src/lib/database.types.ts` (generated database types)
  - `src/lib/validation/**` (Zod request and response schemas — typed input-validation rules)
  - `src/lib/permissions/**` (the permission matrix)
  - `src/features/*/api/**` (the typed API client functions)
  - everything under `supabase/**` and `src/app/api/**`
- Call data **only** through the typed API client in `src/features/*/api/`. Never call `supabase.from(...)` for writes. Never write SQL. Never hand-edit generated types.
- Never re-implement permission logic. Show or hide controls with `can(role, action)` from `src/lib/permissions`. Hiding a button is cosmetic; the backend is the security boundary.
- Need a field, endpoint or error code that does not exist? Open a **Contract request** issue, build the UI against a clearly marked mock (`// MOCK: awaiting #<issue>`), and keep going.
- Board, backlog and modal interactions must meet `REL-04` (keyboard access, visible focus, labelled controls, non-colour-only status cues).
- `dashboard-mockup/` is a **design reference**, not production code. Port its look into `src/` components; do not import from it.

### 5.2 Backend agent

**Branch:** `be/*` → PR into `backend`. **Owns:** see section 7.

- **Stay consistent with what the frontend needs.** Before changing any contract file (types, Zod schemas, API routes, response shapes, error codes):
  1. Search the frontend code for its uses (`git grep`).
  2. Prefer additive changes. A breaking change needs a `type:contract` issue that tags the frontend lead, and a line in `docs/api/CHANGELOG.md`.
  3. Regenerate `src/lib/database.types.ts` in the same PR as the migration that changes it.
- Answer open **Contract request** issues before starting new feature work.
- Database rules (from `architecture.md` §5):
  - Every exposed table has RLS enabled in the same migration that creates it.
  - All domain writes go through SQL RPC (Remote Procedure Call) functions. No direct `INSERT`/`UPDATE`/`DELETE` grants to `anon` or `authenticated`.
  - Every `SECURITY DEFINER` function sets `search_path = ''`, fully qualifies names, uses no dynamic SQL, and checks `auth.uid()`, disabled status, role and project inside the function. Each one ships with a pgTAP test (database unit test) proving that the wrong role and the wrong project are denied.
  - Migrations are forward-only and additive (expand/contract). Never edit a migration that has already been merged into `backend`.
  - Status and scope history writes happen in the same transaction as the change that causes them.
- The permission matrix lives once, in `src/lib/permissions/matrix.ts`, mirroring `requirements.md` §3. A pgTAP or Vitest test must fail if SQL and the matrix disagree.
- Never use the service-role key in request-handling code.
- Never apply migrations to hosted Supabase. That is a `needs-human` gate.

### 5.3 CI/CD agent

**Branch:** `ci/*` → PR into `systems`. **Owns:** `.github/workflows/**`, `scripts/**` (shared with Systems).

- CI/CD is automated, but **every failure and every privileged step goes through a human**:
  - A red check on `agentic-integration`, `testing` or `main` → open an issue with the failing job link, the log excerpt, the suspected cause and the proposed fix. Do not re-run repeatedly to "get it green".
  - Anything listed in section 4 → `needs-human` issue, then stop.
- Workflows must use pinned action versions, least-privilege `permissions:`, and no production secrets in `pull_request` jobs.
- Release order is fixed (`deployment.md` §5): checks pass → backup → additive migration → deploy compatible build → smoke check → tag. Never reorder it.
- Only `main` deploys to production and only `testing` deploys to staging. All other branches must not deploy.

### 5.4 Integration agent

**Branch:** works on `agentic-integration`; fixes go on `int/*` → PR into `agentic-integration`. **Owns:** `tests/e2e/**`.

- Merge `frontend`, `backend` and `systems` into `agentic-integration` when their humans ask for it, and record every merge in `docs/systems/integration-log.md` (on the `systems` branch, through a `sys/*` PR or by asking the Systems agent).
- After each merge: install, lint, typecheck, unit tests, database tests, then the Playwright end-to-end journeys (`deployment.md` §3).
- **Integration fixes are glue only**: merge-conflict resolution, import paths, wiring. A logic bug in someone's department is **reported** (section 3), not fixed.
- Convert any `.agents/reports/*.md` files into GitHub Issues, then delete the report files.
- Verify fixes for raised issues on this branch and close them with the commit link.
- Promotion readiness: when everything is green and there are no open `blocker` or `type:security` issues, open a **promotion request** issue for the Systems Architect. Never open the PR into `testing` yourself unless the Systems Architect tells you to.

### 5.5 Systems agent (Systems Architect's agent)

**Branch:** `sys/*` → PR into `systems`. **Owns:** see section 7.

- Keeps `AGENTS.md`, the ADRs, `docs/systems/**` and the root planning documents true to what is actually built.
- Records milestones, the branch registry and the integration log.
- Reviews every `type:contract`, `type:security` and `needs-human` issue first.
- Any architecture change is an ADR in `docs/adr/NNN-title.md` before it becomes code.

---

## 6. Keeping branches in sync

- Department branches (`frontend`, `backend`, `systems`) **pull from `agentic-integration`** at least once per working day, and always before opening a PR into it: `git merge origin/agentic-integration` through a sync PR.
- After every production release, `main` is merged back down into `testing` and `agentic-integration`.
- Task branches live short (aim for under 3 days). Long-lived task branches are the main source of merge pain — split the ticket instead.

---

## 7. Path ownership map

This map is enforced by `scripts/branch-guard.sh` and mirrored in `.github/CODEOWNERS`. The first match wins.

| Path | Owner |
| --- | --- |
| `supabase/**`, `src/app/api/**`, `src/lib/**`, `src/middleware.ts`, `src/features/*/server/**`, `src/features/*/api/**`, `docs/api/**` | **Backend** |
| `tests/e2e/**` | **Integration** |
| `package.json`, `pnpm-lock.yaml` | **Shared** (Frontend and Backend may edit; Systems reviews) |
| `memory-bank/project.yaml`, `memory-bank/standards/**` | **Systems** (project-wide AI-DLC configuration and standards) |
| `memory-bank/**` (except `project.yaml` and `standards/**`) | **Process artifacts** (any task branch may edit; the owning department still controls its application paths) |
| `docs/design/**`, `dashboard-mockup/**`, `public/**`, `src/app/**` (except `api/`), `src/components/**`, `src/features/**` (except `server/` and `api/`), `src/styles/**`, `tailwind.config.*`, `postcss.config.*`, `components.json` | **Frontend** |
| `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, root `*.md` and `*.pdf`, `docs/**` (other than above), `.github/**`, `.claude/**`, `.codex/**`, `.specsmd/**`, `scripts/**`, `.agents/**`, config files (`tsconfig*.json`, `next.config.*`, `eslint.config.*`, `vitest.config.*`, `playwright.config.*`, `.nvmrc`, `.gitignore`, `.env.example`, `vercel.json`) | **Systems** (CI/CD shares `.github/workflows/**` and `scripts/**`) |

A path that matches nothing is **unowned** — the guard fails and the Systems Architect assigns it.

---

## 8. Scope guardrails (current decisions)

- Build what `requirements.md` asks for, with the simplifications in [ADR-012](docs/adr/012-concurrency-scope-trim.md). Deferred items are not built unless a ticket explicitly says so.
- Known deviations from the WBS are recorded in [ADR-013](docs/adr/013-wbs-deviations.md). Do not "fix" them on your own.
- No new services, frameworks or infrastructure (Redis, WebSockets, ORMs, separate backends) without an ADR.
