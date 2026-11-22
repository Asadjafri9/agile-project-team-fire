-- Public self-service signup (ADR-014, amends AUTH-03).
-- Supabase Auth now accepts signups, so the account trigger becomes the gate:
-- only <username>@accounts.team-fire.invalid identities with a valid username
-- and display name can be created, whether the request comes from our
-- /api/auth/signup route or straight at the Auth API.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username TEXT := lower(split_part(NEW.email, '@', 1));
  v_domain TEXT := lower(split_part(NEW.email, '@', 2));
  v_display TEXT := btrim(COALESCE(NEW.raw_user_meta_data ->> 'display_name', ''));
BEGIN
  IF v_domain <> 'accounts.team-fire.invalid' THEN
    RAISE EXCEPTION 'Accounts must be created through Team Fire sign-up' USING ERRCODE = '42501';
  END IF;
  IF v_username !~ '^[a-z0-9][a-z0-9._-]{1,31}$' THEN
    RAISE EXCEPTION 'Usernames are 2-32 characters: lowercase letters, digits, dot, dash or underscore' USING ERRCODE = '22023';
  END IF;
  IF v_display = '' THEN v_display := v_username; END IF;
  IF length(v_display) > 60 THEN
    RAISE EXCEPTION 'Display names are at most 60 characters' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) THEN
    RAISE EXCEPTION 'That username is taken' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, v_username, v_display)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
