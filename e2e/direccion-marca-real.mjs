// La página de compra de una marca REAL (no de prueba) lleva su dirección de
// diseño y el CSS de esa dirección aplicado. Solo LEE: un GET de la página
// pública, nada más. No toca órdenes ni eventos de nadie.
//
//   node e2e/direccion-marca-real.mjs              (server local en :3001)
//   E2E_PROD=1 node e2e/direccion-marca-real.mjs   (contra <marca>.parygo.com)
//
// Además corre como paso M de e2e/fase1.mjs.
//
// Por qué existe (2026-09-23): Paul vio Standly (Tío Code) "rota" —flyer en
// banda, título arriba, la fecha tres veces— recién subido el flyer. Era la
// dirección EDITORIAL servida por error: el detector lee el encabezado del
// flyer con un tope de tiempo y, en frío, se pasaba. Las demo son marcas de
// prueba con flyers viejos (calientes): el bug no se veía ahí. Por eso esto se
// mide sobre una marca que NO es de prueba.
//
// Qué verifica, en 1440 y en 390:
//   · la raíz de la compra lleva b-canvas o b-editorial, y es la que le toca al
//     flyer (Canvas salvo que no haya flyer o tenga forma de captura, < 1:2);
//   · las reglas de esa dirección están cargadas Y aplicadas (ancho de la
//     columna de compra, que solo lo pone direcciones.css);
//   · la fecha aparece dos veces, no tres: arriba (kicker) y en la ficha.
import { chromium } from 'playwright';
import { svc, BASE } from './lib.mjs';

const MAS_ANGOSTA_QUE = 0.5; // lib/flyer.ts: por debajo de 1:2 es una captura

/** Un evento publicado y vigente de una marca que NO es de prueba. */
export async function eventoDeMarcaReal() {
  const { data } = await svc
    .from('events')
    .select('slug, name, cover_url, starts_at, brand:brands!inner(slug, is_test, archived_at)')
    .eq('is_published', true).is('archived_at', null)
    .eq('brand.is_test', false).is('brand.archived_at', null)
    .gt('starts_at', new Date(Date.now() - 12 * 3600e3).toISOString())
    .order('starts_at', { ascending: true }).limit(20);
  const conFlyer = (data ?? []).find((e) => e.cover_url);
  return conFlyer ?? (data ?? [])[0] ?? null;
}

export async function verificarDireccion({ browser, prod = false, base = BASE } = {}) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) });
  const ev = await eventoDeMarcaReal();
  if (!ev) { check('hay un evento publicado de una marca real para medir', false, 'ninguno'); return checks; }
  const url = prod ? `https://${ev.brand.slug}.parygo.com/${ev.slug}` : `${base}/${ev.slug}`;

  for (const ancho of [1440, 390]) {
    const ctx = await browser.newContext({
      viewport: { width: ancho, height: ancho === 390 ? 844 : 900 },
      ...(prod ? {} : { extraHTTPHeaders: { 'x-parygo-brand-slug': ev.brand.slug } }),
    });
    const p = await ctx.newPage();
    const r = await p.goto(`${url}?nc=${Date.now()}`, { waitUntil: 'networkidle', timeout: 90000 });
    const m = await p.evaluate(() => {
      const buy = document.querySelector('.b-buy');
      const img = document.querySelector('.b-hero__shot img');
      const reglas = (clase) => [...document.styleSheets].reduce((n, s) => {
        try { return n + [...s.cssRules].filter((x) => x.cssText.includes(clase)).length; } catch { return n; }
      }, 0);
      const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const kicker = document.querySelector('.b-kicker');
      const fichaFecha = document.querySelector('.b-aside p');
      return {
        clases: buy?.className ?? '',
        maxW: buy ? getComputedStyle(buy).maxWidth : null,
        nat: img ? [img.naturalWidth, img.naturalHeight] : null,
        reglasCanvas: reglas('b-canvas'), reglasEditorial: reglas('b-editorial'),
        cuando: document.querySelectorAll('.b2-cuando').length,
        kicker: visible(kicker) ? kicker.innerText : null,
        ficha: visible(fichaFecha) ? fichaFecha.innerText : null,
      };
    });
    await ctx.close();
    const tag = `${ancho}`;
    check(`${tag} · la página de ${ev.brand.slug}/${ev.slug} responde 200`, r?.status() === 200, r?.status());
    const dir = /\bb-canvas\b/.test(m.clases) ? 'canvas' : /\bb-editorial\b/.test(m.clases) ? 'editorial' : null;
    check(`${tag} · la compra lleva b-canvas o b-editorial`, !!dir, m.clases);
    const esperada = !ev.cover_url || !m.nat || !m.nat[1] ? 'editorial'
      : m.nat[0] / m.nat[1] < MAS_ANGOSTA_QUE ? 'editorial' : 'canvas';
    check(`${tag} · la dirección es la que le toca al flyer (${m.nat ? m.nat.join('×') : 'sin flyer'} → ${esperada})`, dir === esperada, dir);
    check(`${tag} · el CSS de las direcciones está cargado`, m.reglasCanvas > 0 && m.reglasEditorial > 0, `canvas=${m.reglasCanvas} editorial=${m.reglasEditorial}`);
    // Solo direcciones.css le pone ancho a la columna: si no cargó, queda 'none'.
    const anchoOk = ancho === 1440
      ? m.maxW === (dir === 'canvas' ? '720px' : '760px')
      : m.maxW === '560px';
    check(`${tag} · el CSS de ${dir} está APLICADO (ancho de la compra)`, anchoOk, m.maxW);
    check(`${tag} · sin subtítulo de fecha repetido (b2-cuando)`, m.cuando === 0, m.cuando);
    check(`${tag} · la fecha está arriba (kicker)`, !!m.kicker, m.kicker);
    if (ancho === 1440) check(`${tag} · y una vez en la ficha de datos`, !!m.ficha, m.ficha);
  }
  return checks;
}

// Ejecutado directo (no importado desde fase1).
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('direccion-marca-real.mjs')) {
  const browser = await chromium.launch();
  const checks = await verificarDireccion({ browser, prod: process.env.E2E_PROD === '1' });
  await browser.close();
  for (const c of checks) console.log(`${c.ok ? '✔' : '✘'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  const fallas = checks.filter((c) => !c.ok).length;
  console.log(fallas ? `✘ ${fallas} de ${checks.length}` : `✔ ${checks.length}/${checks.length}`);
  process.exit(fallas ? 1 : 0);
}
