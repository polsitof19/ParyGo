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

// Format a Date as "Sáb 24 may · 22:00" in es-PE.
export function formatEventDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(',', ' ·');
}

// Build a wa.me deep link with prefilled text.
export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
