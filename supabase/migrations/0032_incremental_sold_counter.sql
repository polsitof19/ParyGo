-- =============================================================
-- 0032 — Recuento de VENDIDAS incremental (Fase 3 de escala). Toca el conteo
-- que alimenta el AFORO (el anti-oversell de Fase 2 lee ticket_types.sold).
-- =============================================================
-- PROBLEMA: el trigger viejo `tickets_counter` (0001) era FOR EACH ROW y por
-- cada emisión hacía `update ticket_types set sold = (select count(*) from
-- tickets where ticket_type_id=X and invalidated_at is null)` → O(n) por ticket,
-- O(n²) en un alta/baja masiva, con contención de escritura sobre ticket_types.
-- A 20k, en el pico de un tipo popular, era el cuello de botella de escritura.
--
-- SOLUCIÓN: mantener `sold` por DELTA incremental O(1), driveado por la mutación
-- REAL de filas de `tickets` (no por código por-llamador → imposible perder un
-- camino o contar doble). El AFTER trigger corre en la MISMA transacción que el
-- INSERT/UPDATE/DELETE → atómico con la emisión/anulación; nunca una operación
-- aparte que pueda fallar sola. settle_mp_payment / issue_tickets_atomic / void
-- NO se tocan (su atomicidad/idempotencia queda intacta) — solo el trigger se
-- vuelve barato.
--
-- DISEÑO (validado por backend-architect):
--   · INSERT y DELETE: triggers STATEMENT-level con transition tables → un INSERT
--     multi-fila (el `generate_series` de la emisión) agrega +N en UN solo UPDATE
--     por tipo (mata el O(n²)).
--   · UPDATE: trigger ROW-level con WHEN (old.invalidated_at IS DISTINCT FROM
--     new.invalidated_at) → SOLO dispara en flips de anulación. El escaneo de
--     puerta (alta frecuencia, NO toca invalidated_at) NO lo dispara → cero
--     overhead en el camino caliente. Delta ±1. Guard de inmutabilidad de
--     ticket_type_id (B-2): si cambiara, el delta caería en el tipo equivocado.
--
-- CONSISTENCIA CON FASE 2: el trigger hace `update ticket_types set sold=...` que
-- toma el MISMO row-lock que reserve_order_stock/_order_capacity_overflow leen
-- bajo FOR UPDATE → emisión y reserva/gate siguen serializando en la fila. No
-- cambia QUÉ se lockea ni cuándo (igual que el trigger viejo), solo CÓMO se
-- calcula el valor. Sin nuevo orden de lock → sin deadlock nuevo.
--
-- ILIMITADOS (Almighty): el trigger NO discrimina por is_unlimited → su `sold`
-- se sigue manteniendo (el panel lo muestra como "vendidos"). El cupo no lo usa
-- (get_available_stock devuelve infinito para is_unlimited). Camino intacto.
--
-- RECONCILIACIÓN (red de seguridad): reconcile_ticket_type_sold recomputa
-- sold = count real bajo FOR UPDATE por fila (no introduce drift si corre con
-- ventas), idempotente (solo escribe si difiere), loguea el drift corregido.
-- pg_cron diario de baja frecuencia + corrida one-time al cierre de esta migr.
--
-- NO toca: validate_ticket, webhook MP (HMAC), apply_promo, precio congelado,
-- max_scans, RLS base, archivado. Lockdown 0014 en reconcile. Idempotente.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Fuera el trigger O(n) viejo + su función + recompute (ya nadie lo usa;
--    reconcile lo reemplaza). DROP ordenado (trigger → función dependiente).
-- -------------------------------------------------------------
drop trigger if exists tickets_counter on public.tickets;
drop function if exists public.tickets_update_counter();
drop function if exists public.recompute_ticket_type_sold(uuid);

-- -------------------------------------------------------------
-- 2. Funciones de delta (SECURITY DEFINER + search_path fijo — lección 0014).
-- -------------------------------------------------------------
-- INSERT statement-level: +count(activos) por tipo, agregado multi-fila.
create or replace function public.tickets_sold_delta_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ticket_types tt
     set sold = greatest(0, tt.sold + d.delta)
  from (
    select ticket_type_id, count(*)::int as delta
    from new_tbl
    where invalidated_at is null
    group by ticket_type_id
  ) d
  where tt.id = d.ticket_type_id;
  return null;
end;
$$;

-- DELETE statement-level: -count(activos) por tipo.
create or replace function public.tickets_sold_delta_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ticket_types tt
     set sold = greatest(0, tt.sold - d.delta)
  from (
    select ticket_type_id, count(*)::int as delta
    from old_tbl
    where invalidated_at is null
    group by ticket_type_id
  ) d
  where tt.id = d.ticket_type_id;
  return null;
end;
$$;

-- UPDATE row-level: solo invocado cuando invalidated_at cambió (WHEN del trigger).
-- null→notnull (anular) = -1 ; notnull→null (reactivar) = +1.
create or replace function public.tickets_sold_delta_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Invariante del contador (B-2): un ticket no cambia de tipo. Si lo hiciera,
  -- el delta caería en el ticket_type equivocado y descuadraría dos tipos.
  if new.ticket_type_id is distinct from old.ticket_type_id then
    raise exception 'ticket_type_id is immutable (sold counter invariant)';
  end if;

  if old.invalidated_at is null and new.invalidated_at is not null then
    update public.ticket_types set sold = greatest(0, sold - 1) where id = new.ticket_type_id;
  elsif old.invalidated_at is not null and new.invalidated_at is null then
    update public.ticket_types set sold = greatest(0, sold + 1) where id = new.ticket_type_id;
  end if;
  return null;
end;
$$;

-- -------------------------------------------------------------
-- 3. Triggers. INSERT/DELETE statement-level (transition tables, PG10+),
--    UPDATE row-level con WHEN (protege el escaneo de puerta).
-- -------------------------------------------------------------
create or replace trigger tickets_sold_delta_ins
  after insert on public.tickets
  referencing new table as new_tbl
  for each statement execute function public.tickets_sold_delta_insert();

create or replace trigger tickets_sold_delta_del
  after delete on public.tickets
  referencing old table as old_tbl
  for each statement execute function public.tickets_sold_delta_delete();

create or replace trigger tickets_sold_delta_upd
  after update on public.tickets
  for each row
  when (old.invalidated_at is distinct from new.invalidated_at)
  execute function public.tickets_sold_delta_update();

-- Lockdown 0014 (hygiene): las funciones de trigger NO son invocables por nombre
-- (PG prohíbe llamar trigger functions directamente; PostgREST no las expone como
-- RPC) — pero revocamos execute igual para que la auditoría no las marque.
revoke execute on function public.tickets_sold_delta_insert() from public, anon, authenticated;
revoke execute on function public.tickets_sold_delta_delete() from public, anon, authenticated;
revoke execute on function public.tickets_sold_delta_update() from public, anon, authenticated;

-- -------------------------------------------------------------
-- 4. reconcile_ticket_type_sold — red de seguridad. Recomputa sold = count real
--    bajo FOR UPDATE por fila (serializa con emisión/void → NO introduce drift
--    si corre durante ventas). Idempotente: solo escribe (y loguea) si difiere.
--    Devuelve cuántas filas tenían drift. p_ticket_type_id NULL = todas.
-- -------------------------------------------------------------
create or replace function public.reconcile_ticket_type_sold(p_ticket_type_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_old int;
  v_real int;
  v_fixed int := 0;
  v_ev uuid;
  v_brand uuid;
begin
  for v_id in
    select id from public.ticket_types
    where p_ticket_type_id is null or id = p_ticket_type_id
    order by id
  loop
    -- Lock de la fila: serializa con el delta de emisión/void en esa fila →
    -- el count que leemos es consistente con lo que se va a contabilizar.
    perform 1 from public.ticket_types where id = v_id for update;
    select sold into v_old from public.ticket_types where id = v_id;
    select count(*)::int into v_real
      from public.tickets where ticket_type_id = v_id and invalidated_at is null;
    if v_old is distinct from v_real then
      update public.ticket_types set sold = v_real where id = v_id;
      select event_id into v_ev from public.ticket_types where id = v_id;
      select brand_id into v_brand from public.events where id = v_ev;
      insert into public.events_log (brand_id, event_id, type, payload)
      values (v_brand, v_ev, 'sold_reconcile_drift',
              jsonb_build_object('ticket_type_id', v_id, 'old_sold', v_old, 'real_sold', v_real));
      v_fixed := v_fixed + 1;
    end if;
  end loop;
  return v_fixed;
end;
$$;

-- Lockdown 0014: reconcile es callable como RPC → revoke explícito anon Y
-- authenticated; solo service_role (cron/manual vía service_role).
revoke execute on function public.reconcile_ticket_type_sold(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_ticket_type_sold(uuid) to service_role;

-- -------------------------------------------------------------
-- 5. pg_cron diario de baja frecuencia (04:17 Lima = 09:17 UTC, bajo tráfico).
--    Red de seguridad contra drift; no rompe nada si los números ya están bien.
-- -------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('parygo-reconcile-sold')
      where exists (select 1 from cron.job where jobname = 'parygo-reconcile-sold');
    perform cron.schedule(
      'parygo-reconcile-sold',
      '17 9 * * *',
      $cron$ select public.reconcile_ticket_type_sold(); $cron$
    );
  end if;
end $$;

-- -------------------------------------------------------------
-- 6. Baseline en el cutover: dejar sold == count real exacto (corrige cualquier
--    drift latente del trigger viejo). Seguro aunque haya ventas (lock por fila).
-- -------------------------------------------------------------
select public.reconcile_ticket_type_sold();

notify pgrst, 'reload schema';
