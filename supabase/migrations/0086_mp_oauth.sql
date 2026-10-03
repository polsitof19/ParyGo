-- 0086 — Conectar Mercado Pago por OAuth (plan en AGENTS.md, 2026-10-03).
--
-- El organizador conecta SU cuenta de MP y la plata de sus entradas va directo
-- a ella. El access token y la public key siguen en mp_access_token_enc /
-- mp_public_key_enc (los lee get_brand_mp_credentials: el checkout no cambia);
-- se suman el refresh token cifrado, el id de la cuenta de MP y el vencimiento.
-- Cifrado con pgp_sym y la clave del server, igual que 0023/0034.
--
-- UNA cuenta de MP = UNA marca (índice único): si no, una marca podría conectar
-- la cuenta de otra y liquidar pagos ajenos con ese token.
-- Todas las RPCs son service-role-only (lección 0014: revoke literal).

alter table public.brands
  add column if not exists mp_oauth_user_id text,
  add column if not exists mp_oauth_refresh_enc bytea,
  add column if not exists mp_oauth_expires_at timestamptz,
  add column if not exists mp_conectado_at timestamptz;

create unique index if not exists brands_mp_oauth_user_id_key
  on public.brands (mp_oauth_user_id) where mp_oauth_user_id is not null;

-- Conectar (o reconectar). Devuelve ok / cuenta_en_otra_marca / marca_no_existe.
-- Limpia mp_webhook_secret_enc: con OAuth firma la app de ParyGo.
create or replace function public.set_brand_mp_oauth(
  p_brand_id uuid, p_access_token text, p_public_key text, p_refresh_token text,
  p_user_id text, p_expires_at timestamptz, p_encryption_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_access_token is null or p_public_key is null or p_refresh_token is null
     or p_user_id is null or p_expires_at is null or p_encryption_key is null then
    return jsonb_build_object('ok', false, 'action', 'datos_incompletos');
  end if;
  if exists (select 1 from public.brands where mp_oauth_user_id = p_user_id and id <> p_brand_id) then
    return jsonb_build_object('ok', false, 'action', 'cuenta_en_otra_marca');
  end if;
  update public.brands set
    mp_access_token_enc   = extensions.pgp_sym_encrypt(p_access_token, p_encryption_key),
    mp_public_key_enc     = extensions.pgp_sym_encrypt(p_public_key, p_encryption_key),
    mp_oauth_refresh_enc  = extensions.pgp_sym_encrypt(p_refresh_token, p_encryption_key),
    mp_oauth_user_id      = p_user_id,
    mp_oauth_expires_at   = p_expires_at,
    mp_conectado_at       = now(),
    mp_webhook_secret_enc = null
  where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'action', 'marca_no_existe');
  end if;
  return jsonb_build_object('ok', true, 'action', 'conectada');
exception when unique_violation then
  -- Carrera: otra marca conectó la misma cuenta entre el exists y el update.
  return jsonb_build_object('ok', false, 'action', 'cuenta_en_otra_marca');
end;
$function$;

-- Refresco: guarda el par nuevo SOLO si la marca sigue conectada a la MISMA
-- cuenta (si se desconectó o reconectó otra mientras tanto, no pisa nada).
create or replace function public.refresh_brand_mp_oauth(
  p_brand_id uuid, p_user_id text, p_access_token text, p_refresh_token text,
  p_expires_at timestamptz, p_encryption_key text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.brands set
    mp_access_token_enc  = extensions.pgp_sym_encrypt(p_access_token, p_encryption_key),
    mp_oauth_refresh_enc = extensions.pgp_sym_encrypt(p_refresh_token, p_encryption_key),
    mp_oauth_expires_at  = p_expires_at
  where id = p_brand_id and mp_oauth_user_id = p_user_id;
  return found;
end;
$function$;

-- Lectura para el server: token vigente, refresh, cuenta y vencimiento.
create or replace function public.get_brand_mp_oauth(p_brand_id uuid, p_encryption_key text)
returns table(access_token text, refresh_token text, user_id text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
    select extensions.pgp_sym_decrypt(mp_access_token_enc, p_encryption_key)::text,
           extensions.pgp_sym_decrypt(mp_oauth_refresh_enc, p_encryption_key)::text,
           mp_oauth_user_id,
           mp_oauth_expires_at
      from public.brands
     where id = p_brand_id and mp_oauth_user_id is not null;
end;
$function$;

-- Desconectar (organizador o refresh revocado): borra todo lo de MP.
create or replace function public.clear_brand_mp_oauth(p_brand_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.brands set
    mp_access_token_enc = null, mp_public_key_enc = null, mp_oauth_refresh_enc = null,
    mp_oauth_user_id = null, mp_oauth_expires_at = null, mp_conectado_at = null,
    mp_webhook_secret_enc = null
  where id = p_brand_id;
end;
$function$;

revoke execute on function public.set_brand_mp_oauth(uuid, text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.refresh_brand_mp_oauth(uuid, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.get_brand_mp_oauth(uuid, text) from public, anon, authenticated;
revoke execute on function public.clear_brand_mp_oauth(uuid) from public, anon, authenticated;
grant execute on function public.set_brand_mp_oauth(uuid, text, text, text, text, timestamptz, text) to service_role;
grant execute on function public.refresh_brand_mp_oauth(uuid, text, text, text, timestamptz, text) to service_role;
grant execute on function public.get_brand_mp_oauth(uuid, text) to service_role;
grant execute on function public.clear_brand_mp_oauth(uuid) to service_role;

-- Las columnas nuevas NO se exponen a anon/authenticated (brands expone columna
-- por columna desde 0023/0043/0052: sin grant, no se leen). El panel pregunta
-- "¿conectada?" por service role acotado a la marca de la sesión.
