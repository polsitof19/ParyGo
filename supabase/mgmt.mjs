// Cliente mínimo de la Management API de Supabase para aplicar y verificar
// migraciones contra el proyecto de PRODUCCIÓN.
//
// El token sale de apps/web/.env.local (SUPABASE_ACCESS_TOKEN) y NUNCA se
// imprime ni se escribe a ningún lado. Si falta, esto falla en vez de seguir.
//
//   node supabase/mgmt.mjs sql "select 1"          -- consulta suelta
//   node supabase/mgmt.mjs file 0053_algo.sql      -- aplica una migración
//   node supabase/mgmt.mjs branches                -- ¿hay branching?
//   node supabase/mgmt.mjs info                    -- proyecto y versión
//
// Ojo: `file` aplica DDL en PRODUCCIÓN. Está pensado para usarse después de
// mostrar el SQL y recibir el OK, no antes.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function env() {
  const txt = readFileSync(resolve(ROOT, 'apps/web/.env.local'), 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const l = line.replace(/\r$/, '');
    if (!l.includes('=') || l.trim().startsWith('#')) continue;
    const i = l.indexOf('=');
    out[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const E = env();
const TOKEN = E.SUPABASE_ACCESS_TOKEN;
const REF = E.SUPABASE_PROJECT_REF || new URL(E.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (!TOKEN) throw new Error('falta SUPABASE_ACCESS_TOKEN en apps/web/.env.local');

async function api(path, init = {}) {
  const r = await fetch(`https://api.supabase.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const txt = await r.text();
  let body;
  try { body = JSON.parse(txt); } catch { body = txt; }
  if (!r.ok) {
    // El mensaje de error de la API puede traer el SQL, nunca el token.
    const e = new Error(`${r.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    e.status = r.status;
    throw e;
  }
  return body;
}

export const query = (sql) =>
  api(`/v1/projects/${REF}/database/query`, { method: 'POST', body: JSON.stringify({ query: sql }) });

// El bloque CLI solo corre cuando se ejecuta el archivo, no al importarlo.
const ESTE = fileURLToPath(import.meta.url);
const CLI = process.argv[1] && resolve(process.argv[1]) === ESTE;
const [cmd, arg] = CLI ? process.argv.slice(2) : [];
if (CLI) {

if (cmd === 'info') {
  console.log('proyecto:', REF);
  console.log(JSON.stringify(await query('select current_database() as db, version() as pg'), null, 1));
} else if (cmd === 'branches') {
  try {
    const b = await api(`/v1/projects/${REF}/branches`);
    console.log(JSON.stringify(b, null, 1));
  } catch (e) {
    console.log('branching NO disponible:', e.message.slice(0, 300));
  }
} else if (cmd === 'types') {
  // ⚠ PISA apps/web/lib/supabase/database.types.ts ENTERO.
  //
  // El archivo commiteado tiene ajustes a mano: regenerarlo completo el
  // 2026-09-22 rompió ~8 archivos (nullabilidad distinta en promo-actions,
  // reenviar, t/[uuid], cron/notifications). Por eso las columnas de las
  // migraciones 0053–0058 se agregaron a mano y NO con este comando.
  //
  // Antes de usarlo: correr `npx tsc --noEmit` después y estar dispuesto a
  // arreglar lo que se rompa, o volver con `git checkout` de ese archivo.
  const t = await api(`/v1/projects/${REF}/types/typescript?included_schemas=public`);
  const dest = resolve(ROOT, 'apps/web/lib/supabase/database.types.ts');
  writeFileSync(dest, t.types);
  console.log(`tipos regenerados: ${dest} (${t.types.length} chars)`);
} else if (cmd === 'sql') {
  console.log(JSON.stringify(await query(arg), null, 1));
} else if (cmd === 'file') {
  const p = arg.includes('/') || arg.includes('\\') ? arg : resolve(ROOT, 'supabase/migrations', arg);
  const sql = readFileSync(p, 'utf8');
  console.log(`aplicando ${p} (${sql.length} chars) en ${REF}…`);
  console.log(JSON.stringify(await query(sql), null, 1));
  console.log('OK');
} else {
  console.log('uso: node supabase/mgmt.mjs [info|branches|sql <SQL>|file <archivo>]');
}
}
