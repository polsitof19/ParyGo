import { SITE } from './site';

// Contacto por CORREO (Paul, 2026-09-23: fuera el WhatsApp de soporte). Cada
// botón abre un correo a SITE.email con el asunto ya escrito.
const base = `mailto:${SITE.email}`;

const enc = (text: string) => encodeURIComponent(text);

export const CTA = {
  hero: `${base}?subject=${enc('Quiero conocer ParyGo')}`,
  pack1: `${base}?subject=${enc('Quiero contratar 1 evento (S/200)')}`,
  pack3: `${base}?subject=${enc('Quiero contratar el Pack 3 (S/540)')}`,
  pack5: `${base}?subject=${enc('Quiero contratar el Pack 5 (S/850)')}`,
  pack10: `${base}?subject=${enc('Quiero contratar el Pack 10 (S/1,500)')}`,
  final: `${base}?subject=${enc('Quiero conversar sobre mi próximo evento')}`,
  // "Pedir acceso" de organizadores → form de solicitud (Grupo C) en el app host.
  requestAccess: 'https://app.parygo.com/organizadores',
} as const;

export type CTAKey = keyof typeof CTA;
