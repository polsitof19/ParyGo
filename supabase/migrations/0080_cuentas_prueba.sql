-- 0080 — Bloque "Cuentas" (2026-10-01): prueba de 10 entradas, dueña
-- prevista de la marca, candados del alta y limpieza de pruebas abandonadas.
-- Plan y revisión adversarial: AGENTS.md.
-- =============================================================

-- 1) La prueba gratis vuelve con tope de 10 entradas (antes 20, 0071).
--    lib/prueba.ts PRUEBA_TOPE_ENTRADAS tiene que decir lo mismo.
create or replace function public.prueba_tope_entradas()
returns integer language sql immutable as $$ select 10 $$;

-- 2) Quién verificó el correo del alta. La marca de un paquete nace SIN dueña
--    (la limpieza 0072 y /empezar/listo se apoyan en eso y en
--    pack_purchases.created_by = null): esta columna dice quién puede
--    reclamarla al volver del pago, aunque vuelva en otro navegador (inicia
--    sesión y listo). No se expone a anon/authenticated (las columnas de
--    brands se conceden una por una: 0023/0043/0052; esta no).
alter table public.brands
  add column if not exists alta_usuario uuid references auth.users(id) on delete set null;

-- 3) Candados del alta: una fila por clave con su vencimiento. tomar_candado
--    gana UNA sola llamada por ventana aunque lleguen dos a la vez (upsert
--    atómico). Lo usan: enviar/reenviar el código (no dos generateLink del
--    mismo correo a la vez ni seguidos), pagar (no dos compras de la misma
--    marca por doble clic o dos pestañas) y crear la prueba.
create table if not exists public.candados_alta (
  clave text primary key,
  hasta timestamptz not null
);
alter table public.candados_alta enable row level security;
revoke all on public.candados_alta from public, anon, authenticated;

create or replace function public.tomar_candado(p_clave text, p_segundos integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  if p_clave is null or length(p_clave) = 0 or length(p_clave) > 300 or p_segundos is null or p_segundos < 1 or p_segundos > 86400 then
    return false;
  end if;
  insert into public.candados_alta as c (clave, hasta)
  values (p_clave, now() + make_interval(secs => p_segundos))
  on conflict (clave) do update
    set hasta = excluded.hasta
    where c.hasta <= now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;
revoke all on function public.tomar_candado(text, integer) from public, anon, authenticated;
grant execute on function public.tomar_candado(text, integer) to service_role;

-- 4) Limpieza diaria: además de lo de 0072, archiva las PRUEBAS abandonadas
--    (30 días sin ningún evento) y les libera el link. Nunca toca una marca con
--    eventos, órdenes o una compra pagada, ni las de prueba del E2E (is_test).
create or replace function public.limpiar_altas_abandonadas()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_marcas int;
  v_compras int;
  v_usuarios int;
  v_intentos int;
  v_pruebas int;
  v_candados int;
begin
  create temp table _marcas on commit drop as
  select b.id
  from public.brands b
  where not exists (select 1 from public.brand_members m where m.brand_id = b.id)
    and not exists (select 1 from public.events e where e.brand_id = b.id)
    and not exists (select 1 from public.orders o where o.brand_id = b.id)
    and exists (select 1 from public.pack_purchases p where p.brand_id = b.id and p.created_by is null)
    and (b.is_test or not exists (select 1 from public.pack_purchases p where p.brand_id = b.id and p.status = 'paid'))
    and b.created_at < now() - case when b.is_test then interval '1 hour' else interval '7 days' end
    and not exists (
      select 1 from public.pack_purchases p
      where p.brand_id = b.id
        and p.created_at > now() - case when b.is_test then interval '1 hour' else interval '7 days' end
    )
  ;

  delete from public.pack_purchases where brand_id in (select id from _marcas);
  get diagnostics v_compras = row_count;
  delete from public.brands where id in (select id from _marcas);
  get diagnostics v_marcas = row_count;

  delete from auth.users u
  where u.email_confirmed_at is null
    and u.created_at < now() - interval '7 days'
    and not exists (select 1 from public.brand_members m where m.user_id = u.id)
    and not exists (select 1 from public.user_profiles p where p.user_id = u.id and p.is_super_admin)
    and not exists (select 1 from public.tickets t where t.validated_by = u.id)
    and not exists (select 1 from public.yape_proofs y where y.reviewed_by = u.id);
  get diagnostics v_usuarios = row_count;

  update public.brands b
     set archived_at = now(),
         prueba_disponible = false,
         slug = 'prueba-vencida-' || left(b.id::text, 13)
   where b.prueba_disponible
     and b.archived_at is null
     and not b.is_test
     and b.created_at < now() - interval '30 days'
     and not exists (select 1 from public.events e where e.brand_id = b.id)
     and not exists (select 1 from public.orders o where o.brand_id = b.id)
     and not exists (select 1 from public.pack_purchases p where p.brand_id = b.id and p.status = 'paid');
  get diagnostics v_pruebas = row_count;

  delete from public.ticket_resend_attempts where created_at < now() - interval '2 days';
  get diagnostics v_intentos = row_count;
  delete from public.candados_alta where hasta < now() - interval '1 day';
  get diagnostics v_candados = row_count;

  return jsonb_build_object('marcas', v_marcas, 'compras', v_compras, 'usuarios', v_usuarios,
                            'intentos', v_intentos, 'pruebas_archivadas', v_pruebas, 'candados', v_candados);
end;
$$;
revoke all on function public.limpiar_altas_abandonadas() from public, anon, authenticated;
grant execute on function public.limpiar_altas_abandonadas() to service_role;
