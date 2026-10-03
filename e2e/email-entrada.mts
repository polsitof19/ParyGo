// Arma el EMAIL DE LA ENTRADA de un pedido real (demotest) sin mandarlo, y lo
// devuelve como JSON para que el E2E lo revise. Mismo query y mismo render que
// sendTicketEmail (armarEmailDePedido). No escribe en la base.
//
// Correr desde apps/web (para que tsx resuelva los alias @/ de su tsconfig):
//   cd apps/web && npx tsx ../../e2e/email-entrada.mts <orderId> [salida.html]
//
// Si se pasa salida.html, además escribe el HTML con los cid: reemplazados por
// los PNG en data: URI, para capturarlo en un navegador.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), '.env.local');
for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const line = l.replace(/\r$/, '');
  if (!line.includes('=') || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const [orderId, salida] = process.argv.slice(2);
if (!orderId) throw new Error('falta orderId');

const { armarEmailDePedido } = await import('@/lib/email/sendTicketEmail');
const { textoVisible } = await import('@/lib/email/ticketEmail');

const { order, correo } = await armarEmailDePedido(orderId);
if (!order || !correo) {
  console.log(JSON.stringify({ ok: false, reason: order ? 'sin_entradas' : 'sin_pedido' }));
  process.exit(0);
}
const brandSlug = (order.brand as { slug?: string } | null)?.slug;
if (brandSlug !== 'demotest') throw new Error(`solo demotest (vino ${brandSlug})`);

if (salida) {
  let html = correo.html;
  for (const a of correo.attachments) {
    if (a.content_id) html = html.split(`cid:${a.content_id}`).join(`data:image/png;base64,${a.content}`);
  }
  writeFileSync(salida, html);
}

console.log(JSON.stringify({
  ok: true,
  subject: correo.subject,
  visible: textoVisible(correo.html),
  text: correo.text,
  cids: [...correo.html.matchAll(/src="cid:([^"]+)"/g)].map((m) => m[1]),
  hrefs: [...correo.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]),
  attachments: correo.attachments.map((a) => ({ filename: a.filename, content_id: a.content_id ?? null, bytes: Math.round((a.content.length * 3) / 4) })),
  // Los datos que NO pueden aparecer escritos.
  tickets: order.tickets.map((t) => ({ ticket_number: t.ticket_number, qr_code: t.qr_code })),
}));
