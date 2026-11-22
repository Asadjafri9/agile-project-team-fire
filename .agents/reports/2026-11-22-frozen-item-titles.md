Title:    [CONTRACT] be: contract request for item key and title frozen with the sprint
Found by: claude-code/frontend on fe/SPR-01-sprint-timeline-ui@0c6f9cc
Affects:  Backend — `src/lib/workspace/server.js:57,158`, sprint commitment and result storage. Consumer: `src/features/demo/metrics.ts:217`
Severity: medium
Labels:   type:contract, area:backend, sev:medium, agent-report

What is wrong:
The workspace contract has no historical item key or title. Completed-sprint outcomes must look them up in current item rows, and archived items are not returned at all.

Evidence:
1. Generate the CSV of completed Sprint 01 with `sprintSummaryCsv(sprintSummary(project, sprint))`.
2. Rename one of its items and generate it again.
3. The two files differ in the Title column. Numbers, dates, statuses and timeline rows are identical.

If the item is archived instead, its key and title both fall back to the UUID.

Impact:
The Bolt 003 criterion "completed-sprint exports remain unchanged after later edits to item rows" is only partly met. REL-01 and architecture section 8 ("current item titles must not replace their historical values") are affected.

Suggested fix:
Capture key and title for every item that was in the sprint, including mid-sprint additions, no later than completion. Expose them additively, for example `result.items: { itemId, key, title }[]`. State the backfill limitation for existing sprints. The frontend will then prefer these values.

Blocks promotion?: no
