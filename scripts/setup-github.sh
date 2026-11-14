#!/usr/bin/env bash
# setup-github.sh — one-time label setup for the agent issue workflow (AGENTS.md §3).
# Requires: gh CLI authenticated with triage (or higher) access to the repository.
# Usage: scripts/setup-github.sh [owner/repo]
set -euo pipefail
repo="${1:-Asadjafri9/agile-project-team-fire}"

label() { # name colour description
  gh api -X POST "repos/${repo}/labels" -f name="$1" -f color="$2" -f description="$3" >/dev/null 2>&1 \
    && echo "created  $1" \
    || { gh api -X PATCH "repos/${repo}/labels/$(printf %s "$1" | sed 's/:/%3A/g')" -f color="$2" -f description="$3" >/dev/null 2>&1 \
         && echo "updated  $1" || echo "FAILED   $1"; }
}

label "agent-report"     "5319e7" "Cross-department finding raised by an agent (AGENTS.md §3)"
label "needs-human"      "b60205" "Agent stopped at a human-in-the-loop gate (AGENTS.md §4)"
label "blocker"          "d93f0b" "Blocks promotion from agentic-integration to testing"
label "promotion-request" "0e8a16" "Integration agent reports agentic-integration is ready for testing"

label "type:security"    "b60205" "Security finding"
label "type:dependency"  "fbca04" "Dependency or version problem"
label "type:contract"    "1d76db" "Frontend/backend contract change or request"
label "type:integration" "c5def5" "Breaks only when departments are merged"
label "type:build"       "bfd4f2" "Build, CI or tooling failure"

label "area:frontend"    "0052cc" "Owned by Frontend"
label "area:backend"     "006b75" "Owned by Backend"
label "area:systems"     "5f4b8b" "Owned by Systems / CI-CD"
label "area:integration" "c2e0c6" "Owned by Integration"

label "sev:high"         "d93f0b" "High severity"
label "sev:medium"       "fbca04" "Medium severity"
label "sev:low"          "c2e0c6" "Low severity"
