// Test de volverA (apps/web/lib/loginNext.ts): el `next` del login no puede
// sacar a nadie del sitio ni llevarlo a una pantalla que su rol no ve.
//   cd apps/web && npx tsx ../../e2e/login-next.test.mts
const { volverA } = await import('@/lib/loginNext');

const CASOS: [string, string, string, string][] = [
  // [next, destino por rol, esperado, qué prueba]
  ['/scan', '/admin', '/scan', 'organizador vuelve al escáner'],
  ['/scan', '/scan', '/scan', 'validador vuelve al escáner'],
  ['/admin/events/abc-123', '/admin', '/admin/events/abc-123', 'organizador vuelve a su pantalla del panel'],
  ['/admin', '/scan', '/scan', 'validador NO entra al panel por next'],
  ['/scan', '/cabina-7k29x', '/cabina-7k29x', 'super admin: next se ignora'],
  ['/scan', '/', '/', 'sin marca: next se ignora'],
  ['//evil.com', '/admin', '/admin', 'protocol-relative'],
  ['https://evil.com', '/admin', '/admin', 'URL absoluta'],
  ['/scan/../admin', '/scan', '/scan', 'subir con ..'],
  ['/admin\\evil', '/admin', '/admin', 'barra invertida'],
  ['/admin%2F..', '/admin', '/admin', 'codificado'],
  ['/admin\n//evil', '/admin', '/admin', 'salto de línea'],
  ['/adminx', '/admin', '/admin', 'prefijo parecido'],
  ['', '/admin', '/admin', 'vacío'],
];
let fallas = 0;
for (const [next, destino, esperado, que] of CASOS) {
  const r = volverA(next, destino);
  const ok = r === esperado;
  if (!ok) fallas += 1;
  console.log(`${ok ? '✔' : '✘'} ${que}: next=${JSON.stringify(next)} destino=${destino} → ${r}${ok ? '' : ` (esperado ${esperado})`}`);
}
console.log(fallas ? `✘ ${fallas} de ${CASOS.length}` : `✔ ${CASOS.length}/${CASOS.length}`);
process.exit(fallas ? 1 : 0);
