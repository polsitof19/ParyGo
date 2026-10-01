'use server';

import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushAlSuperAdmin } from '@/lib/push';

// Suscripción del teléfono del super admin a los avisos de venta (0079).
// Solo super admin (requireSession). El server le hace POST al endpoint de la
// suscripción, así que solo se aceptan los servicios push de los navegadores
// (https y host conocido): nada de URLs arbitrarias.
const HOSTS_PUSH = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
];

type Sub = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

function valida(s: Sub): { endpoint: string; p256dh: string; auth: string } | null {
  const { endpoint, keys } = s ?? {};
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return null;
  if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') return null;
  if (keys.p256dh.length > 200 || keys.auth.length > 100) return null;
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || !HOSTS_PUSH.some((h) => h.test(u.hostname))) return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

export async function guardarSuscripcionAction(sub: Sub, dispositivo: string): Promise<{ ok: boolean }> {
  const user = await requireSession({ superAdmin: true });
  const v = valida(sub);
  if (!v) return { ok: false };
  const { error } = await createAdminClient()
    .from('push_suscripciones')
    .upsert({ ...v, user_id: user.id, dispositivo: dispositivo.slice(0, 120) }, { onConflict: 'endpoint' });
  return { ok: !error };
}

export async function quitarSuscripcionAction(endpoint: string): Promise<void> {
  await requireSession({ superAdmin: true });
  await createAdminClient().from('push_suscripciones').delete().eq('endpoint', endpoint);
}

export async function probarAvisoAction(): Promise<{ enviados: number }> {
  await requireSession({ superAdmin: true });
  const r = await pushAlSuperAdmin({
    title: '💰 Así te va a llegar una venta',
    body: 'S/ 150 · Marca de ejemplo compró 1 evento',
    url: '/cabina-7k29x/ventas',
    tag: 'prueba',
  });
  return { enviados: r.enviados };
}
