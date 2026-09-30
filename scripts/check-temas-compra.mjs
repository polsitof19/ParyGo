// Tema del comprador (0076): mide la paleta de los 4 temas contra 16 colores
// de marca. Importa la MISMA fuente que la app (apps/web/lib/temaCompra.mjs,
// JS puro): no hay copia que se desfase.
//   - tinta ≥ 7:1 (≥ 5.5 en "marca"), --ink-2 ≥ 6:1 (≥ 4.5 en "marca") y
//     --ink-3 ≥ 4.5:1 sobre las 4 superficies;
//   - la marca (punto, anillo, barra) ≥ 3:1 contra el fondo;
//   - tema "marca": el botón (tinta sobre el fondo) y su hover ≥ 4.5:1;
//   - "negro" = exactamente el tema noche de hoy; blanco y negro, neutros.
// Corre con `npm run test:contrast`.
import { paletaCompra, contraste, TEMAS, MARCA_TINTA } from '../apps/web/lib/temaCompra.mjs';

const MARCAS = ['#FF6A3D', '#C8371F', '#E91E63', '#1E3A8A', '#0A0A0A', '#FFFFFF', '#FFE4E1', '#3F8CFF', '#16A34A', '#FACC15', '#7C3AED', '#0EA5E9', '#8B5E3C', '#6B7280', '#F97316', '#14B8A6'];
let fallas = 0;
const ok = (cond, txt) => { if (!cond) { fallas++; console.log('FALLA', txt); } };

for (const tema of TEMAS) {
  for (const marca of MARCAS) {
    const p = paletaCompra(tema, marca);
    const h = p.hex;
    for (const [nombre, sup] of [['bg', h.bg], ['surface', h.surface], ['surface-2', h.surface2], ['selected', h.selected]]) {
      const pisoTinta = tema === 'marca' ? MARCA_TINTA : 7, pisoInk2 = tema === 'marca' ? 4.5 : 6;
      ok(contraste(h.ink, sup) >= pisoTinta, `${tema} ${marca}: tinta ${h.ink} sobre ${nombre} ${sup} = ${contraste(h.ink, sup).toFixed(2)}`);
      ok(contraste(h.ink2, sup) >= pisoInk2, `${tema} ${marca}: ink-2 ${h.ink2} sobre ${nombre} ${sup} = ${contraste(h.ink2, sup).toFixed(2)}`);
      ok(contraste(h.ink3, sup) >= 4.5, `${tema} ${marca}: ink-3 ${h.ink3} sobre ${nombre} ${sup} = ${contraste(h.ink3, sup).toFixed(2)}`);
    }
    ok(contraste(h.mark, h.bg) >= 3, `${tema} ${marca}: marca ${h.mark} sobre ${h.bg} = ${contraste(h.mark, h.bg).toFixed(2)}`);
    if (tema === 'marca') {
      ok(!!p.boton && contraste(p.boton.fill, p.boton.onFill) >= 4.5, `marca ${marca}: botón ${p.boton?.fill}/${p.boton?.onFill}`);
      ok(!!p.boton && contraste(p.boton.hover, p.boton.onFill) >= 4.5, `marca ${marca}: hover ${p.boton?.hover}/${p.boton?.onFill}`);
    }
  }
}
// El negro de hoy, sin cambios (tokens de pg-noche).
const n = paletaCompra('negro', '#FF6A3D').hex;
ok(n.bg === '#0A0A0A' && n.surface === '#141414' && n.surface2 === '#1C1C1C' && n.selected === '#202020' && n.ink === '#FFFFFF' && n.ink2 === '#A3A3A3' && n.ink3 === '#8A8A8A', `negro ≠ pg-noche: ${JSON.stringify(n)}`);
// Blanco y negro: fondos neutros (r = g = b).
for (const tema of ['blanco', 'negro']) {
  const hx = paletaCompra(tema, '#FF6A3D').hex;
  for (const v of [hx.bg, hx.surface, hx.surface2, hx.selected]) ok(v.slice(1, 3) === v.slice(3, 5) && v.slice(3, 5) === v.slice(5, 7) || tema === 'blanco' && /^#F4F4F5|#EAEAEB|#E4E4E6$/.test(v), `${tema}: superficie no neutra ${v}`);
}

if (fallas) { console.log(`\n${fallas} FALLA(S) en los temas del comprador.`); process.exit(1); }
console.log(`OK — los 4 temas del comprador con ${MARCAS.length} colores de marca: tinta ≥7 (≥5.5 en "marca"), ink-2 ≥6 (≥4.5 en "marca") e ink-3 ≥4.5 en las 4 superficies, la marca ≥3 contra el fondo, el botón de "marca" ≥4.5 (con hover), y el negro igual al tema noche.`);
