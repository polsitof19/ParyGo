// =============================================================
// OAuth de Mercado Pago ("Conectar Mercado Pago", plan en AGENTS.md).
// =============================================================
// fetch directo y Web Crypto: corre en el edge de Cloudflare (el SDK de MP está
// prohibido en el server, ver lib/mpApi.ts). Doc: auth.mercadopago.com/
// authorization + POST api.mercadopago.com/oauth/token (authorization_code y
// refresh_token, PKCE S256). Nada de esto imprime ni loguea tokens.

const AUTH = 'https://auth.mercadopago.com/authorization';
const API = 'https://api.mercadopago.com';

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function alAzar(n = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

// PKCE (RFC 7636): verifier al azar, challenge = base64url(sha256(verifier)).
export async function crearPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = alAzar(32);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(hash)) };
}

export function urlAutorizacion(o: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({
    client_id: o.clientId,
    response_type: 'code',
    platform_id: 'mp',
    state: o.state,
    redirect_uri: o.redirectUri,
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH}?${q}`;
}

export type TokensMp = { accessToken: string; publicKey: string; refreshToken: string; userId: string; expiresAt: Date };

// El canje y el refresco devuelven lo mismo. Si falta algo, no hay tokens.
function leerTokens(j: Record<string, unknown>): TokensMp | null {
  const access = typeof j.access_token === 'string' ? j.access_token : '';
  const pub = typeof j.public_key === 'string' ? j.public_key : '';
  const refresh = typeof j.refresh_token === 'string' ? j.refresh_token : '';
  const user = typeof j.user_id === 'number' || typeof j.user_id === 'string' ? String(j.user_id) : '';
  const exp = typeof j.expires_in === 'number' && j.expires_in > 0 ? j.expires_in : 0;
  if (!access || !pub || !refresh || !/^\d{1,20}$/.test(user) || !exp) return null;
  return { accessToken: access, publicKey: pub, refreshToken: refresh, userId: user, expiresAt: new Date(Date.now() + exp * 1000) };
}

// 'revocado' = MP rechazó el code/refresh (invalid_grant y demás 4xx salvo 429):
// definitivo. 'transitorio' = red, timeout, 429 o 5xx: se reintenta otro día
// sin desconectar a nadie (revisión de Codex 2026-10-03).
export type ErrorMp = 'revocado' | 'transitorio' | 'incompleto';
export type ResultadoTokens = { ok: true; tokens: TokensMp } | { ok: false; error: ErrorMp };

async function pedirToken(body: Record<string, string>): Promise<ResultadoTokens> {
  let res: Response;
  try {
    res = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, error: 'transitorio' };
  }
  if (res.status === 429 || res.status >= 500) return { ok: false, error: 'transitorio' };
  if (!res.ok) return { ok: false, error: 'revocado' };
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const tokens = leerTokens(j);
  return tokens ? { ok: true, tokens } : { ok: false, error: 'incompleto' };
}

export function canjearCodigo(o: { clientId: string; clientSecret: string; code: string; redirectUri: string; verifier: string }) {
  return pedirToken({
    client_id: o.clientId,
    client_secret: o.clientSecret,
    grant_type: 'authorization_code',
    code: o.code,
    redirect_uri: o.redirectUri,
    code_verifier: o.verifier,
  });
}

export function refrescarToken(o: { clientId: string; clientSecret: string; refreshToken: string }) {
  return pedirToken({
    client_id: o.clientId,
    client_secret: o.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: o.refreshToken,
  });
}

// Confirma con el token recién canjeado que la cuenta es la que dijo el canje.
export async function idDeLaCuenta(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { id?: number | string };
    return j.id === undefined ? null : String(j.id);
  } catch {
    return null;
  }
}

// Comparación en tiempo constante (state del OAuth).
export function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
