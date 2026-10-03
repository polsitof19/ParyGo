-- 0079 — Avisos push al teléfono de Paul cuando se vende un paquete (2026-10-01).
-- =============================================================
-- Una fila por teléfono/navegador que activó "Avisos de ventas" en la cabina
-- (solo super admin: lo exige la server action). El aviso sale desde
-- avisarVentaPack, el mismo lugar que el correo "Nueva venta", que ya corre
-- UNA vez por compra acreditada.
-- Tabla SOLO service role: ni anon ni authenticated la leen ni la escriben
-- (el endpoint y las claves de una suscripción permiten mandarle avisos a
-- ese teléfono). Sin policies + revoke explícito (Supabase concede por
-- defecto a anon/authenticated: lección de la 0014).
-- =============================================================

create table if not exists public.push_suscripciones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  dispositivo text,
  created_at  timestamptz not null default now()
);

alter table public.push_suscripciones enable row level security;
revoke all on public.push_suscripciones from public, anon, authenticated;
