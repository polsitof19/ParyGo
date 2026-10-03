// Ensayo de la 0069 (prueba gratis) contra el esquema REAL, en UNA
// transacción que termina en ROLLBACK: no persiste nada. Corre la migración y
// después los casos, cada uno en su subtransacción (bloque con EXCEPTION).
// Los casos "como organizador" corren con `set local role authenticated` y
// los claims del JWT del dueño de demotest: la misma RLS que ve PostgREST.
// Uso: node supabase/ensayo-0069.mjs
import { readFileSync } from 'node:fs';
import { query } from './mgmt.mjs';

const mig = readFileSync('supabase/migrations/0069_prueba_gratis.sql', 'utf8');
const DEMO = '08553a34-988f-4537-b816-43e385b5a7a4';
const DUENO = '4f6db7bf-f753-4564-bf9c-26daae4eea5f';
const CODE = "(select id from brands where slug='code')";
const tt = (caps) => JSON.stringify(caps.map((c, i) => ({ name: `T${i}`, price_cents: 1000, capacity: c, is_unlimited: false, sort_order: i, phases: [{ price_cents: 1000, starts_at: null, ends_at: null, sort_order: 0 }] })));
const ev = (slug) => JSON.stringify({ slug, name: 'Ensayo 0069', starts_at: '2027-01-10T02:00:00Z' });

const casos = `
do $t$
declare
  r text := '';
  v uuid;
  n int;
  bal_antes int;
  procedure_ok boolean;
begin
  -- A. Marca sin prueba (Code) → NO_TRIAL
  begin
    perform create_brand_trial_event(${CODE}, null, '${ev('x-0069-code')}', '${tt([10])}');
    r := r || 'A FALLA(creó) | ';
  exception when others then r := r || 'A ' || case when sqlerrm like '%NO_TRIAL%' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;

  -- B. demotest con prueba: 30+20 = 50 → crea, es_prueba, saldo igual, prueba gastada
  select event_balance into bal_antes from brands where id = '${DEMO}';
  update brands set prueba_disponible = true where id = '${DEMO}';
  v := create_brand_trial_event('${DEMO}', null, '${ev('x-0069-a')}', '${tt([30, 20])}');
  select count(*) into n from events e join brands b on b.id = e.brand_id
   where e.id = v and e.es_prueba and not b.prueba_disponible and b.event_balance = bal_antes and not e.is_published;
  r := r || 'B ' || case when n = 1 then 'ok' else 'FALLA' end || ' | ';

  -- C. Segunda vez → NO_TRIAL
  begin
    perform create_brand_trial_event('${DEMO}', null, '${ev('x-0069-b')}', '${tt([5])}');
    r := r || 'C FALLA(creó) | ';
  exception when others then r := r || 'C ' || case when sqlerrm like '%NO_TRIAL%' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;

  -- D. Prueba con 60 → falla y NO gasta la prueba (rollback de todo)
  update brands set prueba_disponible = true where id = '${DEMO}';
  begin
    perform create_brand_trial_event('${DEMO}', null, '${ev('x-0069-c')}', '${tt([40, 20])}');
    r := r || 'D FALLA(creó) | ';
  exception when others then r := r || 'D ' || case when sqlerrm like '%PRUEBA_TOPE%' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;
  select count(*) into n from brands where id = '${DEMO}' and prueba_disponible and event_balance = bal_antes;
  r := r || 'D2 ' || case when n = 1 then 'ok' else 'FALLA(gastó)' end || ' | ';
  update brands set prueba_disponible = false where id = '${DEMO}';

  -- E. Subir capacidad a 31 (51 total) → tope
  begin
    update ticket_types set capacity = 31 where event_id = v and name = 'T0';
    r := r || 'E FALLA(pasó) | ';
  exception when others then r := r || 'E ' || case when sqlerrm like '%PRUEBA_TOPE%' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;
  -- F. Tipo nuevo de 1 → tope; ilimitado → rechazado
  begin
    insert into ticket_types (event_id, name, price_cents, capacity, is_unlimited, sort_order) values (v, 'T9', 0, 1, false, 9);
    r := r || 'F FALLA(pasó) | ';
  exception when others then r := r || 'F ' || case when sqlerrm like '%PRUEBA_TOPE%' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;
  begin
    update ticket_types set is_unlimited = true where event_id = v and name = 'T1';
    r := r || 'F2 FALLA(pasó) | ';
  exception when others then r := r || 'F2 ' || case when sqlerrm like '%PRUEBA_SIN_ILIMITADO%' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;
  -- G. Bajar capacidad sí se puede
  begin
    update ticket_types set capacity = 10 where event_id = v and name = 'T0';
    r := r || 'G ok | ';
  exception when others then r := r || 'G FALLA ' || sqlerrm || ' | ';
  end;

  -- H. Como ORGANIZADOR (role authenticated + JWT del dueño)
  perform set_config('request.jwt.claims', json_build_object('sub', '${DUENO}', 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '${DUENO}', true);
  begin
    execute 'set local role authenticated';
    update events set es_prueba = false where id = v;
    get diagnostics n = row_count;
    r := r || 'H FALLA(cambió ' || n || ') | ';
  exception when others then r := r || 'H ' || case when sqlerrm like '%PRUEBA_FLAG_READONLY%' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;
  begin
    execute 'set local role authenticated';
    update ticket_types set capacity = 500 where event_id = v and name = 'T1';
    get diagnostics n = row_count;
    r := r || 'I FALLA(pasó ' || n || ') | ';
  exception when others then r := r || 'I ' || case when sqlerrm like '%PRUEBA_TOPE%' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;
  begin
    execute 'set local role authenticated';
    perform create_brand_trial_event('${DEMO}', '${DUENO}', '${ev('x-0069-d')}', '${tt([5])}');
    r := r || 'J FALLA(ejecutó) | ';
  exception when others then r := r || 'J ' || case when sqlstate = '42501' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;
  begin
    execute 'set local role anon';
    perform create_brand_trial_event('${DEMO}', null, '${ev('x-0069-e')}', '${tt([5])}');
    r := r || 'J2 FALLA(ejecutó) | ';
  exception when others then r := r || 'J2 ' || case when sqlstate = '42501' then 'ok' else 'FALLA ' || sqlerrm end || ' | ';
  end;
  execute 'reset role';

  -- K. Evento NORMAL (Standly de Code): cambiar capacidad sigue libre
  begin
    update ticket_types set capacity = capacity + 1000 where event_id = '4d0c3276-880e-4318-ae27-61793d1ec2c4' and name = 'GENERAL';
    r := r || 'K ok';
  exception when others then r := r || 'K FALLA ' || sqlerrm;
  end;

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
const [c] = await query("select count(*)::int n from information_schema.columns where table_name='events' and column_name='es_prueba'");
console.log('persistió la columna es_prueba?', c.n ? 'SÍ (MAL)' : 'no (bien)');
