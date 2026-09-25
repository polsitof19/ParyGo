// getSessionUser lee el id del token de la cookie SIN verificar para pedir el
// perfil y las membresías en paralelo con getUser() (2026-09-25, velocidad).
// Esto prueba que un token adulterado no entra a nada:
//   A. sesión real del organizador de demotest → /admin 200 (control)
//   B. mismo token con el `sub` cambiado al de OTRO usuario (firma rota)
//   C. mismo token con la firma cambiada
//   D. sin cookie
// B, C y D tienen que terminar en /login (redirect), nunca en el panel.
//
//   node e2e/sesion-adulterada.mjs      (server en BASE)
import { svc, BASE, log, otpSession, sessionCookies } from './lib.mjs';

const R = [];
const check = (nombre, ok, detalle = '') => { R.push(ok); log(`${ok ? '✔' : '✘'} ${nombre}${detalle ? ' — ' + detalle : ''}`); };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

const s = await otpSession('brandadmin.demotest@parygo.test');
// Otro usuario real (el super admin): si el sub adulterado "pegara", el panel
// cargaría con SUS permisos.
const { data: sup } = await svc.from('user_profiles').select('user_id').eq('is_super_admin', true).limit(1).single();

const pedir = async (session) => {
  const cookie = session ? sessionCookies(session, BASE).map((c) => `${c.name}=${c.value}`).join('; ') : '';
  const r = await fetch(`${BASE}/admin`, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  const html = await r.text();
  // Con loading.tsx el panel responde en streaming: el status arranca en 200 y
  // el redirect de requireSession viaja DENTRO del HTML. Lo que importa es si
  // aparece algo de la marca o el redirect a /login.
  const aLogin = (r.status >= 300 && r.status < 400 && (r.headers.get('location') ?? '').includes('/login')) || /NEXT_REDIRECT[^"]*\/login|url=\/login/.test(html);
  return { status: r.status, marca: html.includes('Demo Test'), aLogin };
};
const conToken = (token) => ({ ...s, access_token: token });
const [h, p, firma] = s.access_token.split('.');
const payload = JSON.parse(Buffer.from(p, 'base64url').toString());

const a = await pedir(s);
check('A. sesión real entra al panel (se ve la marca)', a.status === 200 && a.marca && !a.aLogin, JSON.stringify(a));

const bRes = await pedir(conToken(`${h}.${b64({ ...payload, sub: sup.user_id })}.${firma}`));
check('B. sub cambiado a otro usuario → login, sin datos de la marca', bRes.aLogin && !bRes.marca, JSON.stringify(bRes));

const otraFirma = firma.slice(0, -4) + (firma.endsWith('AAAA') ? 'BBBB' : 'AAAA');
const c = await pedir(conToken(`${h}.${p}.${otraFirma}`));
check('C. firma cambiada → login, sin datos de la marca', c.aLogin && !c.marca, JSON.stringify(c));

const d = await pedir(null);
check('D. sin sesión → login, sin datos de la marca', d.aLogin && !d.marca, JSON.stringify(d));

const ok = R.filter(Boolean).length;
log(`${ok === R.length ? '✅' : '❌'} ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
