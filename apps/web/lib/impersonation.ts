import { cookies } from 'next/headers';
import type { SessionUser } from '@/lib/auth';

// =============================================================
// Impersonación de SOLO LECTURA del super admin ("Entrar a la marca").
// El super admin NO cambia su sesión de auth real: sigue siendo super admin.
// Una cookie httpOnly marca "estoy VIENDO la marca X". El boundary de seguridad
// es siempre server-side: requireSession superAdmin para iniciar, y las guardas
// de escritura deniegan el camino super-admin mientras la cookie esté presente.
// =============================================================

export const IMP_COOKIE = 'parygo_imp';

// brandId que el super admin está VIENDO (impersonando), o null. NO verifica el
// rol: el caller de LECTURA debe chequear isSuperAdmin antes de honrarlo
// (ownerBrandContext lo hace). Un brand_admin que forje esta cookie no gana nada:
// para leer, ownerBrandContext exige isSuperAdmin; para escribir, la cookie solo
// DENIEGA (nunca habilita) — ver isImpersonating.
export function impersonatedBrandId(): string | null {
  return cookies().get(IMP_COOKIE)?.value || null;
}

// ¿Hay una sesión de impersonación activa (cookie presente)? Las guardas de
// ESCRITURA que permiten al super admin (authEvent, authorizeEventBrandAdmin,
// setEventCoverAction) deben DENEGAR el camino super-admin cuando esto es true:
// mientras "ves" una marca, no podés escribir como nadie (modo solo lectura).
// Un brand_admin nunca recibe esta cookie; si la forjara, solo se auto-denegaría
// sus propios writes (su camino real es por membresía, que no se ve afectado).
export function isImpersonating(): boolean {
  return impersonatedBrandId() !== null;
}

// Resuelve la marca "activa" del panel del dueño (/admin):
//  - super admin con cookie de impersonación → esa marca (impersonating=true)
//  - brand_admin → su propia marca (impersonating=false)
//  - cualquier otro → null
export function ownerBrandContext(
  user: SessionUser
): { brandId: string; impersonating: boolean } | null {
  const imp = impersonatedBrandId();
  if (user.isSuperAdmin && imp) return { brandId: imp, impersonating: true };
  const m = user.brandMemberships.find((x) => x.role === 'brand_admin');
  if (m) return { brandId: m.brandId, impersonating: false };
  return null;
}
