import { nanoid } from 'nanoid';
import type { createAdminClient } from '@/lib/supabase/admin';

// Tipos permitidos para el flyer de un evento (foto). SVG queda para el logo.
const COVER_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MAX_BYTES = 10 * 1024 * 1024; // límite del bucket brand-assets

export type CoverUploadResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

// Sube el flyer de un evento al bucket público `brand-assets` bajo el prefijo de
// la marca (`<slug>/...`), que es lo que la RLS exige para que un brand_admin
// pueda escribir. Valida tipo y tamaño. El brandSlug SIEMPRE sale de la sesión
// del que llama (nunca del form) → no se puede escribir en otra marca.
export async function uploadEventCover(
  admin: ReturnType<typeof createAdminClient>,
  brandSlug: string,
  file: File
): Promise<CoverUploadResult> {
  const ext = COVER_TYPES[file.type];
  if (!ext) return { ok: false, message: 'El flyer debe ser PNG, JPG o WEBP.' };
  if (file.size === 0) return { ok: false, message: 'El archivo está vacío.' };
  if (file.size > MAX_BYTES) return { ok: false, message: 'El flyer supera 10 MB.' };

  const path = `${brandSlug}/event-${nanoid(10)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage
    .from('brand-assets')
    .upload(path, bytes, { contentType: file.type, cacheControl: '3600', upsert: true });
  if (error) return { ok: false, message: `No se pudo subir el flyer: ${error.message}` };

  const { data } = admin.storage.from('brand-assets').getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
