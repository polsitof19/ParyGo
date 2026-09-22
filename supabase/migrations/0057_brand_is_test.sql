-- =============================================================
-- 0057 — brands.is_test: marcas de prueba fuera de los números del super admin.
-- =============================================================
-- Lo que se está arreglando, medido en producción (2026-09-22):
--
--   marca         eventos  órdenes pagas   cobrado    yape pendientes
--   demotest        51        125          S/ 11.528        8
--   hoesky           3          3          S/    280        1
--   koko             1          1          S/     60        1
--   ensayo-paul      2          1          S/     60        1
--   code             1          0          S/      0        1
--
-- O sea: el 97% de lo "cobrado" que ve el super admin son corridas del E2E.
-- Los números que Paul mira para decidir no son sus números.
--
-- Se marcan demotest, ensayo-paul y koko. Decisión explícita de Paul.
--
-- Sobre koko, para que quede dicho: NO es una marca vacía. Tiene 1 orden paga
-- de S/60 (2026-09-20) y un evento publicado para el 29-oct. Al marcarla, esa
-- venta y ese evento dejan de contarse en los números del super admin. Paul lo
-- confirmó sabiéndolo: koko es suya, para probar. Si algún día pasa a ser un
-- cliente de verdad, hay que desmarcarla o sus ventas no aparecen.
--
-- Por qué una columna y no una lista de slugs en el código: el código de los
-- contadores vive en tres lugares (home del super, salud, badge del topbar) y
-- una lista hardcodeada se desincroniza sola. Además así el día que Paul cree
-- otra marca de prueba la marca desde el panel y listo.
--
-- Two-phase: INERTE. La columna existe con default false; los contadores la
-- empiezan a usar en el deploy del código.
-- =============================================================

alter table public.brands
  add column if not exists is_test boolean not null default false;

comment on column public.brands.is_test is
  'Marca de prueba: se excluye de los contadores del super admin. No afecta su funcionamiento.';

-- Idempotente: la segunda corrida no encuentra filas que cambiar.
update public.brands
   set is_test = true
 where slug in ('demotest', 'ensayo-paul', 'koko')
   and is_test = false;

-- Los contadores del super admin recorren orders filtrando por marca no-test.
-- Sin esto, cada contador hace un seq scan sobre orders para descartar el 97%.
create index if not exists brands_is_test_idx on public.brands (is_test) where is_test = false;

-- "Yape por revisar" cuenta órdenes pendientes CON comprobante subido. Las que
-- no tienen comprobante son checkouts abandonados: el comprador llegó a la
-- pantalla de Yape y nunca subió nada. No hay nada que revisar ahí, y hoy
-- inflan el número (6 de los 12 pendientes de producción son de esos).
create index if not exists orders_yape_review_idx
  on public.orders (brand_id)
  where status = 'pending_yape_review' and yape_proof_id is not null;
