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
})

