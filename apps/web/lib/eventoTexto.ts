// Textos de fecha y lugar de un evento. Módulo SIN 'use client' a propósito:
// los usan la compra (componente de cliente) y la home de marca (server
// component), y un server component no puede llamar a una función que vive
// en un archivo 'use client' —recibe una referencia de cliente, no la función.

/** "Sábado 26 de setiembre · 9:00 pm" */
export function fmtCuando(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' }).format(d);
  const limpio = dia.replace(/,/g, '');
  return `${limpio.charAt(0).toUpperCase()}${limpio.slice(1)} · ${fmtHora(iso).toLowerCase()}`;
}

/** "9:00 PM" */
export function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Lima' })
    .format(new Date(iso)).replace(/\s?a\.?\s?m\.?/i, ' AM').replace(/\s?p\.?\s?m\.?/i, ' PM').replace(/\s+/g, ' ').trim();
}

/** Distrito deducible de la dirección; si no se puede, no inventa. */
export function distrito(dir?: string | null): string | null {
  const partes = (dir ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (partes.length < 2) return null;
  const sinCiudad = partes.filter((x) => !/^(lima|per[uú])$/i.test(x));
  if (sinCiudad.length < 2) return null;
  return sinCiudad[sinCiudad.length - 1] ?? null;
}
