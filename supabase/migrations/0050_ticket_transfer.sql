-- =============================================================
-- 0050 — Transferir / regalar entrada (reasigna + reemite QR)
-- =============================================================
-- El dueño de una entrada (posesión del link /t/<qr>) la transfiere a otra
-- persona: se le pone el nombre del nuevo dueño y se REEMITE el QR (nuevo
-- qr_code en la MISMA fila) → el link viejo deja de funcionar al instante y el
-- nuevo se manda por email al nuevo dueño. NO crea ni borra tickets, no toca
-- aforo (sold) ni dinero. Opt-in por evento (events.allow_transfer, default false).
--
-- Guardas (atómicas, bajo lock de la fila): el evento debe permitir transferir,
-- la entrada NO puede estar ya validada (escaneada en puerta) ni invalidada.
-- Rate-limit por entrada + IP (clon del de reenvío) para que no se abuse.
--
-- Todo service_role-only (lockdown 0014).
-- =============================================================

-- 1) Toggle opt-in por evento.
alter table public.events add column if not exists allow_transfer boolean not null default false;

-- 2) Rate-limit de transferencias (mismo patrón que ticket_resend_attempts).
create table if not exists public.ticket_transfer_attempts (
  id         uuid primary key default uuid_generate_v4(),
  ticket_key text not null,            -- el qr_code de origen (string)
  ip         text,
  created_at timestamptz not null default now()
);
create index if not exists ticket_transfer_attempts_key_idx on public.ticket_transfer_attempts (ticket_key, created_at);
create index if not exists ticket_transfer_attempts_ip_idx  on public.ticket_transfer_attempts (ip, created_at);
alter table public.ticket_transfer_attempts enable row level security; -- sin policies → solo service_role

create or replace function public.register_ticket_transfer_attempt(
  p_key text,
  p_ip text,
  p_max_key int default 3,
  p_max_ip int default 10,
  p_window_secs int default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key   text := btrim(coalesce(p_key, ''));
  v_ip    text := nullif(btrim(coalesce(p_ip, '')), '');
  v_since timestamptz := now() - make_interval(secs => greatest(60, p_window_secs));
  v_key_n int;
  v_ip_n  int := 0;
  v_allowed boolean;
begin
  if v_key = '' then return false; end if;
  -- Serializa por clave → sin carrera TOCTOU en ráfagas concurrentes.
  perform pg_advisory_xact_lock(hashtext('tta:' || v_key));
  select count(*) into v_key_n from public.ticket_transfer_attempts where ticket_key = v_key and created_at >= v_since;
  if v_ip is not null then
    select count(*) into v_ip_n from public.ticket_transfer_attempts where ip = v_ip and created_at >= v_since;
  end if;
  v_allowed := v_key_n < greatest(1, p_max_key) and v_ip_n < greatest(1, p_max_ip);
  insert into public.ticket_transfer_attempts (ticket_key, ip) values (v_key, v_ip);
  return v_allowed;
end;
$$;

revoke execute on function public.register_ticket_transfer_attempt(text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.register_ticket_transfer_attempt(text, text, int, int, int) to service_role;

-- 3) Transferir: reasigna nombre + reemite qr_code, atómico y guardado.
create or replace function public.transfer_ticket(p_qr_code uuid, p_new_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_allow  boolean;
  v_starts timestamptz;
  v_new_qr uuid := gen_random_uuid();
  v_name   text := nullif(btrim(coalesce(p_new_name, '')), '');
begin
  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'no_name');
  end if;
  -- Lock de la fila: serializa transferencias concurrentes de la MISMA entrada.
  select * into v_ticket from public.tickets where qr_code = p_qr_code for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_ticket.invalidated_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'invalidated');
  end if;
  if v_ticket.validated_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  select allow_transfer, starts_at into v_allow, v_starts from public.events where id = v_ticket.event_id;
  if not coalesce(v_allow, false) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  -- No transferir una vez iniciado el evento: el validador de puerta puede estar
  -- OFFLINE con un snapshot viejo y admitir el qr anterior. Cerrar reemisiones
  -- al arrancar el evento elimina esa ventana.
  if v_starts is not null and v_starts <= now() then
    return jsonb_build_object('ok', false, 'reason', 'event_started');
  end if;

  update public.tickets
     set qr_code = v_new_qr, attendee_name = left(v_name, 120)
   where id = v_ticket.id;

  insert into public.events_log (brand_id, event_id, order_id, ticket_id, type, payload)
  values (v_ticket.brand_id, v_ticket.event_id, v_ticket.order_id, v_ticket.id, 'ticket_transferred',
          jsonb_build_object('ticket_number', v_ticket.ticket_number));

  return jsonb_build_object('ok', true, 'new_qr', v_new_qr,
    'order_id', v_ticket.order_id, 'brand_id', v_ticket.brand_id, 'event_id', v_ticket.event_id,
    'ticket_number', v_ticket.ticket_number);
end;
$$;

revoke execute on function public.transfer_ticket(uuid, text) from public, anon, authenticated;
grant execute on function public.transfer_ticket(uuid, text) to service_role;

notify pgrst, 'reload schema';
