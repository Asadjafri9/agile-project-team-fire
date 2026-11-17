# Agile Project — Team Fire

A Scrum-focused project management platform for backlog planning, sprint execution, collaboration, and delivery analytics, based on [the project WBS](WBS_Agile_PM_Platform.pdf).

This repository currently contains planning documents. Application code and deployment are not yet implemented.

| Document | Contents |
| --- | --- |
| [requirements.md](requirements.md) | Scope, role matrix, acceptance criteria, metric formulas, concurrency/security targets, WBS traceability, delivery gates. |
| [architecture.md](architecture.md) | Recommended stack, diagrams, data model, transaction/permission design, API sketch, architecture decisions. |
| [deployment.md](deployment.md) | Supabase Free + Vercel setup, CI/CD ordering, secrets, free-plan constraints, backup/restore, assessment checklist. |
| [AGENTS.md](AGENTS.md) | **Binding rules for every AI agent and human**: roles, branch permissions, path ownership, issue reporting, human-in-the-loop gates. |
| [docs/systems/branching.md](docs/systems/branching.md) | Six-branch model, allowed PR flows, release cycle, one-time GitHub/Supabase/Vercel setup. |
| [docs/systems/architecture-review.md](docs/systems/architecture-review.md) | Architecture review findings and their resolutions. |
| [docs/adr/](docs/adr/) | Architecture Decision Records (ADRs) 011–013; ADRs 001–010 are summarised in architecture.md §10. |

Proposed stack: TypeScript, Next.js/React, Tailwind/shadcn, TanStack Query, dnd-kit, Tiptap, Recharts, Supabase PostgreSQL/Auth/private Storage, and Vercel. Regular backend writes use authorised transactional SQL functions; history and completed-sprint snapshots support reproducible metrics.

Confirmed choices: private course/team audience, ID/password login, Product Owner and Scrum Master membership management, advisory WIP limits, and teammate updates within about five seconds. “ID” is provisionally interpreted as username; accounts are operator-provisioned without email dependencies.

Implementation follows Sprint 0 and four delivery increments. See the requirements for the Definition of Ready/Done and the remaining product decisions before scheduling.

## AI-DLC with specs.md

The repository includes the [specs.md AI-DLC flow](https://github.com/fabriqaai/specs.md/blob/main/src/flows/aidlc/quick-start.md) for Codex, Claude Code, and GitHub Copilot. The installation manifest is in [.specsmd/manifest.yaml](.specsmd/manifest.yaml); project context starts at [memory-bank/project.yaml](memory-bank/project.yaml) and [memory-bank/standards/](memory-bank/standards/).

Start the `specsmd-master-agent` skill or prompt in your coding tool. Use `specsmd-inception-agent` to create a new intent, then plan and execute bolts through the Construction agent. Do not create an intent for already completed work merely to populate the memory bank.

The existing [agent rules](AGENTS.md), [requirements](requirements.md), [architecture](architecture.md), and [branching model](docs/systems/branching.md) remain authoritative. AI-DLC checkpoints do not bypass role ownership or human release gates. The installed specs.md v0.1.74 files contain local corrections for stale `.specsmd/skills/` references; check those references after a future reinstall.
