'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { sendAltaBienvenida } from '@/lib/email/sendAltaEmails';

export type CompletarState = { ok: boolean; message: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cierra el alta con pack: con la compra YA PAGADA, crea la cuenta de la dueña
// con el correo de contacto de la marca y la contraseña que eligió, la hace
// brand_admin y abre la sesión. El id de la compra es el secreto (llega solo
// a quien pagó: la vuelta de MP y el correo "termina de crear tu marca").
// Una sola vez: si la marca ya tiene dueña, al login.
export async function completarAlta(_prev: CompletarState, fd: FormData): Promise<CompletarState> {
  const compraId = String(fd.get('compra') ?? '');
  const password = String(fd.get('password') ?? '');
  if (!UUID_RE.test(compraId)) return { ok: false, message: 'Ese link no es válido.' };
  if (password.length < 8 || password.length > 72) return { ok: false, message: 'La contraseña va de 8 a 72 caracteres.' };

  const admin = createAdminClient();
  const { data: compra } = await admin.from('pack_purchases').select('id, status, brand_id').eq('id', compraId).maybeSingle();
  if (!compra || compra.status !== 'paid') return { ok: false, message: 'Tu pago todavía no se confirma. Espera unos segundos y vuelve a intentar.' };

  const { data: brand } = await admin.from('brands').select('id, name, slug, contact_email').eq('id', compra.brand_id).single();
  const { count: miembros } = await admin.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', compra.brand_id);
  if (!brand || miembros) redirect('/login');
  const email = (brand.contact_email ?? '').toLowerCase();

  const { data: existe } = await admin.rpc('usuario_id_por_email', { p_email: email });
  if (existe) return { ok: false, message: 'Ese correo ya tiene una cuenta en ParyGo. Escríbenos y dejamos tu marca a tu nombre.' };

  const { data: creado, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr || !creado?.user) {
    console.error('[empezar/listo] createUser', cErr?.message);
    return { ok: false, message: 'No pudimos crear tu cuenta. Intenta de nuevo en un momento.' };
  }
  const { error: mErr } = await admin.from('brand_members').insert({ brand_id: brand.id, user_id: creado.user.id, role: 'brand_admin', display_name: email });
  if (mErr) {
    await admin.auth.admin.deleteUser(creado.user.id);
    console.error('[empezar/listo] membresía', mErr.message);
    return { ok: false, message: 'No pudimos terminar tu alta. Intenta de nuevo en un momento.' };
  }
  await admin.from('events_log').insert({ brand_id: brand.id, actor_user_id: creado.user.id, type: 'brand_self_signup_claimed', payload: { purchase_id: compra.id } });
  await sendAltaBienvenida({ to: email, marca: brand.name, slug: brand.slug });

  const { error: inErr } = await createClient().auth.signInWithPassword({ email, password });
  redirect(inErr ? '/login' : '/admin');
}
