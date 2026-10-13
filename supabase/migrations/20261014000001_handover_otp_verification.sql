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
-- 3. ATOMIC DELIVERY OTP VERIFICATION FUNCTION
-- Concurrency-safe: uses SELECT FOR UPDATE row locking
-- Security: Definer function with strict search_path = public, pg_temp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_delivery_otp(
  p_order_id VARCHAR(64),
  p_otp_hash VARCHAR(128),
  p_runner_id UUID
)
RETURNS TABLE (
  order_id VARCHAR(64),
  status order_status_enum,
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
    -- Check if caller is admin/super_admin
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    ) INTO v_is_admin;

    IF NOT v_is_admin AND auth.uid() <> p_runner_id THEN
      RAISE EXCEPTION 'FORBIDDEN_CALLER_NOT_RUNNER'
        USING HINT = 'Authenticated caller does not match specified runner identifier.';
    END IF;
  END IF;

  -- 1. Concurrency-safe row-level lock
  SELECT
    status,
    runner_id,
    handover_otp_hash,
    handover_attempts_count,
    handover_locked_until,
    handover_verified_at,
    handover_otp_expires_at
  INTO
    v_status,
    v_runner_id,
    v_otp_hash,
    v_attempts,
    v_locked_until,
    v_verified_at,
    v_expires_at
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  -- Guard: Order existence
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND'
      USING HINT = 'No order found with the specified identifier.';
  END IF;

  -- Guard: Assigned runner authorization
  IF v_runner_id IS NULL OR v_runner_id <> p_runner_id THEN
    RAISE EXCEPTION 'ORDER_NOT_ASSIGNED_TO_RUNNER'
      USING HINT = 'Caller is not the approved runner assigned to this delivery.';
  END IF;

  -- Guard: Terminal/Already delivered state (Replay protection)
  IF v_status = 'DELIVERED' OR v_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'OTP_ALREADY_USED'
      USING HINT = 'This delivery has already been verified and completed.';
  END IF;

  -- Guard: Permitted delivery state (must be ON_THE_WAY or OUT_FOR_DELIVERY)
  IF v_status NOT IN ('ON_THE_WAY', 'OUT_FOR_DELIVERY') THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATE'
      USING HINT = 'Delivery verification is only permitted when order is out for delivery.';
  END IF;

  -- Guard: Active 5-minute lockout check
  IF v_locked_until IS NOT NULL AND v_now < v_locked_until THEN
    RAISE EXCEPTION 'OTP_LOCKED'
      USING HINT = 'Verification is locked due to multiple failed attempts.';
  END IF;

  -- Guard: 5-minute expiry check
  IF v_expires_at IS NOT NULL AND v_now > v_expires_at THEN
    RAISE EXCEPTION 'OTP_EXPIRED'
      USING HINT = 'Delivery verification challenge has expired.';
  END IF;

  -- 2. Verify hash match
  IF v_otp_hash IS NULL OR v_otp_hash <> p_otp_hash THEN
    v_attempts := v_attempts + 1;
    IF v_attempts >= 3 THEN
      v_locked_until := v_now + INTERVAL '5 minutes';
    END IF;

    UPDATE public.orders
    SET
      handover_attempts_count = v_attempts,
      handover_locked_until = v_locked_until,
      updated_at = v_now
    WHERE id = p_order_id;

    IF v_attempts >= 3 THEN
      RAISE EXCEPTION 'OTP_LOCKED'
        USING HINT = 'Maximum verification attempts exceeded. Locked for 5 minutes.';
    ELSE
      RAISE EXCEPTION 'OTP_INVALID'
        USING HINT = 'Submitted delivery OTP does not match challenge.';
    END IF;
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
  WHERE id = p_order_id;

  RETURN QUERY SELECT p_order_id, 'DELIVERED'::order_status_enum, v_now;
END;
$$;

-- ============================================================================
-- 4. ATOMIC DELIVERY OTP REISSUE FUNCTION
-- Concurrency-safe: uses SELECT FOR UPDATE row locking
-- Security: Definer function with strict search_path = public, pg_temp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reissue_delivery_otp(
  p_order_id VARCHAR(64),
  p_new_otp_hash VARCHAR(128),
  p_customer_id UUID,
  p_expiry_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
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
      RAISE EXCEPTION 'FORBIDDEN_CALLER_NOT_ORDER_OWNER'
        USING HINT = 'Authenticated caller is not the owner of this order.';
    END IF;
  END IF;

  -- Row-level lock
  SELECT
    status,
    customer_id,
    handover_attempts_count,
    handover_locked_until,
    handover_otp_last_resend_at
  INTO
    v_status,
    v_customer_id,
    v_attempts,
    v_locked_until,
    v_last_resend
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  -- Guard: Existence
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND'
      USING HINT = 'No order found with the specified identifier.';
  END IF;

  -- Guard: Customer ownership
  IF v_customer_id IS NOT NULL AND v_customer_id <> p_customer_id THEN
    RAISE EXCEPTION 'FORBIDDEN_ORDER_ACCESS'
      USING HINT = 'Order belongs to another customer account.';
  END IF;

  -- Guard: Status must be out for delivery
  IF v_status NOT IN ('ON_THE_WAY', 'OUT_FOR_DELIVERY') THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATE'
      USING HINT = 'Cannot refresh OTP for order that is not out for delivery.';
  END IF;

  -- Guard: Lockout must NOT be cleared by resend
  IF v_locked_until IS NOT NULL AND v_now < v_locked_until THEN
    RAISE EXCEPTION 'OTP_LOCKED'
      USING HINT = 'Order verification is locked due to too many failed attempts.';
  END IF;

  -- Guard: 15-second resend cooldown rate-limit
  IF v_last_resend IS NOT NULL AND v_now < (v_last_resend + INTERVAL '15 seconds') THEN
    RAISE EXCEPTION 'RATE_LIMITED'
      USING HINT = 'Please wait at least 15 seconds before requesting a new delivery OTP.';
  END IF;

  -- Update order with fresh challenge
  UPDATE public.orders
  SET
    handover_otp_hash = p_new_otp_hash,
    handover_otp_expires_at = v_new_expires_at,
    handover_otp_last_resend_at = v_now,
    updated_at = v_now
  WHERE id = p_order_id;

  RETURN QUERY SELECT p_order_id, v_status, v_new_expires_at, GREATEST(0, 3 - COALESCE(v_attempts, 0));
END;
$$;
