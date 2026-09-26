#!/usr/bin/env node
'use strict';
/**
 * Suite de guard-sacred-rules.js.   Correr con:  npm run test:hooks
 *
 * Dos suites:
 *
 *  1. FUNCIONAL — veredicto exacto esperado por caso. Cubre los destinos
 *     prohibidos, los legítimos, los falsos positivos que el hook NO debe
 *     reintroducir, y la regla 2 (DDL sobre la venta en vivo).
 *
 *  2. BYPASS — 39 intentos de burlar el guard, generados adversarialmente
 *     (sintaxis de refspec, parseo de shell, indirección por config/alias/env,
 *     y ataque a la implementación). Acá el invariante NO es un veredicto
 *     exacto sino: NINGUNO puede dar PASS. Bloquear o preguntar sirven; dejar
 *     pasar, no. La única excepción está marcada en el JSON.
 *
 * No toca la red ni el repo real: arma repos de mentira en el tmpdir del SO,
 * con solo un .git/HEAD, que es lo único que el hook lee para saber la rama.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// GUARD_HOOK permite apuntar a otra copia: sirve para probar un candidato antes
// de instalarlo, y para verificar que la suite REALMENTE falla (correrla contra
// una versión vieja tiene que dar rojo; si da verde, la suite no prueba nada).
const HOOK = process.env.GUARD_HOOK || path.join(__dirname, '..', 'guard-sacred-rules.js');
const { functionalCases } = require('./functional-cases.js');
const BYPASS = require('./bypass-cases.json');

const WORK_BRANCH = 'refactor/monorepo';
const FROZEN_BRANCH = 'main';

function fixture(root, name, branch) {
  const gitdir = path.join(root, name, '.git');
  fs.mkdirSync(gitdir, { recursive: true });
  fs.writeFileSync(path.join(gitdir, 'HEAD'), 'ref: refs/heads/' + branch + '\n');
  return path.dirname(gitdir);
}

/** Corre el hook con un comando y devuelve 'BLOCK' | 'ASK' | 'PASS'. */
function verdict(cmd, cwd) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd }, cwd }),
    encoding: 'utf8',
  });
  if (r.error) throw r.error;
  if (r.status === 2) return 'BLOCK';
  if (r.status !== 0) throw new Error('el hook salió con código ' + r.status + ': ' + r.stderr);
  try {
    const d = JSON.parse(r.stdout || '{}')?.hookSpecificOutput?.permissionDecision;
    if (d === 'ask') return 'ASK';
    if (d === 'deny') return 'BLOCK';
  } catch (_) {
    /* sin JSON => PASS */
  }
  return 'PASS';
}

function main() {
  if (!fs.existsSync(HOOK)) {
    console.error('No se encontró el hook en ' + HOOK);
    process.exit(2);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parygo-hook-tests-'));
  let failures = 0;
  try {
    const ON_WORK = fixture(root, 'work', WORK_BRANCH);
    const ON_MAIN = fixture(root, 'frozen', FROZEN_BRANCH);

    // ---------------- suite funcional ----------------
    const cases = functionalCases(ON_WORK, ON_MAIN);
    console.log('FUNCIONAL (' + cases.length + ' casos)');
    for (const [name, cmd, cwd, expected] of cases) {
      let got;
      try {
        got = verdict(cmd, cwd);
      } catch (e) {
        got = 'ERROR:' + e.message;
      }
      if (got !== expected) {
        failures++;
        console.log('  FALLA  ' + name);
        console.log('         esperado=' + expected + '  obtenido=' + got);
        console.log('         cmd: ' + cmd.replace(/\n/g, '\\n'));
      }
    }
    console.log('  ' + (cases.length - failures) + '/' + cases.length + ' ok');

    // ---------------- suite de bypasses ----------------
    console.log('\nBYPASS (' + BYPASS.length + ' intentos) — invariante: ninguno puede dar PASS');
    let leaks = 0;
    const porAngulo = {};
    for (const c of BYPASS) {
      const onWork = verdict(c.cmd, ON_WORK);
      const onMain = verdict(c.cmd, ON_MAIN);
      // Si el destino resuelve a la rama actual y esa rama es la de trabajo,
      // el push es legítimo: se permite solo donde el JSON lo marca.
      const workOk = onWork !== 'PASS' || c.permitidoEnRamaDeTrabajo === true;
      const mainOk = onMain !== 'PASS';
      porAngulo[c.angulo] = (porAngulo[c.angulo] || 0) + 1;
      if (!workOk || !mainOk) {
        leaks++;
        failures++;
        console.log('  FUGA   [' + c.angulo + '] ' + c.cmd.replace(/\n/g, '\\n'));
        console.log('         rama de trabajo=' + onWork + '  rama congelada=' + onMain);
        if (c.nota) console.log('         ' + c.nota);
      }
    }
    console.log('  por ángulo: ' + Object.entries(porAngulo).map(([k, v]) => k + '=' + v).join(', '));
    console.log('  ' + (BYPASS.length - leaks) + '/' + BYPASS.length + ' sin fuga');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log('\n' + (failures === 0 ? 'TODO OK' : failures + ' FALLO(S)'));
  process.exit(failures === 0 ? 0 : 1);
}

main();
