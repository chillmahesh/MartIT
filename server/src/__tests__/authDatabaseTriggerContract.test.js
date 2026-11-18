import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Auth Registration Trigger & Database Repair Contract (20261118000001)', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261118000001_repair_auth_user_trigger_and_grants.sql'
  )
  const migrationSql = fs.readFileSync(migrationPath, 'utf8')

  it('declares handle_new_user with explicit search_path and SECURITY DEFINER', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)/)
    expect(migrationSql).toMatch(/SECURITY DEFINER/)
    expect(migrationSql).toMatch(/SET search_path\s*=\s*public,\s*extensions,\s*pg_temp/)
  })

  it('guarantees function ownership is assigned to postgres superuser', () => {
    expect(migrationSql).toMatch(/ALTER FUNCTION public\.handle_new_user\(\) OWNER TO postgres;/)
  })

  it('locks down client execution and revokes EXECUTE from PUBLIC, anon, and authenticated', () => {
    expect(migrationSql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC,\s*anon,\s*authenticated;/
    )
  })

  it('explicitly grants schema USAGE on public and extensions to supabase_auth_admin', () => {
    expect(migrationSql).toMatch(/GRANT USAGE ON SCHEMA public TO supabase_auth_admin;/)
    expect(migrationSql).toMatch(/GRANT USAGE ON SCHEMA extensions TO supabase_auth_admin;/)
  })

  it('explicitly grants EXECUTE and table permissions on profiles and user_roles to supabase_auth_admin', () => {
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.handle_new_user\(\) TO supabase_auth_admin;/)
    expect(migrationSql).toMatch(/GRANT SELECT, INSERT, UPDATE ON TABLE public\.profiles TO supabase_auth_admin;/)
    expect(migrationSql).toMatch(/GRANT SELECT, INSERT, UPDATE ON TABLE public\.user_roles TO supabase_auth_admin;/)
  })

  it('explicitly grants sequence USAGE on user_roles_id_seq to supabase_auth_admin', () => {
    expect(migrationSql).toMatch(/GRANT USAGE, SELECT ON SEQUENCE public\.user_roles_id_seq TO supabase_auth_admin;/)
  })

  it('explicitly grants USAGE on custom enum types to supabase_auth_admin', () => {
    expect(migrationSql).toMatch(/GRANT USAGE ON TYPE public\.role_enum TO supabase_auth_admin;/)
    expect(migrationSql).toMatch(/GRANT USAGE ON TYPE public\.runner_status_enum TO supabase_auth_admin;/)
  })

  it('guarantees uq_user_role unique constraint existence and deduplicates existing tuples', () => {
    expect(migrationSql).toMatch(/DELETE FROM public\.user_roles a\s+USING public\.user_roles b/s)
    expect(migrationSql).toMatch(/ALTER TABLE public\.user_roles ADD CONSTRAINT uq_user_role UNIQUE \(user_id, role\);/)
  })

  it('uses WHERE NOT EXISTS for customer role insertion to guarantee constraint-inference resilience', () => {
    expect(migrationSql).toMatch(/INSERT INTO public\.user_roles \(\s*user_id,\s*role,\s*created_at\s*\)/)
    expect(migrationSql).toMatch(/WHERE NOT EXISTS \(\s*SELECT 1 FROM public\.user_roles\s*WHERE user_id = NEW\.id AND role = 'customer'::public\.role_enum\s*\)/s)
  })

  it('cleans up orphaned profiles not matching auth.users on email collision', () => {
    expect(migrationSql).toMatch(/DELETE FROM public\.profiles\s+WHERE email = v_email\s+AND id <> NEW\.id\s+AND NOT EXISTS \(\s*SELECT 1 FROM auth\.users WHERE auth\.users\.id = profiles\.id\s*\);/s)
  })

  it('prevents privilege self-escalation by forcing runner_status to NULL and assigning strictly customer role', () => {
    // In profile insert: runner_status is NULL
    expect(migrationSql).toMatch(/INSERT INTO public\.profiles.*?VALUES\s*\([^)]*NULL,/s)
    // In role insert: strictly customer
    expect(migrationSql).toMatch(/'customer'::public\.role_enum/)
  })

  it('attaches on_auth_user_created trigger AFTER INSERT on auth.users', () => {
    expect(migrationSql).toMatch(/DROP TRIGGER IF EXISTS on_auth_user_created ON auth\.users;/)
    expect(migrationSql).toMatch(/CREATE TRIGGER on_auth_user_created\s+AFTER INSERT ON auth\.users\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.handle_new_user\(\);/s)
  })

  it('idempotently reconciles existing orphaned Auth users without profiles or default roles', () => {
    expect(migrationSql).toMatch(/-- Backfill missing profile records for existing Auth users/)
    expect(migrationSql).toMatch(/INSERT INTO public\.profiles.*?SELECT\s+u\.id,.*?FROM auth\.users u\s+LEFT JOIN public\.profiles p ON p\.id = u\.id\s+WHERE p\.id IS NULL/s)
    expect(migrationSql).toMatch(/-- Backfill missing default 'customer' role for existing Auth users with profiles/)
    expect(migrationSql).toMatch(/INSERT INTO public\.user_roles.*?SELECT u\.id, 'customer'::public\.role_enum.*?WHERE ur\.id IS NULL/s)
  })

  it('logs diagnostic details with SQLSTATE and SQLERRM before re-raising exceptions', () => {
    expect(migrationSql).toMatch(/EXCEPTION WHEN OTHERS THEN/)
    expect(migrationSql).toMatch(/RAISE WARNING 'handle_new_user failed for auth user % \(email: %\): SQLSTATE: %, SQLERRM: %'/)
    expect(migrationSql).toMatch(/RAISE;/)
  })

  it('declares v_phone as BIGINT matching live database profiles.phone schema', () => {
    expect(migrationSql).toMatch(/v_phone\s+BIGINT;/)
    expect(migrationSql).not.toMatch(/v_phone\s+VARCHAR/)
  })

  it('safely validates and casts incoming phone to BIGINT in handle_new_user without arbitrary truncation', () => {
    expect(migrationSql).toMatch(/v_phone_digits\s*:=\s*REGEXP_REPLACE\(v_raw_phone,\s*'\\D',\s*'',\s*'g'\);/)
    expect(migrationSql).toMatch(/IF\s+v_phone_digits\s+~\s+'\^\[0-9\]\{7,15\}\$'\s+THEN/)
    expect(migrationSql).toMatch(/v_phone\s*:=\s*v_phone_digits::bigint;/)
    expect(migrationSql).toMatch(/ELSE\s+v_phone\s*:=\s*NULL;/)
  })

  it('safely validates and casts phone to BIGINT in orphan reconciliation insert without aborting', () => {
    expect(migrationSql).toMatch(/CASE\s+WHEN\s+REGEXP_REPLACE\(COALESCE\(u\.phone,\s*u\.raw_user_meta_data->>'phone',\s*''\),\s*'\\D',\s*'',\s*'g'\)\s+~\s+'\^\[0-9\]\{7,15\}\$'\s+THEN\s+REGEXP_REPLACE\(COALESCE\(u\.phone,\s*u\.raw_user_meta_data->>'phone',\s*''\),\s*'\\D',\s*'',\s*'g'\)::bigint\s+ELSE\s+NULL\s+END/s)
  })
})
