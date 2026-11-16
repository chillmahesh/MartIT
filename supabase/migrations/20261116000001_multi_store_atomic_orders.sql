-- ============================================================================
-- Migration: 20261116000001_multi_store_atomic_orders.sql
-- Description: Multi-Store Shopping & Child Fulfillment Group Support
-- Upgrades create_order_atomic to support items from multiple campus stores,
-- creating dedicated order_fulfillment_groups per store while preserving strict
-- deterministic ascending lock ordering and single-transaction atomicity.
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
  v_primary_store RECORD;
  v_location RECORD;
  v_item RECORD;
  v_prod RECORD;
  v_store_group RECORD;
  v_subtotal NUMERIC(10,2) := 0;
  v_base_amount NUMERIC(10,2);
  v_platform_fee NUMERIC(8,2);
  v_total NUMERIC(10,2);
  v_fulfillment_group_id VARCHAR(64);
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

  -- 3. Verify Primary Store (if specified)
  IF p_store_id IS NOT NULL AND trim(p_store_id) <> '' THEN
    SELECT id, name, description, latitude, longitude, is_open
    INTO v_primary_store
    FROM public.stores
    WHERE id = p_store_id;

    IF v_primary_store.id IS NULL THEN
      RAISE EXCEPTION 'STORE_NOT_FOUND' USING HINT = 'Store not found.';
    END IF;
    IF NOT v_primary_store.is_open THEN
      RAISE EXCEPTION 'STORE_CLOSED' USING HINT = 'Store is currently closed.';
    END IF;
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
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS x(product_id VARCHAR, "productId" VARCHAR, quantity NUMERIC)
    WHERE COALESCE(x.product_id, x."productId") IS NULL
       OR trim(COALESCE(x.product_id, x."productId")) = ''
  ) THEN
    RAISE EXCEPTION 'INVALID_LINE_ITEM' USING HINT = 'Valid product ID is required.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS x(product_id VARCHAR, "productId" VARCHAR, quantity NUMERIC)
    WHERE x.quantity IS NULL
       OR x.quantity <= 0
       OR x.quantity <> trunc(x.quantity)
       OR x.quantity > 2147483647
  ) THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING HINT = 'Quantity must be a positive integer within schema limits.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS x(product_id VARCHAR, "productId" VARCHAR, quantity NUMERIC)
    GROUP BY COALESCE(x.product_id, x."productId")
    HAVING SUM(x.quantity) > 2147483647
  ) THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING HINT = 'Aggregate product quantity exceeds maximum allowable limit.';
  END IF;

  -- Lock products deterministically by product_id ASC to eliminate cyclic deadlock risk
  FOR v_item IN
    SELECT
      COALESCE(x.product_id, x."productId") AS product_id,
      SUM(x.quantity)::INTEGER AS quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id VARCHAR, "productId" VARCHAR, quantity NUMERIC)
    GROUP BY COALESCE(x.product_id, x."productId")
    ORDER BY COALESCE(x.product_id, x."productId") ASC
  LOOP
    SELECT id, store_id, name, pack, price, stock, is_available
    INTO v_prod
    FROM public.products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF v_prod.id IS NULL OR NOT v_prod.is_available THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE'
        USING HINT = 'Product ' || v_item.product_id || ' is no longer available.';
    END IF;

    IF v_prod.stock < v_item.quantity THEN
      RAISE EXCEPTION 'OUT_OF_STOCK'
        USING HINT = 'Insufficient stock for product ' || v_prod.name;
    END IF;

    IF (v_subtotal + round((v_prod.price * v_item.quantity), 2)) > 99999999.99 THEN
      RAISE EXCEPTION 'ORDER_TOTAL_EXCEEDED'
        USING HINT = 'Order subtotal exceeds allowable maximum.';
    END IF;

    UPDATE public.products
    SET stock = stock - v_item.quantity, updated_at = v_now
    WHERE id = v_item.product_id;

    v_subtotal := v_subtotal + round((v_prod.price * v_item.quantity), 2);
  END LOOP;

  v_base_amount := round(v_subtotal + p_delivery_fee);
  v_total := v_base_amount + v_platform_fee;

  -- 7. Insert Parent Order Record
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
      jsonb_build_object('storeId', COALESCE(p_store_id, 'multi_store'), 'type', 'pickup', 'sequence', 0),
      jsonb_build_object('locationId', v_location.id, 'type', 'dropoff', 'sequence', 1)
    ),
    'straight_line_haversine', 'walking',
    jsonb_build_object('isEstimate', true, 'distanceMethod', 'straight_line'),
    p_fee_policy_version, v_attempt_id, v_fee_paise, v_now, v_window_exp, v_cooldown_exp,
    NULL, NULL, v_final_idempotency_key, v_now, v_now
  );

  -- 8. Update Platform Fee Slot Reservation
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

  -- 9. Insert Fulfillment Groups (one per distinct store represented in order items)
  FOR v_store_group IN
    SELECT
      p.store_id,
      s.name AS store_name,
      s.description AS store_desc,
      s.latitude AS store_lat,
      s.longitude AS store_lon,
      (ROW_NUMBER() OVER (ORDER BY p.store_id ASC) - 1)::INTEGER AS seq_idx
    FROM jsonb_to_recordset(p_items) AS x(product_id VARCHAR, "productId" VARCHAR)
    JOIN public.products p ON p.id = COALESCE(x.product_id, x."productId")
    JOIN public.stores s ON s.id = p.store_id
    GROUP BY p.store_id, s.name, s.description, s.latitude, s.longitude
    ORDER BY p.store_id ASC
  LOOP
    v_fulfillment_group_id := 'grp_' || substr(md5(random()::text || clock_timestamp()::text || v_store_group.store_id), 1, 24);

    INSERT INTO public.order_fulfillment_groups (
      id, order_id, store_id, store_snapshot, pickup_sequence_index, status, created_at, updated_at
    ) VALUES (
      v_fulfillment_group_id, p_order_id, v_store_group.store_id,
      jsonb_build_object(
        'id', v_store_group.store_id,
        'name', v_store_group.store_name,
        'description', v_store_group.store_desc,
        'latitude', v_store_group.store_lat,
        'longitude', v_store_group.store_lon
      ),
      v_store_group.seq_idx, 'PENDING', v_now, v_now
    );
  END LOOP;

  -- 10. Insert Order Items & Record Inventory Reservations
  FOR v_item IN
    SELECT
      COALESCE(x.product_id, x."productId") AS product_id,
      SUM(x.quantity)::INTEGER AS quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id VARCHAR, "productId" VARCHAR, quantity NUMERIC)
    GROUP BY COALESCE(x.product_id, x."productId")
    ORDER BY COALESCE(x.product_id, x."productId") ASC
  LOOP
    SELECT id, store_id, name, pack, price INTO v_prod
    FROM public.products
    WHERE id = v_item.product_id;

    -- Lookup matching fulfillment group ID for this product's store
    SELECT id INTO v_fulfillment_group_id
    FROM public.order_fulfillment_groups
    WHERE order_id = p_order_id AND store_id = v_prod.store_id;

    -- Record inventory hold referencing parent order
    INSERT INTO public.inventory_reservations (
      id, order_id, store_id, product_id, quantity, status, expires_at, created_at
    ) VALUES (
      'res_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
      p_order_id, v_prod.store_id, v_item.product_id, v_item.quantity, 'HELD', v_inventory_exp, v_now
    );

    -- Insert line item
    INSERT INTO public.order_items (
      id, order_id, fulfillment_group_id, store_id, product_id,
      product_name, product_pack, unit_price, quantity, line_subtotal, created_at
    ) VALUES (
      'item_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
      p_order_id, v_fulfillment_group_id, v_prod.store_id, v_prod.id,
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
