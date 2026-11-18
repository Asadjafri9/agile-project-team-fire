-- Email-based accounts (ADR-014 amendment).
-- New accounts sign up with a real email address (the Supabase Auth identity) plus a
-- username and display name stored in user metadata. Legacy accounts keep their
-- internal <username>@accounts.team-fire.invalid identity.
-- Username → email resolution for login is only possible with a server-held key, so
-- the public key cannot be used to harvest email addresses.

-- 1. Account trigger: validate both identity styles.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_domain TEXT := lower(split_part(NEW.email, '@', 2));
  v_username TEXT;
  v_display TEXT := btrim(COALESCE(NEW.raw_user_meta_data ->> 'display_name', ''));
BEGIN
  IF v_domain = 'accounts.team-fire.invalid' THEN
    v_username := lower(split_part(NEW.email, '@', 1));
  ELSE
    v_username := lower(btrim(COALESCE(NEW.raw_user_meta_data ->> 'username', '')));
    IF NEW.email IS NULL OR NEW.email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
      RAISE EXCEPTION 'A valid email address is required' USING ERRCODE = '22023';
    END IF;
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

-- 2. Server-held keys live outside the Data API's exposed schemas.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.server_keys (
  name TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON private.server_keys FROM PUBLIC, anon, authenticated;

-- 3. Login identifier resolution (callable with the public key, useless without the server key).
CREATE OR REPLACE FUNCTION public.rpc_resolve_login(p_identifier TEXT, p_server_key TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hash TEXT;
  v_id TEXT := lower(btrim(COALESCE(p_identifier, '')));
BEGIN
  SELECT key_hash INTO v_hash FROM private.server_keys WHERE name = 'login_resolver';
  IF v_hash IS NULL OR p_server_key IS NULL OR extensions.crypt(p_server_key, v_hash) <> v_hash THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  IF position('@' IN v_id) > 0 THEN RETURN v_id; END IF;
  RETURN (SELECT u.email FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.username = v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_resolve_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_login(TEXT, TEXT) TO anon, authenticated;
