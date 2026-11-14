-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLES & DOMAIN SCHEMAS
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(32) UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    disabled_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    key VARCHAR(10) UNIQUE NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES public.profiles(id),
    timezone TEXT DEFAULT 'Asia/Karachi' NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NULL,
    version INT DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE public.project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('Product Owner', 'Scrum Master', 'Developer', 'Viewer')),
    joined_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    removed_at TIMESTAMPTZ DEFAULT NULL,
    UNIQUE (project_id, user_id)
);

CREATE TABLE public.sprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    goal TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    capacity_points INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    version INT DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX idx_one_active_sprint_per_project ON public.sprints (project_id) WHERE status = 'ACTIVE';

CREATE TABLE public.work_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    key VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    description JSONB DEFAULT '{}'::jsonb,
    type VARCHAR(20) NOT NULL CHECK (type IN ('User Story', 'Bug', 'Technical Task')),
    priority VARCHAR(10) NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    estimate INT CHECK (estimate IN (1, 2, 3, 5, 8, 13) OR estimate IS NULL),
    status VARCHAR(20) DEFAULT 'To Do' CHECK (status IN ('To Do', 'In Progress', 'Code Review', 'Testing', 'Done')),
    position INT DEFAULT 0 NOT NULL,
    assignee_id UUID REFERENCES public.profiles(id),
    sprint_id UUID REFERENCES public.sprints(id),
    archived_at TIMESTAMPTZ DEFAULT NULL,
    version INT DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE public.work_item_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    work_item_id UUID NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    actor_id UUID NOT NULL REFERENCES public.profiles(id),
    sprint_id UUID REFERENCES public.sprints(id),
    mutation_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE public.sprint_commitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sprint_id UUID NOT NULL REFERENCES public.sprints(id) ON DELETE CASCADE,
    work_item_id UUID NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
    frozen_estimate INT NOT NULL,
    frozen_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    UNIQUE(sprint_id, work_item_id)
);

CREATE TABLE public.sprint_scope_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sprint_id UUID NOT NULL REFERENCES public.sprints(id) ON DELETE CASCADE,
    work_item_id UUID NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
    action VARCHAR(10) NOT NULL CHECK (action IN ('ADDED', 'REMOVED')),
    reason TEXT NOT NULL,
    estimate_at_event INT NOT NULL,
    actor_id UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE public.project_revisions (
    project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
    board_revision INT DEFAULT 1 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

-- 2. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_member(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.project_members 
        WHERE user_id = _user_id AND project_id = _project_id AND removed_at IS NULL
    );
$$;

CREATE POLICY "Members read project" ON public.projects FOR SELECT USING (public.is_member(auth.uid(), id));
CREATE POLICY "Members read items" ON public.work_items FOR SELECT USING (public.is_member(auth.uid(), project_id));
CREATE POLICY "Members read sprints" ON public.sprints FOR SELECT USING (public.is_member(auth.uid(), project_id));

-- Restrict Direct Writes to Tables (Forces Mutation via RPC)
REVOKE INSERT, UPDATE, DELETE ON public.projects FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.work_items FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.sprints FROM authenticated, anon;

-- 3. DOMAIN RPC FUNCTIONS

-- Move Work Item (Board Drag and Drop)
CREATE OR REPLACE FUNCTION public.rpc_move_work_item(
    p_item_id UUID,
    p_new_status TEXT,
    p_new_position INT,
    p_expected_version INT,
    p_mutation_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_item public.work_items%ROWTYPE;
    v_actor UUID := auth.uid();
BEGIN
    SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
    IF v_item.version <> p_expected_version THEN RAISE EXCEPTION 'Conflict: Version mismatch' USING ERRCODE = '40001'; END IF;
    IF NOT public.is_member(v_actor, v_item.project_id) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;

    -- Record Status History
    IF v_item.status <> p_new_status THEN
        INSERT INTO public.work_item_status_history (project_id, work_item_id, old_status, new_status, actor_id, sprint_id, mutation_id)
        VALUES (v_item.project_id, v_item.id, v_item.status, p_new_status, v_actor, v_item.sprint_id, p_mutation_id);
    END IF;

    -- Update Item State
    UPDATE public.work_items
    SET status = p_new_status, position = p_new_position, version = version + 1, updated_at = clock_timestamp()
    WHERE id = p_item_id RETURNING * INTO v_item;

    -- Bump Project Revision Counter
    INSERT INTO public.project_revisions (project_id, board_revision)
    VALUES (v_item.project_id, 1)
    ON CONFLICT (project_id) DO UPDATE SET board_revision = project_revisions.board_revision + 1, updated_at = clock_timestamp();

    RETURN row_to_json(v_item)::jsonb;
END;
$$;

-- Start Sprint Atomically
CREATE OR REPLACE FUNCTION public.rpc_start_sprint(
    p_sprint_id UUID,
    p_expected_version INT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sprint public.sprints%ROWTYPE;
BEGIN
    SELECT * INTO v_sprint FROM public.sprints WHERE id = p_sprint_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sprint not found'; END IF;
    IF v_sprint.version <> p_expected_version THEN RAISE EXCEPTION 'Conflict: Version mismatch'; END IF;
    
    -- Freeze Commitments
    INSERT INTO public.sprint_commitments (sprint_id, work_item_id, frozen_estimate, frozen_status)
    SELECT id, p_sprint_id, COALESCE(estimate, 0), status 
    FROM public.work_items 
    WHERE sprint_id = p_sprint_id AND archived_at IS NULL;

    -- Activate Sprint
    UPDATE public.sprints 
    SET status = 'ACTIVE', started_at = clock_timestamp(), version = version + 1 
    WHERE id = p_sprint_id RETURNING * INTO v_sprint;

    RETURN row_to_json(v_sprint)::jsonb;
END;
$$;