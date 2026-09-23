// Capturas del inicio con "próximo evento" y de las pestañas de un evento de
// demotest. Publica el borrador por venir SOLO durante las capturas y lo
// vuelve a dejar como estaba (demotest es la marca de pruebas y está archivada:
// no aparece en público).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { otpSession, sessionCookies, BASE, svc } from './lib.mjs';
import { ADMIN, DEMOTEST, eventoDemo } from './vistas-paneles.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'capturas', 'panel');
mkdirSync(OUT, { recursive: true });
const { data: brand } = await svc.from('brands').select('archived_at').eq('id', DEMOTEST).single();
if (!brand?.archived_at) throw new Error('demotest no está archivada: no publico nada');
const { data: futuros } = await svc.from('events').select('id,name,is_published,starts_at').eq('brand_id', DEMOTEST).is('archived_at', null).gt('starts_at', new Date().toISOString()).order('starts_at').limit(1);
const prox = futuros?.[0];
const rico = await eventoDemo();
const eraPub = prox?.is_published;
if (prox && !eraPub) await svc.from('events').update({ is_published: true }).eq('id', prox.id);
try {
  const sess = await otpSession(ADMIN);
  const browser = await chromium.launch();
  const VISTAS = [['inicio', '/admin'], ...(rico ? [['ev-resumen', `/admin/events/${rico.id}`], ['ev-yape', `/admin/events/${rico.id}/yape`], ['ev-clientes', `/admin/events/${rico.id}/clientes`], ['ev-editar', `/admin/events/${rico.id}/editar`], ['ev-accesos', `/admin/events/${rico.id}/accesos`]] : [])];
  for (const ancho of [390, 1440]) {
    const movil = ancho === 390;
    const ctx = await browser.newContext({ viewport: { width: ancho, height: movil ? 844 : 900 }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil });
    await ctx.addCookies(sessionCookies(sess, BASE));
    const page = await ctx.newPage();
    for (const [id, url] of VISTAS) {
      await page.goto(BASE + url, { waitUntil: 'load', timeout: 90000 }).catch(() => null);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: resolve(OUT, `${id}-${ancho}.png`), fullPage: true });
    }
    await ctx.close();
  }
  await browser.close();
} finally {
  if (prox && !eraPub) await svc.from('events').update({ is_published: false }).eq('id', prox.id);
  const { data: v } = await svc.from('events').select('is_published').eq('id', prox?.id ?? '').maybeSingle();
  console.log('próximo:', prox?.name, '→ is_published final:', v?.is_published, '(original:', eraPub, ') · rico:', rico?.name);
}
