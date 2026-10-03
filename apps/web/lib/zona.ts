// Zona horaria de una marca (brands.zona_horaria, 0088). Las fechas se guardan
// en UTC (timestamptz); esto es solo cómo se LEEN y se ESCRIBEN en la hora de la
// marca. Sin librerías: Intl sabe el horario de verano de cada zona.

export const ZONAS = [
  'America/Lima', 'America/Bogota', 'America/Mexico_City', 'America/Santiago',
  'America/Argentina/Buenos_Aires', 'America/Guayaquil', 'Europe/Madrid', 'America/New_York',
] as const;
export type Zona = (typeof ZONAS)[number];

export const zonaDe = (v: unknown): Zona =>
  typeof v === 'string' && (ZONAS as readonly string[]).includes(v) ? (v as Zona) : 'America/Lima';

// Igual que formatLima, en la zona que se le pase.
export function formatEnZona(d: Date | string, opts: Intl.DateTimeFormatOptions, zona: Zona, locale = 'es-PE'): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: zona }).format(typeof d === 'string' ? new Date(d) : d);
}

// Reloj de pared de `ms` en la zona, como si fuera UTC (para restar offsets).
function pared(ms: number, zona: Zona): number {
  const p: Record<string, string> = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  const n = (k: string) => Number(p[k] ?? 0);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
}

// "2026-12-05T21:00" (lo que da un <input type="datetime-local">) en la zona →
// Date UTC. null si no es una fecha o si esa hora NO EXISTE ese día (el salto
// del horario de verano: en Madrid el último domingo de marzo no hay 02:30).
// En la hora repetida del otoño toma la primera.
export function localAUtc(local: string, zona: Zona): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const [y = 0, mo = 0, dia = 0, h = 0, mi = 0, se = 0] = m.slice(1).map((x) => Number(x ?? 0));
  const deseado = Date.UTC(y, mo - 1, dia, h, mi, se);
  // Date.UTC "arregla" un 31/02 o una hora 25 corriendo el día: eso es basura.
  const d = new Date(deseado);
  if (d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== dia || d.getUTCHours() !== h || d.getUTCMinutes() !== mi) return null;
  // Dos candidatos (el offset de antes y el de después de un cambio de hora).
  const c1 = deseado - (pared(deseado, zona) - deseado);
  const c2 = deseado - (pared(c1, zona) - c1);
  const validos = [c1, c2].filter((t) => pared(t, zona) === deseado);
  return validos.length ? new Date(Math.min(...validos)) : null;
}

// UTC → "2026-12-05T21:00" en la zona (para el value de un datetime-local).
export function utcALocal(d: Date | string, zona: Zona): string {
  return new Date(pared(new Date(d).getTime(), zona)).toISOString().slice(0, 16);
}

// "2026-12-05": el día de hoy en la zona.
export const hoyEn = (zona: Zona, ahora = new Date()) => utcALocal(ahora, zona).slice(0, 10);
