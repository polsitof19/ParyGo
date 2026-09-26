import { type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';

// =============================================================
// GET /api/admin/events/[id]/export-clientes
// =============================================================
// A6 — Export CSV COMPLETO: descarga TODOS los compradores pagados del evento
// (no solo la página visible). Mismos campos que la tabla de clientes. Solo el
// dueño de la marca (o super admin desde su panel); cero acceso cruzado entre
// marcas. No expone PII nueva — son los mismos datos que ya ve en /clientes.

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BATCH = 1000;
const docLabel = (t: string | null) => (t === 'ce' ? 'CE' : t === 'passport' ? 'Pasaporte' : 'DNI');
const methodLabel = (m: string) => (m === 'mercadopago' ? 'MercadoPago' : m === 'yape_manual' ? 'Yape' : m);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

// Escape CSV: comillas dobladas + envolver si hay coma/comilla/salto de línea.
function csvCell(v: string | number | null): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type OrderRow = {
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  buyer_dni: string | null;
  buyer_doc_type: string | null;
  payment_method: string;
  total_cents: number | null;
  discount_cents: number | null;
  created_at: string;
  tickets: { ticket_type_name: string; invalidated_at: string | null }[] | null;
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireSession();
  } catch {
    return new Response('No autorizado', { status: 401 });
  }
  const ctx = ownerBrandContext(user);
  if (!ctx) return new Response('No autorizado', { status: 403 });

  const admin = createAdminClient();
  // TENANCY: el evento debe ser de la marca activa (sesión o impersonada), nunca
  // del parámetro libre. Mismo guard que /clientes.
  const { data: event } = await admin
    .from('events')
    .select('id, brand_id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) {
    return new Response('No encontrado', { status: 404 });
  }

  // Traemos TODAS las órdenes pagadas en lotes (sin tope de página).
  const headers = ['Nombre', 'Email', 'WhatsApp', 'Documento', 'Entradas', 'Total', 'Descuento', 'Método', 'Fecha'];
  const lines = [headers.join(',')];
  for (let from = 0; ; from += BATCH) {
    const { data: orders, error } = await admin
      .from('orders')
      .select(`
        buyer_name, buyer_email, buyer_phone, buyer_dni, buyer_doc_type,
        payment_method, total_cents, discount_cents, created_at,
        tickets ( ticket_type_name, invalidated_at )
      `)
      .eq('event_id', event.id)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .range(from, from + BATCH - 1);
    if (error) return new Response('Error al exportar', { status: 500 });
    const batch = (orders ?? []) as OrderRow[];
    for (const o of batch) {
      const tix = (o.tickets ?? []).map((t) => `${t.ticket_type_name}${t.invalidated_at ? ' (ANULADA)' : ''}`).join(' | ');
      lines.push([
        csvCell(o.buyer_name), csvCell(o.buyer_email), csvCell(o.buyer_phone),
        csvCell(`${docLabel(o.buyer_doc_type)} ${o.buyer_dni ?? ''}`.trim()),
        csvCell(tix), csvCell(((o.total_cents ?? 0) / 100).toFixed(2)), csvCell(((o.discount_cents ?? 0) / 100).toFixed(2)),
        csvCell(methodLabel(o.payment_method)), csvCell(fmtDate(o.created_at)),
      ].join(','));
    }
    if (batch.length < BATCH) break;
  }

  const slug = (event.name || 'evento').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  // BOM para que Excel abra los acentos bien.
  const body = '﻿' + lines.join('\r\n');
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv;charset=utf-8;',
      'content-disposition': `attachment; filename="clientes-${slug}-completo.csv"`,
      'cache-control': 'no-store',
    },
  });
}
