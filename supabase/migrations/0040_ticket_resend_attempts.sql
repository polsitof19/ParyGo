-- =============================================================
-- 0040 — Rate-limit del reenvío self-service de entradas (TANDA 2, Grupo C)
-- =============================================================
-- Registra cada intento del flujo "reenviá mi entrada" (comprador pone su email
-- → se le reenvían SUS QR al email REGISTRADO). Sirve para acotar:
--   · por email: que no se use como oráculo ni para spamear una casilla ajena.
--   · por IP: que no se barra una lista de emails.
-- NO guarda PII más allá del email tipeado + IP (mismo dato que el comprador ya
-- ingresa). RLS ON + 0 policies = solo service_role (el server action). El reenvío
-- en sí reusa sendTicketEmail (idempotente) y SIEMPRE manda al buyer_email de la
-- orden, nunca a un destino libre. Additiva, no toca nada existente.
-- =============================================================

create table if not exists public.ticket_resend_attempts (
  id         uuid primary key default uuid_generate_v4(),
  email      text not null,
  ip         text,
  brand_id   uuid references public.brands(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Índices para el conteo por ventana (email / ip en la última hora).
create index if not exists ticket_resend_attempts_email_idx on public.ticket_resend_attempts (email, created_at);
create index if not exists ticket_resend_attempts_ip_idx    on public.ticket_resend_attempts (ip, created_at);

alter table public.ticket_resend_attempts enable row level security;
-- Sin policies a propósito: RLS ON + 0 policies = deny por defecto. Solo
-- service_role (que bypassa RLS) accede, vía el server action.

notify pgrst, 'reload schema';
