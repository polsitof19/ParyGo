import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { canjearCodigo, idDeLaCuenta, igualesSeguro } from '@/lib/mpOauth';
import { COOKIE_MP_OAUTH, duenaRealDe, mpClient, redirectUriMp } from '@/lib/mpConexion';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Vuelta de "Conectar Mercado Pago" (OAuth). MP manda ?code&state (o ?error si
// la organizadora canceló). Se exige TODO lo siguiente o no se guarda nada:
//  - sesión de la dueña real de la marca (la misma que inició: cookie.u y cookie.b);
//  - state igual al de la cookie (tiempo constante) — un solo uso;
//  - canje del code con el code_verifier (PKCE);
//  - /users/me con el token nuevo = el user_id del canje;
//  - esa cuenta de MP no está conectada a OTRA marca (set_brand_mp_oauth).
// El resultado vuelve a Mi marca como ?mp=<motivo> (textos en la página).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const volver = (motivo: string) => {
    const res = NextResponse.redirect(new URL(`/admin/settings?mp=${motivo}#cobro`, url.origin));
    res.cookies.set(COOKIE_MP_OAUTH, '', { path: '/admin/settings/mercadopago', maxAge: 0 });
    return res;
  };

  const raw = cookies().get(COOKIE_MP_OAUTH)?.value;
  let c: { s?: string; v?: string; b?: string; u?: string } = {};
  try { c = raw ? JSON.parse(raw) : {}; } catch { c = {}; }

  const user = await getSessionUser();
  const brandId = user ? duenaRealDe(user) : null;
  const admin = createAdminClient();
  const fallo = async (motivo: string) => {
    if (brandId) await admin.from('events_log').insert({ brand_id: brandId, actor_user_id: user?.id ?? null, type: 'mp_conectar_fallido', payload: { motivo } });
    return volver(motivo);
  };

  if (url.searchParams.get('error')) return volver('cancelado');
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (!user || !brandId || !c.s || !c.v || c.b !== brandId || c.u !== user.id) return fallo('sesion');
  if (!state || !igualesSeguro(state, c.s) || !code) return fallo('sesion');

  const { clientId, clientSecret } = mpClient();
  if (!clientId || !clientSecret) return fallo('no_disponible');
  const r = await canjearCodigo({ clientId, clientSecret, code, redirectUri: redirectUriMp(), verifier: c.v });
  if (!r.ok) return fallo(r.error === 'transitorio' ? 'intenta_de_nuevo' : 'rechazado');

  const id = await idDeLaCuenta(r.tokens.accessToken);
  if (id !== r.tokens.userId) return fallo('cuenta_no_coincide');

  const { data, error } = await admin.rpc('set_brand_mp_oauth', {
    p_brand_id: brandId, p_access_token: r.tokens.accessToken, p_public_key: r.tokens.publicKey,
    p_refresh_token: r.tokens.refreshToken, p_user_id: r.tokens.userId,
    p_expires_at: r.tokens.expiresAt.toISOString(), p_encryption_key: serverEnv.BRAND_CREDS_ENCRYPTION_KEY,
  });
  const res = (data ?? {}) as { ok?: boolean; action?: string };
  if (error || !res.ok) return fallo(res.action === 'cuenta_en_otra_marca' ? 'cuenta_en_otra_marca' : 'intenta_de_nuevo');

  await admin.from('events_log').insert({ brand_id: brandId, actor_user_id: user.id, type: 'mp_conectado', payload: { cuenta: r.tokens.userId } });
  return volver('conectado');
}
