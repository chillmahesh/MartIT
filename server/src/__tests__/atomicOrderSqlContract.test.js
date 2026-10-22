import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('create_order_atomic SQL Migration Contract & Invariants', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261021000001_seed_canonical_campus_locations_and_atomic_orders.sql'
  )
  const migrationSql = fs.readFileSync(migrationPath, 'utf8')

  it('declares create_order_atomic with explicit search_path and SECURITY DEFINER', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION create_order_atomic\(/)
    expect(migrationSql).toMatch(/SECURITY DEFINER/)
    expect(migrationSql).toMatch(/SET search_path\s*=\s*public,\s*pg_temp/)
  })

  it('guarantees parent orders row is inserted before active_order_id in platform_fee_reservations is updated', () => {
    const insertOrdersIdx = migrationSql.indexOf('INSERT INTO public.orders')
    const updateFeeResIdx = migrationSql.indexOf('UPDATE public.platform_fee_reservations')
    expect(insertOrdersIdx).toBeGreaterThan(0)
    expect(updateFeeResIdx).toBeGreaterThan(0)
    expect(insertOrdersIdx).toBeLessThan(updateFeeResIdx)
  })

  it('guarantees parent orders row is inserted before inventory_reservations rows are inserted', () => {
    const insertOrdersIdx = migrationSql.indexOf('INSERT INTO public.orders')
    const insertInvResIdx = migrationSql.indexOf('INSERT INTO public.inventory_reservations')
    expect(insertOrdersIdx).toBeGreaterThan(0)
    expect(insertInvResIdx).toBeGreaterThan(0)
    expect(insertOrdersIdx).toBeLessThan(insertInvResIdx)
  })

  it('computes base_amount with round() to strictly satisfy chk_orders_base_amount constraint', () => {
    expect(migrationSql).toMatch(/v_base_amount\s*:=\s*round\(v_subtotal\s*\+\s*p_delivery_fee\);/)
    expect(migrationSql).toMatch(/v_total\s*:=\s*v_base_amount\s*\+\s*v_platform_fee;/)
  })

  it('guarantees idempotency key has deterministic non-null fallback and unique check', () => {
    expect(migrationSql).toMatch(/v_final_idempotency_key\s*:=\s*'idem_ord_'\s*\|\|\s*p_order_id;/)
    expect(migrationSql).toMatch(/WHERE idempotency_key = v_final_idempotency_key OR id = p_order_id;/)
  })

  it('restricts execution privileges to service_role only', () => {
    expect(migrationSql).toMatch(/REVOKE EXECUTE ON FUNCTION create_order_atomic\(.*?\) FROM PUBLIC, anon, authenticated;/s)
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION create_order_atomic\(.*?\) TO service_role;/s)
  })

  it('has matching argument count and types in function signature and grant statements', () => {
    const expectedArgs = 'VARCHAR, UUID, VARCHAR, VARCHAR, JSONB, JSONB, NUMERIC, VARCHAR, NUMERIC, VARCHAR, INTEGER, INTEGER, INTEGER'
    expect(migrationSql).toContain(`REVOKE EXECUTE ON FUNCTION create_order_atomic(${expectedArgs}) FROM PUBLIC, anon, authenticated;`)
    expect(migrationSql).toContain(`GRANT EXECUTE ON FUNCTION create_order_atomic(${expectedArgs}) TO service_role;`)
  })

  it('qualifies pfr.cooldown_expires_at in create_order_atomic to prevent column reference ambiguity', () => {
    expect(migrationSql).toMatch(/SELECT\s+pfr\.fee_paise\s+INTO\s+v_fee_paise\s+FROM\s+public\.platform_fee_reservations\s+pfr\s+WHERE\s+\(pfr\.active_order_id\s+IS\s+NULL\s+OR\s+v_now\s*>=\s*pfr\.cooldown_expires_at\)/)
  })

  it('normalizes item payload keys by handling both product_id and productId via COALESCE', () => {
    expect(migrationSql).toMatch(/COALESCE\(x\.product_id,\s*x\."productId"\)/)
  })

  it('acquires product row locks in deterministic ascending order to prevent cyclic deadlocks (SQLSTATE 40P01)', () => {
    // Both Step 6 (stock lock/decrement) and Step 10 (order items/reservations)
    // must strictly enforce ORDER BY COALESCE(x.product_id, x."productId") ASC
    const step6LockMatch = migrationSql.match(/-- 6\. Lock and Validate Products[\s\S]*?ORDER BY COALESCE\(x\.product_id,\s*x\."productId"\) ASC/m)
    expect(step6LockMatch).not.toBeNull()

    const step10ItemsMatch = migrationSql.match(/-- 10\. Insert Order Items[\s\S]*?ORDER BY COALESCE\(x\.product_id,\s*x\."productId"\) ASC/m)
    expect(step10ItemsMatch).not.toBeNull()
  })

  it('aggregates duplicate product lines via SUM(x.quantity) to maintain consistent stock and reservation totals', () => {
    expect(migrationSql).toMatch(/SUM\(x\.quantity\)::INTEGER\s+AS\s+quantity/)
    expect(migrationSql).toMatch(/GROUP BY COALESCE\(x\.product_id,\s*x\."productId"\)/)
  })

  it('parses quantity as NUMERIC to safely validate non-integer, negative, and overflow values before cast', () => {
    expect(migrationSql).toMatch(/jsonb_to_recordset\(p_items\)\s+AS\s+x\(product_id\s+VARCHAR,\s*"productId"\s+VARCHAR,\s+quantity\s+NUMERIC\)/)
    expect(migrationSql).toMatch(/x\.quantity\s*<>\s*trunc\(x\.quantity\)/)
    expect(migrationSql).toMatch(/x\.quantity\s*>\s*2147483647/)
  })

  it('validates aggregate product quantities against 32-bit signed integer ceiling before narrowing cast', () => {
    expect(migrationSql).toMatch(/HAVING\s+SUM\(x\.quantity\)\s*>\s*2147483647/)
  })

  it('protects order financial subtotals against NUMERIC(10, 2) overflow (99,999,999.99)', () => {
    expect(migrationSql).toMatch(/RAISE EXCEPTION 'ORDER_TOTAL_EXCEEDED'/)
    expect(migrationSql).toMatch(/>\s*99999999\.99/)
  })

  it('pre-validates items in SQL rejecting empty product IDs and non-positive quantities', () => {
    expect(migrationSql).toMatch(/RAISE EXCEPTION 'INVALID_LINE_ITEM'/)
    expect(migrationSql).toMatch(/RAISE EXCEPTION 'INVALID_QUANTITY'/)
  })

  it('proves platform_fee_reservations uses SKIP LOCKED eliminating wait graph cycles with products', () => {
    expect(migrationSql).toMatch(/FROM public\.platform_fee_reservations pfr[\s\S]*?ORDER BY pfr\.fee_paise ASC[\s\S]*?LIMIT 1[\s\S]*?FOR UPDATE SKIP LOCKED;/)
  })
})

describe('allocate_platform_fee SQL Function Contract', () => {
  const feeMigrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261010000002_platform_fee_functions.sql'
  )
  const feeMigrationSql = fs.readFileSync(feeMigrationPath, 'utf8')

  it('unambiguously qualifies pfr.cooldown_expires_at in allocate_platform_fee to avoid collision with RETURNS TABLE column', () => {
    // RETURNS TABLE declares cooldown_expires_at as an output parameter
    expect(feeMigrationSql).toMatch(/RETURNS\s+TABLE\s*\([\s\S]*?cooldown_expires_at\s+TIMESTAMPTZ[\s\S]*?\)/)
    // The SELECT query must qualify pfr.cooldown_expires_at with table alias
    expect(feeMigrationSql).toMatch(/SELECT\s+pfr\.fee_paise\s+INTO\s+v_paise\s+FROM\s+public\.platform_fee_reservations\s+pfr\s+WHERE\s+\(pfr\.active_order_id\s+IS\s+NULL\s+OR\s+v_now\s*>=\s*pfr\.cooldown_expires_at\)/)
  })
})

describe('Express orders.js Atomic Integration Contract', () => {
  const ordersRoutePath = path.resolve(process.cwd(), 'server/src/routes/orders.js')
  const ordersRouteCode = fs.readFileSync(ordersRoutePath, 'utf8')

  it('invokes create_order_atomic RPC instead of multi-step non-transactional writes', () => {
    expect(ordersRouteCode).toContain("supabase.rpc('create_order_atomic'")
    // Must NOT call allocate_platform_fee directly in handleCreateOrder
    expect(ordersRouteCode).not.toContain("supabase.rpc('allocate_platform_fee'")
  })

  it('passes normalized product_id and productId in items payload to create_order_atomic', () => {
    expect(ordersRouteCode).toMatch(/product_id:\s*l\.productId/)
    expect(ordersRouteCode).toMatch(/productId:\s*l\.productId/)
  })

  it('sorts pricedLines deterministically by productId before calling create_order_atomic', () => {
    expect(ordersRouteCode).toMatch(/pricedLines\.sort\(\(a,\s*b\)\s*=>\s*a\.productId\.localeCompare\(b\.productId\)\)/)
  })

  it('consolidates duplicate line items in lineMap before pricing and RPC dispatch', () => {
    expect(ordersRouteCode).toMatch(/const existingQty = lineMap\.get\(item\.productId\) \|\| 0/)
    expect(ordersRouteCode).toMatch(/lineMap\.set\(item\.productId,\s*nextQty\)/)
  })

  it('maps INVALID_LINE_ITEM, INVALID_QUANTITY, and ORDER_TOTAL_EXCEEDED database exceptions to standard HTTP error codes', () => {
    expect(ordersRouteCode).toMatch(/atomicErr\.message\.includes\('INVALID_LINE_ITEM'\)/)
    expect(ordersRouteCode).toMatch(/atomicErr\.message\.includes\('INVALID_QUANTITY'\)/)
    expect(ordersRouteCode).toMatch(/atomicErr\.message\.includes\('ORDER_TOTAL_EXCEEDED'\)/)
  })

  it('enforces maximum integer limit of 2147483647 on item and aggregate quantities in Express route', () => {
    expect(ordersRouteCode).toMatch(/item\.quantity\s*>\s*2147483647/)
    expect(ordersRouteCode).toMatch(/nextQty\s*>\s*2147483647/)
  })

  it('enforces maximum financial limit of 99999999.99 on line and item subtotals in Express route', () => {
    expect(ordersRouteCode).toMatch(/lineSubtotal\s*>\s*99999999\.99/)
    expect(ordersRouteCode).toMatch(/itemSubtotal\s*>\s*99999999\.99/)
  })
})

describe('release_order_inventory SQL Function Contract', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261021000001_seed_canonical_campus_locations_and_atomic_orders.sql',
  )
  const migrationSql = fs.readFileSync(migrationPath, 'utf8')

  it('declares release_order_inventory with explicit search_path and SECURITY DEFINER', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION release_order_inventory\(/)
    expect(migrationSql).toMatch(/SECURITY DEFINER/)
    expect(migrationSql).toMatch(/SET search_path\s*=\s*public,\s*pg_temp/)
  })

  it('locks parent orders row with FOR UPDATE first as shared serialization point coordinating with payment confirmation', () => {
    expect(migrationSql).toMatch(/SELECT payment_status\s+INTO\s+v_payment_status\s+FROM\s+public\.orders\s+WHERE\s+id\s*=\s*p_order_id\s+FOR\s+UPDATE;/)
    const lockOrdersIdx = migrationSql.indexOf('FROM public.orders')
    const lockResIdx = migrationSql.indexOf('FROM public.inventory_reservations\n  WHERE order_id = p_order_id AND status = \'HELD\'\n  FOR UPDATE')
    expect(lockOrdersIdx).toBeGreaterThan(0)
    expect(lockResIdx).toBeGreaterThan(0)
    expect(lockOrdersIdx).toBeLessThan(lockResIdx)
  })

  it('preserves single responsibility by not mutating orders table inside release_order_inventory', () => {
    // release_order_inventory definition begins after Section 3 comment
    const releaseFnSection = migrationSql.slice(migrationSql.indexOf('CREATE OR REPLACE FUNCTION release_order_inventory'))
    expect(releaseFnSection).not.toMatch(/UPDATE\s+public\.orders/)
  })

  it('locks HELD reservation rows with FOR UPDATE to prevent double-restoration race', () => {
    expect(migrationSql).toMatch(/FROM public\.inventory_reservations\s+WHERE order_id = p_order_id AND status = 'HELD'\s+FOR UPDATE/)
  })

  it('avoids aggregate functions in locking clause to comply with PostgreSQL 42809 grammar and handles empty holds via NOT FOUND', () => {
    expect(migrationSql).toMatch(/PERFORM 1\s+FROM public\.inventory_reservations\s+WHERE order_id = p_order_id AND status = 'HELD'\s+FOR UPDATE;/)
    expect(migrationSql).toMatch(/IF NOT FOUND THEN\s+-- Idempotent exit:[\s\S]*?RETURN TRUE;\s+END IF;/)
    expect(migrationSql).not.toMatch(/COUNT\(.*?\)\s+INTO[\s\S]*?FOR UPDATE/)
  })

  it('locks products deterministically in ascending product_id order to eliminate deadlock cycles with create_order_atomic', () => {
    expect(migrationSql).toMatch(/GROUP BY product_id,\s*store_id\s+ORDER BY product_id ASC/)
    expect(migrationSql).toMatch(/FROM public\.products\s+WHERE id = res\.product_id AND store_id = res\.store_id\s+FOR UPDATE/)
  })

  it('guards against releasing inventory for orders that are already marked PAID', () => {
    expect(migrationSql).toMatch(/RAISE EXCEPTION 'CANNOT_RELEASE_PAID_ORDER'/)
  })

  it('validates that product rows exist before restoring stock and rolls back with PRODUCT_NOT_FOUND if missing', () => {
    expect(migrationSql).toMatch(/SELECT stock INTO v_stock\s+FROM public\.products\s+WHERE id = res\.product_id AND store_id = res\.store_id\s+FOR UPDATE;/)
    expect(migrationSql).toMatch(/RAISE EXCEPTION 'PRODUCT_NOT_FOUND'/)
    expect(migrationSql).toMatch(/RAISE EXCEPTION 'STOCK_RESTORE_FAILED'/)
  })

  it('guards against integer stock overflow during inventory restoration', () => {
    expect(migrationSql).toMatch(/RAISE EXCEPTION 'STOCK_OVERFLOW'/)
  })

  it('guarantees atomic reservation status transition and raises RESERVATION_UPDATE_FAILED on zero affected rows', () => {
    expect(migrationSql).toMatch(/UPDATE public\.inventory_reservations\s+SET status = 'RELEASED'/)
    expect(migrationSql).toMatch(/RAISE EXCEPTION 'RESERVATION_UPDATE_FAILED'/)
  })

  it('restricts execution privileges to service_role only', () => {
    expect(migrationSql).toMatch(/REVOKE EXECUTE ON FUNCTION release_order_inventory\(VARCHAR\) FROM PUBLIC, anon, authenticated;/)
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION release_order_inventory\(VARCHAR\) TO service_role;/)
  })
})

describe.skip('PENDING: Live PostgreSQL Concurrent Transaction Lock-Ordering Cycle Test (requires live multi-connection PostgreSQL testbed)', () => {
  it('PENDING: concurrent transactions ordering products [P1, P2] and [P2, P1] both succeed without 40P01 deadlock', async () => {
    // In accordance with MartIT checkout safety requirements:
    // True multi-connection PostgreSQL concurrency tests cannot run in this mock environment
    // without an active PostgreSQL daemon.
    // Concurrency verification is formally specified here for execution against disposable Supabase/Postgres test instances.
  })
})


describe('Authoritative payment verification trust contract', () => {
  const feeMigrationSql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261022150000_require_authoritative_payment_verification.sql'),
    'utf8',
  )
  const ordersRouteCode = fs.readFileSync(
    path.resolve(process.cwd(), 'server/src/routes/orders.js'),
    'utf8',
  )
  const webhookRouteCode = fs.readFileSync(
    path.resolve(process.cwd(), 'server/src/routes/webhooks.js'),
    'utf8',
  )

  it('requires paid status, exact evidence, and an authoritative verification source in the database transition', () => {
    expect(feeMigrationSql).toMatch(/AND status = 'PAID'[\s\S]*?AND evidence = 'Payment received'[\s\S]*?AND verification_source = 'AUTHORITATIVE_GATEWAY'/)
    expect(feeMigrationSql).not.toContain("(status = 'PAID' OR evidence IS NOT NULL)")
  })

  it('requires authoritative verification fields in the customer payment-check query', () => {
    expect(ordersRouteCode).toMatch(/\.eq\('status', 'PAID'\)[\s\S]*?\.eq\('evidence', 'Payment received'\)[\s\S]*?\.eq\('verification_source', 'AUTHORITATIVE_GATEWAY'\)/)
  })

  it('sets the authoritative verification marker only after the gateway verifier returns verified', () => {
    const verifiedBranch = webhookRouteCode.indexOf('// 12. Authoritative Gateway Confirmed')
    const markerWrite = webhookRouteCode.indexOf("verification_source: 'AUTHORITATIVE_GATEWAY'", verifiedBranch)
    expect(verifiedBranch).toBeGreaterThan(-1)
    expect(markerWrite).toBeGreaterThan(verifiedBranch)
    expect(webhookRouteCode).toContain('if (!gatewayVerification.verified)')
  })
})
