// Ensambla el prototipo desde sus partes, con los datos reales incrustados.
//   node design_handoff_moderno/armar.mjs
//
// Salen DOS archivos del mismo fuente, para que no haya dos verdades:
//   prototipo-compra.html    autocontenido, se abre con doble clic (file://)
//   prototipo-artifact.html  sin <html>/<head>/<body>, para publicar como
//                            página privada (el host pone ese esqueleto él)
import { readFileSync, writeFileSync } from 'node:fs';

const D = 'design_handoff_moderno/';
const datos = readFileSync('tmp/audit/datos-limpios.json', 'utf8');
const partes = ['proto-1-head.html', 'proto-2-css.html', 'proto-3-body.html', 'proto-4-render.html', 'proto-5-wire.html']
  .map((f) => readFileSync(D + f, 'utf8').replace(/\r\n/g, '\n'));
partes[3] = partes[3].replace('__DATOS__', datos);
const html = partes.join('\n');
writeFileSync(D + 'prototipo-compra.html', html, 'utf8');
if (html.includes('__DATOS__')) { console.error('los datos NO se incrustaron'); process.exit(1); }
console.log('prototipo-compra.html  ' + (html.length / 1024).toFixed(1) + ' KB');

// --- Versión para publicar ---
// El host envuelve el archivo en su propio esqueleto y ya trae charset,
// viewport con viewport-fit=cover y un reset. Se le saca el nuestro.
let art = html;
const cortes = [
  [/^[\s\S]*?<title>[^<]*<\/title>\n/, ''],                 // doctype, html y head hasta el título viejo
  [/<link rel="preconnect"[^>]*>\n/g, ''],                  // preconnect: el host ya conecta
  [/<\/head>\n<body>\n/, ''],
  [/\n<\/body>\n<\/html>\n?$/, '\n'],
];
for (const [re, to] of cortes) art = art.replace(re, to);

// El <title> queda arriba del todo (solo se escanean los primeros 8KB).
art = '<title>Compra en tres direcciones</title>\n' + art;

// Safe-area: el picker va fijo arriba y en un teléfono quedaría debajo de la
// barra de estado. No es un cambio de diseño del picker, es adaptarlo al host.
art = art.replace(
  '.proto-picker[data-position="top"] { bottom: auto; top: 24px; }',
  '.proto-picker[data-position="top"] { bottom: auto; top: calc(24px + env(safe-area-inset-top, 0px)); }'
);
art = art.replace(
  '  position: fixed; top: 12px; left: 12px; z-index: 2147483646;',
  '  position: fixed; top: calc(12px + env(safe-area-inset-top, 0px)); left: 12px; z-index: 2147483646;'
);

for (const sobra of ['<!DOCTYPE html>', '<html lang="es">', '</head>', '<body>', '</body>', '</html>']) {
  if (art.includes(sobra)) { console.error('quedó "' + sobra + '" en la versión publicable'); process.exit(1); }
}
if (!art.startsWith('<title>')) { console.error('el título tiene que ir primero'); process.exit(1); }
writeFileSync(D + 'prototipo-artifact.html', art, 'utf8');
console.log('prototipo-artifact.html ' + (art.length / 1024).toFixed(1) + ' KB');
