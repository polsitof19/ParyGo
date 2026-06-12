'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { IMP_COOKIE, impersonatedBrandId } from '@/lib/impersonation';

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
  });
  await admin.from('events_log').insert({
    brand_id: brand.id,
    actor_user_id: user.id,
    type: 'impersonation_started',
    payload: { slug: brand.slug },
  });
  redirect('/admin');
}

// Salir de la impersonación: borra la cookie y vuelve a la cabina de super admin.
// La sesión de super admin queda intacta (nunca se tocó). Audita el fin del acceso.
export async function stopImpersonationAction(): Promise<void> {
  const user = await requireSession({ superAdmin: true });
  const brandId = impersonatedBrandId();
  cookies().delete(IMP_COOKIE);
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
