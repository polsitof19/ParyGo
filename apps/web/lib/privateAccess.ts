import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

// ENTRADAS PRIVADAS CON LINK (0066, 2026-09-23). Un tipo es privado si tiene
// fila en ticket_type_access; solo se ofrece, se reserva y se emite con su
// token (…/<evento>?acceso=TOKEN). La tabla es solo service role: esto corre
// únicamente en el server.

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I: se dictan sin confundir
const TOKEN_RE = /^[A-Z0-9]{8,32}$/;

/** Token del link (lo que manda el cliente) normalizado, o null si no tiene forma. */
export function normalizarToken(t?: string | null): string | null {
  const s = (t ?? '').trim().toUpperCase();
  return TOKEN_RE.test(s) ? s : null;
}

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
export function mismoToken(esperado: string | undefined | null, recibido: string | null): boolean {
  if (!esperado || !recibido || esperado.length !== recibido.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  return diff === 0;
}

/** Token nuevo, 10 caracteres de CSPRNG. */
export function generarToken(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

/** Map tipo → token de los tipos PRIVADOS entre esos ids. */
export async function tokensPrivados(admin: Admin, ticketTypeIds: string[]): Promise<Map<string, string>> {
  if (ticketTypeIds.length === 0) return new Map();
  const { data, error } = await admin.from('ticket_type_access').select('ticket_type_id, token').in('ticket_type_id', ticketTypeIds);
  // Fail-closed: si no se puede leer, se trata como que TODOS son privados sin
  // token conocido (nadie los ve ni los reclama) en vez de abrirlos.
  if (error) {
    console.error('[tokensPrivados] no se pudo leer ticket_type_access', error.message);
    return new Map(ticketTypeIds.map((id) => [id, '\u0000']));
  }
  return new Map((data ?? []).map((r) => [r.ticket_type_id as string, r.token as string]));
}
