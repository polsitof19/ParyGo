-- =============================================================
-- 0014 · SECURITY FIX — lock down SECURITY DEFINER functions
-- =============================================================
-- Supabase applies ALTER DEFAULT PRIVILEGES that GRANT EXECUTE on new public
-- functions to anon + authenticated. Our service-role-only RPCs only did
-- `revoke execute ... from public` + `grant ... to service_role`, which does
-- NOT remove the anon/authenticated grants from the default privileges.
--
-- Impact (caught by an auth-layer test): anyone with the public anon key
-- could call money/privileged SECURITY DEFINER RPCs directly via PostgREST —
-- e.g. load_event_pack (self-grant event balance), consume_event_balance /
-- create_brand_event (create events in ANY brand), bypassing every server
-- action check. CRITICAL.
--
-- Fix: explicitly REVOKE EXECUTE from anon + authenticated on every
-- service-role-only function. We do NOT touch:
--   - get_event_active_prices  (intentionally callable by anon/authenticated)
--   - is_super_admin / user_is_brand_member / user_brands  (called BY RLS
--     policies as the querying role — revoking would break RLS)
--
-- service_role keeps EXECUTE (it has its own grant, not revoked here).
-- Idempotent.
-- =============================================================

do $$
declare
  v_sig text;
begin
  for v_sig in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'consume_event_balance',
        'load_event_pack',
        'create_brand_event',
        'get_available_stock',
        'create_or_refresh_stock_reservation',
        'attach_reservation_to_order',
        'release_stock_reservations_for_order',
        'cleanup_expired_reservations',
        'get_brand_mp_credentials',
        'set_brand_mp_credentials'
      )
  loop
    execute format('revoke execute on function %s from anon, authenticated', v_sig);
  end loop;
end $$;
