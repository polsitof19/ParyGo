// lib/paypalApi.ts sin red (fetch interceptado).   cd apps/web && npx tsx ../../e2e/paypal-api.test.mts
const api = await import('@/lib/paypalApi');
const { montoPaypal, centsDePaypal } = api;

let ok = 0, mal = 0;
const check = (n: string, c: boolean, d = '') => { c ? ok++ : mal++; console.log(`${c ? '✔' : '✘'} ${n}${d ? ' · ' + d : ''}`); };
const tira = async (f: () => unknown) => { try { await f(); return false; } catch { return true; } };

// ---------- montos por texto ----------
for (const [c, v] of [[1, '0.01'], [1999, '19.99'], [123450, '1234.50'], [100, '1.00']] as const) {
  check(`montoPaypal(${c}) = ${v}`, montoPaypal(c) === v, montoPaypal(c));
  check(`centsDePaypal(${v}) = ${c}`, centsDePaypal(v) === c);
}
check('centsDePaypal("12.3") = 1230', centsDePaypal('12.3') === 1230);
check('centsDePaypal("12") = 1200', centsDePaypal('12') === 1200);
for (const v of ['12.345', '-1.00', '1e3', '', ' 12.00', '12,00', null, 12]) check(`centsDePaypal(${JSON.stringify(v)}) = null`, centsDePaypal(v) === null);
for (const c of [0, -5, 1.5, NaN]) check(`montoPaypal(${c}) tira`, await tira(() => montoPaypal(c)));

// ---------- fetch interceptado ----------
type Llamada = { url: string; init: RequestInit };
let llamadas: Llamada[] = [];
let respuestas: ((u: string) => Response | undefined)[] = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = (async (u: string, init: RequestInit = {}) => {
  llamadas.push({ url: String(u), init });
  if (String(u).endsWith('/v1/oauth2/token')) return json({ access_token: 'TOK' });
  for (const r of respuestas) { const x = r(String(u)); if (x) return x; }
  return json({}, 500);
}) as typeof fetch;
const reset = (...r: typeof respuestas) => { llamadas = []; respuestas = r; };
const C = { clientId: 'cid', secret: 'sec', sandbox: true };
const L = { ...C, sandbox: false };

// crear orden
reset((u) => (u.endsWith('/v2/checkout/orders') ? json({ id: 'PP1', links: [{ rel: 'payer-action', href: 'https://paypal/aprobar' }] }, 201) : undefined));
const o = await api.paypalCrearOrden(C, { ref: 'ORD-1', descripcion: 'Fiesta · 2 entradas', moneda: 'EUR', valor: '24.68', marca: 'Noche Norte', volver: 'https://a/v', cancelar: 'https://a/c', invoiceId: 'ORD-1' });
const crear = llamadas.find((l) => l.url.endsWith('/v2/checkout/orders'))!;
const cuerpo = JSON.parse(String(crear.init.body));
const pu = cuerpo.purchase_units[0];
check('crear: devuelve id y link de aprobación', o.id === 'PP1' && o.aprobar === 'https://paypal/aprobar');
check('crear: sandbox va a api-m.sandbox', crear.url.startsWith('https://api-m.sandbox.paypal.com'));
check('crear: intent CAPTURE, monto y moneda por texto', cuerpo.intent === 'CAPTURE' && pu.amount.value === '24.68' && pu.amount.currency_code === 'EUR');
check('crear: custom_id e invoice_id = la orden', pu.custom_id === 'ORD-1' && pu.invoice_id === 'ORD-1');
check('crear: NO_SHIPPING y return/cancel', cuerpo.payment_source.paypal.experience_context.shipping_preference === 'NO_SHIPPING' && cuerpo.payment_source.paypal.experience_context.return_url === 'https://a/v');
check('crear: PayPal-Request-Id', (crear.init.headers as Record<string, string>)['PayPal-Request-Id'] === 'crear-ORD-1');
reset((u) => (u.endsWith('/v2/checkout/orders') ? json({ name: 'UNPROCESSABLE_ENTITY' }, 422) : undefined));
check('crear: error de PayPal → tira', await tira(() => api.paypalCrearOrden(L, { ref: 'x', descripcion: 'x', moneda: 'USD', valor: '1.00', marca: 'x', volver: 'v', cancelar: 'c' })));
check('live va a api-m.paypal.com', llamadas.some((l) => l.url.startsWith('https://api-m.paypal.com/')));

// capturar
const capOk = (custom = 'ORD-1', status = 'COMPLETED') => json({ id: 'PP1', status: 'COMPLETED', purchase_units: [{ custom_id: custom, payments: { captures: [{ id: 'CAP1', status, amount: { currency_code: 'EUR', value: '24.68' }, custom_id: custom }] } }] }, 201);
reset((u) => (u.endsWith('/capture') ? capOk() : undefined));
let c = await api.paypalCapturar(C, 'PP1', 'ORD-1');
check('capturar: COMPLETED de esta orden → captura', c.captura?.id === 'CAP1' && !c.rechazado);
check('capturar: Request-Id por orden de PayPal', (llamadas.find((l) => l.url.endsWith('/capture'))!.init.headers as Record<string, string>)['PayPal-Request-Id'] === 'cobrar-PP1');
reset((u) => (u.endsWith('/capture') ? capOk('ORD-OTRA') : undefined));
c = await api.paypalCapturar(C, 'PP1', 'ORD-1');
check('capturar: custom_id de OTRA orden → nada', c.captura === null && !c.rechazado);
reset((u) => (u.endsWith('/capture') ? json({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }, 422) : undefined),
  (u) => (u.endsWith('/v2/checkout/orders/PP1') ? capOk() : undefined));
c = await api.paypalCapturar(C, 'PP1', 'ORD-1');
check('capturar: ALREADY_CAPTURED → lee la orden y devuelve la captura', c.captura?.id === 'CAP1');
reset((u) => (u.endsWith('/capture') ? json({ details: [{ issue: 'INSTRUMENT_DECLINED' }] }, 422) : undefined));
c = await api.paypalCapturar(C, 'PP1', 'ORD-1');
check('capturar: INSTRUMENT_DECLINED → rechazado', c.captura === null && c.rechazado);
reset((u) => (u.endsWith('/capture') ? capOk('ORD-1', 'DECLINED') : undefined));
c = await api.paypalCapturar(C, 'PP1', 'ORD-1');
check('capturar: captura DECLINED en un 201 → rechazado', c.captura === null && c.rechazado);
reset((u) => (u.endsWith('/capture') ? capOk('ORD-1', 'PENDING') : undefined));
c = await api.paypalCapturar(C, 'PP1', 'ORD-1');
check('capturar: PENDING → pendiente, sin captura', c.captura === null && c.pendiente && !c.rechazado);
reset((u) => (u.endsWith('/capture') ? json({}, 503) : undefined));
check('capturar: 503 → tira (reintento, no "rechazado")', await tira(() => api.paypalCapturar(C, 'PP1', 'ORD-1')));

// devolver
reset((u) => (u.endsWith('/refund') ? json({ id: 'R1', status: 'COMPLETED' }, 201) : undefined));
check('devolver: COMPLETED → true', await api.paypalDevolver(C, 'CAP1'));
check('devolver: Request-Id por captura', (llamadas.find((l) => l.url.endsWith('/refund'))!.init.headers as Record<string, string>)['PayPal-Request-Id'] === 'devolver-CAP1');
reset((u) => (u.endsWith('/refund') ? json({ details: [{ issue: 'CAPTURE_FULLY_REFUNDED' }] }, 422) : undefined));
check('devolver: ya devuelta → true', await api.paypalDevolver(C, 'CAP1'));
reset((u) => (u.endsWith('/refund') ? json({ details: [{ issue: 'REFUND_NOT_ALLOWED' }] }, 422) : undefined));
check('devolver: no permitida → false', !(await api.paypalDevolver(C, 'CAP1')));

// leer captura
reset((u) => (u.includes('/v2/payments/captures/') ? json({}, 404) : undefined));
check('leer captura: 404 → null', (await api.paypalLeerCaptura(C, 'NO')) === null);
reset((u) => (u.includes('/v2/payments/captures/') ? json({}, 500) : undefined));
check('leer captura: 500 → tira', await tira(() => api.paypalLeerCaptura(C, 'X')));

// webhook
reset((u) => (u.endsWith('/v1/notifications/webhooks') ? json({ id: 'WH1' }, 201) : undefined));
check('webhook: crea y devuelve el id', (await api.paypalCrearWebhook(C, 'https://app/api/webhooks/paypal/b')) === 'WH1');
const wb = JSON.parse(String(llamadas.find((l) => l.url.endsWith('/webhooks'))!.init.body));
check('webhook: los 3 eventos', JSON.stringify(wb.event_types.map((e: { name: string }) => e.name)) === JSON.stringify(api.EVENTOS_WEBHOOK));
let n = 0;
reset((u) => (u.endsWith('/v1/notifications/webhooks') ? (n++ === 0 ? json({ name: 'WEBHOOK_URL_ALREADY_EXISTS' }, 400) : json({ webhooks: [{ id: 'WH-VIEJO', url: 'https://app/api/webhooks/paypal/b' }] })) : undefined));
check('webhook: URL ya registrada → reusa el existente', (await api.paypalCrearWebhook(C, 'https://app/api/webhooks/paypal/b')) === 'WH-VIEJO');

// token
globalThis.fetch = (async () => json({ error: 'invalid_client' }, 401)) as typeof fetch;
check('token inválido → tira', await tira(() => api.paypalToken(C)));

console.log(`${ok}/${ok + mal} OK`);
process.exit(mal ? 1 : 0);
