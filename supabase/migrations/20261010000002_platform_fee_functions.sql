-- Migration: 20261010000002_platform_fee_functions.sql
-- Description: Dynamic platform fee slot seed and atomic allocation stored functions
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- 1. SEED 99 DYNAMIC PLATFORM FEE SLOTS (1 to 99 paise)
-- ============================================================================

INSERT INTO platform_fee_reservations (fee_paise)
SELECT generate_series(1, 99)
ON CONFLICT (fee_paise) DO NOTHING;

-- ============================================================================
-- 2. ATOMIC PLATFORM FEE ALLOCATION FUNCTION
-- Concurrency-safe: uses FOR UPDATE SKIP LOCKED
-- Search path secured against hijacking
-- ============================================================================

CREATE OR REPLACE FUNCTION allocate_platform_fee(
  p_order_id VARCHAR(64),
  p_attempt_id VARCHAR(64),
  p_window_seconds INTEGER DEFAULT 120,   -- 2-minute verification window
  p_cooldown_seconds INTEGER DEFAULT 300  -- 5-minute cooldown
)
RETURNS TABLE (
  allocated_fee_paise INTEGER,
  allocated_at TIMESTAMPTZ,
  window_expires_at TIMESTAMPTZ,
  cooldown_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_paise INTEGER;
  v_now TIMESTAMPTZ := NOW();
  v_window_exp TIMESTAMPTZ := v_now + (p_window_seconds || ' seconds')::INTERVAL;
  v_cooldown_exp TIMESTAMPTZ := v_window_exp + (p_cooldown_seconds || ' seconds')::INTERVAL;
BEGIN
  -- Caller authorization check if running under user session
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND customer_id <> auth.uid()) AND NOT public.auth_is_admin() THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_ORDER_FEE_ALLOCATION'
        USING HINT = 'Cannot allocate platform fee for an order belonging to another user.';
    END IF;
  END IF;

  -- Guard: Cannot allocate fee for an order already marked PAID
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND payment_status = 'PAID') THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID'
      USING HINT = 'Cannot allocate a platform fee for an order that is already paid.';
  END IF;

  -- Select smallest available paise slot with row-level lock
  -- Explicitly qualify pfr.cooldown_expires_at to prevent ambiguity with the
  -- RETURNS TABLE output parameter 'cooldown_expires_at'.
  SELECT pfr.fee_paise INTO v_paise
  FROM public.platform_fee_reservations pfr
  WHERE (pfr.active_order_id IS NULL OR v_now >= pfr.cooldown_expires_at)
    AND pfr.is_paid = FALSE
  ORDER BY pfr.fee_paise ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_paise IS NULL THEN
    RAISE EXCEPTION 'ALL_PLATFORM_FEE_SLOTS_BUSY'
      USING HINT = 'All 99 platform fee verification slots are currently active or in cooldown. Please retry in a moment.';
  END IF;

  -- Update the selected slot
  UPDATE public.platform_fee_reservations
  SET
    active_order_id = p_order_id,
    attempt_id = p_attempt_id,
    allocated_at = v_now,
    window_expires_at = v_window_exp,
    cooldown_expires_at = v_cooldown_exp,
    is_paid = FALSE,
    paid_at = NULL
  WHERE fee_paise = v_paise;

  RETURN QUERY SELECT v_paise, v_now, v_window_exp, v_cooldown_exp;
END;
$$;

-- ============================================================================
-- 3. RELEASE PLATFORM FEE FUNCTION (e.g. on order creation failure / cancellation)
-- Protected: only releases unpaid reservations and checks caller ownership
-- ============================================================================

CREATE OR REPLACE FUNCTION release_platform_fee(p_order_id VARCHAR(64))
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Caller authorization check if running under user session
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND customer_id <> auth.uid()) AND NOT public.auth_is_admin() THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_ORDER_FEE_RELEASE'
        USING HINT = 'Cannot release a platform fee reservation belonging to another user.';
    END IF;
  END IF;

  -- Guard: Paid fees can never be released
  IF EXISTS (SELECT 1 FROM public.platform_fee_reservations WHERE active_order_id = p_order_id AND is_paid = TRUE) THEN
    RAISE EXCEPTION 'CANNOT_RELEASE_PAID_FEE'
      USING HINT = 'Platform fee slot has been paid and cannot be released.';
  END IF;

  UPDATE public.platform_fee_reservations
  SET
    active_order_id = NULL,
    attempt_id = NULL,
    allocated_at = NULL,
    window_expires_at = NULL,
    cooldown_expires_at = NULL
  WHERE active_order_id = p_order_id
    AND is_paid = FALSE;
  
  RETURN FOUND;
END;
$$;

-- ============================================================================
-- 4. MARK PLATFORM FEE PAID FUNCTION (server-verified payment evidence only)
-- Prevents unverified shortcuts, late verification overwriting terminal states,
-- and cross-user tampering. Commits inventory hold atomically.
-- ============================================================================

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

-- ============================================================================
-- 5. ATOMIC PAYMENT EXPIRATION FUNCTION
-- Server-authorized expiration: transitions PENDING/PROCESSING -> EXPIRED
-- Releases fee slot to cooldown and releases held inventory.
-- ============================================================================

CREATE OR REPLACE FUNCTION expire_order_payment(
  p_order_id VARCHAR(64),
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  expired BOOLEAN,
  previous_status payment_status_enum
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status payment_status_enum;
  v_window_exp TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Caller authorization check if running under user session
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND customer_id <> auth.uid()) AND NOT public.auth_is_admin() THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_PAYMENT_EXPIRATION'
        USING HINT = 'Cannot expire payment for an order belonging to another user.';
    END IF;
  END IF;

  SELECT payment_status, payment_window_expires_at INTO v_status, v_window_exp
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Paid orders can never be expired
  IF v_status = 'PAID' THEN
    RAISE EXCEPTION 'CANNOT_EXPIRE_PAID_ORDER'
      USING HINT = 'An order that has been paid and confirmed cannot be expired.';
  END IF;

  -- Already expired is idempotent
  IF v_status = 'EXPIRED' THEN
    RETURN QUERY SELECT TRUE, v_status;
    RETURN;
  END IF;

  -- Only expire if in active pending/processing state and (p_force is TRUE or window has passed)
  IF v_status IN ('PENDING', 'PROCESSING') AND (p_force = TRUE OR v_now >= v_window_exp) THEN
    UPDATE public.orders
    SET payment_status = 'EXPIRED',
        status = 'CANCELLED',
        updated_at = v_now
    WHERE id = p_order_id;

    -- Unbind order from fee slot so it enters 5-minute cooldown (protects paid fee slots)
    UPDATE public.platform_fee_reservations
    SET active_order_id = NULL
    WHERE active_order_id = p_order_id AND is_paid = FALSE;

    -- Atomically release any held inventory for this order
    PERFORM public.release_order_inventory(p_order_id);

    RETURN QUERY SELECT TRUE, v_status;
  ELSE
    RETURN QUERY SELECT FALSE, v_status;
  END IF;
END;
$$;

-- ============================================================================
-- 6. ATOMIC INVENTORY RESERVATION FUNCTIONS
-- Concurrency-safe: uses SELECT FOR UPDATE on product rows
-- Prevents duplicate holds, overselling, and negative stock.
-- ============================================================================

CREATE OR REPLACE FUNCTION reserve_order_inventory(
  p_order_id VARCHAR(64),
  p_items JSONB,
  p_ttl_seconds INTEGER DEFAULT 420
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item RECORD;
  v_stock INTEGER;
  v_available BOOLEAN;
  v_now TIMESTAMPTZ := NOW();
  v_exp TIMESTAMPTZ := v_now + (p_ttl_seconds || ' seconds')::INTERVAL;
BEGIN
  -- Prevent duplicate reservation holds for the same order
  IF EXISTS (SELECT 1 FROM public.inventory_reservations WHERE order_id = p_order_id AND status = 'HELD') THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_EXISTS'
      USING HINT = 'An active inventory hold already exists for this order.';
  END IF;

  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(store_id VARCHAR, product_id VARCHAR, quantity INTEGER)
  LOOP
    IF item.quantity IS NULL OR item.quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY'
        USING HINT = 'Quantity must be a positive integer.';
    END IF;

    -- Lock product row to prevent overselling
    SELECT stock, is_available INTO v_stock, v_available
    FROM public.products
    WHERE id = item.product_id AND store_id = item.store_id
    FOR UPDATE;

    IF v_stock IS NULL OR NOT v_available THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE'
        USING HINT = 'Product ' || item.product_id || ' is unavailable in store ' || item.store_id;
    END IF;

    IF v_stock < item.quantity THEN
      RAISE EXCEPTION 'OUT_OF_STOCK'
        USING HINT = 'Insufficient stock for product ' || item.product_id;
    END IF;

    -- Record reservation hold
    INSERT INTO public.inventory_reservations (id, order_id, store_id, product_id, quantity, status, expires_at, created_at)
    VALUES ('res_' || gen_random_uuid(), p_order_id, item.store_id, item.product_id, item.quantity, 'HELD', v_exp, v_now);

    -- Decrement stock atomically
    UPDATE public.products
    SET stock = stock - item.quantity, updated_at = v_now
    WHERE id = item.product_id AND store_id = item.store_id;
  END LOOP;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION release_order_inventory(p_order_id VARCHAR(64))
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  res RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  FOR res IN
    SELECT product_id, store_id, quantity
    FROM public.inventory_reservations
    WHERE order_id = p_order_id AND status = 'HELD'
    FOR UPDATE
  LOOP
    UPDATE public.products
    SET stock = stock + res.quantity, updated_at = v_now
    WHERE id = res.product_id AND store_id = res.store_id;
  END LOOP;

  UPDATE public.inventory_reservations
  SET status = 'RELEASED', released_at = v_now
  WHERE order_id = p_order_id AND status = 'HELD';

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- 7. REVOKE PRIVILEGES FROM CLIENT ROLES & GRANT EXCLUSIVELY TO SERVICE ROLE
-- Clients (anon / authenticated) CANNOT invoke these privileged functions directly
-- ============================================================================

REVOKE EXECUTE ON FUNCTION allocate_platform_fee(VARCHAR, VARCHAR, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION release_platform_fee(VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mark_platform_fee_paid(VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION expire_order_payment(VARCHAR, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION reserve_order_inventory(VARCHAR, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION release_order_inventory(VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION allocate_platform_fee(VARCHAR, VARCHAR, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_platform_fee(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION mark_platform_fee_paid(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION expire_order_payment(VARCHAR, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_order_inventory(VARCHAR, JSONB, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_order_inventory(VARCHAR) TO service_role;
