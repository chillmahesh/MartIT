-- Migration: 20261118000002_reallocate_platform_fee.sql
-- Description: Atomic dynamic platform fee retry/reallocation and 5-minute timeout lifecycle
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- 1. ATOMIC PAYMENT RETRY / REALLOCATION STORED PROCEDURE
-- Safely unbinds expired platform fee slots into cooldown, assigns the next
-- available slot (1 to 99 paise), updates total_payable, and sets a fresh 5-min window.
-- ============================================================================

CREATE OR REPLACE FUNCTION retry_order_platform_fee(
  p_order_id VARCHAR(64),
  p_customer_id UUID DEFAULT NULL,
  p_fee_window_seconds INTEGER DEFAULT 300,
  p_fee_cooldown_seconds INTEGER DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_old_fee_paise INTEGER;
  v_new_fee_paise INTEGER;
  v_new_platform_fee NUMERIC(10, 2);
  v_new_total NUMERIC(10, 2);
  v_attempt_id VARCHAR(64);
  v_now TIMESTAMPTZ := NOW();
  v_window_exp TIMESTAMPTZ := v_now + (p_fee_window_seconds || ' seconds')::INTERVAL;
  v_cooldown_exp TIMESTAMPTZ := v_window_exp + (p_fee_cooldown_seconds || ' seconds')::INTERVAL;
  v_result JSONB;
BEGIN
  -- 1. Lock and fetch order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND'
      USING HINT = 'No order found with the specified identifier.';
  END IF;

  -- 2. Authorization check
  -- If p_customer_id is provided, verify ownership (or admin session)
  IF p_customer_id IS NOT NULL AND v_order.customer_id <> p_customer_id THEN
    IF auth.uid() IS NULL OR NOT public.auth_is_admin() THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_PAYMENT_RETRY'
        USING HINT = 'Cannot retry payment for an order belonging to another user.';
    END IF;
  END IF;

  -- 3. Guard against terminal or already paid states
  IF v_order.payment_status = 'PAID' OR v_order.status IN ('CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED') THEN
    RAISE EXCEPTION 'CANNOT_RETRY_PAID_ORDER'
      USING HINT = 'Cannot retry payment for an order that is already paid or confirmed.';
  END IF;

  IF v_order.status = 'CANCELLED' AND v_order.payment_status <> 'EXPIRED' THEN
    RAISE EXCEPTION 'CANNOT_RETRY_CANCELLED_ORDER'
      USING HINT = 'Cannot retry payment for an order that was cancelled.';
  END IF;

  -- 4. Guard against active payment window (must be expired to retry)
  -- But if assigned within the last 10 seconds (rapid double-click), return current order idempotently
  IF v_order.payment_status = 'PENDING' AND v_now < v_order.payment_window_expires_at THEN
    IF v_order.payment_allocated_at >= (v_now - INTERVAL '10 seconds') THEN
      -- Idempotent return for rapid double-click
      SELECT jsonb_build_object(
        'orderId', v_order.id,
        'feePaise', v_order.fee_paise,
        'platformFee', v_order.platform_fee,
        'baseAmount', v_order.base_amount,
        'totalPayable', v_order.total_payable,
        'attemptId', v_order.payment_attempt_id,
        'allocatedAt', v_order.payment_allocated_at,
        'windowExpiresAt', v_order.payment_window_expires_at,
        'cooldownExpiresAt', v_order.payment_cooldown_expires_at,
        'isIdempotentHit', true
      ) INTO v_result;
      RETURN v_result;
    ELSE
      RAISE EXCEPTION 'PAYMENT_ACTIVE'
        USING HINT = 'The current payment window is still active.';
    END IF;
  END IF;

  -- 5. Put previous fee reservation into cooldown (guaranteeing late payment quarantine)
  v_old_fee_paise := v_order.fee_paise;
  IF v_old_fee_paise IS NOT NULL THEN
    UPDATE public.platform_fee_reservations
    SET
      active_order_id = NULL,
      cooldown_expires_at = GREATEST(COALESCE(cooldown_expires_at, v_now), v_now + (p_fee_cooldown_seconds || ' seconds')::INTERVAL)
    WHERE active_order_id = p_order_id
      AND is_paid = FALSE;
  END IF;

  -- 6. Atomically lock and reserve the next available dynamic platform fee slot (1 to 99 paise)
  SELECT pfr.fee_paise INTO v_new_fee_paise
  FROM public.platform_fee_reservations pfr
  WHERE (pfr.active_order_id IS NULL OR v_now >= pfr.cooldown_expires_at)
    AND pfr.is_paid = FALSE
  ORDER BY pfr.fee_paise ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_new_fee_paise IS NULL THEN
    RAISE EXCEPTION 'ALL_PLATFORM_FEE_SLOTS_BUSY'
      USING HINT = 'All dynamic payment fee slots are currently active or in cooldown. Please retry shortly.';
  END IF;

  -- 7. Calculate new dynamic amounts
  v_new_platform_fee := round((v_new_fee_paise::numeric / 100.0), 2);
  v_new_total := v_order.base_amount + v_new_platform_fee;
  v_attempt_id := 'att_' || replace(gen_random_uuid()::text, '-', '');

  -- 8. Update the newly reserved slot
  UPDATE public.platform_fee_reservations
  SET
    active_order_id = p_order_id,
    attempt_id = v_attempt_id,
    allocated_at = v_now,
    window_expires_at = v_window_exp,
    cooldown_expires_at = v_cooldown_exp,
    is_paid = FALSE,
    paid_at = NULL
  WHERE fee_paise = v_new_fee_paise;

  -- 9. Update the order record with the new payment attempt and exact amounts
  UPDATE public.orders
  SET
    fee_paise = v_new_fee_paise,
    platform_fee = v_new_platform_fee,
    total_payable = v_new_total,
    payment_attempt_id = v_attempt_id,
    payment_allocated_at = v_now,
    payment_window_expires_at = v_window_exp,
    payment_cooldown_expires_at = v_cooldown_exp,
    payment_status = 'PENDING',
    status = 'AWAITING_PAYMENT',
    updated_at = v_now
  WHERE id = p_order_id;

  -- 10. Build result payload
  SELECT jsonb_build_object(
    'orderId', p_order_id,
    'feePaise', v_new_fee_paise,
    'platformFee', v_new_platform_fee,
    'baseAmount', v_order.base_amount,
    'totalPayable', v_new_total,
    'attemptId', v_attempt_id,
    'allocatedAt', v_now,
    'windowExpiresAt', v_window_exp,
    'cooldownExpiresAt', v_cooldown_exp,
    'isIdempotentHit', false
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Security Grants: Strictly service_role only
REVOKE ALL ON FUNCTION retry_order_platform_fee(VARCHAR, UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION retry_order_platform_fee(VARCHAR, UUID, INTEGER, INTEGER) TO service_role;
