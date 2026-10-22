-- Forward migration: payment state transitions are server-only.
-- The Express backend invokes this RPC with the Supabase service-role client.
-- Revoke PostgreSQL's default PUBLIC EXECUTE grant so anon/authenticated callers
-- cannot exploit SECURITY DEFINER execution when auth.uid() is NULL.
REVOKE EXECUTE ON FUNCTION public.mark_platform_fee_paid(VARCHAR) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_platform_fee_paid(VARCHAR) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_platform_fee_paid(VARCHAR) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_platform_fee_paid(VARCHAR) TO service_role;
