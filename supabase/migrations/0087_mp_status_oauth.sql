-- 0087 — "MP listo" = conectada por OAuth (security review de 0086, M4).
--
-- get_brand_mp_status decide si el comprador ve "Tarjeta" (página del evento) y
-- las estadísticas. Miraba solo que hubiera access token y public key: una
-- credencial cargada a mano (ya no hay UI, pero la cabina la aceptaba) mostraba
-- "Tarjeta" y el checkout fallaba DESPUÉS de que el comprador dejó sus datos
-- (tokenVigenteMp exige mp_oauth_user_id). Ahora exige la conexión OAuth.

create or replace function public.get_brand_mp_status(p_brand_id uuid)
 returns table(has_access_token boolean, has_public_key boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select mp_oauth_user_id is not null and mp_access_token_enc is not null,
         mp_oauth_user_id is not null and mp_public_key_enc is not null
  from public.brands where id = p_brand_id;
$function$;

revoke execute on function public.get_brand_mp_status(uuid) from public, anon, authenticated;
grant execute on function public.get_brand_mp_status(uuid) to service_role;
