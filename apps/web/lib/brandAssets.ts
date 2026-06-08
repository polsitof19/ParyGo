import { nanoid } from 'nanoid';
import type { createAdminClient } from '@/lib/supabase/admin';

// Tipos permitidos para el flyer de un evento (foto). SVG queda para el logo.
const COVER_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MAX_BYTES = 10 * 1024 * 1024; // límite del bucket brand-assets

// Tipos permitidos para el LOGO de una marca. Solo rasterizados (png/jpg/webp):
// NO se acepta SVG porque el bucket es público y un SVG con <script> sería un
// vector de XSS stored si se accede a su URL directa (security-review M1).
export const LOGO_ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export type LogoUploadResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

// Sube el logo de una marca al bucket público `brand-assets` bajo el prefijo de
// la marca (`<slug>/logo-<nanoid>.<ext>`). Valida tipo y tamaño; el nombre del
// archivo lo genera el server (no inyectable). El `brandSlug` SIEMPRE lo aporta
// el server (de la sesión del dueño, o del row cargado por brand_id del super
// admin), NUNCA del form → el path no se puede apuntar a otra marca.
export async function uploadBrandLogo(
  admin: ReturnType<typeof createAdminClient>,
  brandSlug: string,
  file: File
): Promise<LogoUploadResult> {
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { ok: false, message: 'El logo debe ser PNG, JPG o WEBP.' };
  if (file.size === 0) return { ok: false, message: 'El archivo está vacío.' };
  if (file.size > MAX_BYTES) return { ok: false, message: 'El logo supera 10 MB.' };

  const path = `${brandSlug}/logo-${nanoid(10)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage
    .from('brand-assets')
    .upload(path, bytes, { contentType: file.type, cacheControl: '3600', upsert: true });
  if (error) return { ok: false, message: `No se pudo subir el logo: ${error.message}` };

  const { data } = admin.storage.from('brand-assets').getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

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
