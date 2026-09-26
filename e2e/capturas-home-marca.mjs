// Capturas de la HOME DE MARCA (<slug>.parygo.com) con demotest, contra un
// server LOCAL. Prepara el evento "fiesta-prueba" de demotest como si fuera
// real (publicado, fecha futura, flyer sintético 1080×1350 subido al storage),
// captura a 390 (WebKit) y 1440 (Chromium), mide, y DESHACE todo (evento
// despublicado, fecha y flyer como estaban, demotest archivada).
//
//   node e2e/capturas-home-marca.mjs        → tmp/home-marca/*.png
import { chromium, webkit } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { svc, BASE, OUT, log } from './lib.mjs';

const DIR = resolve(OUT, '..', 'home-marca');
mkdirSync(DIR, { recursive: true });

const { data: brand } = await svc.from('brands').select('id, archived_at').eq('slug', 'demotest').single();
const { data: ev } = await svc.from('events').select('id, starts_at, ends_at, is_published, cover_url, cover_w, cover_h').eq('brand_id', brand.id).eq('slug', 'fiesta-prueba').single();
const antes = { ...ev, brand_archived_at: brand.archived_at };

// Flyer sintético 4:5 (mismo criterio que fase1: ninguna marca de prueba tiene flyer propio).
const flyerPath = resolve(DIR, 'flyer-4x5.png');
{
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  await pg.setContent(`<body style="margin:0;width:1080px;height:1350px;background:linear-gradient(160deg,#3a1c71,#d76d77 60%,#ffaf7b);font-family:sans-serif;color:#fff;display:grid;place-items:center"><div style="text-align:center"><div style="font-size:120px;font-weight:900">E2E</div><div style="font-size:48px">flyer de prueba</div></div></body>`);
  await pg.screenshot({ path: flyerPath });
  await b.close();
}
const storagePath = `demotest/home-marca-${Date.now()}.png`;
const up = await svc.storage.from('brand-assets').upload(storagePath, readFileSync(flyerPath), { contentType: 'image/png', upsert: true });
if (up.error) throw new Error('upload ' + up.error.message);
const cover_url = svc.storage.from('brand-assets').getPublicUrl(storagePath).data.publicUrl;

const en = new Date(Date.now() + 9 * 86400000); en.setHours(22, 0, 0, 0);
await svc.from('brands').update({ archived_at: null }).eq('id', brand.id);
await svc.from('events').update({ is_published: true, starts_at: en.toISOString(), ends_at: new Date(en.getTime() + 5 * 3600000).toISOString(), cover_url, cover_w: 1080, cover_h: 1350 }).eq('id', ev.id);
log('demotest preparada');

try {
  for (const [nombre, motor, w, h] of [['390', webkit, 390, 844], ['1440', chromium, 1440, 900]]) {
    const b = await motor.launch();
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.goto(`${BASE}/?brand=demotest`, { waitUntil: 'load' });
    // El render del storage puede tardar: esperar la imagen, no 'networkidle'.
    await p.locator('.bh-ev__art img').first().evaluate((i) => i.complete ? true : new Promise((r) => { i.onload = r; i.onerror = r; })).catch(() => {});
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${DIR}/despues-${nombre}.png`, fullPage: true });
    const m = await p.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { w: Math.round(b.width), h: Math.round(b.height), fs: cs.fontSize, tt: cs.textTransform, ls: cs.letterSpacing }; };
      const img = document.querySelector('.bh-ev__art img');
      return { logo: r('.bh-marca__logo'), ofi: r('.bh-marca__ofi'), art: r('.bh-ev__art'), imgNat: img ? `${img.naturalWidth}×${img.naturalHeight}` : null, cuando: r('.bh-ev__cuando'), nm: r('.bh-ev__nm'), go: r('.bh-ev__go'), doc: document.documentElement.scrollHeight, scrollX: document.documentElement.scrollWidth > window.innerWidth };
    });
    log(nombre, JSON.stringify(m));
    await b.close();
  }
} finally {
  await svc.from('events').update({ is_published: antes.is_published, starts_at: antes.starts_at, ends_at: antes.ends_at, cover_url: antes.cover_url, cover_w: antes.cover_w, cover_h: antes.cover_h }).eq('id', ev.id);
  await svc.from('brands').update({ archived_at: antes.brand_archived_at ?? new Date().toISOString() }).eq('id', brand.id);
  await svc.storage.from('brand-assets').remove([storagePath]);
  log('demotest restaurada (evento despublicado, flyer borrado, marca archivada)');
}
