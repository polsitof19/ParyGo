import { cookies } from 'next/headers';
import type { SessionUser } from '@/lib/auth';

// =============================================================
// El super admin dentro de una marca: VER y, si lo enciende, EDITAR.
// =============================================================
// El super admin NUNCA cambia su sesión de auth: sigue siendo él. Dos cookies
// httpOnly describen dónde está parado:
//
//   parygo_imp       → "estoy dentro de la marca X" (ver)
//   parygo_imp_edit  → "y además tengo el modo edición encendido"
//
// El boundary es SIEMPRE server-side. Las cookies no autorizan por sí solas:
// solo se honran si la sesión real es de super admin (is_super_admin en
// user_profiles, leído en cada request por getSessionUser). Un brand_admin que
// las forje no gana nada — su camino de escritura es su membresía, que no mira
// estas cookies.
//
// POR QUÉ EL MODO EDICIÓN ES EXPLÍCITO Y ARRANCA APAGADO: entrar a una marca
// para mirar un problema es lo que más se hace, y es cuando más fácil sería
// tocar algo sin querer en la cuenta de otro. Encenderlo es un acto
// deliberado, se ve en una franja mientras dura, y cada escritura queda
// firmada con quién la hizo y sobre qué marca.
// =============================================================

export const IMP_COOKIE = 'parygo_imp';
export const IMP_EDIT_COOKIE = 'parygo_imp_edit';

// brandId que el super admin está VIENDO, o null. No verifica el rol: quien lee
// debe chequear isSuperAdmin antes de honrarlo (ownerBrandContext lo hace).
export function impersonatedBrandId(): string | null {
  return cookies().get(IMP_COOKIE)?.value || null;
}

// ¿Está encendido el modo edición? La cookie guarda la MARCA para la que se
// encendió, y solo vale si es la misma que se está viendo: encenderlo en A y
// entrar después a B no deja a B editable sin un clic deliberado. Quien decide
// igual es puedeEscribirComoSuper, que además exige ser super admin de verdad.
export function modoEdicionSuper(): boolean {
  const imp = impersonatedBrandId();
  return !!imp && cookies().get(IMP_EDIT_COOKIE)?.value === imp;
}

// Resuelve la marca "activa" del panel del dueño (/admin):
//  - super admin con cookie de impersonación → esa marca
//  - brand_admin → su propia marca
//  - cualquier otro → null
//
// `soloLectura` es lo que la interfaz tiene que mirar para esconder o
// deshabilitar controles: es verdadero cuando el super admin está VIENDO sin
// modo edición. Nunca es la única defensa: cada acción de escritura vuelve a
// decidir en el server con puedeEscribirComoSuper.
export function ownerBrandContext(
  user: SessionUser
): { brandId: string; impersonating: boolean; modoEdicion: boolean; soloLectura: boolean } | null {
  const imp = impersonatedBrandId();
  if (user.isSuperAdmin && imp) {
    const modoEdicion = modoEdicionSuper();
    return { brandId: imp, impersonating: true, modoEdicion, soloLectura: !modoEdicion };
  }
  const m = user.brandMemberships.find((x) => x.role === 'brand_admin');
  if (m) return { brandId: m.brandId, impersonating: false, modoEdicion: false, soloLectura: false };
  return null;
}

export type ModoEscrituraSuper = 'cabina' | 'edicion';

// La marca sobre la que esta sesión puede ESCRIBIR desde el panel del dueño, y
// por qué camino. Es el hermano de ownerBrandContext (que resuelve qué se VE).
//
// Existe porque varias acciones resolvían la marca con
// `brandMemberships.find(role === 'brand_admin')`, o sea LA PROPIA, sin mirar
// dónde estaba parado el usuario. Para un super admin que además es dueño de
// una marca, eso escribía en la marca equivocada mientras "veía" otra.
export function contextoEscritura(
  user: SessionUser
): { brandId: string; modo: ModoEscrituraSuper | null } | null {
  const imp = impersonatedBrandId();
  if (user.isSuperAdmin && imp) {
    return modoEdicionSuper() ? { brandId: imp, modo: 'edicion' } : null;
  }
  const m = user.brandMemberships.find((x) => x.role === 'brand_admin');
  return m ? { brandId: m.brandId, modo: null } : null;
}

// ¿Puede este super admin ESCRIBIR sobre esta marca, y por qué camino?
//
//   'cabina'  → no está dentro de ninguna marca; escribe desde /cabina-*,
//               como siempre (editar un evento desde la ficha del super admin).
//   'edicion' → está dentro de la marca Y encendió el modo edición. Solo sobre
//               ESA marca: la cookie de impersonación es la que manda, no el
//               brandId que venga en el formulario.
//   null      → no puede. Incluye el caso importante: super admin DENTRO de una
//               marca con el modo apagado (solo lectura).
//
// Devolver el modo, y no un booleano, es a propósito: quien escribe necesita
// saberlo para dejarlo asentado en la auditoría.
export function puedeEscribirComoSuper(user: SessionUser, brandId: string): ModoEscrituraSuper | null {
  if (!user.isSuperAdmin) return null;
  const imp = impersonatedBrandId();
  if (!imp) return 'cabina';
  if (!modoEdicionSuper()) return null;
  return imp === brandId ? 'edicion' : null;
}
