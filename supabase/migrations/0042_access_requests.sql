-- =============================================================
-- 0042 — Cola de SOLICITUDES de acceso de organizadores (TANDA 3, Grupo C)
-- =============================================================
-- Un organizador interesado llena un form PÚBLICO → se crea una SOLICITUD acá.
-- El form NUNCA crea la marca ni asigna saldo: solo encola. Paul (super admin)
-- revisa la cola y, al aprobar, reusa el alta existente (createBrandWithOwnerAction).
--
-- ANTI-ABUSO: submit_access_request hace rate-limit ATÓMICO (advisory lock por
-- email) por email y por IP en una ventana, igual patrón que la migr 0041. Sobre
-- el límite NO inserta (no llena la tabla) y el server action responde neutro.
--
-- PII: guarda nombre/email/teléfono que el propio solicitante ingresa + IP. RLS
-- ON + 0 policies = solo service_role (el server action público inserta vía RPC;
-- el super admin lee/gestiona vía admin client). NUNCA crea marca ni toca saldo.
-- =============================================================

create table if not exists public.access_requests (
  id            uuid primary key default uuid_generate_v4(),
  brand_name    text not null,
  contact_name  text not null,
  contact_email text not null,
  contact_phone text,
  event_info    text,
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  ip            text,
  brand_id      uuid references public.brands(id) on delete set null, -- se setea al aprobar
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists access_requests_status_idx on public.access_requests (status, created_at desc);
create index if not exists access_requests_email_idx on public.access_requests (contact_email, created_at);
create index if not exists access_requests_ip_idx on public.access_requests (ip, created_at);

alter table public.access_requests enable row level security;
-- Sin policies: RLS ON + 0 policies = deny por defecto. Solo service_role.

-- -------------------------------------------------------------
-- submit_access_request — inserta una solicitud con rate-limit ATÓMICO.
-- Devuelve true si la encoló, false si superó el límite (el caller responde
-- neutro igual, sin revelar el bloqueo). Advisory lock por email evita TOCTOU.
-- -------------------------------------------------------------
create or replace function public.submit_access_request(
  p_brand_name   text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_event_info   text,
  p_ip           text,
  p_max_email    int default 3,
  p_max_ip       int default 8,
  p_window_secs  int default 86400
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_contact_email));
  v_ip    text := nullif(btrim(coalesce(p_ip, '')), '');
  v_since timestamptz := now() - make_interval(secs => greatest(60, p_window_secs));
  v_email_n int;
  v_ip_n  int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('areq:' || v_email));

  select count(*) into v_email_n from public.access_requests
   where contact_email = v_email and created_at >= v_since;
  if v_ip is not null then
    select count(*) into v_ip_n from public.access_requests
     where ip = v_ip and created_at >= v_since;
  end if;

  -- Sobre el límite: NO insertar (no llenar la tabla de basura). Devolver false.
  if v_email_n >= greatest(1, p_max_email) or v_ip_n >= greatest(1, p_max_ip) then
    return false;
  end if;

  insert into public.access_requests (brand_name, contact_name, contact_email, contact_phone, event_info, ip)
    values (
      left(btrim(p_brand_name), 120),
      left(btrim(p_contact_name), 120),
      v_email,
      nullif(left(btrim(coalesce(p_contact_phone, '')), 40), ''),
      nullif(left(btrim(coalesce(p_event_info, '')), 1000), ''),
      v_ip
    );
  return true;
end;
$$;

-- Lockdown 0014: revoke explícito anon Y authenticated; solo service_role.
revoke execute on function public.submit_access_request(text, text, text, text, text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.submit_access_request(text, text, text, text, text, text, int, int, int) to service_role;

notify pgrst, 'reload schema';
