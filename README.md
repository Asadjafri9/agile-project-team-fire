# Team Fire

This repository contains a **sample-data prototype** of a Scrum project management workspace. It demonstrates the backlog → sprint planning → board → analytics journey locally. It is not the Supabase-backed product described in [architecture.md](architecture.md), and it does not authenticate users, upload files, send invitations, or deploy a hosted service.

The team's [agent rules](AGENTS.md) and [branching model](docs/systems/branching.md) govern work on the connected application. This prototype uses Node 24 and pnpm.

## Run the prototype

Use Node.js 24 and Corepack. On Windows PowerShell:

```powershell
corepack.cmd pnpm install --frozen-lockfile
corepack.cmd pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and choose **Explore demo**. On macOS/Linux, use `corepack pnpm` in place of `corepack.cmd pnpm`.

The demo includes a sample Team Fire project, synthetic members, work items, completed and active sprints, event history, and a planned sprint. Changes persist in this browser's local storage. **Reset demo** in the sidebar restores the seed. The role switcher shows Product Owner, Scrum Master, Developer, and read-only Viewer behavior; it does not sign in as a real user.

The backlog can create and prioritize items. Sprint planning allocates work and tracks hours and story points separately. The board supports pointer drag and a keyboard-accessible status selector. WIP warnings are advisory; Done requires completed checklist items. Analytics derives burndown, completed-sprint velocity, and item-count CFD from the sample event and commitment data and offers a data table for each chart. Invitations, attachments, and settings are labelled previews with no backend action. Evidence rows are synthetic index examples, **not actual course evidence**.

## Checks

```powershell
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
```

The tests cover the [requirements metric fixture](requirements.md#reference-acceptance-fixture), WIP and checklist behavior, role permissions, sprint transitions, and reset.

For the browser pass, run `corepack.cmd pnpm build`, then leave `corepack.cmd pnpm start` running in one terminal and run `corepack.cmd pnpm browsercheck` in another. The script expects the app at `http://localhost:3000` and uses a local Chrome installation (override with `CHROME_PATH`). It checks every project screen at 375, 768, 1024, and 1440 pixels, plus board keyboard movement, Viewer controls, modal focus, chart tables, and reset.

## Project documents

| Document | Contents |
| --- | --- |
| [WBS_Agile_PM_Platform.pdf](WBS_Agile_PM_Platform.pdf) | Work breakdown structure. |
| [FRONTEND_FEATURES.md](FRONTEND_FEATURES.md) | WBS-derived frontend feature checklist and current prototype gaps. |
| [AGENTS.md](AGENTS.md) | Team-wide agent roles, branch rules, and path ownership. |
| [FRONTEND_STARTUP.md](FRONTEND_STARTUP.md) | Local frontend startup and troubleshooting walkthrough. |
| [requirements.md](requirements.md) | Product scope, role matrix, metric rules, acceptance criteria, and WBS traceability. |
| [architecture.md](architecture.md) | Proposed connected application architecture and data boundaries. |
| [deployment.md](deployment.md) | Proposed Supabase/Vercel deployment and recovery plan. |
| [docs/systems/branching.md](docs/systems/branching.md) | Team branch model and integration process. |
| [docs/adr/](docs/adr/) | Architecture decision records for branch policy and WBS deviations. |

The earlier [static dashboard mock](dashboard-mockup/) remains available for comparison. The [UI/UX skill source](ui-ux-pro-max/) remains in this repository; its installed Codex copy is separate.
