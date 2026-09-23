// Smoke del TEMA NOCHE en PRODUCCIÓN, SOLO LECTURA: dos GET por ancho, sin un
// clic, sin llenar nada, sin tocar el stepper (un clic en "Sumar" reserva cupo
// de una marca real). Pedido explícito de Paul (2026-09-23) para code.parygo.com
// y su evento publicado, a 390 y 1440.
//
//   node e2e/smoke-prod-noche.mjs            capturas en tmp/prod-noche/
//
// Mide: tema noche montado y fondo #0A0A0A; la letra es Geist, se cargó, y el
// peso es REAL (el h1 a 800 mide más que el mismo texto a 400: si la variable
// no aplicara el eje, medirían igual); el logo es la imagen de la marca, cargada;
// en el evento, la dirección que le toca (Canvas con un flyer 4:5).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'tmp', 'prod-noche');
mkdirSync(OUT, { recursive: true });

const PAGINAS = [
  { id: 'code-home', url: 'https://code.parygo.com/', h: 'h1, .bh-ev__nm' },
  { id: 'code-standly', url: 'https://code.parygo.com/standly-en-cocos', h: '.b-hero__name' },
];
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

let fallas = 0;
const check = (n, ok, d = '') => { if (!ok) fallas += 1; console.log(`${ok ? '✔' : '✘'} ${n}${d ? ' — ' + String(d).slice(0, 220) : ''}`); };

const browser = await chromium.launch();
for (const ancho of [390, 1440]) {
  const movil = ancho === 390;
  const ctx = await browser.newContext({
    viewport: { width: ancho, height: movil ? 844 : 900 }, deviceScaleFactor: movil ? 3 : 1,
    isMobile: movil, hasTouch: movil, ...(movil ? { userAgent: UA_IPHONE } : {}),
  });
  const page = await ctx.newPage();
  // Nada de escritura: cualquier POST (server action) desde esta página es un error del smoke.
  // /cdn-cgi/rum es el beacon de Cloudflare Web Analytics (lo inyecta Cloudflare,
  // es telemetría, no toca la app ni la base): no cuenta como escritura.
  page.on('request', (r) => { if (r.method() !== 'GET' && r.method() !== 'HEAD' && !r.url().includes('/cdn-cgi/rum')) { fallas += 1; console.log('✘ request no-GET', r.method(), r.url()); } });
  for (const pg of PAGINAS) {
    const r = await page.goto(`${pg.url}?nc=${Date.now()}`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(2500);
    const m = await page.evaluate(async (sel) => {
      await document.fonts.ready;
      const shell = document.querySelector('.client-shell');
      const h = [...document.querySelectorAll(sel)].find((x) => x.getClientRects().length && !x.closest('.sr-only')) ?? null;
      let pesoReal = null;
      if (h) {
        const cs = getComputedStyle(h);
        const s = document.createElement('span');
        s.textContent = h.textContent; s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:40px;font-family:${cs.fontFamily}`;
        document.body.appendChild(s);
        s.style.fontWeight = '400'; const a = s.getBoundingClientRect().width;
        s.style.fontWeight = cs.fontWeight; const c = s.getBoundingClientRect().width;
        s.remove();
        pesoReal = { peso: cs.fontWeight, w400: Math.round(a), wPeso: Math.round(c) };
      }
      // El logo VISIBLE: en la home la cabecera (con su logo de 26) está oculta
      // y el que se ve es el de 56.
      const logo = [...document.querySelectorAll('.c-lockup__logo, .bh-marca__logo')].find((x) => x.getClientRects().length) ?? null;
      return {
        tema: shell?.className ?? '',
        fondo: shell ? getComputedStyle(shell).backgroundColor : null,
        fuente: shell ? getComputedStyle(shell).fontFamily : '',
        cargadas: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))],
        pesoReal,
        logo: logo ? { src: logo.currentSrc || logo.src, w: logo.naturalWidth, h: Math.round(logo.getBoundingClientRect().height) } : null,
        dir: document.querySelector('.b-buy')?.className ?? null,
        banda: (() => { const b = document.querySelector('.b-hero__shot'); if (!b) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
      };
    }, pg.h);
    const tag = `${pg.id} ${ancho}`;
    check(`${tag} · responde 200`, r?.status() === 200, r?.status());
    check(`${tag} · tema noche y fondo #0A0A0A`, /\bpg-noche\b/.test(m.tema) && m.fondo === 'rgb(10, 10, 10)', `${m.tema} · ${m.fondo}`);
    check(`${tag} · Geist cargada; ni Bricolage ni Hanken`, m.cargadas.some((f) => /geist/i.test(f)) && !m.cargadas.some((f) => /bricolage|hanken/i.test(f)), m.cargadas.join(', '));
    check(`${tag} · peso real del título (${m.pesoReal?.peso})`, !!m.pesoReal && Number(m.pesoReal.peso) >= 700 && m.pesoReal.wPeso > m.pesoReal.w400, JSON.stringify(m.pesoReal));
    check(`${tag} · logo de la marca cargado (imagen)`, !!m.logo && m.logo.w > 0, JSON.stringify(m.logo));
    if (pg.id === 'code-standly') {
      check(`${tag} · dirección Canvas`, /\bb-canvas\b/.test(m.dir ?? ''), m.dir);
      check(`${tag} · banda del flyer (216 en teléfono, 360×450 en escritorio)`, movil ? m.banda?.h === 216 : (m.banda?.w === 360 && m.banda?.h === 450), JSON.stringify(m.banda));
    }
    await page.screenshot({ path: resolve(OUT, `${pg.id}-${ancho}.png`), fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log(fallas ? `✘ ${fallas} falla(s)` : '✔ smoke OK');
process.exit(fallas ? 1 : 0);
