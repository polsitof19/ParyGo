#!/usr/bin/env node
/**
 * guard-sacred-rules.js — enforcement determinístico de las 2 reglas sagradas de ParyGo.
 * Se invoca como hook PreToolUse (matcher Bash|PowerShell). NO depende de que el modelo recuerde.
 *
 * Contrato de hooks (doc oficial Claude Code):
 *  - Recibe JSON por stdin: { tool_name, tool_input: { command, ... }, ... }
 *  - exit 2  => BLOQUEA la tool call; el stderr se le muestra a Claude.
 *  - exit 0 + JSON { hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } }
 *      => permissionDecision "ask" fuerza confirmación humana; "deny" bloquea; "allow" deja pasar.
 *  - exit 0 sin JSON => flujo normal de permisos.
 *
 * Regla 1 (HARD BLOCK): nunca push ni merge a main (main = landing en prod).
 * Regla 2 (ASK):        nunca tocar por accidente la venta en vivo (brand "code" / evento
 *                       "almighty" / project ref de Supabase) con DDL destructivo.
 */

'use strict';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    // Si no llega stdin (invocación rara), no colgar.
    setTimeout(() => resolve(data), 2000);
  });
}

function block(reason) {
  // exit 2: bloqueo duro, stderr -> Claude
  process.stderr.write('[guard-sacred-rules] BLOQUEADO: ' + reason + '\n');
  process.exit(2);
}

function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: '[guard-sacred-rules] ' + reason,
      },
    })
  );
  process.exit(0);
}

function pass() {
  process.exit(0);
}

(async () => {
  let payload = {};
  try {
    payload = JSON.parse((await readStdin()) || '{}');
  } catch (_) {
    pass(); // si no podemos parsear, no rompemos el flujo del usuario
  }

  const cmd = String(payload?.tool_input?.command || '');
  if (!cmd.trim()) pass();

  const c = cmd.toLowerCase();

  // ---------- Regla 1: push / merge a main (HARD BLOCK) ----------
  const isPush = /\bgit\s+push\b/.test(c);
  const isMerge = /\bgit\s+merge\b/.test(c);
  const mentionsMain = /\b(main|master)\b/.test(c);

  if (isPush && mentionsMain) {
    block('git push que referencia main/master. Branch de trabajo: refactor/monorepo. NUNCA a main.');
  }
  // push de refspec a main: HEAD:main, branch:main, :main
  if (isPush && /:\s*(main|master)\b/.test(c)) {
    block('git push con refspec hacia main/master. Prohibido.');
  }
  // push --all / --mirror puede arrastrar main
  if (isPush && /\s--(all|mirror)\b/.test(c)) {
    block('git push --all/--mirror puede empujar main. Empujá solo refactor/monorepo explícito.');
  }
  // merge que empuja a main por refspec local
  if (isMerge && mentionsMain) {
    ask('git merge que menciona main/master. Confirmá que NO estás fusionando hacia main.');
  }
  // moverse a main: defensivo, para que no se haga merge silencioso estando en main
  if (/\bgit\s+(checkout|switch)\s+(-\S+\s+)*(main|master)\b/.test(c)) {
    ask('te estás moviendo a main/master. Confirmá (riesgo: merge/commit accidental en main).');
  }

  // ---------- Regla 2: venta en vivo + DDL destructivo (ASK) ----------
  const destructiveDDL =
    /\bdrop\s+(table|schema|database|view|function|index|type|trigger|policy)\b/.test(c) ||
    /\btruncate\b/.test(c) ||
    (/\bdelete\s+from\b/.test(c) && !/\bwhere\b/.test(c)); // delete sin where

  if (destructiveDDL) {
    // "almighty" es distintivo: límite solo por delante para cazar almighty, almighty_scans, etc.
    const touchesAlmighty = /\balmighty/.test(c);
    const touchesProdRef = /mdxtpevisjiqpeklhxdv/.test(c);
    // brand "code": evitar falsos positivos (vscode, "claude code", paths) exigiendo
    // que el token aparezca como literal de slug dentro del SQL destructivo.
    const touchesCodeBrand = /['"]code['"]/.test(c) || /\bslug\s*=\s*['"]?code['"]?/.test(c);

    if (touchesAlmighty || touchesProdRef || touchesCodeBrand) {
      const what = touchesAlmighty
        ? 'evento "almighty"'
        : touchesProdRef
        ? 'project ref de Supabase (PRODUCCIÓN)'
        : 'brand "code"';
      ask(
        'DDL destructivo (drop/truncate/delete sin where) que toca ' +
          what +
          '. Almighty está VENDIENDO EN VIVO. Confirmá antes de ejecutar.'
      );
    }
    // DDL destructivo genérico contra prod igual merece un alto, pero sin tokens sagrados
    // lo dejamos pasar al flujo normal de permisos para no inundar de prompts.
  }

  pass();
})();
