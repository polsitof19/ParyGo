import { SITE } from './site';

// "Empezar" y "Elegir" van al ALTA AUTOSERVICIO (app.parygo.com/empezar,
// 2026-09-25): el organizador elige pack o prueba gratis, crea su marca y paga
// con Mercado Pago ahí mismo. "Elegir" preselecciona el pack. Solo "final"
// sigue siendo un correo (es el link "escríbenos").
const base = `mailto:${SITE.email}`;
const empezar = 'https://app.parygo.com/empezar';

const enc = (text: string) => encodeURIComponent(text);

export const CTA = {
  hero: empezar,
  pack1: `${empezar}?pack=1`,
  pack3: `${empezar}?pack=3`,
  pack5: `${empezar}?pack=5`,
  pack10: `${empezar}?pack=10`,
  final: `${base}?subject=${enc('Quiero conversar sobre mi próximo evento')}`,
  requestAccess: empezar,
} as const;

export type CTAKey = keyof typeof CTA;
