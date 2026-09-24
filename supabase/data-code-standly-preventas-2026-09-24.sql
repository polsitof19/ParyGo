-- Datos (no esquema), pedido del organizador 2026-09-24: la escalera del
-- flyer de "Standly en Cocos" (Code). Las dos preventas YA TERMINARON, así que
-- no cambian el precio que se cobra hoy (get_event_active_prices solo mira
-- fases cuya ventana contiene a now()); en la página salen tachadas con
-- "Agotada". La fase Base existente pasa a ser "Precio full" desde el 19/09.
-- Fechas en hora de Lima (UTC-5): el día N a las 00:00 = N 05:00Z.
-- Solo corre si cada tipo tiene todavía su única fase Base (idempotente).
do $$
declare
  v_general uuid := 'e689ec67-f2a5-4a0f-ad61-7bd2471c0bf6';
  v_vip     uuid := '05fefdb2-b067-46e5-b240-ca7dbd99fe88';
  n int;
begin
  select count(*) into n from public.ticket_type_price_phases where ticket_type_id in (v_general, v_vip);
  if n <> 2 then raise notice 'ya aplicado (% fases), no se toca', n; return; end if;

  update public.ticket_type_price_phases
     set sort_order = 2, name = 'Precio full', starts_at = '2026-09-19 05:00+00'
   where ticket_type_id in (v_general, v_vip) and sort_order = 0;

  insert into public.ticket_type_price_phases (ticket_type_id, name, price_cents, starts_at, ends_at, sort_order) values
    (v_general, 'Preventa 1', 3000, '2026-09-08 05:00+00', '2026-09-12 05:00+00', 0),
    (v_general, 'Preventa 2', 4000, '2026-09-12 05:00+00', '2026-09-19 05:00+00', 1),
    (v_vip,     'Preventa 1', 4000, '2026-09-08 05:00+00', '2026-09-12 05:00+00', 0),
    (v_vip,     'Preventa 2', 5000, '2026-09-12 05:00+00', '2026-09-19 05:00+00', 1);
end $$;
