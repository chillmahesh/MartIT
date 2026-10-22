-- Migration: 20261022000001_runner_application_flow.sql
-- Description: Runner application submission RPC and privilege escalation protection refinement
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- 1. STORED PROCEDURE: public.apply_for_runner()
-- Allows authenticated customers to safely apply to become a runner on campus.
-- Sets runner_status = 'applicant'.
-- Security guarantees:
--   - Atomic & Idempotent: Can only be called for the authenticated user (auth.uid()).
--   - Does NOT grant the 'runner' role: Active delivery access requires administrator review.
--   - Respects suspension: Suspended runners cannot self-reinstate.
--   - Safe search_path: Prevents search_path injection attacks.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_for_runner()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_current_status public.runner_status_enum;
BEGIN
  -- 1. Ensure caller is authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED'
      USING HINT = 'You must be logged in to apply as a runner.';
  END IF;

  -- 2. Inspect current profile runner_status
  SELECT runner_status INTO v_current_status
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND'
      USING HINT = 'User profile does not exist.';
  END IF;

  -- 3. Block suspended runners from self-reapplying
  IF v_current_status = 'suspended' THEN
    RAISE EXCEPTION 'RUNNER_SUSPENDED'
      USING HINT = 'Runner privileges are suspended. Please contact platform administrators.';
  END IF;

  -- 4. If already approved, return success idempotently without changing status
  IF v_current_status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', true,
      'runner_status', 'approved',
      'message', 'Runner account is already approved.'
    );
  END IF;

  -- 5. Transition to applicant
  UPDATE public.profiles
  SET
    runner_status = 'applicant',
    updated_at = NOW()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'runner_status', 'applicant',
    'message', 'Runner application submitted and pending administrator review.'
  );
END;
$$;

-- Grant execution to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.apply_for_runner() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.apply_for_runner() FROM PUBLIC, anon;

-- ============================================================================
-- 2. PRIVILEGE ESCALATION TRIGGER GUARD UPDATE
-- Refines prevent_profile_privilege_escalation() so that:
--   - Non-admins may ONLY transition their own profile from NULL to 'applicant'.
--   - Direct setting of 'approved' or 'suspended' by non-admins remains strictly forbidden.
--   - ID modification remains strictly forbidden.
--   - Admins can perform any status transitions.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.runner_status IS DISTINCT FROM NEW.runner_status THEN
    -- If caller is an admin, allow transition
    IF NOT public.auth_is_admin() THEN
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
