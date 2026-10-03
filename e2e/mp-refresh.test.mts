// Test de tokenVigenteMp (lib/mpConexion.ts) con base y Mercado Pago SIMULADOS.
//   cd apps/web && npx tsx ../../e2e/mp-refresh.test.mts
process.env.PARYGO_MP_CLIENT_ID = '123';
process.env.PARYGO_MP_CLIENT_SECRET = 'secreto';
const { tokenVigenteMp } = await import('@/lib/mpConexion');

let ok = 0, mal = 0;
const check = (n: string, c: boolean, d = '') => { c ? ok++ : mal++; console.log(`${c ? '✔' : '✘'} ${n}${d ? ' · ' + d : ''}`); };

// Base simulada: el candado es atómico (como tomar_candado) y se registra todo.
function base(venceEnMs: number) {
  const st = { candado: false, refrescos: 0, limpiada: false, log: [] as string[], token: 'viejo' };
  const admin = {
    rpc: async (fn: string, a: Record<string, unknown>) => {
      if (fn === 'get_brand_mp_oauth') return { data: [{ access_token: st.token, refresh_token: 'TG', user_id: '99', expires_at: new Date(Date.now() + venceEnMs).toISOString() }], error: null };
      if (fn === 'tomar_candado') { const gana = !st.candado; st.candado = true; return { data: gana, error: null }; }
      if (fn === 'refresh_brand_mp_oauth') { st.refrescos++; st.token = String(a.p_access_token); return { data: true, error: null }; }
      if (fn === 'clear_brand_mp_oauth') { st.limpiada = true; return { data: null, error: null }; }
      return { data: null, error: { message: 'rpc desconocida ' + fn } };
    },
    from: () => ({ insert: async (r: { type: string }) => { st.log.push(r.type); return { error: null }; } }),
  };
  return { st, admin: admin as never };
}
let posts = 0;
const mp = (status: number, body: unknown, demora = 0) => {
  posts = 0;
  globalThis.fetch = (async () => {
    posts++;
    await new Promise((r) => setTimeout(r, demora));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
};
const nuevo = { access_token: 'APP_USR-nuevo', public_key: 'pk', refresh_token: 'TG-nuevo', user_id: 99, expires_in: 15552000 };
const DIA = 864e5;

// 1. Lejos del vencimiento: no toca nada.
{ const { st, admin } = base(60 * DIA); mp(200, nuevo);
  const t = await tokenVigenteMp(admin, 'b', 'k');
  check('a 60 días: usa el token sin refrescar', t === 'viejo' && posts === 0 && st.refrescos === 0); }

// 2. Dos pedidos a la vez cerca del vencimiento: UN solo POST a /oauth/token.
{ const { st, admin } = base(3 * DIA); mp(200, nuevo, 200);
  const [a, b] = await Promise.all([tokenVigenteMp(admin, 'b', 'k'), tokenVigenteMp(admin, 'b', 'k')]);
  check('dos a la vez → un solo refresco', posts === 1 && st.refrescos === 1, `posts=${posts} refrescos=${st.refrescos}`);
  check('el que pierde usa el token vigente; el que gana, el nuevo', [a, b].sort().join(',') === 'APP_USR-nuevo,viejo', `${a} ${b}`); }

// 3. Refresh revocado → se desconecta y se anota.
{ const { st, admin } = base(3 * DIA); mp(400, { error: 'invalid_grant' });
  let err = '';
  try { await tokenVigenteMp(admin, 'b', 'k'); } catch (e) { err = (e as Error).message; }
  check('revocado → desconecta + bitácora + error', st.limpiada && st.log.includes('mp_refresh_revocado') && /revocada/.test(err), err); }

// 4. Transitorio (503) con token aún válido → sigue cobrando, nada se borra.
{ const { st, admin } = base(3 * DIA); mp(503, {});
  const t = await tokenVigenteMp(admin, 'b', 'k');
  check('503 → usa el token vigente, no desconecta', t === 'viejo' && !st.limpiada); }

// 5. Token YA vencido y sin poder refrescar (transitorio) → falla cerrado.
{ const { st, admin } = base(-1000); mp(503, {});
  let err = '';
  try { await tokenVigenteMp(admin, 'b', 'k'); } catch (e) { err = (e as Error).message; }
  check('vencido + 503 → error, no se cobra con un token vencido', !!err && !st.limpiada, err); }

// 6. Token vencido y el candado lo tiene otro → error (no un segundo refresco).
{ const { st, admin } = base(-1000); st.candado = true; mp(200, nuevo);
  let err = '';
  try { await tokenVigenteMp(admin, 'b', 'k'); } catch (e) { err = (e as Error).message; }
  check('vencido + candado ajeno → error sin refrescar', !!err && posts === 0, err); }

console.log(mal ? `✘ ${mal} fallas, ${ok} OK` : `✔ ${ok}/${ok}`);
process.exit(mal ? 1 : 0);
