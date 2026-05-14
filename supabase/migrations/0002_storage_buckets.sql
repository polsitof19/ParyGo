-- =============================================================
-- ParyGo · storage buckets
-- =============================================================
-- yape-proofs : private receipt images, only brand_admin reads
-- brand-assets: public logos/covers
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'yape-proofs',
    'yape-proofs',
    false,
    5 * 1024 * 1024,   -- 5 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'brand-assets',
    'brand-assets',
    true,
    10 * 1024 * 1024,  -- 10 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  )
on conflict (id) do nothing;

-- ---- yape-proofs policies ----
-- Anyone can upload (anonymous buyers). Only brand owners can read.
create policy "yape-proofs anon upload"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'yape-proofs');

create policy "yape-proofs brand read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'yape-proofs'
  and (
    public.is_super_admin()
    or exists (
      select 1 from public.yape_proofs yp
      where yp.receipt_url like '%/' || name
        and public.user_is_brand_member(yp.brand_id, 'brand_admin')
    )
  )
);

-- ---- brand-assets policies ----
-- Public read; super_admin + brand_admin can write under their brand prefix.
create policy "brand-assets public read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'brand-assets');

create policy "brand-assets admin write"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'brand-assets'
  and (
    public.is_super_admin()
    or exists (
      select 1 from public.brands b
      where b.slug = split_part(name, '/', 1)
        and public.user_is_brand_member(b.id, 'brand_admin')
    )
  )
);

create policy "brand-assets admin update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'brand-assets'
  and (
    public.is_super_admin()
    or exists (
      select 1 from public.brands b
      where b.slug = split_part(name, '/', 1)
        and public.user_is_brand_member(b.id, 'brand_admin')
    )
  )
);
