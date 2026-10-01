// Regla única de contraseñas (Paul, 2026-10-01): 8 a 72 caracteres, con al
// menos una minúscula, una MAYÚSCULA y un número. La usan TODOS los lugares
// que fijan una contraseña (alta, cabina, equipo de puerta) y la impone además
// Supabase Auth (password_min_length + password_required_characters), así un
// camino que se olvide de llamarla igual queda cubierto.
// 72: límite de bcrypt en Supabase (lo que pasa de 72 bytes se ignora).

export function passwordOk(p: string): boolean {
  return p.length >= 8 && p.length <= 72 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
}

export const PASSWORD_REGLA = {
  es: 'Mínimo 8 caracteres, con una mayúscula, una minúscula y un número.',
  en: 'At least 8 characters, with an uppercase letter, a lowercase letter and a number.',
} as const;

/** Contraseña al azar que cumple la regla (cuentas que aún no eligieron la suya). */
export function passwordAlAzar(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  const base = btoa(String.fromCharCode(...b)).replace(/[^A-Za-z0-9]/g, '');
  return `Az9${base}`.slice(0, 40);
}
