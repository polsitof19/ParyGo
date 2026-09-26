// Ensayo: corre cada migración dentro de una transacción y hace ROLLBACK.
// Valida sintaxis y semántica contra el esquema y los datos REALES de
// producción, sin persistir nada.
import { readFileSync, readdirSync } from 'node:fs';
import { query } from './mgmt.mjs';

// Por defecto ensaya de la 0053 en adelante; con argumento, solo las que
// empiezan con ese prefijo:  node supabase/dryrun.mjs 0060
const filtro = process.argv[2];
const files = readdirSync('supabase/migrations')
  .filter((f) => (filtro ? f.startsWith(filtro) : /^00(5[3-9]|[6-9]\d)_/.test(f)))
  .sort();
for (const f of files) {
  const sql = readFileSync('supabase/migrations/' + f, 'utf8');
  try {
    await query(`begin;\n${sql}\n;rollback;`);
    console.log('OK      ' + f);
  } catch (e) {
    console.log('FALLA   ' + f + '\n        ' + e.message.slice(0, 400).replace(/\n/g, '\n        '));
    try { await query('rollback;'); } catch {}
  }
}
