-- =============================================================
-- 0017 · Password auth support: rate-limit + stronger door codes
-- =============================================================
-- Adds brute-force protection for password login and door-code redemption,
-- and upgrades door codes from 6 digits to 8 unambiguous alphanumerics via a
-- CSPRNG (pgcrypto gen_random_bytes). Password auth itself is plain Supabase
-- email+password (already enabled) set by admins via updateUserById; no schema
-- needed for that. Super admin keeps magic link (untouched).
--
-- Lockdown (0014 lesson): all RPCs revoke EXECUTE from anon + authenticated.
-- Idempotent.
-- =============================================================

create extension if not exists pgcrypto;

-- ------- Rate-limit ledger -------
create table if not exists public.auth_attempts (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('login', 'redeem')),
  identifier  text,
  ip          text,
  ok          boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists auth_attempts_login_id_idx
  on public.auth_attempts (kind, identifier, created_at desc) where kind = 'login';
create index if not exists auth_attempts_ip_idx
  on public.auth_attempts (kind, ip, created_at desc);
alter table public.auth_attempts enable row level security; -- no policies → service_role only

-- Atomic: count recent fails (sliding window) AND record this attempt.
create or replace function public.check_and_record_auth_attempt(
  p_kind text, p_identifier text, p_ip text,
  p_max_per_id int default 5, p_max_per_ip int default 5, p_window_minutes int default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(mins => greatest(p_window_minutes, 1));
  v_id_fails int := 0;
  v_ip_fails int := 0;
begin
  if p_kind = 'login' and p_identifier is not null then
    select count(*) into v_id_fails from public.auth_attempts
      where kind = p_kind and identifier = lower(p_identifier) and ok = false and created_at > v_since;
  end if;
  select count(*) into v_ip_fails from public.auth_attempts
    where kind = p_kind and ip = p_ip and ok = false and created_at > v_since;

  insert into public.auth_attempts (kind, identifier, ip, ok)
  values (p_kind, lower(p_identifier), p_ip, false);

  return jsonb_build_object(
    'blocked', (v_id_fails >= p_max_per_id) or (v_ip_fails >= greatest(p_max_per_ip, 1)),
    'id_fails', v_id_fails, 'ip_fails', v_ip_fails);
end;
$$;

create or replace function public.clear_auth_attempts(p_kind text, p_identifier text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.auth_attempts
  where kind = p_kind and identifier = lower(p_identifier) and created_at > now() - interval '1 day';
$$;

-- ------- Stronger door code generator (8 alphanumeric, CSPRNG) -------
create or replace function public.generate_validator_code(
  p_brand_id      uuid,
  p_user_id       uuid,
  p_device_label  text,
  p_created_by    uuid,
  p_ttl_minutes   int default 720,
  p_max_uses      int default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- 33, no I/L/O
  v_code text;
  v_bytes bytea;
  v_try  int := 0;
  i int;
begin
  loop
    v_bytes := gen_random_bytes(8);
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i - 1) % length(v_alphabet)), 1);
    end loop;
    -- Globally unique among currently-active codes → unambiguous redemption.
    if not exists (
      select 1 from public.validator_codes
      where code = v_code and expires_at > now() and use_count < max_uses
    ) then
      begin
        insert into public.validator_codes
          (brand_id, user_id, code, device_label, created_by, expires_at, max_uses)
        values
          (p_brand_id, p_user_id, v_code, p_device_label, p_created_by,
           now() + make_interval(mins => greatest(p_ttl_minutes, 1)), greatest(p_max_uses, 1));
        return jsonb_build_object('ok', true, 'code', v_code);
      exception when unique_violation then
        null; -- (brand_id, code) collided with an old row → retry
      end;
    end if;
    v_try := v_try + 1;
    if v_try > 25 then raise exception 'CODE_SPACE_EXHAUSTED'; end if;
  end loop;
end;
$$;

-- ------- Lockdown (explicit anon + authenticated revoke) -------
revoke execute on function public.check_and_record_auth_attempt(text, text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.check_and_record_auth_attempt(text, text, text, int, int, int) to service_role;
revoke execute on function public.clear_auth_attempts(text, text) from public, anon, authenticated;
grant execute on function public.clear_auth_attempts(text, text) to service_role;
revoke execute on function public.generate_validator_code(uuid, uuid, text, uuid, int, int) from public, anon, authenticated;
grant execute on function public.generate_validator_code(uuid, uuid, text, uuid, int, int) to service_role;
