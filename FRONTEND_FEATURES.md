# Frontend feature checklist

Source: [WBS_Agile_PM_Platform.pdf](WBS_Agile_PM_Platform.pdf), pages 3–5. The WBS identifies deliverables for the whole course project. This checklist extracts **user-facing frontend work only**; backend, infrastructure, and course process deliverables remain outside this frontend prototype's implementation scope. Team-wide work follows [AGENTS.md](AGENTS.md).

The repository currently contains a **sample-data prototype**. “Present” below means the interface works with browser-local sample data, not with real accounts or shared server data. “Partial” means some requested interaction is present but the WBS feature is incomplete. “Needed” means there is no functional frontend for that feature yet. WBS references are traceability identifiers, not implementation instructions.

| WBS | Frontend feature to deliver | Current frontend |
| --- | --- | --- |
| 3.4–3.5 | App shell, project navigation, responsive layout, shared tokens and base components, loading/empty/error states. | **Partial:** shell and design tokens exist; continue accessibility and state polish. |
| 4.1 | Sign-in, session-expired, and sign-out screens and form states. The WBS also lists registration, but [requirements.md](requirements.md) defers public self-registration for the initial release. For frontend-only work, account flows must remain clearly simulated. | **Needed:** current “Explore demo” entry deliberately has no authentication. |
| 4.2–4.3 | Project creation, teammate invitation flow, project member list, role assignment controls, and permission-aware UI for Product Owner, Scrum Master, Developer, and Viewer. | **Partial:** local project creation, member list, and demo role switch work; invitation and per-project role editing are previews. |
| 4.4 | Create, view, edit, and archive story, bug, and technical-task work items; show useful confirmation, validation, and empty states. The WBS says delete; [ADR-013](docs/adr/013-wbs-deviations.md) records the team's archive decision. | **Partial:** create and detail view work; description edit is available, but full field editing and archive are missing. |
| 4.5–4.6 | Rich-text description editor, editable acceptance criteria and subtasks, checklist controls, and visible completion percentage. | **Partial:** plain-text description and checklist toggles exist; rich text, checklist authoring, and percentage are missing. |
| 4.7 | Story-point selector limited to **1, 2, 3, 5, 8, 13** and priority selector **Low, Medium, High, Critical**, with clear unestimated state. | **Partial:** fields exist, but points are unrestricted and the UI uses “Urgent” instead of the WBS's “Critical.” |
| 4.8 | Drag-and-drop backlog prioritization with an accessible keyboard alternative and visible ordering. | **Partial:** accessible up/down buttons work; drag ordering is missing. |
| 5.1–5.3 | Sprint list and planning form for goal, dates/duration, team hours, story-point capacity, and backlog-to-sprint allocation. Show capacity warnings without conflating hours and points. | **Present** in the local prototype. |
| 5.4–5.5 | Start/complete sprint controls, carry-over view for unresolved items, and visible frozen original commitment. | **Partial:** lifecycle and commitment snapshot work; unresolved items return to the backlog, but there is no explicit carry-over review. |
| 5.6–5.8 | Five-column board (To Do, In Progress, Code Review, Testing, Done), drag movement plus keyboard status control, task detail modal with status and editing, and clear move feedback. | **Partial:** board and movement work locally; status updates are on cards, not in the detail modal. |
| 6.2–6.5 | Analytics dashboard with burndown (original/current/ideal and scope changes), completed-sprint velocity, and item-count cumulative flow, with readable legends, units, time context, and data tables. | **Present** using local event history and commitment snapshots. |
| 6.6 | WIP counts and warnings on board columns, plus a frontend control for changing limits. | **Partial:** warnings work; limit settings are preview only. |
| 6.7–6.8 | Search/filter by task name, assignee, tag, and epic; show and manage epic, label, and tag taxonomy in item and backlog views. | **Partial:** key/title and assignee filters exist; tag/epic filters and taxonomy editing are missing. |
| 6.9 | Item comments, teammate mentions, and per-item activity timeline with clear local/demo states. | **Needed.** |
| 7.1 | Sprint summary screen with user-facing PDF and CSV export controls and meaningful generated file/download feedback. | **Needed.** |
| 7.2 | Work-item attachment list, add/remove interface, file type/size validation, and preview states; do not imply a real upload. | **Partial:** attachment preview dialog exists but upload and list interactions do not. |
| 7.3 | First-use onboarding or contextual guidance for the project → backlog → sprint → board → analytics journey. | **Needed:** entry screen introduces the demo, but no in-product onboarding exists. |

The following WBS items affect frontend presentation without automatically becoming product screens:

- **1.3, 2.1–2.6, 8.3:** Definitions of Ready/Done and ceremony artefacts can be surfaced as guidance, checklists, or an evidence index if the frontend is asked to support them. The current evidence index contains **synthetic examples**, not actual course evidence. Standup logs, review notes, retrospective actions, and portfolio compilation are project-process deliverables in the PDF; do not invent a backend workflow for them.
- **6.1 and the page 6 status-history note:** history-derived metrics need status/scope events. The frontend prototype already keeps local events and computes charts from them. A future connected data source is outside this frontend-only scope.
- **4.9, 5.9, 6.10, 7.4–7.7:** validate the frontend with usability, responsive, keyboard, accessibility, performance on large boards, and role-visibility checks. These are quality/acceptance work rather than additional screens.
- **3.1–3.3, 3.6–3.7, 7.8–7.9, 8.1–8.5:** architecture records, database/API work, CI, deployment, demonstrations, reports, and course documentation are not frontend features. A user guide may describe the UI, but it is not application functionality.

Frontend-only completion means each implemented interaction is visible and testable in the browser, its demo or preview nature is honest, and no remote service is required to run it.

Recommended implementation order for the remaining UI: finish work-item fields and backlog ordering (4.4–4.8); finish sprint and board details (5.4–5.8); add WIP settings, taxonomy filters, and collaboration (6.6–6.9); then add exports, attachment interactions, and onboarding (7.1–7.3). Sign-in and invitation screens (4.1–4.3) can be built as clearly labelled frontend simulations whenever that journey is needed; public registration stays deferred unless the product scope changes.
