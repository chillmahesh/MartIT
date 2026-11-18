-- Migration: 20261118000001_repair_auth_user_trigger_and_grants.sql
-- Description: Repair Supabase auth user creation trigger, grants, unique constraints, and reconcile orphaned accounts.
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- 1. ENSURE UNIQUE CONSTRAINT & INTEGRITY ON public.user_roles
-- ============================================================================

DO $$
BEGIN
  -- 1.1 Safely deduplicate user_roles if any duplicate (user_id, role) tuples exist
  DELETE FROM public.user_roles a
  USING public.user_roles b
  WHERE a.id < b.id
    AND a.user_id = b.user_id
    AND a.role = b.role;

  -- 1.2 Ensure uq_user_role unique constraint exists so conflict targets are unambiguous
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_user_role' AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT uq_user_role UNIQUE (user_id, role);
  END IF;
END;
$$;

-- ============================================================================
-- 2. HARDENED REGISTRATION TRIGGER FUNCTION (public.handle_new_user)
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
  v_raw_phone TEXT;
  v_phone_digits TEXT;
  v_phone BIGINT;
  v_email citext;
BEGIN
  -- Extract and sanitize email with safe deterministic fallback
  v_email := COALESCE(
    NULLIF(TRIM(NEW.email), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'email'), ''),
    (NEW.id::text || '@temporary.martit.local')
  )::citext;

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
    IF v_email IS NOT NULL AND POSITION('@' IN v_email::text) > 1 THEN
      v_clean_name := SUBSTRING(SPLIT_PART(v_email::text, '@', 1) FROM 1 FOR 120);
    ELSE
      v_clean_name := 'MartIT Customer';
    END IF;
  END IF;

  -- Extract optional phone from user metadata or auth record, safely validating and casting to BIGINT
  v_raw_phone := NULLIF(TRIM(COALESCE(
    NEW.phone,
    NEW.raw_user_meta_data->>'phone',
    ''
  )), '');

  IF v_raw_phone IS NOT NULL THEN
    -- Strip non-digit formatting characters (spaces, hyphens, parentheses, plus sign)
    v_phone_digits := REGEXP_REPLACE(v_raw_phone, '\D', '', 'g');

    -- Validate digit count:
    -- Standard telephone numbers contain between 7 and 15 digits (ITU-T E.164 maximum is 15 digits).
    -- Numbers up to 18 digits fit safely in PostgreSQL signed 64-bit BIGINT (max: 9,223,372,036,854,775,807).
    -- If valid digits exist within range, cast to BIGINT; otherwise default to NULL without aborting signup.
    IF v_phone_digits ~ '^[0-9]{7,15}$' THEN
      v_phone := v_phone_digits::bigint;
    ELSE
      v_phone := NULL;
    END IF;
  ELSE
    v_phone := NULL;
  END IF;

  -- 1. Clean up any orphaned profile with the same email if its ID is not in auth.users
  -- (e.g. from previous aborted registrations or manual inserts), avoiding foreign key collisions
  DELETE FROM public.profiles
  WHERE email = v_email
    AND id <> NEW.id
    AND NOT EXISTS (
      SELECT 1 FROM auth.users WHERE auth.users.id = profiles.id
    );

  -- 2. Idempotently insert or update user profile
  -- Note: runner_status is strictly NULL; client metadata CANNOT self-assign runner status
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
    v_email,
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

  -- 3. Idempotently grant default 'customer' role
  -- Security: Ignores client metadata entirely to prevent role self-escalation.
  -- Uses WHERE NOT EXISTS so it never aborts even if unique index inference differs.
  INSERT INTO public.user_roles (
    user_id,
    role,
    created_at
  )
  SELECT
    NEW.id,
    'customer'::public.role_enum,
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.id AND role = 'customer'::public.role_enum
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Emit actionable diagnostics to PostgreSQL server logs before re-raising
  RAISE WARNING 'handle_new_user failed for auth user % (email: %): SQLSTATE: %, SQLERRM: %',
    NEW.id, NEW.email, SQLSTATE, SQLERRM;
  RAISE;
END;
$$;

-- ============================================================================
-- 3. FUNCTION OWNERSHIP, PERMISSIONS, AND GRANTS
-- ============================================================================

-- Ensure function owner is postgres superuser
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
  END IF;
END;
$$;

-- Revoke direct execution from end users / client roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE, schema USAGE, and table/sequence permissions to supabase_auth_admin and service_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT USAGE ON SCHEMA extensions TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO supabase_auth_admin;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.user_roles TO supabase_auth_admin;
    
    IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'user_roles_id_seq') THEN
      GRANT USAGE, SELECT ON SEQUENCE public.user_roles_id_seq TO supabase_auth_admin;
    END IF;

    GRANT USAGE ON TYPE public.role_enum TO supabase_auth_admin;
    GRANT USAGE ON TYPE public.runner_status_enum TO supabase_auth_admin;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT USAGE ON SCHEMA extensions TO service_role;
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.user_roles TO service_role;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'user_roles_id_seq') THEN
      GRANT USAGE, SELECT ON SEQUENCE public.user_roles_id_seq TO service_role;
    END IF;
  END IF;
END;
$$;

-- ============================================================================
-- 4. ATTACH TRIGGER TO auth.users
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 5. IDEMPOTENT RECONCILIATION OF ORPHANED / PARTIAL AUTH USERS
-- ============================================================================

-- Backfill missing profile records for existing Auth users
INSERT INTO public.profiles (id, email, name, phone, runner_status, created_at, updated_at)
SELECT 
  u.id,
  COALESCE(u.email::citext, (u.id::text || '@temporary.martit.local')::citext),
  COALESCE(
    NULLIF(SUBSTRING(TRIM(COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', '')) FROM 1 FOR 120), ''),
    CASE WHEN u.email IS NOT NULL AND POSITION('@' IN u.email) > 1 THEN SUBSTRING(SPLIT_PART(u.email, '@', 1) FROM 1 FOR 120) ELSE 'MartIT Customer' END
  ),
  CASE
    WHEN REGEXP_REPLACE(COALESCE(u.phone, u.raw_user_meta_data->>'phone', ''), '\D', '', 'g') ~ '^[0-9]{7,15}$'
    THEN REGEXP_REPLACE(COALESCE(u.phone, u.raw_user_meta_data->>'phone', ''), '\D', '', 'g')::bigint
    ELSE NULL
  END,
  NULL,
  COALESCE(u.created_at, NOW()),
  NOW()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Backfill missing default 'customer' role for existing Auth users with profiles
INSERT INTO public.user_roles (user_id, role, created_at)
SELECT u.id, 'customer'::public.role_enum, COALESCE(u.created_at, NOW())
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'customer'::public.role_enum
WHERE ur.id IS NULL
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT DO NOTHING;
