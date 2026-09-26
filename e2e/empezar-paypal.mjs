// Alta en inglés con PayPal (2026-09-25), contra un server LOCAL con
// PAYPAL_* y NEXT_PUBLIC_APP_URL=https://app.parygo.com. Crea la orden en
// PayPal y comprueba que el comprador llega a paypal.com con el monto en
// dólares; NO aprueba ni captura (con credenciales live sería plata real).
// Una orden sin aprobar no cobra nada y PayPal la vence sola.
// Volumen: 1 marca (queda archivada, is_test, compra en 'failed').
//
//   node e2e/empezar-paypal.mjs
import { chromium } from 'playwright';
import { svc, BASE, log } from './lib.mjs';

const STAMP = Date.now().toString().slice(-7);
const R = [];
const check = (nombre, ok, detalle = '') => { R.push(ok); log(`${ok ? '✔' : '✘'} ${nombre}${detalle ? ' — ' + detalle : ''}`); };
const slug = `e2e-paypal${STAMP}`;
let brandId = null;

const b = await chromium.launch();
try {
  const p = await b.newPage();
  await p.goto(`${BASE}/empezar?lang=en`, { waitUntil: 'networkidle' });
  const html = await p.locator('main').innerText();
  check('en inglés sale en dólares', /US\$59/.test(html) && !/S\/150/.test(html));
  await p.locator('.ez-plan:has(input[value="1"])').click();
  await p.fill('#ez-nombre', 'E2E PayPal');
  await p.fill('#ez-slug', slug);
  await p.fill('#ez-email', `delivered+paypal${STAMP}@resend.dev`);
  await p.fill('#ez-pass', 'E2eAlta!2026');
  const boton = p.getByRole('button', { name: /^Pay US\$59$/ });
  check('el botón dice "Pay US$59"', await boton.count() === 1);
  await boton.click();
  await p.waitForURL(/paypal\.com/, { timeout: 40000, waitUntil: 'commit' });
  const url = new URL(p.url());
  check('va a paypal.com (live, no sandbox)', url.hostname.endsWith('paypal.com') && !url.hostname.includes('sandbox'), url.hostname);

  const { data: marca } = await svc.from('brands').select('id, archived_at, idioma').eq('slug', slug).single();
  brandId = marca?.id;
  check('marca creada archivada y sin dueño', !!marca?.archived_at);
  check('el alta en inglés deja el panel en inglés (idioma=en)', marca?.idioma === 'en', marca?.idioma);
  const { data: compra } = await svc.from('pack_purchases').select('id, provider, provider_ref, amount_cents, currency, status, created_by').eq('brand_id', brandId).single();
  check('compra PayPal US$59 pendiente', compra?.provider === 'paypal' && compra.amount_cents === 5900 && compra.currency === 'USD' && compra.status === 'pending' && compra.created_by === null, JSON.stringify({ ...compra, provider_ref: compra?.provider_ref ? '…' : null }));
  check('la orden de PayPal es la de la URL', !!compra?.provider_ref && p.url().includes(compra.provider_ref));

  // Vuelta SIN aprobar: PayPal niega la captura (ORDER_NOT_APPROVED) → la
  // compra pasa a fallida y "listo" ofrece reintentar. Ejercita la captura
  // live sin mover plata.
  const r = await fetch(`${BASE}/api/paypal/volver?compra=${compra.id}&token=${compra.provider_ref}&lang=en`, { redirect: 'manual' });
  const { data: tras } = await svc.from('pack_purchases').select('status').eq('id', compra.id).single();
  check('vuelta sin aprobar → compra fallida, sin cobro', tras?.status === 'failed' && /empezar\/listo/.test(r.headers.get('location') ?? ''), `${r.status} ${tras?.status}`);
} catch (e) {
  check('excepción', false, e.message);
} finally {
  await b.close();
  if (brandId) {
    await svc.from('pack_purchases').update({ status: 'failed' }).eq('brand_id', brandId).eq('status', 'pending');
    await svc.from('brands').update({ is_test: true, archived_at: new Date().toISOString() }).eq('id', brandId);
    log('limpieza: marca archivada, is_test, compra failed');
  }
}
const ok = R.filter(Boolean).length;
log(`${ok === R.length ? '✅' : '❌'} ${ok}/${R.length}`);
process.exit(ok === R.length ? 0 : 1);
