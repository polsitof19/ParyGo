-- =============================================================
-- 0071 · La prueba gratis baja de 50 a 20 entradas
-- =============================================================
-- Pedido de Paul (2026-09-25). La prueba pasa a ser AUTOSERVICIO desde
-- app.parygo.com/empezar (sin aprobación del super admin, solo con código de
-- verificación al correo): con un tope más bajo, abusarla no rinde.
--
-- Solo cambia la constante de una sola fuente que ya leen el trigger de tope
-- y create_brand_trial_event (0069). Los eventos de prueba que ya existen no
-- se tocan: el trigger corre solo al cambiar capacity/is_unlimited/event_id.
-- (Hoy hay uno solo, de demotest, archivado.)
-- =============================================================
create or replace function public.prueba_tope_entradas()
returns int language sql immutable as $$ select 20 $$;

-- =============================================================
-- Alta autoservicio (/empezar): dos reglas en la base, no en el código
-- =============================================================
-- 1) Una persona es DUEÑA de una sola marca. El panel ya trabaja con una
--    marca por sesión, y sin esto N envíos simultáneos de /empezar con la
--    misma sesión creaban N marcas, cada una con su prueba gratis (security
--    review 2026-09-25). Verificado antes: nadie es brand_admin de 2 marcas.
--    El segundo insert choca (23505) y altaMarca borra esa marca.
create unique index if not exists brand_members_un_dueno
  on public.brand_members (user_id) where role = 'brand_admin';

-- 2) Buscar un usuario por email SIN generar un link: generateLink magiclink
--    reemplaza el token de acceso vigente de esa persona, y /empezar lo hacía
--    con cualquier correo (organizadores y super admin incluidos) antes de
--    saber si podía seguir. Solo service role (lección 0014: revoke explícito).
create or replace function public.usuario_id_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;
revoke execute on function public.usuario_id_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_id_por_email(text) to service_role;
