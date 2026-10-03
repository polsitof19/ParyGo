// lib/moneda.ts (sin red).   cd apps/web && npx tsx ../../e2e/moneda.test.mts
const { formatMoney, aCentavos, simbolo, monedaDe, centavosValidos } = await import('@/lib/moneda');
const { formatPEN } = await import('@/lib/utils');

let ok = 0, mal = 0;
const check = (n: string, c: boolean, d = '') => { c ? ok++ : mal++; console.log(`${c ? '✔' : '✘'} ${n}${d ? ' · ' + d : ''}`); };
const tira = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

for (const c of [0, 4000, 4050, 123456, 99]) check(`PEN ${c} idéntico a formatPEN`, formatMoney(c, 'PEN') === formatPEN(c), formatMoney(c, 'PEN'));
check('COP sin decimales y con miles', /^\$\s?50\.000$/.test(formatMoney(5_000_000, 'COP').replace(/ /g, ' ')), formatMoney(5_000_000, 'COP'));
check('CLP sin decimales', !/[,.]\d{2}$/.test(formatMoney(1_500_000, 'CLP')), formatMoney(1_500_000, 'CLP'));
check('EUR', formatMoney(2550, 'EUR').includes('€') && formatMoney(2550, 'EUR').includes('25,50'), formatMoney(2550, 'EUR'));
check('USD', formatMoney(1999, 'USD') === '$19.99', formatMoney(1999, 'USD'));
check('símbolo PEN = S/', simbolo('PEN') === 'S/', simbolo('PEN'));
check('monedaDe raro → PEN', monedaDe('XXX') === 'PEN' && monedaDe(null) === 'PEN' && monedaDe('COP') === 'COP');

check('PEN "40.50" → 4050', aCentavos('40.50', 'PEN') === 4050);
check('PEN "1,000" tira', tira(() => aCentavos('1,000', 'PEN')));
check('COP "50.000" → 5.000.000 (miles, no 50)', aCentavos('50.000', 'COP') === 5_000_000);
check('COP "50000" y "50,000" iguales', aCentavos('50000', 'COP') === 5_000_000 && aCentavos('50,000', 'COP') === 5_000_000);
check('COP "50.5" tira', tira(() => aCentavos('50.5', 'COP')));
check('COP 0.5 (número) tira', tira(() => aCentavos(0.5, 'COP')));
check('CLP "1.500" → 150000', aCentavos('1.500', 'CLP') === 150_000);
check('negativo / vacío tiran', tira(() => aCentavos('-1', 'PEN')) && tira(() => aCentavos('abc', 'USD')));
check('centavosValidos: entero; COP/CLP múltiplo de 100', centavosValidos(4050, 'PEN') && centavosValidos(5_000_000, 'COP') && !centavosValidos(5_000_050, 'COP') && !centavosValidos(10.5, 'USD') && !centavosValidos(-100, 'PEN') && !centavosValidos('100', 'PEN'));

console.log(mal ? `✘ ${mal} fallas, ${ok} OK` : `✔ ${ok}/${ok}`);
process.exit(mal ? 1 : 0);
