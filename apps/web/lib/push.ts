import { buildPushPayload } from '@block65/webcrypto-web-push';
import { createAdminClient } from '@/lib/supabase/admin';

// =============================================================
// Avisos push (Web Push con VAPID) a los teléfonos del super admin.
// =============================================================
// Una sola variable de entorno, secreta: VAPID_PRIVATE_JWK (el JWK privado
// P-256 en JSON). La clave PÚBLICA que pide el navegador para suscribirse
// sale de ese mismo JWK (0x04 || x || y), así no hay dos variables que se
// desincronicen. Sin la variable, la cabina dice "falta configurar" y no se
// manda nada. @block65/webcrypto-web-push usa Web Crypto (funciona en el edge
// de Cloudflare; web-push no, usa crypto/https de Node) y cifra en aes128gcm
// (RFC 8291), el único que acepta Apple: @pushforge/builder cifraba en el
// aesgcm viejo y en iPhone no llegaba.

type Jwk = { kty: string; crv: string; x: string; y: string; d: string };

function jwk(): Jwk | null {
  try {
    const raw = process.env.VAPID_PRIVATE_JWK?.trim();
    if (!raw) return null;
    const k = JSON.parse(raw) as Jwk;
    return k.kty === 'EC' && k.crv === 'P-256' && k.x && k.y && k.d ? k : null;
  } catch {
    return null;
  }
}

const b64urlABytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const bytesAB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Clave pública VAPID (base64url, 65 bytes sin comprimir) o null si falta configurar. */
export function vapidPublica(): string | null {
  const k = jwk();
  if (!k) return null;
  return bytesAB64url(new Uint8Array([4, ...b64urlABytes(k.x), ...b64urlABytes(k.y)]));
}

export type AvisoPush = { title: string; body: string; url: string; tag?: string };

/** Manda el aviso a todos los teléfonos suscritos. Nunca tira. Borra las
 *  suscripciones que el servicio da por muertas (404/410). */
export async function pushAlSuperAdmin(aviso: AvisoPush): Promise<{ enviados: number; fallidos: number }> {
  const k = jwk();
  if (!k) return { enviados: 0, fallidos: 0 };
  const admin = createAdminClient();
  const { data: subs } = await admin.from('push_suscripciones').select('id, endpoint, p256dh, auth');
  let enviados = 0;
  let fallidos = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      const pub = vapidPublica()!;
      const { headers, body } = await buildPushPayload(
        { data: aviso, options: { ttl: 86_400, urgency: 'high' } },
        { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } },
        { subject: 'mailto:parygoasistencia@gmail.com', publicKey: pub, privateKey: k.d },
      );
      // Timeout: corre dentro del webhook de MP y un servicio colgado no debe
      // demorar la respuesta. Sin redirects: el allowlist de hosts se aplica
      // al guardar la suscripción y un 3xx lo esquivaría.
      const r = await fetch(s.endpoint, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(4000) });
      if (r.status === 404 || r.status === 410) {
        await admin.from('push_suscripciones').delete().eq('id', s.id);
        fallidos++;
      } else if (r.ok) {
        enviados++;
      } else {
        fallidos++;
        console.error('[push] el servicio respondió', r.status);
      }
    } catch (e) {
      fallidos++;
      console.error('[push] no se pudo mandar', e instanceof Error ? e.message : String(e));
    }
  }));
  return { enviados, fallidos };
}
