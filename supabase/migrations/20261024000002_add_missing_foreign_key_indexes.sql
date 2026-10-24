-- Migration: 20261024000002_add_missing_foreign_key_indexes.sql
-- Description: Add missing foreign key indexes to prevent table scans during cascade and foreign key constraint validation.
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- Missing Foreign Key Indexes (Supabase Database Advisor Review)
-- ============================================================================

-- 1. stores(owner_id) referencing profiles(id)
CREATE INDEX IF NOT EXISTS idx_stores_owner ON public.stores(owner_id);

-- 2. orders(delivery_location_id) referencing locations(id)
CREATE INDEX IF NOT EXISTS idx_orders_delivery_location ON public.orders(delivery_location_id);

-- 3. orders(fee_paise) referencing platform_fee_reservations(fee_paise)
CREATE INDEX IF NOT EXISTS idx_orders_fee_paise ON public.orders(fee_paise);

-- 4. order_items(store_id) referencing stores(id)
CREATE INDEX IF NOT EXISTS idx_order_items_store ON public.order_items(store_id);

-- 5. order_items(product_id) referencing products(id)
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- 6. inventory_reservations(store_id) referencing stores(id)
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_store ON public.inventory_reservations(store_id);

-- 7. inventory_reservations(product_id) referencing products(id)
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_product ON public.inventory_reservations(product_id);

-- 8. platform_fee_reservations(active_order_id) referencing orders(id)
CREATE INDEX IF NOT EXISTS idx_platform_fee_reservations_order ON public.platform_fee_reservations(active_order_id);
