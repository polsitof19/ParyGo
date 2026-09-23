// Paso M del E2E: la página de compra y la home de marca en el TEMA NOCHE,
// medidas sobre DEMOTEST. Solo LEE: GETs de páginas públicas, nada más.
//
//   node e2e/direccion-marca-real.mjs              (server local en :3001)
//   E2E_PROD=1 node e2e/direccion-marca-real.mjs   (contra demotest.parygo.com;
//                                                   E2E_EDITORIAL=1 mide Editorial)
//
// Además corre como paso M de e2e/fase1.mjs.
//
// ─────────────────────────────────────────────────────────────────────────
// QUÉ MEDÍA ANTES (hasta el 2026-09-23, rama design/noche)
// ─────────────────────────────────────────────────────────────────────────
// Leía la página pública de una marca REAL (no de prueba) —en la práctica
// Standly, de Tío Code— a 1440, 390 y 430, y verificaba:
//   · la raíz lleva b-canvas o b-editorial y es la que le toca al flyer;
//   · las reglas de direcciones.css cargadas Y aplicadas (max-width de la
//     compra: 1120 en escritorio, 560 en teléfono);
//   · la fecha no se repite (sin .b2-cuando) y SIN eyebrow sobre el título;
//   · --pg-bg definida (a508bde la había borrado y la barra salía transparente);
//   · escritorio: "Tu compra" a la derecha del título, el flyer a la izquierda,
//     nada de la compra arriba del título;
//   · teléfono: hero ≤300, ningún texto sobre el flyer, primera entrada antes
//     de y=320, la barra no tapa texto, sin rail, cuándo·dónde bajo el título,
//     barra con fondo alfa ≥.9, orden hero → entradas → confianza → pasos → dónde;
//   · la home en .bh sin rastros de la vieja .bl.
//
// POR QUÉ CAMBIÓ: la regla nueva es "solo demotest para pruebas; nada contra
// Code/Almighty ni Standly", y el paso leía justo Standly. Además el diseño
// cambió: el eyebrow con fecha y lugar AHORA va sobre el título (maqueta
// aprobada), la barra es translúcida a propósito (.72 + blur, sólida con
// prefers-reduced-transparency) y ya no existe direcciones.css (compra.css).
// Ninguna marca de prueba tiene flyer (y los de Code/Hoesky no se tocan): el
// E2E le sube al evento de demotest un flyer SINTÉTICO por el panel. Canvas
// se mide con el 4:5; Editorial, con uno con forma de captura (1080×2400).
// ─────────────────────────────────────────────────────────────────────────
import { chromium, webkit } from 'playwright';
import { svc, BASE } from './lib.mjs';

const MARCA = 'demotest';
const PROHIBIDAS = new Set(['code']);

/** El evento publicado y vigente más reciente de demotest. */
export async function eventoDemo() {
  const { data: b } = await svc.from('brands').select('id, slug').eq('slug', MARCA).single();
  if (!b || PROHIBIDAS.has(b.slug)) return null;
  const { data } = await svc
    .from('events')
    .select('slug, name, cover_url, starts_at, is_free')
    .eq('brand_id', b.id).eq('is_published', true).is('archived_at', null)
    .gt('starts_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

const MEDIR = () => {
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const caja = (sel) => {
    const el = document.querySelector(sel);
    if (!visible(el)) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const shell = document.querySelector('.client-shell');
  const cs = shell ? getComputedStyle(shell) : null;
  const shot = document.querySelector('.b-hero__shot');
  const hr = shot ? shot.getBoundingClientRect() : null;
  const textoEnFlyer = [];
  if (hr) {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const n = tw.currentNode; const el = n.parentElement;
      if (!n.textContent.trim() || !el || !visible(el) || el.closest('.b-lightbox, .sr-only')) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const r = rg.getBoundingClientRect();
      if (r.width && r.height && r.left < hr.right && r.right > hr.left && r.top < hr.bottom && r.bottom > hr.top) textoEnFlyer.push(n.textContent.trim().slice(0, 30));
    }
  }
  const cta = document.querySelector('.b-cta');
  const ctaCs = cta ? getComputedStyle(cta) : null;
  const h1 = document.querySelector('.b-hero__name');
  return {
    clases: document.querySelector('.b-buy')?.className ?? '',
    tema: shell?.className ?? '',
    fondo: cs?.backgroundColor ?? null,
    fuente: cs?.fontFamily ?? '',
    h1: h1 ? { size: getComputedStyle(h1).fontSize, weight: getComputedStyle(h1).fontWeight, lh: getComputedStyle(h1).lineHeight } : null,
    // textContent, no innerText: innerText ya trae el text-transform aplicado
    // y la comparación con toUpperCase() no podría fallar nunca.
    kicker: visible(document.querySelector('.b-kicker')) ? document.querySelector('.b-kicker').textContent : null,
    linea: visible(document.querySelector('.b-hero__linea')) ? document.querySelector('.b-hero__linea').innerText : null,
    banda: caja('.b-hero__shot'),
    titulo: caja('.b-hero__name'),
    over: caja('.b-hero__over'),
    hero: caja('.b-hero'),
    rail: caja('.b-sum'),
    fila: caja('.b1-ty'),
    textoEnFlyer,
    cta: cta && visible(cta) ? {
      alto: Math.round(cta.getBoundingClientRect().height),
      fondo: ctaCs.backgroundColor,
      blur: ctaCs.backdropFilter || ctaCs.webkitBackdropFilter || '',
    } : null,
    // Familias que el navegador CARGÓ de verdad (los archivos de next/font
    // llevan hash en el nombre: mirar URLs no dice qué fuente es).
    fuentesCargadas: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    stepper: document.querySelector('.b-qbtn--add') ? Math.round(document.querySelector('.b-qbtn--add').getBoundingClientRect().width) : null,
  };
};

// En local la marca la elige el header (el middleware lo acepta en
// localhost); en producción la elige el subdominio y el header no va.
const PROD = process.env.E2E_PROD === '1';
const BASE_PROD = `https://${MARCA}.parygo.com`;
function preparar() {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) });
  return { checks, check, hdr: PROD ? {} : { 'x-parygo-brand-slug': MARCA } };
}

/** Canvas: el evento de demotest con su flyer 4:5, a 1440 y 390. */
export async function verificarCanvas({ browser, base = PROD ? BASE_PROD : BASE } = {}) {
  const { checks, check, hdr } = preparar();
  const ev = await eventoDemo();
  if (!ev) { check('hay un evento publicado de demotest para medir', false, 'ninguno'); return checks; }
  const url = `${base}/${ev.slug}`;

  for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
    const movil = ancho < 1024;
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, extraHTTPHeaders: hdr });
    const p = await ctx.newPage();
    const r = await p.goto(`${url}?nc=${Date.now()}`, { waitUntil: 'networkidle', timeout: 90000 });
    await p.waitForTimeout(700); // la entrada escalonada termina a los 680ms
    const m = await p.evaluate(MEDIR);
    await ctx.close();
    const tag = `canvas ${ancho}`;
    check(`${tag} · responde 200`, r?.status() === 200, r?.status());
    check(`${tag} · dirección canvas (flyer 4:5)`, /\bb-canvas\b/.test(m.clases), m.clases);
    check(`${tag} · tema noche montado (pg-noche) y fondo #0A0A0A`, /\bpg-noche\b/.test(m.tema) && m.fondo === 'rgb(10, 10, 10)', `${m.tema} · ${m.fondo}`);
    check(`${tag} · la letra es Geist`, /geist/i.test(m.fuente), m.fuente.slice(0, 80));
    check(`${tag} · carga Geist y NO carga Bricolage ni Hanken`, m.fuentesCargadas.some((f) => /geist/i.test(f)) && !m.fuentesCargadas.some((f) => /bricolage|hanken/i.test(f)), [...new Set(m.fuentesCargadas)].join(', ').slice(0, 200));
    check(`${tag} · eyebrow con fecha y lugar sobre el título`, !!m.kicker && /\d{1,2}:\d{2}/.test(m.kicker) && m.kicker === m.kicker.toUpperCase(), m.kicker);
    check(`${tag} · línea bajo el título (precio o entrada libre)`, !!m.linea, m.linea);
    check(`${tag} · ningún texto dentro del área del flyer`, m.textoEnFlyer.length === 0, JSON.stringify(m.textoEnFlyer));
    if (movil) {
      check(`${tag} · h1 40/800 (escala fija)`, m.h1?.size === '40px' && m.h1?.weight === '800', JSON.stringify(m.h1));
      check(`${tag} · banda de 216 a lo ancho (350 en 390)`, m.banda && m.banda.height === 216 && m.banda.width === 350, JSON.stringify(m.banda));
      check(`${tag} · el título va DEBAJO de la banda`, m.banda && m.titulo && m.titulo.top >= m.banda.bottom, JSON.stringify({ banda: m.banda, titulo: m.titulo }));
      check(`${tag} · sin rail en el teléfono`, !m.rail, JSON.stringify(m.rail));
      check(`${tag} · barra de pagar de 86, translúcida con blur`, m.cta && m.cta.alto >= 86 && /blur/.test(m.cta.blur) && /rgba\(10, 10, 10, 0\.72\)/.test(m.cta.fondo), JSON.stringify(m.cta));
      check(`${tag} · stepper de 42`, m.stepper === 42, m.stepper);
    } else {
      check(`${tag} · h1 76/800`, m.h1?.size === '76px' && m.h1?.weight === '800', JSON.stringify(m.h1));
      check(`${tag} · flyer 360×450 a la IZQUIERDA del título`, m.banda && m.banda.width === 360 && m.banda.height === 450 && m.titulo && m.banda.right <= m.titulo.left, JSON.stringify({ banda: m.banda, titulo: m.titulo }));
      check(`${tag} · "Tu compra" en tarjeta de 320 a la DERECHA`, m.rail && m.rail.width === 320 && m.titulo && m.rail.left >= m.titulo.right, JSON.stringify({ rail: m.rail, titulo: m.titulo }));
      check(`${tag} · sin barra de pagar (manda la tarjeta)`, !m.cta, JSON.stringify(m.cta));
    }
  }

  return checks;
}

/** Editorial: el flyer tiene forma de captura (o no hay): título arriba, banda de 160. */
export async function verificarEditorial({ browser, base = PROD ? BASE_PROD : BASE } = {}) {
  const { checks, check, hdr } = preparar();
  const ev = await eventoDemo();
  if (!ev) { check('hay un evento publicado de demotest para medir', false, 'ninguno'); return checks; }
  const url = `${base}/${ev.slug}`;
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: hdr });
    const p = await ctx.newPage();
    await p.goto(`${url}?nc=${Date.now()}`, { waitUntil: 'networkidle', timeout: 90000 });
    await p.waitForTimeout(700);
    const m = await p.evaluate(MEDIR);
    await ctx.close();
    check('editorial 390 · flyer con forma de captura → editorial', /\bb-editorial\b/.test(m.clases), m.clases);
    check('editorial 390 · el título ARRIBA de la banda', !m.banda || (m.titulo && m.titulo.bottom <= m.banda.top), JSON.stringify({ t: m.titulo, b: m.banda }));
    check('editorial 390 · banda baja a 160', !m.banda || m.banda.height === 160, JSON.stringify(m.banda));
    check('editorial 390 · la primera entrada debajo del título', m.titulo && m.fila && m.fila.top > m.titulo.bottom, JSON.stringify({ t: m.titulo, f: m.fila }));
  }
  return checks;
}

/** La HOME de la marca: tema noche, logo o nombre, la tarjeta del evento. */
export async function verificarHome({ browser, base = PROD ? BASE_PROD : BASE } = {}) {
  const { checks, check, hdr } = preparar();
  const ev = await eventoDemo();
  if (!ev) { check('hay un evento publicado de demotest para medir', false, 'ninguno'); return checks; }
  for (const ancho of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho === 390 ? 844 : 900 }, extraHTTPHeaders: hdr });
    const p = await ctx.newPage();
    const r = await p.goto(`${base}/?nc=${Date.now()}`, { waitUntil: 'networkidle', timeout: 90000 });
    const h = await p.evaluate((slug) => ({
      bh: !!document.querySelector('main.bh'),
      noche: !!document.querySelector('.client-shell.pg-noche'),
      h1: document.querySelector('h1')?.textContent ?? null,
      logo: document.querySelector('.bh-marca__logo')?.getBoundingClientRect().height ?? null,
      ofi: document.querySelector('.bh-marca__ofi')?.textContent ?? null,
      linkEvento: !!document.querySelector(`.bh-ev a[href="/${slug}"]`),
      accion: document.querySelector('.bh-ev__go')?.innerText.trim() ?? null,
    }), ev.slug);
    await ctx.close();
    const tag = `home ${ancho}`;
    check(`${tag} · responde 200`, r?.status() === 200, r?.status());
    check(`${tag} · home .bh en tema noche`, h.bh && h.noche, JSON.stringify(h));
    check(`${tag} · logo a 56 (o el nombre si no hay logo)`, h.logo === null ? !!h.h1 : Math.round(h.logo) === 56, JSON.stringify({ logo: h.logo, h1: h.h1 }));
    check(`${tag} · "Venta oficial · Lima"`, /venta oficial · lima/i.test(h.ofi ?? ''), h.ofi);
    check(`${tag} · el evento publicado lleva a su compra`, h.linkEvento, JSON.stringify(h));
    check(`${tag} · la acción dice reclamar o comprar`, /^(Reclama tu entrada gratis|Comprar entradas)/.test(h.accion ?? ''), h.accion);
  }
  return checks;
}

export async function verificarDireccion(o = {}) {
  return [...await verificarCanvas(o), ...await verificarHome(o)];
}

// Ejecutado directo (no importado desde fase1).
if (process.argv[1]?.endsWith('direccion-marca-real.mjs')) {
  const motor = process.env.E2E_ENGINE === 'webkit' ? webkit : chromium;
  const browser = await motor.launch();
  const checks = process.env.E2E_EDITORIAL === '1'
    ? await verificarEditorial({ browser })
    : await verificarDireccion({ browser });
  await browser.close();
  for (const c of checks) console.log(`${c.ok ? '✔' : '✘'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  const fallas = checks.filter((c) => !c.ok).length;
  console.log(fallas ? `✘ ${fallas} de ${checks.length}` : `✔ ${checks.length}/${checks.length}`);
  process.exit(fallas ? 1 : 0);
}
