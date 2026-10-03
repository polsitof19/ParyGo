// Workaround LOCAL (solo Windows) para correr apps/web con `next build/start/dev`.
//
// Bug de Next 14.2.18 (flight-manifest-plugin) en Windows + monorepo: para el
// SSR edge, los internos de Next (app-router, layout-router, link…) se registran
// en edgeServerModuleIds con la ruta ESM (`..\..\node_modules\next\dist\esm\…`),
// pero el manifest los busca por la ruta CJS (`…\next\dist\…`). La traducción
// CJS→ESM de Next usa "/" y en Windows las rutas van con "\" → el mapeo edge
// queda vacío y TODA página con runtime='edge' responde 500
// "Cannot read properties of undefined (reading 'default')".
// En Linux (build de Cloudflare) no pasa: esto NO toca producción.
//
// Parchea node_modules (gitignored). Idempotente (parte siempre del .orig).
// `npm install` lo revierte.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';

if (process.platform !== 'win32') process.exit(0);
const require = createRequire(import.meta.url);
const file = require.resolve('next/dist/build/webpack/plugins/flight-manifest-plugin.js');
const orig = file + '.orig';
if (!existsSync(orig)) copyFileSync(file, orig);
let src = readFileSync(orig, 'utf8');

const edgeRef = 'pluginState.edgeServerModuleIds[ssrNamedModuleId]';
if (src.split(edgeRef).length - 1 !== 2 || !src.includes('function addSSRIdMapping() {')) {
  console.error('No reconozco flight-manifest-plugin.js (¿cambió la versión de next?)');
  process.exit(1);
}
src = src.split(edgeRef).join('pluginState.edgeServerModuleIds[edgeKey]');
src = src.replace(
  'function addSSRIdMapping() {',
  'function addSSRIdMapping() { /* parygo-e2e-win-patch */ const edgeKey = [' +
    'ssrNamedModuleId, ' +
    'ssrNamedModuleId.replace(/([\\\\/])next([\\\\/])dist([\\\\/])(?!esm)/, "$1next$2dist$3esm$3"), ' +
    'ssrNamedModuleId.replace(/\\\\/g, "/")' +
    '].find((k) => typeof pluginState.edgeServerModuleIds[k] !== "undefined") ?? ssrNamedModuleId;'
);
writeFileSync(file, src);
console.log('next parcheado:', file);

// 2) Sandbox edge de `next start` en Node: el File que llega en el FormData de
// una server action no es `instanceof File` del sandbox (otro realm) → la
// subida del comprobante Yape responde "Falta la captura del comprobante.".
// En Cloudflare (workerd) no pasa. Hacemos el instanceof tolerante (duck-typing).
// (Aplica a `next start` en Node en cualquier SO, no solo Windows.)
const prim = require.resolve('next/dist/compiled/@edge-runtime/primitives/load.js');
if (existsSync(prim + '.orig')) copyFileSync(prim + '.orig', prim); // deshace un intento previo
const ctxFile = require.resolve('next/dist/server/web/sandbox/context.js');
const ctxOrig = ctxFile + '.orig';
if (!existsSync(ctxOrig)) copyFileSync(ctxFile, ctxOrig);
let c = readFileSync(ctxOrig, 'utf8');
const hook = 'extend: (context)=>{';
if (!c.includes(hook)) {
  console.error('No reconozco sandbox/context.js');
  process.exit(1);
}
c = c.replace(
  hook,
  hook + ' /* parygo-e2e-win-patch */ try { Object.defineProperty(context.File, Symbol.hasInstance, { value: (o) => o != null && typeof o === "object" && Object.prototype.toString.call(o) === "[object File]" && typeof o.size === "number" && typeof o.arrayBuffer === "function" }); } catch {}'
);
writeFileSync(ctxFile, c);
console.log('sandbox edge parcheado:', ctxFile);
