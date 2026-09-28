// Correos del comprador en BLANCO NEUTRO (2026-09-28): arma recordatorio,
// cancelado, cambio de fecha, Yape (recuperación + aviso al organizador) y el
// shell de promo/Yape rechazado SIN mandarlos (intercepta Resend), falla si
// queda un color crema/marrón, y guarda el HTML en tmp/correos/ para mirarlo.
//   cd apps/web && npx tsx ../../e2e/correos-neutros.mts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

for (const l of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const line = l.trim();
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
process.env.RESEND_API_KEY = 'intercepted';
// Todo el fetch queda interceptado: no sale ningún correo ni ningún pedido.
const enviados: { subject: string; html: string }[] = [];
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  enviados.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ id: 'interceptado' }), { status: 200 });
}) as typeof fetch;

const { sendEventReminderEmail } = await import('@/lib/email/sendEventReminderEmail');
const { sendEventCancelledEmail } = await import('@/lib/email/sendEventCancelledEmail');
const { sendEventPostponedEmail } = await import('@/lib/email/sendEventPostponedEmail');
const { sendYapeRecoveryEmail, sendYapePendingDigestEmail } = await import('@/lib/email/sendYapeNotificationEmails');
const { renderWarmEmail } = await import('@/lib/email/render');

const brand = { name: 'Tío Prueba', slug: 'demotest', whatsapp_e164: '+51999999999', contact_email: null, theme_json: { primary_color: '#C8371F' } };
const base = { to: 'x@parygo.test', buyerName: 'Ana', eventName: 'Noche de prueba', brand };
const iso = '2026-10-10T03:00:00Z';
await sendEventReminderEmail({ ...base, eventSlug: 'noche', startsAtIso: iso, venue: 'Cocos' });
await sendEventCancelledEmail({ ...base, startsAtIso: iso, reason: 'Lluvia' });
await sendEventPostponedEmail({ ...base, oldDateLabel: 'sáb 10 oct', newDateLabel: 'sáb 17 oct', venue: 'Cocos' });
await sendYapeRecoveryEmail({ ...base, eventSlug: 'noche', orderId: '00000000-0000-0000-0000-000000000000' });
await sendYapePendingDigestEmail({ to: 'x@parygo.test', eventName: 'Noche de prueba', eventId: 'e', brand, pendingCount: 3 });
enviados.push({ subject: 'shell promo/rechazado', html: renderWarmEmail({ brandName: 'Tío Prueba', primaryColor: '#C8371F', eyebrow: 'Tu código', title: 'Noche de prueba', highlight: { label: 'Código', value: 'ABC123' }, button: { label: 'Comprar', url: 'https://x' } }).html });

const CREMA = /#(FBF7F0|EFE6D6|231C17|6B5F54|A89B8C)/i;
// Voseo escrito con entidades (Us&aacute;, encontr&aacute;s): el barrido de
// texto plano no lo ve. Se decodifica antes de buscar. Todo va en tú.
const VOSEO = /(?<![a-záéíóúñ])(us|encontr|reenvi|escrib|mir|revis|ten|pod|quer|pag|sub|complet|entr)(á|é|í)s?(te|lo|telo)?(?![a-záéíóúñ])/i;
const decode = (h: string) => h.replace(/&([aeiou])acute;/g, (_, v) => ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' })[v as 'a']);
const dir = resolve(process.cwd(), '../../tmp/correos');
mkdirSync(dir, { recursive: true });
let ok = enviados.length === 6;
console.log(`${ok ? '✔' : '✘'} se armaron ${enviados.length}/6 correos`);
enviados.forEach((e, i) => {
  const vos = decode(e.html.replace(/<[^>]+>/g, ' ')).match(VOSEO);
  const limpio = !CREMA.test(e.html) && /background:#FFFFFF/i.test(e.html) && !vos;
  if (vos) console.log(`  voseo: "${vos[0]}"`);
  ok &&= limpio;
  writeFileSync(resolve(dir, `${i + 1}.html`), e.html);
  console.log(`${limpio ? '✔' : '✘'} ${e.subject} — fondo blanco, sin crema, en tú`);
});
console.log(ok ? '✅ OK' : '❌ FALLA');
process.exit(ok ? 0 : 1);
