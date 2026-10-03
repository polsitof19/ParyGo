'use server';

import { z } from 'zod';
import { MEDIOS, PAISES, type Medio, medioDe, medioSirve, validarCuenta, NOMBRE_MEDIO } from '@/lib/metodoManual';
import { monedaDe } from '@/lib/moneda';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { marcaTieneMetodo, marcaCobraEnVivo } from '@/lib/metodoPago';
import { contextoEscritura } from '@/lib/impersonation';
import { auditarEscrituraSuper } from '@/lib/auditoriaSuper';
import { serverEnv } from '@/lib/env';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { alAzar, crearPkce, firmarCookie, urlAutorizacion } from '@/lib/mpOauth';
import { COOKIE_MP_OAUTH, duenaRealDe, mpClient, mpOauthListo, pagosMpEnCurso, redirectUriMp } from '@/lib/mpConexion';
import { esIdioma, type Textos } from '@/lib/idioma';
import { TEMAS } from '@/lib/temaCompra.mjs';
import { textosPanel, idiomaPanel } from '@/lib/idiomaServer';

export type SettingsState = {
  ok: boolean;
  message: string | null;
  fieldErrors?: Partial<Record<string, string>>;
};

const schema = (t: Textos['t']) => z.object({
  contact_email: z.string().email(t('Email inválido', 'Invalid email')).optional().or(z.literal('')),
  whatsapp_e164: z
    .string()
    .regex(/^\+\d{8,15}$/, t('Formato +51999000111', 'Format +51999000111'))
    .optional()
    .or(z.literal('')),
  yape_number: z.string().max(200).optional().or(z.literal('')),
  yape_holder: z.string().max(120).optional().or(z.literal('')),
  instagram: z.string().max(120).optional().or(z.literal('')),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, t('Color inválido', 'Invalid color')),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, t('Color inválido', 'Invalid color')),
});

// Solo rasterizados (sin SVG): el bucket es público y un SVG con <script> sería
// XSS stored si se abre su URL directa (mismo criterio que lib/brandAssets.ts).
const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function updateBrandSettingsAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const user = await requireSession();
  const { t } = await textosPanel();
  // ENFORCEMENT: the brand comes from the session membership, NEVER the form.
  // A brand_admin can only ever edit their own brand.
  const ctxW = contextoEscritura(user);
  if (!ctxW) {
    return { ok: false, message: t('No tienes acceso de promotor.', "You don't have promoter access.") };
  }
  const brandId = ctxW.brandId;

  const parsed = schema(t).safeParse({
    contact_email: formData.get('contact_email') ?? '',
    whatsapp_e164: formData.get('whatsapp_e164') ?? '',
    yape_number: formData.get('yape_number') ?? '',
    yape_holder: formData.get('yape_holder') ?? '',
    instagram: formData.get('instagram') ?? '',
    primary_color: formData.get('primary_color') ?? '',
    secondary_color: formData.get('secondary_color') ?? '',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const e of parsed.error.errors) {
      const p = e.path.join('.');
      if (p) fieldErrors[p] = e.message;
    }
    return { ok: false, message: t('Revisa los campos marcados.', 'Check the marked fields.'), fieldErrors };
  }

  const admin = createAdminClient();

  // Load the current brand (own its slug for the storage path + merge theme).
  const { data: brand, error: brandErr } = await admin
    .from('brands')
    .select('id, slug, theme_json, yape_qr_url, moneda, zona_horaria, metodo_manual')
    .eq('id', brandId)
    .single();
  if (brandErr || !brand) {
    return { ok: false, message: t('No se pudo cargar la marca.', 'Could not load the brand.') };
  }

  const theme = (brand.theme_json ?? {}) as Record<string, unknown>;
  let logoUrl = (theme.logo_url as string | undefined) ?? null;
  // El QR vive en brands.yape_qr_url (0054). theme_json queda como respaldo de
  // lectura por si alguna marca todavía lo tuviera ahí de antes del cambio;
  // escribir, se escribe solo en la columna.
  let yapeQrUrl = brand.yape_qr_url ?? (theme.yape_qr_url as string | undefined) ?? null;

  // Optional logo upload to the public brand-assets bucket.
  const file = formData.get('logo');
  if (file instanceof File && file.size > 0) {
    const ext = LOGO_TYPES[file.type];
    if (!ext) {
      return { ok: false, message: t('Logo: usa PNG, JPG o WEBP.', 'Logo: use PNG, JPG or WEBP.'), fieldErrors: { logo: t('Tipo no permitido', 'Type not allowed') } };
    }
    if (file.size > 2 * 1024 * 1024) {
      return { ok: false, message: t('El logo supera 2 MB.', 'The logo exceeds 2 MB.'), fieldErrors: { logo: t('Muy grande', 'Too large') } };
    }
    const path = `${brand.slug}/logo-${nanoid(8)}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from('brand-assets')
      .upload(path, bytes, { contentType: file.type, cacheControl: '3600', upsert: true });
    if (upErr) {
      return { ok: false, message: t(`No se pudo subir el logo: ${upErr.message}`, `Could not upload the logo: ${upErr.message}`) };
    }
    const { data: pub } = admin.storage.from('brand-assets').getPublicUrl(path);
    logoUrl = pub.publicUrl;
  }

  // QR de Yape (imagen). Mismo bucket público + mismo criterio que el logo: solo
  // raster (sin SVG → XSS), path con slug del SERVER + nanoid no adivinable.
  if (formData.get('remove_yape_qr') === '1') {
    yapeQrUrl = null;
  }
  const qrFile = formData.get('yape_qr');
  if (qrFile instanceof File && qrFile.size > 0) {
    const ext = LOGO_TYPES[qrFile.type];
    if (!ext) {
      return { ok: false, message: t('QR de Yape: usa PNG, JPG o WEBP.', 'Yape QR: use PNG, JPG or WEBP.'), fieldErrors: { yape_qr: t('Tipo no permitido', 'Type not allowed') } };
    }
    if (qrFile.size > 2 * 1024 * 1024) {
      return { ok: false, message: t('El QR supera 2 MB.', 'The QR exceeds 2 MB.'), fieldErrors: { yape_qr: t('Muy grande', 'Too large') } };
    }
    const path = `${brand.slug}/yape-qr-${nanoid(8)}.${ext}`;
    const bytes = new Uint8Array(await qrFile.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from('brand-assets')
      .upload(path, bytes, { contentType: qrFile.type, cacheControl: '3600', upsert: true });
    if (upErr) {
      return { ok: false, message: t(`No se pudo subir el QR: ${upErr.message}`, `Could not upload the QR: ${upErr.message}`) };
    }
    const { data: pub } = admin.storage.from('brand-assets').getPublicUrl(path);
    yapeQrUrl = pub.publicUrl;
  }

  // yape_qr_url YA NO va en theme_json: tiene columna propia desde la 0054.
  // Se borra de acá para que no queden dos fuentes de verdad discrepando.
  const { yape_qr_url: _viejo, ...themeSinQr } = theme;
  const nextTheme = {
    ...themeSinQr,
    primary_color: parsed.data.primary_color,
    secondary_color: parsed.data.secondary_color,
    logo_url: logoUrl,
  };

  // Avisos de Yape por email (Grupo C). Checkboxes → 'on'/ausente. Opt-in.
  const notifyYapeRecovery = formData.get('notify_yape_recovery') === 'on';
  const notifyYapeDigest = formData.get('notify_yape_digest') === 'on';

  // País (moneda + zona) y medio manual. Todo se relee/valida en el server.
  const pais = PAISES.find((p) => p.id === formData.get('pais'));
  if (!pais) return { ok: false, message: t('Elige un país válido.', 'Choose a valid country.'), fieldErrors: { pais: t('País inválido', 'Invalid country') } };
  const monedaActual = monedaDe(brand.moneda);
  const cambiaMoneda = pais.moneda !== monedaActual;
  // Moneda nueva = medio y cuenta nuevos. Seguro: la moneda solo cambia con cero
  // eventos (trigger guard_brand_moneda), o sea cero ventas.
  const medioForm = String(formData.get('metodo_manual') ?? '');
  if (!cambiaMoneda && !(MEDIOS as readonly string[]).includes(medioForm)) {
    return { ok: false, message: t('Elige un medio de pago válido.', 'Choose a valid payment method.') };
  }
  const medio = cambiaMoneda ? pais.medios[0]! : (medioForm as Medio);
  if (!medioSirve(medio, pais.moneda)) {
    return { ok: false, message: t(`${NOMBRE_MEDIO[medio].es} no sirve para ${pais.moneda}.`, `${NOMBRE_MEDIO[medio].en} does not work with ${pais.moneda}.`), fieldErrors: { metodo_manual: t('Medio incompatible', 'Incompatible method') } };
  }
  const cuenta = cambiaMoneda
    ? { ok: true as const, cuenta: '', titular: '' }
    : validarCuenta(medio, parsed.data.yape_number ?? '', parsed.data.yape_holder ?? '');
  if (!cuenta.ok) {
    return { ok: false, message: t(cuenta.es, cuenta.en), fieldErrors: { yape_number: t(cuenta.es, cuenta.en) } };
  }
  // Otro medio (o otra moneda) = el QR viejo es de OTRA cuenta: se borra salvo
  // que en este mismo envío se haya subido uno nuevo (Codex P2).
  const qrNuevo = yapeQrUrl !== null && yapeQrUrl !== (brand.yape_qr_url ?? (theme.yape_qr_url as string | undefined) ?? null);
  if (cambiaMoneda || (medio !== medioDe(brand.metodo_manual) && !qrNuevo)) yapeQrUrl = null;

  // El medio no cambia con pagos por aprobar: la página de pago lee la marca en
  // vivo y el comprador vería otra cuenta que la de su pedido.
  if (medio !== medioDe(brand.metodo_manual)) {
    const { count, error: pendErr } = await admin.from('orders').select('id', { count: 'exact', head: true }).eq('brand_id', brandId).eq('status', 'pending_yape_review');
    if (pendErr || (count ?? 0) > 0) {
      return { ok: false, message: t('Tienes pagos por aprobar. Apruébalos o recházalos antes de cambiar el medio de pago.', 'You have payments to approve. Approve or reject them before changing the payment method.'), fieldErrors: { metodo_manual: t('Hay pagos por aprobar', 'Payments pending') } };
    }
  }

  // No se puede quitar el único método de pago con eventos a la venta que
  // cobran (quedarían publicados sin cómo pagar: security review 2026-10-01).
  if (!cuenta.cuenta && !(await marcaTieneMetodo(admin, brandId, { sinYape: true })) && (await marcaCobraEnVivo(admin, brandId))) {
    return { ok: false, message: t('Tienes eventos a la venta que cobran: no puedes quitar tu método de pago. Pásalos a borrador primero.', 'You have paid events on sale: you cannot remove your payment method. Move them to draft first.'), fieldErrors: { yape_number: t('Requerido mientras vendes', 'Required while selling') } };
  }

  const { error: updErr } = await admin
    .from('brands')
    .update({
      contact_email: parsed.data.contact_email || null,
      whatsapp_e164: parsed.data.whatsapp_e164 || null,
      moneda: pais.moneda,
      zona_horaria: pais.zona,
      metodo_manual: medio,
      yape_number: cuenta.cuenta || null,
      yape_holder: cuenta.titular || null,
      instagram: parsed.data.instagram || null,
      notify_yape_recovery: notifyYapeRecovery,
      notify_yape_digest: notifyYapeDigest,
      theme_json: nextTheme,
      yape_qr_url: yapeQrUrl,
    })
    .eq('id', brandId); // scoped to the admin's own brand
  if (updErr) {
    if (updErr.message.includes('MONEDA_CON_EVENTOS')) {
      return { ok: false, message: t('Tu marca ya tiene eventos: la moneda no se puede cambiar. Puedes cambiar solo la hora si el país usa la misma moneda.', 'Your brand already has events: the currency cannot be changed. You can change only the time zone if the country uses the same currency.'), fieldErrors: { pais: t('Moneda bloqueada', 'Currency locked') } };
    }
    return { ok: false, message: updErr.message };
  }

  await admin.from('events_log').insert({
    brand_id: brandId,
    actor_user_id: user.id,
    type: 'brand_settings_updated',
    payload: { logo_changed: Boolean(file instanceof File && file.size > 0) },
  });
  await auditarEscrituraSuper(admin, { user, modo: ctxW.modo, brandId, accion: 'brand_settings_updated', diff: { logo_changed: Boolean(file instanceof File && file.size > 0) } });

  revalidatePath('/admin');
  revalidatePath('/admin/settings');
  return { ok: true, message: t('Configuración guardada. Los cambios ya están en vivo.', 'Settings saved. The changes are already live.') };
}

// =============================================================
// Conectar Mercado Pago (OAuth, 0086; plan en AGENTS.md)
// =============================================================
// La organizadora entra a SU cuenta de MP y vuelve conectada: ningún token pasa
// por un formulario. Solo la dueña REAL (duenaRealDe): ni staff ni el super
// admin dentro de la marca. state + PKCE en una cookie httpOnly de 10 min, atada
// a la marca; la vuelta (mercadopago/vuelta/route.ts) la verifica y la borra.

export async function conectarMpAction(): Promise<void> {
  const user = await requireSession();
  const brandId = duenaRealDe(user);
  if (!brandId || !mpOauthListo()) redirect('/admin/settings?mp=no_disponible#cobro');
  const { verifier, challenge } = await crearPkce();
  const state = alAzar(32);
  const valor = await firmarCookie(serverEnv.BRAND_CREDS_ENCRYPTION_KEY, { s: state, v: verifier, b: brandId, u: user.id, e: Date.now() + 600_000 });
  cookies().set(COOKIE_MP_OAUTH, valor, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/admin/settings/mercadopago',
  });
  redirect(urlAutorizacion({ clientId: mpClient().clientId, redirectUri: redirectUriMp(), state, challenge }));
}

export async function desconectarMpAction(): Promise<SettingsState> {
  const user = await requireSession();
  const { t } = await textosPanel();
  const brandId = duenaRealDe(user);
  if (!brandId) return { ok: false, message: t('Solo la cuenta dueña de la marca puede desconectar Mercado Pago.', 'Only the brand owner can disconnect Mercado Pago.') };
  const admin = createAdminClient();
  const [{ data: b }, cobra] = await Promise.all([
    admin.from('brands').select('yape_number, mp_oauth_user_id').eq('id', brandId).maybeSingle(),
    marcaCobraEnVivo(admin, brandId),
  ]);
  if (!b?.mp_oauth_user_id) return { ok: true, message: t('Mercado Pago ya estaba desconectado.', 'Mercado Pago was already disconnected.') };
  // Mismo criterio que quitar el Yape: sin otro método no se deja a la venta un
  // evento que cobra.
  // Un pago con tarjeta en curso se liquida con ESTA cuenta (collector_id):
  // desconectar ahora dejaría a ese comprador cobrado y sin entrada (review M1).
  if (await pagosMpEnCurso(admin, brandId)) {
    return { ok: false, message: t('Hay compradores pagando con tarjeta en este momento. Intenta desconectar en un rato.', 'Some buyers are paying by card right now. Try disconnecting in a while.') };
  }
  if (!b.yape_number?.trim() && cobra) {
    return { ok: false, message: t('Tienes eventos a la venta que cobran y Mercado Pago es tu único método de pago. Agrega otro o pasa esos eventos a borrador primero.', 'You have paid events on sale and Mercado Pago is your only payment method. Add another one or move those events to draft first.') };
  }
  const { error } = await admin.rpc('clear_brand_mp_oauth', { p_brand_id: brandId });
  if (error) return { ok: false, message: t('No se pudo desconectar. Intenta de nuevo.', 'Could not disconnect. Try again.') };
  await admin.from('events_log').insert({ brand_id: brandId, actor_user_id: user.id, type: 'mp_desconectado', payload: { cuenta: b.mp_oauth_user_id } });
  revalidatePath('/admin/settings');
  return { ok: true, message: t('Mercado Pago desconectado. Los pagos con tarjeta que estaban en curso ya no se podrán confirmar.', 'Mercado Pago disconnected. Card payments in progress can no longer be confirmed.') };
}

// Idioma del panel de la marca (0073). La marca sale de la sesión, nunca del
// cliente; el valor se valida contra la lista cerrada (el CHECK de la base es
// la segunda red).
export async function cambiarIdiomaAction(idioma: string): Promise<{ ok: boolean }> {
  if (!esIdioma(idioma)) return { ok: false };
  const user = await requireSession();
  const ctxW = contextoEscritura(user);
  if (!ctxW) return { ok: false };
  const admin = createAdminClient();
  const { error } = await admin.from('brands').update({ idioma }).eq('id', ctxW.brandId);
  if (error) return { ok: false };
  await auditarEscrituraSuper(admin, { user, modo: ctxW.modo, brandId: ctxW.brandId, accion: 'brand_idioma_updated', diff: { idioma } });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

// Tema de la página de compra (0076): blanco, crema, negro o el color de la
// marca. Misma forma que el idioma: la marca sale de la sesión, el valor se
// valida contra la lista cerrada (el CHECK de la base es la segunda red).
export async function cambiarTemaCompraAction(tema: string): Promise<{ ok: boolean }> {
  if (!(TEMAS as string[]).includes(tema)) return { ok: false };
  const user = await requireSession();
  const ctxW = contextoEscritura(user);
  if (!ctxW) return { ok: false };
  const admin = createAdminClient();
  const { error } = await admin.from('brands').update({ tema_compra: tema }).eq('id', ctxW.brandId);
  if (error) return { ok: false };
  await auditarEscrituraSuper(admin, { user, modo: ctxW.modo, brandId: ctxW.brandId, accion: 'brand_tema_compra_updated', diff: { tema_compra: tema } });
  revalidatePath('/admin/settings');
  return { ok: true };
}
