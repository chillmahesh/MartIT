-- Migration: 20261012000001_repair_database_initialization.sql
-- Description: Idempotent corrective migration repairing database initialization,
--              reconciling missing tables (profiles, user_roles, etc.), backfilling
--              orphaned auth users, establishing schema_migrations tracking, and securing
--              handle_new_user auth trigger.
-- Target Database: Supabase PostgreSQL (15+)

-- ============================================================================
-- 1. EXTENSIONS & MIGRATION HISTORY TRACKING
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Ensure supabase_migrations schema and table exist for Supabase CLI compatibility
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. ENUM TYPES (Idempotent creation)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_enum') THEN
    CREATE TYPE role_enum AS ENUM (
      'customer',
      'runner',
      'store_owner',
      'admin',
      'super_admin'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'runner_status_enum') THEN
    CREATE TYPE runner_status_enum AS ENUM (
      'applicant',
      'approved',
      'suspended'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_enum') THEN
    CREATE TYPE order_status_enum AS ENUM (
      'AWAITING_PAYMENT',
      'CONFIRMED',
      'PREPARING',
      'PICKING_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
    CREATE TYPE payment_status_enum AS ENUM (
      'PENDING',
      'PROCESSING',
      'PAID',
      'EXPIRED',
      'FAILED',
      'REFUNDED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fulfillment_group_status_enum') THEN
    CREATE TYPE fulfillment_group_status_enum AS ENUM (
      'PENDING',
      'READY_FOR_PICKUP',
      'PICKED_UP',
      'FAILED_PICKUP',
      'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status_enum') THEN
    CREATE TYPE reservation_status_enum AS ENUM (
      'HELD',
      'COMMITTED',
      'RELEASED'
    );
  END IF;
END;
$$;

-- ============================================================================
-- 3. CORE APPLICATION TABLES & INDEXES
-- ============================================================================

-- 3.1 PROFILES (Linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email citext NOT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20),
  runner_status runner_status_enum,
  default_location_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_runner_status ON profiles(runner_status);

-- 3.2 USER ROLES
CREATE TABLE IF NOT EXISTS user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role role_enum NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_role UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- 3.3 LOCATIONS
CREATE TABLE IF NOT EXISTS locations (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  group_name VARCHAR(60) NOT NULL,
  latitude NUMERIC(9, 6) NOT NULL,
  longitude NUMERIC(9, 6) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_group ON locations(group_name);

-- 3.4 STORES
CREATE TABLE IF NOT EXISTS stores (
  id VARCHAR(64) PRIMARY KEY,
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  latitude NUMERIC(9, 6) NOT NULL,
  longitude NUMERIC(9, 6) NOT NULL,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stores_open ON stores(is_open);

-- 3.5 CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.6 PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  category_id VARCHAR(64) NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  pack VARCHAR(100),
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  mrp NUMERIC(10, 2) NOT NULL CHECK (mrp >= price),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_store UNIQUE (id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(is_available, stock);

-- 3.7 PLATFORM FEE RESERVATIONS (Created before orders to satisfy FK)
CREATE TABLE IF NOT EXISTS platform_fee_reservations (
  fee_paise INTEGER PRIMARY KEY CHECK (fee_paise >= 1 AND fee_paise <= 99),
  active_order_id VARCHAR(64),
  attempt_id VARCHAR(64),
  allocated_at TIMESTAMPTZ,
  window_expires_at TIMESTAMPTZ,
  cooldown_expires_at TIMESTAMPTZ,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ
);

-- Seed dynamic platform fee slots (1 to 99 paise)
INSERT INTO platform_fee_reservations (fee_paise)
SELECT generate_series(1, 99)
ON CONFLICT (fee_paise) DO NOTHING;

-- 3.8 ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  delivery_location_id VARCHAR(64) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  delivery_location_snapshot JSONB NOT NULL,
  
  status order_status_enum NOT NULL DEFAULT 'AWAITING_PAYMENT',
  payment_status payment_status_enum NOT NULL DEFAULT 'PENDING',
  
  item_subtotal NUMERIC(10, 2) NOT NULL CHECK (item_subtotal >= 0),
  combined_delivery_fee NUMERIC(10, 2) NOT NULL CHECK (combined_delivery_fee >= 0),
  base_amount NUMERIC(10, 2) NOT NULL CHECK (base_amount >= 0),
  platform_fee NUMERIC(10, 2) NOT NULL CHECK (platform_fee >= 0.01 AND platform_fee <= 0.99),
  total_payable NUMERIC(10, 2) NOT NULL CHECK (total_payable >= 0),
  
  route_distance_km NUMERIC(8, 4) NOT NULL CHECK (route_distance_km > 0 AND route_distance_km <= 5.0),
  route_stop_sequence JSONB NOT NULL,
  routing_provider VARCHAR(64) NOT NULL,
  routing_mode VARCHAR(32) NOT NULL,
  routing_metadata JSONB DEFAULT '{}'::jsonb,
  fee_policy_version VARCHAR(32) NOT NULL,
  
  payment_attempt_id VARCHAR(64) NOT NULL,
  fee_paise INTEGER NOT NULL REFERENCES platform_fee_reservations(fee_paise) CHECK (fee_paise >= 1 AND fee_paise <= 99),
  payment_allocated_at TIMESTAMPTZ NOT NULL,
  payment_window_expires_at TIMESTAMPTZ NOT NULL,
  payment_cooldown_expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  
  runner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  handover_otp_hash VARCHAR(128),
  handover_attempts_count INTEGER NOT NULL DEFAULT 0,
  handover_locked_until TIMESTAMPTZ,
  handover_verified_at TIMESTAMPTZ,
  
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_orders_base_amount CHECK (base_amount = ROUND(item_subtotal + combined_delivery_fee)),
  CONSTRAINT chk_orders_total_payable CHECK (total_payable = base_amount + platform_fee),
  CONSTRAINT chk_orders_fee_paise CHECK (fee_paise = ROUND(platform_fee * 100))
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_runner ON orders(runner_id);

-- Connect platform_fee_reservations active_order_id FK to orders if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_fee_active_order' AND table_name = 'platform_fee_reservations'
  ) THEN
    ALTER TABLE platform_fee_reservations
      ADD CONSTRAINT fk_fee_active_order
      FOREIGN KEY (active_order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.9 STORE FULFILLMENT GROUPS
CREATE TABLE IF NOT EXISTS order_fulfillment_groups (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  store_snapshot JSONB NOT NULL,
  pickup_sequence_index INTEGER NOT NULL CHECK (pickup_sequence_index >= 0),
  
  status fulfillment_group_status_enum NOT NULL DEFAULT 'PENDING',
  ready_for_pickup_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_order_store UNIQUE (order_id, store_id),
  CONSTRAINT uq_group_order_store UNIQUE (id, order_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_groups_order ON order_fulfillment_groups(order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_groups_store_status ON order_fulfillment_groups(store_id, status);

-- 3.10 ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  fulfillment_group_id VARCHAR(64) NOT NULL,
  store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  
  product_name VARCHAR(200) NOT NULL,
  product_pack VARCHAR(100),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  line_subtotal NUMERIC(10, 2) NOT NULL CHECK (line_subtotal >= 0),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_item_fulfillment_group FOREIGN KEY (fulfillment_group_id, order_id, store_id)
    REFERENCES order_fulfillment_groups(id, order_id, store_id) ON DELETE CASCADE,
  CONSTRAINT fk_item_product_store FOREIGN KEY (product_id, store_id)
    REFERENCES products(id, store_id) ON DELETE RESTRICT,
  CONSTRAINT chk_line_subtotal CHECK (line_subtotal = unit_price * quantity)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_group ON order_items(fulfillment_group_id);

-- 3.11 INVENTORY RESERVATIONS
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  status reservation_status_enum NOT NULL DEFAULT 'HELD',
  expires_at TIMESTAMPTZ NOT NULL,
  committed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_order ON inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_active ON inventory_reservations(store_id, product_id, status)
  WHERE status = 'HELD';

-- 3.12 PAYMENT RECORDS
CREATE TABLE IF NOT EXISTS payment_records (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  attempt_id VARCHAR(64) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status payment_status_enum NOT NULL,
  provider VARCHAR(64) NOT NULL DEFAULT 'UPI',
  verification_source VARCHAR(64),
  evidence TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_records_order ON payment_records(order_id);

-- 3.13 AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(64),
  details JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================================================
-- 4. TRIGGERS & PROCEDURAL UTILITIES
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_payment_record_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_total NUMERIC(10, 2);
BEGIN
  SELECT total_payable INTO v_order_total
  FROM public.orders
  WHERE id = NEW.order_id;

  IF v_order_total IS NOT NULL AND NEW.amount <> v_order_total THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH'
      USING HINT = 'Payment record amount must exactly match the parent order total_payable.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_payment_record_amount ON payment_records;
CREATE TRIGGER trg_verify_payment_record_amount
  BEFORE INSERT OR UPDATE ON payment_records
  FOR EACH ROW EXECUTE FUNCTION verify_payment_record_amount();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_locations_updated_at ON locations;
CREATE TRIGGER trg_locations_updated_at BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_stores_updated_at ON stores;
CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_order_fulfillment_groups_updated_at ON order_fulfillment_groups;
CREATE TRIGGER trg_order_fulfillment_groups_updated_at BEFORE UPDATE ON order_fulfillment_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS & POLICIES
-- ============================================================================

CREATE OR REPLACE FUNCTION auth_user_has_role(required_role role_enum)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (role = required_role OR role = 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION auth_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR role = 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION auth_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION auth_is_approved_runner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid()
      AND p.runner_status = 'approved'
      AND ur.role = 'runner'
  );
$$;

CREATE OR REPLACE FUNCTION auth_owns_store(check_store_id VARCHAR(64))
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = check_store_id
      AND owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.runner_status IS DISTINCT FROM NEW.runner_status AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_RUNNER_STATUS_MODIFICATION'
      USING HINT = 'Only administrators can update runner application status.';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_ID_CHANGE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON profiles;
CREATE TRIGGER trg_prevent_profile_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_profile_privilege_escalation();

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_fulfillment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_fee_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.customer_id = profiles.id
        AND orders.runner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid() OR auth_is_admin())
  WITH CHECK (id = auth.uid() OR auth_is_admin());

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR auth_is_admin());

DROP POLICY IF EXISTS "user_roles_select" ON user_roles;
CREATE POLICY "user_roles_select"
  ON user_roles FOR SELECT
  USING (user_id = auth.uid() OR auth_is_admin());

DROP POLICY IF EXISTS "user_roles_insert_super_admin" ON user_roles;
CREATE POLICY "user_roles_insert_super_admin"
  ON user_roles FOR INSERT
  WITH CHECK (auth_is_super_admin());

DROP POLICY IF EXISTS "user_roles_delete_super_admin" ON user_roles;
CREATE POLICY "user_roles_delete_super_admin"
  ON user_roles FOR DELETE
  USING (auth_is_super_admin());

DROP POLICY IF EXISTS "locations_select_public" ON locations;
CREATE POLICY "locations_select_public"
  ON locations FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "locations_admin_all" ON locations;
CREATE POLICY "locations_admin_all"
  ON locations FOR ALL
  USING (auth_is_admin());

DROP POLICY IF EXISTS "stores_select_public" ON stores;
CREATE POLICY "stores_select_public"
  ON stores FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "stores_owner_update" ON stores;
CREATE POLICY "stores_owner_update"
  ON stores FOR UPDATE
  USING (owner_id = auth.uid() OR auth_is_admin())
  WITH CHECK (owner_id = auth.uid() OR auth_is_admin());

DROP POLICY IF EXISTS "stores_admin_all" ON stores;
CREATE POLICY "stores_admin_all"
  ON stores FOR ALL
  USING (auth_is_admin());

DROP POLICY IF EXISTS "categories_select_public" ON categories;
CREATE POLICY "categories_select_public"
  ON categories FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "categories_admin_all" ON categories;
CREATE POLICY "categories_admin_all"
  ON categories FOR ALL
  USING (auth_is_admin());

DROP POLICY IF EXISTS "products_select_public" ON products;
CREATE POLICY "products_select_public"
  ON products FOR SELECT
  USING (is_available = TRUE OR auth_owns_store(store_id) OR auth_is_admin());

DROP POLICY IF EXISTS "products_owner_update" ON products;
CREATE POLICY "products_owner_update"
  ON products FOR UPDATE
  USING (auth_owns_store(store_id) OR auth_is_admin())
  WITH CHECK (auth_owns_store(store_id) OR auth_is_admin());

DROP POLICY IF EXISTS "products_admin_all" ON products;
CREATE POLICY "products_admin_all"
  ON products FOR ALL
  USING (auth_is_admin());

DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select"
  ON orders FOR SELECT
  USING (
    customer_id = auth.uid()
    OR runner_id = auth.uid()
    OR auth_is_admin()
    OR (auth_is_approved_runner() AND status IN ('CONFIRMED', 'PREPARING', 'PICKING_UP'))
  );

DROP POLICY IF EXISTS "orders_insert_customer" ON orders;
CREATE POLICY "orders_insert_customer"
  ON orders FOR INSERT
  WITH CHECK (customer_id = auth.uid() OR auth_is_admin());

DROP POLICY IF EXISTS "order_fulfillment_groups_select" ON order_fulfillment_groups;
CREATE POLICY "order_fulfillment_groups_select"
  ON order_fulfillment_groups FOR SELECT
  USING (
    auth_owns_store(store_id)
    OR auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_fulfillment_groups.order_id
        AND (orders.customer_id = auth.uid() OR orders.runner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "order_items_select" ON order_items;
CREATE POLICY "order_items_select"
  ON order_items FOR SELECT
  USING (
    auth_owns_store(store_id)
    OR auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
        AND (orders.customer_id = auth.uid() OR orders.runner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "inventory_reservations_select" ON inventory_reservations;
CREATE POLICY "inventory_reservations_select"
  ON inventory_reservations FOR SELECT
  USING (auth_owns_store(store_id) OR auth_is_admin());

DROP POLICY IF EXISTS "platform_fee_reservations_admin" ON platform_fee_reservations;
CREATE POLICY "platform_fee_reservations_admin"
  ON platform_fee_reservations FOR SELECT
  USING (auth_is_admin());

DROP POLICY IF EXISTS "payment_records_select" ON payment_records;
CREATE POLICY "payment_records_select"
  ON payment_records FOR SELECT
  USING (
    auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = payment_records.order_id
        AND orders.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "audit_logs_admin_select" ON audit_logs;
CREATE POLICY "audit_logs_admin_select"
  ON audit_logs FOR SELECT
  USING (auth_is_admin());

-- ============================================================================
-- 6. LEAST-PRIVILEGE GRANTS
-- ============================================================================

-- Function execution grants
REVOKE EXECUTE ON FUNCTION auth_user_has_role(role_enum) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auth_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auth_is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auth_is_approved_runner() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auth_owns_store(VARCHAR) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION verify_payment_record_amount() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION set_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION auth_user_has_role(role_enum) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth_is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth_is_approved_runner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth_owns_store(VARCHAR) TO authenticated, service_role;

-- Table and sequence grants
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE locations, stores, categories, products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE profiles TO authenticated;
GRANT SELECT ON TABLE user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE orders TO authenticated;
GRANT SELECT ON TABLE order_fulfillment_groups, order_items, payment_records TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Service role full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- ============================================================================
-- 7. ORPHANED AUTH USERS RECONCILIATION
-- Backfill profiles and default 'customer' roles for users created in auth.users
-- while public.profiles was missing.
-- ============================================================================

INSERT INTO public.profiles (
  id,
  email,
  name,
  phone,
  runner_status,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.email,
  COALESCE(
    SUBSTRING(TRIM(COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')) FROM 1 FOR 120),
    SUBSTRING(SPLIT_PART(u.email, '@', 1) FROM 1 FOR 120),
    'MartIT Customer'
  ),
  SUBSTRING(NULLIF(TRIM(COALESCE(u.phone, u.raw_user_meta_data->>'phone', '')), '') FROM 1 FOR 20),
  NULL,
  u.created_at,
  NOW()
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = CASE 
    WHEN profiles.name = 'MartIT Customer' AND EXCLUDED.name <> 'MartIT Customer' THEN EXCLUDED.name
    ELSE profiles.name
  END,
  updated_at = NOW();

INSERT INTO public.user_roles (
  user_id,
  role,
  created_at
)
SELECT 
  u.id,
  'customer'::public.role_enum,
  u.created_at
FROM auth.users u
ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================================================
-- 8. HARDENED AUTH TRIGGER (handle_new_user)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_raw_name TEXT;
  v_clean_name VARCHAR(120);
  v_phone VARCHAR(20);
BEGIN
  v_raw_name := TRIM(COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    ''
  ));

  IF v_raw_name IS NOT NULL AND LENGTH(v_raw_name) > 0 THEN
    v_clean_name := SUBSTRING(v_raw_name FROM 1 FOR 120);
  ELSE
    IF NEW.email IS NOT NULL AND POSITION('@' IN NEW.email) > 1 THEN
      v_clean_name := SUBSTRING(SPLIT_PART(NEW.email, '@', 1) FROM 1 FOR 120);
    ELSE
      v_clean_name := 'MartIT Customer';
    END IF;
  END IF;

  v_phone := NULLIF(TRIM(COALESCE(
    NEW.phone,
    NEW.raw_user_meta_data->>'phone',
    ''
  )), '');
  IF v_phone IS NOT NULL THEN
    v_phone := SUBSTRING(v_phone FROM 1 FOR 20);
  END IF;

  -- 1. Idempotently insert or update user profile
  INSERT INTO public.profiles (
    id,
    email,
    name,
    phone,
    runner_status,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    v_clean_name,
    v_phone,
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = CASE
      WHEN profiles.name = 'MartIT Customer' AND EXCLUDED.name <> 'MartIT Customer' THEN EXCLUDED.name
      ELSE profiles.name
    END,
    phone = COALESCE(profiles.phone, EXCLUDED.phone),
    updated_at = NOW();

  -- 2. Idempotently grant default 'customer' role (prevents role self-escalation)
  INSERT INTO public.user_roles (
    user_id,
    role,
    created_at
  ) VALUES (
    NEW.id,
    'customer'::public.role_enum,
    NOW()
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Revoke execute from public/anon/authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE and necessary table permissions to supabase_auth_admin and service_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT USAGE ON SCHEMA extensions TO supabase_auth_admin;
    GRANT ALL ON TABLE public.profiles TO supabase_auth_admin;
    GRANT ALL ON TABLE public.user_roles TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
  END IF;
END;
$$;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 9. RECORD MIGRATIONS IN schema_migrations
-- ============================================================================

INSERT INTO supabase_migrations.schema_migrations (version) VALUES
  ('20261010000001'),
  ('20261010000002'),
  ('20261010000003'),
  ('20261010000004'),
  ('20261012000001')
ON CONFLICT (version) DO NOTHING;
