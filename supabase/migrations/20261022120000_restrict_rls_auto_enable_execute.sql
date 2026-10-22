-- Migration: restrict_rls_auto_enable_execute.sql
-- Purpose: Keep the DDL event-trigger function from being exposed as a callable API routine.
-- The event trigger "ensure_rls" continues to invoke this function for CREATE TABLE events.
-- This migration intentionally does not revoke EXECUTE from postgres/service_role.

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
