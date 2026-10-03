// Test de lib/mpOauth.ts con fetch SIMULADO (nunca llama a Mercado Pago).
//   cd apps/web && npx tsx ../../e2e/mp-oauth.test.mts
const { crearPkce, urlAutorizacion, canjearCodigo, refrescarToken, idDeLaCuenta, igualesSeguro, alAzar } = await import('@/lib/mpOauth');
const { createHash } = await import('node:crypto');

let ok = 0, mal = 0;
const check = (n: string, c: boolean, d = '') => { c ? ok++ : mal++; console.log(`${c ? '✔' : '✘'} ${n}${d ? ' · ' + d : ''}`); };

// PKCE: challenge = base64url(sha256(verifier)), 43 caracteres, sin '='.
const { verifier, challenge } = await crearPkce();
const esperado = createHash('sha256').update(verifier).digest('base64url');
check('PKCE S256 correcto', challenge === esperado && !challenge.includes('='), challenge);
check('verifier dentro de 43–128', verifier.length >= 43 && verifier.length <= 128, String(verifier.length));
check('state al azar distinto cada vez', alAzar() !== alAzar());

const u = new URL(urlAutorizacion({ clientId: '123', redirectUri: 'https://app.parygo.com/admin/settings/mercadopago/vuelta', state: 'S', challenge }));
check('URL de autorización', u.origin === 'https://auth.mercadopago.com' && u.searchParams.get('response_type') === 'code'
  && u.searchParams.get('platform_id') === 'mp' && u.searchParams.get('code_challenge_method') === 'S256'
  && u.searchParams.get('redirect_uri') === 'https://app.parygo.com/admin/settings/mercadopago/vuelta');

// fetch simulado
let ultimo: { url: string; body: Record<string, string> } | null = null;
const responder = (status: number, body: unknown) => {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    ultimo = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} };
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
};
const bueno = { access_token: 'APP_USR-a', public_key: 'APP_USR-p', refresh_token: 'TG-r', user_id: 987654, expires_in: 15552000 };

responder(200, bueno);
const c = await canjearCodigo({ clientId: '1', clientSecret: 's', code: 'TG-c', redirectUri: 'https://x/v', verifier });
check('canje OK devuelve los tokens', c.ok && c.tokens.userId === '987654' && c.tokens.expiresAt.getTime() > Date.now() + 179 * 864e5);
check('canje manda grant authorization_code + code_verifier', ultimo!.body.grant_type === 'authorization_code' && ultimo!.body.code_verifier === verifier);

responder(200, { ...bueno, public_key: undefined });
const inc = await canjearCodigo({ clientId: '1', clientSecret: 's', code: 'c', redirectUri: 'r', verifier });
check('respuesta sin public_key → incompleto, sin tokens', !inc.ok && inc.error === 'incompleto');

responder(400, { error: 'invalid_grant' });
const rev = await refrescarToken({ clientId: '1', clientSecret: 's', refreshToken: 'TG-r' });
check('refresh 400 invalid_grant → revocado', !rev.ok && rev.error === 'revocado');
check('refresh manda grant refresh_token', ultimo!.body.grant_type === 'refresh_token' && ultimo!.body.refresh_token === 'TG-r');

for (const st of [429, 500, 503]) {
  responder(st, {});
  const t = await refrescarToken({ clientId: '1', clientSecret: 's', refreshToken: 'r' });
  check(`refresh ${st} → transitorio (no desconecta)`, !t.ok && t.error === 'transitorio');
}
globalThis.fetch = (async () => { throw new Error('red caída'); }) as typeof fetch;
const red = await refrescarToken({ clientId: '1', clientSecret: 's', refreshToken: 'r' });
check('error de red → transitorio', !red.ok && red.error === 'transitorio');

responder(200, { id: 987654 });
check('users/me devuelve el id', (await idDeLaCuenta('t')) === '987654');
responder(401, {});
check('users/me 401 → null', (await idDeLaCuenta('t')) === null);

check('igualesSeguro', igualesSeguro('abc', 'abc') && !igualesSeguro('abc', 'abd') && !igualesSeguro('abc', 'ab'));

console.log(mal ? `✘ ${mal} fallas, ${ok} OK` : `✔ ${ok}/${ok}`);
process.exit(mal ? 1 : 0);
