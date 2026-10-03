'use strict';
/**
 * Casos funcionales de guard-sacred-rules.js.
 *
 * Veredictos posibles: 'BLOCK' (exit 2), 'ASK' (exit 0 + permissionDecision ask)
 * y 'PASS' (exit 0 sin JSON).
 *
 * `P` es el verbo de push armado por concatenación a propósito: así este archivo
 * no contiene la cadena literal, y editarlo desde una sesión de Claude Code no
 * dispara el propio hook que estamos testeando.
 */

const P = 'git' + ' push';

/**
 * @param {string} ON_WORK  repo de prueba parado en refactor/monorepo
 * @param {string} ON_MAIN  repo de prueba parado en la rama congelada
 */
function functionalCases(ON_WORK, ON_MAIN) {
  return [
    // ---- los dos casos que motivaron el fix ----
    ['el falso positivo original: la palabra viene del mensaje de commit',
      'git commit -m "docs: la rama main quedó congelada" && ' + P + ' -u origin refactor/monorepo', ON_WORK, 'PASS'],
    ['push directo a la rama congelada', P + ' origin main', ON_WORK, 'BLOCK'],

    // ---- BLOQUEAR: el destino real es la rama sagrada ----
    ['destino master', P + ' origin master', ON_WORK, 'BLOCK'],
    ['refspec HEAD:main', P + ' origin HEAD:main', ON_WORK, 'BLOCK'],
    ['refspec rama:main', P + ' origin refactor/monorepo:main', ON_WORK, 'BLOCK'],
    ['force con +main', P + ' origin +main', ON_WORK, 'BLOCK'],
    ['-f a main', P + ' -f origin main', ON_WORK, 'BLOCK'],
    ['borrado :main', P + ' origin :main', ON_WORK, 'BLOCK'],
    ['--delete origin main', P + ' --delete origin main', ON_WORK, 'BLOCK'],
    ['--all', P + ' --all', ON_WORK, 'BLOCK'],
    ['--mirror', P + ' --mirror', ON_WORK, 'BLOCK'],
    ['refs/heads/main explícito', P + ' origin HEAD:refs/heads/main', ON_WORK, 'BLOCK'],
    ['remoto distinto de origin', P + ' upstream main', ON_WORK, 'BLOCK'],
    ['refspecs múltiples', P + ' origin refactor/monorepo main', ON_WORK, 'BLOCK'],
    ['destino entrecomillado', P + " origin 'main'", ON_WORK, 'BLOCK'],
    ['--repo=origin main', P + ' --repo=origin main', ON_WORK, 'BLOCK'],
    ['-u a main', P + ' -u origin main', ON_WORK, 'BLOCK'],
    ['-o valor + destino main', P + ' -o ci.skip origin main', ON_WORK, 'BLOCK'],
    ['MAIN en mayúsculas', P + ' origin MAIN', ON_WORK, 'BLOCK'],

    // ---- BLOQUEAR: parado en la rama congelada, sin refspec.
    //      Acá la palabra no aparece en NINGUNA parte del comando: es el agujero
    //      que la versión por-palabra no podía ver. ----
    ['sin refspec parado en la rama congelada', P, ON_MAIN, 'BLOCK'],
    ['solo remoto parado en la rama congelada', P + ' origin', ON_MAIN, 'BLOCK'],
    ['HEAD parado en la rama congelada', P + ' origin HEAD', ON_MAIN, 'BLOCK'],

    // ---- PERMITIR: destino legítimo ----
    ['push simple a la rama de trabajo', P + ' -u origin refactor/monorepo', ON_WORK, 'PASS'],
    ['la palabra en un echo encadenado', P + ' origin refactor/monorepo && echo "viene de main"', ON_WORK, 'PASS'],
    ['rama que empieza con main-', P + ' origin main-fix', ON_WORK, 'PASS'],
    ['rama feat/main-menu', P + ' origin feat/main-menu', ON_WORK, 'PASS'],
    ['HEAD a la rama de trabajo', P + ' origin HEAD:refactor/monorepo', ON_WORK, 'PASS'],
    ['main como ORIGEN, no como destino', P + ' origin main:refactor/monorepo', ON_WORK, 'PASS'],
    ['sin refspec parado en la rama de trabajo', P, ON_WORK, 'PASS'],
    ['solo remoto parado en la rama de trabajo', P + ' origin', ON_WORK, 'PASS'],
    ['no es un push: git log', 'git log --oneline origin/main', ON_WORK, 'PASS'],
    ['no es un push: un archivo main.js', 'cat src/main.js', ON_WORK, 'PASS'],
    ['heredoc con la palabra en el cuerpo',
      'git commit -F - <<\'EOF\'\ndocs: main congelada, no es fuente de verdad\nEOF\n' + P + ' -u origin refactor/monorepo', ON_WORK, 'PASS'],

    // ---- falsos positivos que NO hay que reintroducir por la puerta de atrás ----
    ['git commit --all no es un push --all', 'git commit --all -m "wip" && ' + P + ' -u origin refactor/monorepo', ON_WORK, 'PASS'],
    ['prosa que dice "pushear a main" dentro del heredoc',
      'git commit -F - <<\'EOF\'\ndocs: aclara que no hay que pushear a main nunca\nEOF\n' + P + ' -u origin refactor/monorepo', ON_WORK, 'PASS'],
    ['commit -F archivo + push legítimo', 'git commit -F /tmp/msg.txt && ' + P + ' -u origin refactor/monorepo', ON_WORK, 'PASS'],
    ['git log de main sin push involucrado', 'git log origin/main --oneline', ON_WORK, 'PASS'],
    ['git commit --amend normal', 'git commit --amend --no-edit', ON_WORK, 'PASS'],

    // ---- redirecciones: rutinarias, no vuelven indescifrable el destino ----
    ['push con 2>&1 y pipe', P + ' -u origin refactor/monorepo 2>&1 | tail -5', ON_WORK, 'PASS'],
    ['push con 2>&1 y la palabra en el commit encadenado',
      'git commit -m "habla de main y de pushear" && ' + P + ' -u origin refactor/monorepo 2>&1', ON_WORK, 'PASS'],
    ['push con redirección a archivo', P + ' -u origin refactor/monorepo > /tmp/out.log', ON_WORK, 'PASS'],
    ['la redirección NO tapa un destino prohibido', P + ' origin main 2>&1 | tail -5', ON_WORK, 'BLOCK'],
    ['redirección + push sin refspec en la rama congelada', P + ' 2>&1', ON_MAIN, 'BLOCK'],

    // ---- otro repo: -C y cd cambian cuál es "la rama actual" ----
    ['-C a un repo parado en la rama congelada', 'git -C ' + ON_MAIN + ' push', ON_WORK, 'BLOCK'],
    ['-C a un repo parado en la rama de trabajo', 'git -C ' + ON_WORK + ' push', ON_MAIN, 'PASS'],
    ['cd a un repo parado en la rama congelada', 'cd ' + ON_MAIN + ' && ' + P, ON_WORK, 'BLOCK'],
    ['cd a un repo parado en la rama de trabajo', 'cd ' + ON_WORK + ' && ' + P, ON_MAIN, 'PASS'],
    ['cd con variable: destino no verificable', 'cd $DIR && ' + P, ON_WORK, 'ASK'],

    // ---- PREGUNTAR: destino no verificable sin ejecutar ----
    ['variable como destino', P + ' origin $BRANCH', ON_WORK, 'ASK'],
    ['sustitución como destino', P + ' origin "${TARGET}"', ON_WORK, 'ASK'],

    // ---- regla 1b: merge por destino real.
    //      `git merge <x>` fusiona x HACIA la rama actual: el argumento es el
    //      ORIGEN y la rama actual es el DESTINO. Nunca bloquea, como mucho pregunta. ----
    ['merge estando parado en la rama congelada (escribe en ella)', 'git merge refactor/monorepo', ON_MAIN, 'ASK'],
    ['merge sin argumentos parado en la rama congelada', 'git merge --no-ff otra-rama', ON_MAIN, 'ASK'],
    ['merge que trae la rama congelada como origen', 'git merge main', ON_WORK, 'ASK'],
    ['merge que trae origin/main como origen', 'git merge origin/main', ON_WORK, 'ASK'],
    ['merge entre dos ramas normales desde la de trabajo', 'git merge feat/checkout-redesign', ON_WORK, 'PASS'],
    ['merge de una rama con main en el nombre', 'git merge feat/main-menu', ON_WORK, 'PASS'],
    ['el falso positivo viejo: la palabra viene del mensaje de commit',
      'git commit -m "docs: main quedó congelada" && git merge feat/checkout-redesign', ON_WORK, 'PASS'],
    ['merge -C a un repo parado en la rama congelada', 'git -C ' + ON_MAIN + ' merge otra-rama', ON_WORK, 'ASK'],
    ['merge no verificable que menciona la rama congelada', 'git merge "$RAMA" # viene de main', ON_WORK, 'ASK'],
    ['merge no verificable sin indicio de la rama congelada', 'git merge "$RAMA"', ON_WORK, 'PASS'],

    // ---- regla 2 (DDL sobre la venta en vivo): no debe haber regresión ----
    ['DDL destructivo sobre almighty', 'psql -c "drop table almighty_scans"', ON_WORK, 'ASK'],
    ['truncate contra el ref de producción', 'psql mdxtpevisjiqpeklhxdv -c "truncate tickets"', ON_WORK, 'ASK'],
    ['DDL sobre una tabla inocua', 'psql -c "drop table demotest_tmp"', ON_WORK, 'PASS'],
    ['checkout a la rama congelada sigue preguntando', 'git checkout main', ON_WORK, 'ASK'],
  ];
}

module.exports = { functionalCases, P };
