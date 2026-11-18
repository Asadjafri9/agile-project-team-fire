-- Synthetic demo workspace for the hosted assessment project (REL-05).
-- The password is NOT stored here: replace __DEMO_PASSWORD__ at apply time.
-- Idempotent: safe to run more than once. Dates are relative to the apply day.
--
-- Accounts (username → role in project FIRE):
--   ayesha → Product Owner · hamza → Scrum Master · zara, bilal → Developer · assessor → Viewer
--   casey → no project yet (use it to try invitations)

-- 1. Accounts (the on_auth_user_created trigger creates each profile)
WITH accounts(id, username, display_name) AS (VALUES
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'ayesha', 'Ayesha Khan'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'hamza', 'Hamza Malik'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'zara', 'Zara Ahmed'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'bilal', 'Bilal Raza'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'assessor', 'Course Assessor'),
  ('a0000000-0000-4000-8000-000000000006'::uuid, 'casey', 'Casey Noor')
)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       username || '@accounts.team-fire.invalid',
       extensions.crypt('__DEMO_PASSWORD__', extensions.gen_salt('bf')),
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('display_name', display_name),
       '', '', '', '', '', '', '', ''
FROM accounts
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.id::text LIKE 'a0000000-0000-4000-8000-00000000000_'
ON CONFLICT (provider_id, provider) DO NOTHING;

-- Profiles: make sure they exist even if the trigger was added after the users.
INSERT INTO public.profiles (id, username, display_name, title) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'ayesha', 'Ayesha Khan', 'Product owner'),
  ('a0000000-0000-4000-8000-000000000002', 'hamza', 'Hamza Malik', 'Delivery lead'),
  ('a0000000-0000-4000-8000-000000000003', 'zara', 'Zara Ahmed', 'Frontend'),
  ('a0000000-0000-4000-8000-000000000004', 'bilal', 'Bilal Raza', 'Backend'),
  ('a0000000-0000-4000-8000-000000000005', 'assessor', 'Course Assessor', 'Read-only reviewer'),
  ('a0000000-0000-4000-8000-000000000006', 'casey', 'Casey Noor', 'New hire (not in any project yet)')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, title = EXCLUDED.title;

-- 2. Project and membership
INSERT INTO public.projects (id, name, key, description, owner_id, timezone)
VALUES ('f0000000-0000-4000-8000-000000000001', 'Team Fire', 'FIRE',
        'A focused workspace for planning and delivering the Agile PM platform.',
        'a0000000-0000-4000-8000-000000000001', 'Asia/Karachi')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.project_members (project_id, user_id, role) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Product Owner'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Scrum Master'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'Developer'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'Developer'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'Viewer')
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO public.project_revisions (project_id, board_revision)
VALUES ('f0000000-0000-4000-8000-000000000001', 1) ON CONFLICT (project_id) DO NOTHING;

-- 3. Sprints: one completed, one active, one planned
INSERT INTO public.sprints (id, project_id, name, goal, start_date, end_date, capacity_points, hour_capacity,
                            status, started_at, completed_at, result) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'Sprint 01',
   'Establish the product foundation', current_date - 26, current_date - 15, 18, 54, 'COMPLETED',
   (current_date - 26) + time '09:00', (current_date - 15) + time '12:00',
   jsonb_build_object('delivered', 16, 'originalDelivered', 16, 'commitment', 16,
                      'cutoff', (current_date - 15) + time '12:00')),
  ('b0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'Sprint 02',
   'Make planning and execution visible', current_date - 5, current_date + 6, 22, 72, 'ACTIVE',
   (current_date - 5) + time '09:00', NULL, NULL),
  ('b0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'Sprint 03',
   'Polish evidence and release readiness', current_date + 7, current_date + 18, 20, 68, 'PLANNED',
   NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- 4. Work items
WITH rows(n, title, status, pts, hrs, who, sprint, prio, epic, wbs, checklist, typ) AS (VALUES
  (101, 'Map project and member permissions', 'Done', 5, 14, 4, 1, 'High', 'Foundation', '1.2.2', '[{"text":"Role matrix agreed","done":true},{"text":"Permissions documented","done":true}]', 'User Story'),
  (102, 'Define work item acceptance criteria', 'Done', 3, 8, 1, 1, 'Medium', 'Planning', '1.3.1', '[{"text":"Acceptance criteria reviewed","done":true}]', 'User Story'),
  (103, 'Build the sprint board structure', 'Done', 8, 24, 3, 1, 'High', 'Execution', '2.2.1', '[{"text":"Columns are accessible","done":true},{"text":"Status changes recorded","done":true}]', 'User Story'),
  (104, 'Prepare sprint planning flow', 'In Progress', 5, 16, 3, 2, 'High', 'Planning', '2.1.2', '[{"text":"Capacity shown in hours","done":true},{"text":"Point commitment shown separately","done":false}]', 'User Story'),
  (105, 'Review backlog prioritization', 'Code Review', 3, 10, 4, 2, 'Medium', 'Planning', '2.1.1', '[{"text":"Order persists","done":true},{"text":"Filters compose","done":false}]', 'User Story'),
  (106, 'Add board WIP feedback', 'Testing', 2, 7, 3, 2, 'High', 'Execution', '2.2.3', '[{"text":"WIP warning is advisory","done":true},{"text":"Keyboard move works","done":false}]', 'User Story'),
  (107, 'Create delivery analytics view', 'To Do', 8, 24, 4, 2, 'Critical', 'Insights', '3.1.1', '[{"text":"Burndown uses events","done":false},{"text":"Tables mirror charts","done":false}]', 'User Story'),
  (108, 'Index versioned course evidence', 'To Do', 3, 9, 1, NULL, 'Medium', 'Evidence', '4.1.2', '[{"text":"Sample artefacts identified","done":false}]', 'User Story'),
  (109, 'Document deployment boundaries', 'To Do', 2, 5, 2, NULL, 'Low', 'Foundation', '4.2.1', '[{"text":"Secrets excluded","done":false},{"text":"Recovery plan linked","done":false}]', 'Technical Task'),
  (110, 'Validate item detail accessibility', 'To Do', 3, 9, 3, NULL, 'Medium', 'Execution', '3.2.2', '[{"text":"Focus returns to trigger","done":false},{"text":"Control labels verified","done":false}]', 'Bug'),
  (111, 'Draft release summary', 'To Do', 2, 5, 1, NULL, 'Low', 'Evidence', '4.3.1', '[{"text":"Sprint metrics included","done":false}]', 'Technical Task')
)
INSERT INTO public.work_items (id, project_id, key, title, description, type, priority, estimate, hours, status, position,
                               assignee_id, sprint_id, epic, labels, wbs, checklist, created_at, updated_at)
SELECT md5('team-fire-item-' || n)::uuid, 'f0000000-0000-4000-8000-000000000001', 'FIRE-' || n, title,
       jsonb_build_object('text', title || '. Traceable to WBS ' || wbs || '.'), typ, prio, pts, hrs, status, n,
       ('a0000000-0000-4000-8000-00000000000' || who)::uuid,
       CASE WHEN sprint IS NULL THEN NULL ELSE ('b0000000-0000-4000-8000-00000000000' || sprint)::uuid END,
       epic, ARRAY[CASE WHEN epic = 'Planning' THEN 'Product' ELSE 'Platform' END], wbs, checklist::jsonb,
       (current_date - 30) + time '10:00', now()
FROM rows
ON CONFLICT (id) DO NOTHING;

-- 5. History, commitments and scope events (only on first seed)
DO $$
DECLARE
  v_project UUID := 'f0000000-0000-4000-8000-000000000001';
  v_s1 UUID := 'b0000000-0000-4000-8000-000000000001';
  v_s2 UUID := 'b0000000-0000-4000-8000-000000000002';
  v_po UUID := 'a0000000-0000-4000-8000-000000000001';
  v_sm UUID := 'a0000000-0000-4000-8000-000000000002';
  v_zara UUID := 'a0000000-0000-4000-8000-000000000003';
  v_bilal UUID := 'a0000000-0000-4000-8000-000000000004';
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sprint_commitments WHERE sprint_id = v_s1) THEN RETURN; END IF;

  -- Creation history for every item
  INSERT INTO public.work_item_status_history (project_id, work_item_id, old_status, new_status, actor_id, sprint_id, mutation_id, created_at)
  SELECT v_project, id, NULL, 'To Do', v_po, NULL, gen_random_uuid(), created_at
  FROM public.work_items WHERE project_id = v_project ORDER BY key;

  -- Sprint 01 commitment and outcomes
  INSERT INTO public.sprint_commitments (sprint_id, work_item_id, frozen_estimate, frozen_status, created_at)
  SELECT v_s1, id, estimate, 'To Do', (current_date - 26) + time '09:00'
  FROM public.work_items WHERE key IN ('FIRE-101', 'FIRE-102', 'FIRE-103');
  INSERT INTO public.sprint_scope_events (sprint_id, work_item_id, action, reason, estimate_at_event, actor_id, created_at)
  SELECT v_s1, id, 'ADDED', 'Sprint commitment', estimate, v_sm, (current_date - 26) + time '09:00'
  FROM public.work_items WHERE key IN ('FIRE-101', 'FIRE-102', 'FIRE-103') ORDER BY key;

  FOR r IN SELECT * FROM (VALUES
      ('FIRE-101', 'To Do', 'In Progress', 25, v_bilal), ('FIRE-102', 'To Do', 'In Progress', 24, v_po),
      ('FIRE-103', 'To Do', 'In Progress', 23, v_zara), ('FIRE-101', 'In Progress', 'Done', 22, v_bilal),
      ('FIRE-102', 'In Progress', 'Done', 19, v_po), ('FIRE-103', 'In Progress', 'Testing', 18, v_zara),
      ('FIRE-103', 'Testing', 'Done', 16, v_zara)) AS t(k, o, n, d, a)
  LOOP
    INSERT INTO public.work_item_status_history (project_id, work_item_id, old_status, new_status, actor_id, sprint_id, mutation_id, created_at)
    SELECT v_project, w.id, r.o, r.n, r.a, v_s1, gen_random_uuid(), (current_date - r.d) + time '15:00'
    FROM public.work_items w WHERE w.key = r.k;
  END LOOP;

  -- Sprint 02 commitment and progress so far
  INSERT INTO public.sprint_commitments (sprint_id, work_item_id, frozen_estimate, frozen_status, created_at)
  SELECT v_s2, id, estimate, 'To Do', (current_date - 5) + time '09:00'
  FROM public.work_items WHERE key IN ('FIRE-104', 'FIRE-105', 'FIRE-106', 'FIRE-107');
  INSERT INTO public.sprint_scope_events (sprint_id, work_item_id, action, reason, estimate_at_event, actor_id, created_at)
  SELECT v_s2, id, 'ADDED', 'Sprint commitment', estimate, v_sm, (current_date - 5) + time '09:00'
  FROM public.work_items WHERE key IN ('FIRE-104', 'FIRE-105', 'FIRE-106', 'FIRE-107') ORDER BY key;

  FOR r IN SELECT * FROM (VALUES
      ('FIRE-104', 'To Do', 'In Progress', 5, v_zara), ('FIRE-105', 'To Do', 'In Progress', 4, v_bilal),
      ('FIRE-106', 'To Do', 'In Progress', 4, v_zara), ('FIRE-105', 'In Progress', 'Code Review', 3, v_bilal),
      ('FIRE-106', 'In Progress', 'Testing', 2, v_zara)) AS t(k, o, n, d, a)
  LOOP
    INSERT INTO public.work_item_status_history (project_id, work_item_id, old_status, new_status, actor_id, sprint_id, mutation_id, created_at)
    SELECT v_project, w.id, r.o, r.n, r.a, v_s2, gen_random_uuid(), (current_date - r.d) + time '14:00'
    FROM public.work_items w WHERE w.key = r.k;
  END LOOP;
END;
$$;
