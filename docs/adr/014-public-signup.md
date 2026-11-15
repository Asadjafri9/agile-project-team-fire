# ADR-014 — Public self-service signup

Status: Accepted · Date: 2026-11-15 · Decider: Systems Architect · Amends: requirements AUTH-03 · Supersedes: ADR-013 row for WBS 4.1

## Context
AUTH-03 disabled public signup and ADR-013 recorded "no public registration" as a deviation from WBS 4.1 ("Registration, login, session handling, logout"). Assessors grade against the WBS, and new users had no way in without an operator. The Systems Architect decided to deliver registration.

## Decision
- Anyone can create an account from the home page (**Create account**): username, display name, password.
- Usernames map to `<username>@accounts.team-fire.invalid`; no real email is collected, so there is no email confirmation (`mailer_autoconfirm = true`) and no email-based password reset. Password resets stay with the operator (`scripts/accounts.mjs reset`).
- Passwords: 10–72 characters (enforced by Supabase Auth `password_min_length`), and must not contain the username.
- The database trigger `handle_new_auth_user` is the gate: it rejects any identity outside the internal domain, malformed usernames, empty or long display names and taken usernames — so calling the Supabase Auth API directly with the public key cannot bypass the rules.
- A new account belongs to no project. It can create a project (becoming its Product Owner and owner, PROJ-01) or be invited by username (PROJ-02). RLS keeps every other project invisible.
- Reserved usernames (admin, root, support, system, operator, team-fire) are refused by the signup route.
- `scripts/apply-hosted.mjs` applies this policy; `PUBLIC_SIGNUP=false` switches signup off again without code changes.

## Consequences
- WBS 4.1 is delivered in full; the ADR-013 deviation for 4.1 no longer applies.
- Anyone on the internet can create an account. Supabase Auth's built-in per-IP rate limits apply; there is no CAPTCHA. Accounts can be disabled by the operator (AUTH-02 enforcement is unchanged).
- Lost passwords need the operator, because there is no email channel.
- Tests: `tests/e2e/signup-api.mjs` (validation, duplicates, session, isolation, direct Auth bypass attempts).
