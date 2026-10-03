// Verificación del estado esperado de cada migración 0053–0058.
// No aplica nada: solo lee y compara. Se corre DESPUÉS de cada migración.
//
//   node supabase/verify-0053-0058.mjs          -- verifica todas
//   node supabase/verify-0053-0058.mjs 0055     -- solo una
//
// Cada comprobación dice qué esperaba y qué encontró: si algo no cuadra, el
// número está a la vista, no hay que ir a buscarlo.
import { query } from './mgmt.mjs';

const uno = (r) => r?.[0] ?? {};
const val = async (sql) => Object.values(uno(await query(sql)))[0];

const CHECKS = {
  '0053': [
    ['courtesy está en el enum payment_method', 1, () =>
      val(`select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
           where t.typname='payment_method' and e.enumlabel='courtesy'`)],
  ],
  '0054': [
    ['brands.yape_qr_url existe', 1, () =>
      val(`select count(*) from information_schema.columns
           where table_schema='public' and table_name='brands' and column_name='yape_qr_url'`)],
    ['es nullable (nadie queda obligado a tener QR)', 'YES', () =>
      val(`select is_nullable from information_schema.columns
           where table_schema='public' and table_name='brands' and column_name='yape_qr_url'`)],
    ['constraint de https puesto', 1, () =>
      val(`select count(*) from pg_constraint where conname='brands_yape_qr_url_check'`)],
    ['las 3 policies de brand-assets existen', 3, () =>
      val(`select count(*) from pg_policies where schemaname='storage' and tablename='objects'
           and policyname like 'brand-assets%'`)],
    ['la policy de escritura YA NO mira b.name', 0, () =>
      val(`select count(*) from pg_policies where schemaname='storage' and tablename='objects'
           and policyname='brand-assets admin write' and with_check like '%split_part(b.name%'`)],
    ['la policy de escritura mira la ruta del objeto', 1, () =>
      val(`select count(*) from pg_policies where schemaname='storage' and tablename='objects'
           and policyname='brand-assets admin write' and with_check like '%objects.name%'`)],
  ],
  '0055': [
    ['orders_check permite MP sin preferencia si no está cobrada', 1, () =>
      val(`select count(*) from pg_constraint
           where conname='orders_check' and pg_get_constraintdef(oid) like '%mp_payment_id IS NULL%'`)],
    ['ninguna orden existente viola el nuevo check', 0, () =>
      val(`select count(*) from orders
           where not (payment_method in ('yape_manual','courtesy')
                      or mp_preference_id is not null
                      or (status not in ('paid','refunded') and mp_payment_id is null))`)],
    ['sigue sin poder existir una orden MP cobrada sin preferencia', 0, () =>
      val(`select count(*) from orders
           where payment_method='mercadopago' and mp_preference_id is null
             and (status in ('paid','refunded') or mp_payment_id is not null)`)],
  ],
  '0056': [
    ['events.is_free existe', 1, () =>
      val(`select count(*) from information_schema.columns
           where table_schema='public' and table_name='events' and column_name='is_free'`)],
    ['ticket_types.is_courtesy existe', 1, () =>
      val(`select count(*) from information_schema.columns
           where table_schema='public' and table_name='ticket_types' and column_name='is_courtesy'`)],
    ['ningún evento quedó marcado gratis por el backfill', 0, () =>
      val(`select count(*) from events where is_free`)],
    ['todo tipo S/0 quedó marcado cortesía', 0, () =>
      val(`select count(*) from ticket_types where price_cents=0 and not is_courtesy`)],
    ['ningún tipo con precio quedó marcado cortesía', 0, () =>
      val(`select count(*) from ticket_types where is_courtesy and price_cents<>0`)],
    ['índice parcial de tipos públicos creado', 1, () =>
      val(`select count(*) from pg_indexes where indexname='ticket_types_public_idx'`)],
  ],
  '0057': [
    ['brands.is_test existe', 1, () =>
      val(`select count(*) from information_schema.columns
           where table_schema='public' and table_name='brands' and column_name='is_test'`)],
    ['marcadas exactamente demotest, ensayo-paul, koko', 'demotest, ensayo-paul, koko', () =>
      val(`select coalesce(string_agg(slug::text, ', ' order by slug),'(ninguna)') from brands where is_test`)],
    ['hoesky y code NO quedaron marcadas', 0, () =>
      val(`select count(*) from brands where is_test and slug in ('hoesky','code')`)],
    ['los dos índices nuevos existen', 2, () =>
      val(`select count(*) from pg_indexes where indexname in ('brands_is_test_idx','orders_yape_review_idx')`)],
  ],
  '0058': [
    ['tickets_qr_idx ya no está', 0, () =>
      val(`select count(*) from pg_indexes where tablename='tickets' and indexname='tickets_qr_idx'`)],
    ['el unique de qr_code SIGUE estando', 1, () =>
      val(`select count(*) from pg_indexes where tablename='tickets' and indexname='tickets_qr_code_key'`)],
    ['ningún QR duplicado (la unicidad se sostiene)', 0, () =>
      val(`select count(*) from (select qr_code from tickets group by qr_code having count(*)>1) d`)],
  ],
};

const pedido = process.argv[2];
let fallan = 0;
for (const [mig, checks] of Object.entries(CHECKS)) {
  if (pedido && !mig.includes(pedido)) continue;
  console.log(`\n=== ${mig}`);
  for (const [nombre, esperado, fn] of checks) {
    let got;
    try { got = await fn(); } catch (e) { got = 'ERROR: ' + e.message.slice(0, 120); }
    const ok = String(got) === String(esperado);
    if (!ok) fallan++;
    console.log(`  ${ok ? 'OK  ' : 'FALLA'} ${nombre.padEnd(56)} esperado=${esperado} obtenido=${got}`);
  }
}
console.log(fallan === 0 ? '\nTodo como se esperaba.' : `\n${fallan} comprobaciones NO cuadran.`);
process.exit(fallan ? 1 : 0);
