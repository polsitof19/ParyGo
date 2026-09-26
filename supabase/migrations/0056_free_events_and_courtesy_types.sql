-- =============================================================
-- 0056 — Eventos gratis explícitos + tipos de cortesía explícitos.
-- =============================================================
-- El problema que cierra: hoy "precio 0" significa DOS cosas distintas y el
-- sistema no puede distinguirlas.
--
--   a) Una CORTESÍA de un evento pago (la lista de invitados). No se ofrece al
--      público: si se ofreciera, cualquiera se lleva entradas gratis de un
--      evento que se está vendiendo.
--   b) Una entrada de un evento GRATIS de verdad (entrada libre con registro).
--      Acá sí tiene que poder comprarse — es el punto del evento.
--
-- Como no había forma de distinguirlas, en la Fase 2 del E2E se tomó la única
-- decisión segura posible: los tipos S/0 NUNCA se ofrecen al público, ni
-- siquiera en un evento "gratis". Eso dejó los eventos gratis sin camino.
--
-- Ahora la intención es explícita:
--   events.is_free         → este evento es de entrada gratuita.
--   ticket_types.is_courtesy → este tipo es lista de invitados, nunca público.
--
-- REGLA QUE APLICA EL CÓDIGO (no el schema, para no romper nada desplegado):
--   público = precio > 0  OR  (evento.is_free AND NOT tipo.is_courtesy)
-- O sea: un tipo S/0 de un evento PAGO sigue oculto, exactamente como hoy.
--
-- ---------------------------------------------------------------
-- BACKFILL, y por qué es el conservador
-- ---------------------------------------------------------------
-- is_courtesy arranca en true para TODO tipo con price_cents = 0 que ya existe.
-- Así el comportamiento visible queda idéntico al de hoy (esos tipos siguen
-- fuera del público) y ningún evento pago se vuelve gratis por accidente.
-- is_free arranca en false para todos: ningún evento cambia de naturaleza sin
-- que alguien lo marque a mano.
--
-- Es two-phase: esta migración es INERTE. Agrega columnas con default igual al
-- comportamiento actual; el flujo de emisión gratis llega en el deploy del
-- código, después.
-- =============================================================

alter table public.events
  add column if not exists is_free boolean not null default false;

alter table public.ticket_types
  add column if not exists is_courtesy boolean not null default false;

comment on column public.events.is_free is
  'Evento de entrada gratuita: sus tipos S/0 NO cortesía sí se ofrecen al público.';
comment on column public.ticket_types.is_courtesy is
  'Lista de invitados: se emite solo por el flujo de cortesías, nunca se ofrece al público.';

-- Backfill conservador: lo que hoy está en 0 es, por definición, lo que hoy
-- está oculto. Se marca como cortesía para que siga estándolo.
-- Idempotente: la segunda corrida no encuentra filas que cambiar.
update public.ticket_types
   set is_courtesy = true
 where price_cents = 0
   and is_courtesy = false;

-- Un tipo de cortesía con precio no tiene sentido: o es regalo o se cobra.
-- Se valida acá y no en el código para que no dependa de qué versión está
-- desplegada.
alter table public.ticket_types drop constraint if exists ticket_types_courtesy_is_free_check;
alter table public.ticket_types add constraint ticket_types_courtesy_is_free_check
  check (not is_courtesy or price_cents = 0);

-- Índice parcial: la página pública filtra por evento descartando cortesías.
-- Parcial y no completo porque las cortesías son la minoría y son justo las
-- que se excluyen.
create index if not exists ticket_types_public_idx
  on public.ticket_types (event_id, sort_order)
  where is_courtesy = false;
