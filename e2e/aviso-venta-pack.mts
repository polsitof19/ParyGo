// Arma el aviso de venta de pack a Paul (sendAvisoVentaPack) SIN mandarlo:
// intercepta el fetch a Resend y guarda el HTML en tmp/aviso-venta.html.
// Usa una compra PAGADA de demotest; como demotest es is_test (y el aviso se
// saltea para marcas de prueba), la marca se desmarca SEGUNDOS y se restaura.
//   cd apps/web && npx tsx ../../e2e/aviso-venta-pack.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

for (const l of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const line = l.trim();
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
process.env.RESEND_API_KEY = 'intercepted';

const enviados: { to: string[]; subject: string; html: string; text: string }[] = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    enviados.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: 'interceptado' }), { status: 200 });
  }
  return fetchReal(url, init);
}) as typeof fetch;

const { createAdminClient } = await import('@/lib/supabase/admin');
const { avisarVentaPack } = await import('@/lib/email/sendAvisoVentaPack');
const admin = createAdminClient();
const { data: b } = await admin.from('brands').select('id').eq('slug', 'demotest').single();
const { data: c } = await admin.from('pack_purchases').select('id').eq('brand_id', b!.id).eq('status', 'paid').limit(1).single();

const r: Record<string, unknown> = {};
// 1. Con la marca de prueba tal cual: NO avisa.
await avisarVentaPack(c!.id);
r.marcaDePruebaNoAvisa = enviados.length === 0;
// 2. Como si fuera real: avisa una vez, a SUPER_ADMIN_EMAIL.
await admin.from('brands').update({ is_test: false }).eq('id', b!.id);
try {
  await avisarVentaPack(c!.id);
} finally {
  await admin.from('brands').update({ is_test: true }).eq('id', b!.id);
}
const m = enviados[0];
r.enviado = enviados.length === 1;
r.paraPaul = m?.to?.[0] === process.env.SUPER_ADMIN_EMAIL;
r.asunto = m?.subject;
r.texto = m?.text;
if (m) writeFileSync(resolve(process.cwd(), '../../tmp/aviso-venta.html'), m.html);
const { data: sigue } = await admin.from('brands').select('is_test').eq('id', b!.id).single();
r.demotestRestaurada = sigue?.is_test === true;
console.log(JSON.stringify(r, null, 1));
