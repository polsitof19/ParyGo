-- =============================================================
-- 0064 — El reclamo de un evento GRATIS en UN solo viaje a la base.
-- =============================================================
-- Para qué: medido contra producción, un reclamo gratis tardaba ~4,3s y
-- después de 00ee77a seguía en ~3s. No es la base: es la distancia. El Worker
-- corre en Lima y la base en us-west-1 (~300ms por viaje), y el reclamo hacía
-- once viajes EN FILA: evento → marca/tipos/precios → insert orden → insert
-- líneas → reserve_order_stock → issue_tickets_atomic → releer tickets →
-- releer orden → bitácora → releer orden → encolar el email.
--
-- claim_free_order hace exactamente lo mismo, en el mismo orden, dentro de
-- UNA transacción:
--   1. valida evento, marca, edad, documento, fecha y cada tipo con la MISMA
--      regla que lib/publicTicketGuard.ts;
--   2. inserta orden + líneas (el trigger 0020 congela base_price_cents igual);
--   3. llama a reserve_order_stock (gate por persona 0060/0061 + cupo 0031,
--      mismos locks en el mismo orden);
--   4. llama a issue_tickets_atomic (gate de aforo + flip a paid + emisión);
--   5. deja la bitácora (order_created + tickets_issued_free) y encola el email
--      (dedupe_key UNIQUE, igual que enqueueTicketEmail).
-- No reimplementa ni el cupo ni la emisión: reutiliza las dos funciones que ya
-- son el embudo único. Lo nuevo es solo el pegamento.
--
-- LO QUE MEJORA ADEMÁS DE LA LATENCIA: si algo falla a mitad de camino (cupo
-- agotado, límite por persona), la transacción entera se revierte. El camino
-- viejo dejaba una orden 'failed' + líneas por cada rechazo; este no deja nada.
--
-- CUÁNDO NO APLICA: devuelve {ok:false, code:'not_free'} y NO toca nada si el
-- evento no está marcado gratis o si algún tipo pedido tiene precio activo > 0
-- (el total no sería 0). La app cae entonces al camino de siempre, que vuelve a
-- validar todo desde cero. Por eso un "esto es gratis" mal mandado por el
-- cliente no abre nada: solo elige qué camino del server valida.
-- Los códigos promo tampoco pasan por acá (los maneja el camino de siempre).
--
-- MÉTODO DE PAGO: un reclamo gratis se guarda SIEMPRE como 'yape_manual', que
-- es lo que tienen hoy las 4 órdenes gratis pagadas de la base. El camino viejo
-- guardaba el método que traía el formulario, y con 'mercadopago' el flip a
-- paid violaba orders_check (MP pagada sin preferencia): un evento gratis de
-- una marca que solo cobra con tarjeta no podía emitir. Acá no importa el
-- método: no hubo pago.
--
-- SEGURIDAD: SECURITY DEFINER, solo service-role. Revoke EXPLÍCITO de anon y
-- authenticated (lección de la 0014: `revoke from public` no alcanza).
-- lock_timeout acotado: en un pico, los reclamos del mismo tipo se forman en
-- fila detrás del lock de ticket_types, y acá ese lock se sostiene durante la
-- emisión y el encolado (antes se soltaba al terminar la reserva). Mejor un
-- "intenta de nuevo" a los 4s que el pool de PostgREST de una instancia Free
-- lleno de conexiones esperando; statement_timeout de 10s como techo total.
-- =============================================================

create or replace function public.claim_free_order(
  p_event_id     uuid,
  p_brand_id     uuid,
  p_items        jsonb,     -- [{ticket_type_id, quantity, attendee_names?[]}]
  p_buyer_name   text,
  p_buyer_email  text,
  p_buyer_phone  text,
  p_doc_type     text,
  p_dni          text,
  p_age_ok       boolean,
  p_marketing    boolean,
  p_session_id   text,
  p_ip           text,
  p_user_agent   text,
  p_utm          jsonb      -- {source, medium, campaign, content, term}
) returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
set lock_timeout to '4s'
set statement_timeout to '10s'
as $$
declare
  v_event    record;
  v_brand_archived timestamptz;
  v_n_items  int;
  v_n_found  int;
  v_rec      record;
  v_order_id uuid;
  v_ip       inet;
  v_doc      text := btrim(coalesce(p_dni, ''));
  v_issue    jsonb;
  v_count    int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    return jsonb_build_object('ok', false, 'code', 'type_invalid');
  end if;

  select e.id, e.slug, e.brand_id, e.is_published, e.archived_at, e.cancelled_at,
         e.starts_at, e.ends_at, e.min_age, e.require_age_confirmation,
         e.require_dni, e.collect_attendee_names, e.is_free
    into v_event
  from public.events e where e.id = p_event_id;

  -- Solo eventos marcados gratis. Todo lo demás, al camino de siempre.
  if not found or v_event.is_free is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'not_free');
  end if;

  -- Mismo orden de chequeos y mismos mensajes que startCheckout.
  if not v_event.is_published or v_event.archived_at is not null then
    return jsonb_build_object('ok', false, 'code', 'event_unavailable');
  end if;
  if v_event.brand_id is distinct from p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'brand_mismatch');
  end if;
  if v_event.require_age_confirmation and not coalesce(p_age_ok, false) then
    return jsonb_build_object('ok', false, 'code', 'age_required', 'min_age', v_event.min_age);
  end if;
  if v_event.require_dni then
    if (p_doc_type = 'dni' and v_doc !~ '^[0-9]{8}$')
       or (p_doc_type <> 'dni' and v_doc !~ '^[A-Za-z0-9]{6,15}$') then
      return jsonb_build_object('ok', false, 'code', 'dni_invalid', 'doc_type', p_doc_type);
    end if;
  end if;

  select b.archived_at into v_brand_archived from public.brands b where b.id = v_event.brand_id;
  if not found or v_brand_archived is not null or v_event.cancelled_at is not null then
    return jsonb_build_object('ok', false, 'code', 'event_unavailable');
  end if;
  -- ends_at si existe; si no, 18h tras el inicio (eventOverAt en la app).
  if coalesce(v_event.ends_at, v_event.starts_at + interval '18 hours') < now() then
    return jsonb_build_object('ok', false, 'code', 'event_over');
  end if;

  -- Tipos: todos distintos, todos existentes (misma regla que
  -- `tts.length !== ticketTypeIds.length` en la app).
  v_n_items := jsonb_array_length(p_items);
  select count(distinct tt.id) into v_n_found
  from jsonb_array_elements(p_items) x
  join public.ticket_types tt on tt.id::text = x->>'ticket_type_id';
  if v_n_found <> v_n_items
     or (select count(distinct x->>'ticket_type_id') from jsonb_array_elements(p_items) x) <> v_n_items then
    return jsonb_build_object('ok', false, 'code', 'type_invalid');
  end if;

  -- Guard por tipo. público = precio > 0 OR (evento gratis AND NOT cortesía).
  -- El evento ya es gratis, así que acá: activo, del evento, no cortesía. Un
  -- precio activo > 0 no es un reclamo gratis → camino de siempre.
  for v_rec in
    select tt.id, tt.is_active, tt.event_id, tt.is_courtesy,
           coalesce(ap.active_price_cents, tt.price_cents) as price,
           (x->>'quantity')::int as qty
    from jsonb_array_elements(p_items) x
    join public.ticket_types tt on tt.id::text = x->>'ticket_type_id'
    left join public.get_event_active_prices(v_event.id) ap on ap.ticket_type_id = tt.id
  loop
    if v_rec.qty is null or v_rec.qty < 1 or v_rec.qty > 10 then
      return jsonb_build_object('ok', false, 'code', 'type_invalid');
    end if;
    if not v_rec.is_active or v_rec.event_id <> v_event.id or v_rec.is_courtesy is true then
      return jsonb_build_object('ok', false, 'code', 'type_unavailable');
    end if;
    if v_rec.price > 0 then
      return jsonb_build_object('ok', false, 'code', 'not_free');
    end if;
  end loop;

  -- IP: la app la saca de x-forwarded-for; si no parsea, se guarda null como
  -- haría un insert que no la trae. Nunca tira el reclamo por esto.
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.orders (
    event_id, brand_id, buyer_name, buyer_email, buyer_phone, buyer_dni,
    buyer_doc_type, buyer_age_ok, marketing_opt_in, payment_method,
    subtotal_cents, total_cents, discount_cents, status,
    ip_address, user_agent, utm_source, utm_medium, utm_campaign, utm_content, utm_term
  ) values (
    v_event.id, v_event.brand_id, p_buyer_name, lower(p_buyer_email), p_buyer_phone,
    case when v_event.require_dni then v_doc else null end,
    p_doc_type, coalesce(p_age_ok, false), coalesce(p_marketing, false), 'yape_manual',
    0, 0, 0, 'pending_yape_review',
    v_ip, p_user_agent,
    p_utm->>'source', p_utm->>'medium', p_utm->>'campaign', p_utm->>'content', p_utm->>'term'
  ) returning id into v_order_id;

  insert into public.order_items
    (order_id, ticket_type_id, ticket_type_name, quantity, unit_price_cents, subtotal_cents, attendee_names)
  select v_order_id, tt.id, tt.name, (x->>'quantity')::int, 0, 0,
         case
           when v_event.collect_attendee_names and jsonb_typeof(x->'attendee_names') = 'array' then (
             select case when bool_or(length(n) > 0) then array_agg(n order by ord) end
             from (
               select left(btrim(coalesce(a.n, '')), 120) as n, a.ord
               from jsonb_array_elements_text(x->'attendee_names') with ordinality a(n, ord)
               where a.ord <= (x->>'quantity')::int
             ) s
           )
         end
  from jsonb_array_elements(p_items) x
  join public.ticket_types tt on tt.id::text = x->>'ticket_type_id';

  -- Cupo + límite por persona. Si rechaza, TIRA y se revierte todo lo de
  -- arriba: no queda una orden 'failed' de recuerdo.
  perform public.reserve_order_stock(v_order_id, p_session_id);

  v_issue := public.issue_tickets_atomic(v_order_id);
  if (v_issue->>'ok')::boolean is not true then
    raise exception 'issue_failed: %', coalesce(v_issue->>'action', '?');
  end if;
  v_count := coalesce((v_issue->>'ticket_count')::int, 0);

  insert into public.events_log (brand_id, event_id, order_id, type, payload) values
    (v_event.brand_id, v_event.id, v_order_id, 'order_created',
       jsonb_build_object('method', 'yape_manual', 'total_cents', 0, 'promo', null, 'via', 'claim_free_order')),
    (v_event.brand_id, v_event.id, v_order_id, 'tickets_issued_free',
       jsonb_build_object('count', v_count));

  -- La entrada por email sale por la cola (0062), igual que enqueueTicketEmail.
  insert into public.notification_jobs
    (kind, brand_id, event_id, order_id, recipient_email, recipient_name, dedupe_key, payload, status)
  values
    ('ticket_email', v_event.brand_id, v_event.id, v_order_id, lower(p_buyer_email),
     coalesce(p_buyer_name, ''), 'ticket_email:' || v_order_id, '{}'::jsonb, 'pending')
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object('ok', true, 'order_id', v_order_id, 'event_slug', v_event.slug,
                            'ticket_count', v_count);
end;
$$;

revoke all on function public.claim_free_order(uuid, uuid, jsonb, text, text, text, text, text, boolean, boolean, text, text, text, jsonb) from public;
revoke all on function public.claim_free_order(uuid, uuid, jsonb, text, text, text, text, text, boolean, boolean, text, text, text, jsonb) from anon;
revoke all on function public.claim_free_order(uuid, uuid, jsonb, text, text, text, text, text, boolean, boolean, text, text, text, jsonb) from authenticated;
grant execute on function public.claim_free_order(uuid, uuid, jsonb, text, text, text, text, text, boolean, boolean, text, text, text, jsonb) to service_role;
