-- =============================================================
-- 0029 — remove_brand_admin: quitar un admin de una marca, ATÓMICO
-- =============================================================
-- Quita el rol brand_admin de un usuario en una marca, con la GUARDA CRÍTICA de
-- NUNCA dejar la marca sin admin. La guarda es atómica: bloquea las filas de
-- admin de la marca (FOR UPDATE) y recuenta dentro de la misma transacción, así
-- dos quitados concurrentes de los 2 admins de una marca no pueden dejarla en 0
-- (uno gana, el otro ve count=1 y se rechaza con LAST_ADMIN).
--
-- Solo quita la MEMBRESÍA (brand_members); no borra el usuario de auth (puede
-- pertenecer a otras marcas o ser reasignado). service_role-only (lección 0014).
--
-- NO toca: emisión, validate_ticket, settle, apply_promo, saldo, max_scans, RLS
-- base de tickets/orders, archived_at. Solo brand_members. Idempotente.
-- =============================================================

create or replace function public.remove_brand_admin(
  p_brand_id uuid,
  p_user_id  uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admins int;
  v_target boolean;
begin
  -- Lock de TODAS las filas brand_admin de la marca (no se puede FOR UPDATE con
  -- count(); por eso lockeamos primero las filas y después contamos).
  perform 1 from public.brand_members
   where brand_id = p_brand_id and role = 'brand_admin'
   for update;

  select count(*) into v_admins from public.brand_members
   where brand_id = p_brand_id and role = 'brand_admin';

  select exists (
    select 1 from public.brand_members
    where brand_id = p_brand_id and user_id = p_user_id and role = 'brand_admin'
  ) into v_target;

  if not v_target then
    return jsonb_build_object('ok', false, 'reason', 'NOT_ADMIN');
  end if;
  if v_admins <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'LAST_ADMIN');
  end if;

  delete from public.brand_members
   where brand_id = p_brand_id and user_id = p_user_id and role = 'brand_admin';

  return jsonb_build_object('ok', true, 'remaining', v_admins - 1);
end $$;

-- Lockdown (lección 0014): solo service_role (la server action) ejecuta.
revoke execute on function public.remove_brand_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_brand_admin(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
