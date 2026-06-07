-- =============================================================
-- 0020 — M1 hardening: apply_promo_to_order ya NO confía en p_items
-- (Sprint 4 · PASO 2.0 — BLOQUEANTE antes de MercadoPago)
--
-- PROBLEMA: apply_promo_to_order recomputaba el descuento desde p_items
-- (ticket_type_id + quantity) que le pasa el llamador, y reescribía
-- order_items + el total de la orden con eso. La base de precio ya era
-- server-side (get_event_active_prices), pero cantidades/tipos venían del
-- parámetro. HOY es seguro porque el ÚNICO llamador (startCheckout) arma
-- p_items server-trusted; el Sprint 4 agrega un SEGUNDO camino de dinero
-- (MercadoPago) → un llamador con p_items adulterado podría alterar el
-- total/descuento de la orden. (Deuda M1 documentada en 0019:102-109.)
--
-- SOLUCIÓN: apply_promo_to_order deriva las líneas EXCLUSIVAMENTE de la
-- propia orden, nunca del parámetro:
--   * cantidad y tipo  → public.order_items (congelados al crear la orden)
--   * precio base       → order_items.base_price_cents (precio de lista
--     CONGELADO e INMUTABLE — apply_promo reescribe unit_price_cents con el
--     precio CON descuento, pero jamás toca base_price_cents).
-- p_items queda IGNORADO (se conserva en la firma por compat backwards /
-- two-phase: un app viejo desplegado lo sigue pasando, sin efecto). El
-- preview de UI (preview_promo / _compute_promo_breakdown) sí usa p_items:
-- es read-only, una estimación, NUNCA escribe dinero.
--
-- IDEMPOTENCIA: base_price_cents es inmutable, así que reaplicar el promo da
-- el mismo resultado (no hay doble descuento). Antes la idempotencia venía de
-- releer la base de get_event_active_prices; ahora viene de la base congelada
-- en la orden — además correcto para llamadas ASÍNCRONAS (un webhook que
-- corre tras un cambio de fase cobra la base que la orden congeló, no la
-- fase nueva).
--
-- COMPAT (Almighty vendiendo en vivo): columna nullable + trigger que la
-- auto-rellena en cada INSERT → el código de inserción actual sigue
-- funcionando SIN cambios. apply_promo usa coalesce(base_price_cents,
-- unit_price_cents) como red de seguridad. NO se agrega NOT NULL (evita DDL
-- frágil/locks sobre la tabla caliente). Backfill recupera la base real de
-- redenciones históricas. Idempotente.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Columna de precio base congelado (lista, pre-descuento).
-- -------------------------------------------------------------
alter table public.order_items
  add column if not exists base_price_cents integer;

comment on column public.order_items.base_price_cents is
  'Precio de lista congelado al crear la orden (fase activa). INMUTABLE: la '
  'fuente de verdad para recomputar promos. unit_price_cents puede reescribirse '
  'con el precio descontado; esta columna nunca. Auto-rellenada por trigger.';

-- -------------------------------------------------------------
-- 2. Trigger: congela base_price_cents = unit_price_cents en INSERT, SIEMPRE,
--    ignorando cualquier valor que mande el llamador. Esto cierra el vector
--    de que un INSERT directo (la policy order_items_insert_public permite a
--    anon/authenticated insertar en order_items) inyecte una base falsa
--    (ej. base_price_cents=1 → entradas casi gratis al aplicar un promo).
--    unit_price_cents en el INSERT es el precio de lista de la fase activa; el
--    descuento se aplica DESPUÉS vía apply_promo, que solo reescribe
--    unit_price_cents, nunca base_price_cents. (security-review W2/W4.)
-- -------------------------------------------------------------
create or replace function public._freeze_order_item_base()
returns trigger language plpgsql set search_path = public as $$
begin
  new.base_price_cents := new.unit_price_cents;
  return new;
end; $$;

drop trigger if exists order_items_freeze_base on public.order_items;
create trigger order_items_freeze_base
  before insert on public.order_items
  for each row execute function public._freeze_order_item_base();

-- -------------------------------------------------------------
-- 3. Backfill de filas existentes.
-- -------------------------------------------------------------
--    (a) por defecto: base = unit_price actual (correcto p/ líneas SIN promo).
update public.order_items
   set base_price_cents = unit_price_cents
 where base_price_cents is null;

--    (b) líneas CON promo: recuperar la base REAL desde el breakdown congelado
--        en la redención (allí unit_price_cents ya es el descontado). Esto
--        deja la base correcta también para órdenes históricas con descuento.
update public.order_items oi
   set base_price_cents = (b->>'base_cents')::int
  from public.promo_redemptions r,
       lateral jsonb_array_elements(r.breakdown) b
 where oi.order_id = r.order_id
   and (b->>'ticket_type_id')::uuid = oi.ticket_type_id
   and (b->>'base_cents') is not null
   and oi.base_price_cents is distinct from (b->>'base_cents')::int;  -- no re-escribir igual valor (re-apply seguro c/ trigger de inmutabilidad)

-- -------------------------------------------------------------
-- 3b. Trigger de INMUTABILIDAD: bloquea cualquier UPDATE que intente cambiar
--     base_price_cents (defensa en profundidad — hace cumplir a nivel de motor
--     lo que el comentario de la columna promete). apply_promo solo reescribe
--     unit_price_cents/subtotal_cents, nunca la base, así que no se ve afectado.
--     Se crea DESPUÉS del backfill para no bloquearlo. (security-review W1/W4.)
-- -------------------------------------------------------------
create or replace function public._protect_order_item_base()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.base_price_cents is distinct from old.base_price_cents then
    raise exception 'base_price_cents es inmutable (order_id=%, ticket_type_id=%)',
      old.order_id, old.ticket_type_id using errcode = 'P0001';
  end if;
  return new;
end; $$;

drop trigger if exists order_items_protect_base on public.order_items;
create trigger order_items_protect_base
  before update on public.order_items
  for each row execute function public._protect_order_item_base();

-- -------------------------------------------------------------
-- 4. Núcleo de distribución reutilizable: toma líneas ya normalizadas
--    [{ticket_type_id, quantity, base}] y aplica percent/fixed(por-orden)/free.
--    Es la MISMA lógica que tenía _compute_promo_breakdown en 0019, extraída
--    para compartirla entre preview (p_items) y apply (order_items).
-- -------------------------------------------------------------
create or replace function public._compute_promo_breakdown_lines(v_promo public.promo_codes, p_lines jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_line jsonb; v_tt_id uuid; v_qty int; v_base int; v_covered boolean;
  v_total_base int := 0; v_covered_base int := 0; v_covered_count int := 0;
  v_applies_any boolean := false;
  v_lines jsonb := '[]'::jsonb;
  v_line_base int; v_line_qty int; v_line_disc int; v_line_final_sub int; v_line_unit_final int;
  v_fixed_total int := 0; v_fixed_alloc int := 0; v_covered_idx int := 0;
  v_total_final int := 0; v_breakdown jsonb := '[]'::jsonb;
  v_disc_value int := v_promo.discount_value;
begin
  -- pass 1: clasificar covered/uncovered, sumar bases.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_tt_id := (v_line->>'ticket_type_id')::uuid;
    v_qty   := greatest((v_line->>'quantity')::int, 0);
    v_base  := (v_line->>'base')::int;
    if v_base is null then return jsonb_build_object('ok', false, 'reason', 'BAD_TICKET_TYPE'); end if;
    v_covered := v_promo.applies_to_all or exists (
      select 1 from public.promo_code_ticket_types where promo_code_id = v_promo.id and ticket_type_id = v_tt_id);
    if v_covered and v_qty > 0 then
      v_applies_any := true;
      v_covered_count := v_covered_count + 1;
      v_covered_base := v_covered_base + v_base * v_qty;
    end if;
    v_total_base := v_total_base + v_base * v_qty;
    v_lines := v_lines || jsonb_build_object('ticket_type_id', v_tt_id, 'quantity', v_qty, 'base', v_base, 'covered', (v_covered and v_qty > 0));
  end loop;
  if not v_applies_any then return jsonb_build_object('ok', false, 'reason', 'NOT_APPLICABLE'); end if;

  -- fixed: descuento único por-orden, clampeado a la base cubierta.
  if v_promo.discount_type = 'fixed' then
    v_fixed_total := least(v_disc_value, v_covered_base);
  end if;

  -- pass 2: montos finales por línea.
  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_line_base := (v_line->>'base')::int;
    v_line_qty  := (v_line->>'quantity')::int;
    v_covered   := (v_line->>'covered')::boolean;
    if not v_covered then
      v_line_final_sub := v_line_base * v_line_qty;
      v_line_unit_final := v_line_base;
    else
      case v_promo.discount_type
        when 'free' then
          v_line_final_sub := 0; v_line_unit_final := 0;
        when 'percent' then
          v_line_unit_final := greatest(0, round(v_line_base * (100 - v_disc_value) / 100.0))::int;
          v_line_final_sub  := v_line_unit_final * v_line_qty;
        when 'fixed' then
          v_covered_idx := v_covered_idx + 1;
          if v_covered_idx = v_covered_count then
            -- última línea cubierta absorbe el remanente exacto → Σ disc == fixed_total
            v_line_disc := v_fixed_total - v_fixed_alloc;
          else
            v_line_disc := floor(v_fixed_total::numeric * (v_line_base * v_line_qty) / v_covered_base)::int;
          end if;
          v_line_disc := greatest(0, least(v_line_disc, v_line_base * v_line_qty));
          v_fixed_alloc := v_fixed_alloc + v_line_disc;
          v_line_final_sub  := (v_line_base * v_line_qty) - v_line_disc;
          v_line_unit_final := case when v_line_qty > 0 then round(v_line_final_sub::numeric / v_line_qty)::int else 0 end;
      end case;
    end if;
    v_total_final := v_total_final + v_line_final_sub;
    v_breakdown := v_breakdown || jsonb_build_object(
      'ticket_type_id', v_line->>'ticket_type_id', 'quantity', v_line_qty,
      'base_cents', v_line_base, 'final_cents', v_line_unit_final,
      'final_subtotal_cents', v_line_final_sub, 'covered', v_covered);
  end loop;

  return jsonb_build_object('ok', true, 'promo_code_id', v_promo.id, 'discount_type', v_promo.discount_type,
    'is_free', (v_total_final = 0), 'total_base_cents', v_total_base, 'total_final_cents', v_total_final,
    'total_discount_cents', v_total_base - v_total_final, 'breakdown', v_breakdown);
end; $$;

-- -------------------------------------------------------------
-- 5. _compute_promo_breakdown (PREVIEW path) → arma líneas desde p_items +
--    get_event_active_prices y delega en el núcleo. read-only (no escribe $).
--    Conserva la firma para no romper preview_promo (0018).
-- -------------------------------------------------------------
create or replace function public._compute_promo_breakdown(v_promo public.promo_codes, p_event_id uuid, p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_item jsonb; v_lines jsonb := '[]'::jsonb; v_base int; v_tt_id uuid;
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tt_id := (v_item->>'ticket_type_id')::uuid;
    select active_price_cents into v_base from public.get_event_active_prices(p_event_id) where ticket_type_id = v_tt_id;
    if v_base is null then return jsonb_build_object('ok', false, 'reason', 'BAD_TICKET_TYPE'); end if;
    v_lines := v_lines || jsonb_build_object(
      'ticket_type_id', v_tt_id, 'quantity', greatest((v_item->>'quantity')::int, 0), 'base', v_base);
  end loop;
  return public._compute_promo_breakdown_lines(v_promo, v_lines);
end; $$;

-- -------------------------------------------------------------
-- 6. apply_promo_to_order — AUTORITATIVO. IGNORA p_items. Deriva líneas de
--    order_items (cantidad/tipo congelados + base_price_cents congelada).
--    Mantiene la firma (p_items vestigial, two-phase) y toda la lógica de
--    límites/concurrencia (FOR UPDATE) intacta.
-- -------------------------------------------------------------
create or replace function public.apply_promo_to_order(p_order_id uuid, p_event_id uuid, p_code citext, p_email citext, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_promo public.promo_codes%rowtype; v_result jsonb; v_uses int; v_email_uses int;
  v_item jsonb; v_lines jsonb; v_order_brand uuid;
begin
  -- la orden debe existir y pertenecer al evento (el promo es por-evento).
  select brand_id into v_order_brand from public.orders where id = p_order_id and event_id = p_event_id;
  if v_order_brand is null then raise exception 'ORDER_NOT_FOUND' using errcode='P0001'; end if;

  select * into v_promo from public.promo_codes where event_id = p_event_id and code = p_code and is_active = true for update;
  if not found then raise exception 'PROMO_NOT_FOUND' using errcode='P0001'; end if;
  if v_promo.expires_at is not null and v_promo.expires_at <= now() then raise exception 'PROMO_EXPIRED' using errcode='P0001'; end if;
  if v_promo.max_uses is not null then
    select count(*) into v_uses from public.promo_redemptions where promo_code_id = v_promo.id and status in ('held','consumed') and order_id <> p_order_id;
    if v_uses >= v_promo.max_uses then raise exception 'PROMO_EXHAUSTED' using errcode='P0001'; end if;
  end if;
  select count(*) into v_email_uses from public.promo_redemptions where promo_code_id = v_promo.id and email = lower(p_email) and status in ('held','consumed') and order_id <> p_order_id;
  if v_email_uses >= v_promo.per_email_limit then raise exception 'PROMO_EMAIL_LIMIT' using errcode='P0001'; end if;

  -- FUENTE DE LA VERDAD: las líneas congeladas de la orden, NO p_items.
  select coalesce(jsonb_agg(jsonb_build_object(
           'ticket_type_id', oi.ticket_type_id,
           'quantity', oi.quantity,
           'base', coalesce(oi.base_price_cents, oi.unit_price_cents))), '[]'::jsonb)
    into v_lines
    from public.order_items oi
   where oi.order_id = p_order_id;

  v_result := public._compute_promo_breakdown_lines(v_promo, v_lines);
  if (v_result->>'ok')::boolean is not true then raise exception 'PROMO_NOT_APPLICABLE:%', coalesce(v_result->>'reason','?') using errcode='P0001'; end if;

  for v_item in select * from jsonb_array_elements(v_result->'breakdown') loop
    update public.order_items set unit_price_cents = (v_item->>'final_cents')::int,
      subtotal_cents = (v_item->>'final_subtotal_cents')::int
     where order_id = p_order_id and ticket_type_id = (v_item->>'ticket_type_id')::uuid;
  end loop;

  update public.orders set promo_code_id = v_promo.id, discount_cents = (v_result->>'total_discount_cents')::int,
    subtotal_cents = (v_result->>'total_base_cents')::int, total_cents = (v_result->>'total_final_cents')::int
   where id = p_order_id;

  insert into public.promo_redemptions (promo_code_id, order_id, event_id, brand_id, email, amount_discount_cents, status, breakdown)
  values (v_promo.id, p_order_id, p_event_id, v_promo.brand_id, lower(p_email), (v_result->>'total_discount_cents')::int, 'held', v_result->'breakdown')
  on conflict (order_id) do update set promo_code_id = excluded.promo_code_id, amount_discount_cents = excluded.amount_discount_cents,
    status = 'held', breakdown = excluded.breakdown, email = excluded.email;

  update public.promo_codes set use_count = (select count(*) from public.promo_redemptions where promo_code_id = v_promo.id and status in ('held','consumed')) where id = v_promo.id;
  return v_result || jsonb_build_object('promo_code_id', v_promo.id);
end; $$;

-- -------------------------------------------------------------
-- 7. Lockdown (lección 0014): revoke anon+authenticated, grant service_role.
--    create-or-replace preserva ACL, lo re-aseveramos explícito igual.
-- -------------------------------------------------------------
revoke execute on function public._compute_promo_breakdown_lines(public.promo_codes, jsonb) from public, anon, authenticated;
revoke execute on function public._compute_promo_breakdown(public.promo_codes, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_promo_to_order(uuid, uuid, citext, citext, jsonb) from public, anon, authenticated;
-- grant a service_role en helpers internos por consistencia con el patrón del
-- proyecto (se llaman solo desde funciones SECURITY DEFINER, pero mínimo
-- privilegio explícito; security-review W3).
grant execute on function public._compute_promo_breakdown_lines(public.promo_codes, jsonb) to service_role;
grant execute on function public.apply_promo_to_order(uuid, uuid, citext, citext, jsonb) to service_role;
