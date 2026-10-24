-- Forward migration: require authoritative payment verification before marking an order paid.
-- This deliberately replaces the deployed function rather than editing historical migration history.

CREATE OR REPLACE FUNCTION mark_platform_fee_paid(p_order_id VARCHAR(64))
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_status order_status_enum;
  v_status payment_status_enum;
  v_total NUMERIC(10, 2);
  v_window_exp TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_has_verified_record BOOLEAN := FALSE;
BEGIN
  -- Caller authorization: Direct client calls cannot bypass server verification
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.auth_is_admin() THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_PAYMENT_VERIFICATION'
        USING HINT = 'Direct client execution of payment verification is forbidden. Must be executed by server-authorized service role.';
    END IF;
  END IF;

  -- Lock order row to verify current payment state
  SELECT status, payment_status, total_payable, payment_window_expires_at INTO v_order_status, v_status, v_total, v_window_exp
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND'
      USING HINT = 'No order found with the specified identifier.';
  END IF;

  -- Idempotent success if already marked paid
  IF v_status = 'PAID' THEN
    RETURN TRUE;
  END IF;

  -- Guard: cancelled orders or terminal payment states cannot be transitioned to PAID
  IF v_order_status = 'CANCELLED' OR v_status IN ('EXPIRED', 'FAILED', 'REFUNDED') THEN
    RAISE EXCEPTION 'CANNOT_VERIFY_TERMINAL_PAYMENT'
      USING HINT = 'Order payment has already expired or failed and cannot be transitioned to PAID.';
  END IF;

  -- Guard: window expiry check
  IF v_now >= v_window_exp THEN
    RAISE EXCEPTION 'PAYMENT_WINDOW_EXPIRED'
      USING HINT = 'The 2-minute payment verification window has expired.';
  END IF;

  -- Anti-Shortcut Guard: Require authentic, verified payment record matching the exact order total
  SELECT EXISTS (
    SELECT 1 FROM public.payment_records
    WHERE order_id = p_order_id
      AND amount = v_total
      AND status = 'PAID'
      AND evidence = 'Payment received'
      AND verification_source = 'AUTHORITATIVE_GATEWAY'
  ) INTO v_has_verified_record;

  IF NOT v_has_verified_record THEN
    RAISE EXCEPTION 'UNVERIFIED_PAYMENT_SHORTCUT_PROHIBITED'
      USING HINT = 'Cannot mark platform fee paid without a verified payment record matching the order total.';
  END IF;

  -- Mark order payment paid and transition order to CONFIRMED
  UPDATE public.orders
  SET
    payment_status = 'PAID',
    status = 'CONFIRMED',
    paid_at = v_now,
    updated_at = v_now
  WHERE id = p_order_id;

  -- Mark dynamic platform fee slot as paid (protects slot forever from reassignment)
  UPDATE public.platform_fee_reservations
  SET
    is_paid = TRUE,
    paid_at = v_now
  WHERE active_order_id = p_order_id;

  -- Atomically commit held inventory for this order
  UPDATE public.inventory_reservations
  SET status = 'COMMITTED', committed_at = v_now
  WHERE order_id = p_order_id AND status = 'HELD';

  RETURN TRUE;
END;
$$;
