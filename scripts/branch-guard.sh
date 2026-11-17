#!/usr/bin/env bash
# branch-guard.sh — enforces the Team Fire branch flow and path ownership (AGENTS.md §1, §7).
#
# Usage:  scripts/branch-guard.sh <head-branch> <base-branch> [<diff-range>]
#   <diff-range> defaults to "origin/<base>...HEAD".
# Exit 0 = allowed, 1 = blocked. Runs in CI on every pull request; agents can run it locally
# before opening a PR.
set -euo pipefail

head="${1:?head branch required}"
base="${2:?base branch required}"
range="${3:-origin/${base}...HEAD}"

errors=0
err()  { echo "::error::$1"; errors=$((errors + 1)); }
warn() { echo "::warning::$1"; }

# ---------------------------------------------------------------- 1. Branch flow
flow_ok=false
case "$base" in
  main)                [[ "$head" == "testing" ]] && flow_ok=true ;;
  testing)             [[ "$head" == "agentic-integration" || "$head" == "main" ]] && flow_ok=true ;;
  agentic-integration) [[ "$head" =~ ^(frontend|backend|systems|testing|main)$ || "$head" == int/* ]] && flow_ok=true ;;
  frontend)            [[ "$head" == fe/* || "$head" =~ ^(agentic-integration|main)$ ]] && flow_ok=true ;;
  backend)             [[ "$head" == be/* || "$head" =~ ^(agentic-integration|main)$ ]] && flow_ok=true ;;
  systems)             [[ "$head" == sys/* || "$head" == ci/* || "$head" =~ ^(agentic-integration|main)$ ]] && flow_ok=true ;;
  *)                   flow_ok=true ;;  # PRs into personal/task branches are not restricted
esac

if ! $flow_ok; then
  err "Branch flow violation: '$head' → '$base' is not allowed. See AGENTS.md §1 and docs/systems/branching.md."
fi

# ---------------------------------------------------------------- 2. Path ownership
# Only task branches are path-checked. Department→integration and sync merges carry
# already-reviewed work from several departments.
role=""
case "$head" in
  fe/*)        role="frontend" ;;
  be/*)        role="backend" ;;
  sys/*|ci/*)  role="systems" ;;
  int/*)       role="integration" ;;
esac

owner_of() {
  local f="$1"
  case "$f" in
    supabase/*|src/app/api/*|src/lib/*|src/middleware.ts|src/features/*/server/*|src/features/*/api/*|docs/api/*)
      echo backend ;;
    tests/e2e/*)
      echo integration ;;
    package.json|pnpm-lock.yaml)
      echo shared ;;
    docs/design/*|dashboard-mockup/*|public/*|src/app/*|src/components/*|src/features/*|src/styles/*|tailwind.config.*|postcss.config.*|components.json)
      echo frontend ;;
    memory-bank/project.yaml|memory-bank/standards/*)
      echo systems ;;
    memory-bank/*)
      echo process ;;
    AGENTS.md|CLAUDE.md|GEMINI.md|*.md|*.pdf|docs/*|.github/*|.claude/*|.codex/*|.specsmd/*|scripts/*|.agents/*|tsconfig*.json|next.config.*|eslint.config.*|.eslintrc*|vitest.config.*|playwright.config.*|.nvmrc|.gitignore|.env.example|vercel.json)
      echo systems ;;
    *)
      echo unowned ;;
  esac
}

if [[ -n "$role" ]]; then
  mapfile -t files < <(git diff --name-only "$range")
  for f in "${files[@]}"; do
    [[ -z "$f" ]] && continue
    owner="$(owner_of "$f")"
    # Any role may add a cross-department report file (AGENTS.md §3.2).
    if [[ "$f" == .agents/reports/* ]]; then continue; fi
    case "$owner" in
      "$role") ;;
      process) ;;
      shared)
        if [[ "$role" == frontend || "$role" == backend ]]; then
          warn "$f is shared — list the change under 'Dependencies changed' in the PR description."
        else
          err "$f is shared (frontend/backend). $role branches may not edit it."
        fi ;;
      unowned)
        if [[ "$role" == integration ]]; then
          warn "$f is unowned — Systems Architect must add it to the ownership map."
        else
          err "$f is not in the ownership map (AGENTS.md §7). Ask the Systems Architect to assign it."
        fi ;;
      *)
        if [[ "$role" == integration ]]; then
          warn "Integration fix touches $owner-owned file $f — glue changes only (AGENTS.md §5.4)."
        else
          err "$role branch '$head' edits $owner-owned file: $f — open an issue for the $owner team instead (AGENTS.md §3)."
        fi ;;
    esac
  done
fi

# ---------------------------------------------------------------- 3. Secrets tripwire
if git diff --name-only "$range" | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$' >/dev/null; then
  err "A .env file is in this PR. Remove it and rotate anything it contained."
fi

if (( errors > 0 )); then
  echo "branch-guard: $errors violation(s)."
  exit 1
fi
echo "branch-guard: '$head' → '$base' OK."
