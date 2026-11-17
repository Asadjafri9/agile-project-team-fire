# Tech Stack

## Overview

Team Fire is a full-stack TypeScript web application. [AGENTS.md](../../AGENTS.md) and the accepted [architecture](../../architecture.md) govern implementation; this file gives specs.md agents a compact entry point.

## Languages and framework

- TypeScript in strict mode, Next.js App Router, React, and Node 24 LTS.
- Tailwind CSS for styling; use existing components and design tokens before adding UI packages.
- Use pnpm with pinned dependency versions and the committed lockfile. Do not add an npm or Yarn lockfile.

## Authentication

Supabase Auth owns credentials and sessions. Protected requests use the end user's identity. Follow the current [requirements](../../requirements.md) and ADRs for signup and account provisioning policy; do not infer policy from a prototype.

## Infrastructure and deployment

GitHub Actions runs checks. The documented delivery targets are Vercel for the Next.js app and Supabase for PostgreSQL, Auth, and private Storage. Follow the branch and environment gates in [deployment.md](../../deployment.md) and [AGENTS.md](../../AGENTS.md).

## Decision relationships

The single Next.js application keeps UI and API contracts together. Supabase PostgreSQL owns transactional domain rules, so no separate ORM migration system or backend service is introduced.
