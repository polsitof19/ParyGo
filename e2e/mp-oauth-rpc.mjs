// 0086: RPCs de Conectar Mercado Pago. JWT REAL + reglas. Solo demotest y una
// marca temporal is_test que se borra al final. Tokens FALSOS (nunca llama a MP).
//
//   node e2e/mp-oauth-rpc.mjs
//
// 1. anon y el brand_admin de demotest NO ejecutan set/refresh/get/clear ni leen
//    las columnas mp_oauth_* de brands.
// 2. Conectar guarda y se lee descifrado; la misma cuenta de MP en OTRA marca →
//    cuenta_en_otra_marca (también si las dos conectan a la vez).
// 3. Refresh solo pisa si la marca sigue en la MISMA cuenta.
// 4. Desconectar borra todo (y el checkout deja de ver credenciales).
import { svc, anon, env, log, otpSession } from './lib.mjs';
import { createClient } from '@supabase/supabase-js';

const KEY = env.BRAND_CREDS_ENCRYPTION_KEY;
if (!KEY) throw new Error('falta BRAND_CREDS_ENCRYPTION_KEY en apps/web/.env.local');
const STAMP = Date.now().toString().slice(-6);
const R = [];
const check = (nombre, ok, detalle = '') => { R.push({ nombre, ok }); log(`${ok ? '✅' : '❌'} ${nombre}${detalle ? ' · ' + detalle : ''}`); };

const { data: demo } = await svc.from('brands').select('id, slug, mp_oauth_user_id').eq('slug', 'demotest').single();
if (demo?.slug !== 'demotest') throw new Error('solo demotest');
if (demo.mp_oauth_user_id) throw new Error('demotest ya tiene MP conectado: no se pisa');
const { data: otra, error: eOtra } = await svc.from('brands')
  .insert({ slug: `e2e-oauth-${STAMP}`, name: 'E2E OAuth', is_test: true, archived_at: new Date().toISOString() })
  .select('id').single();
if (eOtra) throw new Error(eOtra.message);

const vence = new Date(Date.now() + 180 * 864e5).toISOString();
const set = (cli, brand, user) => cli.rpc('set_brand_mp_oauth', {
  p_brand_id: brand, p_access_token: `APP_USR-falso-${user}`, p_public_key: `APP_USR-pk-${user}`,
  p_refresh_token: `TG-falso-${user}`, p_user_id: user, p_expires_at: vence, p_encryption_key: KEY,
});
const USER = `e2e${STAMP}`;

try {
  // ---------- 1. permisos ----------
  const sesion = await otpSession('brandadmin.demotest@parygo.test');
  const u = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${sesion.access_token}` } },
  });
  for (const [quien, cli] of [['anon', anon()], ['brand_admin', u]]) {
    const s = await set(cli, demo.id, 'robo');
    check(`${quien} NO ejecuta set_brand_mp_oauth`, !!s.error, s.error?.code);
    const g = await cli.rpc('get_brand_mp_oauth', { p_brand_id: demo.id, p_encryption_key: KEY });
    check(`${quien} NO ejecuta get_brand_mp_oauth`, !!g.error, g.error?.code);
    const r = await cli.rpc('refresh_brand_mp_oauth', { p_brand_id: demo.id, p_user_id: 'x', p_access_token: 'x', p_refresh_token: 'x', p_expires_at: vence, p_encryption_key: KEY });
    check(`${quien} NO ejecuta refresh_brand_mp_oauth`, !!r.error, r.error?.code);
    const c = await cli.rpc('clear_brand_mp_oauth', { p_brand_id: demo.id });
    check(`${quien} NO ejecuta clear_brand_mp_oauth`, !!c.error, c.error?.code);
    const col = await cli.from('brands').select('mp_oauth_user_id').eq('id', demo.id);
    check(`${quien} NO lee brands.mp_oauth_user_id`, !!col.error, col.error?.code);
  }

  // ---------- 2. conectar ----------
  const c1 = await set(svc, demo.id, USER);
  check('conectar demotest → ok', c1.data?.ok === true, JSON.stringify(c1.data ?? c1.error));
  const g1 = await svc.rpc('get_brand_mp_oauth', { p_brand_id: demo.id, p_encryption_key: KEY });
  const fila = g1.data?.[0];
  check('se lee descifrado (access, refresh, cuenta)', fila?.access_token === `APP_USR-falso-${USER}` && fila?.refresh_token === `TG-falso-${USER}` && fila?.user_id === USER);
  const cred = await svc.rpc('get_brand_mp_credentials', { p_brand_id: demo.id, p_encryption_key: KEY });
  check('el checkout ve las credenciales (get_brand_mp_credentials)', cred.data?.[0]?.public_key === `APP_USR-pk-${USER}`);
  const c2 = await set(svc, otra.id, USER);
  check('la misma cuenta en otra marca → cuenta_en_otra_marca', c2.data?.action === 'cuenta_en_otra_marca', JSON.stringify(c2.data));

  // Carrera: otra cuenta nueva conectada a las dos marcas a la vez → solo una.
  const U2 = `${USER}b`;
  await svc.rpc('clear_brand_mp_oauth', { p_brand_id: demo.id });
  const [x, y] = await Promise.all([set(svc, demo.id, U2), set(svc, otra.id, U2)]);
  const oks = [x.data?.ok, y.data?.ok].filter(Boolean).length;
  check('dos marcas conectan la misma cuenta a la vez → una sola gana', oks === 1, `${x.data?.action} / ${y.data?.action}`);

  // ---------- 3. refresh ----------
  await svc.rpc('clear_brand_mp_oauth', { p_brand_id: otra.id });
  await svc.rpc('clear_brand_mp_oauth', { p_brand_id: demo.id });
  await set(svc, demo.id, USER);
  const r1 = await svc.rpc('refresh_brand_mp_oauth', { p_brand_id: demo.id, p_user_id: 'otra-cuenta', p_access_token: 'pisado', p_refresh_token: 'pisado', p_expires_at: vence, p_encryption_key: KEY });
  check('refresh con otra cuenta → no pisa', r1.data === false);
  const r2 = await svc.rpc('refresh_brand_mp_oauth', { p_brand_id: demo.id, p_user_id: USER, p_access_token: 'APP_USR-nuevo', p_refresh_token: 'TG-nuevo', p_expires_at: vence, p_encryption_key: KEY });
  const g2 = (await svc.rpc('get_brand_mp_oauth', { p_brand_id: demo.id, p_encryption_key: KEY })).data?.[0];
  check('refresh con la misma cuenta → par nuevo guardado', r2.data === true && g2?.access_token === 'APP_USR-nuevo' && g2?.refresh_token === 'TG-nuevo');

  // Candado del refresco (tomar_candado, base real): dos a la vez → uno solo.
  const clave = `mp_refresh:e2e-${STAMP}`;
  const [k1, k2] = await Promise.all([
    svc.rpc('tomar_candado', { p_clave: clave, p_segundos: 5 }),
    svc.rpc('tomar_candado', { p_clave: clave, p_segundos: 5 }),
  ]);
  check('candado del refresco: dos a la vez → un true y un false', [k1.data, k2.data].sort().join(',') === 'false,true', `${k1.data}/${k2.data}`);
  await svc.from('candados_alta').delete().eq('clave', clave);

  // ---------- 4. desconectar ----------
  await svc.rpc('clear_brand_mp_oauth', { p_brand_id: demo.id });
  const g3 = await svc.rpc('get_brand_mp_oauth', { p_brand_id: demo.id, p_encryption_key: KEY });
  const c3 = await svc.rpc('get_brand_mp_credentials', { p_brand_id: demo.id, p_encryption_key: KEY });
  check('desconectar borra todo', (g3.data ?? []).length === 0 && !c3.data?.[0]?.access_token);
} finally {
  await svc.rpc('clear_brand_mp_oauth', { p_brand_id: demo.id });
  await svc.from('brands').delete().eq('id', otra.id);
  const { data: fin } = await svc.from('brands').select('mp_oauth_user_id').eq('id', demo.id).single();
  check('demotest quedó sin MP conectado', !fin?.mp_oauth_user_id);
}

const mal = R.filter((r) => !r.ok);
log(`${R.length - mal.length}/${R.length} OK`);
process.exit(mal.length ? 1 : 0);
