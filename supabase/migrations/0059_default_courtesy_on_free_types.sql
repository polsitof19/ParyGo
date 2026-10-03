-- =============================================================
-- 0059 — Un tipo S/0 de un evento PAGO nace como cortesía.
-- =============================================================
-- Hueco que dejó la 0056 y que encontró el test de las features nuevas:
-- el backfill marcó los tipos S/0 que YA existían, pero los que se crean
-- DESPUÉS nacen con is_courtesy = false. Verificado en producción: dos tipos
-- llamados "Cortesía", creados por una corrida del E2E posterior a la 0056,
-- quedaron sin marcar.
--
-- Hoy eso NO se ve: un tipo S/0 de un evento pago queda oculto igual, porque
-- la regla del código es `precio > 0 OR (evento.is_free AND NOT cortesía)` y
-- un evento pago falla la segunda condición. Pero el dato queda mintiendo, y
-- el día que alguien marque ese evento como gratis, un tipo que se llama
-- "Cortesía" pasaría a ofrecerse al público. Es una trampa con fecha.
--
-- Por qué un TRIGGER y no arreglarlo en el código: los tipos se crean por tres
-- caminos distintos —el builder del organizador (que inserta vía RPC, o sea
-- SQL), el editor del super admin y el editor del organizador (TypeScript)—
-- más los inserts directos del E2E. Un default que vive en tres lugares se
-- desincroniza; en la base, no.
--
-- La regla es deliberadamente conservadora y NO pisa una decisión explícita:
--   - precio 0 + evento NO gratis  → cortesía (no hay otra cosa que pueda ser).
--   - precio 0 + evento gratis     → se respeta lo que venga. En un evento
--                                    gratis, "S/0" es el precio normal, así que
--                                    quien crea el tipo decide si además es
--                                    lista de invitados.
--   - precio > 0                   → no se toca (y el constraint de la 0056 ya
--                                    impide que sea cortesía).
--
-- Se dispara en INSERT y en UPDATE del precio: bajar un tipo a 0 en un evento
-- pago es lo mismo que crearlo en 0.
-- =============================================================

create or replace function public.tt_default_courtesy()
returns trigger
language plpgsql
as $$
declare
  evento_gratis boolean;
begin
  -- Solo interesa el caso "vale 0 y no está marcado".
  if new.price_cents <> 0 or new.is_courtesy then
    return new;
  end if;

  select e.is_free into evento_gratis from public.events e where e.id = new.event_id;

  -- Evento pago (o evento que no existe todavía / no se pudo leer): cortesía.
  -- Fail-closed a propósito: ante la duda, NO se ofrece al público.
  if evento_gratis is distinct from true then
    new.is_courtesy := true;
  end if;

  return new;
end;
$$;

drop trigger if exists tt_default_courtesy_trg on public.ticket_types;
create trigger tt_default_courtesy_trg
  before insert or update of price_cents, is_courtesy, event_id
  on public.ticket_types
  for each row
  execute function public.tt_default_courtesy();

-- Y se corrige lo que ya quedó mal desde la 0056 (los dos tipos del E2E).
-- Mismo criterio que el trigger: solo los de eventos NO gratis.
update public.ticket_types tt
   set is_courtesy = true
  from public.events e
 where e.id = tt.event_id
   and tt.price_cents = 0
   and tt.is_courtesy = false
   and e.is_free is distinct from true;
