'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { packDe } from '@/lib/packs';
import { mpListo } from '@/lib/cobroParygo';
import { iniciarCompraPack } from '@/lib/compraPack';
import { crearMarcaParaUsuario, SLUGS_RESERVADOS, SLUG_RE } from '@/lib/altaMarca';
import { sendCodigoAlta } from '@/lib/email/sendCodigoAlta';

// =============================================================
// Alta AUTOSERVICIO de un organizador (app.parygo.com/empezar, 2026-09-25).
// =============================================================
//   1. enviarCodigo: valida, frena abuso, crea el usuario SIN confirmar (o
//      reusa uno sin marca) y manda un código al correo. No crea marca.
//   2. confirmarAlta: verifica el código (abre la sesión), crea la marca y:
//        prueba → /admin con 1 evento de prueba (hasta 20 entradas, 0071);
//        pack   → Mercado Pago; al volver, el saldo se suma solo (0070).
// Sin el código no se crea ninguna marca: el correo es la única verificación
// (decisión de Paul). El monto del pack lo pone el servidor (lib/packs.ts).
// =============================================================

const datosSchema = z.object({
  plan: z.enum(['prueba', '1', '3', '5', '10']),
  nombre: z.string().trim().min(2, 'Pon el nombre de tu marca.').max(60, 'Máximo 60 caracteres.'),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE, 'Solo minúsculas, números y guiones (2 a 32).'),
  email: z.string().trim().toLowerCase().email('Revisa tu correo.').max(200),
  password: z.string().min(8, 'Mínimo 8 caracteres.').max(72, 'Máximo 72 caracteres.'),
  whatsapp: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, '').replace(/^\+?51(?=9\d{8}$)/, ''))
    .refine((v) => v === '' || /^9\d{8}$/.test(v), 'Celular de 9 dígitos que empieza con 9.'),
});
type Datos = z.infer<typeof datosSchema>;

export type AltaState = {
  ok: boolean;
  paso: 'datos' | 'codigo';
  message: string | null;
  fieldErrors?: Partial<Record<keyof Datos | 'codigo', string>>;
};

function leer(fd: FormData) {
  return datosSchema.safeParse({
    plan: fd.get('plan'),
    nombre: fd.get('nombre') ?? '',
    slug: fd.get('slug') ?? '',
    email: fd.get('email') ?? '',
    password: fd.get('password') ?? '',
    whatsapp: fd.get('whatsapp') ?? '',
  });
}

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
  const { count } = await createAdminClient().from('brands').select('id', { count: 'exact', head: true }).eq('slug', slug);
  return (count ?? 0) === 0;
}

// Aviso en vivo mientras escribe el link (los subdominios son públicos igual).
export async function slugDisponible(slug: string): Promise<boolean> {
  const s = String(slug ?? '').trim().toLowerCase();
  return SLUG_RE.test(s) && (await slugLibre(s));
}

export async function enviarCodigo(_prev: AltaState, fd: FormData): Promise<AltaState> {
  // Honeypot: un campo que una persona nunca ve ni llena.
  if (String(fd.get('empresa') ?? '').trim() !== '') return { ok: true, paso: 'codigo', message: null };

  const p = leer(fd);
  if (!p.success) return { ok: false, paso: 'datos', message: 'Revisa los campos marcados.', fieldErrors: errores(p.error) };
  const d = p.data;
  if (d.plan !== 'prueba' && !mpListo()) {
    return { ok: false, paso: 'datos', message: 'El pago en línea se activa muy pronto. Mientras tanto, empieza con la prueba gratis.' };
  }
  if (!(await slugLibre(d.slug))) {
    return { ok: false, paso: 'datos', message: 'Ese link ya lo tiene otra marca.', fieldErrors: { slug: 'Ya está en uso. Prueba con otro.' } };
  }

  const admin = createAdminClient();
  // Tope invisible: 5 códigos por correo y 20 por conexión por hora. Sin esto,
  // el formulario sirve para bombardear de correos la casilla de un tercero.
  const ip = headers().get('cf-connecting-ip')?.trim() || headers().get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const { data: permitido, error: rlErr } = await admin.rpc('register_ticket_resend_attempt', {
    p_email: `alta:${d.email}`, p_ip: ip ? `alta:${ip}` : null, p_brand_id: null,
    p_max_email: 5, p_max_ip: 20, p_window_secs: 3600,
  });
  if (rlErr || permitido !== true) {
    return { ok: false, paso: 'datos', message: 'Pediste varios códigos seguidos. Espera unos minutos y vuelve a intentar.' };
  }

  // Primero se mira si el correo ya existe, SIN generar ningún link: un
  // magiclink reemplaza el token de acceso vigente de esa persona.
  const { data: existenteId } = await admin.rpc('usuario_id_por_email', { p_email: d.email });
  if (existenteId && (await yaTieneCuenta(existenteId as string))) {
    return { ok: false, paso: 'datos', message: 'Ese correo ya tiene una cuenta en ParyGo. Entra con tu correo y contraseña.', fieldErrors: { email: 'Ya tiene cuenta.' } };
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
  if (!codigo) return { ok: false, paso: 'datos', message: 'No pudimos mandarte el código. Intenta de nuevo en un rato.' };

  const envio = await sendCodigoAlta({ to: d.email, codigo });
  if (!envio.ok) return { ok: false, paso: 'datos', message: 'No pudimos mandarte el código. Revisa tu correo e intenta de nuevo.' };
  return { ok: true, paso: 'codigo', message: null };
}

export async function confirmarAlta(_prev: AltaState, fd: FormData): Promise<AltaState> {
  const p = leer(fd);
  if (!p.success) return { ok: false, paso: 'datos', message: 'Revisa los campos marcados.', fieldErrors: errores(p.error) };
  const d = p.data;
  const codigo = String(fd.get('codigo') ?? '').replace(/\D/g, '');
  const pack = d.plan === 'prueba' ? null : packDe(Number(d.plan));
  if (d.plan !== 'prueba' && (!pack || !mpListo())) {
    return { ok: false, paso: 'datos', message: 'El pago en línea se activa muy pronto. Mientras tanto, empieza con la prueba gratis.' };
  }

  // Si ya verificó antes (p. ej. el link estaba tomado y lo cambió), la sesión
  // sigue abierta: no se vuelve a pedir un código que ya se usó.
  const supabase = createClient();
  const { data: { user: actual } } = await supabase.auth.getUser();
  let userId: string;
  if (actual && actual.email?.toLowerCase() === d.email) {
    userId = actual.id;
  } else {
    if (codigo.length < 6) return { ok: false, paso: 'codigo', message: null, fieldErrors: { codigo: 'Escribe el código que te llegó.' } };
    const v = await supabase.auth.verifyOtp({ email: d.email, token: codigo, type: 'email' });
    if (v.error || !v.data.user) {
      return { ok: false, paso: 'codigo', message: null, fieldErrors: { codigo: 'El código no coincide o ya venció. Revisa el último que te llegó.' } };
    }
    userId = v.data.user.id;
  }

  // Doble envío o alguien que ya tiene marca: al panel, sin tocar nada suyo.
  if (await yaTieneCuenta(userId)) redirect(pack ? '/admin/comprar' : '/admin');

  const admin = createAdminClient();
  // Quien reusó un usuario sin marca (magiclink) todavía no tiene la contraseña
  // que eligió; al nuevo se la deja igual. Probó que el correo es suyo.
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password: d.password });
  // Cambiar la contraseña cierra las sesiones del usuario (la del código
  // incluida): sin volver a entrar, /admin lo mandaba al login.
  const { error: inErr } = pwErr ? { error: pwErr } : await supabase.auth.signInWithPassword({ email: d.email, password: d.password });
  if (inErr) {
    // Sin contraseña guardada o sin sesión NO se crea la marca: quedaría una
    // marca a la que su dueño no puede entrar.
    console.error('[empezar] contraseña/sesión', inErr.message);
    return { ok: false, paso: 'codigo', message: 'No pudimos terminar de crear tu cuenta. Pide un código nuevo e intenta otra vez.' };
  }

  if (!(await slugLibre(d.slug))) {
    return { ok: false, paso: 'datos', message: 'Ese link lo tomó otra marca hace un momento. Elige otro y listo.', fieldErrors: { slug: 'Ya está en uso. Prueba con otro.' } };
  }
  const alta = await crearMarcaParaUsuario({
    userId, email: d.email, nombre: d.nombre, slug: d.slug,
    whatsappE164: d.whatsapp ? `+51${d.whatsapp}` : null,
    prueba: d.plan === 'prueba',
  });
  if (!alta.ok) {
    // Dos envíos a la vez: el otro ya creó su marca (una por dueño, 0071).
    if (await yaTieneCuenta(userId)) redirect(pack ? '/admin/comprar' : '/admin');
    return alta.motivo === 'slug_en_uso'
      ? { ok: false, paso: 'datos', message: 'Ese link lo tomó otra marca hace un momento. Elige otro y listo.', fieldErrors: { slug: 'Ya está en uso. Prueba con otro.' } }
      : { ok: false, paso: 'datos', message: 'No pudimos crear tu marca. Intenta de nuevo en un momento.' };
  }

  if (!pack) redirect('/admin');
  const compra = await iniciarCompraPack({ brandId: alta.brandId, userId, email: d.email, pack, pasarela: 'mercadopago' });
  // Si Mercado Pago no respondió, la marca ya existe y la sesión está abierta:
  // puede pagar desde su panel.
  redirect(compra.ok ? compra.destino : '/admin/comprar?cancelado=1');
}
