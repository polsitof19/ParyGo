import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert PEN price stored as int cents → human-friendly "S/40.00".
export function formatPEN(cents: number): string {
  const soles = cents / 100;
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: soles % 1 === 0 ? 0 : 2,
  }).format(soles);
}

// Convert soles (e.g. "40", "40.50") → cents int. Throws on invalid input.
export function solesToCents(input: string | number): number {
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid PEN amount: ${input}`);
  return Math.round(n * 100);
}

// Lima current time (UTC-5, no DST).
export function limaNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs - 5 * 3_600_000);
}

// Zona horaria del negocio (Lima, UTC-5 sin DST). Cloudflare corre en UTC, así
// que TODO formateo de fecha/hora visible debe fijar esta zona, o el comprador
// ve la hora corrida +5h. Centralizado acá para no repetir el bug.
export const LIMA_TZ = 'America/Lima';

// Formatea una fecha en es-PE SIEMPRE en hora de Lima. Helper único para
// fechas/horas visibles; las opciones se mergean con timeZone forzado.
export function formatLima(d: Date | string, opts: Intl.DateTimeFormatOptions): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('es-PE', { ...opts, timeZone: LIMA_TZ }).format(date);
}

// Format a Date as "Sáb 24 may · 22:00" en hora de Lima.
export function formatEventDate(d: Date | string): string {
  return formatLima(d, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(',', ' ·');
}

// Build a wa.me deep link with prefilled text.
export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
