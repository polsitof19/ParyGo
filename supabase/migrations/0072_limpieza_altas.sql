-- 0072 — Limpieza diaria de altas abandonadas (2026-09-25, pedido de Paul).
--
-- El alta con pack (/empezar) crea la marca SIN dueña y archivada antes de
-- pagar; si la persona no paga, queda la marca huérfana con su compra
-- pendiente/fallida. El alta gratis crea el usuario SIN confirmar y, si nunca
-- pone el código, queda un usuario que además bloquea el alta desde la cabina
-- ("ya existe un usuario"). Nada de esto se borraba nunca.
--
-- Qué borra (y NADA más):
--   1. Marcas nacidas del alta (tienen una compra con created_by NULL) que
--      no tienen dueña, ni eventos, ni órdenes, ni una compra PAGADA, y cuya
--      última compra tiene más de 7 días (un pago en efectivo de MP puede
--      tardar días: con menos se borraría una compra que igual se acredita).
--      Las marcas is_test (E2E) van con 1 hora y aunque su "pago" sea
--      simulado: una marca de prueba no la puede marcar nadie sin service role.
--   2. Usuarios SIN confirmar con más de 7 días, sin marca, que no son super
--      admin y que no figuran en entradas ni comprobantes (FK sin cascade).
--   3. Intentos de reenvío/alta (ticket_resend_attempts) de más de 2 días:
--      el tope más largo que miran es de una hora.
--
-- Service role / cron solamente: revoke explícito de anon Y authenticated
-- (lección 0014).

create or replace function public.limpiar_altas_abandonadas()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_marcas int;
  v_compras int;
  v_usuarios int;
  v_intentos int;
begin
  create temp table _marcas on commit drop as
  select b.id
  from public.brands b
  where not exists (select 1 from public.brand_members m where m.brand_id = b.id)
    and not exists (select 1 from public.events e where e.brand_id = b.id)
    and not exists (select 1 from public.orders o where o.brand_id = b.id)
    and exists (select 1 from public.pack_purchases p where p.brand_id = b.id and p.created_by is null)
    and (b.is_test or not exists (select 1 from public.pack_purchases p where p.brand_id = b.id and p.status = 'paid'))
    and b.created_at < now() - case when b.is_test then interval '1 hour' else interval '7 days' end
    and not exists (
      select 1 from public.pack_purchases p
      where p.brand_id = b.id
        and p.created_at > now() - case when b.is_test then interval '1 hour' else interval '7 days' end
    )
  ;

  delete from public.pack_purchases where brand_id in (select id from _marcas);
  get diagnostics v_compras = row_count;
  delete from public.brands where id in (select id from _marcas);
  get diagnostics v_marcas = row_count;

  delete from auth.users u
  where u.email_confirmed_at is null
    and u.created_at < now() - interval '7 days'
    and not exists (select 1 from public.brand_members m where m.user_id = u.id)
    and not exists (select 1 from public.user_profiles p where p.user_id = u.id and p.is_super_admin)
    and not exists (select 1 from public.tickets t where t.validated_by = u.id)
    and not exists (select 1 from public.yape_proofs y where y.reviewed_by = u.id);
  get diagnostics v_usuarios = row_count;

  delete from public.ticket_resend_attempts where created_at < now() - interval '2 days';
  get diagnostics v_intentos = row_count;

  return jsonb_build_object('marcas', v_marcas, 'compras', v_compras, 'usuarios', v_usuarios, 'intentos', v_intentos);
end;
$$;

revoke execute on function public.limpiar_altas_abandonadas() from public;
revoke execute on function public.limpiar_altas_abandonadas() from anon;
revoke execute on function public.limpiar_altas_abandonadas() from authenticated;

-- Todos los días 04:41 de Lima (09:41 UTC), fuera de horario de eventos.
select cron.unschedule('parygo-limpiar-altas') where exists (select 1 from cron.job where jobname = 'parygo-limpiar-altas');
select cron.schedule('parygo-limpiar-altas', '41 9 * * *', 'select public.limpiar_altas_abandonadas();');
