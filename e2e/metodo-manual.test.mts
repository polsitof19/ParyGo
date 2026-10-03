// lib/metodoManual.ts (sin red).   cd apps/web && npx tsx ../../e2e/metodo-manual.test.mts
const { validarCuenta, medioSirve, PAISES, paisDe } = await import('@/lib/metodoManual');

let ok = 0, mal = 0;
const check = (n: string, c: boolean, d = '') => { c ? ok++ : mal++; console.log(`${c ? '✔' : '✘'} ${n}${d ? ' · ' + d : ''}`); };
const v = (m: Parameters<typeof validarCuenta>[0], c: string, t = '') => validarCuenta(m, c, t);
const cuenta = (r: ReturnType<typeof validarCuenta>) => (r.ok ? r.cuenta : `✘ ${r.es}`);

check('yape +51 999-888-777 → 999888777', cuenta(v('yape', '+51 999-888-777')) === '999888777');
check('yape 12345 → rechazado', !v('yape', '12345').ok);
check('nequi +57 300 123 4567 → 3001234567', cuenta(v('nequi', '+57 300 123 4567')) === '3001234567');
check('nequi 9 dígitos → rechazado', !v('nequi', '300123456').ok);
check('bizum +34 612 345 678 → 612345678', cuenta(v('bizum', '+34 612 345 678')) === '612345678');
check('bizum fijo 912345678 → rechazado', !v('bizum', '912345678').ok);
check('zelle correo', cuenta(v('zelle', 'Ana@Mail.com ')) === 'ana@mail.com');
check('zelle (305) 555-1234 → 3055551234', cuenta(v('zelle', '(305) 555-1234')) === '3055551234');
check('zelle basura → rechazado', !v('zelle', 'ana').ok);
const trc = 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE';
check('usdt TRC20 válida', v('usdt', trc, 'trc20').ok && (v('usdt', trc, 'trc20') as { titular: string }).titular === 'TRC20');
check('usdt TRC20 con dirección 0x → rechazado', !v('usdt', '0x' + 'a'.repeat(40), 'TRC20').ok);
check('usdt ERC20 0x válida', v('usdt', '0x' + 'A1'.repeat(20), 'ERC20').ok);
check('usdt sin red → rechazado', !v('usdt', trc, '').ok);
check('transferencia corta → rechazado', !v('transferencia', 'BCP').ok);
check('transferencia banco + CLABE', v('transferencia', 'BBVA · CLABE 012180001234567891').ok);
check('cuenta vacía vale (sin configurar)', v('nequi', '  ').ok);
check('medioSirve yape/PEN sí, yape/COP no, transferencia/EUR sí',
  medioSirve('yape', 'PEN') && !medioSirve('yape', 'COP') && medioSirve('transferencia', 'EUR') && !medioSirve('zelle', 'EUR'));
check('cada país ofrece solo medios que sirven para su moneda', PAISES.every((p) => p.medios.every((m) => medioSirve(m, p.moneda))));
check('paisDe(PEN, Lima) = Perú; desconocido → Perú', paisDe('PEN', 'America/Lima').id === 'PE' && paisDe('XXX', 'y').id === 'PE');
check('paisDe(USD, New_York) = EE. UU.; (USD, Guayaquil) = Ecuador', paisDe('USD', 'America/New_York').id === 'US' && paisDe('USD', 'America/Guayaquil').id === 'EC');

console.log(mal ? `✘ ${mal} fallas, ${ok} OK` : `✔ ${ok}/${ok}`);
process.exit(mal ? 1 : 0);
