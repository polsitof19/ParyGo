'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { sendAltaBienvenida } from '@/lib/email/sendAltaEmails';

export type CompletarState = { ok: boolean; message: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cierra el alta con pack: con la compra YA PAGADA, crea la cuenta de la dueña
// con el correo de contacto de la marca y la contraseña que eligió, la hace
// brand_admin, publica la marca (nace archivada) y abre la sesión. El id de la
// compra es el secreto (llega solo a quien pagó: la vuelta de MP y el correo
// "termina de crear tu marca"). Solo compras de /empezar (created_by null) de
// una marca pendiente (archivada y sin dueña): una compra vieja del panel de
// una marca que perdió a su dueña no sirve para reclamarla.
//
// El correo NO se verificó (el pack no pide código, decisión de Paul): la
// cuenta lleva user_metadata.alta_sin_verificar y las invitaciones (staff y
// dueña desde la cabina) se niegan a colgarle acceso a otra marca. Así pagar
// con el correo de otro no da el escáner ni el panel de nadie.
export async function completarAlta(_prev: CompletarState, fd: FormData): Promise<CompletarState> {
  const compraId = String(fd.get('compra') ?? '');
  const password = String(fd.get('password') ?? '');
  if (!UUID_RE.test(compraId)) return { ok: false, message: 'Ese link no es válido.' };
  if (password.length < 8 || password.length > 72) return { ok: false, message: 'La contraseña va de 8 a 72 caracteres.' };

  const admin = createAdminClient();
  const { data: compra } = await admin.from('pack_purchases').select('id, status, brand_id, created_by').eq('id', compraId).maybeSingle();
  if (!compra || compra.created_by !== null) return { ok: false, message: 'Ese link no es válido.' };
  if (compra.status !== 'paid') return { ok: false, message: 'Tu pago todavía no se confirma. Espera unos segundos y vuelve a intentar.' };

  const { data: brand } = await admin.from('brands').select('id, name, slug, contact_email, archived_at').eq('id', compra.brand_id).single();
  const { count: miembros } = await admin.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', compra.brand_id);
  if (!brand || miembros || !brand.archived_at) redirect('/login');
  const email = (brand.contact_email ?? '').toLowerCase();

  // ¿Ya hay una cuenta con ese correo? Solo se retoma una SIN confirmar y sin
  // marca (alguien empezó la prueba con este correo y no puso el código: si no
  // se retomara, esa persona dejaba trabada la marca ya pagada). Una cuenta
  // confirmada es de alguien: no se le cambia la contraseña.
  let userId: string;
  const { data: existe } = await admin.rpc('usuario_id_por_email', { p_email: email });
  if (existe) {
    const [{ data: u }, { count: suyas }] = await Promise.all([
      admin.auth.admin.getUserById(existe as string),
      admin.from('brand_members').select('brand_id', { count: 'exact', head: true }).eq('user_id', existe as string),
    ]);
    if (!u?.user || u.user.email_confirmed_at || suyas) {
      return { ok: false, message: 'Ese correo ya tiene una cuenta en ParyGo. Escríbenos y dejamos tu marca a tu nombre.' };
    }
    const { error } = await admin.auth.admin.updateUserById(u.user.id, { password, email_confirm: true, user_metadata: { alta_sin_verificar: true } });
    if (error) return { ok: false, message: 'No pudimos crear tu cuenta. Intenta de nuevo en un momento.' };
    userId = u.user.id;
  } else {
    const { data: creado, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { alta_sin_verificar: true } });
    if (error || !creado?.user) {
      // Dos pestañas a la vez: la otra ya creó la cuenta.
      console.error('[empezar/listo] createUser', error?.message);
      return { ok: false, message: 'No pudimos crear tu cuenta. Si ya la creaste en otra pestaña, entra con tu correo y contraseña.' };
    }
    userId = creado.user.id;
  }

  const { error: mErr } = await admin.from('brand_members').insert({ brand_id: brand.id, user_id: userId, role: 'brand_admin', display_name: email });
  if (mErr) {
    console.error('[empezar/listo] membresía', mErr.message);
    return { ok: false, message: 'No pudimos terminar tu alta. Intenta de nuevo en un momento.' };
  }
  await admin.from('brands').update({ archived_at: null }).eq('id', brand.id);
  await admin.from('events_log').insert({ brand_id: brand.id, actor_user_id: userId, type: 'brand_self_signup_claimed', payload: { purchase_id: compra.id } });
  await sendAltaBienvenida({ to: email, marca: brand.name, slug: brand.slug });

  const { error: inErr } = await createClient().auth.signInWithPassword({ email, password });
  redirect(inErr ? '/login' : '/admin');
}
