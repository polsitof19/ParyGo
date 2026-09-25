import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';

// Alta de una marca del autoservicio de /empezar. Con userId, para un usuario
// que YA existe (prueba gratis, tras el código). Con userId null, SIN dueña:
// el alta con pack crea la marca al ir a pagar y la dueña recién al volver
// con el pago aprobado (asignarDuena), para no crear cuentas sin verificar.
// Mismos pasos que el alta del super admin (cabina/brands/new): fila de la
// marca, secreto del webhook de MP ENCRIPTADO (0034) y membresía brand_admin.
// Todo o nada: si falla un paso se borra la marca (el usuario queda, es suyo).

// Subdominios que no se entregan: los del middleware (RESERVED_SUBDOMAINS) más
// nombres que un tercero usaría para hacerse pasar por ParyGo.
export const SLUGS_RESERVADOS = new Set([
  'app', 'www', 'api', 'admin', 'super', 'docs', 'status', 'mail', 'cdn', 'static',
  'parygo', 'soporte', 'ayuda', 'help', 'pagos', 'pago', 'cuenta', 'login', 'empezar',
  'blog', 'eventos', 'tickets', 'entradas', 'demo', 'test', 'prueba', 'cabina', 'panel',
]);
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

export type AltaMarca =
  | { ok: true; brandId: string; slug: string }
  | { ok: false; motivo: 'slug_en_uso' | 'error' };

export async function crearMarcaParaUsuario(a: {
  userId: string | null;
  email: string;
  nombre: string;
  slug: string;
  whatsappE164: string | null;
  prueba: boolean;
}): Promise<AltaMarca> {
  const admin = createAdminClient();
  const { data: brand, error } = await admin
    .from('brands')
    .insert({
      slug: a.slug,
      name: a.nombre,
      contact_email: a.email,
      whatsapp_e164: a.whatsappE164,
      theme_json: { primary_color: '#FF6A3D', secondary_color: '#5B6CFF' },
      notify_yape_digest: true,
      prueba_disponible: a.prueba,
      // Sin dueña = alta con pack sin pagar: ARCHIVADA (no se ve en
      // <slug>.parygo.com) hasta que la dueña la reclama con el pago aprobado.
      // Si no, cualquiera publicaba gratis una página con el nombre de otro.
      ...(a.userId ? {} : { archived_at: new Date().toISOString() }),
    })
    .select('id, slug')
    .single();
  if (error || !brand) {
    if (error?.code === '23505') return { ok: false, motivo: 'slug_en_uso' };
    console.error('[altaMarca] insert brand', error?.message);
    return { ok: false, motivo: 'error' };
  }

  const borrar = async () => {
    const { error: e } = await admin.from('brands').delete().eq('id', brand.id);
    if (e) console.error('[altaMarca] rollback de la marca falló', brand.id, e.message);
  };

  const secreto = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const { error: wsErr } = await admin.rpc('set_brand_mp_webhook_secret', {
    p_brand_id: brand.id,
    p_secret: secreto,
    p_encryption_key: serverEnv.BRAND_CREDS_ENCRYPTION_KEY,
  });
  if (wsErr) {
    console.error('[altaMarca] webhook secret', wsErr.message);
    await borrar();
    return { ok: false, motivo: 'error' };
  }

  if (a.userId) {
    const { error: mErr } = await admin.from('brand_members').insert({
      brand_id: brand.id, user_id: a.userId, role: 'brand_admin', display_name: a.email,
    });
    if (mErr) {
      console.error('[altaMarca] membresía', mErr.message);
      await borrar();
      return { ok: false, motivo: 'error' };
    }
  }

  await admin.from('events_log').insert({
    brand_id: brand.id, actor_user_id: a.userId, type: 'brand_self_signup',
    payload: { slug: brand.slug, name: a.nombre, prueba: a.prueba },
  });
  return { ok: true, brandId: brand.id, slug: brand.slug };
}
