// Idioma del panel del organizador (0073): lo decide la MARCA (brands.idioma),
// no el navegador. Español por defecto; el alta en inglés crea la marca en
// inglés y se cambia desde Mi marca.
//
// Uso: const { t, loc } = …;  t('Eventos', 'Events')  ·  fecha.toLocaleString(loc, …)
// El texto en español queda al lado del inglés a propósito: es la fuente y el
// que edita uno ve el otro.
export type Idioma = 'es' | 'en';

export const esIdioma = (v: unknown): v is Idioma => v === 'es' || v === 'en';

export type Textos = { l: Idioma; t: (es: string, en: string) => string; loc: string };

export function textos(l: Idioma): Textos {
  return { l, t: (es, en) => (l === 'en' ? en : es), loc: l === 'en' ? 'en-US' : 'es-PE' };
}
