'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';
import { packDe } from '@/lib/packs';
import { mpListo, paypalListo } from '@/lib/cobroParygo';
import { iniciarCompraPack } from '@/lib/compraPack';
import { crearMarcaParaUsuario, SLUGS_RESERVADOS, SLUG_RE } from '@/lib/altaMarca';
import { sendCodigoAlta } from '@/lib/email/sendCodigoAlta';
import { TEXTOS, esLang, esMoneda, type Lang, type Textos } from './textos';

// =============================================================
// Alta AUTOSERVICIO de un organizador (app.parygo.com/empezar, 2026-09-25).
// =============================================================
// PRUEBA GRATIS (el correo es la única verificación, decisión de Paul):
//   enviarCodigo → usuario SIN confirmar con contraseña al azar + código al
//   correo; confirmarAlta → verifica el código, pone su contraseña, crea la
//   marca con la prueba y entra a /admin.
// PACK (Paul: "directo a pagar y ya"; el pago reemplaza al código): pagarAlta
// crea la marca SIN dueña y manda a pagar: soles → Mercado Pago, dólares →
// PayPal (MP Perú solo cobra en soles). La contraseña NUNCA viaja antes del
// pago: queda en el navegador (sessionStorage) y la cuenta se crea al volver
// con el pago aprobado (/empezar/listo). Crear la cuenta antes, sin pago ni
// código, reabría el agujero del security review: cualquiera dejaba el correo
// de otro con su clave.
// El monto del pack lo pone el servidor (lib/packs.ts + la pasarela), nunca el
// navegador: el navegador solo elige paquete y moneda, y los dos precios son
// legítimos.
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

function esquemas(m: Textos['m']) {
  const base = {
    nombre: z.string().trim().min(2, m.nombreCorto).max(60, m.nombreLargo),
    slug: z.string().trim().toLowerCase().regex(SLUG_RE, m.slugMal),
    email: z.string().trim().toLowerCase().email(m.correoMal).max(200)
      // Dominios internos (puestos de puerta @gate.parygo.local, cuentas de
      // prueba @parygo.test, el propio parygo.com): nadie se registra con ellos.
      .refine((e) => !/@(?:[a-z0-9-]+\.)*parygo\.(?:local|test|com)$/.test(e), m.correoPropio),
    whatsapp: z.string().transform(normalizarWhatsapp).refine((v) => v === '' || /^\+\d{8,15}$/.test(v), m.waMal),
  };
  return {
    prueba: z.object({ ...base, password: z.string().min(8, m.passCorta).max(72, m.passLarga) }),
    pago: z.object({ ...base, plan: z.enum(['1', '3', '5', '10']) }),
  };
}

export type AltaState = {
  ok: boolean;
  paso: 'datos' | 'codigo';
  message: string | null;
  fieldErrors?: Partial<Record<'nombre' | 'slug' | 'email' | 'password' | 'whatsapp' | 'codigo', string>>;
};

const campos = (fd: FormData) => ({
  nombre: fd.get('nombre') ?? '',
  slug: fd.get('slug') ?? '',
  email: fd.get('email') ?? '',
  whatsapp: fd.get('whatsapp') ?? '',
});

function errores(e: z.ZodError): AltaState['fieldErrors'] {
  const out: Record<string, string> = {};
  for (const i of e.errors) {
    const k = i.path.join('.');
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
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

// Tope invisible: 5 intentos por correo y 20 por conexión por hora. Sin esto el
// formulario sirve para bombardear de correos la casilla de un tercero.
async function dentroDelTope(email: string): Promise<boolean> {
  const ip = headers().get('cf-connecting-ip')?.trim() || headers().get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const { data, error } = await createAdminClient().rpc('register_ticket_resend_attempt', {
    p_email: `alta:${email}`, p_ip: ip ? `alta:${ip}` : null, p_brand_id: null,
    p_max_email: 5, p_max_ip: 20, p_window_secs: 3600,
  });
  return !error && data === true;
}

const tomado = (m: Textos['m'], recien = false): AltaState => ({ ok: false, paso: 'datos', message: recien ? m.tomadoRecien : m.tomado, fieldErrors: { slug: m.tomadoCampo } });

// Aviso en vivo mientras escribe el link (los subdominios son públicos igual).
export async function slugDisponible(slug: string): Promise<boolean> {
  const s = String(slug ?? '').trim().toLowerCase();
  return SLUG_RE.test(s) && (await slugLibre(s));
}

// ------------------------------ PRUEBA GRATIS ------------------------------

export async function enviarCodigo(_prev: AltaState, fd: FormData): Promise<AltaState> {
  // Honeypot: un campo que una persona nunca ve ni llena.
  if (String(fd.get('empresa') ?? '').trim() !== '') return { ok: true, paso: 'codigo', message: null };
  const lang: Lang = esLang(fd.get('lang'));
  const m = TEXTOS[lang].m;

  const p = esquemas(m).prueba.safeParse({ ...campos(fd), password: fd.get('password') ?? '' });
  if (!p.success) return { ok: false, paso: 'datos', message: m.revisa, fieldErrors: errores(p.error) };
  const d = p.data;
  if (!(await slugLibre(d.slug))) return tomado(m);
  if (!(await dentroDelTope(d.email))) return { ok: false, paso: 'datos', message: m.muchos };

  const admin = createAdminClient();
  // Primero se mira si el correo ya existe, SIN generar ningún link: un
  // magiclink reemplaza el token de acceso vigente de esa persona.
  const { data: existenteId } = await admin.rpc('usuario_id_por_email', { p_email: d.email });
  if (existenteId && (await yaTieneCuenta(existenteId as string))) {
    return { ok: false, paso: 'datos', message: m.cuenta, fieldErrors: { email: m.cuentaCampo } };
  }
  // Usuario nuevo SIN confirmar y con una contraseña AL AZAR: la que eligió se
  // pone recién cuando prueba que el correo es suyo (confirmarAlta). Con la
  // suya acá, cualquiera pre-registraba el correo de otro con su clave y la
  // cuenta quedaba tomada el día que esa persona aceptara una invitación
  // (security review 2026-09-25). Si ya existe sin marca, código de acceso.
  const link = existenteId
    ? await admin.auth.admin.generateLink({ type: 'magiclink', email: d.email })
    : await admin.auth.admin.generateLink({ type: 'signup', email: d.email, password: crypto.randomUUID() + crypto.randomUUID() });
  if (link.error) console.error('[empezar] generateLink', link.error.message);
  const codigo = link.data?.properties?.email_otp;
  if (!codigo) return { ok: false, paso: 'datos', message: m.noCodigo };

  const envio = await sendCodigoAlta({ to: d.email, codigo, lang });
  if (!envio.ok) return { ok: false, paso: 'datos', message: m.noCodigo };
  return { ok: true, paso: 'codigo', message: null };
}

export async function confirmarAlta(_prev: AltaState, fd: FormData): Promise<AltaState> {
  const lang: Lang = esLang(fd.get('lang'));
  const m = TEXTOS[lang].m;
  const p = esquemas(m).prueba.safeParse({ ...campos(fd), password: fd.get('password') ?? '' });
  if (!p.success) return { ok: false, paso: 'datos', message: m.revisa, fieldErrors: errores(p.error) };
  const d = p.data;
  const codigo = String(fd.get('codigo') ?? '').replace(/\D/g, '');

  // Si ya verificó antes (p. ej. el link estaba tomado y lo cambió), la sesión
  // sigue abierta: no se vuelve a pedir un código que ya se usó.
  const supabase = createClient();
  const { data: { user: actual } } = await supabase.auth.getUser();
  let userId: string;
  if (actual && actual.email?.toLowerCase() === d.email) {
    userId = actual.id;
  } else {
    if (codigo.length < 6) return { ok: false, paso: 'codigo', message: null, fieldErrors: { codigo: m.escribeCodigo } };
    const v = await supabase.auth.verifyOtp({ email: d.email, token: codigo, type: 'email' });
    if (v.error || !v.data.user) return { ok: false, paso: 'codigo', message: null, fieldErrors: { codigo: m.codigoMal } };
    userId = v.data.user.id;
  }

  // Doble envío o alguien que ya tiene marca: al panel, sin tocar nada suyo.
  if (await yaTieneCuenta(userId)) redirect('/admin');

  const admin = createAdminClient();
  // Probó que el correo es suyo: recién ahora su contraseña.
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password: d.password });
  // Cambiar la contraseña cierra las sesiones del usuario (la del código
  // incluida): sin volver a entrar, /admin lo mandaba al login.
  const { error: inErr } = pwErr ? { error: pwErr } : await supabase.auth.signInWithPassword({ email: d.email, password: d.password });
  if (inErr) {
    // Sin contraseña guardada o sin sesión NO se crea la marca: quedaría una
    // marca a la que su dueño no puede entrar.
    console.error('[empezar] contraseña/sesión', inErr.message);
    return { ok: false, paso: 'codigo', message: m.noCuenta };
  }

  if (!(await slugLibre(d.slug))) return tomado(m, true);
  const alta = await crearMarcaParaUsuario({
    userId, email: d.email, nombre: d.nombre, slug: d.slug,
    whatsappE164: d.whatsapp || null,
    prueba: true,
  });
  if (!alta.ok) {
    // Dos envíos a la vez: el otro ya creó su marca (una por dueño, 0071).
    if (await yaTieneCuenta(userId)) redirect('/admin');
    return alta.motivo === 'slug_en_uso' ? tomado(m, true) : { ok: false, paso: 'datos', message: m.noMarca };
  }
  redirect('/admin');
}

// ---------------------------------- PACK ----------------------------------

export async function pagarAlta(_prev: AltaState, fd: FormData): Promise<AltaState> {
  if (String(fd.get('empresa') ?? '').trim() !== '') return { ok: false, paso: 'datos', message: null };
  const lang: Lang = esLang(fd.get('lang'));
  const m = TEXTOS[lang].m;

  const p = esquemas(m).pago.safeParse({ ...campos(fd), plan: fd.get('plan') });
  if (!p.success) return { ok: false, paso: 'datos', message: m.revisa, fieldErrors: errores(p.error) };
  const d = p.data;
  const pack = packDe(Number(d.plan));
  // Soles → Mercado Pago; dólares → PayPal. La moneda la elige el navegador
  // entre dos precios legítimos; el monto lo pone el server (precioDe).
  const moneda = esMoneda(fd.get('moneda')) ?? 'PEN';
  const pasarela = moneda === 'USD' ? 'paypal' : 'mercadopago';
  if (!pack || !(pasarela === 'paypal' ? paypalListo() : mpListo())) {
    return { ok: false, paso: 'datos', message: m.pronto };
  }
  if (!(await dentroDelTope(d.email))) return { ok: false, paso: 'datos', message: m.muchos };

  const admin = createAdminClient();
  // Una cuenta CONFIRMADA o con marca → que entre por /login. Una sin
  // confirmar y sin marca (alguien empezó la prueba con este correo y no puso
  // el código) no bloquea: al volver del pago se la toma (completarAlta).
  const { data: existenteId } = await admin.rpc('usuario_id_por_email', { p_email: d.email });
  if (existenteId) {
    const { data: u } = await admin.auth.admin.getUserById(existenteId as string);
    if (u?.user?.email_confirmed_at || (await yaTieneCuenta(existenteId as string))) {
      return { ok: false, paso: 'datos', message: m.cuenta, fieldErrors: { email: m.cuentaCampo } };
    }
  }

  // Altas con pack pendientes de este correo (marca ARCHIVADA y sin dueña).
  // Con una ya pagada, a terminar esa. Se reusa SOLO la del mismo link, sin
  // tocarle nada: el formulario no tiene sesión, y cambiar nombre o link de
  // una marca ajena escribiendo su correo era posible (security review).
  const { data: previas } = await admin.from('brands').select('id, slug').eq('contact_email', d.email).not('archived_at', 'is', null);
  let brandId: string | null = null;
  for (const b of previas ?? []) {
    const { count: miembros } = await admin.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', b.id);
    if (miembros) continue;
    const { count: pagadas } = await admin.from('pack_purchases').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('status', 'paid');
    if (pagadas) return { ok: false, paso: 'datos', message: m.pagoEsperando };
    if (b.slug === d.slug) brandId = b.id;
  }
  if (!brandId) {
    if (!(await slugLibre(d.slug))) return tomado(m);
    const alta = await crearMarcaParaUsuario({
      userId: null, email: d.email, nombre: d.nombre, slug: d.slug,
      whatsappE164: d.whatsapp || null, prueba: false,
    });
    if (!alta.ok) return alta.motivo === 'slug_en_uso' ? tomado(m) : { ok: false, paso: 'datos', message: m.noPago };
    brandId = alta.brandId;
  }

  const app = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const q = `lang=${lang}`;
  const compra = await iniciarCompraPack({
    brandId, userId: null, email: d.email, pack, pasarela,
    volver: (id) => `${app}/empezar/listo?compra=${id}&${q}`,
    sufijoPaypal: `&${q}`,
    cancelar: `${app}/empezar?pack=${d.plan}&moneda=${moneda}&${q}&cancelado=1`,
  });
  if (!compra.ok) return { ok: false, paso: 'datos', message: m.noPago };
  redirect(compra.destino);
}
