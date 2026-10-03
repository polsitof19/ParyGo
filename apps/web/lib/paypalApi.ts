// PayPal REST (Orders v2 + Payments v2) con fetch: corre en el edge. Recibe las
// credenciales, así lo usan los dos cobros: el de ParyGo (packs, claves de
// Paul en variables de entorno, lib/cobroParygo.ts) y el de las ENTRADAS
// (claves de cada marca, lib/paypalMarca.ts; plan en AGENTS.md).

export type PaypalCred = { clientId: string; secret: string; sandbox: boolean };

const base = (c: PaypalCred) => (c.sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');

// Montos: PayPal habla en texto con 2 decimales (USD, EUR, MXN). Nada de
// floats: 19.99 * 100 = 1998.9999…
export const montoPaypal = (cents: number): string => {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('monto_invalido');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
};
export const centsDePaypal = (v: unknown): number | null => {
  const m = typeof v === 'string' ? /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(v) : null;
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0')) : null;
};

export async function paypalToken(c: PaypalCred): Promise<string> {
  const r = await fetch(`${base(c)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${c.clientId}:${c.secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string };
  if (!r.ok || !j.access_token) throw new Error(`paypal_token_${r.status}`);
  return j.access_token;
}

export type PaypalCaptura = {
  id?: string; status?: string;
  amount?: { currency_code?: string; value?: string };
  custom_id?: string; invoice_id?: string;
  supplementary_data?: { related_ids?: { order_id?: string } };
};
type PaypalOrden = {
  id?: string; status?: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { custom_id?: string; payments?: { captures?: PaypalCaptura[] } }[];
  details?: { issue?: string }[];
};

export async function paypalCrearOrden(c: PaypalCred, i: {
  ref: string; descripcion: string; moneda: string; valor: string; marca: string;
  volver: string; cancelar: string; invoiceId?: string;
}): Promise<{ id: string; aprobar: string }> {
  const r = await fetch(`${base(c)}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await paypalToken(c)}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `crear-${i.ref}` },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: i.ref, custom_id: i.ref, description: i.descripcion.slice(0, 127),
        ...(i.invoiceId ? { invoice_id: i.invoiceId } : {}),
        amount: { currency_code: i.moneda, value: i.valor },
      }],
      payment_source: { paypal: { experience_context: {
        brand_name: i.marca.slice(0, 127), shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW',
        return_url: i.volver, cancel_url: i.cancelar,
      } } },
    }),
  });
  const j = (await r.json().catch(() => ({}))) as PaypalOrden;
  const aprobar = j.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  if (!r.ok || !j.id || !aprobar) throw new Error(`paypal_crear_${r.status}`);
  return { id: j.id, aprobar };
}

// Cobra la orden aprobada (la plata se mueve ACÁ, no antes). Idempotente: si
// ya estaba cobrada, se lee la captura existente. Devuelve la captura
// COMPLETED o null. `rechazado`: PayPal dijo que NO (tarjeta rechazada, orden
// no aprobada o vencida); reintentar la misma orden no sirve.
// `pendiente`: la captura existe pero PayPal todavía no la completó (revisión);
// el aviso PAYMENT.CAPTURE.COMPLETED llega después.
const RECHAZOS = new Set(['INSTRUMENT_DECLINED', 'ORDER_NOT_APPROVED', 'ORDER_EXPIRED', 'PAYER_ACTION_REQUIRED', 'TRANSACTION_REFUSED', 'PAYER_CANNOT_PAY']);

export async function paypalCapturar(c: PaypalCred, ordenId: string, ref: string): Promise<{ captura: PaypalCaptura | null; rechazado: boolean; pendiente: boolean }> {
  const token = await paypalToken(c);
  const r = await fetch(`${base(c)}/v2/checkout/orders/${encodeURIComponent(ordenId)}/capture`, {
    method: 'POST',
    // Idempotencia por ORDEN: con el id de la compra, un reintento tras un
    // rechazo podía recibir de PayPal la misma respuesta guardada.
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `cobrar-${ordenId}` },
  });
  let j = (await r.json().catch(() => ({}))) as PaypalOrden;
  if (!r.ok && j.details?.some((d) => d.issue === 'ORDER_ALREADY_CAPTURED')) {
    const g = await fetch(`${base(c)}/v2/checkout/orders/${encodeURIComponent(ordenId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!g.ok) throw new Error(`paypal_leer_orden_${g.status}`);
    j = (await g.json()) as PaypalOrden;
  } else if (!r.ok) {
    const rechazado = !!j.details?.some((d) => d.issue && RECHAZOS.has(d.issue));
    // Un 5xx/429 no es un "no": el que llama reintenta, no falla la orden.
    if (!rechazado && (r.status >= 500 || r.status === 429)) throw new Error(`paypal_capturar_${r.status}`);
    return { captura: null, rechazado, pendiente: false };
  }
  const unidad = j.purchase_units?.[0];
  const caps = unidad?.payments?.captures ?? [];
  const cap = caps.find((x) => x.status === 'COMPLETED');
  if (!cap) {
    // Captura DECLINED/FAILED dentro de una respuesta 2xx: también es un no.
    const mala = caps.some((x) => x.status === 'DECLINED' || x.status === 'FAILED');
    return { captura: null, rechazado: mala, pendiente: !mala && caps.some((x) => x.status === 'PENDING') };
  }
  // La orden tiene que ser de ESTA compra (custom_id lo puso el server al crearla).
  const custom = cap.custom_id ?? unidad?.custom_id;
  if (custom !== ref) return { captura: null, rechazado: false, pendiente: false };
  return { captura: { ...cap, custom_id: custom }, rechazado: false, pendiente: false };
}

// Relee una captura (el webhook no cree el cuerpo del aviso). null = no existe
// para estas credenciales.
export async function paypalLeerCaptura(c: PaypalCred, capturaId: string): Promise<PaypalCaptura | null> {
  const r = await fetch(`${base(c)}/v2/payments/captures/${encodeURIComponent(capturaId)}`, {
    headers: { Authorization: `Bearer ${await paypalToken(c)}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`paypal_leer_captura_${r.status}`);
  return (await r.json()) as PaypalCaptura;
}

// Devolución TOTAL de una captura (sin cuerpo = todo). Idempotente por captura.
export async function paypalDevolver(c: PaypalCred, capturaId: string): Promise<boolean> {
  const r = await fetch(`${base(c)}/v2/payments/captures/${encodeURIComponent(capturaId)}/refund`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await paypalToken(c)}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `devolver-${capturaId}` },
    body: '{}',
  });
  const j = (await r.json().catch(() => ({}))) as { status?: string; details?: { issue?: string }[] };
  if (j.details?.some((d) => d.issue === 'CAPTURE_FULLY_REFUNDED')) return true;
  return r.ok && (j.status === 'COMPLETED' || j.status === 'PENDING');
}

export const EVENTOS_WEBHOOK = ['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'];

export async function paypalCrearWebhook(c: PaypalCred, url: string): Promise<string> {
  const token = await paypalToken(c);
  const r = await fetch(`${base(c)}/v1/notifications/webhooks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, event_types: EVENTOS_WEBHOOK.map((name) => ({ name })) }),
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; name?: string };
  if (r.ok && j.id) return j.id;
  // La app ya tenía ese mismo URL (reconectar): se reusa el existente.
  if (j.name === 'WEBHOOK_URL_ALREADY_EXISTS') {
    const l = await fetch(`${base(c)}/v1/notifications/webhooks`, { headers: { Authorization: `Bearer ${token}` } });
    const lj = (await l.json().catch(() => ({}))) as { webhooks?: { id: string; url: string }[] };
    const w = lj.webhooks?.find((x) => x.url === url);
    if (w) return w.id;
  }
  throw new Error(`paypal_webhook_${r.status}`);
}

export async function paypalBorrarWebhook(c: PaypalCred, id: string): Promise<void> {
  await fetch(`${base(c)}/v1/notifications/webhooks/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${await paypalToken(c)}` },
  }).catch(() => undefined);
}
