Title: [INTEG] frontend: legacy prototype files fail the new branch ownership guard
Found by: codex/frontend on fe/wbs-3-4-frontend-sync@768064f
Affects: Systems and Backend — AGENTS.md:228-240; scripts/branch-guard.sh:48-59; root documents and config, src/lib/*, ui-ux-pro-max/*, pnpm-workspace.yaml
Severity: high
What is wrong: The local frontend prototype was committed before the remote team ownership rules were introduced. After syncing origin/frontend into a fe/* task branch, the guard classifies existing prototype files in src/lib as Backend, root documentation and scripts as Systems, and pnpm-workspace.yaml and most ui-ux-pro-max data as unowned. The pnpm migration needs pnpm-workspace.yaml to approve esbuild's install script.
Evidence: `C:\Program Files\Git\bin\bash.exe scripts/branch-guard.sh fe/wbs-3-4-frontend-sync frontend origin/frontend...HEAD` exits 1 with `branch-guard: 53 violation(s)`. `corepack.cmd pnpm typecheck`, `corepack.cmd pnpm test` (4 tests), and `corepack.cmd pnpm build` pass locally.
Impact: A PR from this synced task branch into frontend would fail the ownership check, despite the locally working prototype and resolved merge. WBS 3.4 frontend work cannot be promoted through the stated branch flow.
Suggested fix: Systems should assign pnpm-workspace.yaml and the ui-ux-pro-max package in the ownership map, and decide whether prototype-only src/lib files move into a frontend-owned path or receive a narrow exception. Split or cherry-pick the pre-governance root-document/config changes into the proper Systems branch before a frontend PR. The frontend team can then create a compliant task branch without rewriting shared history.
Blocks promotion?: yes
Labels: type:integration, area:systems, sev:high, agent-report
