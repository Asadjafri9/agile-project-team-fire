#!/usr/bin/env node
// Apply migrations + demo seed to a hosted Supabase project through the
// Management API (for environments with no direct Postgres access).
//
//   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/apply-hosted.mjs inspect
//   ... DEMO_PASSWORD=... node scripts/apply-hosted.mjs apply
//
// Human-in-the-loop gate (AGENTS.md §4): run only with the Systems Architect's
// approval. Migrations are recorded in supabase_migrations.schema_migrations so
// the Supabase CLI sees the same history later.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const mode = process.argv[2] ?? 'inspect';
if (!TOKEN || !REF) { console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF'); process.exit(2); }

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : null;
};
const sql = query => api('/database/query', { method: 'POST', body: JSON.stringify({ query }) });

async function inspect() {
  const [tables] = [await sql(`select table_schema || '.' || table_name as t from information_schema.tables
    where table_schema in ('public', 'supabase_migrations') order by 1`)];
  const history = await sql(`select to_regclass('supabase_migrations.schema_migrations') is not null as present`);
  const applied = history[0]?.present ? await sql('select version from supabase_migrations.schema_migrations order by 1') : [];
  const auth = await api('/config/auth');
  return { tables: tables.map(r => r.t), applied: applied.map(r => r.version), disableSignup: auth.disable_signup };
}

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

const state = await inspect();
console.log('public tables:', state.tables.filter(t => t.startsWith('public.')).join(', ') || '(none)');
console.log('recorded migrations:', state.applied.join(', ') || '(none)');
console.log('signup disabled:', state.disableSignup);

if (mode !== 'apply') process.exit(0);

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 10) { console.error('Set DEMO_PASSWORD (10+ chars)'); process.exit(2); }

await sql(`create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);

for (const file of files) {
  const version = file.split('_')[0];
  if (state.applied.includes(version)) { console.log(`skip   ${file} (recorded)`); continue; }
  const body = readFileSync(join(migrationsDir, file), 'utf8');
  console.log(`apply  ${file}`);
  // One request = one transaction: the migration and its history row land together.
  await sql(`begin;\n${body}\n;insert into supabase_migrations.schema_migrations (version, name)
    values ('${version}', '${file.replace(/^\d+_|\.sql$/g, '')}') on conflict do nothing;\ncommit;`);
}

console.log('seed   supabase/seed-demo.sql');
const seed = readFileSync(join(process.cwd(), 'supabase', 'seed-demo.sql'), 'utf8')
  .replaceAll('__DEMO_PASSWORD__', password.replaceAll("'", "''"));
await sql(seed);

// ADR-014: public signup is on by default. Usernames map to an internal address,
// so email confirmation is impossible and is skipped; the account trigger
// (migration 20261115030000) validates every identity instead.
const publicSignup = (process.env.PUBLIC_SIGNUP ?? 'true') !== 'false';
console.log(`auth   public signup ${publicSignup ? 'ON' : 'OFF'} · min password 10 (ADR-014)`);
await api('/config/auth', { method: 'PATCH', body: JSON.stringify({
  disable_signup: !publicSignup, mailer_autoconfirm: true, password_min_length: 10,
}) });

const [counts] = await sql(`select (select count(*) from public.work_items) as items,
  (select count(*) from public.profiles) as profiles, (select count(*) from public.sprints) as sprints,
  (select count(*) from public.sprint_scope_events) as scope_events,
  (select count(*) from pg_policies where schemaname = 'public') as policies,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) as tables_without_rls`);
console.log('verify', counts);
if (Number(counts.tables_without_rls) !== 0) { console.error('FAIL: a public table has RLS disabled'); process.exit(1); }
console.log('done');
