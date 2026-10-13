-- Migration: 20261014000001_handover_otp_verification.sql
-- Description: Production backend foundation for secure runner-to-customer delivery OTP verification
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- 1. ENUM VALUES (Ensure order_status_enum includes runtime status variants)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_enum') THEN
    ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'ON_THE_WAY';
    ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'PICKED_UP';
  END IF;
END;
$$;

-- ============================================================================
-- 2. ORDERS TABLE COLUMNS & INDEXES
-- Idempotent column additions for OTP handover lifecycle and audit trail
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handover_otp_hash VARCHAR(128);
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handover_attempts_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handover_locked_until TIMESTAMPTZ;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handover_verified_at TIMESTAMPTZ;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handover_otp_expires_at TIMESTAMPTZ;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handover_otp_last_resend_at TIMESTAMPTZ;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_orders_handover_verified ON public.orders(handover_verified_at);
CREATE INDEX IF NOT EXISTS idx_orders_handover_locked ON public.orders(handover_locked_until);

-- ============================================================================
-- 3. ATOMIC RUNNER TRANSITION TO ON_THE_WAY FUNCTION
-- Concurrency-safe: uses SELECT FOR UPDATE row locking
-- Validates approved runner status from profiles, order assignment, permitted transitions.
-- Initializes OTP challenge atomically without overwriting active unexpired challenges.
-- Security: Definer function with strict search_path = public, pg_temp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transition_order_to_on_the_way(
  p_order_id VARCHAR(64),
  p_runner_id UUID,
  p_otp_hash VARCHAR(128),
  p_expiry_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  success BOOLEAN,
  result_code VARCHAR(64),
  order_id VARCHAR(64),
  status order_status_enum,
  challenge_initialized BOOLEAN,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status order_status_enum;
  v_assigned_runner UUID;
  v_runner_status runner_status_enum;
  v_existing_hash VARCHAR(128);
  v_existing_expires TIMESTAMPTZ;
  v_locked_until TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_new_expires TIMESTAMPTZ := v_now + (COALESCE(p_expiry_seconds, 300) || ' seconds')::INTERVAL;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  -- Caller authorization check if running under user JWT context
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    ) INTO v_is_admin;

    IF NOT v_is_admin AND auth.uid() <> p_runner_id THEN
      RETURN QUERY SELECT FALSE, 'FORBIDDEN_CALLER_NOT_RUNNER'::VARCHAR, p_order_id, NULL::order_status_enum, FALSE, NULL::TIMESTAMPTZ;
      RETURN;
    END IF;
  END IF;

  -- 1. Verify runner is approved in trusted database state
  SELECT runner_status INTO v_runner_status
  FROM public.profiles
  WHERE id = p_runner_id;

  IF v_runner_status IS NULL OR v_runner_status <> 'approved' THEN
    RETURN QUERY SELECT FALSE, 'FORBIDDEN_RUNNER_NOT_APPROVED'::VARCHAR, p_order_id, NULL::order_status_enum, FALSE, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 2. Concurrency-safe row-level lock on the target order
  SELECT
    orders.status,
    orders.runner_id,
    orders.handover_otp_hash,
    orders.handover_otp_expires_at,
    orders.handover_locked_until
  INTO
    v_status,
    v_assigned_runner,
    v_existing_hash,
    v_existing_expires,
    v_locked_until
  FROM public.orders
  WHERE orders.id = p_order_id
  FOR UPDATE;

  -- Guard: Order existence
  IF v_status IS NULL THEN
    RETURN QUERY SELECT FALSE, 'ORDER_NOT_FOUND'::VARCHAR, p_order_id, NULL::order_status_enum, FALSE, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Guard: Assigned runner authorization
  IF v_assigned_runner IS NULL OR v_assigned_runner <> p_runner_id THEN
    RETURN QUERY SELECT FALSE, 'ORDER_NOT_ASSIGNED_TO_RUNNER'::VARCHAR, p_order_id, v_status, FALSE, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Guard: Terminal states (cannot transition delivered or cancelled orders)
  IF v_status IN ('DELIVERED', 'CANCELLED') THEN
    RETURN QUERY SELECT FALSE, 'INVALID_ORDER_STATE'::VARCHAR, p_order_id, v_status, FALSE, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Guard: Idempotent repeated transition into ON_THE_WAY
  -- A repeated transition must NOT silently overwrite an unexpired OTP or reset attempts/lockout!
  IF v_status = 'ON_THE_WAY' THEN
    IF v_existing_hash IS NOT NULL AND v_existing_expires IS NOT NULL AND v_now < v_existing_expires THEN
      RETURN QUERY SELECT TRUE, 'ALREADY_ON_THE_WAY'::VARCHAR, p_order_id, 'ON_THE_WAY'::order_status_enum, FALSE, v_existing_expires;
      RETURN;
    END IF;
    IF v_locked_until IS NOT NULL AND v_now < v_locked_until THEN
      RETURN QUERY SELECT FALSE, 'OTP_LOCKED'::VARCHAR, p_order_id, 'ON_THE_WAY'::order_status_enum, FALSE, v_existing_expires;
      RETURN;
    END IF;
  END IF;

  -- Permitted progression check: order must be PICKED_UP before ON_THE_WAY (or renewing expired ON_THE_WAY)
  IF v_status <> 'PICKED_UP' AND v_status <> 'ON_THE_WAY' THEN
    RETURN QUERY SELECT FALSE, 'INVALID_TRANSITION'::VARCHAR, p_order_id, v_status, FALSE, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Atomic update: transition status and initialize challenge
  UPDATE public.orders
  SET
    status = 'ON_THE_WAY',
    handover_otp_hash = p_otp_hash,
    handover_otp_expires_at = v_new_expires,
    handover_attempts_count = 0,
    handover_locked_until = NULL,
    handover_otp_last_resend_at = v_now,
    updated_at = v_now
  WHERE orders.id = p_order_id;

  RETURN QUERY SELECT TRUE, 'SUCCESS'::VARCHAR, p_order_id, 'ON_THE_WAY'::order_status_enum, TRUE, v_new_expires;
END;
$$;

-- ============================================================================
-- 4. ATOMIC DELIVERY OTP VERIFICATION FUNCTION (Result-Code Pattern)
-- Concurrency-safe: uses SELECT FOR UPDATE row locking
-- Transaction-safe result-code pattern ensures failed attempts actually persist in DB.
-- Security: Definer function with strict search_path = public, pg_temp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_delivery_otp(
  p_order_id VARCHAR(64),
  p_otp_hash VARCHAR(128),
  p_runner_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  result_code VARCHAR(64),
  order_id VARCHAR(64),
  status order_status_enum,
  attempts_remaining INTEGER,
  locked_until TIMESTAMPTZ,
  verified_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status order_status_enum;
  v_runner_id UUID;
  v_otp_hash VARCHAR(128);
  v_attempts INTEGER;
  v_locked_until TIMESTAMPTZ;
  v_verified_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_is_admin BOOLEAN := FALSE;
BEGIN
  -- Caller authorization check if running under user JWT context
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    ) INTO v_is_admin;

    IF NOT v_is_admin AND auth.uid() <> p_runner_id THEN
      RETURN QUERY SELECT FALSE, 'FORBIDDEN_CALLER_NOT_RUNNER'::VARCHAR, p_order_id, NULL::order_status_enum, 0, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
      RETURN;
    END IF;
  END IF;

  -- 1. Concurrency-safe row-level lock
  SELECT
    orders.status,
    orders.runner_id,
    orders.handover_otp_hash,
    orders.handover_attempts_count,
    orders.handover_locked_until,
    orders.handover_verified_at,
    orders.handover_otp_expires_at
  INTO
    v_status,
    v_runner_id,
    v_otp_hash,
    v_attempts,
    v_locked_until,
    v_verified_at,
    v_expires_at
  FROM public.orders
  WHERE orders.id = p_order_id
  FOR UPDATE;

  -- Guard: Order existence
  IF v_status IS NULL THEN
    RETURN QUERY SELECT FALSE, 'ORDER_NOT_FOUND'::VARCHAR, p_order_id, NULL::order_status_enum, 0, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Guard: Assigned runner authorization
  IF v_runner_id IS NULL OR v_runner_id <> p_runner_id THEN
    RETURN QUERY SELECT FALSE, 'ORDER_NOT_ASSIGNED_TO_RUNNER'::VARCHAR, p_order_id, v_status, GREATEST(0, 3 - COALESCE(v_attempts, 0)), v_locked_until, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Guard: Terminal/Already delivered state (Replay protection)
  IF v_status = 'DELIVERED' OR v_verified_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'OTP_ALREADY_USED'::VARCHAR, p_order_id, v_status, 0, v_locked_until, v_verified_at;
    RETURN;
  END IF;

  -- Guard: Permitted delivery state (must be ON_THE_WAY or OUT_FOR_DELIVERY)
  IF v_status NOT IN ('ON_THE_WAY', 'OUT_FOR_DELIVERY') THEN
    RETURN QUERY SELECT FALSE, 'INVALID_ORDER_STATE'::VARCHAR, p_order_id, v_status, GREATEST(0, 3 - COALESCE(v_attempts, 0)), v_locked_until, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Guard: Active 5-minute lockout check
  IF v_locked_until IS NOT NULL AND v_now < v_locked_until THEN
    RETURN QUERY SELECT FALSE, 'OTP_LOCKED'::VARCHAR, p_order_id, v_status, 0, v_locked_until, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Guard: 5-minute expiry check
  IF v_expires_at IS NOT NULL AND v_now > v_expires_at THEN
    RETURN QUERY SELECT FALSE, 'OTP_EXPIRED'::VARCHAR, p_order_id, v_status, GREATEST(0, 3 - COALESCE(v_attempts, 0)), v_locked_until, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 2. Verify hash match
  IF v_otp_hash IS NULL OR v_otp_hash <> p_otp_hash THEN
    v_attempts := COALESCE(v_attempts, 0) + 1;
    IF v_attempts >= 3 THEN
      v_locked_until := v_now + INTERVAL '5 minutes';
    END IF;

    -- Transaction-safe update: persists attempt counter even when verification fails
    UPDATE public.orders
    SET
      handover_attempts_count = v_attempts,
      handover_locked_until = v_locked_until,
      updated_at = v_now
    WHERE orders.id = p_order_id;

    IF v_attempts >= 3 THEN
      RETURN QUERY SELECT FALSE, 'OTP_LOCKED'::VARCHAR, p_order_id, v_status, 0, v_locked_until, NULL::TIMESTAMPTZ;
    ELSE
      RETURN QUERY SELECT FALSE, 'OTP_INVALID'::VARCHAR, p_order_id, v_status, GREATEST(0, 3 - v_attempts), v_locked_until, NULL::TIMESTAMPTZ;
    END IF;
    RETURN;
  END IF;

  -- 3. Atomic success completion
  UPDATE public.orders
  SET
    status = 'DELIVERED',
    handover_verified_at = v_now,
    delivered_at = v_now,
    handover_otp_hash = NULL,
    handover_attempts_count = 0,
    handover_locked_until = NULL,
    updated_at = v_now
  WHERE orders.id = p_order_id;

  RETURN QUERY SELECT TRUE, 'SUCCESS'::VARCHAR, p_order_id, 'DELIVERED'::order_status_enum, 3, NULL::TIMESTAMPTZ, v_now;
END;
$$;

-- ============================================================================
-- 5. ATOMIC DELIVERY OTP REISSUE FUNCTION (Result-Code Pattern)
-- Concurrency-safe: uses SELECT FOR UPDATE row locking
-- Preserves existing attempts and active lockout across refreshes.
-- Security: Definer function with strict search_path = public, pg_temp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reissue_delivery_otp(
  p_order_id VARCHAR(64),
  p_new_otp_hash VARCHAR(128),
  p_customer_id UUID,
  p_expiry_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  success BOOLEAN,
  result_code VARCHAR(64),
  order_id VARCHAR(64),
  status order_status_enum,
  expires_at TIMESTAMPTZ,
  attempts_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status order_status_enum;
  v_customer_id UUID;
  v_attempts INTEGER;
  v_locked_until TIMESTAMPTZ;
  v_last_resend TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_new_expires_at TIMESTAMPTZ := v_now + (COALESCE(p_expiry_seconds, 300) || ' seconds')::INTERVAL;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  -- Caller authorization check if running under user JWT context
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    ) INTO v_is_admin;

    IF NOT v_is_admin AND auth.uid() <> p_customer_id THEN
      RETURN QUERY SELECT FALSE, 'FORBIDDEN_CALLER_NOT_ORDER_OWNER'::VARCHAR, p_order_id, NULL::order_status_enum, NULL::TIMESTAMPTZ, 0;
      RETURN;
    END IF;
  END IF;

  -- Row-level lock
  SELECT
    orders.status,
    orders.customer_id,
    orders.handover_attempts_count,
    orders.handover_locked_until,
    orders.handover_otp_last_resend_at
  INTO
    v_status,
    v_customer_id,
    v_attempts,
    v_locked_until,
    v_last_resend
  FROM public.orders
  WHERE orders.id = p_order_id
  FOR UPDATE;

  -- Guard: Existence
  IF v_status IS NULL THEN
    RETURN QUERY SELECT FALSE, 'ORDER_NOT_FOUND'::VARCHAR, p_order_id, NULL::order_status_enum, NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  -- Guard: Customer ownership (strict)
  IF v_customer_id IS NOT NULL AND v_customer_id <> p_customer_id THEN
    RETURN QUERY SELECT FALSE, 'FORBIDDEN_ORDER_ACCESS'::VARCHAR, p_order_id, v_status, NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  -- Guard: Status must be out for delivery
  IF v_status NOT IN ('ON_THE_WAY', 'OUT_FOR_DELIVERY') THEN
    RETURN QUERY SELECT FALSE, 'INVALID_ORDER_STATE'::VARCHAR, p_order_id, v_status, NULL::TIMESTAMPTZ, GREATEST(0, 3 - COALESCE(v_attempts, 0));
    RETURN;
  END IF;

  -- Guard: Lockout must NOT be cleared by resend
  IF v_locked_until IS NOT NULL AND v_now < v_locked_until THEN
    RETURN QUERY SELECT FALSE, 'OTP_LOCKED'::VARCHAR, p_order_id, v_status, NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  -- Guard: 15-second resend cooldown rate-limit
  IF v_last_resend IS NOT NULL AND v_now < (v_last_resend + INTERVAL '15 seconds') THEN
    RETURN QUERY SELECT FALSE, 'RATE_LIMITED'::VARCHAR, p_order_id, v_status, NULL::TIMESTAMPTZ, GREATEST(0, 3 - COALESCE(v_attempts, 0));
    RETURN;
  END IF;

  -- Update order with fresh challenge (PRESERVES handover_attempts_count)
  UPDATE public.orders
  SET
    handover_otp_hash = p_new_otp_hash,
    handover_otp_expires_at = v_new_expires_at,
    handover_otp_last_resend_at = v_now,
    updated_at = v_now
  WHERE orders.id = p_order_id;

  RETURN QUERY SELECT TRUE, 'SUCCESS'::VARCHAR, p_order_id, v_status, v_new_expires_at, GREATEST(0, 3 - COALESCE(v_attempts, 0));
END;
$$;

-- ============================================================================
-- 6. REVOKE PRIVILEGES FROM CLIENT ROLES & GRANT EXCLUSIVELY TO SERVICE ROLE
-- Clients (anon / authenticated) CANNOT invoke these privileged functions directly
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.verify_delivery_otp(VARCHAR, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reissue_delivery_otp(VARCHAR, VARCHAR, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transition_order_to_on_the_way(VARCHAR, UUID, VARCHAR, INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.verify_delivery_otp(VARCHAR, VARCHAR, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reissue_delivery_otp(VARCHAR, VARCHAR, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_order_to_on_the_way(VARCHAR, UUID, VARCHAR, INTEGER) TO service_role;
