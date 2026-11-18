-- Transactional Project Creation with Owner Membership Assignment
CREATE OR REPLACE FUNCTION public.rpc_create_project(
    p_name TEXT,
    p_key TEXT,
    p_description TEXT,
    p_timezone TEXT,
    p_owner_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_project public.projects%ROWTYPE;
BEGIN
    INSERT INTO public.projects (name, key, description, timezone, owner_id)
    VALUES (p_name, p_key, p_description, p_timezone, p_owner_id)
    RETURNING * INTO v_project;

    -- Atomic Owner Assignment
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (v_project.id, p_owner_id, 'Product Owner');

    RETURN row_to_json(v_project)::jsonb;
END;
$$;

-- Work Item Creation with Auto-Generated Key
CREATE OR REPLACE FUNCTION public.rpc_create_work_item(
    p_project_id UUID,
    p_title TEXT,
    p_description JSONB,
    p_type TEXT,
    p_priority TEXT,
    p_estimate INT,
    p_sprint_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_project_key TEXT;
    v_next_val INT;
    v_key TEXT;
    v_item public.work_items%ROWTYPE;
BEGIN
    SELECT key INTO v_project_key FROM public.projects WHERE id = p_project_id;
    
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_val 
    FROM public.work_items 
    WHERE project_id = p_project_id;

    v_key := v_project_key || '-' || v_next_val;

    INSERT INTO public.work_items (
        project_id, key, title, description, type, priority, estimate, status, position, sprint_id
    ) VALUES (
        p_project_id, v_key, p_title, p_description, p_type, p_priority, p_estimate, 'To Do', v_next_val, p_sprint_id
    ) RETURNING * INTO v_item;

    RETURN row_to_json(v_item)::jsonb;
END;
$$;