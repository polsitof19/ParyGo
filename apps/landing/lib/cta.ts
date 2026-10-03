// "Comenzar" y "Elegir" van al ALTA AUTOSERVICIO (app.parygo.com/empezar):
// el organizador elige su paquete, crea su marca y paga ahí mismo (y la prueba
// gratis de 1 evento, ?pack=prueba, desde 2026-10-01)
// (soles con Mercado Pago, dólares con PayPal). El link lleva el idioma de la
// landing (?lang=en) y, desde precios, el pack y la MONEDA que vio, para que
// pague exactamente lo que se le mostró.
const EMPEZAR = 'https://app.parygo.com/empezar';

export function empezar(lang: 'es' | 'en', extra?: { pack?: number | 'prueba'; moneda?: 'PEN' | 'USD'; tipo?: 'marca' | 'privado' }): string {
  const q = new URLSearchParams();
  // Evento privado (0075): entra directo a su alta, sin la pregunta.
  if (extra?.tipo) q.set('tipo', extra.tipo);
  if (extra?.pack) q.set('pack', String(extra.pack));
  if (extra?.moneda) q.set('moneda', extra.moneda);
  if (lang === 'en') q.set('lang', 'en');
  const s = q.toString();
  return s ? `${EMPEZAR}?${s}` : EMPEZAR;
}
