-- 0078 — El panel es el único que escribe eventos, tipos, fases y códigos de puerta.
-- =============================================================
-- Regla de Paul (2026-09-30): lo vendido y las estadísticas no los mueve
-- nadie; el organizador edita su evento, sus entradas y sus precios SOLO
-- desde el panel, que valida (bloqueo de is_free con ventas, marcarAgotada,
-- fases, tope de la prueba, CSPRNG de los códigos de puerta).
-- Con la anon key + su JWT, el brand_admin podía hacer PATCH por PostgREST:
-- ticket_types.sold/reserved = 0 (sobreventa), precios y fases sin reglas,
-- events.is_free con ventas pagas o mover el evento a otra marca suya, e
-- insertar códigos de puerta elegidos a mano.
-- Verificado (2026-09-30): toda escritura de apps/web en estas tablas va por
-- createAdminClient o por RPC SECURITY DEFINER llamada con service role
-- (create_brand_event, create_brand_trial_event, generate/revoke_validator_code),
-- incluida la cabina. Leer sigue igual (las policies de SELECT no se tocan).
-- =============================================================

revoke insert, update, delete on public.events, public.ticket_types,
  public.ticket_type_price_phases, public.validator_codes from anon, authenticated;

drop policy if exists events_insert_super on public.events;
drop policy if exists events_update_brand on public.events;
drop policy if exists events_delete_super on public.events;
drop policy if exists ticket_types_write_brand on public.ticket_types;
drop policy if exists ttpp_write_brand on public.ticket_type_price_phases;
drop policy if exists validator_codes_write on public.validator_codes;
