// Validaciones de evento y tipos de entrada, compartidas por TODOS los caminos
// server que crean o editan (panel del promotor y cabina). Puras: sin I/O.
// Se corren ANTES de cualquier RPC que consuma saldo.

// Convierte un valor <input type="datetime-local"> (hora de Lima) a UTC ISO.
// Lima = UTC-5 fijo (sin horario de verano). Explícito a propósito: `new Date(v)`
// sin zona interpreta la hora local del SERVIDOR, que en Cloudflare es UTC y
// correría el evento 5 horas. Acepta también ISO con zona explícita (Z o ±HH:mm).
// Cualquier otro formato → null (nunca un parseo "a ciegas" en la zona del server).
export function limaToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  let raw: string;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) raw = `${v.length === 16 ? `${v}:00` : v}-05:00`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v)) raw = v;
  else return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Tolerancia para "fecha no pasada": el formulario se llena en minutos; un
// inicio de hace 10 min se acepta (evento que arranca ya), uno de ayer no.
const PAST_GRACE_MS = 10 * 60 * 1000;

export function validateEventWindow(input: {
  startsIso: string;
  endsIso: string | null;
  requireFutureStart: boolean;
  now?: number;
}): string | null {
  const now = input.now ?? Date.now();
  const start = Date.parse(input.startsIso);
  if (!Number.isFinite(start)) return 'Fecha de inicio inválida.';
  if (input.requireFutureStart && start < now - PAST_GRACE_MS) {
    return 'La fecha de inicio ya pasó. Elegí una fecha futura.';
  }
  if (input.endsIso) {
    const end = Date.parse(input.endsIso);
    if (!Number.isFinite(end)) return 'Fecha de fin inválida.';
    if (end <= start) return 'La hora de fin tiene que ser posterior al inicio.';
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
  opts: { freeConfirmed: boolean }
): string | null {
  for (const t of types) {
    const label = t.name?.trim() || 'Un tipo de entrada';
    if (t.pricesCents.some((p) => !Number.isFinite(p) || p < 0)) return `"${label}": precio inválido.`;
    const hasFree = t.pricesCents.some((p) => p === 0);
    if (hasFree && t.isUnlimited) {
      return `"${label}" no puede ser gratis e ilimitado a la vez. Poné un aforo (cupo) o un precio.`;
    }
    if (hasFree && !opts.freeConfirmed) {
      return `"${label}" tiene precio S/ 0. Confirmá que es gratis: no se ofrece en tu página salvo que todo el evento sea gratis, y se emite desde "Cortesías".`;
    }
  }
  return null;
}
