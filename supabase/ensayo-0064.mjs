// Ensayo FUNCIONAL de la 0064 contra la base real, sin persistir nada.
//
//   node supabase/ensayo-0064.mjs
//
// Crea la función, un evento gratis de demotest y corre los casos dentro de un
// DO block que termina con RAISE: la transacción entera se revierte siempre y
// los resultados viajan en el mensaje del error. Después verifica que no quedó
// ni la función ni el evento ni ninguna orden.
import { readFileSync } from 'node:fs';
import { query } from './mgmt.mjs';

const mig = readFileSync('supabase/migrations/0064_claim_free_order.sql', 'utf8');

// Un reclamo, con los argumentos que cambian entre casos.
const claim = (ev, brand, items, email, dni, { age = 'true', sesion }) =>
  `claim_free_order(${ev}, ${brand}, ${items}, 'Prueba', '${email}', '+51999', 'dni', '${dni}', ${age}, false, '${sesion}', null, null, '{}')`;
const uno = (tt) => `jsonb_build_array(jsonb_build_object('ticket_type_id', ${tt}, 'quantity', 1))`;

const casos = `
do $$
declare
  b uuid := (select id from brands where slug = 'demotest');
  ev uuid; tt uuid; ev_pago uuid; tt_pago uuid; tt_cort uuid;
  r jsonb := '{}'::jsonb; x jsonb; o uuid;
begin
  -- demotest vive ARCHIVADA y una marca archivada no reclama: se desarchiva
  -- dentro de esta transacción, que se revierte entera al final.
  update brands set archived_at = null where id = b;
  insert into events (brand_id, slug, name, starts_at, ends_at, is_published, is_free, max_per_person, require_dni, require_age_confirmation, min_age)
  values (b, 'ensayo-0064-' || floor(random()*1e6)::int, 'Ensayo 0064', now() + interval '5 days', now() + interval '5 days 6 hours', true, true, 1, true, true, 18)
  returning id into ev;
  insert into ticket_types (event_id, name, price_cents, capacity, is_active) values (ev, 'Gratis', 0, 2, true) returning id into tt;
  insert into ticket_types (event_id, name, price_cents, capacity, is_active, is_courtesy) values (ev, 'Cortesia', 0, 5, true, true) returning id into tt_cort;
  insert into events (brand_id, slug, name, starts_at, is_published, is_free)
  values (b, 'ensayo-0064p-' || floor(random()*1e6)::int, 'Ensayo pago', now() + interval '5 days', true, false) returning id into ev_pago;
  insert into ticket_types (event_id, name, price_cents, capacity, is_active) values (ev_pago, 'Pago', 3000, 5, true) returning id into tt_pago;

  -- A. feliz (con IP y UTM, email en mayúsculas)
  x := claim_free_order(ev, b, ${uno('tt')}, 'Ana', 'E2E-ensayo-a@test.local', '+51999', 'dni', '11111111', true, false, 'sesion-a-123', '1.2.3.4', 'ua', '{"source":"ig"}');
  o := (x->>'order_id')::uuid;
  r := r || jsonb_build_object('A', x,
    'A_orden', (select jsonb_build_object('status', status, 'pm', payment_method, 'email', buyer_email, 'dni', buyer_dni, 'ip', host(ip_address), 'utm', utm_source, 'total', total_cents, 'paid_at', paid_at is not null) from orders where id = o),
    'A_tickets', (select count(*) from tickets where order_id = o),
    'A_log', (select jsonb_agg(type order by type) from events_log where order_id = o),
    'A_job', (select jsonb_agg(jsonb_build_object('k', kind, 's', status, 'to', recipient_email)) from notification_jobs where order_id = o),
    'A_reservas', (select count(*) from stock_reservations where order_id = o),
    'A_base', (select base_price_cents from order_items where order_id = o),
    'A_sold', (select sold from ticket_types where id = tt));

  -- B. misma persona otra vez (límite 1): mismo email / mismo DNI
  begin x := ${claim('ev', 'b', uno('tt'), 'e2e-ensayo-a@test.local', '22222222', { sesion: 'sesion-b-123' })}; r := r || jsonb_build_object('B', x);
  exception when others then r := r || jsonb_build_object('B_error', sqlerrm); end;
  begin x := ${claim('ev', 'b', uno('tt'), 'e2e-ensayo-otro@test.local', '11111111', { sesion: 'sesion-b2-123' })}; r := r || jsonb_build_object('B2', x);
  exception when others then r := r || jsonb_build_object('B2_error', sqlerrm); end;
  r := r || jsonb_build_object('B_ordenes_de_mas', (select count(*) from orders where event_id = ev) - 1);

  -- C. aforo 2: la segunda persona entra, la tercera no
  x := ${claim('ev', 'b', uno('tt'), 'e2e-ensayo-b@test.local', '33333333', { sesion: 'sesion-c1-123' })};
  r := r || jsonb_build_object('C1_ok', x->'ok');
  begin x := ${claim('ev', 'b', uno('tt'), 'e2e-ensayo-c@test.local', '44444444', { sesion: 'sesion-c2-123' })}; r := r || jsonb_build_object('C2', x);
  exception when others then r := r || jsonb_build_object('C2_error', sqlerrm); end;
  r := r || jsonb_build_object('C_sold', (select sold from ticket_types where id = tt), 'C_ordenes', (select count(*) from orders where event_id = ev));

  -- D..J. rechazos de validación (no insertan nada)
  r := r || jsonb_build_object(
    'D_evento_pago', ${claim('ev_pago', 'b', uno('tt_pago'), 'e2e-x@test.local', '55555555', { sesion: 'sesion-d-123' })},
    'E_cortesia', ${claim('ev', 'b', uno('tt_cort'), 'e2e-x@test.local', '55555555', { sesion: 'sesion-e-123' })},
    'F_duplicado', ${claim('ev', 'b', "jsonb_build_array(jsonb_build_object('ticket_type_id', tt, 'quantity', 1), jsonb_build_object('ticket_type_id', tt, 'quantity', 1))", 'e2e-x@test.local', '55555555', { sesion: 'sesion-f-123' })},
    'G_edad', ${claim('ev', 'b', uno('tt'), 'e2e-x@test.local', '55555555', { age: 'false', sesion: 'sesion-g-123' })},
    'H_dni', ${claim('ev', 'b', uno('tt'), 'e2e-x@test.local', '123', { sesion: 'sesion-h-123' })},
    'I_marca', ${claim('ev', 'gen_random_uuid()', uno('tt'), 'e2e-x@test.local', '55555555', { sesion: 'sesion-i-123' })},
    'J_tipo_de_otro_evento', ${claim('ev', 'b', uno('tt_pago'), 'e2e-x@test.local', '55555555', { sesion: 'sesion-j-123' })},
    'K_cantidad_11', ${claim('ev', 'b', "jsonb_build_array(jsonb_build_object('ticket_type_id', tt, 'quantity', 11))", 'e2e-x@test.local', '55555555', { sesion: 'sesion-k-123' })});
  r := r || jsonb_build_object('Z_ordenes_finales', (select count(*) from orders where event_id in (ev, ev_pago)));

  -- R. IDEMPOTENCIA por claim_id (evento aparte: aforo 5, límite 1 por persona)
  declare ev2 uuid; tt2 uuid; cid uuid := gen_random_uuid(); x1 jsonb; x2 jsonb;
  begin
    insert into events (brand_id, slug, name, starts_at, is_published, is_free, max_per_person)
    values (b, 'ensayo-0064r-' || floor(random()*1e6)::int, 'Ensayo replay', now() + interval '5 days', true, true, 1) returning id into ev2;
    insert into ticket_types (event_id, name, price_cents, capacity, is_active) values (ev2, 'Gratis', 0, 5, true) returning id into tt2;
    x1 := claim_free_order(ev2, b, ${uno('tt2')}, 'Rita', 'e2e-ensayo-r@test.local', '+51999', 'dni', '66666666', true, false, 'sesion-r1-123', null, null, '{}', cid);
    -- el mismo reclamo otra vez (respuesta perdida → reintento), con el email en otra caja
    x2 := claim_free_order(ev2, b, ${uno('tt2')}, 'Rita', 'E2E-ensayo-r@test.local', '+51999', 'dni', '66666666', true, false, 'sesion-r1-123', null, null, '{}', cid);
    r := r || jsonb_build_object(
      'R1_ok', x1->'ok', 'R2', x2,
      'R2_misma_orden', (x1->>'order_id') = (x2->>'order_id'),
      'R2_ordenes', (select count(*) from orders where event_id = ev2),
      'R2_tickets', (select count(*) from tickets t join orders o2 on o2.id = t.order_id where o2.event_id = ev2),
      'R2_sold', (select sold from ticket_types where id = tt2),
      'R2_jobs', (select count(*) from notification_jobs n join orders o2 on o2.id = n.order_id where o2.event_id = ev2),
      'R3_otro_email', claim_free_order(ev2, b, ${uno('tt2')}, 'Otro', 'e2e-ensayo-otro2@test.local', '+51999', 'dni', '77777777', true, false, 'sesion-r3-123', null, null, '{}', cid),
      'R4_otro_evento', claim_free_order(ev, b, ${uno('tt')}, 'Rita', 'e2e-ensayo-r@test.local', '+51999', 'dni', '66666666', true, false, 'sesion-r4-123', null, null, '{}', cid));
    r := r || jsonb_build_object('R6_sin_claim_id_sigue_andando',
      (claim_free_order(ev2, b, ${uno('tt2')}, 'Sin', 'e2e-ensayo-s@test.local', '+51999', 'dni', '88888888', true, false, 'sesion-r6-123', null, null, '{}'))->'ok');
    begin
      x := claim_free_order(ev2, b, ${uno('tt2')}, 'Rita', 'e2e-ensayo-r@test.local', '+51999', 'dni', '66666666', true, false, 'sesion-r5-123', null, null, '{}', gen_random_uuid());
      r := r || jsonb_build_object('R5_otro_claim_misma_persona', x);
    exception when others then r := r || jsonb_build_object('R5_error', sqlerrm); end;
    r := r || jsonb_build_object('R_ordenes_finales', (select count(*) from orders where event_id = ev2));
  end;

  raise exception 'RESULTADO:%', r::text;
end $$;`;

try {
  await query(`${mig}\n${casos}`);
  console.log('el bloque no tiró: revisar');
  process.exit(1);
} catch (e) {
  // El mensaje llega con el JSON escapado y una línea CONTEXT de plpgsql detrás.
  const m = e.message.match(/RESULTADO:(\{.*\})\\nCONTEXT/s);
  if (!m) { console.log('FALLA', e.message.slice(0, 1200)); process.exit(1); }
  console.log(JSON.stringify(JSON.parse(JSON.parse(`"${m[1]}"`)), null, 1));
}
const quedo = await query(`select (select count(*) from pg_proc where proname = 'claim_free_order') funcion,
  (select count(*) from events where slug like 'ensayo-0064%') eventos, (select count(*) from information_schema.columns where table_name='orders' and column_name='claim_id') columna,
  (select count(*) from orders where buyer_email like 'e2e-ensayo-%' or buyer_email = 'e2e-x@test.local' or buyer_email like 'e2e-ensayo-%') ordenes`);
console.log('persistió algo?', JSON.stringify(quedo));
