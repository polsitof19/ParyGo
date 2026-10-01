-- 0081 — Ajustes del security review del bloque Cuentas (2026-10-01).
-- =============================================================
-- M3: brands deja de aceptar escrituras con JWT (como 0078 con eventos y
--     tipos): toda escritura de la app va por service role (verificado:
--     altaMarca, settings, cabina, empezar). Así nadie puede tocar
--     brands.alta_usuario (quién reclama un alta pagada) aunque mañana se
--     agregue una policy de update para el organizador. Leer no cambia.
-- M4: la limpieza de pruebas abandonadas libera a la dueña.
-- =============================================================

revoke insert, update, delete on public.brands from anon, authenticated;
drop policy if exists brands_write_super on public.brands;

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

  -- La dueña de una prueba archivada queda LIBRE (se borra su membresía de esa
  -- marca vacía): si no, "una persona = una marca" la dejaba sin poder volver
  -- a empezar (security review 2026-10-01, M4).
  with arch as (
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
     and not exists (select 1 from public.pack_purchases p where p.brand_id = b.id and p.status = 'paid')
  returning b.id
  ), libres as (
    delete from public.brand_members m using arch where m.brand_id = arch.id returning m.brand_id
  )
  select count(*) into v_pruebas from arch;

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
