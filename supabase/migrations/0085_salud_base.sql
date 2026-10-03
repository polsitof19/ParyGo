-- 0085 — Salud de la base (avisos de Supabase, 2026-10-03).
--
-- 1. Funciones SECURITY DEFINER que anon podía llamar por /rest/v1/rpc:
--    is_super_admin, user_brands y user_is_brand_member SOLO las usan políticas
--    de `authenticated` (verificado en pg_policies): se quita a public y anon,
--    authenticated conserva su grant propio. handle_new_user es el trigger de
--    auth.users: nadie la llama por la API (el trigger no necesita EXECUTE).
--    get_event_active_prices queda pública A PROPÓSITO (la página del comprador
--    la llama sin sesión).
-- 2. search_path fijo en las 7 funciones que no lo tenían.
-- 3. Las 2 políticas que re-evaluaban auth.uid()/is_super_admin() por fila
--    pasan a (select …): se evalúan una vez por consulta.
-- 4. Índices de las claves foráneas sin índice (25, avisos de Supabase). Tablas
--    chicas (miles de filas): el CREATE INDEX es instantáneo.
-- 5. Yape abandonado: una orden Yape SIN comprobante a las 48 h pasa a
--    'expired' (antes quedaba "pendiente" para siempre; su reserva de stock ya
--    vencía sola). El cron libera su promo en la misma corrida.

-- ---------- 1 ----------
revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.user_brands(public.user_role) from public, anon;
revoke execute on function public.user_is_brand_member(uuid, public.user_role) from public, anon;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.user_brands(public.user_role) to authenticated, service_role;
grant execute on function public.user_is_brand_member(uuid, public.user_role) to authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- 2 ----------
alter function public.bump_updated_at() set search_path = public;
alter function public.is_super_admin() set search_path = public;
alter function public.user_brands(public.user_role) set search_path = public;
alter function public.user_is_brand_member(uuid, public.user_role) set search_path = public;
alter function public.tt_default_courtesy() set search_path = public;
alter function public.prueba_tope_entradas() set search_path = public;
alter function public.privado_tope_entradas() set search_path = public;

-- ---------- 3 ----------
alter policy profiles_read_own on public.user_profiles
  using ((user_id = (select auth.uid())) or (select public.is_super_admin()));
alter policy brand_members_read on public.brand_members
  using ((select public.is_super_admin()) or (user_id = (select auth.uid()))
         or public.user_is_brand_member(brand_id, 'brand_admin'::public.user_role));

-- ---------- 4 ----------
create index if not exists access_requests_brand_id_idx on public.access_requests (brand_id);
create index if not exists brands_alta_usuario_idx on public.brands (alta_usuario);
create index if not exists event_postpone_emails_brand_id_idx on public.event_postpone_emails (brand_id);
create index if not exists event_postpone_emails_event_id_idx on public.event_postpone_emails (event_id);
create index if not exists events_log_actor_user_id_idx on public.events_log (actor_user_id);
create index if not exists events_log_order_id_idx on public.events_log (order_id);
create index if not exists events_log_ticket_id_idx on public.events_log (ticket_id);
create index if not exists notification_jobs_brand_id_idx on public.notification_jobs (brand_id);
create index if not exists notification_jobs_event_id_idx on public.notification_jobs (event_id);
create index if not exists notification_jobs_order_id_idx on public.notification_jobs (order_id);
create index if not exists order_items_ticket_type_id_idx on public.order_items (ticket_type_id);
create index if not exists orders_promo_code_id_idx on public.orders (promo_code_id);
create index if not exists orders_yape_proof_id_idx on public.orders (yape_proof_id);
create index if not exists promo_code_ticket_types_ticket_type_id_idx on public.promo_code_ticket_types (ticket_type_id);
create index if not exists promo_codes_brand_id_idx on public.promo_codes (brand_id);
create index if not exists promo_codes_created_by_idx on public.promo_codes (created_by);
create index if not exists promo_redemptions_brand_id_idx on public.promo_redemptions (brand_id);
create index if not exists push_suscripciones_user_id_idx on public.push_suscripciones (user_id);
create index if not exists ref_clicks_brand_id_idx on public.ref_clicks (brand_id);
create index if not exists ticket_resend_attempts_brand_id_idx on public.ticket_resend_attempts (brand_id);
create index if not exists tickets_brand_id_idx on public.tickets (brand_id);
create index if not exists tickets_validated_by_idx on public.tickets (validated_by);
create index if not exists validator_codes_created_by_idx on public.validator_codes (created_by);
create index if not exists validator_codes_user_id_idx on public.validator_codes (user_id);
create index if not exists yape_proofs_reviewed_by_idx on public.yape_proofs (reviewed_by);

-- ---------- 5 ----------
create or replace function public.cleanup_expired_reservations()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_count int;
  v_codes uuid[];
begin
  -- (a) garbage-collect expired, unattached stock reservations (unchanged).
  delete from public.stock_reservations
  where expires_at < now()
    and order_id is null;
  get diagnostics v_count = row_count;

  -- (a2) Yape abandonado (0085): sin comprobante a las 48 h → expired. Con
  -- comprobante NUNCA (eso lo decide el organizador). Antes de (b) para que
  -- su promo se libere en esta misma corrida.
  update public.orders
     set status = 'expired'
   where status = 'pending_yape_review'
     and payment_method = 'yape_manual'
     and yape_proof_id is null
     and created_at < now() - interval '48 hours';

  -- (b) release `held` promo redemptions of abandoned / terminal orders.
  with released as (
    update public.promo_redemptions r
       set status = 'released'
      from public.orders o
     where r.order_id = o.id
       and r.status = 'held'
       and (
         o.status in ('failed','expired')
         or (o.status = 'pending_payment' and o.created_at < now() - interval '30 minutes')
       )
    returning r.promo_code_id
  )
  select array_agg(distinct promo_code_id) into v_codes from released;

  -- (c) recompute use_count for the affected codes so the freed slot reopens.
  if v_codes is not null then
    update public.promo_codes c
       set use_count = (select count(*) from public.promo_redemptions r
                         where r.promo_code_id = c.id and r.status in ('held','consumed'))
     where c.id = any(v_codes);
  end if;

  return v_count;
end;
$function$;

revoke execute on function public.cleanup_expired_reservations() from public, anon, authenticated;
grant execute on function public.cleanup_expired_reservations() to service_role;
