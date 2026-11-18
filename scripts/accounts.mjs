#!/usr/bin/env node
// Operator account tooling (AUTH-03). Public signup is disabled, so accounts are
// provisioned here by the deployment operator — never by project managers.
//
//   export SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=…
//   node scripts/accounts.mjs create  <username> "<Display Name>" [title]   # prints a one-time password
//   node scripts/accounts.mjs reset   <username>                          # prints a new one-time password
//   node scripts/accounts.mjs disable <username>
//   node scripts/accounts.mjs enable  <username>
//   node scripts/accounts.mjs list
//
// Every action is written to public.operator_audit (who/what/when), and
// passwords are generated here, shown once, and never logged or stored in plain text.
import { randomBytes } from 'node:crypto';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const [cmd, rawUser, displayName, title = ''] = process.argv.slice(2);
if (!TOKEN || !REF || !cmd) {
  console.error('Usage: SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node scripts/accounts.mjs <create|reset|disable|enable|list> [username] ["Display Name"] [title]');
  process.exit(2);
}

const sql = async query => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
};
const lit = v => `'${String(v).replaceAll("'", "''")}'`;
const operator = process.env.OPERATOR ?? process.env.USER ?? 'operator';
const username = (rawUser ?? '').trim().toLowerCase();
if (cmd !== 'list' && !/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) {
  console.error('Username: 2-32 chars, lowercase letters, digits, dot, dash, underscore.');
  process.exit(2);
}
const email = `${username}@accounts.team-fire.invalid`;
const newPassword = () => `TF-${randomBytes(9).toString('base64url')}`;

await sql(`create table if not exists public.operator_audit (
  id bigserial primary key, at timestamptz not null default now(), operator text not null,
  action text not null, username text not null);
  alter table public.operator_audit enable row level security;
  revoke all on public.operator_audit from anon, authenticated;`);
const audit = action => `insert into public.operator_audit (operator, action, username) values (${lit(operator)}, ${lit(action)}, ${lit(username)});`;

if (cmd === 'list') {
  const rows = await sql(`select p.username, p.display_name, p.disabled_at is not null as disabled,
    coalesce(string_agg(pr.key || ':' || m.role, ', ') filter (where m.removed_at is null), '') as projects
    from public.profiles p left join public.project_members m on m.user_id = p.id
    left join public.projects pr on pr.id = m.project_id group by 1, 2, 3 order by 1`);
  console.table(rows);
} else if (cmd === 'create') {
  if (!displayName) { console.error('create needs a display name'); process.exit(2); }
  const password = newPassword();
  const [row] = await sql(`with u as (
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
      select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${lit(email)},
        extensions.crypt(${lit(password)}, extensions.gen_salt('bf')), now(), now(), now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', ${lit(displayName)}),
        '', '', '', '', '', '', '', ''
      where not exists (select 1 from auth.users where email = ${lit(email)})
      returning id)
    select id from u`);
  if (!row) { console.error(`Account ${username} already exists (use reset).`); process.exit(1); }
  await sql(`insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (${lit(row.id)}, ${lit(row.id)}, jsonb_build_object('sub', ${lit(row.id)}, 'email', ${lit(email)}, 'email_verified', true), 'email', now(), now(), now());
    insert into public.profiles (id, username, display_name, title) values (${lit(row.id)}, ${lit(username)}, ${lit(displayName)}, ${lit(title)})
      on conflict (id) do update set display_name = excluded.display_name, title = excluded.title;
    ${audit('create')}`);
  console.log(`Created ${username}. One-time password (share privately, ask them to change it): ${password}`);
} else if (cmd === 'reset') {
  const password = newPassword();
  const [row] = await sql(`update auth.users set encrypted_password = extensions.crypt(${lit(password)}, extensions.gen_salt('bf')), updated_at = now()
    where email = ${lit(email)} returning id`);
  if (!row) { console.error(`No account ${username}`); process.exit(1); }
  await sql(`delete from auth.refresh_tokens where user_id = ${lit(row.id)}::text; ${audit('reset-password')}`).catch(() => sql(audit('reset-password')));
  console.log(`Reset ${username}. New one-time password: ${password}`);
} else if (cmd === 'disable' || cmd === 'enable') {
  const [row] = await sql(`update public.profiles set disabled_at = ${cmd === 'disable' ? 'now()' : 'null'}
    where username = ${lit(username)} returning id`);
  if (!row) { console.error(`No account ${username}`); process.exit(1); }
  if (cmd === 'disable') await sql(`delete from auth.refresh_tokens where user_id = ${lit(row.id)}::text`).catch(() => {});
  await sql(audit(cmd));
  console.log(`${cmd === 'disable' ? 'Disabled' : 'Enabled'} ${username}.${cmd === 'disable' ? ' Server requests are refused from now on (AUTH-02).' : ''}`);
} else {
  console.error(`Unknown command ${cmd}`);
  process.exit(2);
}
