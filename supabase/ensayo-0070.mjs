// Ensayo de la 0070 (compra de paquetes) contra el esquema REAL, en UNA
// transacción que termina en ROLLBACK. Uso: node supabase/ensayo-0070.mjs
import { readFileSync } from 'node:fs';
import { query } from './mgmt.mjs';

const mig = readFileSync('supabase/migrations/0070_pack_purchases.sql', 'utf8');
const DEMO = '08553a34-988f-4537-b816-43e385b5a7a4';
const DUENO = '4f6db7bf-f753-4564-bf9c-26daae4eea5f';

const casos = `
do $t$
declare
  r text := '';
  c1 uuid; c2 uuid;
  b0 int; b int;
  j jsonb;
begin
  select event_balance into b0 from brands where id = '${DEMO}';
  insert into pack_purchases (brand_id, pack, provider, currency, amount_cents) values ('${DEMO}', 3, 'mercadopago', 'PEN', 39000) returning id into c1;
  insert into pack_purchases (brand_id, pack, provider, currency, amount_cents) values ('${DEMO}', 1, 'mercadopago', 'PEN', 15000) returning id into c2;

  j := settle_pack_purchase(c1, 'mercadopago', 'pay-1', 100, 'PEN');
  select event_balance into b from brands where id = '${DEMO}';
  r := r || 'A monto malo ' || case when j->>'action' = 'mismatch' and b = b0 then 'ok' else 'FALLA ' || j::text end || ' | ';
  j := settle_pack_purchase(c1, 'mercadopago', 'pay-1', 39000, 'USD');
  r := r || 'B moneda mala ' || case when j->>'action' = 'mismatch' then 'ok' else 'FALLA ' || j::text end || ' | ';
  j := settle_pack_purchase(c1, 'paypal', 'pay-1', 39000, 'PEN');
  r := r || 'C pasarela mala ' || case when j->>'action' = 'mismatch' then 'ok' else 'FALLA ' || j::text end || ' | ';

  j := settle_pack_purchase(c1, 'mercadopago', 'pay-1', 39000, 'PEN');
  select event_balance into b from brands where id = '${DEMO}';
  r := r || 'D acredita ' || case when j->>'action' = 'credited' and b = b0 + 3 then 'ok' else 'FALLA ' || j::text end || ' | ';
  j := settle_pack_purchase(c1, 'mercadopago', 'pay-1', 39000, 'PEN');
  select event_balance into b from brands where id = '${DEMO}';
  r := r || 'E repetido ' || case when j->>'action' = 'already_paid' and b = b0 + 3 then 'ok' else 'FALLA ' || j::text end || ' | ';
  j := settle_pack_purchase(c2, 'mercadopago', 'pay-1', 15000, 'PEN');
  select event_balance into b from brands where id = '${DEMO}';
  r := r || 'F pago reusado ' || case when j->>'action' = 'payment_reused' and b = b0 + 3 then 'ok' else 'FALLA ' || j::text end || ' | ';

  begin
    insert into pack_purchases (brand_id, pack, provider, currency, amount_cents) values ('${DEMO}', 2, 'mercadopago', 'PEN', 100);
    r := r || 'G pack inválido FALLA | ';
  exception when check_violation then r := r || 'G pack inválido ok | ';
  end;
  begin
    insert into pack_purchases (brand_id, pack, provider, currency, amount_cents) values ('${DEMO}', 1, 'paypal', 'PEN', 100);
    r := r || 'H moneda/pasarela FALLA | ';
  exception when check_violation then r := r || 'H moneda/pasarela ok | ';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', '${DUENO}', 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform count(*) from pack_purchases;
    r := r || 'I leer (org) FALLA | ';
  exception when others then r := r || 'I leer (org) ' || case when sqlstate = '42501' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;
  begin
    execute 'set local role authenticated';
    perform settle_pack_purchase(c2, 'mercadopago', 'x', 15000, 'PEN');
    r := r || 'J settle (org) FALLA | ';
  exception when others then r := r || 'J settle (org) ' || case when sqlstate = '42501' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;
  begin
    execute 'set local role anon';
    insert into pack_purchases (brand_id, pack, provider, currency, amount_cents) values ('${DEMO}', 10, 'mercadopago', 'PEN', 1);
    r := r || 'K insertar (anon) FALLA';
  exception when others then r := r || 'K insertar (anon) ' || case when sqlstate = '42501' then 'ok' else 'FALLA ' || sqlerrm end;
  end;
  execute 'reset role';
  raise exception 'RESULTADO: %', r;
end $t$;`;

try {
  await query(`begin;\n${mig}\n;\n${casos}\n;rollback;`);
  console.log('?? no terminó con el RESULTADO esperado');
} catch (e) {
  const m = e.message.match(/RESULTADO: ([^"\\]*)/);
  console.log(m ? m[1].split(' | ').join('\n') : 'ERROR: ' + e.message.slice(0, 600));
  try { await query('rollback;'); } catch {}
}
const [c] = await query("select count(*)::int n from information_schema.tables where table_name='pack_purchases'");
console.log('persistió la tabla?', c.n ? 'SÍ (MAL)' : 'no (bien)');
