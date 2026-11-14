# Agile Project — Team Fire: requirements

Status: implementation baseline; no application has been built yet. Updated: 2026-10-21.

Source: [WBS_Agile_PM_Platform.pdf](WBS_Agile_PM_Platform.pdf), six pages, dated 8 September 2026. This document turns its deliverables into verifiable requirements. Architecture and implementation defaults below are design proposals, not additional claims from the PDF.

## 1. Product goal and agreed constraints

Build a private, browser-based Scrum project management application that lets a team prioritise a backlog, plan and run sprints, collaborate on a board, and produce trustworthy delivery metrics and course assessment evidence.

The team agreed:

- Agentic implementation; optimise for development speed, concurrent usage, and backend security.
- Supabase **Free** for backend services and Vercel for the web application. No paid infrastructure is required by this design.
- First audience: the course team and assessment panel.
- Teammate changes should appear automatically within approximately five seconds.
- Product Owners and Scrum Masters can manage invitations and project roles.
- WIP limits warn and allow moves.
- ID/password authentication only for now.

Interpretation to confirm: “ID” means a username. The initial hosted release uses operator-provisioned username/password accounts. Public self-registration, email delivery, Google login, and email password recovery are deferred. This deliberately replaces WBS 4.1's public registration portion for the initial release; login, session handling, and logout remain required. No one should need a Supabase dashboard account to use the application.

## 2. Scope and terminology

| Term | Meaning |
| --- | --- |
| Project | Private boundary containing members, backlog, sprints, taxonomy, and evidence. |
| Work item | User story, bug, or technical task; each can carry story points. |
| Subtask | Checklist entry within a work item; no separate points or independent sprint membership. |
| Sprint | Planned interval with a goal, capacity, commitment snapshot, and delivery result. |
| Commitment | Item IDs and story-point values frozen when a sprint starts. |
| Status history | Append-only record of creation and status transitions with authoritative ordering. |
| Scope history | Append-only additions/removals of work items from a sprint. |
| Project owner | Account responsible for project ownership; distinct from its Scrum role. |
| Delivery evidence | Versioned ceremony notes, chart exports, backlog snapshots, tests, and demonstrations. |

Included: all four WBS delivery increments, Sprint 0, and the documentation/process portfolio. Explicitly deferred: billing, public project sharing, organisations, SSO, native mobile apps, AI assistants, chat, time billing, arbitrary workflows, integrations, offline editing, and simultaneous rich-text co-editing. Scrum remains the planning model even though execution uses a Kanban-style board.

## 3. Users and permissions

Every project membership has exactly one Scrum role. Ownership is an additional property of one active project member. The initial creator becomes owner and Product Owner. A user's role can differ between projects.

| Capability | Product Owner | Scrum Master | Developer | Viewer |
| --- | --- | --- | --- | --- |
| Read project, board, metrics, comments, attachments | Yes | Yes | Yes | Yes |
| Read/download sprint summaries | Yes | Yes | Yes | Yes |
| Create/edit work items, criteria, subtasks, estimates | Yes | Yes | Yes | No |
| Set priority, reorder product backlog, manage epics/labels | Yes | No | No | No |
| Plan scope, capacity, start/complete sprints | Yes | Yes | No | No |
| Move cards, assign members, comment, mention, attach files | Yes | Yes | Yes | No |
| Configure WIP warnings | Yes | Yes | No | No |
| Invite existing accounts, change roles, remove members | Yes | Yes | No | No |
| Archive work items | Yes | Yes | No | No |
| Record delivery evidence | Yes | Yes | Yes | No |

Only the owner can transfer ownership or archive the project. Other managers cannot remove the owner or change the owner's role. Ownership transfer requires an existing active member and succeeds atomically. Members can leave except the owner, who must transfer ownership first. Role changes apply to new reads/writes as soon as the change commits; no authorisation decisions depend on cached role claims in a JWT.

Account provisioning/password resets belong to the deployment operator, not to project membership managers. All roles and permissions must be enforced in the backend, including direct database API calls; hiding UI controls is insufficient.

## 4. Functional requirements and acceptance criteria

“Must” is required for the agreed initial release. Requirement IDs are stable references for implementation and tests.

### Accounts, projects, and membership — Increment 1

| ID | Requirement and acceptance criteria |
| --- | --- |
| AUTH-01 | Sign in with username and password; invalid credentials produce a generic error. Normalise username case consistently. Never log passwords, tokens, or request bodies containing credentials. |
| AUTH-02 | Maintain and refresh the authenticated session; reject expired/invalid sessions server-side. Logout clears local credentials and the authenticated UI. Enforce account disablement on protected server requests. |
| AUTH-03 | Provision unique usernames and initial passwords through operator tooling. Disable public account signup. Provide an authenticated change-password flow requiring the current password; operator recovery is documented and audited. Passwords are handled only by Supabase Auth. |
| PROJ-01 | An authenticated account can create a private project with name, unique project key, description, and IANA timezone; creator ownership and membership are created in one transaction. |
| PROJ-02 | Product Owners and Scrum Masters can invite an existing account by exact username and choose its role. Invitee sees a pending invitation and can accept/decline while authenticated as that account. Invitations expire after seven days, can be revoked, and can be accepted once. |
| PROJ-03 | Managers can update roles/remove members within the ownership rules above. Removing a member clears current assignments and records the change; historical actor attribution is preserved. |
| PROJ-04 | An account outside a project cannot read or mutate its records, counts, search results, exports, or files, even with valid IDs. Profiles expose only the current user's and fellow members' necessary display information. |
| PROJ-05 | Owner can archive a project; archived projects become read-only and remain exportable. There is no permanent project deletion in the initial release. |

### Backlog and work items — Increment 1

| ID | Requirement and acceptance criteria |
| --- | --- |
| ITEM-01 | Create/read/update/archive stories, bugs, and technical tasks. Each item has UUID, stable human key, title, description, type, priority, estimate, status, optional assignee/epic, labels, timestamps, and version. Archived items disappear from active lists without destroying history. |
| ITEM-02 | Rich-text descriptions support paragraphs, headings, lists, emphasis, and safe links. Validate editor JSON and sanitise rendering; executable HTML/scripts and unsafe URL schemes are rejected. |
| ITEM-03 | Maintain individually checkable acceptance criteria and subtasks. Subtask progress is completed/total × 100, shown as 0% with “No subtasks” when empty. Acceptance criteria and subtasks remain distinct lists. |
| ITEM-04 | Allowed story points are null (unestimated), 1, 2, 3, 5, 8, 13. Priorities are Low, Medium, High, Critical. Require every sprint item to be estimated before sprint start, and every item added to an active sprint to be estimated. |
| ITEM-05 | Product Owner can reorder the backlog using drag-and-drop and keyboard controls. Persist ordering independently of priority labels. Concurrent reorder attempts cannot silently overwrite each other. |
| ITEM-06 | Assignees, epics, labels, checklist parents, and sprint references must belong to the same project. One assignee per work item; multiple labels. |
| ITEM-07 | Store status history from creation, estimate changes from the first edit, and activity records from Increment 1. Do not wait for analytics development. |
| ITEM-08 | Archiving an active sprint item requires a scope-removal operation in the same transaction. Archived items retain their estimates, snapshots, comments, and history for reports. |

### Sprints and board — Increment 2

| ID | Requirement and acceptance criteria |
| --- | --- |
| SPR-01 | Create planned sprints with name, goal, start/end dates, and timezone. End must follow start. Lifecycle is PLANNED → ACTIVE → COMPLETED; there is at most one active sprint per project. Completed sprints cannot be reopened in this release. |
| SPR-02 | Record available hours per member and an independently entered team story-point capacity. Show allocated points and over-capacity warnings. Do not automatically convert hours into points. |
| SPR-03 | Allocate eligible items from backlog to a planned sprint; remove or change allocations with permission checks. An item has at most one current sprint. Done/archived items cannot be newly allocated. |
| SPR-04 | Start sprint atomically: validate goal/dates/estimates, freeze item IDs and estimates, record actual start time, initialise history, and activate the sprint. Duplicate/retried requests cannot create a second snapshot. |
| SPR-05 | Scope added or removed after start requires a reason and an immutable event. Original commitment never changes. Estimates for items while allocated to an active sprint are locked; return to backlog before re-estimation. Done items cannot be removed/archived while their sprint is active; reopen first or wait for sprint completion. |
| SPR-06 | Complete sprint atomically: freeze item outcomes and metrics, record actual completion time, and return unresolved items to backlog or move them to a selected planned sprint. A carried item preserves its current status; no automatic reset or double counting. |
| SPR-07 | Sprint completion and card changes cannot interleave into inconsistent results. An operation either precedes completion and appears in its snapshot, or is rejected with a useful conflict response. |
| BOARD-01 | Render exactly To Do, In Progress, Code Review, Testing, Done in this order. Any non-archived active-sprint item appears once. Workflow customisation is deferred. |
| BOARD-02 | Dragging or keyboard-moving a card persists status and order. The UI can update optimistically, but failures roll back and notify the user. A detail modal provides equivalent status/edit controls without leaving the board. |
| BOARD-03 | Changing status updates the item, history, and activity atomically. A stale version receives a conflict response and must refresh; a retry with the same mutation ID creates no duplicate history. |
| BOARD-04 | Successful edits of different cards can proceed concurrently. For an open, visible board under the stated demo load and working connectivity, teammate edits appear within about five seconds of commit. Reconnect/focus refreshes authoritative state. |
| BOARD-05 | Configure a positive WIP limit or no limit per non-Done column. Exceeding the limit shows a count and warning but allows the operation. Two concurrent moves are both valid even if together they exceed the warning threshold. |
| BOARD-06 | Going back from Done to another status is allowed while the sprint is active; metrics reflect reopening. Moving to Done requires all acceptance criteria and subtasks to be complete, if any exist. |

### Analytics, taxonomy, and collaboration — Increment 3

| ID | Requirement and acceptance criteria |
| --- | --- |
| MET-01 | Calculate analytics from persisted status/scope/estimate events and sprint snapshots, not browser state or today's item rows. All charts show timezone, scope, units, and data cutoff. |
| MET-02 | Display original-commitment burndown and ideal line, plus a separately labelled current-scope remaining line and scope-change markers. Reopening, scope changes, carryover, and unestimated backlog items follow section 5. |
| MET-03 | Display completed-sprint velocity in chronological order, with committed and delivered points distinguishable and scope additions visible. An unfinished sprint is not included in historical velocity. |
| MET-04 | Display a cumulative flow diagram (CFD) of item counts per status at each day-end. Sprint membership intervals determine inclusion; no story points on the CFD y-axis. |
| MET-05 | Analytics dashboard offers sprint selection, chart empty/loading/error states, completion totals, commitment completion rate, and WIP warnings. Zero commitment has an “N/A” completion percentage. |
| COL-01 | Search item title or key and filter by assignee, label/tag, epic, type, priority, and status. Filters compose, are reflected in the URL, and preserve project isolation. |
| COL-02 | Product Owner manages project epics and a single label taxonomy. “Tags” are labels, not a second overlapping entity. Work items have at most one epic. |
| COL-03 | Non-Viewer members add/edit their own comments, with an edit timestamp. Soft-delete comments while preserving a history stub. Managers can moderate comments with an audit record. |
| COL-04 | Mention existing project members in comments using stored member IDs. Display mentions and create in-app notifications. No email or push notification dependency. |
| COL-05 | Show chronological per-item activity including status, assignment, estimates, scope, comments, checklist changes, and attachments, with actor and time. System events are not editable by members. |

### Release experience and evidence — Increment 4 and closure

| ID | Requirement and acceptance criteria |
| --- | --- |
| REL-01 | One-click PDF and CSV sprint summaries include project/sprint, goal, dates/timezone, commitment, scope changes, delivered/unresolved points, completion percentage, and per-item outcomes. Exports match the same metrics dataset as the dashboard. Completed sprint results do not change after later item edits. |
| REL-02 | Members except Viewers can attach PDF, PNG, JPEG, and plain-text files up to 10 MB each, subject to the configured project storage budget. Private files are accessible only to current project members; no public bucket or permanent public links. |
| REL-03 | First-use onboarding explains backlog → plan → start → board → complete → analytics. Account owner creates the first project; assessors use seeded demo data or a Viewer role. |
| REL-04 | Provide keyboard-accessible board actions, visible focus, labelled controls, modal focus management, non-colour-only status cues, responsive layouts, and usable chart data tables. |
| REL-05 | Seed synthetic users, a private sample project, a planned sprint, an active sprint, completed sprints, history, comments, epics, and labels. Demo credentials travel outside Git; no real passwords in fixtures. |
| DOC-01 | Maintain setup instructions, architecture decisions, data dictionary, API contract, deployment/recovery guide, and a user guide. |
| PROC-01 | Record charter, vision, product goal, team roles, Definition of Ready/Done, estimated initial backlog, sprint capacity/release plan, working agreements, and repository/CI setup. |
| PROC-02 | For each sprint retain planning commitment, dated standup logs, refinement notes, review/demo evidence, retrospective/action items, backlog snapshots, and chart exports. Collection starts in Sprint 0 using external/manual records until the relevant product features exist. Synthetic seeds demonstrate functionality and never count as evidence of actual team delivery. |
| PROC-03 | Compile technical/user documentation, continuous process portfolio, final report/defence materials, UAT results, and project retrospective at closure. Versioned Markdown/PDF/CSV files satisfy evidence capture; dedicated ceremony-management screens are not required. |

## 5. Metric and time rules

1. Store instants as PostgreSQL `timestamptz` in UTC and retain the project's IANA timezone. Default new projects to Asia/Karachi. Interpret planned dates in that timezone. Daily samples cover local midnight boundaries; current day's value is labelled partial.
2. Sprint start freezes each original item's points. Each later allocation to an active sprint records its points at entry. Items already in Done cannot enter a sprint. Sprint-local events capture the carried-in status of each item.
3. Original commitment `C` is the sum of frozen starting points. Its remaining line is `C - credited_original_points(t)`. Credit uses starting points and the item's latest sprint-local status at `t`. Removing an unfinished item does not burn its points; changes made outside that sprint cannot complete its original commitment. Re-addition resumes tracking sprint-local status. Reopening an included Done item restores its points.
4. Current-scope remaining is the sum of entry estimates for included, non-Done items at `t`. Removal can reduce this line, so scope changes are displayed explicitly. An item can leave and re-enter, but has only one active membership interval at a time. Allocation and removal events store enough state to reconstruct both lines without looking at mutable item rows.
5. Ideal remaining is `C × max(0, 1 - elapsed / planned_duration)`, measured using elapsed calendar time between actual start and planned end. Reject starts at/after planned end. After planned end the ideal is zero; real remaining can stay above zero. Calendar days, including weekends, are the initial default.
6. Velocity is the sum of each unique item's entry points if it is included and Done at sprint completion. Removed items are not delivered by that sprint. Show original-commitment delivered points separately using original estimates. Snapshot both values. A carried unfinished item earns no points in the old sprint and can earn points in the sprint that completes it.
7. CFD counts each item included in the sprint at the sample cutoff once under its last known status. Scope removal changes total count and is annotated. At completion freeze the sprint's final membership before carryover; later sprint allocations cannot rewrite the chart.
8. Completion percentage is original-commitment delivered points / `C × 100`; if `C = 0`, show N/A. Checklist percentages never substitute for delivered story points. Partially completed work earns zero delivered points.
9. Authoritative events have database timestamps and a monotonically allocated per-project sequence. Write transactions serialise sequence allocation immediately before commit and capture event time after obtaining the counter lock. Replay uses project sequence; timestamps assign events to daily boundaries. The final snapshot records its cutoff sequence. Never order events by client timestamps or PostgreSQL's transaction-start `now()` value.
10. Reports remain rebuildable from history. Version the metric algorithm in stored completed-sprint results so later formula changes do not silently alter submitted evidence.

### Reference acceptance fixture

Start a sprint with A=3 and B=5 points (`C=8`). Complete A: original/current remaining become 5/5. Add C=2: values become 5/7. Remove unfinished B: values become 5/2. Complete C: values become 5/0. At completion velocity is 5 (A+C), original delivered is 3, and original completion is 37.5%. CFD ends with two Done items. Later completing B elsewhere changes none of these completed-sprint results.

## 6. Quality, security, and concurrency requirements

| ID | Measurable target or invariant |
| --- | --- |
| SEC-01 | RLS protects every exposed project table and file access path. Anonymous callers have no project access. Direct inserts/updates/deletes to domain/history tables are denied to normal API roles; authorised database functions are the write boundary. |
| SEC-02 | Every write derives actor identity from the authenticated session, checks current membership and role, validates all IDs and fields, and records history in the same transaction. Never trust a supplied actor ID or role. |
| SEC-03 | No service-role key, database password, deployment token, private invite material, or real account password in Git/client bundles/logs. Provisioning credentials exist only in restricted operator/CI contexts. |
| SEC-04 | Login/provisioning/password changes have provider throttling plus persistent application throttling where needed. Do not use per-process memory as the only limiter on Vercel. Protected pages and responses are private and never shared-cache user data. |
| SEC-05 | Rich-text/file/CSV exports resist script injection, unsafe filenames, and spreadsheet formula injection. Attachment downloads force safe content handling; SVG, HTML, and executable types are excluded. |
| CON-01 | Editable entities use integer versions. Two writers submitting the same version cannot both overwrite a row. Conflict responses preserve the user's attempted edit for review. |
| CON-02 | *Deferred to Increment 4 by [ADR-012](docs/adr/012-concurrency-scope-trim.md).* Mutations include a UUID idempotency key, scoped to actor and project. Repeating an identical key/payload returns its recorded result; reusing a key with a different payload is rejected. |
| CON-03 | Sprint lifecycle/scope locks coordinate with board edits. Reads remain available. Database constraints enforce one active sprint, valid estimates/statuses, and same-project relationships even under concurrent requests. |
| CON-04 | Item state/history and sprint snapshots cannot diverge after failures, retries, reconnects, or process termination. Storage operations use a recoverable pending/finalised lifecycle because files and SQL are not one transaction. |
| PERF-01 | Initial design envelope: 20 simultaneous active users, 10,000 stored items/project, up to 500 in an active sprint. These are benchmark targets, not Supabase Free guarantees. |
| PERF-02 | In a representative deployment/load test, target p95 protected read ≤1 second and card mutation ≤1.5 seconds excluding intentional cold-start investigation; charts ≤2 seconds for 30 days/500 sprint items. Measure end-to-end browser timings and database work separately. |
| PERF-03 | Visible boards receive changes in about five seconds at p95 under the demo envelope. Poll compact version metadata, fetch only changed views, pause hidden tabs, paginate backlogs, and render visible board cards efficiently. Do not reload entire histories every poll. |
| OPS-01 | Successful local migrations from a clean database, automated checks, reproducible seed data, a deployed health endpoint, database plus attachment backups, and a rehearsed restore are release gates. |
| OPS-02 | Free infrastructure is best-effort; no availability SLA is promised. Proposed course recovery targets are RPO ≤24 hours and RTO ≤4 hours, contingent on the backup/restore drill. |

## 7. Delivery plan and Definition of Done

Sprint lengths and actual dates remain open. Keep the WBS sequence; prioritise board correctness/concurrency rather than custom authentication work.

| Stage | Demonstrable outcome | Release gate |
| --- | --- | --- |
| Sprint 0 | Deployed empty shell; migrations, RLS, core event schema, design tokens, CI, seed tooling, architecture records | Clean setup and deploy; anonymous/cross-project access tests pass |
| Increment 1 | Username login, private project, memberships, rich-text backlog, estimates/reordering | Role matrix and version-conflict checks; creation/history consistency |
| Increment 2 | Capacity planning, sprint lifecycle/snapshot, collaborative board | Start/complete races, same-card conflicts, independent-card writes, rollback and idempotency tests |
| Increment 3 | Correct charts, WIP warnings, taxonomy, comments/mentions, search | Metric reference fixture and scope/reopening/carryover fixtures; use product for remaining course work |
| Increment 4 | PDF/CSV, private attachments, onboarding, usability/performance fixes | E2E permissions/UAT, export parity, backup restore, demo rehearsal |
| Closure | Full process portfolio, technical/user guide, report and defence | Evidence exists for each sprint; final retrospective |

Definition of Ready: actor/value, acceptance criteria, scope, dependencies, estimate, and test strategy are clear; item fits one sprint. Definition of Done: acceptance criteria demonstrated, relevant automated checks pass, backend permissions verified, migrations/docs updated, deployed demo works, and evidence is recorded. Security, history integrity, and data-isolation defects block release.

## 8. Required validation scenarios

- Two separate projects and all four roles: cross-project reads, RPCs, exports, files, and guessed IDs fail.
- Direct Data API writes cannot bypass RPCs; forged actor IDs/roles and mixed-project child IDs fail.
- Same-card simultaneous changes yield one success and one conflict. Different-card changes succeed independently. No history exists for a rolled-back write.
- Concurrent start requests produce one active sprint/snapshot; complete vs move/allocation yields a coherent cutoff. Retries never duplicate events.
- Concurrent member removal vs write honours transactional authorisation; subsequent requests fail after removal.
- Concurrent reorder attempts do not lose updates; WIP warnings reflect the refreshed count.
- Metric replay covers null estimates, midnight/timezones, reopening, scope additions/removals/re-additions, estimate changes outside a sprint, early completion, and carryover.
- Browser reconnect/focus and an unavailable backend do not show unsaved edits as committed. Visible-tab freshness meets the measured target.
- Private attachment URL guessing, oversized/disallowed files, abandoned uploads, and member revocation behave as specified.
- PDF/CSV equal dashboard metrics; CSV formulas and rich text are safe; modal and board are keyboard usable.

## 9. WBS traceability

Ranges below include every leaf deliverable in that part of the PDF.

| WBS leaves | Specification / evidence |
| --- | --- |
| 1.1–1.7 | PROC-01; section 7; architecture ADRs; deployment CI |
| 2.1–2.6 | PROC-02; metrics definitions; per-sprint process portfolio |
| 3.1–3.7 | architecture.md; deployment.md; Sprint 0 release gate |
| 4.1 | AUTH-01–03; public self-registration deferred by the team's ID/password scope ([ADR-013](docs/adr/013-wbs-deviations.md)) |
| 4.2–4.3 | PROJ-01–05; permission matrix |
| 4.4–4.8 | ITEM-01–08 |
| 4.9 | Increment 1 release gate and demo evidence |
| 5.1–5.5 | SPR-01–07; metric/time rules |
| 5.6–5.8 | BOARD-01–06 |
| 5.9 | Increment 2 release gate and demo evidence |
| 6.1–6.6 | MET-01–05; BOARD-05 |
| 6.7–6.9 | COL-01–05 |
| 6.10 | Increment 3 release gate and demo evidence |
| 7.1–7.5 | REL-01–05; PERF-01–03 |
| 7.6–7.9 | Section 8; Increment 4 release gate; deployment and UAT/demo evidence |
| 8.1–8.5 | DOC-01; PROC-02–03; closure gate |

## 10. Remaining decisions

These defaults permit implementation planning; they are not additional confirmed user answers.

| Question | Proposed default |
| --- | --- |
| Does “ID” mean username or email? | **Decided:** username; no email dependency. |
| Can Developers edit others' items and estimates? | Yes, within their project; active-sprint estimates stay locked. |
| Should Done enforce completed criteria/checklists? | Yes; see BOARD-06. |
| How long is each sprint and when is submission? | Decide before scheduling; do not invent calendar dates. |
| How are initial users created and forgotten passwords recovered? | Operator provisioning/reset tooling; no public registration/reset. |

## 11. Supporting official documentation

Provider capabilities were checked while preparing this plan. Design decisions and acceptance targets above belong to this project.

- [Next.js authentication and authorisation](https://nextjs.org/docs/app/guides/authentication)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase private storage](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
