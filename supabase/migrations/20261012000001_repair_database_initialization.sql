-- Migration: 20261012000001_repair_database_initialization.sql
-- Description: Minimal, non-destructive remediation repairing public.profiles,
--              public.user_roles, and the auth user registration trigger without
--              perturbing unrelated application data or fabricating migration history.
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================================
-- 2. ENUM TYPES (Idempotent creation)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_enum') THEN
    CREATE TYPE role_enum AS ENUM (
      'customer',
      'runner',
      'store_owner',
      'admin',
      'super_admin'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'runner_status_enum') THEN
    CREATE TYPE runner_status_enum AS ENUM (
      'applicant',
      'approved',
      'suspended'
    );
  END IF;
END;
$$;

-- ============================================================================
-- 3. PROFILES & USER ROLES TABLES (Safe IF NOT EXISTS)
-- ============================================================================

-- 3.1 Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email citext NOT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20),
  runner_status runner_status_enum,
  default_location_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_runner_status ON public.profiles(runner_status);

-- 3.2 User Roles Table (Strict role mapping table)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role role_enum NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_user_role' AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT uq_user_role UNIQUE (user_id, role);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS & POLICIES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auth_user_has_role(required_role role_enum)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (role = required_role OR role = 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR role = 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
  );
$$;

-- Privilege escalation guard: prevents ordinary users from altering runner_status or id
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.runner_status IS DISTINCT FROM NEW.runner_status AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_RUNNER_STATUS_MODIFICATION'
      USING HINT = 'Only administrators can update runner application status.';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_ID_CHANGE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Updated_at trigger for profiles
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies on profiles
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR public.auth_is_admin()
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR public.auth_is_admin())
  WITH CHECK (id = auth.uid() OR public.auth_is_admin());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR public.auth_is_admin());

-- Idempotent RLS Policies on user_roles
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
CREATE POLICY "user_roles_select"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.auth_is_admin());

DROP POLICY IF EXISTS "user_roles_insert_super_admin" ON public.user_roles;
CREATE POLICY "user_roles_insert_super_admin"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.auth_is_super_admin());

DROP POLICY IF EXISTS "user_roles_delete_super_admin" ON public.user_roles;
CREATE POLICY "user_roles_delete_super_admin"
  ON public.user_roles FOR DELETE
  USING (public.auth_is_super_admin());

-- ============================================================================
-- 5. MINIMAL, LEAST-PRIVILEGE GRANTS
-- ============================================================================

-- Function execution grants
REVOKE EXECUTE ON FUNCTION public.auth_user_has_role(role_enum) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.auth_user_has_role(role_enum) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_super_admin() TO authenticated, service_role;

-- Minimal schema and table grants for auth worker (GoTrue: supabase_auth_admin)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT USAGE ON SCHEMA extensions TO supabase_auth_admin;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO supabase_auth_admin;
    GRANT SELECT, INSERT ON TABLE public.user_roles TO supabase_auth_admin;
  END IF;
END;
$$;

-- Client role table grants (governed by RLS)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.user_roles_id_seq TO authenticated, supabase_auth_admin;

-- Service role grants
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT ALL ON SEQUENCE public.user_roles_id_seq TO service_role;

-- ============================================================================
-- 6. ORPHANED AUTH USER RECONCILIATION
-- Backfill profiles and default 'customer' role for any users created in
-- auth.users while public.profiles was absent.
-- ============================================================================

INSERT INTO public.profiles (
  id,
  email,
  name,
  phone,
  runner_status,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.email,
  COALESCE(
    SUBSTRING(TRIM(COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')) FROM 1 FOR 120),
    SUBSTRING(SPLIT_PART(u.email, '@', 1) FROM 1 FOR 120),
    'MartIT Customer'
  ),
  SUBSTRING(NULLIF(TRIM(COALESCE(u.phone, u.raw_user_meta_data->>'phone', '')), '') FROM 1 FOR 20),
  NULL,
  u.created_at,
  NOW()
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = CASE 
    WHEN profiles.name = 'MartIT Customer' AND EXCLUDED.name <> 'MartIT Customer' THEN EXCLUDED.name
    ELSE profiles.name
  END,
  updated_at = NOW();

INSERT INTO public.user_roles (
  user_id,
  role,
  created_at
)
SELECT 
  u.id,
  'customer'::public.role_enum,
  u.created_at
FROM auth.users u
ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================================================
-- 7. SECURED AUTH USER REGISTRATION TRIGGER (handle_new_user)
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
  -- Extract and sanitize name from metadata
  v_raw_name := TRIM(COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    ''
  ));

  IF v_raw_name IS NOT NULL AND LENGTH(v_raw_name) > 0 THEN
    v_clean_name := SUBSTRING(v_raw_name FROM 1 FOR 120);
  ELSE
    IF NEW.email IS NOT NULL AND POSITION('@' IN NEW.email) > 1 THEN
      v_clean_name := SUBSTRING(SPLIT_PART(NEW.email, '@', 1) FROM 1 FOR 120);
    ELSE
      v_clean_name := 'MartIT Customer';
    END IF;
  END IF;

  v_phone := NULLIF(TRIM(COALESCE(
    NEW.phone,
    NEW.raw_user_meta_data->>'phone',
    ''
  )), '');
  IF v_phone IS NOT NULL THEN
    v_phone := SUBSTRING(v_phone FROM 1 FOR 20);
  END IF;

  -- 1. Idempotently insert or update user profile
  -- runner_status is strictly NULL to prevent client self-assignment
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

  -- 2. Idempotently grant default 'customer' role (prevents role self-escalation)
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

-- Ensure function owner is postgres
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
  END IF;
END;
$$;

-- Revoke direct execution from end users; grant strictly to auth worker and service role
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
  END IF;
END;
$$;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
