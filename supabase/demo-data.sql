-- Local demo data for end-to-end UI testing (not committed).
INSERT INTO public.sprints (id, project_id, name, goal, start_date, end_date, capacity_points, status, started_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Sprint 02: Sprints & Board',
  'Build a live sprint board and give the team a clear path from backlog to done.',
  current_date - 5, current_date + 4, 50, 'ACTIVE', now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.work_items
  (id, project_id, key, title, description, type, priority, estimate, status, position, assignee_id, sprint_id)
VALUES
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111111','FIRE-1','Sprint entity and management screens','{"text":"Define sprint duration, start and end dates, and a clear sprint goal."}','User Story','High',5,'Done',1,'00000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333302','11111111-1111-1111-1111-111111111111','FIRE-2','Sprint capacity planner','{"text":"Show available team hours and total story point capacity before commitment."}','User Story','Medium',5,'Done',2,'00000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333303','11111111-1111-1111-1111-111111111111','FIRE-3','Backlog-to-sprint allocation','{"text":"Move selected product backlog items into the active sprint."}','User Story','Medium',3,'Done',3,'00000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333304','11111111-1111-1111-1111-111111111111','FIRE-4','Sprint lifecycle controls','{"text":"Start and complete a sprint, then carry over unresolved items."}','User Story','High',8,'Code Review',4,'00000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333305','11111111-1111-1111-1111-111111111111','FIRE-5','Sprint commitment snapshot','{"text":"Freeze committed scope at sprint start as the baseline for burndown."}','User Story','High',5,'Done',5,'00000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333306','11111111-1111-1111-1111-111111111111','FIRE-6','Kanban board rendering','{"text":"Render To Do, In Progress, Code Review, Testing, and Done columns."}','Technical Task','Critical',8,'Done',6,'00000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333307','11111111-1111-1111-1111-111111111111','FIRE-7','Drag-and-drop status persistence','{"text":"Move cards between columns and store every status transition reliably."}','Technical Task','Critical',13,'In Progress',7,'00000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333308','11111111-1111-1111-1111-111111111111','FIRE-8','In-context task detail modal','{"text":"Let teammates inspect and edit a task without leaving the board."}','User Story','Medium',5,'Testing',8,'00000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333309','11111111-1111-1111-1111-111111111111','FIRE-9','Increment testing and sprint demonstration','{"text":"Verify the increment and demonstrate the working sprint board."}','Technical Task','High',3,'To Do',9,'00000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333310','11111111-1111-1111-1111-111111111111','FIRE-10','Status-history metrics computation','{"text":"Derive sprint metrics from the stored status history."}','User Story','High',8,'To Do',10,NULL,NULL),
  ('33333333-3333-3333-3333-333333333311','11111111-1111-1111-1111-111111111111','FIRE-11','Automated burndown chart','{"text":"Plot remaining story points against the ideal completion slope."}','User Story','High',8,'To Do',11,NULL,NULL),
  ('33333333-3333-3333-3333-333333333312','11111111-1111-1111-1111-111111111111','FIRE-12','Team velocity chart','{"text":"Compare completed story points across past sprints."}','User Story','Medium',5,'To Do',12,NULL,NULL),
  ('33333333-3333-3333-3333-333333333313','11111111-1111-1111-1111-111111111111','FIRE-13','Cumulative Flow Diagram','{"text":"Show the distribution of tasks across board statuses over time."}','User Story','Medium',8,'To Do',13,NULL,NULL),
  ('33333333-3333-3333-3333-333333333314','11111111-1111-1111-1111-111111111111','FIRE-14','Work-In-Progress limits','{"text":"Surface bottlenecks with configurable limits on each board column."}','User Story','High',5,'To Do',14,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sprint_commitments (sprint_id, work_item_id, frozen_estimate, frozen_status)
SELECT '22222222-2222-2222-2222-222222222222', id, coalesce(estimate, 0), status
FROM public.work_items
WHERE sprint_id = '22222222-2222-2222-2222-222222222222'
ON CONFLICT (sprint_id, work_item_id) DO NOTHING;

SELECT count(*) AS sprint_items FROM public.work_items WHERE sprint_id = '22222222-2222-2222-2222-222222222222';
SELECT count(*) AS backlog_items FROM public.work_items WHERE sprint_id IS NULL;
