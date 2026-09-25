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
// D. Pack (si el server tiene PARYGO_MP_*): datos → Pagar → Mercado Pago, sin
//    código ni cuenta; pago aprobado (simulado con la RPC del webhook) → vuelve
//    en el mismo navegador y entra directo a su panel con 1 evento de saldo.
// E. Pagó y vuelve desde otro navegador: elige la contraseña y entra.
// Para D y E el server se compila con NEXT_PUBLIC_APP_URL=https://app.parygo.com
// (MP rechaza back_urls http://localhost).
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
    await p.getByText(/ya pertenece a otra marca/i).waitFor({ timeout: 8000 }).catch(() => {});
    const t1 = await texto(p);
    check('B', 'link de una marca existente: avisa y no deja seguir', /ya pertenece a otra marca/i.test(t1) && await p.getByRole('button', { name: /Enviarme el código/ }).isDisabled());

    await p.fill('#ez-slug', 'soporte');
    await p.getByText(/ya pertenece a otra marca/i).waitFor({ timeout: 8000 }).catch(() => {});
    check('B', 'link reservado (soporte): no disponible', /ya pertenece a otra marca/i.test(await texto(p)));

    await p.fill('#ez-slug', `e2e-alta-b${STAMP}`);
    // Dominios internos (puestos de puerta, cuentas de prueba): rechazados.
    await p.fill('#ez-email', 'gate-12345678-puerta@gate.parygo.local');
    await enviar(p);
    await p.getByText(/Usa tu propio correo/).waitFor({ timeout: 10000 }).catch(() => {});
    check('B', 'correo de dominio interno (@gate.parygo.local): rechazado', /Usa tu propio correo/.test(await texto(p)));
    await p.fill('#ez-email', `delivered+alta-a${STAMP}@resend.dev`);
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
  // Pack: datos → "Pagar" → Mercado Pago, SIN código. La contraseña no viaja
  // al servidor: queda en el navegador. El pago aprobado se SIMULA con la misma
  // RPC que llama el webhook tras re-pedir el pago a MP (settle_pack_purchase);
  // la llamada real a MP necesita credenciales de prueba.
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/empezar?pack=1`, { waitUntil: 'networkidle' });
    const conPagos = !(await p.locator('.ez-plan.is-off').count());
    if (!conPagos) {
      log('D · el server no tiene PARYGO_MP_*: se saltea el pago');
    } else {
      // Un correo que ya tiene cuenta no paga: entra y compra desde su panel.
      await llenar(p, { plan: '1', nombre: 'Otro pago', slug: `e2e-alta-otro${STAMP}`, email: `delivered+alta-a${STAMP}@resend.dev` });
      await p.getByRole('button', { name: /^Pagar S\/150$/ }).click();
      await p.getByText(/ya tiene una cuenta/i).waitFor({ timeout: 15000 }).catch(() => {});
      check('D', 'correo con cuenta: no lo manda a pagar', /ya tiene una cuenta/i.test(await texto(p)) && p.url().startsWith(BASE));

      const email = `delivered+alta-d${STAMP}@resend.dev`;
      const slug = `e2e-alta-pack-${STAMP}`;
      await llenar(p, { plan: '1', nombre: `E2E Alta Pack ${STAMP}`, email });
      check('D', 'el botón es "Pagar S/150" (sin código)', await p.getByRole('button', { name: 'Pagar S/150' }).count() === 1);
      const posts = [];
      p.on('request', (r) => { if (r.method() === 'POST' && r.url().startsWith(BASE)) posts.push(r.postData() ?? ''); });
      await p.getByRole('button', { name: /^Pagar S\/150$/ }).click();
      await p.waitForURL(/mercadopago\.com/, { timeout: 40000, waitUntil: 'commit' });
      check('D', 'va directo a Mercado Pago', /mercadopago\.com/.test(p.url()), p.url().slice(0, 70));
      check('D', 'la contraseña NO viajó al servidor antes del pago', posts.length > 0 && !posts.some((x) => x.includes('E2eAlta!2026')), `${posts.length} POST`);

      const { data: m } = await svc.from('brands').select('id, name, event_balance, prueba_disponible, archived_at').eq('slug', slug).single();
      if (m) marcas.push({ id: m.id, borrar: false });
      const { count: sinDuena } = await svc.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', m.id);
      const { data: ya } = await svc.rpc('usuario_id_por_email', { p_email: email });
      check('D', 'antes de pagar: marca sin dueña y NINGUNA cuenta creada', sinDuena === 0 && !ya);
      check('D', 'antes de pagar: la marca está oculta (archivada), no se publica gratis', !!m.archived_at);

      // Alguien escribe ESE correo con otro nombre y otro link: no toca la marca
      // pendiente ajena (se crea otra aparte).
      const intruso = await ctx.newPage();
      await llenar(intruso, { plan: '1', nombre: `Intruso ${STAMP}`, slug: `e2e-alta-intruso-${STAMP}`, email });
      await intruso.getByRole('button', { name: /^Pagar S\/150$/ }).click();
      await intruso.waitForURL(/mercadopago\.com/, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
      await intruso.close();
      const { data: mSigue } = await svc.from('brands').select('name, slug').eq('id', m.id).single();
      const { data: mIntr } = await svc.from('brands').select('id').eq('slug', `e2e-alta-intruso-${STAMP}`).maybeSingle();
      if (mIntr) marcas.push({ id: mIntr.id, borrar: false });
      check('D', 'escribir el correo de otro NO renombra ni cambia el link de su marca pendiente', mSigue?.name === m.name && mSigue?.slug === slug, JSON.stringify(mSigue));
      const { data: c } = await svc.from('pack_purchases').select('id, pack, currency, amount_cents, status, provider_ref').eq('brand_id', m.id);
      check('D', 'compra pendiente de 1 evento, S/150 PEN, con preferencia de MP', c?.length === 1 && c[0].pack === 1 && c[0].amount_cents === 15000 && c[0].currency === 'PEN' && c[0].status === 'pending' && !!c[0].provider_ref, JSON.stringify(c));

      // Volver SIN pagar: la página dice "confirmando" y no deja crear nada.
      await p.goto(`${BASE}/empezar/listo?compra=${c[0].id}`, { waitUntil: 'networkidle' });
      const sinCuenta = !(await svc.rpc('usuario_id_por_email', { p_email: email })).data;
      check('D', 'sin pago aprobado: "Estamos confirmando" y ninguna cuenta', /confirmando tu pago/i.test(await texto(p)) && sinCuenta);

      // Pago aprobado (simulado, mismo camino que el webhook).
      const { data: s } = await svc.rpc('settle_pack_purchase', { p_purchase_id: c[0].id, p_provider: 'mercadopago', p_payment_id: `e2e-sim-${STAMP}`, p_paid_cents: 15000, p_currency: 'PEN' });
      check('D', 'pago aprobado acreditado (+1 evento)', s?.action === 'credited' && s?.new_balance === 1, JSON.stringify(s));

      // Se quedó en "confirmando" (la página se recarga sola): cuando llega la
      // aprobación, entra SOLO a su panel con la contraseña que dejó guardada.
      await p.waitForURL(/\/admin/, { timeout: 40000 });
      await p.getByText(/Primeros pasos|Inicia sesión/).first().waitFor({ timeout: 30000 }).catch(() => {});
      const panel = await p.locator('body').innerText();
      check('D', 'vuelve del pago y entra DIRECTO a su panel', /Primeros pasos/.test(panel) && !/Inicia sesión/.test(panel), p.url());
      const { data: duena } = await svc.from('brand_members').select('user_id, role').eq('brand_id', m.id);
      if (duena?.[0]) usuarios.push(duena[0].user_id);
      check('D', 'cuenta creada recién ahora, dueña de la marca', duena?.length === 1 && duena[0].role === 'brand_admin');
      const { data: uAlta } = await svc.auth.admin.getUserById(duena[0].user_id);
      check('D', 'la cuenta queda marcada "correo sin verificar" (las invitaciones no le cuelgan otra marca)', uAlta?.user?.user_metadata?.alta_sin_verificar === true);
      const { data: mPub } = await svc.from('brands').select('archived_at').eq('id', m.id).single();
      check('D', 'al reclamarla, la marca se publica', mPub?.archived_at === null);
      const { data: m2 } = await svc.from('brands').select('event_balance').eq('id', m.id).single();
      check('D', 'saldo de 1 evento listo para crear', m2?.event_balance === 1);
      const { error: le } = await anon().auth.signInWithPassword({ email, password: 'E2eAlta!2026' });
      check('D', 'entra con la contraseña que eligió antes de pagar', !le, le?.message);

      // Otra vez el link: ya tiene dueña → no se crea otra cuenta.
      await p.goto(`${BASE}/empezar/listo?compra=${c[0].id}`, { waitUntil: 'networkidle' });
      check('D', 'el link usado otra vez: "ya está lista"', /ya está lista/i.test(await texto(p)));
    }
    await ctx.close();
  }

  // ---------- E ----------
  // Pagó y volvió desde OTRO navegador (o el link del correo): elige la
  // contraseña en /empezar/listo.
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/empezar?pack=1`, { waitUntil: 'networkidle' });
    if (!(await p.locator('.ez-plan.is-off').count())) {
      const email = `delivered+alta-e${STAMP}@resend.dev`;
      await llenar(p, { plan: '1', nombre: `E2E Alta Otro ${STAMP}`, email });
      await p.getByRole('button', { name: /^Pagar S\/150$/ }).click();
      await p.waitForURL(/mercadopago\.com/, { timeout: 40000, waitUntil: 'commit' });
      const { data: m } = await svc.from('brands').select('id').eq('slug', `e2e-alta-otro-${STAMP}`).single();
      if (m) marcas.push({ id: m.id, borrar: false });
      const { data: c } = await svc.from('pack_purchases').select('id').eq('brand_id', m.id).single();
      await svc.rpc('settle_pack_purchase', { p_purchase_id: c.id, p_provider: 'mercadopago', p_payment_id: `e2e-sim-e${STAMP}`, p_paid_cents: 15000, p_currency: 'PEN' });

      const otro = await b.newContext({ viewport: { width: 390, height: 844 } });
      const q = await otro.newPage();
      await q.goto(`${BASE}/empezar/listo?compra=${c.id}`, { waitUntil: 'networkidle' });
      check('E', 'otro navegador: pide elegir la contraseña', /Elige tu contraseña/.test(await q.locator('main').innerText()));
      await q.screenshot({ path: 'tmp/empezar/listo-elegir.png' });
      await q.fill('#ez-pass2', 'OtraClave!2026');
      await q.getByRole('button', { name: /Ingresar a mi panel/ }).click();
      await q.waitForURL(/\/admin/, { timeout: 40000 });
      await q.getByText(/Primeros pasos|Inicia sesión/).first().waitFor({ timeout: 30000 }).catch(() => {});
      check('E', 'entra a su panel con la contraseña nueva', /Primeros pasos/.test(await q.locator('body').innerText()));
      const { data: duena } = await svc.from('brand_members').select('user_id').eq('brand_id', m.id);
      if (duena?.[0]) usuarios.push(duena[0].user_id);
      await otro.close();
    }
    await ctx.close();
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
      // Con compra no se puede borrar (on delete restrict): archivada, is_test
      // y sin dueña (la cuenta de prueba se borra abajo).
      await svc.from('brand_members').delete().eq('brand_id', m.id);
      await svc.from('pack_purchases').update({ status: 'failed' }).eq('brand_id', m.id).eq('status', 'pending');
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
