-- Migration: 20261010000004_auth_profile_trigger.sql
-- Description: Trusted trigger on auth.users for atomic, idempotent profile and default 'customer' role creation.
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- 1. AUTH USER CREATION TRIGGER FUNCTION
-- Automatically creates a public.profiles record and assigns the default
-- 'customer' role in public.user_roles whenever a user registers in auth.users.
--
-- Security guarantees:
--   - Atomic: Runs in the auth.users insertion transaction; failures abort registration.
--   - Idempotent: Handles retries/duplicate events safely via ON CONFLICT.
--   - Non-escalatable: Completely ignores raw_user_meta_data for roles/permissions.
--     Only the default 'customer' role is ever granted.
--   - Runner control: runner_status is strictly NULL (requires separate admin approval).
--   - Safe search_path: public, extensions, pg_temp prevents search path injection attacks
--     while allowing resolution of extension types (citext, uuid-ossp).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_raw_name TEXT;
  v_clean_name VARCHAR(120);
  v_phone VARCHAR(20);
BEGIN
  -- Extract and sanitize display name from user metadata
  v_raw_name := TRIM(COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    ''
  ));

  IF v_raw_name IS NOT NULL AND LENGTH(v_raw_name) > 0 THEN
    v_clean_name := SUBSTRING(v_raw_name FROM 1 FOR 120);
  ELSE
    -- Safe fallback: clean email prefix or generic customer label
    IF NEW.email IS NOT NULL AND POSITION('@' IN NEW.email) > 1 THEN
      v_clean_name := SUBSTRING(SPLIT_PART(NEW.email, '@', 1) FROM 1 FOR 120);
    ELSE
      v_clean_name := 'MartIT Customer';
    END IF;
  END IF;

  -- Extract optional phone from user metadata or auth record
  v_phone := NULLIF(TRIM(COALESCE(
    NEW.phone,
    NEW.raw_user_meta_data->>'phone',
    ''
  )), '');
  IF v_phone IS NOT NULL THEN
    v_phone := SUBSTRING(v_phone FROM 1 FOR 20);
  END IF;

  -- 1. Idempotently create or update user profile
  -- Note: runner_status is intentionally set to NULL; client metadata CANNOT self-assign runner status
  INSERT INTO public.profiles (
    id,
    email,
    name,
    phone,
    runner_status,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    v_clean_name,
    v_phone,
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = CASE
      WHEN profiles.name = 'MartIT Customer' AND EXCLUDED.name <> 'MartIT Customer' THEN EXCLUDED.name
      ELSE profiles.name
    END,
    phone = COALESCE(profiles.phone, EXCLUDED.phone),
    updated_at = NOW();

  -- 2. Idempotently grant default 'customer' role
  -- Security: Ignores client metadata entirely to prevent role self-escalation
  INSERT INTO public.user_roles (
    user_id,
    role,
    created_at
  ) VALUES (
    NEW.id,
    'customer'::public.role_enum,
    NOW()
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Revoke execute from PUBLIC, anon, and authenticated; grant strictly to auth & service roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE and necessary table permissions to supabase_auth_admin (GoTrue auth worker) and service_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT ALL ON TABLE public.profiles TO supabase_auth_admin;
    GRANT ALL ON TABLE public.user_roles TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
  END IF;
END;
$$;

-- ============================================================================
-- 2. ATTACH TRIGGER TO auth.users
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
