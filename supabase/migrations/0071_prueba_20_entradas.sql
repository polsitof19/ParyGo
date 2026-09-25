-- =============================================================
-- 0071 · La prueba gratis baja de 50 a 20 entradas
-- =============================================================
-- Pedido de Paul (2026-09-25). La prueba pasa a ser AUTOSERVICIO desde
-- app.parygo.com/empezar (sin aprobación del super admin, solo con código de
-- verificación al correo): con un tope más bajo, abusarla no rinde.
--
-- Solo cambia la constante de una sola fuente que ya leen el trigger de tope
-- y create_brand_trial_event (0069). Los eventos de prueba que ya existen no
-- se tocan: el trigger corre solo al cambiar capacity/is_unlimited/event_id.
-- (Hoy hay uno solo, de demotest, archivado.)
-- =============================================================
create or replace function public.prueba_tope_entradas()
returns int language sql immutable as $$ select 20 $$;
