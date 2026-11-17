-- Migration: 20261024000001_fix_admin_runner_approval_privilege.sql
-- Description: Allow service_role and administrators to update runner status without triggering false privilege escalation exceptions.
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- 1. FUNCTION: public.auth_is_admin()
-- Ensure service_role and database superusers are recognized as administrators,
-- preventing service-role administrative endpoints from failing trigger guards.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.role() = 'service_role'
    OR current_user IN ('postgres', 'service_role')
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND (role = 'admin' OR role = 'super_admin')
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.auth_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated, service_role;

-- ============================================================================
-- 2. FUNCTION: public.auth_is_super_admin()
-- Ensure service_role is recognized as super administrator.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auth_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.role() = 'service_role'
    OR current_user IN ('postgres', 'service_role')
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'super_admin'
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.auth_is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_super_admin() TO authenticated, service_role;

-- ============================================================================
-- 3. TRIGGER GUARD: public.prevent_profile_privilege_escalation()
-- Explicitly permit service_role, postgres superuser, and verified administrators
-- to transition runner_status on user profiles. Non-admins remain strictly restricted
-- to their own initial application (NULL -> 'applicant').
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.runner_status IS DISTINCT FROM NEW.runner_status THEN
    -- If caller is service_role, postgres, or authenticated admin, allow transition
    IF NOT (
      auth.role() = 'service_role'
      OR current_user IN ('postgres', 'service_role')
      OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
      OR public.auth_is_admin()
    ) THEN
      -- Non-admins may ONLY submit initial runner application (NULL -> 'applicant') on their own profile
      IF NOT (
        auth.uid() = NEW.id AND
        OLD.runner_status IS NULL AND
        NEW.runner_status = 'applicant'
      ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED_RUNNER_STATUS_MODIFICATION'
          USING HINT = 'Only administrators can update runner application status.';
      END IF;
    END IF;
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

REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. STORED PROCEDURE: public.admin_set_runner_status()
-- Atomically update runner profile status and user_roles in a single transaction.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_runner_status(
  p_user_id UUID,
  p_status VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_status public.runner_status_enum;
  v_new_status public.runner_status_enum;
  v_name VARCHAR;
  v_email VARCHAR;
BEGIN
  -- 1. Authorization check: caller must be admin or service_role
  IF NOT (
    auth.role() = 'service_role'
    OR current_user IN ('postgres', 'service_role')
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR public.auth_is_admin()
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED'
      USING HINT = 'Only platform administrators can modify runner status.';
  END IF;

  -- 2. Validate requested status
  IF p_status NOT IN ('approved', 'suspended') THEN
    RAISE EXCEPTION 'INVALID_STATUS'
      USING HINT = 'Runner status must be either approved or suspended.';
  END IF;
  v_new_status := p_status::public.runner_status_enum;

  -- 3. Check target user profile
  SELECT runner_status, name, email
  INTO v_current_status, v_name, v_email
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND'
      USING HINT = 'Target user profile does not exist.';
  END IF;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'NOT_AN_APPLICANT'
      USING HINT = 'This user has not applied to be a runner.';
  END IF;

  -- 4. Update profile runner_status
  UPDATE public.profiles
  SET
    runner_status = v_new_status,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- 5. Synchronize user_roles table
  IF v_new_status = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'runner')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF v_new_status = 'suspended' THEN
    DELETE FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'runner';
  END IF;

  -- 6. Return updated status payload
  RETURN jsonb_build_object(
    'success', true,
    'userId', p_user_id,
    'runnerStatus', p_status,
    'name', v_name,
    'email', v_email,
    'message', 'Runner status updated to ' || p_status || '.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_runner_status(UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_runner_status(UUID, VARCHAR) TO authenticated, service_role;
