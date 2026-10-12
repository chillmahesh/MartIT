-- ==============================================================================
-- MartIT — Supabase Database Initialization Diagnostics (Read-Only)
-- Purpose: Inspect current database state to verify missing tables, triggers,
--          and migration history without making any changes.
-- Usage: Run this script in the Supabase Dashboard SQL Editor.
-- ==============================================================================

-- 1. Check if Supabase migration history table exists and what migrations are recorded
SELECT 
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'supabase_migrations' 
      AND table_name = 'schema_migrations'
  ) AS migration_history_table_exists;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'supabase_migrations' 
      AND table_name = 'schema_migrations'
  ) THEN
    RAISE NOTICE 'Recorded migrations:';
  ELSE
    RAISE NOTICE 'Notice: supabase_migrations.schema_migrations does NOT exist.';
  END IF;
END $$;

-- 2. Check existence of expected MartIT public tables
SELECT 
  table_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = t.table_name
  ) AS exists_in_db
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
) AS t(table_name);

-- 3. Check existence of custom enum types
SELECT 
  t.typname AS enum_name,
  ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname;

-- 4. Check trigger status on auth.users
SELECT 
  tgname AS trigger_name,
  relname AS table_name,
  proname AS function_name,
  tgenabled AS is_enabled
FROM pg_trigger tg
JOIN pg_class c ON tg.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON tg.tgfoid = p.oid
WHERE n.nspname = 'auth' AND c.relname = 'users';

-- 5. Inspect handle_new_user function definition, security settings, and owner
SELECT 
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS is_security_definer,
  p.proconfig AS configuration_settings
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';

-- 6. Check counts in auth.users vs public.profiles (to identify orphaned auth accounts)
SELECT 
  (SELECT COUNT(*) FROM auth.users) AS auth_users_count,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'profiles'
    ) THEN (SELECT COUNT(*) FROM public.profiles)
    ELSE NULL
  END AS profiles_count;
