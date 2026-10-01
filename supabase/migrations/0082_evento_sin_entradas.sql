-- 0082 — Crear un evento sin tipos de entrada (2026-10-01, asistente de
-- "Crear evento": el paso de entradas es opcional, pedido de Paul).
-- Copia exacta de la create_brand_event vigente (0013) salvo el chequeo de
-- array vacío. La prueba (0069 create_brand_trial_event) la envuelve: hereda.
-- Mismos permisos: solo service role.
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_brand_event(p_brand_id uuid, p_actor_user_id uuid, p_event jsonb, p_ticket_types jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_new_balance int;
  v_event_id    uuid;
  v_tt          jsonb;
  v_tt_id       uuid;
  v_tt_idx      int := 0;
  v_tt_price    int;
  v_phase       jsonb;
begin
  -- 0. Exigir al menos 1 tipo de entrada (un evento sin entradas malgasta saldo).
  -- 0082: se puede crear SIN entradas (el asistente deja "saltar por ahora");
  -- sigue exigiendo un array. Publicar sin un tipo activo lo frena la app
  -- (setEventPublishedAction).
  if p_ticket_types is null
     or jsonb_typeof(p_ticket_types) <> 'array' then
    raise exception 'NO_TICKET_TYPES' using errcode = 'P0001';
  end if;

  -- 1. Decremento atómico (row-lock sobre brands → serializa el race).
  update public.brands
     set event_balance = event_balance - 1
   where id = p_brand_id
     and event_balance > 0
  returning event_balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  -- 2. Evento (is_published SIEMPRE false).
  insert into public.events (
    brand_id, slug, name, description, starts_at, ends_at,
    venue_name, venue_address, venue_lat, venue_lng, cover_url,
    min_age, refund_policy, is_published
  ) values (
    p_brand_id,
    p_event->>'slug',
    p_event->>'name',
    nullif(p_event->>'description', ''),
    (p_event->>'starts_at')::timestamptz,
    nullif(p_event->>'ends_at', '')::timestamptz,
    nullif(p_event->>'venue_name', ''),
    nullif(p_event->>'venue_address', ''),
    nullif(p_event->>'venue_lat', '')::numeric,
    nullif(p_event->>'venue_lng', '')::numeric,
    nullif(p_event->>'cover_url', ''),
    coalesce((p_event->>'min_age')::int, 18),
    nullif(p_event->>'refund_policy', ''),
    false
  )
  returning id into v_event_id;

  -- 3. Tipos de entrada + fases.
  for v_tt in select * from jsonb_array_elements(p_ticket_types)
  loop
    v_tt_price := coalesce((v_tt->>'price_cents')::int, 0);

    insert into public.ticket_types (
      event_id, name, description, price_cents, capacity,
      is_unlimited, sort_order, color_hex, perks, is_active
    ) values (
      v_event_id,
      v_tt->>'name',
      nullif(v_tt->>'description', ''),
      v_tt_price,
      coalesce((v_tt->>'capacity')::int, 0),
      coalesce((v_tt->>'is_unlimited')::boolean, false),
      coalesce((v_tt->>'sort_order')::int, v_tt_idx),
      nullif(v_tt->>'color_hex', ''),
      coalesce(v_tt->'perks', '[]'::jsonb),
      true
    )
    returning id into v_tt_id;

    if (v_tt ? 'phases')
       and jsonb_typeof(v_tt->'phases') = 'array'
       and jsonb_array_length(v_tt->'phases') > 0 then
      for v_phase in select * from jsonb_array_elements(v_tt->'phases')
      loop
        insert into public.ticket_type_price_phases (
          ticket_type_id, name, price_cents, starts_at, ends_at, sort_order
        ) values (
          v_tt_id,
          nullif(v_phase->>'name', ''),
          (v_phase->>'price_cents')::int,
          nullif(v_phase->>'starts_at', '')::timestamptz,
          nullif(v_phase->>'ends_at', '')::timestamptz,
          coalesce((v_phase->>'sort_order')::int, 0)
        );
      end loop;
    else
      -- Sin fases → fase base [null,null) = price_cents (idéntico a 0008).
      insert into public.ticket_type_price_phases (
        ticket_type_id, name, price_cents, starts_at, ends_at, sort_order
      ) values (v_tt_id, 'Precio base', v_tt_price, null, null, 0);
    end if;

    v_tt_idx := v_tt_idx + 1;
  end loop;

  -- 4. Logs (consumo + creación) — dentro de la tx.
  insert into public.events_log (brand_id, event_id, actor_user_id, type, payload)
  values (p_brand_id, v_event_id, p_actor_user_id, 'event_balance_consumed',
          jsonb_build_object('event_id', v_event_id, 'slug', p_event->>'slug', 'new_balance', v_new_balance));
  insert into public.events_log (brand_id, event_id, actor_user_id, type, payload)
  values (p_brand_id, v_event_id, p_actor_user_id, 'event_created',
          jsonb_build_object('slug', p_event->>'slug', 'name', p_event->>'name',
                             'ticket_type_count', jsonb_array_length(p_ticket_types), 'source', 'brand_panel'));

  return v_event_id;
end;
$function$;

revoke all on function public.create_brand_event(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_brand_event(uuid, uuid, jsonb, jsonb) to service_role;
