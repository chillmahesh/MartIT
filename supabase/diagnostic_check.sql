-- ==============================================================================
-- MartIT — Production Database Inspection Diagnostics (Read-Only)
-- Purpose: Inspect live database state before applying any remediation.
-- Usage: Copy and run this script in the Supabase Dashboard -> SQL Editor.
-- Safety: READ-ONLY. Makes NO alterations, drops, or writes.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Check Supabase CLI Migration History Table
-- ------------------------------------------------------------------------------
SELECT 
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'supabase_migrations' 
      AND table_name = 'schema_migrations'
  ) AS migration_table_exists;

-- If table exists, show recorded versions:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'supabase_migrations' 
      AND table_name = 'schema_migrations'
  ) THEN
    RAISE NOTICE 'Listing versions in supabase_migrations.schema_migrations:';
  ELSE
    RAISE NOTICE 'Notice: Relation supabase_migrations.schema_migrations does NOT exist.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Check Existence of All MartIT Application Tables in public schema
-- ------------------------------------------------------------------------------
SELECT 
  t.expected_table,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = t.expected_table
  ) AS table_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t.expected_table
    ) THEN (
      SELECT COUNT(*) FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = t.expected_table
    )
    ELSE 0
  END AS column_count
FROM (
  VALUES 
    ('profiles'),
    ('user_roles'),
    ('locations'),
    ('stores'),
    ('categories'),
    ('products'),
    ('orders'),
    ('order_fulfillment_groups'),
    ('order_items'),
    ('inventory_reservations'),
    ('platform_fee_reservations'),
    ('payment_records'),
    ('audit_logs')
) AS t(expected_table)
ORDER BY t.expected_table;

-- ------------------------------------------------------------------------------
-- 3. Check Required Enums in public schema
-- ------------------------------------------------------------------------------
SELECT 
  t.typname AS enum_name,
  ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

-- ------------------------------------------------------------------------------
-- 4. Check Installed PostgreSQL Extensions
-- ------------------------------------------------------------------------------
SELECT 
  extname AS extension_name,
  extversion AS installed_version,
  n.nspname AS installed_schema
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
WHERE extname IN ('uuid-ossp', 'citext', 'pgcrypto');

-- ------------------------------------------------------------------------------
-- 5. Inspect Triggers on auth.users
-- ------------------------------------------------------------------------------
SELECT 
  tg.tgname AS trigger_name,
  c.relname AS target_table,
  p.proname AS trigger_function,
  tg.tgenabled AS trigger_status,
  pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS is_security_definer,
  p.proconfig AS function_search_path
FROM pg_trigger tg
JOIN pg_class c ON tg.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON tg.tgfoid = p.oid
WHERE n.nspname = 'auth' AND c.relname = 'users';

-- ------------------------------------------------------------------------------
-- 6. Inspect public.handle_new_user Execution Privileges
-- ------------------------------------------------------------------------------
SELECT 
  r.rolname AS grantee,
  has_function_privilege(r.rolname, 'public.handle_new_user()', 'EXECUTE') AS has_execute_privilege
FROM pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'supabase_auth_admin', 'service_role', 'public')
ORDER BY r.rolname;

-- ------------------------------------------------------------------------------
-- 7. Count auth.users vs public.profiles (Detect Orphaned Accounts)
-- ------------------------------------------------------------------------------
SELECT 
  (SELECT COUNT(*) FROM auth.users) AS auth_users_count,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'profiles'
    ) THEN (SELECT COUNT(*) FROM public.profiles)
    ELSE NULL
  END AS profiles_count,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_roles'
    ) THEN (SELECT COUNT(*) FROM public.user_roles)
    ELSE NULL
  END AS user_roles_count;
