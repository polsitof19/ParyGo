// lib/zona.ts (sin red).   cd apps/web && npx tsx ../../e2e/zona.test.mts
const { localAUtc, utcALocal, hoyEn, formatEnZona } = await import('@/lib/zona');
const { formatLima } = await import('@/lib/utils');

let ok = 0, mal = 0;
const check = (n: string, c: boolean, d = '') => { c ? ok++ : mal++; console.log(`${c ? '✔' : '✘'} ${n}${d ? ' · ' + d : ''}`); };
const iso = (d: Date | null) => d?.toISOString() ?? 'null';

check('Lima = -05:00 (igual que hoy)', iso(localAUtc('2026-12-05T21:00', 'America/Lima')) === new Date('2026-12-05T21:00:00-05:00').toISOString());
check('Madrid invierno = +01:00', iso(localAUtc('2026-01-10T22:30', 'Europe/Madrid')) === '2026-01-10T21:30:00.000Z');
check('Madrid verano = +02:00', iso(localAUtc('2026-07-10T22:30', 'Europe/Madrid')) === '2026-07-10T20:30:00.000Z');
check('Madrid 29/03 02:30 no existe → null', localAUtc('2026-03-29T02:30', 'Europe/Madrid') === null);
const amb = localAUtc('2026-10-25T02:30', 'Europe/Madrid');
check('Madrid 25/10 02:30 (repetida) → una válida', amb !== null && utcALocal(amb, 'Europe/Madrid') === '2026-10-25T02:30', iso(amb));
check('Nueva York verano = -04:00', iso(localAUtc('2026-07-04T20:00', 'America/New_York')) === '2026-07-05T00:00:00.000Z');
check('Santiago (verano en enero) = -03:00', iso(localAUtc('2026-01-15T21:00', 'America/Santiago')) === '2026-01-16T00:00:00.000Z');
check('Bogotá = -05:00', iso(localAUtc('2026-06-01T20:00', 'America/Bogota')) === '2026-06-02T01:00:00.000Z');
check('basura → null', localAUtc('mañana', 'America/Lima') === null && localAUtc('2026-13-40T99:00', 'America/Lima') === null);
for (const z of ['America/Lima', 'Europe/Madrid', 'America/New_York'] as const) {
  check(`ida y vuelta ${z}`, utcALocal(localAUtc('2026-11-20T19:45', z)!, z) === '2026-11-20T19:45');
}
const t = new Date('2026-12-06T03:00:00Z');
check('hoy en Lima = 05/12 a las 22:00', hoyEn('America/Lima', t) === '2026-12-05');
check('hoy en Madrid = 06/12', hoyEn('Europe/Madrid', t) === '2026-12-06');
const o: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' };
check('formatEnZona Lima idéntico a formatLima', formatEnZona(t, o, 'America/Lima') === formatLima(t, o), formatLima(t, o));

console.log(mal ? `✘ ${mal} fallas, ${ok} OK` : `✔ ${ok}/${ok}`);
process.exit(mal ? 1 : 0);
