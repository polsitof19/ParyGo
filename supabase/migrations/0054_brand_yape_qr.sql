-- =============================================================
-- 0054 — QR de Yape de la marca + arreglo de la política de brand-assets.
-- =============================================================
-- (1) brands.yape_qr_url: la imagen del QR que el promotor descarga de su app
--     de Yape. Nullable a propósito: sin QR el comprador sigue viendo "yapea
--     al número", que es el camino que cobra hoy. Nada se rompe si está vacío.
--
-- (2) NO se crea un bucket nuevo. Ya existe `brand-assets` (público), que es
--     donde viven los logos, y el QR es exactamente lo mismo: un asset de marca
--     que el comprador TIENE que poder ver sin sesión. Un bucket privado
--     obligaría a firmar una URL por visita en la pantalla de pago, que es
--     justo donde no querés latencia ni un punto de falla más.
--
--     OJO: el QR de Yape no es un secreto. Es el mismo dato que el promotor
--     imprime y pega en la barra: número + titular. Quien lo tenga puede
--     MANDARLE plata al promotor, no sacársela.
--
-- (3) Arregla la política de escritura de brand-assets, que estaba MAL:
--
--       exists (select 1 from brands b
--               where (b.slug)::text = split_part(b.name, '/', 1)   -- ← b.name
--                 and user_is_brand_member(b.id, 'brand_admin'))
--
--     Compara el slug de la marca contra el primer segmento de SU PROPIO
--     NOMBRE, no contra la ruta del objeto que se está subiendo. Verificado en
--     producción: hoy ninguna marca satisface el predicado (el cast ::text
--     sobre un citext lo vuelve sensible a mayúsculas y 'koko' <> 'Koko'), así
--     que la política deniega a TODOS los brand_admin y solo escribe el super
--     admin. No es explotable hoy, pero es una mina: basta renombrar una marca
--     igual a su slug, o sacar el cast, para que un brand_admin pueda pisar el
--     logo y el QR de CUALQUIER otra marca.
--
--     Los objetos ya están guardados como `<slug>/archivo` (verificado: los
--     prefijos en uso son code, demotest, ensayo-paul, hoesky, koko), así que
--     la comparación correcta es contra la ruta del objeto.
--
--     La app sube por service role (que saltea RLS), así que esto no cambia
--     ningún camino que funcione hoy: arregla la red por si algún día se sube
--     desde el cliente.
-- =============================================================

-- ---------- (1) la columna ----------
alter table public.brands add column if not exists yape_qr_url text;

comment on column public.brands.yape_qr_url is
  'URL pública del QR de Yape del promotor (bucket brand-assets). NULL = el comprador ve "yapea al número".';

-- Sin esquema de URL no hay nada que mostrar, y evita que un `javascript:` o un
-- `data:` entre por acá si alguna vez esto se setea desde un formulario.
alter table public.brands drop constraint if exists brands_yape_qr_url_check;
alter table public.brands add constraint brands_yape_qr_url_check
  check (yape_qr_url is null or yape_qr_url ~ '^https://');

-- ---------- (3) la política, scopeada por la RUTA del objeto ----------
drop policy if exists "brand-assets admin write" on storage.objects;
create policy "brand-assets admin write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.brands b
        where b.slug = split_part(storage.objects.name, '/', 1)
          and public.user_is_brand_member(b.id, 'brand_admin'::public.user_role)
      )
    )
  );

drop policy if exists "brand-assets admin update" on storage.objects;
create policy "brand-assets admin update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'brand-assets'
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.brands b
        where b.slug = split_part(storage.objects.name, '/', 1)
          and public.user_is_brand_member(b.id, 'brand_admin'::public.user_role)
      )
    )
  )
  with check (
    bucket_id = 'brand-assets'
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.brands b
        where b.slug = split_part(storage.objects.name, '/', 1)
          and public.user_is_brand_member(b.id, 'brand_admin'::public.user_role)
      )
    )
  );

-- La lectura pública del bucket no cambia: el QR y el logo tienen que verse sin
-- sesión. Se deja explícito para que el historial replique el estado real.
drop policy if exists "brand-assets public read" on storage.objects;
create policy "brand-assets public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'brand-assets');
