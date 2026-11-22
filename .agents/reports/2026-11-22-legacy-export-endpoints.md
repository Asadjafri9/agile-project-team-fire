Title:    [CONTRACT] be: unused export and analytics endpoints contradict the sprint dataset
Found by: claude-code/frontend on fe/SPR-01-sprint-timeline-ui@0c6f9cc
Affects:  Backend (by function) — `src/pages/api/projects/[projectId]/export.js`, `src/pages/api/projects/[projectId]/sprints/[sprintId]/analytics.js`. `src/pages/**` is not in the AGENTS.md section 7 ownership map, so Systems also needs to assign it.
Severity: low
Labels:   type:contract, area:backend, sev:low, agent-report

What is wrong:
`export.js` serves a "sprint_summary" CSV built from current `work_items` rows filtered by their current `sprint_id`. `analytics.js` returns the commitment total plus the whole project's status log. Neither replays sprint events or honours the frozen cutoff.

Evidence:

```js
// export.js
.from('work_items').select('*').eq('project_id', projectId).eq('sprint_id', sprintId)
// analytics.js
.from('work_item_status_history').select('*').eq('project_id', projectId)
```

`git grep -nE "/export|/analytics|api/projects/" -- src/components src/features` finds no UI caller of either endpoint.

Impact:
Anyone calling these URLs directly gets numbers that differ from the dashboard, CSV and PDF. For a completed sprint, carried-over items are missing entirely. This conflicts with REL-01 and FR-5.

Suggested fix:
Remove both endpoints, or rebuild them on the shared event-replay dataset.

Blocks promotion?: no
