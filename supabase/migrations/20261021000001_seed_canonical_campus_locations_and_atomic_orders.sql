-- Migration: 20261021000001_seed_canonical_campus_locations_and_atomic_orders.sql
-- Description: Idempotently seed canonical campus delivery locations and provide atomic order creation procedure
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- 1. SEED CANONICAL CAMPUS DELIVERY LOCATIONS
-- ============================================================================

INSERT INTO public.locations (id, name, group_name, latitude, longitude, is_active) VALUES
  ('loc_hostel_a', 'Hostel A, Block 1', 'Hostels', 12.973300, 77.590000, true),
  ('loc_hostel_b', 'Hostel B, Block 3', 'Hostels', 12.977200, 77.590000, true),
  ('loc_library', 'Central Library', 'Academic', 12.985000, 77.590000, true),
  ('loc_faculty', 'Faculty Quarters', 'Residential', 12.995000, 77.590000, true),
  ('loc_far_gate', 'North Gate PG', 'Off-campus', 13.007000, 77.590000, true),
  ('loc_outside', 'City PG (outside area)', 'Off-campus', 13.020000, 77.590000, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  group_name = EXCLUDED.group_name,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- 2. ATOMIC ORDER CREATION RPC
-- Bundles platform fee reservation, inventory hold, parent order, fulfillment
-- group, and line item persistence into a single atomic PostgreSQL transaction.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_order_id VARCHAR(64),
  p_customer_id UUID,
  p_store_id VARCHAR(64),
  p_location_id VARCHAR(64),
  p_customer_details JSONB,
  p_items JSONB,
  p_delivery_fee NUMERIC(8,2),
  p_fee_policy_version VARCHAR(32),
  p_route_distance_km NUMERIC(8,4),
  p_idempotency_key VARCHAR(128) DEFAULT NULL,
  p_fee_window_seconds INTEGER DEFAULT 120,
  p_fee_cooldown_seconds INTEGER DEFAULT 300,
  p_inventory_ttl_seconds INTEGER DEFAULT 420
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_fee_paise INTEGER;
  v_window_exp TIMESTAMPTZ := v_now + (p_fee_window_seconds || ' seconds')::INTERVAL;
  v_cooldown_exp TIMESTAMPTZ := v_window_exp + (p_fee_cooldown_seconds || ' seconds')::INTERVAL;
  v_inventory_exp TIMESTAMPTZ := v_now + (p_inventory_ttl_seconds || ' seconds')::INTERVAL;
  v_store RECORD;
  v_location RECORD;
  v_item RECORD;
  v_prod RECORD;
  v_subtotal NUMERIC(10,2) := 0;
  v_base_amount NUMERIC(10,2);
  v_platform_fee NUMERIC(8,2);
  v_total NUMERIC(10,2);
  v_fulfillment_group_id VARCHAR(64) := 'grp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
  v_attempt_id VARCHAR(64) := 'att_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
  v_final_idempotency_key VARCHAR(128);
  v_existing_order_id VARCHAR(64);
  v_result JSONB;
BEGIN
  -- 1. Order and Customer Validation
  IF p_order_id IS NULL OR trim(p_order_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ORDER_ID' USING HINT = 'Order ID cannot be empty.';
  END IF;
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_ID' USING HINT = 'Customer ID is required.';
  END IF;

  -- 2. Idempotency Guard & Key Normalization
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    v_final_idempotency_key := trim(p_idempotency_key);
  ELSE
    -- Deterministic order-tied fallback key guaranteeing non-null, unique, and retry-safe invariants
    v_final_idempotency_key := 'idem_ord_' || p_order_id;
  END IF;

  SELECT id INTO v_existing_order_id
  FROM public.orders
  WHERE idempotency_key = v_final_idempotency_key OR id = p_order_id;

  IF v_existing_order_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = v_existing_order_id AND customer_id <> p_customer_id) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING HINT = 'Idempotency key belongs to another customer.';
    END IF;

    SELECT jsonb_build_object(
      'orderId', o.id,
      'id', o.id,
      'customerId', o.customer_id,
      'status', o.status,
      'paymentStatus', o.payment_status,
      'feePaise', o.fee_paise,
      'itemSubtotal', o.item_subtotal,
      'deliveryFee', o.combined_delivery_fee,
      'baseAmount', o.base_amount,
      'platformFee', o.platform_fee,
      'totalPayable', o.total_payable,
      'isIdempotentHit', true
    ) INTO v_result
    FROM public.orders o
    WHERE o.id = v_existing_order_id;

    RETURN v_result;
  END IF;

  -- 3. Verify Store exists and is open
  SELECT id, name, description, latitude, longitude, is_open
  INTO v_store
  FROM public.stores
  WHERE id = p_store_id;

  IF v_store.id IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING HINT = 'Store not found.';
  END IF;
  IF NOT v_store.is_open THEN
    RAISE EXCEPTION 'STORE_CLOSED' USING HINT = 'Store is currently closed.';
  END IF;

  -- 4. Verify Delivery Location exists and is active
  SELECT id, name, group_name, latitude, longitude, is_active
  INTO v_location
  FROM public.locations
  WHERE id = p_location_id;

  IF v_location.id IS NULL OR NOT v_location.is_active THEN
    RAISE EXCEPTION 'LOCATION_NOT_FOUND' USING HINT = 'Choose a valid delivery spot first.';
  END IF;

  -- 5. Lock Smallest Available Dynamic Platform Fee Slot (1 to 99 paise)
  -- Uses FOR UPDATE SKIP LOCKED to prevent concurrent orders from acquiring the same slot.
  -- The slot reservation UPDATE is deferred until after parent order insertion to strictly
  -- satisfy the immediate foreign-key constraint on platform_fee_reservations.active_order_id.
  SELECT pfr.fee_paise INTO v_fee_paise
  FROM public.platform_fee_reservations pfr
  WHERE (pfr.active_order_id IS NULL OR v_now >= pfr.cooldown_expires_at)
    AND pfr.is_paid = FALSE
  ORDER BY pfr.fee_paise ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_fee_paise IS NULL THEN
    RAISE EXCEPTION 'ALL_PLATFORM_FEE_SLOTS_BUSY'
      USING HINT = 'All dynamic payment fee slots are currently active. Please retry shortly.';
  END IF;

  v_platform_fee := round((v_fee_paise::numeric / 100.0), 2);

  -- 6. Lock and Validate Products, Decrement Stock
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id VARCHAR, quantity INTEGER)
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY' USING HINT = 'Quantity must be positive.';
    END IF;

    SELECT id, name, pack, price, stock, is_available
    INTO v_prod
    FROM public.products
    WHERE id = v_item.product_id AND store_id = p_store_id
    FOR UPDATE;

    IF v_prod.id IS NULL OR NOT v_prod.is_available THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE'
        USING HINT = 'Product ' || v_item.product_id || ' is no longer available.';
    END IF;

    IF v_prod.stock < v_item.quantity THEN
      RAISE EXCEPTION 'OUT_OF_STOCK'
        USING HINT = 'Insufficient stock for product ' || v_prod.name;
    END IF;

    -- Decrement product stock
    UPDATE public.products
    SET stock = stock - v_item.quantity, updated_at = v_now
    WHERE id = v_item.product_id AND store_id = p_store_id;

    v_subtotal := v_subtotal + round((v_prod.price * v_item.quantity), 2);
  END LOOP;

  -- Calculate authoritative financial sums according to agreed fee policy:
  -- base_amount = ROUND(item_subtotal + delivery_fee)
  -- total_payable = base_amount + platform_fee
  v_base_amount := round(v_subtotal + p_delivery_fee);
  v_total := v_base_amount + v_platform_fee;

  -- 7. Insert Parent Order Record
  -- Foreign key on fee_paise REFERENCES platform_fee_reservations(fee_paise) succeeds because
  -- all 99 slots exist. Inserting orders first guarantees the parent row exists before any child references.
  INSERT INTO public.orders (
    id, customer_id, delivery_location_id, delivery_location_snapshot,
    status, payment_status, item_subtotal, combined_delivery_fee, base_amount, platform_fee,
    total_payable, route_distance_km, route_stop_sequence, routing_provider, routing_mode,
    routing_metadata, fee_policy_version, payment_attempt_id, fee_paise, payment_allocated_at,
    payment_window_expires_at, payment_cooldown_expires_at, paid_at, runner_id, idempotency_key,
    created_at, updated_at
  ) VALUES (
    p_order_id, p_customer_id, v_location.id,
    jsonb_build_object(
      'id', v_location.id,
      'name', v_location.name,
      'group_name', v_location.group_name,
      'latitude', v_location.latitude,
      'longitude', v_location.longitude,
      'customerDetails', p_customer_details
    ),
    'AWAITING_PAYMENT', 'PENDING', v_subtotal, p_delivery_fee, v_base_amount,
    v_platform_fee, v_total, p_route_distance_km,
    jsonb_build_array(
      jsonb_build_object('storeId', v_store.id, 'type', 'pickup', 'sequence', 0),
      jsonb_build_object('locationId', v_location.id, 'type', 'dropoff', 'sequence', 1)
    ),
    'straight_line_haversine', 'walking',
    jsonb_build_object('isEstimate', true, 'distanceMethod', 'straight_line'),
    p_fee_policy_version, v_attempt_id, v_fee_paise, v_now, v_window_exp, v_cooldown_exp,
    NULL, NULL, v_final_idempotency_key, v_now, v_now
  );

  -- 8. Update Platform Fee Slot Reservation
  -- Parent order row now exists in public.orders, satisfying the foreign-key constraint.
  UPDATE public.platform_fee_reservations
  SET
    active_order_id = p_order_id,
    attempt_id = v_attempt_id,
    allocated_at = v_now,
    window_expires_at = v_window_exp,
    cooldown_expires_at = v_cooldown_exp,
    is_paid = FALSE,
    paid_at = NULL
  WHERE fee_paise = v_fee_paise;

  -- 9. Insert Fulfillment Group
  INSERT INTO public.order_fulfillment_groups (
    id, order_id, store_id, store_snapshot, pickup_sequence_index, status, created_at, updated_at
  ) VALUES (
    v_fulfillment_group_id, p_order_id, v_store.id,
    jsonb_build_object(
      'id', v_store.id,
      'name', v_store.name,
      'description', v_store.description,
      'latitude', v_store.latitude,
      'longitude', v_store.longitude
    ),
    0, 'PENDING', v_now, v_now
  );

  -- 10. Insert Order Items & Record Inventory Reservations
  -- Now that the parent order exists, inventory_reservations and order_items can safely reference it.
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id VARCHAR, quantity INTEGER)
  LOOP
    SELECT id, name, pack, price INTO v_prod
    FROM public.products
    WHERE id = v_item.product_id AND store_id = p_store_id;

    -- Record inventory hold referencing parent order
    INSERT INTO public.inventory_reservations (
      id, order_id, store_id, product_id, quantity, status, expires_at, created_at
    ) VALUES (
      'res_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
      p_order_id, p_store_id, v_item.product_id, v_item.quantity, 'HELD', v_inventory_exp, v_now
    );

    -- Insert line item
    INSERT INTO public.order_items (
      id, order_id, fulfillment_group_id, store_id, product_id,
      product_name, product_pack, unit_price, quantity, line_subtotal, created_at
    ) VALUES (
      'item_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
      p_order_id, v_fulfillment_group_id, v_store.id, v_prod.id,
      v_prod.name, v_prod.pack, v_prod.price, v_item.quantity,
      round((v_prod.price * v_item.quantity), 2), v_now
    );
  END LOOP;

  -- 11. Build and return result
  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'id', p_order_id,
    'feePaise', v_fee_paise,
    'attemptId', v_attempt_id,
    'allocatedAt', v_now,
    'windowExpiresAt', v_window_exp,
    'cooldownExpiresAt', v_cooldown_exp,
    'itemSubtotal', v_subtotal,
    'deliveryFee', p_delivery_fee,
    'baseAmount', v_base_amount,
    'platformFee', v_platform_fee,
    'totalPayable', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_order_atomic(VARCHAR, UUID, VARCHAR, VARCHAR, JSONB, JSONB, NUMERIC, VARCHAR, NUMERIC, VARCHAR, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_order_atomic(VARCHAR, UUID, VARCHAR, VARCHAR, JSONB, JSONB, NUMERIC, VARCHAR, NUMERIC, VARCHAR, INTEGER, INTEGER, INTEGER) TO service_role;
