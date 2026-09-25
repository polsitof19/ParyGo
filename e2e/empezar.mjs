// Alta autoservicio (/empezar, 2026-09-25) contra un server LOCAL que habla
// con la base de producción. Volumen: 2 marcas y 3 usuarios de prueba, que se
// borran al final (la marca con compra no se puede borrar —pack_purchases es
// on delete restrict—: queda ARCHIVADA, is_test y con la compra en 'failed').
//
//   node e2e/empezar.mjs            (server en BASE, por defecto localhost:3001)
//
// A. Supabase: un código de ALTA (generateLink signup) se valida con
//    verifyOtp({ type: 'email' }), que es lo que usa confirmarAlta.
// B. Negativos: link ocupado, link reservado, correo de alguien con marca,
//    código incorrecto. Ninguno crea marca.
// C. Prueba gratis por pantalla: datos → código → /admin, marca con
//    prueba_disponible, saldo 0, dueña, aviso de Yape prendido.
// D. Pack de 1 evento (si el server tiene PARYGO_MP_*): datos → código → sale
//    a Mercado Pago con una compra pendiente de S/150 congelada.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { svc, anon, env, BASE, log, otpSession } from './lib.mjs';

const STAMP = Date.now().toString().slice(-7);
const R = [];
const check = (paso, nombre, ok, detalle = '') => { R.push({ paso, nombre, ok }); log(`${paso} ${ok ? '✔' : '✘'} ${nombre}${detalle ? ' — ' + detalle : ''}`); };
const usuarios = [];
const marcas = [];

async function codigoPara(email) {
  // El server ya mandó (o saltó, sin RESEND en local) su correo; acá se pide
  // un código nuevo con service role, como lo haría la persona con el suyo.
  const { data, error } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error('generateLink ' + error.message);
  usuarios.push(data.user.id);
  return data.properties.email_otp;
}

async function llenar(p, { plan, nombre, slug, email }) {
  await p.goto(`${BASE}/empezar`, { waitUntil: 'networkidle' });
  await p.locator(`.ez-plan:has(input[value="${plan}"])`).click();
  await p.fill('#ez-nombre', nombre);
  if (slug) await p.fill('#ez-slug', slug);
  await p.fill('#ez-email', email);
  await p.fill('#ez-pass', 'E2eAlta!2026');
}
const enviar = (p) => p.getByRole('button', { name: /Enviarme el código/ }).click();
const texto = (p) => p.locator('main').innerText();

const b = await chromium.launch();
try {
  // ---------- A ----------
  {
    const email = `delivered+alta-a${STAMP}@resend.dev`;
    const { data, error } = await svc.auth.admin.generateLink({ type: 'signup', email, password: 'E2eAlta!2026' });
    if (error) throw new Error(error.message);
    usuarios.push(data.user.id);
    const v = await anon().auth.verifyOtp({ email, token: data.properties.email_otp, type: 'email' });
    check('A', 'un código de alta (signup) se valida con type "email"', !!v.data?.session && !v.error, v.error?.message ?? 'sesión ok');

    // usuario_id_por_email (0071): solo service role. Con JWT real, no.
    const a1 = await anon().rpc('usuario_id_por_email', { p_email: 'brandadmin.demotest@parygo.test' });
    check('A', 'anon NO puede buscar usuarios por correo', !!a1.error && !a1.data, a1.error?.code);
    const sesion = await otpSession('brandadmin.demotest@parygo.test');
    const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${sesion.access_token}` } },
    });
    const a2 = await auth.rpc('usuario_id_por_email', { p_email: 'brandadmin.demotest@parygo.test' });
    check('A', 'un organizador (JWT real) NO puede buscar usuarios por correo', !!a2.error && !a2.data, a2.error?.code);

    // Una persona = dueña de UNA marca (0071), con dos altas a la vez.
    const u = data.user.id;
    const bs = [];
    for (const x of ['x', 'y']) {
      const { data: br, error: e } = await svc.from('brands').insert({ slug: `e2e-alta-dos-${x}${STAMP}`, name: 'E2E dos', contact_email: email, is_test: true }).select('id').single();
      if (e) throw new Error(e.message);
      bs.push(br.id);
      marcas.push({ id: br.id, borrar: true });
    }
    const r = await Promise.all(bs.map((b) => svc.from('brand_members').insert({ brand_id: b, user_id: u, role: 'brand_admin', display_name: email })));
    const oks = r.filter((x) => !x.error).length;
    check('A', 'dos altas a la vez para la misma persona: una sola queda dueña', oks === 1 && r.some((x) => x.error?.code === '23505'), r.map((x) => x.error?.code ?? 'ok').join(' / '));
  }

  // ---------- B ----------
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await llenar(p, { plan: 'prueba', nombre: 'Otro Code', slug: 'code', email: `delivered+alta-b${STAMP}@resend.dev` });
    await p.getByText(/ya lo tiene otra marca/i).waitFor({ timeout: 8000 }).catch(() => {});
    const t1 = await texto(p);
    check('B', 'link de una marca existente: avisa y no deja seguir', /ya lo tiene otra marca/i.test(t1) && await p.getByRole('button', { name: /Enviarme el código/ }).isDisabled());

    await p.fill('#ez-slug', 'soporte');
    await p.getByText(/ya lo tiene otra marca/i).waitFor({ timeout: 8000 }).catch(() => {});
    check('B', 'link reservado (soporte): no disponible', /ya lo tiene otra marca/i.test(await texto(p)));

    await p.fill('#ez-slug', `e2e-alta-b${STAMP}`);
    await p.fill('#ez-email', 'brandadmin.demotest@parygo.test');
    await p.waitForTimeout(900);
    await enviar(p);
    await p.waitForTimeout(2500);
    check('B', 'correo de alguien que ya tiene marca: lo manda a entrar', /ya tiene una cuenta/i.test(await texto(p)));

    await p.fill('#ez-email', `delivered+alta-b${STAMP}@resend.dev`);
    await enviar(p);
    await p.locator('#ez-codigo').waitFor({ timeout: 15000 });
    await codigoPara(`delivered+alta-b${STAMP}@resend.dev`);
    await p.fill('#ez-codigo', '12345678');
    await p.getByRole('button', { name: /Crear mi marca/ }).click();
    await p.waitForTimeout(3000);
    check('B', 'código incorrecto: lo dice y no crea nada', /no coincide o ya venció/i.test(await texto(p)));
    const { count } = await svc.from('brands').select('id', { count: 'exact', head: true }).eq('slug', `e2e-alta-b${STAMP}`);
    check('B', 'ninguna marca creada en los intentos fallidos', count === 0, `marcas=${count}`);
    await p.close();
  }

  // ---------- C ----------
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const email = `delivered+alta-c${STAMP}@resend.dev`;
    const nombre = `E2E Alta Prueba ${STAMP}`;
    await llenar(p, { plan: 'prueba', nombre, email });
    await p.waitForTimeout(900);
    const slug = await p.inputValue('#ez-slug');
    check('C', 'el link se arma solo desde el nombre', slug === `e2e-alta-prueba-${STAMP}`, slug);
    await enviar(p);
    await p.locator('#ez-codigo').waitFor({ timeout: 15000 });
    check('C', 'pasa a la pantalla del código con el correo enmascarado', /Revisa tu correo/.test(await texto(p)) && /d•+@resend\.dev/.test(await texto(p)));
    await p.screenshot({ path: `tmp/empezar/codigo-movil.png` });
    await p.fill('#ez-codigo', await codigoPara(email));
    await p.getByRole('button', { name: /Crear mi marca/ }).click();
    await p.waitForURL(/\/admin/, { timeout: 30000 });
    // La URL cambia antes de que el panel termine de pintar: esperar contenido.
    await p.getByText(/Primeros pasos|Inicia sesión/).first().waitFor({ timeout: 30000 }).catch(() => {});
    const panel = await p.locator('body').innerText();
    check('C', 'entra a su panel con sesión abierta', /Primeros pasos/.test(panel) && !/Inicia sesión/.test(panel), p.url());
    check('C', 'la prueba le deja crear su evento (botón "Crear evento")', await p.getByRole('link', { name: /Crear evento/ }).count() > 0,
      (panel.match(/.{0,40}(Crear|Comprar) evento.{0,20}/) ?? ['(no aparece)'])[0]);
    const { data: m } = await svc.from('brands').select('id, slug, name, event_balance, prueba_disponible, notify_yape_digest, contact_email, is_test').eq('slug', slug).single();
    if (m) marcas.push({ id: m.id, borrar: true });
    check('C', 'marca creada con la prueba y saldo 0', m?.prueba_disponible === true && m?.event_balance === 0 && m?.name === nombre, JSON.stringify(m));
    check('C', 'aviso de Yape prendido y correo de contacto', m?.notify_yape_digest === true && m?.contact_email === email);
    const { data: mem } = await svc.from('brand_members').select('role, user_id').eq('brand_id', m.id);
    check('C', 'una sola membresía, brand_admin', mem?.length === 1 && mem[0].role === 'brand_admin');
    const { data: sec } = await svc.rpc('get_brand_mp_status', { p_brand_id: m.id });
    check('C', 'secreto del webhook de MP generado (encriptado)', Array.isArray(sec) && sec.length > 0, JSON.stringify(sec));
    await svc.from('brands').update({ is_test: true }).eq('id', m.id);
    await p.screenshot({ path: `tmp/empezar/panel-prueba.png` });
    await p.close();
  }

  // ---------- D ----------
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto(`${BASE}/empezar?pack=1`, { waitUntil: 'networkidle' });
    const conPagos = !(await p.locator('.ez-plan.is-off').count());
    if (!conPagos) {
      log('D · el server no tiene PARYGO_MP_*: se saltea el pago');
    } else {
      const email = `delivered+alta-d${STAMP}@resend.dev`;
      await llenar(p, { plan: '1', nombre: `E2E Alta Pack ${STAMP}`, email });
      await p.waitForTimeout(900);
      await enviar(p);
      await p.locator('#ez-codigo').waitFor({ timeout: 15000 });
      check('D', 'el botón dice cuánto va a pagar', /Crear mi marca y pagar S\/150/.test(await texto(p)));
      await p.fill('#ez-codigo', await codigoPara(email));
      await p.getByRole('button', { name: /Crear mi marca y pagar/ }).click();
      await p.waitForURL((u) => !u.href.startsWith(BASE + '/empezar'), { timeout: 40000 });
      const url = p.url();
      // MP rechaza back_urls http://localhost ("auto_return invalid"): en local
      // lo correcto es caer a su panel, con sesión, para pagar desde ahí.
      const local = /localhost|127\.0\.0\.1/.test(BASE);
      check('D', local ? 'en local MP rechaza localhost: cae a su panel para pagar ahí' : 'sale a Mercado Pago',
        local ? /\/admin\/comprar\?cancelado=1/.test(url) : /mercadopago\.com/.test(url), url.slice(0, 80));
      const { data: m } = await svc.from('brands').select('id, event_balance, prueba_disponible').eq('slug', `e2e-alta-pack-${STAMP}`).single();
      if (m) marcas.push({ id: m.id, borrar: false });
      const { data: c } = await svc.from('pack_purchases').select('id, pack, provider, currency, amount_cents, status, provider_ref').eq('brand_id', m.id);
      check('D', 'compra de 1 evento congelada en S/150 PEN', c?.length === 1 && c[0].pack === 1 && c[0].amount_cents === 15000 && c[0].currency === 'PEN', JSON.stringify(c));
      if (local) {
        check('D', 'sin preferencia, la compra queda failed (no se puede cobrar)', c?.[0]?.status === 'failed');
        const body = await p.locator('body').innerText();
        check('D', 'la compra del panel abre con su sesión', !/Inicia sesión/.test(body), body.slice(0, 80));
      } else {
        check('D', 'pendiente y con preferencia de MP', c?.[0]?.status === 'pending' && !!c?.[0]?.provider_ref);
      }
      check('D', 'sin pagar todavía: saldo 0 y sin prueba', m?.event_balance === 0 && m?.prueba_disponible === false);
      for (const x of c ?? []) await svc.from('pack_purchases').update({ status: 'failed' }).eq('id', x.id).eq('status', 'pending');
    }
    await p.close();
  }
} catch (e) {
  check('!', 'excepción', false, e.message);
} finally {
  await b.close();
  for (const m of marcas) {
    if (m.borrar) {
      await svc.from('brand_members').delete().eq('brand_id', m.id);
      const { error } = await svc.from('brands').delete().eq('id', m.id);
      if (error) { await svc.from('brands').update({ is_test: true, archived_at: new Date().toISOString() }).eq('id', m.id); log(`marca ${m.id} archivada (no se pudo borrar: ${error.message})`); }
    } else {
      await svc.from('brands').update({ is_test: true, archived_at: new Date().toISOString() }).eq('id', m.id);
    }
  }
  for (const u of new Set(usuarios)) {
    const { count } = await svc.from('brand_members').select('brand_id', { count: 'exact', head: true }).eq('user_id', u);
    if (!count) await svc.auth.admin.deleteUser(u);
  }
  log(`limpieza: ${marcas.length} marcas, ${new Set(usuarios).size} usuarios revisados`);
}

const ok = R.filter((r) => r.ok).length;
log(`${ok === R.length ? '✅' : '❌'} ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
