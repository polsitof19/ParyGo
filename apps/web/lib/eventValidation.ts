// Validaciones de evento y tipos de entrada, compartidas por TODOS los caminos
import { textos, type Idioma } from '@/lib/idioma';
import { simbolo, type Moneda } from '@/lib/moneda';
import { localAUtc, type Zona } from '@/lib/zona';
// server que crean o editan (panel del promotor y cabina). Puras: sin I/O.
// Se corren ANTES de cualquier RPC que consuma saldo.

// Convierte un valor <input type="datetime-local"> (hora de la MARCA) a UTC ISO.
// Explícito a propósito: `new Date(v)` sin zona interpreta la hora local del
// SERVIDOR, que en Cloudflare es UTC. Acepta también ISO con zona explícita
// (Z o ±HH:mm). Cualquier otro formato, o una hora que no existe por el cambio
// de horario → null (nunca un parseo "a ciegas" en la zona del server).
export function fechaAIso(v: string | null | undefined, zona: Zona): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return localAUtc(v, zona)?.toISOString() ?? null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Mensaje cuando fechaAIso devuelve null con un valor escrito.
export const fechaInvalida = (l: Idioma = 'es') => textos(l).t(
  'Esa fecha u hora no es válida (o no existe ese día por el cambio de horario).',
  'That date or time is not valid (or does not exist that day because of daylight saving time).',
);

// Tolerancia para "fecha no pasada": el formulario se llena en minutos; un
// inicio de hace 10 min se acepta (evento que arranca ya), uno de ayer no.
const PAST_GRACE_MS = 10 * 60 * 1000;

export type WindowError = { field: 'starts_at' | 'ends_at'; message: string };

export function validateEventWindow(input: {
  startsIso: string;
  endsIso: string | null;
  requireFutureStart: boolean;
  now?: number;
}, l: Idioma = 'es'): WindowError | null {
  const { t } = textos(l);
  const now = input.now ?? Date.now();
  const start = Date.parse(input.startsIso);
  if (!Number.isFinite(start)) return { field: 'starts_at', message: t('Fecha de inicio inválida.', 'Invalid start date.') };
  if (input.requireFutureStart && start < now - PAST_GRACE_MS) {
    return { field: 'starts_at', message: t('La fecha de inicio ya pasó. Elige una fecha futura.', 'The start date has already passed. Choose a future date.') };
  }
  if (input.endsIso) {
    const end = Date.parse(input.endsIso);
    if (!Number.isFinite(end)) return { field: 'ends_at', message: t('Fecha de fin inválida.', 'Invalid end date.') };
    if (end <= start) return { field: 'ends_at', message: t('La hora de fin tiene que ser posterior al inicio.', 'The end time must be after the start time.') };
  }
  return null;
}

// Al mover el inicio, el fin se mueve con el mismo delta (se conserva la
// duración). Sin esto, postergar dejaba ends_at < starts_at y el evento pasaba
// a "terminado" (dejaba de vender).
export function shiftEnd(oldStartIso: string, newStartIso: string, oldEndIso: string | null): string | null {
  if (!oldEndIso) return null;
  const delta = Date.parse(newStartIso) - Date.parse(oldStartIso);
  const end = Date.parse(oldEndIso) + delta;
  return Number.isFinite(end) ? new Date(end).toISOString() : oldEndIso;
}

export type TicketTypeRule = {
  name: string;
  isUnlimited: boolean;
  // Todos los precios del tipo (base + fases), en céntimos.
  pricesCents: number[];
};

// Reglas de precio de un tipo:
// - negativo → inválido;
// - S/0 + ilimitado → bloqueado (entradas gratis infinitas: cualquiera vacía el evento);
// - S/0 con aforo → válido SOLO con confirmación explícita (cortesías / evento gratis).
export function validateTicketTypePricing(
  types: TicketTypeRule[],
  opts: { freeConfirmed: boolean },
  l: Idioma = 'es',
  moneda: Moneda = 'PEN'
): string | null {
  const tx = textos(l).t;
  const sim = simbolo(moneda);
  for (const t of types) {
    const label = t.name?.trim() || tx('Un tipo de entrada', 'A ticket type');
    if (t.pricesCents.some((p) => !Number.isFinite(p) || p < 0)) return tx(`"${label}": precio inválido.`, `"${label}": invalid price.`);
    const hasFree = t.pricesCents.some((p) => p === 0);
    if (hasFree && t.isUnlimited) {
      return tx(`"${label}" no puede ser gratis e ilimitado a la vez. Pon un aforo (cupo) o un precio.`, `"${label}" cannot be both free and unlimited. Set a capacity or a price.`);
    }
    if (hasFree && !opts.freeConfirmed) {
      return tx(`"${label}" tiene precio ${sim} 0. Confirma que es gratis: no se ofrece en tu página salvo que todo el evento sea gratis, y se emite desde "Cortesías".`, `"${label}" is priced at ${sim} 0. Confirm it is free: it is not offered on your page unless the whole event is free, and it is issued from "Complimentary tickets".`);
    }
  }
  return null;
}
