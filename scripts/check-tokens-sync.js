#!/usr/bin/env node
'use strict';
/**
 * Falla si las dos copias de parygo-tokens.css divergen.
 *
 * Por qué existe: apps/landing y apps/web son dos apps Next separadas y
 * compartir un CSS entre ellas exige un workspace nuevo (packages/ui), que
 * toca la configuración de build de las dos. Mientras tanto el archivo vive
 * duplicado, y este test es lo único que impide que se separen en silencio.
 *
 * Cuando se migre a packages/ui, este script se borra junto con la copia.
 *
 * Correr con: npm run test:tokens   (también corre en CI)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const COPIES = [
  'apps/web/app/styles/parygo-tokens.css',
  'apps/landing/app/styles/parygo-tokens.css',
];

function main() {
  const seen = [];
  let missing = false;

  for (const rel of COPIES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.error(`FALTA: ${rel}`);
      missing = true;
      continue;
    }
    const buf = fs.readFileSync(abs);
    seen.push({ rel, sha: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length, text: buf.toString('utf8') });
  }
  if (missing) {
    console.error('\nNo se puede comparar: falta al menos una copia.');
    process.exit(1);
  }

  for (const c of seen) console.log(`  ${c.sha.slice(0, 12)}  ${String(c.bytes).padStart(6)} bytes  ${c.rel}`);

  const first = seen[0];
  const diverged = seen.filter((c) => c.sha !== first.sha);
  if (diverged.length === 0) {
    console.log(`\nOK — las ${seen.length} copias de parygo-tokens.css son idénticas.`);
    process.exit(0);
  }

  console.error('\nDIVERGEN. Las copias de parygo-tokens.css tienen que ser byte a byte iguales.');
  // Primera línea distinta, para que el arreglo sea obvio sin abrir un diff.
  const a = first.text.split('\n');
  for (const d of diverged) {
    const b = d.text.split('\n');
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (a[i] !== b[i]) {
        console.error(`\n  primera diferencia en la línea ${i + 1}:`);
        console.error(`    ${first.rel}\n      ${a[i] === undefined ? '(no existe)' : a[i]}`);
        console.error(`    ${d.rel}\n      ${b[i] === undefined ? '(no existe)' : b[i]}`);
        break;
      }
    }
  }
  console.error('\nCopiá una sobre la otra y volvé a correr.');
  process.exit(1);
}

main();
