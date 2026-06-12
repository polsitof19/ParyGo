import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Brand = {
  id: string;
  slug: string;
  name: string;
  whatsapp_e164: string | null;
  yape_number: string | null;
  yape_holder: string | null;
  theme_json: BrandTheme;
};

export type BrandTheme = {
  logo_url?: string | null;
  cover_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
};

// Read the slug injected by middleware.ts (x-parygo-brand-slug header).
// On the app host (app.parygo.com) this header is absent → returns null.
export function getBrandSlugFromHeaders(): string | null {
  return headers().get('x-parygo-brand-slug');
}

// Server Component / Server Action helper. Returns the brand for the current
// subdomain or 404s. Cached per-request via React.cache.
export const requireBrand = cache(async (): Promise<Brand> => {
  const slug = getBrandSlugFromHeaders();
  if (!slug) notFound();
  const supabase = createClient();
  const { data, error } = await supabase
    .from('brands')
    .select('id, slug, name, whatsapp_e164, yape_number, yape_holder, theme_json')
    .eq('slug', slug)
    .is('archived_at', null) // una marca archivada no resuelve en público
    .maybeSingle();
  if (error || !data) notFound();
  return data as Brand;
});

// Like requireBrand but returns null instead of 404 (useful for layouts that
// render on both app host and brand host).
export const getBrand = cache(async (): Promise<Brand | null> => {
  const slug = getBrandSlugFromHeaders();
  if (!slug) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from('brands')
    .select('id, slug, name, whatsapp_e164, yape_number, yape_holder, theme_json')
    .eq('slug', slug)
    .is('archived_at', null) // una marca archivada no resuelve en público
    .maybeSingle();
  if (error || !data) return null;
  return data as Brand;
});

// Fetch a brand by explicit slug (e.g. super admin viewing arbitrary brand).
// Sin filtro de archived_at: el super admin SÍ puede ver marcas archivadas.
export async function fetchBrandBySlug(slug: string): Promise<Brand | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('brands')
    .select('id, slug, name, whatsapp_e164, yape_number, yape_holder, theme_json')
    .eq('slug', slug)
    .maybeSingle();
  return (data as Brand) ?? null;
}
