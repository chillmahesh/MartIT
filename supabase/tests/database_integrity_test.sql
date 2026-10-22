-- ==============================================================================
-- MartIT — Database Integrity, Constraint & Function Grant Tests
-- Run against a local/test PostgreSQL instance with:
--   psql "$TEST_DATABASE_URL" -f supabase/tests/database_integrity_test.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- TEST 1: Function Execution Grants
-- Verify that client roles (PUBLIC, anon, authenticated) CANNOT execute privileged functions
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- Test allocate_platform_fee
  IF has_function_privilege('anon', 'allocate_platform_fee(varchar, varchar, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon has EXECUTE on allocate_platform_fee';
  END IF;
  IF has_function_privilege('authenticated', 'allocate_platform_fee(varchar, varchar, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated has EXECUTE on allocate_platform_fee';
  END IF;

  -- Test release_platform_fee
  IF has_function_privilege('anon', 'release_platform_fee(varchar)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon has EXECUTE on release_platform_fee';
  END IF;
  IF has_function_privilege('authenticated', 'release_platform_fee(varchar)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated has EXECUTE on release_platform_fee';
  END IF;

  -- Test mark_platform_fee_paid
  IF has_function_privilege('anon', 'mark_platform_fee_paid(varchar)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon has EXECUTE on mark_platform_fee_paid';
  END IF;
  IF has_function_privilege('authenticated', 'mark_platform_fee_paid(varchar)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated has EXECUTE on mark_platform_fee_paid';
  END IF;

  -- Test expire_order_payment
  IF has_function_privilege('anon', 'expire_order_payment(varchar, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon has EXECUTE on expire_order_payment';
  END IF;
  IF has_function_privilege('authenticated', 'expire_order_payment(varchar, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated has EXECUTE on expire_order_payment';
  END IF;

  -- Test reserve_order_inventory
  IF has_function_privilege('anon', 'reserve_order_inventory(varchar, jsonb, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon has EXECUTE on reserve_order_inventory';
  END IF;

  -- Test release_order_inventory
  IF has_function_privilege('anon', 'release_order_inventory(varchar)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon has EXECUTE on release_order_inventory';
  END IF;

  -- Test create_order_atomic: client roles cannot execute
  IF has_function_privilege('anon', 'create_order_atomic(varchar, uuid, varchar, varchar, jsonb, jsonb, numeric, varchar, numeric, varchar, integer, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon has EXECUTE on create_order_atomic';
  END IF;
  IF has_function_privilege('authenticated', 'create_order_atomic(varchar, uuid, varchar, varchar, jsonb, jsonb, numeric, varchar, numeric, varchar, integer, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated has EXECUTE on create_order_atomic';
  END IF;

  -- Test handle_new_user: client roles cannot execute, but auth admin can
  IF has_function_privilege('anon', 'handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon has EXECUTE on handle_new_user';
  END IF;
  IF has_function_privilege('authenticated', 'handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated has EXECUTE on handle_new_user';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    IF NOT has_function_privilege('supabase_auth_admin', 'handle_new_user()', 'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY FAIL: supabase_auth_admin does not have EXECUTE on handle_new_user';
    END IF;
  END IF;

  -- Test helper function anon execution
  IF has_function_privilege('anon', 'auth_is_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon has EXECUTE on auth_is_admin';
  END IF;

  RAISE NOTICE '✓ TEST 1 PASSED: Client roles cannot execute privileged functions.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 2: Financial Integrity Constraints
-- Inconsistent totals must be rejected by PostgreSQL CHECK constraints
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
BEGIN
  -- Attempt inconsistent base_amount
  BEGIN
    INSERT INTO orders (
      id, customer_id, delivery_location_id, delivery_location_snapshot,
      item_subtotal, combined_delivery_fee, base_amount, platform_fee, total_payable,
      route_distance_km, route_stop_sequence, routing_provider, routing_mode, fee_policy_version,
      payment_attempt_id, fee_paise, payment_allocated_at, payment_window_expires_at, payment_cooldown_expires_at,
      idempotency_key
    ) VALUES (
      'ord_test_math_1', gen_random_uuid(), 'loc_hostel_a', '{"name":"Hostel"}'::jsonb,
      100.00, 15.00, 120.00, -- WRONG: 100 + 15 = 115, not 120
      0.15, 120.15, 1.0, '[]'::jsonb, 'straight_line', 'walking', '2026-10-09.1',
      'att_1', 15, NOW(), NOW() + interval '2 minutes', NOW() + interval '7 minutes',
      'idemp_math_1'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'INTEGRITY FAIL: Inconsistent base_amount was accepted!';
  END IF;

  -- Attempt inconsistent total_payable
  v_failed := FALSE;
  BEGIN
    INSERT INTO orders (
      id, customer_id, delivery_location_id, delivery_location_snapshot,
      item_subtotal, combined_delivery_fee, base_amount, platform_fee, total_payable,
      route_distance_km, route_stop_sequence, routing_provider, routing_mode, fee_policy_version,
      payment_attempt_id, fee_paise, payment_allocated_at, payment_window_expires_at, payment_cooldown_expires_at,
      idempotency_key
    ) VALUES (
      'ord_test_math_2', gen_random_uuid(), 'loc_hostel_a', '{"name":"Hostel"}'::jsonb,
      100.00, 15.00, 115.00, 0.15,
      116.00, -- WRONG: 115 + 0.15 = 115.15, not 116.00
      1.0, '[]'::jsonb, 'straight_line', 'walking', '2026-10-09.1',
      'att_2', 15, NOW(), NOW() + interval '2 minutes', NOW() + interval '7 minutes',
      'idemp_math_2'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'INTEGRITY FAIL: Inconsistent total_payable was accepted!';
  END IF;

  RAISE NOTICE '✓ TEST 2 PASSED: Orders financial check constraints reject inconsistent math.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 3: Cross-Store & Cross-Order Fulfillment Group Integrity
-- Order item MUST belong to the exact same order and store as its group
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
  v_cust_id UUID := gen_random_uuid();
BEGIN
  -- Insert dummy user profile if needed
  INSERT INTO profiles (id, email, name) VALUES (v_cust_id, 'test_integrity@campus.edu', 'Test Integrity')
  ON CONFLICT (id) DO NOTHING;

  -- Create order 1 and store A group
  INSERT INTO orders (
    id, customer_id, delivery_location_id, delivery_location_snapshot,
    item_subtotal, combined_delivery_fee, base_amount, platform_fee, total_payable,
    route_distance_km, route_stop_sequence, routing_provider, routing_mode, fee_policy_version,
    payment_attempt_id, fee_paise, payment_allocated_at, payment_window_expires_at, payment_cooldown_expires_at,
    idempotency_key
  ) VALUES (
    'ord_rel_1', v_cust_id, 'loc_hostel_a', '{"name":"Hostel"}'::jsonb,
    50.00, 10.00, 60.00, 0.05, 60.05, 0.4, '[]'::jsonb, 'straight_line', 'walking', '2026-10-09.1',
    'att_rel_1', 5, NOW(), NOW() + interval '2 minutes', NOW() + interval '7 minutes',
    'idemp_rel_1'
  );

  INSERT INTO order_fulfillment_groups (id, order_id, store_id, store_snapshot, pickup_sequence_index)
  VALUES ('grp_rel_1', 'ord_rel_1', 'store_campus_mart', '{"name":"Campus Mart"}'::jsonb, 0);

  -- Attempt to insert order item with store_night_canteen for grp_rel_1 (which is store_campus_mart)
  BEGIN
    INSERT INTO order_items (
      id, order_id, fulfillment_group_id, store_id, product_id,
      product_name, unit_price, quantity, line_subtotal
    ) VALUES (
      'item_rogue_1', 'ord_rel_1', 'grp_rel_1', 'store_night_canteen', 'p_nc_maggi',
      'Rogue Item', 65.00, 1, 65.00
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'INTEGRITY FAIL: Order item with mismatched store was accepted into fulfillment group!';
  END IF;

  RAISE NOTICE '✓ TEST 3 PASSED: Composite foreign key rejects items from mismatched stores or orders.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 4: Product Store Mismatch Integrity
-- Order item product MUST belong to the store specified in the order item
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
  v_cust_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, name) VALUES (v_cust_id, 'test_prod_match@campus.edu', 'Test Prod Match')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO orders (
    id, customer_id, delivery_location_id, delivery_location_snapshot,
    item_subtotal, combined_delivery_fee, base_amount, platform_fee, total_payable,
    route_distance_km, route_stop_sequence, routing_provider, routing_mode, fee_policy_version,
    payment_attempt_id, fee_paise, payment_allocated_at, payment_window_expires_at, payment_cooldown_expires_at,
    idempotency_key
  ) VALUES (
    'ord_pm_1', v_cust_id, 'loc_hostel_a', '{"name":"Hostel"}'::jsonb,
    50.00, 10.00, 60.00, 0.05, 60.05, 0.4, '[]'::jsonb, 'straight_line', 'walking', '2026-10-09.1',
    'att_pm_1', 5, NOW(), NOW() + interval '2 minutes', NOW() + interval '7 minutes',
    'idemp_pm_1'
  );

  INSERT INTO order_fulfillment_groups (id, order_id, store_id, store_snapshot, pickup_sequence_index)
  VALUES ('grp_pm_1', 'ord_pm_1', 'store_campus_mart', '{"name":"Campus Mart"}'::jsonb, 0);

  -- Attempt to insert order item with store_campus_mart but product_id that belongs to store_night_canteen
  BEGIN
    INSERT INTO order_items (
      id, order_id, fulfillment_group_id, store_id, product_id,
      product_name, unit_price, quantity, line_subtotal
    ) VALUES (
      'item_rogue_prod', 'ord_pm_1', 'grp_pm_1', 'store_campus_mart', 'p_nc_maggi', -- p_nc_maggi belongs to store_night_canteen!
      'Cross Store Product', 50.00, 1, 50.00
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'INTEGRITY FAIL: Product from another store was accepted into order item!';
  END IF;

  RAISE NOTICE '✓ TEST 4 PASSED: Product-store foreign key rejects products from mismatched stores.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 5: Payment Record Amount Consistency
-- Payment record amount MUST exactly match the parent order total_payable
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
  v_cust_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, name) VALUES (v_cust_id, 'test_pay_match@campus.edu', 'Test Pay Match')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO orders (
    id, customer_id, delivery_location_id, delivery_location_snapshot,
    item_subtotal, combined_delivery_fee, base_amount, platform_fee, total_payable,
    route_distance_km, route_stop_sequence, routing_provider, routing_mode, fee_policy_version,
    payment_attempt_id, fee_paise, payment_allocated_at, payment_window_expires_at, payment_cooldown_expires_at,
    idempotency_key
  ) VALUES (
    'ord_pay_amt_1', v_cust_id, 'loc_hostel_a', '{"name":"Hostel"}'::jsonb,
    100.00, 15.00, 115.00, 0.15, 115.15, 1.0, '[]'::jsonb, 'straight_line', 'walking', '2026-10-09.1',
    'att_pay_1', 15, NOW(), NOW() + interval '2 minutes', NOW() + interval '7 minutes',
    'idemp_pay_amt_1'
  );

  -- Attempt to insert underpaid payment record (₹10 instead of ₹115.15)
  BEGIN
    INSERT INTO payment_records (
      id, order_id, attempt_id, amount, status, evidence
    ) VALUES (
      'pay_bad_amt', 'ord_pay_amt_1', 'att_pay_1', 10.00, 'PAID', 'Forged evidence'
    );
  EXCEPTION WHEN raise_exception THEN
    v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'INTEGRITY FAIL: Payment record with mismatched amount was accepted!';
  END IF;

  RAISE NOTICE '✓ TEST 5 PASSED: Payment record trigger enforces exact total_payable amount match.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 6: Unverified Payment Shortcut Prevention
-- mark_platform_fee_paid CANNOT mark an order paid without a verified payment record
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
  v_cust_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, name) VALUES (v_cust_id, 'test_shortcut@campus.edu', 'Test Shortcut')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO orders (
    id, customer_id, delivery_location_id, delivery_location_snapshot,
    item_subtotal, combined_delivery_fee, base_amount, platform_fee, total_payable,
    route_distance_km, route_stop_sequence, routing_provider, routing_mode, fee_policy_version,
    payment_attempt_id, fee_paise, payment_allocated_at, payment_window_expires_at, payment_cooldown_expires_at,
    idempotency_key
  ) VALUES (
    'ord_shortcut_1', v_cust_id, 'loc_hostel_a', '{"name":"Hostel"}'::jsonb,
    100.00, 15.00, 115.00, 0.15, 115.15, 1.0, '[]'::jsonb, 'straight_line', 'walking', '2026-10-09.1',
    'att_sc_1', 15, NOW(), NOW() + interval '2 minutes', NOW() + interval '7 minutes',
    'idemp_sc_1'
  );

  -- Attempt to invoke mark_platform_fee_paid without any payment record inserted
  BEGIN
    PERFORM mark_platform_fee_paid('ord_shortcut_1');
  EXCEPTION WHEN raise_exception THEN
    v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'SECURITY FAIL: mark_platform_fee_paid succeeded without verified payment record!';
  END IF;

  RAISE NOTICE '✓ TEST 6 PASSED: mark_platform_fee_paid rejects unverified payment shortcuts.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 7: Terminal State Late Overwrite Protection
-- Late verification evidence cannot transition an already EXPIRED order to PAID
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
  v_cust_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, name) VALUES (v_cust_id, 'test_terminal@campus.edu', 'Test Terminal')
  ON CONFLICT (id) DO NOTHING;

  -- Insert order already in EXPIRED terminal state
  INSERT INTO orders (
    id, customer_id, delivery_location_id, delivery_location_snapshot,
    status, payment_status,
    item_subtotal, combined_delivery_fee, base_amount, platform_fee, total_payable,
    route_distance_km, route_stop_sequence, routing_provider, routing_mode, fee_policy_version,
    payment_attempt_id, fee_paise, payment_allocated_at, payment_window_expires_at, payment_cooldown_expires_at,
    idempotency_key
  ) VALUES (
    'ord_term_1', v_cust_id, 'loc_hostel_a', '{"name":"Hostel"}'::jsonb,
    'CANCELLED', 'EXPIRED',
    100.00, 15.00, 115.00, 0.15, 115.15, 1.0, '[]'::jsonb, 'straight_line', 'walking', '2026-10-09.1',
    'att_tm_1', 15, NOW() - interval '10 minutes', NOW() - interval '8 minutes', NOW() - interval '3 minutes',
    'idemp_term_1'
  );

  -- Insert payment record matching total
  INSERT INTO payment_records (
    id, order_id, attempt_id, amount, status, evidence
  ) VALUES (
    'pay_late_1', 'ord_term_1', 'att_tm_1', 115.15, 'PAID', 'Late payment arrived'
  );

  -- Attempt to invoke mark_platform_fee_paid on the terminal expired order
  BEGIN
    PERFORM mark_platform_fee_paid('ord_term_1');
  EXCEPTION WHEN raise_exception THEN
    v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'SECURITY FAIL: Terminal state was overwritten to PAID!';
  END IF;

  RAISE NOTICE '✓ TEST 7 PASSED: Terminal states (EXPIRED/FAILED) cannot be overwritten to PAID.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 8: Concurrency & Inventory Oversell Prevention
-- reserve_order_inventory fails safely when stock is insufficient
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
BEGIN
  -- Attempt to reserve 9999 units of milk (stock is 10)
  BEGIN
    PERFORM reserve_order_inventory(
      'ord_oversell_test',
      '[{"store_id":"store_campus_mart","product_id":"p_cm_milk_toned_500","quantity":9999}]'::jsonb
    );
  EXCEPTION WHEN raise_exception THEN
    v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'INTEGRITY FAIL: Excessive inventory reservation was accepted!';
  END IF;

  RAISE NOTICE '✓ TEST 8 PASSED: Inventory locking prevents overselling.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 9: Paid Orders Cannot Be Expired
-- expire_order_payment must reject orders with payment_status = PAID
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
  v_cust_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, name) VALUES (v_cust_id, 'test_paid_no_exp@campus.edu', 'Paid No Exp')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO orders (
    id, customer_id, delivery_location_id, delivery_location_snapshot,
    status, payment_status,
    item_subtotal, combined_delivery_fee, base_amount, platform_fee, total_payable,
    route_distance_km, route_stop_sequence, routing_provider, routing_mode, fee_policy_version,
    payment_attempt_id, fee_paise, payment_allocated_at, payment_window_expires_at, payment_cooldown_expires_at,
    paid_at, idempotency_key
  ) VALUES (
    'ord_paid_immut_1', v_cust_id, 'loc_hostel_a', '{"name":"Hostel"}'::jsonb,
    'CONFIRMED', 'PAID',
    100.00, 15.00, 115.00, 0.15, 115.15, 1.0, '[]'::jsonb, 'straight_line', 'walking', '2026-10-09.1',
    'att_pi_1', 15, NOW(), NOW() + interval '2 minutes', NOW() + interval '7 minutes',
    NOW(), 'idemp_paid_immut_1'
  );

  BEGIN
    PERFORM expire_order_payment('ord_paid_immut_1', TRUE);
  EXCEPTION WHEN raise_exception THEN
    v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'SECURITY FAIL: expire_order_payment expired a PAID order!';
  END IF;

  RAISE NOTICE '✓ TEST 9 PASSED: Paid orders cannot be expired.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 10: Cancelled Orders Cannot Be Marked Paid
-- mark_platform_fee_paid must reject orders with status = CANCELLED
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed BOOLEAN := FALSE;
  v_cust_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, name) VALUES (v_cust_id, 'test_canc_no_paid@campus.edu', 'Canc No Paid')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO orders (
    id, customer_id, delivery_location_id, delivery_location_snapshot,
    status, payment_status,
    item_subtotal, combined_delivery_fee, base_amount, platform_fee, total_payable,
    route_distance_km, route_stop_sequence, routing_provider, routing_mode, fee_policy_version,
    payment_attempt_id, fee_paise, payment_allocated_at, payment_window_expires_at, payment_cooldown_expires_at,
    idempotency_key
  ) VALUES (
    'ord_canc_test_1', v_cust_id, 'loc_hostel_a', '{"name":"Hostel"}'::jsonb,
    'CANCELLED', 'PENDING', -- Cancelled order with active pending timer
    100.00, 15.00, 115.00, 0.15, 115.15, 1.0, '[]'::jsonb, 'straight_line', 'walking', '2026-10-09.1',
    'att_cn_1', 15, NOW(), NOW() + interval '2 minutes', NOW() + interval '7 minutes',
    'idemp_canc_1'
  );

  INSERT INTO payment_records (
    id, order_id, attempt_id, amount, status, evidence
  ) VALUES (
    'pay_canc_rec_1', 'ord_canc_test_1', 'att_cn_1', 115.15, 'PAID', 'Payment received'
  );

  BEGIN
    PERFORM mark_platform_fee_paid('ord_canc_test_1');
  EXCEPTION WHEN raise_exception THEN
    v_failed := TRUE;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'SECURITY FAIL: mark_platform_fee_paid marked a CANCELLED order as PAID!';
  END IF;

  RAISE NOTICE '✓ TEST 10 PASSED: Cancelled orders cannot be marked as PAID.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 11: Auth User Creation Profile & Role Trigger Integrity
-- handle_new_user must create profile and customer role, while rejecting metadata role escalation
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_test_uid UUID := gen_random_uuid();
  v_profile_rec RECORD;
  v_role_count INTEGER;
  v_has_admin_role BOOLEAN;
BEGIN
  -- Simulate auth user insertion event using the trigger function
  -- With malicious client metadata trying to grant admin and runner roles
  PERFORM public.handle_new_user()
  FROM (
    SELECT
      v_test_uid AS id,
      'test_trigger_new@campus.edu' AS email,
      NULL::text AS phone,
      '{"name":"Trigger Test User","role":"admin","roles":["super_admin"],"runner_status":"approved"}'::jsonb AS raw_user_meta_data
  ) AS NEW;

  -- Verify profile exists with correct sanitized name
  SELECT * INTO v_profile_rec FROM public.profiles WHERE id = v_test_uid;
  IF v_profile_rec IS NULL THEN
    RAISE EXCEPTION 'SECURITY FAIL: handle_new_user did not create profile record!';
  END IF;

  IF v_profile_rec.name <> 'Trigger Test User' THEN
    RAISE EXCEPTION 'SECURITY FAIL: profile name was not correctly populated!';
  END IF;

  -- Verify runner_status is NULL (not escalated from metadata)
  IF v_profile_rec.runner_status IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY FAIL: handle_new_user allowed runner_status from client metadata!';
  END IF;

  -- Verify customer role exists
  SELECT COUNT(*) INTO v_role_count FROM public.user_roles WHERE user_id = v_test_uid AND role = 'customer';
  IF v_role_count <> 1 THEN
    RAISE EXCEPTION 'SECURITY FAIL: customer role was not assigned!';
  END IF;

  -- Verify admin role was NOT created from metadata
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_test_uid AND role IN ('admin', 'super_admin', 'runner')
  ) INTO v_has_admin_role;

  IF v_has_admin_role THEN
    RAISE EXCEPTION 'SECURITY FAIL: client metadata successfully escalated privileged roles!';
  END IF;

  -- Idempotency test: Re-running for same user must not duplicate roles or error
  PERFORM public.handle_new_user()
  FROM (
    SELECT
      v_test_uid AS id,
      'test_trigger_new@campus.edu' AS email,
      NULL::text AS phone,
      '{"name":"Trigger Test User"}'::jsonb AS raw_user_meta_data
  ) AS NEW;

  SELECT COUNT(*) INTO v_role_count FROM public.user_roles WHERE user_id = v_test_uid AND role = 'customer';
  IF v_role_count <> 1 THEN
    RAISE EXCEPTION 'SECURITY FAIL: trigger is not idempotent; duplicate role created!';
  END IF;

  RAISE NOTICE '✓ TEST 11 PASSED: Auth user trigger created profile and customer role safely without role escalation.';
END;
$$;

-- ------------------------------------------------------------------------------
-- TEST 12: Dynamic Platform Fee Allocation Execution
-- allocate_platform_fee must execute cleanly without ambiguous column reference errors
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  -- Perform allocate_platform_fee as service_role/superuser
  SELECT * INTO v_rec
  FROM public.allocate_platform_fee('ord_alloc_test_1', 'att_alloc_test_1', 120, 300);

  IF v_rec.allocated_fee_paise IS NULL OR v_rec.allocated_fee_paise < 1 OR v_rec.allocated_fee_paise > 99 THEN
    RAISE EXCEPTION 'FEE ALLOC FAIL: allocate_platform_fee returned invalid paise: %', v_rec.allocated_fee_paise;
  END IF;

  IF v_rec.cooldown_expires_at IS NULL THEN
    RAISE EXCEPTION 'FEE ALLOC FAIL: allocate_platform_fee returned null cooldown_expires_at';
  END IF;

  -- Clean up by releasing the slot
  PERFORM public.release_platform_fee('ord_alloc_test_1');

  RAISE NOTICE '✓ TEST 12 PASSED: allocate_platform_fee executed without column ambiguity.';
END;
$$;

ROLLBACK;
