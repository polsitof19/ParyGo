-- =============================================================
-- 0049 — Tracking de clics del link de promotor (?ref=CODIGO)
-- =============================================================
-- Cuando alguien abre la página del evento con ?ref=CODIGO, registramos un clic
-- atribuido a ese código de promotor. Sirve para medir la conversión por RR.PP.
-- (clics → entradas). SOLO se loguea si el código existe en el evento (no se
-- guarda basura). Dedupe por visitante (hash de IP) por día → "visitantes únicos"
-- en vez de inflar con refrescos. NO guarda IP cruda (privacidad): solo un hash.
--
-- La escritura la hace la página (server component) con el admin client vía un
-- RPC service_role-only — NO hay endpoint público de escritura abierto.
-- =============================================================

create table if not exists public.ref_clicks (
  id            uuid primary key default uuid_generate_v4(),
  event_id      uuid not null references public.events(id) on delete cascade,
  brand_id      uuid not null references public.brands(id) on delete cascade,
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  day           date not null default (now() at time zone 'America/Lima')::date,
  visitor_hash  text not null,
  created_at    timestamptz not null default now(),
  unique (promo_code_id, day, visitor_hash)
);
create index if not exists ref_clicks_event_idx on public.ref_clicks(event_id);
create index if not exists ref_clicks_code_idx on public.ref_clicks(promo_code_id);

-- RLS on, sin policies → solo service_role accede (igual que notification_jobs).
alter table public.ref_clicks enable row level security;

-- Registrar un clic. Idempotente por (código, día, visitante). Solo loguea si el
-- código existe en el evento; deriva brand_id del código (tenancy correcta).
create or replace function public.record_ref_click(
  p_event_id uuid,
  p_ref_code text,
  p_visitor_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.promo_codes%rowtype;
begin
  if p_ref_code is null or btrim(p_ref_code) = '' or p_visitor_hash is null or btrim(p_visitor_hash) = '' then
    return;
  end if;
  select * into v_code from public.promo_codes
   where event_id = p_event_id and upper(code) = upper(btrim(p_ref_code))
   limit 1;
  if not found then
    return; -- código inexistente → no se loguea
  end if;
  insert into public.ref_clicks (event_id, brand_id, promo_code_id, visitor_hash)
  values (p_event_id, v_code.brand_id, v_code.id, left(p_visitor_hash, 64))
  on conflict (promo_code_id, day, visitor_hash) do nothing;
end;
$$;

revoke execute on function public.record_ref_click(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_ref_click(uuid, text, text) to service_role;

-- Conteo agregado por código (para el panel de promotores) — evita traer filas.
create or replace function public.ref_click_counts(p_event_id uuid)
returns table (promo_code_id uuid, clicks bigint)
language sql
security definer
stable
set search_path = public
as $$
  select promo_code_id, count(*) as clicks
  from public.ref_clicks
  where event_id = p_event_id
  group by promo_code_id;
$$;

revoke execute on function public.ref_click_counts(uuid) from public, anon, authenticated;
grant execute on function public.ref_click_counts(uuid) to service_role;

notify pgrst, 'reload schema';
