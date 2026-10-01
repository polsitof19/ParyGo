'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';
import { esTipoMarca, packDe } from '@/lib/packs';
import { mpListo, paypalListo } from '@/lib/cobroParygo';
import { iniciarCompraPack } from '@/lib/compraPack';
import { crearMarcaParaUsuario, SLUGS_RESERVADOS, SLUG_RE } from '@/lib/altaMarca';
import { passwordOk, passwordAlAzar } from '@/lib/password';
import { sendCodigoAlta } from '@/lib/email/sendCodigoAlta';
import { sendYaTienesCuenta } from '@/lib/email/sendAltaEmails';
import { TEXTOS, esLang, esMoneda, type Lang, type Textos } from './textos';

// =============================================================
// Alta AUTOSERVICIO de un organizador (app.parygo.com/empezar).
// =============================================================
// Desde 2026-10-01 (bloque "Cuentas", AGENTS.md) TODA alta confirma el correo
// con un código de 8 dígitos ANTES de seguir (Paul: "para que no creen así
// como si nada"), y vuelve la PRUEBA GRATIS (1 evento, hasta 10 entradas).
//   1. enviarCodigo: valida los datos, manda el código. Usuario nuevo SIN
//      confirmar y con contraseña AL AZAR (con la suya acá, cualquiera
//      pre-registraba el correo de otro: security review 2026-09-25).
//   2. confirmarCodigo: verifyOtp → correo verificado y sesión abierta.
//   3. finalizarAlta: recién ahí fija SU contraseña (lib/password.ts) y
//      - prueba: crea la marca con dueña y publicada → /admin;
//      - paquete: crea la marca ARCHIVADA y SIN dueña (la limpieza 0072 y
//        /empezar/listo se apoyan en eso) con alta_usuario = quien verificó,
//        y manda a pagar. /empezar/listo solo deja reclamarla a ESA persona.
// El correo SIEMPRE sale de la sesión verificada, nunca del form (revisión
// adversarial de Codex). Candados (tomar_candado, 0080) contra doble envío.
// El monto del pack lo pone el servidor (lib/packs.ts + la pasarela).
// Idioma: el formulario manda `lang` y los mensajes salen en ese idioma.
// =============================================================

// WhatsApp internacional en E.164. Un celular peruano de 9 dígitos (9xxxxxxxx)
// sin código se completa con +51; cualquier otro necesita su "+código".
function normalizarWhatsapp(v: string): string {
  const x = v.replace(/[\s\-().]/g, '');
  if (x === '') return '';
  if (/^9\d{8}$/.test(x)) return `+51${x}`;
  return x.startsWith('00') ? `+${x.slice(2)}` : x;
}

function esquema(m: Textos['m']) {
  return z.object({
    nombre: z.string().trim().min(2, m.nombreCorto).max(60, m.nombreLargo),
    slug: z.string().trim().toLowerCase().regex(SLUG_RE, m.slugMal),
    email: z.string().trim().toLowerCase().email(m.correoMal).max(200)
      // Dominios internos (puestos de puerta @gate.parygo.local, cuentas de
      // prueba @parygo.test, el propio parygo.com): nadie se registra con ellos.
      .refine((e) => !/@(?:[a-z0-9-]+\.)*parygo\.(?:local|test|com)$/.test(e), m.correoPropio),
    whatsapp: z.string().transform(normalizarWhatsapp).refine((v) => v === '' || /^\+\d{8,15}$/.test(v), m.waMal),
    plan: z.enum(['prueba', '1', '3', '5', '10']),
  }).superRefine((d, ctx) => {
    // La prueba pide WhatsApp: 1 prueba por número (anti-abuso).
    if (d.plan === 'prueba' && !d.whatsapp) ctx.addIssue({ code: 'custom', path: ['whatsapp'], message: m.waObligatorio });
  });
}

type Campo = 'nombre' | 'slug' | 'email' | 'password' | 'whatsapp' | 'codigo';
export type AltaState = {
  ok: boolean;
  paso: 'datos' | 'codigo' | 'clave';
  message: string | null;
  fieldErrors?: Partial<Record<Campo, string>>;
  // A dónde ir (p. ej. /admin si ya tenía marca). Lo usa la verificación por
  // fetch (verificar/route.ts), que no puede hacer redirect.
  ir?: string;
};

function errores(e: z.ZodError): AltaState['fieldErrors'] {
  const out: Record<string, string> = {};
  for (const i of e.errors) {
    const k = i.path.join('.');
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}

// Datos del form. El evento privado es de a UNO (0075) y no tiene prueba.
function leerDatos(fd: FormData, m: Textos['m']) {
  const tipo = esTipoMarca(fd.get('tipo'));
  const planForm = String(fd.get('plan') ?? '');
  const plan = tipo === 'privado' ? '1' : planForm;
  return { tipo, p: esquema(m).safeParse({
    nombre: fd.get('nombre') ?? '', slug: fd.get('slug') ?? '',
    email: fd.get('email') ?? '', whatsapp: fd.get('whatsapp') ?? '', plan,
  }) };
}

// ¿Ese usuario ya es alguien en ParyGo? (dueño/validador de una marca o el
// super admin). Entonces no es un alta: que entre por /login.
async function yaTieneCuenta(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const [{ count }, { data: perfil }] = await Promise.all([
    admin.from('brand_members').select('brand_id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('user_profiles').select('is_super_admin').eq('user_id', userId).maybeSingle(),
  ]);
  return (count ?? 0) > 0 || perfil?.is_super_admin === true;
}

async function slugLibre(slug: string): Promise<boolean> {
  // xn-- = nombre punycode: el navegador lo muestra como letras unicode que
  // imitan a otra marca.
  if (SLUGS_RESERVADOS.has(slug) || slug.startsWith('xn--')) return false;
  const admin = createAdminClient();
  const { data: b } = await admin.from('brands').select('id, archived_at, created_at').eq('slug', slug).maybeSingle();
  if (!b) return true;
  // Alta con pack ABANDONADA (archivada, sin dueña, sin pago, de hace más de
  // 2 h): el link se libera. Sin esto, cualquiera reservaba links gratis
  // empezando altas que nunca pagaba (security review 2026-09-25). La marca
  // no se borra (pack_purchases es on delete restrict): se le cambia el link.
  if (!b.archived_at || Date.parse(b.created_at) > Date.now() - 2 * 3600 * 1000) return false;
  const [{ count: miembros }, { count: pagadas }] = await Promise.all([
    admin.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', b.id),
    admin.from('pack_purchases').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('status', 'paid'),
  ]);
  if (miembros || pagadas) return false;
  const { error } = await admin.from('brands').update({ slug: `abandonada-${b.id.slice(0, 13)}` }).eq('id', b.id);
  return !error;
}

function ipCliente(): string | null {
  return headers().get('cf-connecting-ip')?.trim() || headers().get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

// Topes invisibles por correo y por conexión. Sin esto el formulario sirve
// para bombardear de correos la casilla de un tercero o adivinar códigos.
async function dentroDelTope(prefijo: string, email: string, maxEmail: number, maxIp: number, ventana = 3600): Promise<boolean> {
  const ip = ipCliente();
  const { data, error } = await createAdminClient().rpc('register_ticket_resend_attempt', {
    p_email: `${prefijo}:${email}`, p_ip: ip ? `${prefijo}:${ip}` : null, p_brand_id: null,
    p_max_email: maxEmail, p_max_ip: maxIp, p_window_secs: ventana,
  });
  return !error && data === true;
}

// Una sola llamada gana por ventana aunque lleguen dos a la vez (0080).
async function candado(clave: string, segundos: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc('tomar_candado', { p_clave: clave, p_segundos: segundos });
  return !error && data === true;
}

const tomado = (m: Textos['m'], paso: AltaState['paso'] = 'datos'): AltaState =>
  ({ ok: false, paso, message: m.tomado, fieldErrors: { slug: m.tomadoCampo } });

// Aviso en vivo mientras escribe el link (los subdominios son públicos igual).
export async function slugDisponible(slug: string): Promise<boolean> {
  const s = String(slug ?? '').trim().toLowerCase();
  return SLUG_RE.test(s) && (await slugLibre(s));
}

// ------------------------------- 1. CÓDIGO --------------------------------

export async function enviarCodigo(_prev: AltaState, fd: FormData): Promise<AltaState> {
  // Honeypot: un campo que una persona nunca ve ni llena.
  if (String(fd.get('empresa') ?? '').trim() !== '') return { ok: true, paso: 'codigo', message: null };
  const lang: Lang = esLang(fd.get('lang'));
  const m = TEXTOS[lang].m;
  const reenvio = fd.get('reenvio') === '1';
  const pasoErr: AltaState['paso'] = reenvio ? 'codigo' : 'datos';

  const { p } = leerDatos(fd, m);
  if (!p.success) return { ok: false, paso: 'datos', message: m.revisa, fieldErrors: errores(p.error) };
  const d = p.data;
  if (!(await slugLibre(d.slug))) return tomado(m);
  // Un código por correo por minuto: nunca dos generateLink seguidos del mismo
  // correo (el segundo anula el primero y la persona escribe uno vencido).
  if (!(await candado(`codigo:${d.email}`, 60))) return { ok: false, paso: pasoErr, message: m.esperaCodigo };
  if (!(await dentroDelTope('alta', d.email, 5, 20))) return { ok: false, paso: pasoErr, message: m.muchos };

  const admin = createAdminClient();
  // Primero se mira si el correo ya existe, SIN generar ningún link: un
  // magiclink reemplaza el token de acceso vigente de esa persona.
  const { data: existenteId } = await admin.rpc('usuario_id_por_email', { p_email: d.email });
  if (existenteId && (await yaTieneCuenta(existenteId as string))) {
    // Misma respuesta que un alta nueva: el formulario no revela qué correos
    // tienen cuenta (security review M1). A esa casilla le llega "ya tienes
    // cuenta, ingresa" en vez de un código.
    await sendYaTienesCuenta({ to: d.email, lang });
    return { ok: true, paso: 'codigo', message: null };
  }
  // Usuario nuevo SIN confirmar y con contraseña AL AZAR (cumple la regla de
  // Supabase Auth): la suya se pone recién en finalizarAlta, con el correo ya
  // verificado. Si ya existe sin marca, código de acceso a esa cuenta.
  const link = existenteId
    ? await admin.auth.admin.generateLink({ type: 'magiclink', email: d.email })
    : await admin.auth.admin.generateLink({ type: 'signup', email: d.email, password: passwordAlAzar() });
  if (link.error) console.error('[empezar] generateLink', link.error.message);
  const codigo = link.data?.properties?.email_otp;
  if (!codigo) return { ok: false, paso: pasoErr, message: m.noCodigo };

  const envio = await sendCodigoAlta({ to: d.email, codigo, lang });
  if (!envio.ok) return { ok: false, paso: pasoErr, message: m.noCodigo };
  return { ok: true, paso: 'codigo', message: null };
}

export async function confirmarCodigo(_prev: AltaState, fd: FormData): Promise<AltaState> {
  const lang: Lang = esLang(fd.get('lang'));
  const m = TEXTOS[lang].m;
  const email = z.string().trim().toLowerCase().email().safeParse(fd.get('email') ?? '');
  if (!email.success) return { ok: false, paso: 'datos', message: m.revisa, fieldErrors: { email: m.correoMal } };
  const codigo = String(fd.get('codigo') ?? '').replace(/\D/g, '');
  if (codigo.length !== 8) return { ok: false, paso: 'codigo', message: null, fieldErrors: { codigo: m.escribeCodigo } };
  // 5 intentos por correo y 30 por conexión por hora: un código de 8 dígitos
  // no se adivina a fuerza bruta con eso.
  if (!(await dentroDelTope('verif', email.data, 5, 30))) return { ok: false, paso: 'codigo', message: m.muchos };

  const supabase = createClient();
  const v = await supabase.auth.verifyOtp({ email: email.data, token: codigo, type: 'email' });
  if (v.error || !v.data.user) return { ok: false, paso: 'codigo', message: null, fieldErrors: { codigo: m.codigoMal } };
  // Doble envío o alguien que ya tiene marca: al panel, sin tocar nada suyo.
  if (await yaTieneCuenta(v.data.user.id)) return { ok: true, paso: 'clave', message: null, ir: '/admin' };
  return { ok: true, paso: 'clave', message: null };
}

// --------------------------- 2. CONTRASEÑA Y ALTA ---------------------------

export async function finalizarAlta(_prev: AltaState, fd: FormData): Promise<AltaState> {
  if (String(fd.get('empresa') ?? '').trim() !== '') return { ok: false, paso: 'clave', message: null };
  const lang: Lang = esLang(fd.get('lang'));
  const m = TEXTOS[lang].m;

  // El correo sale de la SESIÓN verificada, nunca del form: si no, alguien
  // verificaba su correo y daba de alta la marca con el de otro.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !user.email_confirmed_at) return { ok: false, paso: 'codigo', message: m.sinVerificar };
  const email = user.email.toLowerCase();
  if (await yaTieneCuenta(user.id)) redirect('/admin');

  const { tipo, p } = leerDatos(fd, m);
  const datos = p.success ? p.data : null;
  if (!datos) return { ok: false, paso: 'datos', message: m.revisa, fieldErrors: errores(p.error!) };
  if (datos.plan === 'prueba' && tipo !== 'marca') return { ok: false, paso: 'datos', message: m.revisa };

  const password = String(fd.get('password') ?? '');
  if (!passwordOk(password)) return { ok: false, paso: 'clave', message: null, fieldErrors: { password: m.passRegla } };

  const admin = createAdminClient();
  // Altas con paquete pendientes de ESTA persona (archivadas y sin dueña).
  const { data: previas } = await admin.from('brands').select('id, slug, tipo').eq('alta_usuario', user.id).not('archived_at', 'is', null);
  const pendientes: { id: string; slug: string; tipo: string | null; pagada: boolean }[] = [];
  for (const b of previas ?? []) {
    const { count: miembros } = await admin.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', b.id);
    if (miembros) continue;
    const { count: pagadas } = await admin.from('pack_purchases').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('status', 'paid');
    pendientes.push({ ...b, pagada: !!pagadas });
  }
  // Con un paquete ya pagado, a terminar esa marca (si no, la plata quedaba
  // trabada en una marca sin dueña: security review M2).
  if (pendientes.some((b) => b.pagada)) return { ok: false, paso: 'clave', message: m.pagoEsperando };

  // Las verificaciones de cada camino van ANTES de tocar la contraseña o la
  // sesión: abrir sesión cambia cookies y Next redibuja la página; un error
  // después de eso reiniciaba el formulario.
  let brandId: string | null = null;
  let pack: ReturnType<typeof packDe> = null;
  let pasarela: 'paypal' | 'mercadopago' = 'mercadopago';
  const moneda = esMoneda(fd.get('moneda')) ?? 'PEN';
  if (datos.plan === 'prueba') {
    // Una persona con un alta de paquete a medias no saca además una prueba.
    if (pendientes.length) return { ok: false, paso: 'clave', message: m.pagoEsperando };
    if (!(await candado(`prueba:${user.id}`, 120))) return { ok: false, paso: 'clave', message: m.muchos };
    // Una prueba por WhatsApp (cualquier marca que ya lo use).
    const { count: conEseWa } = await admin.from('brands').select('id', { count: 'exact', head: true }).eq('whatsapp_e164', datos.whatsapp);
    if (conEseWa) return { ok: false, paso: 'datos', message: m.pruebaUsada, fieldErrors: { whatsapp: m.pruebaUsada } };
    if (!(await slugLibre(datos.slug))) return tomado(m);
    // El cupo del día se gasta recién acá: un link tomado no lo consume (B2).
    if (!(await dentroDelTope('prueba', email, 1, 3, 86400))) return { ok: false, paso: 'clave', message: m.muchos };
  } else {
    pack = packDe(Number(datos.plan));
    // Soles → Mercado Pago; dólares → PayPal. La moneda la elige el navegador
    // entre dos precios legítimos; el monto lo pone el server (precioDe).
    pasarela = moneda === 'USD' ? 'paypal' : 'mercadopago';
    if (!pack || !(pasarela === 'paypal' ? paypalListo() : mpListo())) return { ok: false, paso: 'clave', message: m.pronto };
    // Se reusa la del mismo link; brands.tipo no cambia nunca (otro tipo =
    // enlace ocupado).
    const misma = pendientes.find((b) => b.slug === datos.slug);
    if (misma) {
      if ((misma.tipo ?? 'marca') !== tipo) return tomado(m);
      brandId = misma.id;
    } else if (!(await slugLibre(datos.slug))) {
      return tomado(m);
    }
  }

  // Recién con el correo probado y todo verificado, SU contraseña. Cambiarla
  // cierra las sesiones (la del código incluida): se vuelve a entrar.
  const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, { password });
  const { error: inErr } = pwErr ? { error: pwErr } : await supabase.auth.signInWithPassword({ email, password });
  if (inErr) {
    console.error('[empezar] contraseña/sesión', inErr.message);
    return { ok: false, paso: 'clave', message: m.noCuenta };
  }

  // ------------------------------ PRUEBA ------------------------------
  if (datos.plan === 'prueba') {
    const alta = await crearMarcaParaUsuario({
      userId: user.id, email, nombre: datos.nombre, slug: datos.slug,
      whatsappE164: datos.whatsapp, prueba: true, idioma: lang, tipo: 'marca',
    });
    if (!alta.ok) {
      // Dos envíos a la vez: el otro ya creó su marca (una por dueño, 0071).
      if (await yaTieneCuenta(user.id)) redirect('/admin');
      return alta.motivo === 'slug_en_uso' ? tomado(m) : { ok: false, paso: 'clave', message: m.noMarca };
    }
    redirect('/admin');
  }

  // ------------------------------ PAQUETE -----------------------------
  if (!brandId) {
    const alta = await crearMarcaParaUsuario({
      userId: null, altaUsuario: user.id, email, nombre: datos.nombre, slug: datos.slug,
      whatsappE164: datos.whatsapp || null, prueba: false, idioma: lang, tipo,
    });
    if (!alta.ok) return alta.motivo === 'slug_en_uso' ? tomado(m) : { ok: false, paso: 'clave', message: m.noPago };
    brandId = alta.brandId;
  }
  // Doble clic o dos pestañas: una sola compra por marca cada 30 s.
  if (!(await candado(`pago:${brandId}`, 30))) return { ok: false, paso: 'clave', message: m.muchos };

  const app = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const q = `lang=${lang}`;
  const compra = await iniciarCompraPack({
    l: lang,
    // userId null: es el centinela de "alta desde /empezar" (0072 y /listo).
    brandId, userId: null, email, pack: pack!, pasarela,
    volver: (id) => `${app}/empezar/listo?compra=${id}&${q}`,
    sufijoPaypal: `&${q}`,
    cancelar: `${app}/empezar?tipo=${tipo}&pack=${datos.plan}&moneda=${moneda}&${q}&cancelado=1`,
  });
  if (!compra.ok) return { ok: false, paso: 'clave', message: m.noPago };
  redirect(compra.destino);
}
