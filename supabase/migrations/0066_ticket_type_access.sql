-- 0066 — ENTRADAS PRIVADAS CON LINK (2026-09-23, pedido de Paul)
--
-- Un tipo de entrada puede ser PRIVADO: no se ofrece en la página pública y
-- solo se puede reclamar/comprar entrando con su link (…/<evento>?acceso=TOKEN),
-- p. ej. "Cortesías Dybala" para los clientes de un promotor.
--
-- El token vive en una tabla APARTE y cerrada, no como columna de
-- ticket_types: esa tabla se lee por la API pública (policy
-- ticket_types_read_public, 0001) y un grant de tabla expone TODAS sus
-- columnas; un token ahí se podría leer con la anon key. Acá solo entra el
-- service role (el server de la app), que valida el token antes de reservar y
-- antes de emitir. Lección 0014: revoke explícito de anon Y authenticated.
--
-- Privado = existe una fila para ese tipo. Cambiar el link = otro token.
-- Idempotente.

create table if not exists public.ticket_type_access (
  ticket_type_id uuid primary key references public.ticket_types(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  constraint ticket_type_access_token_format check (token ~ '^[A-Z0-9]{8,32}$')
);

create unique index if not exists ticket_type_access_token_uq on public.ticket_type_access (token);

alter table public.ticket_type_access enable row level security;
-- Sin policies: ningún rol con RLS la puede leer ni escribir.
revoke all on table public.ticket_type_access from public;
revoke all on table public.ticket_type_access from anon;
revoke all on table public.ticket_type_access from authenticated;
grant select, insert, update, delete on table public.ticket_type_access to service_role;
