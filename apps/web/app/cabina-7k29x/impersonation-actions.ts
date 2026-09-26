'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { IMP_COOKIE, IMP_EDIT_COOKIE, impersonatedBrandId } from '@/lib/impersonation';

// Iniciar impersonación de SOLO LECTURA. GATE server-side: SOLO super admin.
// El super admin NO cambia de sesión: sigue siendo super admin; solo se setea una
// cookie httpOnly que el panel del dueño reconoce para VER esa marca. Audita el
// inicio del acceso.
export async function startImpersonationAction(brandId: string): Promise<void> {
  const user = await requireSession({ superAdmin: true });
  if (!brandId) redirect('/cabina-7k29x');

  const admin = createAdminClient();
  const { data: brand } = await admin.from('brands').select('id, slug').eq('id', brandId).maybeSingle();
  if (!brand) redirect('/cabina-7k29x');

  cookies().set(IMP_COOKIE, brand.id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    // Una jornada de trabajo: no se queda "dentro" de una marca para siempre.
    maxAge: 60 * 60 * 8,
  });
  // Entrar a una marca arranca SIEMPRE en solo lectura, aunque el modo edición
  // haya quedado encendido en la marca anterior.
  cookies().delete(IMP_EDIT_COOKIE);
  await admin.from('events_log').insert({
    brand_id: brand.id,
    actor_user_id: user.id,
    type: 'impersonation_started',
    payload: { slug: brand.slug },
  });
  redirect('/admin');
}

// Encender o apagar el MODO EDICIÓN dentro de una marca.
//
// Gate: super admin Y dentro de una marca. La cookie no autoriza sola — cada
// escritura vuelve a preguntar (puedeEscribirComoSuper), y ahí se exige otra
// vez el rol real y que la marca coincida. Encender y apagar quedan asentados:
// abrir la puerta es parte de lo que hay que poder reconstruir después.
export async function setSuperEditModeAction(encender: boolean): Promise<void> {
  const user = await requireSession({ superAdmin: true });
  const brandId = impersonatedBrandId();
  if (!brandId) redirect('/cabina-7k29x');

  if (encender) {
    cookies().set(IMP_EDIT_COOKIE, brandId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      // Dura lo que dura una sesión de trabajo: si se olvida encendido, se
      // apaga solo. No es la defensa (esa es el chequeo por escritura), es
      // higiene.
      maxAge: 60 * 60 * 2,
    });
  } else {
    cookies().delete(IMP_EDIT_COOKIE);
  }

  const admin = createAdminClient();
  await admin.from('events_log').insert({
    brand_id: brandId,
    actor_user_id: user.id,
    type: encender ? 'super_edit_mode_on' : 'super_edit_mode_off',
    payload: { acting_email: user.email },
  });
  redirect('/admin');
}

// Salir de la impersonación: borra la cookie y vuelve a la cabina de super admin.
// La sesión de super admin queda intacta (nunca se tocó). Audita el fin del acceso.
export async function stopImpersonationAction(): Promise<void> {
  const user = await requireSession({ superAdmin: true });
  const brandId = impersonatedBrandId();
  cookies().delete(IMP_COOKIE);
  // Al salir de la marca se apaga también el modo edición: no puede quedar
  // encendido esperando la próxima entrada.
  cookies().delete(IMP_EDIT_COOKIE);
  if (brandId) {
    const admin = createAdminClient();
    await admin.from('events_log').insert({
      brand_id: brandId,
      actor_user_id: user.id,
      type: 'impersonation_ended',
      payload: {},
    });
  }
  redirect('/cabina-7k29x');
}
