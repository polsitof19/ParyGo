// Alta autoservicio (/empezar) contra un server LOCAL que habla con la base de
// producción. Volumen: pocas marcas y usuarios de prueba, que se borran al
// final (la marca con compra no se puede borrar —pack_purchases es on delete
// restrict—: queda ARCHIVADA, is_test y con la compra en 'failed').
//
//   node e2e/empezar.mjs            (server en BASE, por defecto localhost:3001)
//
// Flujo desde 2026-10-01 (bloque "Cuentas"): paquete (o Prueba gratis) →
// nombre → enlace → correo + WhatsApp → CÓDIGO de 6 dígitos al correo →
// contraseña (8+, mayúscula, minúscula, número) → Pagar / "Crear mi prueba".
// El test no lee correos: el código válido lo fabrica con generateLink
// (magiclink) DESPUÉS de que la app mandó el suyo (el último anula al anterior).
// A. Permisos de usuario_id_por_email y una persona = dueña de UNA marca.
// B. Negativos en el paso del correo: link ocupado, reservado, correo interno,
//    correo de alguien con cuenta. Ninguno crea marca.
// C. Se ofrece la Prueba gratis + paquetes 1/3/5/10; ?pack=prueba la elige.
// F. Prueba gratis completa: contraseña débil rechazada, código incorrecto,
//    reenviar antes de 60 s, marca publicada con dueña y entra a /admin.
// G. Prueba con un WhatsApp ya usado: rechazo y no crea marca.
// D. Paquete: tras finalizarAlta queda marca ARCHIVADA, sin dueña y con
//    alta_usuario; pago aprobado (settle_pack_purchase) → /empezar/listo con la
//    MISMA sesión publica; con OTRA sesión rechaza; sin sesión va a
//    /login?next=... y al entrar vuelve y reclama.
// Para D el server se levanta con PARYGO_MP_ACCESS_TOKEN/WEBHOOK_SECRET (con
// credenciales ficticias la compra queda 'failed' y se simula igual el pago) y
// se compila con NEXT_PUBLIC_APP_URL=https://app.parygo.com.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { svc, anon, env, BASE, log, otpSession } from './lib.mjs';

const STAMP = Date.now().toString().slice(-7);
const R = [];
const check = (paso, nombre, ok, detalle = '') => { R.push({ paso, nombre, ok }); log(`${paso} ${ok ? '✔' : '✘'} ${nombre}${detalle ? ' — ' + detalle : ''}`); };
const usuarios = [];
const marcas = [];
const PASS = 'E2eAlta!2026';
// Un WhatsApp peruano de 9 dígitos distinto por corrida (la prueba es 1 por número).
const WA = `95${STAMP}`;

// El alta es paso a paso: paquete → nombre → enlace → correo+WhatsApp → código
// → contraseña. "Continuar" valida cada paso.
const continuar = (p) => p.getByRole('button', { name: /^(Continuar|Continue)/ }).click();
// Espera a que el chequeo del enlace (450 ms + servidor) diga algo.
const linkResuelto = (p) => p.locator('#e-slug').filter({ hasText: /Disponible|ya pertenece|Solo minúsculas/ }).waitFor({ timeout: 10000 }).catch(() => {});
// Llena hasta el paso del correo y manda el código (queda en la pantalla del
// código si el servidor lo aceptó, o en el paso del correo con su error).
async function llenar(p, { plan, nombre, slug, email, wa = WA, pais }) {
  await p.goto(`${BASE}/empezar?tipo=marca`, { waitUntil: 'networkidle' });
  await p.locator(`.ez-plan:has(input[value="${plan}"])`).click();
  await continuar(p);
  await p.fill('#ez-nombre', nombre);
  // País (moneda + hora de la marca). Sin elegir queda el del dispositivo.
  if (pais) await p.selectOption('#ez-pais', pais);
  else paisPorDefecto = await p.locator('#ez-pais').inputValue();
  await continuar(p);
  if (slug) await p.fill('#ez-slug', slug);
  await linkResuelto(p);
  await continuar(p);
  await p.fill('#ez-email', email);
  await p.fill('#ez-wa', wa);
  await continuar(p);
}
// Código válido para ese correo: un link nuevo con service role (invalida el
// que mandó la app, como lo haría la persona con el suyo).
let paisPorDefecto = null;
async function codigoPara(email) {
  const { data, error } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error('generateLink ' + error.message);
  return data.properties.email_otp;
}
// Escribe el código bueno y pasa a la contraseña.
async function conCodigo(p, email) {
  await p.locator('#ez-codigo').waitFor({ timeout: 15000 });
  await p.fill('#ez-codigo', await codigoPara(email));
  await continuar(p);
  await p.locator('#ez-pass').waitFor({ timeout: 15000 }).catch(async () => { const t = (await texto(p)).replace(/\s+/g, ' '); throw new Error(/^Paso 1 de 6/.test(t) ? 'con el código correcto la pantalla se REINICIÓ al paso 1 (se perdieron los datos)' : 'no llegó a la contraseña. Pantalla: ' + t.slice(0, 200)); });
}
async function rastrear(email) {
  const { data } = await svc.rpc('usuario_id_por_email', { p_email: email });
  if (data) usuarios.push(data);
  return data;
}
const pagarBtn = (p) => p.getByRole('button', { name: /^(Pagar |Crear mi prueba)/ });
const texto = (p) => p.locator('main').innerText();
// Un bloque que se rompe no tapa a los demás: queda como una falla con su motivo.
const bloque = (paso, fn) => fn().catch((e) => check(paso, 'excepción', false, String(e.message).split(/\s+/).join(' ').slice(0, 600)));

const b = await chromium.launch();
try {
  // ---------- A ----------
  {
    const email = `delivered+alta-a${STAMP}@resend.dev`;
    const { data, error } = await svc.auth.admin.generateLink({ type: 'signup', email, password: 'E2eAlta!2026' });
    if (error) throw new Error(error.message);
    usuarios.push(data.user.id);
    const v = await anon().auth.verifyOtp({ email, token: data.properties.email_otp, type: 'email' });
    check('A', 'cuenta confirmada de apoyo creada (la usan B y D)', !!v.data?.session && !v.error, v.error?.message ?? 'sesión ok');

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
  // Los negativos frenan en el paso del correo (enviarCodigo) o antes: ningún
  // código sale ni se crea marca.
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto(`${BASE}/empezar?tipo=marca`, { waitUntil: 'networkidle' });
    await p.locator('.ez-plan:has(input[value="prueba"])').click();
    await continuar(p);
    await p.fill('#ez-nombre', 'Otro Code');
    await continuar(p);
    await p.fill('#ez-slug', 'code');
    await linkResuelto(p);
    await continuar(p);
    const t1 = await texto(p);
    check('B', 'link de una marca existente: avisa y no deja seguir', /ya pertenece a otra marca/i.test(t1) && (await p.locator('#ez-slug').count()) === 1 && (await p.locator('#ez-email').count()) === 0);

    await p.fill('#ez-slug', 'soporte');
    await p.getByText(/ya pertenece a otra marca/i).first().waitFor({ timeout: 10000 }).catch(() => {});
    check('B', 'link reservado (soporte): no disponible', /ya pertenece a otra marca/i.test(await texto(p)));

    await p.fill('#ez-slug', `e2e-alta-b${STAMP}`);
    await linkResuelto(p);
    await continuar(p);
    // Dominios internos (puestos de puerta, cuentas de prueba): el servidor
    // los rechaza y el alta se queda en el paso del correo, sin código.
    await p.fill('#ez-email', 'gate-12345678-puerta@gate.parygo.local');
    await p.fill('#ez-wa', WA);
    await continuar(p);
    await p.getByText(/Usa tu propio correo/).waitFor({ timeout: 15000 }).catch(() => {});
    check('B', 'correo de dominio interno (@gate.parygo.local): rechazado, sigue en el paso del correo', /Usa tu propio correo/.test(await texto(p)) && (await p.locator('#ez-email').count()) === 1 && (await p.locator('#ez-codigo').count()) === 0);
    await p.fill('#ez-email', `delivered+alta-a${STAMP}@resend.dev`);
    await continuar(p);
    // Un correo que YA tiene cuenta responde igual que uno nuevo (no revela
    // quién tiene cuenta): aparece la pantalla del código y no se crea marca.
    await p.locator('#ez-codigo').waitFor({ timeout: 15000 }).catch(() => {});
    check('B', 'correo de alguien que ya tiene cuenta: misma pantalla del código que un alta nueva, sin avisar que existe', (await p.locator('#ez-codigo').count()) === 1 && !/ya tiene una cuenta/i.test(await texto(p)));

    const { count } = await svc.from('brands').select('id', { count: 'exact', head: true }).eq('slug', `e2e-alta-b${STAMP}`);
    check('B', 'ninguna marca creada en los intentos fallidos', count === 0, `marcas=${count}`);
    await p.close();
  }

  // ---------- C ----------
  // Vuelve la prueba gratis: se ofrece primero y un link con ?pack=prueba la elige.
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto(`${BASE}/empezar?tipo=marca&pack=prueba`, { waitUntil: 'networkidle' });
    const txt = await texto(p);
    const opciones = await p.locator('.ez-plan input[type=radio]').evaluateAll((xs) => xs.map((x) => x.value));
    check('C', 'se ofrece la prueba gratis y los paquetes 1/3/5/10', JSON.stringify(opciones) === '["prueba","1","3","5","10"]' && /Prueba gratis/.test(txt) && /hasta 10 entradas/.test(txt), JSON.stringify(opciones));
    const marcado = await p.locator('.ez-plan input[type=radio]:checked').getAttribute('value');
    check('C', 'un link con ?pack=prueba elige la prueba', marcado === 'prueba', marcado);
    await p.goto(`${BASE}/empezar?tipo=privado`, { waitUntil: 'networkidle' });
    check('C', 'el evento privado no tiene prueba', (await p.locator('.ez-plan input[value="prueba"]').count()) === 0);
    await p.goto(`${BASE}/empezar?tipo=marca&lang=en`, { waitUntil: 'networkidle' });
    check('C', 'en inglés: "Free trial"', /Free trial/.test(await texto(p)));
    await p.close();
  }

  // ---------- Q ----------
  // Primera pregunta (2026-09-28): "¿Qué vas a organizar?" antes del
  // formulario. Marca → el formulario de siempre con el pack/moneda que traía;
  // evento privado (0075) → el mismo alta a S/50 con tope 200; la vuelta de
  // un pago cancelado va directo al formulario.
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto(`${BASE}/empezar?pack=3&moneda=PEN`, { waitUntil: 'networkidle' });
    const t0 = await texto(p);
    const cards = await p.locator('.ez-tipo__card').count();
    check('Q', 'sin tipo: primero la pregunta, sin formulario', /¿Qué vas a organizar\?/.test(t0) && cards === 2 && (await p.locator('#ez-email').count()) === 0, `tarjetas=${cards}`);

    await p.getByRole('link', { name: /Una marca o productora/ }).click();
    await p.waitForURL(/tipo=marca/);
    const u = new URL(p.url());
    const marcado = await p.locator('.ez-plan input[type=radio]:checked').getAttribute('value');
    check('Q', 'marca: paso 1 de 6 con el pack y la moneda que traía', u.searchParams.get('pack') === '3' && u.searchParams.get('moneda') === 'PEN' && marcado === '3' && (await p.locator('.ez-plan').count()) === 5 && /Paso 1 de 6/.test(await texto(p)), p.url().replace(BASE, ''));
    // Antes de pagar ve TODO lo que incluye (celular: 5 grupos plegables, el
    // primero abierto; la compu lo muestra en el costado).
    const grupos = await p.locator('.ez-incluye__grupo').count();
    const abierto = await p.locator('.ez-incluye__grupo[open]').count();
    check('Q', 'marca: "Todo lo que incluye" antes de los datos (5 grupos, 1 abierto)', /Todo lo que incluye cada evento/.test(await texto(p)) && grupos === 5 && abierto === 1, `grupos=${grupos} abiertos=${abierto}`);

    // Celular: el botón del paso SIEMPRE a la vista sin bajar (barra fija),
    // medido en el paso más largo (Paul, 2026-09-28).
    const bb = await p.getByRole('button', { name: /^Continuar/ }).boundingBox();
    check('Q', 'celular: "Continuar" se ve sin bajar en el paso 1 (el más largo)', !!bb && bb.y >= 0 && bb.y + bb.height <= 844, bb ? `y=${Math.round(bb.y)} fin=${Math.round(bb.y + bb.height)} de 844` : 'sin botón');

    // Paso a paso con vista previa en vivo.
    await continuar(p);
    await continuar(p); // sin nombre: no avanza
    const sinNombre = (await p.locator('#ez-nombre').count()) === 1 && /Escribe el nombre de tu marca/.test(await texto(p));
    await p.fill('#ez-nombre', 'Noches Qa');
    await p.locator('.ez-vp--movil').filter({ hasText: 'noches-qa.parygo.com' }).waitFor({ timeout: 5000 }).catch(() => {});
    const vp = await p.locator('.ez-vp--movil').innerText();
    check('Q', 'paso 2: "¿Cómo se llama tu marca?", no avanza vacío y la barra muestra el enlace armado al escribir', sinNombre && /Paso 2 de 6/.test(await texto(p)) && /noches-qa\.parygo\.com/.test(vp), vp.replace(/\s+/g, ' ').slice(0, 90));
    await continuar(p);
    check('Q', 'paso 3: "¿Cómo quieres tu enlace?" con el enlace armado desde el nombre', /Paso 3 de 6/.test(await texto(p)) && (await p.inputValue('#ez-slug')) === 'noches-qa');
    // La barra del celular dibujado: check verde si está libre, ✕ si no.
    await linkResuelto(p);
    const okLibre = (await p.locator('.ez-vp--movil .ez-vp__ok').count()) === 1;
    await p.fill('#ez-slug', 'code');
    await p.locator('.ez-vp--movil .ez-vp__no').waitFor({ timeout: 10000 }).catch(() => {});
    const noTomado = (await p.locator('.ez-vp--movil .ez-vp__no').count()) === 1 && (await p.locator('.ez-vp--movil .ez-vp__ok').count()) === 0;
    check('Q', 'la barra muestra check verde con un enlace libre y ✕ con uno ocupado', okLibre && noTomado, `libre=${okLibre} ocupado=${noTomado}`);
    await p.fill('#ez-slug', 'noches-qa');
    await linkResuelto(p);
    await p.getByRole('button', { name: /Atrás/ }).click();
    check('Q', '"Atrás" vuelve al nombre sin perderlo', (await p.inputValue('#ez-nombre')) === 'Noches Qa');
    // WhatsApp mal escrito: frena en SU paso (antes recién lo decía el
    // servidor al pagar — review de Codex 2026-09-28).
    await continuar(p);
    await linkResuelto(p);
    await continuar(p);
    const t4 = await texto(p);
    check('Q', 'paso 4: "¿Cuál es tu correo?" dice que sirve para ingresar y para los avisos', /¿Cuál es tu correo\?/.test(t4) && /Para ingresar a tu panel/.test(t4) && /Para tus avisos/.test(t4));
    await p.fill('#ez-email', `qa${STAMP}@example.com`);
    await p.fill('#ez-wa', '123');
    await continuar(p);
    const waFrena = (await p.locator('#ez-wa').count()) === 1 && /Incluye el código de país/.test(await texto(p)) && (await p.locator('#ez-codigo').count()) === 0;
    check('Q', 'WhatsApp mal escrito no deja avanzar (ni manda código)', waFrena);

    // Evento privado (0075): el mismo alta, un solo plan de S/50 con tope
    // 200, SIN "entradas ilimitadas" en la lista, y la pregunta del nombre
    // habla del evento.
    await p.goto(`${BASE}/empezar?pack=3&moneda=PEN`, { waitUntil: 'networkidle' });
    await p.getByRole('link', { name: /Un evento privado/ }).click();
    await p.waitForURL(/tipo=privado/);
    const t1 = await texto(p);
    const planesPriv = await p.locator('.ez-plan').count();
    check('Q', 'evento privado: un solo plan "1 evento privado" de S/50, hasta 200 entradas', planesPriv === 1 && /1 evento privado/.test(t1) && /S\/50/.test(t1) && /Hasta 200 entradas/.test(t1), `planes=${planesPriv}`);
    check('Q', 'evento privado: la lista de lo que incluye NO promete entradas ilimitadas', /Todo lo que incluye tu evento/.test(t1) && !/ilimitad/i.test(t1));
    await continuar(p);
    check('Q', 'evento privado: "¿Cómo se llama tu evento?"', /¿Cómo se llama tu evento\?/.test(await texto(p)));
    check('Q', 'evento privado: el formulario manda tipo=privado al servidor', (await p.locator('input[name="tipo"]').inputValue()) === 'privado');

    await p.goto(`${BASE}/empezar?pack=1&moneda=PEN&cancelado=1`, { waitUntil: 'networkidle' });
    const t2 = await texto(p);
    check('Q', 'vuelta de un pago cancelado: directo al formulario, con su aviso', (await p.locator('.ez-plan').count()) === 5 && /no se completó/i.test(t2) && !/¿Qué vas a organizar\?/.test(t2));

    await p.goto(`${BASE}/empezar?lang=en`, { waitUntil: 'networkidle' });
    check('Q', 'en inglés: "What are you organizing?"', /What are you organizing\?/.test(await texto(p)));
    await p.close();
  }

  // ---------- F ----------
  // Prueba gratis completa, en el celular.
  await bloque('F', async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const email = `delivered+alta-f${STAMP}@resend.dev`;
    const slug = `e2e-alta-f${STAMP}`;
    await llenar(p, { plan: 'prueba', nombre: `E2E Prueba ${STAMP}`, slug, email, pais: 'CO' });
    await p.locator('#ez-codigo').waitFor({ timeout: 15000 });
    const tc = await texto(p);
    check('F', 'pasa a la pantalla del código y dice a qué correo llegó', /Te mandamos un código/.test(tc) && tc.includes(email));
    await rastrear(email);

    await p.getByRole('button', { name: 'Reenviar código' }).click();
    await p.locator('#e-codigo').filter({ hasText: /Espera un minuto/ }).waitFor({ timeout: 15000 }).catch(() => {});
    check('F', 'reenviar antes de 60 s: "Espera un minuto"', /Espera un minuto para pedir otro/.test(await p.locator('#e-codigo').innerText()));

    await p.fill('#ez-codigo', '12345678');
    await continuar(p);
    await p.locator('#e-codigo.ez-err').waitFor({ timeout: 15000 }).catch(() => {});
    check('F', 'código incorrecto: lo dice y se queda en el código', /no es correcto o ya venció/.test(await texto(p)) && (await p.locator('#ez-pass').count()) === 0);

    await p.getByRole('button', { name: 'Reenviar código' }).click();
    await p.locator('#e-codigo').filter({ hasText: /Espera un minuto/ }).waitFor({ timeout: 15000 }).catch(() => {});
    check('F', 'reenviar después de un código incorrecto también muestra su aviso', /Espera un minuto para pedir otro/.test(await p.locator('#e-codigo').innerText()));

    await conCodigo(p, email);
    check('F', 'con el código bueno pasa a la contraseña', /Paso 6 de 6/.test(await texto(p)) && (await pagarBtn(p).innerText()).includes('Crear mi prueba'));

    await p.fill('#ez-pass', 'abcdefgh1');
    const reglasOk = await p.locator('.ez-reglas li.is-ok').count();
    const apagado = await pagarBtn(p).isDisabled();
    await pagarBtn(p).evaluate((e) => { e.disabled = false; });
    await pagarBtn(p).click();
    await p.locator('#e-pass.ez-err').waitFor({ timeout: 5000 }).catch(() => {});
    check('F', 'contraseña débil ("abcdefgh1", sin mayúscula): 3 de 4 reglas, botón apagado y, forzado, la rechaza', reglasOk === 3 && apagado && /Mínimo 8 caracteres/.test(await p.locator('#e-pass').innerText()) && !p.url().includes('/admin'), `reglas=${reglasOk}`);

    await p.fill('#ez-pass', PASS);
    check('F', 'con una buena, las 4 reglas en verde', (await p.locator('.ez-reglas li.is-ok').count()) === 4);
    await pagarBtn(p).click();
    await p.waitForURL(/\/admin/, { timeout: 40000 });
    check('F', '"Crear mi prueba" entra a /admin', /\/admin/.test(p.url()), p.url());
    const { data: m } = await svc.from('brands').select('id, archived_at, prueba_disponible, alta_usuario, whatsapp_e164, tipo, moneda, zona_horaria, metodo_manual').eq('slug', slug).single();
    if (m) { marcas.push({ id: m.id, borrar: true }); await svc.from('brands').update({ is_test: true }).eq('id', m.id); }
    check('F', 'eligió Colombia: la marca nace en COP, hora de Bogotá y Nequi', m.moneda === 'COP' && m.zona_horaria === 'America/Bogota' && m.metodo_manual === 'nequi', JSON.stringify({ moneda: m.moneda, zona: m.zona_horaria, medio: m.metodo_manual }));
    const { data: mem } = await svc.from('brand_members').select('user_id, role').eq('brand_id', m.id);
    const uid = await rastrear(email);
    check('F', 'marca publicada, con prueba disponible y dueña = quien verificó', m.archived_at === null && m.prueba_disponible === true && mem?.length === 1 && mem[0].role === 'brand_admin' && mem[0].user_id === uid, JSON.stringify({ arch: m.archived_at, prueba: m.prueba_disponible, mem }));
    const { error: le } = await anon().auth.signInWithPassword({ email, password: PASS });
    check('F', 'entra con la contraseña que eligió', !le, le?.message);
    await ctx.close();
  });

  // ---------- G ----------
  // Otra prueba con el MISMO WhatsApp: rechazada, sin marca.
  await bloque('G', async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const email = `delivered+alta-g${STAMP}@resend.dev`;
    const slug = `e2e-alta-g${STAMP}`;
    await llenar(p, { plan: 'prueba', nombre: `E2E Prueba G ${STAMP}`, slug, email });
    await conCodigo(p, email);
    await rastrear(email);
    await p.fill('#ez-pass', PASS);
    await pagarBtn(p).click();
    await p.getByText(/ya usó una prueba gratis/).first().waitFor({ timeout: 20000 }).catch(() => {});
    const { count } = await svc.from('brands').select('id', { count: 'exact', head: true }).eq('slug', slug);
    check('G', 'WhatsApp que ya usó una prueba: rechazo, vuelve al paso del WhatsApp y no crea marca', /ya usó una prueba gratis/.test(await texto(p)) && (await p.locator('#ez-wa').count()) === 1 && count === 0, `marcas=${count}`);
    await ctx.close();
  });

  // ---------- D / H ----------
  // Paquete: el alta crea la marca ARCHIVADA, sin dueña y con alta_usuario; el
  // pago aprobado se SIMULA con la RPC del webhook (settle_pack_purchase). Con
  // credenciales de MP ficticias la preferencia falla y la compra queda
  // 'failed' (settle_pack_purchase acredita igual desde 'failed').
  async function altaPack(ctx, sfx) {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/empezar?tipo=marca&pack=1`, { waitUntil: 'networkidle' });
    if (await p.locator('.ez-plan.is-off').count()) return null;
    const email = `delivered+alta-${sfx}${STAMP}@resend.dev`;
    const slug = `e2e-alta-${sfx}-${STAMP}`;
    await llenar(p, { plan: '1', nombre: `E2E Alta ${sfx} ${STAMP}`, slug, email, wa: `9${sfx === 'd' ? '6' : '7'}${STAMP}` });
    await conCodigo(p, email);
    const userId = await rastrear(email);
    await p.fill('#ez-pass', PASS);
    const boton = await pagarBtn(p).innerText();
    await pagarBtn(p).click();
    await Promise.race([
      p.waitForURL(/mercadopago\.com/, { timeout: 40000, waitUntil: 'commit' }),
      p.locator('.ez-banner[role=alert]').waitFor({ timeout: 40000 }),
    ]).catch(() => {});
    const { data: m } = await svc.from('brands').select('id, archived_at, alta_usuario, moneda, zona_horaria').eq('slug', slug).single();
    marcas.push({ id: m.id, borrar: false });
    check('D', `sin elegir país: el del dispositivo (${paisPorDefecto}) → marca en PEN y hora de Lima`, paisPorDefecto === 'PE' && m.moneda === 'PEN' && m.zona_horaria === 'America/Lima', JSON.stringify({ paisPorDefecto, moneda: m.moneda, zona: m.zona_horaria }));
    await svc.from('brands').update({ is_test: true }).eq('id', m.id);
    const { count: miembros } = await svc.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', m.id);
    const { data: c } = await svc.from('pack_purchases').select('id, pack, currency, amount_cents, status').eq('brand_id', m.id);
    return { p, email, slug, userId, m, miembros, c, boton, enMp: /mercadopago\.com/.test(p.url()) };
  }
  const aprobar = (id, tag) => svc.rpc('settle_pack_purchase', { p_purchase_id: id, p_provider: 'mercadopago', p_payment_id: `e2e-sim-${tag}${STAMP}`, p_paid_cents: 15000, p_currency: 'PEN' });
  const btnPanel = (p) => p.getByRole('button', { name: /Ingresar a mi panel/ });

  await bloque('D', async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Lima' });
    const a = await altaPack(ctx, 'd');
    if (!a) {
      log('D · el server no tiene PARYGO_MP_*: se saltea');
    } else {
      const { p, email, userId, m, c } = a;
      check('D', 'el botón es "Pagar S/150" (tras el código y la contraseña)', a.boton.startsWith('Pagar S/150'), a.boton);
      check('D', 'tras finalizarAlta: marca archivada, sin dueña y con alta_usuario = quien verificó', !!m.archived_at && a.miembros === 0 && m.alta_usuario === userId && !!userId, JSON.stringify({ arch: !!m.archived_at, miembros: a.miembros }));
      check('D', 'compra de 1 evento, S/150 PEN, creada (' + (a.enMp ? 'fue a Mercado Pago' : 'MP ficticio: queda failed') + ')', c?.length === 1 && c[0].pack === 1 && c[0].amount_cents === 15000 && c[0].currency === 'PEN', JSON.stringify(c));

      // Sin pago: /listo no deja reclamar nada.
      await p.goto(`${BASE}/empezar/listo?compra=${c[0].id}`, { waitUntil: 'networkidle' });
      check('D', 'sin pago aprobado no hay botón de reclamar', (await btnPanel(p).count()) === 0);

      const { data: s } = await aprobar(c[0].id, 'd');
      check('D', 'pago aprobado acreditado (+1 evento)', s?.action === 'credited' && s?.new_balance === 1, JSON.stringify(s));

      // OTRA sesión (otra persona ya con cuenta): rechazo, la marca sigue pendiente.
      const otro = await b.newContext({ viewport: { width: 390, height: 844 } });
      const q = await otro.newPage();
      await q.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await q.fill('#email', `delivered+alta-a${STAMP}@resend.dev`);
      await q.fill('#password', PASS);
      await q.locator('form button[type=submit]').click();
      await q.waitForURL(/\/admin/, { timeout: 30000 });
      await q.goto(`${BASE}/empezar/listo?compra=${c[0].id}`, { waitUntil: 'networkidle' });
      await btnPanel(q).click();
      await q.getByText(/Entraste con otra cuenta/).waitFor({ timeout: 15000 }).catch(() => {});
      const { data: m2 } = await svc.from('brands').select('archived_at').eq('id', m.id).single();
      const { count: mi2 } = await svc.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', m.id);
      check('D', 'con OTRA sesión: "Entraste con otra cuenta", la marca sigue archivada y sin dueña', /Entraste con otra cuenta/.test(await texto(q)) && !!m2.archived_at && mi2 === 0);
      await otro.close();

      // La MISMA sesión (la de la contraseña recién puesta) la reclama.
      await p.goto(`${BASE}/empezar/listo?compra=${c[0].id}`, { waitUntil: 'networkidle' });
      check('D', 'pagó y vuelve con su sesión: no le pide contraseña, solo "Ingresar a mi panel"', (await btnPanel(p).count()) === 1 && (await p.locator('#ez-pass2').count()) === 0);
      await btnPanel(p).click();
      await p.waitForURL(/\/admin/, { timeout: 40000 });
      const { data: m3 } = await svc.from('brands').select('archived_at, event_balance').eq('id', m.id).single();
      const { data: mem } = await svc.from('brand_members').select('user_id, role').eq('brand_id', m.id);
      check('D', 'MISMA sesión: marca publicada, dueña = quien verificó, saldo 1', m3.archived_at === null && m3.event_balance === 1 && mem?.length === 1 && mem[0].user_id === userId && mem[0].role === 'brand_admin', JSON.stringify({ m3, mem }));
      const { data: uAlta } = await svc.auth.admin.getUserById(userId);
      check('D', 'la cuenta NO lleva "alta_sin_verificar" (el correo se verificó con el código)', uAlta?.user?.user_metadata?.alta_sin_verificar !== true && !!uAlta?.user?.email_confirmed_at);
      await p.goto(`${BASE}/empezar/listo?compra=${c[0].id}`, { waitUntil: 'networkidle' });
      check('D', 'el link usado otra vez: "ya está lista"', /ya está lista/i.test(await texto(p)));
    }
    await ctx.close();
  });

  // H: pagó y vuelve SIN sesión (otro navegador): login con next y reclama.
  await bloque('H', async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const a = await altaPack(ctx, 'h');
    if (a) {
      const { m, c, email, userId } = a;
      await aprobar(c[0].id, 'h');
      const nuevo = await b.newContext({ viewport: { width: 390, height: 844 } });
      const q = await nuevo.newPage();
      const listo = `/empezar/listo?compra=${c[0].id}&lang=es`;
      await q.goto(`${BASE}/empezar/listo?compra=${c[0].id}`, { waitUntil: 'networkidle' });
      await btnPanel(q).click();
      await q.waitForURL(/\/login\?next=/, { timeout: 15000 }).catch(() => {});
      const nx = new URL(q.url()).searchParams.get('next');
      check('H', 'sin sesión: lo manda a /login con next a /empezar/listo?compra=', /\/login/.test(q.url()) && nx === listo, q.url().replace(BASE, ''));
      await q.fill('#email', email);
      await q.fill('#password', PASS);
      await q.locator('form button[type=submit]').click();
      await q.waitForURL(/\/empezar\/listo\?compra=/, { timeout: 30000 }).catch(() => {});
      check('H', 'tras entrar vuelve a /empezar/listo', /\/empezar\/listo\?compra=/.test(q.url()), q.url().replace(BASE, ''));
      await btnPanel(q).click();
      await q.waitForURL(/\/admin/, { timeout: 40000 }).catch(() => {});
      const { data: m3 } = await svc.from('brands').select('archived_at').eq('id', m.id).single();
      const { data: mem } = await svc.from('brand_members').select('user_id').eq('brand_id', m.id);
      check('H', 'y reclama: marca publicada y dueña = quien verificó', /\/admin/.test(q.url()) && m3.archived_at === null && mem?.length === 1 && mem[0].user_id === userId);
      await nuevo.close();
    }
    await ctx.close();
  });
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
  // Los topes por correo/conexión (ticket_resend_attempts) que dejaron ESTAS
  // altas de prueba: sin borrarlos, 4 corridas seguidas agotan el tope por IP.
  for (const pre of ['alta', 'verif', 'prueba']) await svc.from('ticket_resend_attempts').delete().like('email', `${pre}:delivered+alta-%@resend.dev`);
  log(`limpieza: ${marcas.length} marcas, ${new Set(usuarios).size} usuarios revisados`);
}

const ok = R.filter((r) => r.ok).length;
log(`${ok === R.length ? '✅' : '❌'} ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
