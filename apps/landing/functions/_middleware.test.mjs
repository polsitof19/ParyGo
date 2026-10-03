// Pruebas del Function de la landing. Sin framework: importa el módulo real,
// le pasa Requests y mira qué responde.
//
//   node apps/landing/functions/_middleware.test.mjs
//   npm run test:redirects
//
// Por qué existe: un 301 roto no tira ningún error — simplemente deja de
// existir y se pierde en silencio (y con él, el SEO de la URL vieja). Esto lo
// nota antes de que lo note Google.
import { onRequest } from './_middleware.js';

// [url, resultado esperado ('next' = pasa a los assets), destino esperado]
const CASOS = [
  // Las legales viven en la app.
  ['https://parygo.com/terminos', 301, 'https://app.parygo.com/terminos'],
  ['https://parygo.com/privacidad', 301, 'https://app.parygo.com/privacidad'],
  // La landing usa trailingSlash: true, así que pueden venir con barra.
  ['https://parygo.com/terminos/', 301, 'https://app.parygo.com/terminos'],
  ['https://parygo.com/privacidad/', 301, 'https://app.parygo.com/privacidad'],
  ['https://parygo.com/terminos//', 301, 'https://app.parygo.com/terminos'],
  // La query se preserva (no se pierde la atribución).
  ['https://parygo.com/terminos?utm_source=ig', 301, 'https://app.parygo.com/terminos?utm_source=ig'],
  // El 301 del dominio de Pages sigue vivo…
  ['https://parygo.pages.dev/algo', 301, 'https://parygo.com/algo'],
  // …y para una legal resuelve en UN salto, no encadenando dos.
  ['https://parygo.pages.dev/terminos', 301, 'https://app.parygo.com/terminos'],
  // Google Search Console intacto.
  ['https://parygo.com/google3855ddac0c3e7051.html', 200, null],
  // Lo que NO tiene que redirigir.
  ['https://parygo.com/', 'next', null],
  ['https://parygo.com/terminos-y-condiciones', 'next', null],
  ['https://parygo.com/privacidadx', 'next', null],
  // Claves heredadas de Object.prototype: con un objeto literal en vez de un
  // Map, /constructor entraba como si fuera una ruta legal y reventaba.
  ['https://parygo.com/constructor', 'next', null],
  ['https://parygo.com/toString', 'next', null],
  ['https://parygo.com/__proto__', 'next', null],
  ['https://parygo.com/valueOf', 'next', null],
];

let fallan = 0;
for (const [url, esperado, destino] of CASOS) {
  const ctx = {
    request: new Request(url, { redirect: 'manual' }),
    next: async () => new Response('ASSET', { status: 200, headers: { 'x-next': '1' } }),
  };
  let got, loc = null;
  try {
    const r = await onRequest(ctx);
    got = r.headers.get('x-next') === '1' ? 'next' : r.status;
    loc = r.headers.get('location');
  } catch (e) {
    got = 'ERROR: ' + e.message;
  }
  const ok = got === esperado && (destino === null || loc === destino);
  if (!ok) fallan++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${url.padEnd(48)} → ${String(got).padEnd(5)} ${loc ?? ''}`);
}

console.log(fallan === 0 ? `\nOK — ${CASOS.length} casos.` : `\n${fallan} de ${CASOS.length} FALLAN.`);
process.exit(fallan ? 1 : 0);
