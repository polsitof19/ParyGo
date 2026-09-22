// Ensayo: corre cada migración dentro de una transacción y hace ROLLBACK.
// Valida sintaxis y semántica contra el esquema y los datos REALES de
// producción, sin persistir nada.
import { readFileSync, readdirSync } from 'node:fs';
import { query } from './mgmt.mjs';

const files = readdirSync('supabase/migrations').filter((f) => /^00(5[3-8])_/.test(f)).sort();
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
