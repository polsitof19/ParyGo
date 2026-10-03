import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { procesarAvisoPaypal } from '@/lib/paypalMarca';
import { enqueueTicketEmail } from '@/lib/email/enqueueTicketEmail';
import type { PaypalCaptura } from '@/lib/paypalApi';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// =============================================================
// Aviso (webhook) de PayPal de una MARCA (0091; plan en AGENTS.md).
// =============================================================
// La marca registró este URL en SU app al conectar. El cuerpo NO se cree:
// procesarAvisoPaypal primero exige que la base reconozca la captura / la
// orden de PayPal como de ESTA marca (un id inventado no llega a PayPal) y
// después la RELEE con el token de la marca. Respaldo de la vuelta del
// comprador (COMPLETED) y devoluciones / contracargos (REFUNDED, REVERSED).
// 200 a todo lo que no es nuestro; 503 solo si falló algo transitorio (PayPal
// reintenta hasta 25 veces en 3 días).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lee el cuerpo cortando apenas pasa el tope (sin Content-Length o chunked,
// req.text() lo cargaba entero antes de mirar el tamaño; Codex). null = grande.
async function leerHasta(req: NextRequest, tope: number): Promise<string | null> {
  if (!req.body) return '';
  const lector = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > tope) { await lector.cancel(); return null; }
    partes.push(value);
  }
  const todo = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { todo.set(p, i); i += p.byteLength; }
  return new TextDecoder().decode(todo);
}

export async function POST(req: NextRequest, { params }: { params: { brandId: string } }) {
  if (!UUID_RE.test(params.brandId)) return NextResponse.json({ ok: false }, { status: 200 });
  // El tamaño se mira ANTES de leer el cuerpo (security review B4).
  if (Number(req.headers.get('content-length') ?? '0') > 64_000) return NextResponse.json({ ok: false }, { status: 200 });
  const texto = await leerHasta(req, 64_000);
  if (texto === null) return NextResponse.json({ ok: false }, { status: 200 });
  let aviso: { event_type?: unknown; resource?: unknown };
  try { aviso = JSON.parse(texto); } catch { return NextResponse.json({ ok: false }, { status: 200 }); }
  const evento = typeof aviso.event_type === 'string' ? aviso.event_type : '';
  const recurso = (aviso.resource && typeof aviso.resource === 'object' ? aviso.resource : {}) as PaypalCaptura;

  const admin = createAdminClient();
  const r = await procesarAvisoPaypal(admin, params.brandId, evento, recurso, serverEnv.BRAND_CREDS_ENCRYPTION_KEY);
  // 'error' = falló la base al liquidar o la devolución automática: 503 para
  // que PayPal reintente (con 200 dejaba de avisar y el cobro quedaba sin
  // entrada si el comprador no volvía; Codex).
  if (!r.ok && (r.motivo === 'reintentar' || r.motivo === 'error')) {
    if (r.motivo === 'error') console.error('[paypal-webhook]', { brandId: params.brandId, evento, detalle: r.detalle });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (r.ok && r.action === 'issued') {
    const orden = await admin.from('orders').select('id').eq('brand_id', params.brandId).eq('paypal_capture_id', recurso.id ?? '').maybeSingle();
    if (orden.data) {
      const e = await enqueueTicketEmail(admin, orden.data.id);
      if (!e.ok) console.error('[paypal-webhook] no se pudo encolar el email', { orderId: orden.data.id, reason: e.reason });
    }
  }
  return NextResponse.json({ ok: true });
}
