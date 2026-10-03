import { cache } from 'react';
import { getSessionUser } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { textos, type Idioma, type Textos } from '@/lib/idioma';

// Idioma del panel en server components y server actions: el de la marca
// activa (dueña → su marca; validador → la marca del escáner). El super admin
// mirando una marca la ve en español: es Paul, y el soporte se hace en español.
export const idiomaPanel = cache(async (): Promise<Idioma> => {
  const user = await getSessionUser();
  if (!user || user.isSuperAdmin) return 'es';
  const ctx = ownerBrandContext(user);
  const m = (ctx && user.brandMemberships.find((x) => x.brandId === ctx.brandId)) ?? user.brandMemberships[0];
  return m?.idioma ?? 'es';
});

export async function textosPanel(): Promise<Textos> {
  return textos(await idiomaPanel());
}
