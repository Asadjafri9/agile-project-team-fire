Title:    [DEP] be: workspace event history is silently capped at 1000 rows
Found by: claude-code/frontend on fe/SPR-01-sprint-timeline-ui@0c6f9cc
Affects:  Backend — `src/lib/workspace/server.js:60,67`, `supabase/config.toml:13`
Severity: high
Labels:   type:dependency, area:backend, sev:high, agent-report

What is wrong:
`loadWorkspace` reads `work_item_status_history` and `sprint_scope_events` for all of a user's projects in one request each, ordered by ascending `seq`, with no pagination. PostgREST returns at most `max_rows` rows without reporting an error.

Evidence:
Found by reading the code and configuration. It was not reproduced, because that needs a PostgREST stack, and the hosted setting was not inspected.

```
supabase/config.toml:13   max_rows = 1000
server.js:60              .from('work_item_status_history') ... .order('seq')
server.js:67              .from('sprint_scope_events') ... .order('seq')
```

To confirm, insert more than 1000 history rows across a user's projects on a local Supabase stack, call `GET /api/workspace`, and count the status events.

Impact:
MET-01, MET-02 and MET-04. Past the limit the newest events are the ones dropped, so recent completions disappear from burndown, cumulative flow and exports.

Suggested fix:
Page with `.range()` until a short page is returned, or serve events per sprint through an RPC. Add a test with more than 1000 rows.

Blocks promotion?: no, while the data volume is below the limit
