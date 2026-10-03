-- =============================================================
-- 0045 — Perf: agregar el conteo de tickets en Postgres (no traer filas)
-- =============================================================
-- El Resumen (/admin/events/[id]) y el Reporte traían TODOS los tickets del
-- evento solo para contar escaneados/emitidos por tipo en JS. En eventos grandes
-- (Almighty: miles de tickets) eso transfiere y deserializa miles de filas en
-- cada carga. Este RPC devuelve por tipo: emitidas (no anuladas) y escaneadas
-- (validadas no anuladas) con un GROUP BY → 1 query, ~N filas (N=tipos), usando
-- el índice por event_id. Solo LECTURA agregada; no cambia dato ni lógica.
--
-- service_role-only (lockdown 0014): lo llaman las páginas vía el admin client.
-- =============================================================

create or replace function public.event_ticket_stats(p_event_id uuid)
returns table (ticket_type_id uuid, emitidas bigint, escaneadas bigint)
language sql
security definer
stable
set search_path = public
as $$
  select
    t.ticket_type_id,
    count(*) filter (where t.invalidated_at is null) as emitidas,
    count(*) filter (where t.invalidated_at is null and t.validated_at is not null) as escaneadas
  from public.tickets t
  where t.event_id = p_event_id
  group by t.ticket_type_id;
$$;

revoke execute on function public.event_ticket_stats(uuid) from public, anon, authenticated;
grant execute on function public.event_ticket_stats(uuid) to service_role;

notify pgrst, 'reload schema';
