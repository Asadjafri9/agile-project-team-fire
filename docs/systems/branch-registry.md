# Branch registry

The Systems agent keeps this file current. Add a row for any long-lived branch; task branches are not listed.

| Branch | Type | Created | Created from | Lead | Protection | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `main` | Production | 2026-10-21 (existing) | — | Systems Architect | Pending GitHub Pro | Merge from `testing` only |
| `testing` | Staging | 2026-10-21 | Governance bootstrap commit | Systems Architect | Pending GitHub Pro | Deploys to staging Supabase |
| `agentic-integration` | Integration | 2026-10-21 | Governance bootstrap commit | Integration agent / Systems Architect | Pending GitHub Pro | Issue verification point |
| `frontend` | Department | 2026-10-21 (existing) | Unrelated history, joined to governance bootstrap 2026-10-21 | TBD | Pending GitHub Pro | Holds `dashboard-mockup/` design reference |
| `backend` | Department | 2026-10-21 | Governance bootstrap commit | TBD | Pending GitHub Pro | — |
| `systems` | Department | 2026-10-21 | `main` + governance bootstrap | Systems Architect | Pending GitHub Pro | Source of `AGENTS.md`, ADRs, workflows |

## Team roster

| Person | GitHub handle | Department / role |
| --- | --- | --- |
| Systems Architect | @syedsibtainhaidergardezi-png | Systems, final approver for `testing` and `main` |
| Asad Jafri | @Asadjafri9 | Repository owner — TBD department |
| Arfeen Siddiqui | TBD | Frontend (pushed the first `frontend` commit) — confirm |
| TBD | TBD | Backend lead |
