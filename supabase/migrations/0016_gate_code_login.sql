-- =============================================================
-- 0016 · Gate code login — short codes for door staff
-- =============================================================
-- Door staff log into the scanner with a 6-digit code instead of email magic
-- links (bad signal / borrowed phones at the door). A brand_admin generates a
-- code for a "puesto" (Puerta 1); the code maps to an ephemeral validator user
-- of that brand. Redeeming the code opens a validator session.
--
-- Decision (deviates from a subdomain-scoped design): /puerta and /scan both
-- live on the app host, and the SSR auth cookie is per-host — a code redeemed
-- on a brand subdomain could not carry its session to /scan. So codes resolve
-- GLOBALLY among ACTIVE codes (the generator guarantees no two active codes
-- collide), and redemption needs only the code. Enumerability (1M) is bounded
-- by short expiry (default 12h), a handful of active codes, and revocability;
-- a leaked code only yields a validator session of one brand (auditable in
-- ticket_scans, revocable by regenerating).
--
-- Lockdown (0014 lesson): both RPCs revoke EXECUTE from anon + authenticated.
-- Idempotent.
-- =============================================================

alter table public.validator_codes
  add column if not exists device_label text,
  add column if not exists max_uses int not null default 1 check (max_uses >= 1),
  add column if not exists use_count int not null default 0 check (use_count >= 0),
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists validator_codes_active_idx
  on public.validator_codes (code)
  where use_count < max_uses;

-- ------- generate_validator_code (brand_admin via server action / service_role) -------
create or replace function public.generate_validator_code(
  p_brand_id      uuid,
  p_user_id       uuid,
  p_device_label  text,
  p_created_by    uuid,
  p_ttl_minutes   int default 720,
  p_max_uses      int default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_try  int := 0;
begin
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    -- Globally unique among currently-active codes → redemption is unambiguous.
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
        null; -- (brand_id, code) collided with an old/expired row → retry
      end;
    end if;
    v_try := v_try + 1;
    if v_try > 25 then
      raise exception 'CODE_SPACE_EXHAUSTED';
    end if;
  end loop;
end;
$$;

revoke execute on function public.generate_validator_code(uuid, uuid, text, uuid, int, int) from public, anon, authenticated;
grant execute on function public.generate_validator_code(uuid, uuid, text, uuid, int, int) to service_role;

-- ------- redeem_validator_code (anonymous redeemer; the code IS the credential) -------
create or replace function public.redeem_validator_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.validator_codes%rowtype;
begin
  select * into v_row
  from public.validator_codes
  where code = p_code and expires_at > now() and use_count < max_uses
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'INVALID');
  end if;

  update public.validator_codes
  set use_count = use_count + 1,
      used_at = coalesce(used_at, now())
  where id = v_row.id;

  return jsonb_build_object('ok', true,
    'user_id', v_row.user_id, 'brand_id', v_row.brand_id, 'device_label', v_row.device_label);
end;
$$;

revoke execute on function public.redeem_validator_code(text) from public, anon, authenticated;
grant execute on function public.redeem_validator_code(text) to service_role;

-- ------- revoke_validator_code (brand_admin via server action / service_role) -------
create or replace function public.revoke_validator_code(p_id uuid, p_brand_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  update public.validator_codes
  set expires_at = now()
  where id = p_id and brand_id = p_brand_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke execute on function public.revoke_validator_code(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_validator_code(uuid, uuid) to service_role;
