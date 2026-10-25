-- Seed Mock Data
-- Local development only. All accounts use the password: Password123!
-- NOTE: GoTrue requires aud/role/created_at and an auth.identities row; rows
-- inserted straight into auth.users without these fail login with 500.

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) VALUES
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin@accounts.team-fire.invalid',
   extensions.crypt('Password123!', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dev1@accounts.team-fire.invalid',
   extensions.crypt('Password123!', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   '', '', '', '', '', '', '', '');

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'email', 'admin@accounts.team-fire.invalid', 'email_verified', true, 'phone_verified', false),
   'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'email', 'dev1@accounts.team-fire.invalid', 'email_verified', true, 'phone_verified', false),
   'email', now(), now(), now());

INSERT INTO public.profiles (id, username, display_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin', 'System Admin'),
  ('00000000-0000-0000-0000-000000000002', 'dev1', 'Developer One');

INSERT INTO public.projects (id, name, key, owner_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Sample Agile Project', 'FIRE', '00000000-0000-0000-0000-000000000001');

INSERT INTO public.project_members (project_id, user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Product Owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002', 'Developer');
