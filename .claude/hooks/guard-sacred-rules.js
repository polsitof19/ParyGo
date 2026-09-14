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
 * Regla 1 (HARD BLOCK): nunca empujar ni fusionar hacia la rama de landing en prod.
 *
 *   La versión anterior bloqueaba si la palabra sagrada aparecía EN CUALQUIER PARTE
 *   del comando junto con un push. Eso daba falsos positivos absurdos: un
 *   `git commit -m "...<rama>..." && git push origin refactor/monorepo` se bloqueaba
 *   por la palabra del MENSAJE DE COMMIT, no por el destino. Tan falso positivo era
 *   que impedía escribir este mismo archivo.
 *
 *   Ahora se valida el DESTINO REAL, con defensa en profundidad y dos modos:
 *
 *   a) SEGMENTO LIMPIO (sin metacaracteres de shell, sin indirección, con `push`
 *      como token suelto): se parsea el refspec y se decide por el destino.
 *      Cubre `origin <rama>`, `HEAD:<rama>`, `otra:<rama>`, `+<rama>`, `:<rama>`,
 *      `--delete`, `refs/heads/<rama>`, la abreviatura `heads/<rama>`, `@` como
 *      alias de HEAD, refspecs múltiples, `--all`/`--mirror`, y el push sin
 *      refspec estando parado en la rama sagrada (ahí la palabra no aparece en
 *      ningún lado del comando).
 *
 *   b) SEGMENTO SOSPECHOSO (comillas, escapes, $, backticks, paréntesis, `-c`,
 *      alias, `sh -c`, `eval`, `xargs`...): NO se confía en el parseo. Se
 *      normaliza el texto (se sacan comillas y barras) y, si aparece la rama
 *      sagrada, se BLOQUEA; si no, se PREGUNTA. Se falla CERRADO siempre.
 *
 *   El modo (b) existe porque el shell permite escribir el mismo destino de
 *   infinitas formas (`ma"in"`, `\main`, `$r`, stdin vía xargs). Un parser que
 *   intente seguirlas todas pierde; uno que las declare no-verificables, gana.
 *
 * Regla 2 (ASK):        nunca tocar por accidente la venta en vivo (brand "code" / evento
 *                       "almighty" / project ref de Supabase) con DDL destructivo.
 */

'use strict';

const fs = require('fs');
const path = require('path');

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

// ---------------- constantes de la regla 1 ----------------

// Destino sagrado. Cubre las abreviaturas que git resuelve a la misma rama:
// <rama>, heads/<rama>, refs/heads/<rama>. Se mira el último componente.
const SACRED_LEAF = /^(?:.*\/)?(?:main|master)$/i;
// Para el barrido de texto en modo conservador.
const SACRED_WORD = /\b(?:main|master)\b/i;

// Metacaracteres de shell: si alguno aparece en el segmento del push, el destino
// deja de ser verificable por parseo (ma"in", \main, $r, `cmd`, subshells...).
const SHELL_META = /[$`'"\\<>(){}]/;
// Indirección: el comando real lo arma otro proceso.
const INDIRECT = /\b(?:xargs|eval|sh|bash|zsh|ksh|env|sudo|nohup|watch|time|ssh)\b/;
// Casos donde el destino puede venir de OTRO segmento (stdin, pipe, eval).
const STDIN_FED = /\b(?:xargs|eval)\b/;
// Opciones globales de git que pueden inyectar destino o alias antes del subcomando.
const UNSAFE_GLOBAL_OPT = /^(?:-c|--config|--config-env|--exec-path)(?:=|$)/;
// Opciones de `git push` que consumen el token siguiente como valor.
const OPTS_WITH_VALUE = /^(?:-o|--push-option|--repo|--receive-pack|--exec)$/;
// Verbos que escriben refs en el remoto. `send-pack` es el plumbing de push:
// hace lo mismo y no contiene la palabra "push".
const PUSH_VERB = /\b(?:push|send-pack)\b/;
// Asignación de variable de entorno antes de git (GIT_CONFIG_* inyecta config).
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

// ---------------- helpers ----------------

/** Une continuaciones de línea (`\` + salto) antes de partir por saltos. */
function joinContinuations(cmd) {
  return cmd.replace(/\\\r?\n/g, ' ');
}

/** Saca comillas y barras para cazar ma"in", \main, 'main', "refs/heads/main". */
function normalizeWords(s) {
  return s.replace(/[\\'"]/g, '');
}

/**
 * Saca redirecciones (2>&1, > log.txt, >>out, <in) con su destino incluido.
 * Son rutinarias y no cambian a qué rama se empuja, pero traen `>`/`<`, que si
 * no marcarían el segmento como "no verificable" y mandarían un push normal al
 * modo conservador. git no admite `<` ni `>` en nombres de rama, así que
 * sacarlas no puede ocultar un destino.
 */
function stripRedirections(s) {
  return s.replace(/\d*(?:>>?|<)\s*&?\s*[^\s|;&]*/g, ' ');
}

/** Parte la línea en comandos shell sueltos: así el push no se contamina con
 *  el texto de un `git commit -m "..."` encadenado antes. */
function shellSegments(cmd) {
  return cmd.split(/&&|\|\||;|\||&|\r?\n/);
}

/** Tokeniza respetando comillas: -m "texto largo" queda como UN token. */
function tokenize(seg) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(seg)) !== null) {
    out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  }
  return out;
}

/** Destino real de un refspec: src:dst -> dst, +x -> x, :x -> x (borrado). */
function refspecDst(token) {
  const t = token.replace(/^\+/, '');
  const i = t.indexOf(':');
  return (i === -1 ? t : t.slice(i + 1)).trim();
}

/** Rama actual leyendo .git/HEAD. null si detached o si no se puede determinar. */
function currentBranch(startDir) {
  if (startDir === null) return null; // cwd no verificable
  let dir = startDir || process.cwd();
  // Caso --git-dir=...: el path ya ES el gitdir, con HEAD adentro.
  try {
    const head = fs.readFileSync(path.join(dir, 'HEAD'), 'utf8').trim();
    const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (ref) return ref[1];
  } catch (_) {
    /* no era un gitdir, seguir */
  }
  for (let i = 0; i < 25; i++) {
    try {
      const dotgit = path.join(dir, '.git');
      const st = fs.statSync(dotgit);
      let gitdir = dotgit;
      if (st.isFile()) {
        const m = fs.readFileSync(dotgit, 'utf8').match(/gitdir:\s*(.+)/);
        if (!m) return null;
        gitdir = path.resolve(dir, m[1].trim());
      }
      const head = fs.readFileSync(path.join(gitdir, 'HEAD'), 'utf8').trim();
      const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
      return ref ? ref[1] : null; // detached HEAD
    } catch (_) {
      /* seguir subiendo */
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** ¿El subcomando de git viene oculto en una variable? (`git $r origin ...`) */
function subcommandHidden(tokens, gi) {
  for (let i = gi + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('-')) continue; // opción global
    return /[$`]/.test(t); // el primer no-opción es el subcomando
  }
  return false;
}

/**
 * Analiza UN segmento que menciona un push.
 * Devuelve {verdict: 'block'|'ask'|'pass', reason}.
 */
function analyzePushSegment(rawSeg, cwd, wholeCmd) {
  const seg = stripRedirections(rawSeg);
  const tokens = tokenize(seg);
  // Se tolera puntuación de shell pegada al token: `(git` de un subshell,
  // `\git` de un escape. Sin esto el segmento no se reconocería como git.
  const gi = tokens.findIndex((t) => {
    const n = t.replace(/^[\\('"`{]+/, '');
    return n === 'git' || /(?:^|\/)git$/.test(n);
  });
  let pi = -1;
  if (gi !== -1) {
    for (let i = gi + 1; i < tokens.length; i++) {
      if (tokens[i] === 'push' || tokens[i] === 'send-pack') {
        pi = i;
        break;
      }
    }
  }

  // ---- ¿este segmento es realmente una invocación de push? ----
  // Sin esto, una línea de prosa dentro de un mensaje de commit ("no pushear a
  // main") entraría al análisis y se bloquearía: el mismo falso positivo que
  // vinimos a arreglar, por la puerta de atrás.
  const hasGit = gi !== -1;
  const hasVerb = PUSH_VERB.test(normalizeWords(seg));
  const relevante = hasVerb
    ? hasGit || INDIRECT.test(seg) // `sh -c '...'` esconde el token git entre comillas
    : hasGit && subcommandHidden(tokens, gi); // `git $r origin main`
  if (!relevante) return { verdict: 'pass' };

  // --all / --mirror arrastran la rama sagrada aunque no se la nombre. Va acá
  // adentro, no antes: si no, un `git commit --all` inocente se bloquearía.
  if (tokens.some((t) => /^--(?:all|mirror)$/.test(t))) {
    return {
      verdict: 'block',
      reason: 'push --all/--mirror puede empujar la rama de landing. Empujá solo refactor/monorepo explícito.',
    };
  }

  // ---- ¿es un segmento en el que podemos confiar para parsear? ----
  let suspicious = false;
  let porque = '';
  if (SHELL_META.test(seg)) {
    suspicious = true;
    porque = 'tiene comillas, escapes o sustitución de shell';
  } else if (INDIRECT.test(seg)) {
    suspicious = true;
    porque = 'el comando real lo arma otro proceso (xargs/eval/sh -c)';
  } else if (gi === -1 || pi === -1) {
    suspicious = true;
    porque = 'el verbo de push no aparece como subcomando suelto (posible alias)';
  } else if (tokens.some((t, i) => i < gi && ENV_ASSIGN.test(t))) {
    suspicious = true;
    porque = 'tiene asignaciones de entorno antes de git (GIT_CONFIG_* puede inyectar el destino)';
  } else {
    for (let i = gi + 1; i < pi; i++) {
      if (UNSAFE_GLOBAL_OPT.test(tokens[i])) {
        suspicious = true;
        porque = 'usa -c/--config antes del subcomando, que puede inyectar el destino o un alias';
        break;
      }
    }
  }

  if (suspicious) {
    // No se confía en el parseo. Se barre el comando ENTERO normalizado: en un
    // segmento sospechoso el destino puede venir de cualquier lado (stdin, una
    // variable asignada antes, env, un alias). Esto NO reintroduce el falso
    // positivo original, porque un push escrito de forma simple nunca cae acá.
    const scan = normalizeWords(wholeCmd);
    if (SACRED_WORD.test(scan)) {
      return {
        verdict: 'block',
        reason:
          'push no verificable que menciona la rama de landing (' +
          porque +
          '). Bloqueado por precaución: escribí el push de forma simple y explícita.',
      };
    }
    return {
      verdict: 'ask',
      reason: 'no se puede verificar el destino del push (' + porque + '). Confirmá a qué rama va.',
    };
  }

  // ---- segmento limpio: se decide por el destino real ----

  // `git -C <path> push` / `--git-dir=<path>`: el push opera sobre OTRO repo,
  // así que la "rama actual" hay que leerla de ESE repo, no del cwd de la sesión.
  let repoDir = cwd;
  for (let i = gi + 1; i < pi; i++) {
    const t = tokens[i];
    if ((t === '-C' || t === '--git-dir') && tokens[i + 1] !== undefined) {
      repoDir = cwd === null ? null : path.resolve(cwd, tokens[i + 1]);
    }
    const m = t.match(/^--git-dir=(.+)$/);
    if (m) repoDir = cwd === null ? null : path.resolve(cwd, m[1]);
  }

  const args = tokens.slice(pi + 1);

  // Separar flags de posicionales (repo + refspecs).
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-')) {
      if (OPTS_WITH_VALUE.test(a)) i++; // saltear el valor
      continue;
    }
    positional.push(a);
  }

  // Se chequean TODOS los posicionales como destino potencial, incluido el
  // primero (normalmente el remoto): cierra variantes como `--repo=origin X`,
  // donde el refspec queda en primera posición. Un remoto llamado como la rama
  // sagrada es patológico, así que el costo en falsos positivos es nulo.
  for (const p of positional) {
    const dst = refspecDst(p);
    if (SACRED_LEAF.test(dst)) {
      return {
        verdict: 'block',
        reason: 'push cuyo DESTINO es ' + dst + '. Branch de trabajo: refactor/monorepo. Prohibido.',
      };
    }
    // HEAD y su alias @ resuelven a la rama actual.
    if (/^(?:HEAD|@)$/i.test(dst)) {
      const br = currentBranch(repoDir);
      if (br === null) {
        return {
          verdict: 'ask',
          reason: 'push de HEAD y no se pudo determinar la rama actual. Confirmá el destino.',
        };
      }
      if (SACRED_LEAF.test(br)) {
        return { verdict: 'block', reason: 'push de HEAD estando parado en ' + br + '. Prohibido.' };
      }
    }
  }

  // Sin refspec explícito (`git push` o `git push origin`): el destino es la rama
  // actual. Este caso la versión anterior NO lo cubría, porque la palabra sagrada
  // no aparece en ninguna parte del comando.
  if (positional.length <= 1) {
    const br = currentBranch(repoDir);
    if (br === null) {
      return {
        verdict: 'ask',
        reason: 'push sin refspec y no se pudo determinar la rama actual (HEAD detached o repo no encontrado). Confirmá el destino.',
      };
    }
    if (SACRED_LEAF.test(br)) {
      return {
        verdict: 'block',
        reason: 'push sin refspec estando parado en ' + br + ': empujaría a ' + br + '. Prohibido.',
      };
    }
  }

  return { verdict: 'pass' };
}

(async () => {
  let payload = {};
  try {
    payload = JSON.parse((await readStdin()) || '{}');
  } catch (_) {
    pass(); // si no podemos parsear, no rompemos el flujo del usuario
  }

  const rawCmd = String(payload?.tool_input?.command || '');
  if (!rawCmd.trim()) pass();

  const cwd = payload?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const cmd = joinContinuations(rawCmd);
  const c = cmd.toLowerCase();

  // ---------- Regla 1: push a la rama sagrada (HARD BLOCK), por DESTINO real ----------
  const segments = shellSegments(cmd);
  // Un `cd` previo cambia sobre qué repo corre el push, y por lo tanto cuál es
  // la "rama actual" que hay que mirar. Lo seguimos segmento a segmento.
  let effectiveCwd = cwd;
  for (const seg of segments) {
    const cdm = seg.match(/(?:^|\s)cd\s+(?:-{1,2}\S+\s+)*(?:"([^"]*)"|'([^']*)'|(\S+))/);
    if (cdm) {
      const target = cdm[1] !== undefined ? cdm[1] : cdm[2] !== undefined ? cdm[2] : cdm[3];
      if (!target || /\$\(|`|\$\{|\$[A-Za-z_]/.test(target)) {
        effectiveCwd = null; // destino del cd no verificable
      } else if (effectiveCwd !== null) {
        effectiveCwd = path.resolve(effectiveCwd, target);
      }
    }
    // Prefiltro barato sobre el texto NORMALIZADO (si no, `git p\ush` se saltea
    // sin analizar). Quién es realmente un push lo decide analyzePushSegment.
    if (!PUSH_VERB.test(normalizeWords(seg)) && !/\bgit\b/.test(seg)) continue;
    let res;
    try {
      res = analyzePushSegment(seg, effectiveCwd, cmd);
    } catch (_) {
      // Si el parseo explota, fallar CERRADO.
      res = SACRED_WORD.test(normalizeWords(cmd))
        ? { verdict: 'block', reason: 'no se pudo parsear el push y menciona la rama sagrada. Bloqueado por precaución.' }
        : { verdict: 'ask', reason: 'no se pudo parsear el push. Confirmá el destino.' };
    }
    if (res.verdict === 'block') block(res.reason);
    if (res.verdict === 'ask') ask(res.reason);
  }

  // merge que fusiona hacia la rama sagrada
  const isMerge = /\bgit\s+merge\b/.test(c);
  if (isMerge && SACRED_WORD.test(normalizeWords(c))) {
    ask('git merge que menciona la rama de landing. Confirmá que NO estás fusionando hacia ella.');
  }
  // moverse a la rama sagrada: defensivo, para que no se haga merge/commit silencioso ahí
  if (/\bgit\s+(checkout|switch)\s+(-\S+\s+)*(main|master)\b/.test(c)) {
    ask('te estás moviendo a la rama de landing. Confirmá (riesgo: merge/commit accidental ahí).');
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
