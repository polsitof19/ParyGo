// Backfill de la 0065: mide los flyers que ya estaban subidos y guarda
// events.cover_w / cover_h. Desde el deploy de la 0065 el panel las guarda al
// subir; esto cubre las filas anteriores.
//
//   node supabase/backfill-0065-medidas.mjs          (solo muestra)
//   node supabase/backfill-0065-medidas.mjs --write  (escribe)
//
// Usa el MISMO lector que la app (apps/web/lib/imageSize.ts, con
// --experimental-strip-types). Idempotente: solo toca filas sin medir, y el
// UPDATE exige que la URL siga siendo la medida (si el promotor cambió el flyer
// en el medio, no se le pegan las medidas del anterior).
import { query } from './mgmt.mjs';
import { medidasDeBytes } from '../apps/web/lib/imageSize.ts';

const escribir = process.argv.includes('--write');
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const filas = await query(
  'select id, cover_url from public.events where cover_url is not null and cover_w is null order by created_at',
);
console.log(`${filas.length} flyer(s) sin medir`);
for (const f of filas) {
  const r = await fetch(f.cover_url);
  if (!r.ok) { console.log(`✘ ${f.id} HTTP ${r.status}`); continue; }
  const m = medidasDeBytes(new Uint8Array(await r.arrayBuffer()));
  if (!m) { console.log(`✘ ${f.id} no se pudo leer el encabezado`); continue; }
  console.log(`${escribir ? '→' : '·'} ${f.id} ${m.width}×${m.height} (${(m.width / m.height).toFixed(3)})`);
  if (!escribir) continue;
  await query(
    `update public.events set cover_w = ${m.width | 0}, cover_h = ${m.height | 0}
      where id = ${lit(f.id)} and cover_url = ${lit(f.cover_url)} and cover_w is null`,
  );
}
